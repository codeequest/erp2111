import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Paginated, TransferDetail, TransferListItem } from '@erp/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestUser } from '../../../common/types/request-user';
import { audit } from '../../../common/audit';
import { nextDocumentNumber } from '../../../common/numbering';
import { ListStockDocumentsQueryDto, TransferDto } from '../dto/stock-document.dto';
import { StockEngine } from './stock-engine.service';
import { D } from './stock-rules';
import {
  activeWarehouse,
  assertDraft,
  checkProducts,
  lockDocument,
  onHandIn,
  pageOf,
  productSelect,
  toProduct,
  toWarehouse,
} from './stock-documents.common';

const warehouseRef = { select: { id: true, code: true, name: true } } as const;
const listInclude = {
  fromWarehouse: warehouseRef,
  toWarehouse: warehouseRef,
  createdBy: { select: { fullName: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.StockTransferInclude;

type ListRow = Prisma.StockTransferGetPayload<{ include: typeof listInclude }>;

/**
 * Transfers between warehouses: draft -> posted (OUT + IN moves at average cost)
 * or cancelled. Posting is refused when the source warehouse lacks stock.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: StockEngine,
  ) {}

  async list(q: ListStockDocumentsQueryDto): Promise<Paginated<TransferListItem>> {
    const where: Prisma.StockTransferWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.warehouseId && {
        OR: [{ fromWarehouseId: q.warehouseId }, { toWarehouseId: q.warehouseId }],
      }),
      ...(q.search && { number: { contains: q.search, mode: 'insensitive' } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        include: listInclude,
        orderBy: { createdAt: 'desc' },
        ...pageOf(q.page, q.pageSize),
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);
    return { items: rows.map(toListItem), total, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string): Promise<TransferDetail> {
    const doc = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        ...listInclude,
        lines: { include: { product: { select: productSelect } }, orderBy: { id: 'asc' } },
      },
    });
    if (!doc) throw new NotFoundException('Transfer not found');
    const onHand =
      doc.status === 'DRAFT'
        ? await onHandIn(this.prisma, doc.fromWarehouseId, doc.lines.map((l) => l.productId))
        : null;
    return {
      ...toListItem(doc),
      lines: doc.lines.map((l) => ({
        id: l.id,
        product: toProduct(l.product),
        quantity: l.quantity.toString(),
        ...(onHand && { onHand: onHand.get(l.productId) ?? '0' }),
      })),
    };
  }

  async create(dto: TransferDto, user: RequestUser): Promise<TransferDetail> {
    await this.check(dto);
    const id = await this.prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, 'STOCK_TRANSFER');
      const doc = await tx.stockTransfer.create({
        data: {
          number,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          notes: dto.notes ?? null,
          createdById: user.id,
          lines: { create: lineData(dto) },
        },
      });
      await audit(tx, user, 'create', 'StockTransfer', doc.id, null, snapshot(dto, number));
      return doc.id;
    });
    return this.get(id);
  }

  async update(id: string, dto: TransferDto, user: RequestUser): Promise<TransferDetail> {
    await this.check(dto);
    await this.prisma.$transaction(async (tx) => {
      assertDraft('StockTransfer', await lockDocument(tx, 'StockTransfer', id), 'changed');
      const before = await tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      await tx.stockTransferLine.deleteMany({ where: { transferId: id } });
      await tx.stockTransfer.update({
        where: { id },
        data: {
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          notes: dto.notes ?? null,
          lines: { create: lineData(dto) },
        },
      });
      await audit(tx, user, 'update', 'StockTransfer', id, docSnapshot(before), snapshot(dto, before.number));
    });
    return this.get(id);
  }

  async post(id: string, user: RequestUser): Promise<TransferDetail> {
    await this.prisma.$transaction(
      async (tx) => {
        assertDraft('StockTransfer', await lockDocument(tx, 'StockTransfer', id), 'validated');
        const doc = await tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: { lines: true } });
        await this.engine.transfer(
          tx,
          {
            sourceType: 'StockTransfer',
            sourceId: doc.id,
            reference: doc.number,
            fromWarehouseId: doc.fromWarehouseId,
            toWarehouseId: doc.toWarehouseId,
            lines: doc.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, sourceLineId: l.id })),
          },
          user,
        );
        await tx.stockTransfer.update({ where: { id }, data: { status: 'POSTED', postedAt: new Date() } });
        await audit(tx, user, 'post', 'StockTransfer', id, { status: 'DRAFT' }, { status: 'POSTED' });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    return this.get(id);
  }

  async cancel(id: string, user: RequestUser): Promise<TransferDetail> {
    await this.prisma.$transaction(async (tx) => {
      assertDraft('StockTransfer', await lockDocument(tx, 'StockTransfer', id), 'cancelled');
      await tx.stockTransfer.update({ where: { id }, data: { status: 'CANCELLED' } });
      await audit(tx, user, 'cancel', 'StockTransfer', id, { status: 'DRAFT' }, { status: 'CANCELLED' });
    });
    return this.get(id);
  }

  private async check(dto: TransferDto) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Choose two different warehouses');
    }
    await activeWarehouse(this.prisma, dto.fromWarehouseId, 'Source warehouse');
    await activeWarehouse(this.prisma, dto.toWarehouseId, 'Destination warehouse');
    await checkProducts(this.prisma, dto.lines.map((l) => l.productId));
    dto.lines.forEach((l, i) => {
      if (!D(l.quantity).isPositive()) throw new BadRequestException(`Line ${i + 1}: quantity must be more than zero`);
    });
  }
}

function lineData(dto: TransferDto) {
  return dto.lines.map((l) => ({ productId: l.productId, quantity: D(l.quantity) }));
}

function toListItem(d: ListRow): TransferListItem {
  return {
    id: d.id,
    number: d.number,
    status: d.status,
    date: d.date.toISOString(),
    notes: d.notes,
    createdBy: d.createdBy.fullName,
    createdAt: d.createdAt.toISOString(),
    postedAt: d.postedAt?.toISOString() ?? null,
    fromWarehouse: toWarehouse(d.fromWarehouse),
    toWarehouse: toWarehouse(d.toWarehouse),
    lineCount: d._count.lines,
  };
}

function snapshot(dto: TransferDto, number: string): Prisma.InputJsonObject {
  return {
    number,
    fromWarehouseId: dto.fromWarehouseId,
    toWarehouseId: dto.toWarehouseId,
    lines: dto.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
  };
}

function docSnapshot(d: {
  number: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  lines: { productId: string; quantity: Prisma.Decimal }[];
}): Prisma.InputJsonObject {
  return {
    number: d.number,
    fromWarehouseId: d.fromWarehouseId,
    toWarehouseId: d.toWarehouseId,
    lines: d.lines.map((l) => ({ productId: l.productId, quantity: l.quantity.toString() })),
  };
}
