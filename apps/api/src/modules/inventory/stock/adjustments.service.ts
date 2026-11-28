import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdjustmentDetail, AdjustmentListItem, Paginated } from '@erp/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestUser } from '../../../common/types/request-user';
import { audit } from '../../../common/audit';
import { nextDocumentNumber } from '../../../common/numbering';
import { AdjustmentDto, ListStockDocumentsQueryDto } from '../dto/stock-document.dto';
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

const listInclude = {
  warehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: { fullName: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.StockAdjustmentInclude;

type ListRow = Prisma.StockAdjustmentGetPayload<{ include: typeof listInclude }>;

/**
 * Stock adjustments: draft -> posted (stock moves) or cancelled.
 * A posted adjustment never changes; a mistake is fixed with a new adjustment.
 */
@Injectable()
export class AdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: StockEngine,
  ) {}

  async list(q: ListStockDocumentsQueryDto): Promise<Paginated<AdjustmentListItem>> {
    const where: Prisma.StockAdjustmentWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.warehouseId && { warehouseId: q.warehouseId }),
      ...(q.search && { number: { contains: q.search, mode: 'insensitive' } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.stockAdjustment.findMany({
        where,
        include: listInclude,
        orderBy: { createdAt: 'desc' },
        ...pageOf(q.page, q.pageSize),
      }),
      this.prisma.stockAdjustment.count({ where }),
    ]);
    return { items: rows.map(toListItem), total, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string, user: RequestUser): Promise<AdjustmentDetail> {
    const doc = await this.prisma.stockAdjustment.findUnique({
      where: { id },
      include: {
        ...listInclude,
        lines: { include: { product: { select: productSelect } }, orderBy: { id: 'asc' } },
      },
    });
    if (!doc) throw new NotFoundException('Adjustment not found');

    const canSeeCost = user.permissions.has('inventory.cost.view');
    const onHand =
      doc.status === 'DRAFT'
        ? await onHandIn(this.prisma, doc.warehouseId, doc.lines.map((l) => l.productId))
        : null;
    return {
      ...toListItem(doc),
      lines: doc.lines.map((l) => ({
        id: l.id,
        product: toProduct(l.product),
        quantity: l.quantity.toString(),
        ...(canSeeCost && { unitCost: l.unitCost?.toString() ?? null }),
        notes: l.notes,
        ...(onHand && { onHand: onHand.get(l.productId) ?? '0' }),
      })),
    };
  }

  async create(dto: AdjustmentDto, user: RequestUser): Promise<AdjustmentDetail> {
    await this.check(dto, user);
    const id = await this.prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, 'STOCK_ADJUSTMENT');
      const doc = await tx.stockAdjustment.create({
        data: {
          number,
          warehouseId: dto.warehouseId,
          reason: dto.reason,
          notes: dto.notes ?? null,
          createdById: user.id,
          lines: { create: lineData(dto, new Map()) },
        },
      });
      await audit(tx, user, 'create', 'StockAdjustment', doc.id, null, snapshot(dto, number));
      return doc.id;
    });
    return this.get(id, user);
  }

  /** Replaces the warehouse, reason, notes and lines of a draft. */
  async update(id: string, dto: AdjustmentDto, user: RequestUser): Promise<AdjustmentDetail> {
    await this.check(dto, user);
    await this.prisma.$transaction(async (tx) => {
      assertDraft('StockAdjustment', await lockDocument(tx, 'StockAdjustment', id), 'changed');
      const before = await tx.stockAdjustment.findUniqueOrThrow({ where: { id }, include: { lines: true } });

      // Someone without inventory.cost.view cannot see costs, so keep the ones already entered.
      const keptCosts = user.permissions.has('inventory.cost.view')
        ? new Map<string, Prisma.Decimal | null>()
        : new Map(before.lines.map((l) => [l.productId, l.unitCost]));

      await tx.stockAdjustmentLine.deleteMany({ where: { adjustmentId: id } });
      await tx.stockAdjustment.update({
        where: { id },
        data: {
          warehouseId: dto.warehouseId,
          reason: dto.reason,
          notes: dto.notes ?? null,
          lines: { create: lineData(dto, keptCosts) },
        },
      });
      await audit(tx, user, 'update', 'StockAdjustment', id, docSnapshot(before), snapshot(dto, before.number));
    });
    return this.get(id, user);
  }

  /** Validates the draft: writes the stock moves. Refused if stock would go negative. */
  async post(id: string, user: RequestUser): Promise<AdjustmentDetail> {
    await this.prisma.$transaction(
      async (tx) => {
        assertDraft('StockAdjustment', await lockDocument(tx, 'StockAdjustment', id), 'validated');
        const doc = await tx.stockAdjustment.findUniqueOrThrow({ where: { id }, include: { lines: true } });
        await this.engine.post(
          tx,
          {
            sourceType: 'StockAdjustment',
            sourceId: doc.id,
            reference: doc.number,
            reason: doc.reason,
            lines: doc.lines.map((l) => ({
              productId: l.productId,
              warehouseId: doc.warehouseId,
              type: 'ADJUSTMENT' as const,
              quantity: l.quantity,
              unitCost: l.quantity.isPositive() ? l.unitCost : null,
              sourceLineId: l.id,
              reason: l.notes ? `${doc.reason} — ${l.notes}` : null,
            })),
          },
          user,
        );
        await tx.stockAdjustment.update({ where: { id }, data: { status: 'POSTED', postedAt: new Date() } });
        await audit(tx, user, 'post', 'StockAdjustment', id, { status: 'DRAFT' }, { status: 'POSTED' });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    return this.get(id, user);
  }

  async cancel(id: string, user: RequestUser): Promise<AdjustmentDetail> {
    await this.prisma.$transaction(async (tx) => {
      assertDraft('StockAdjustment', await lockDocument(tx, 'StockAdjustment', id), 'cancelled');
      await tx.stockAdjustment.update({ where: { id }, data: { status: 'CANCELLED' } });
      await audit(tx, user, 'cancel', 'StockAdjustment', id, { status: 'DRAFT' }, { status: 'CANCELLED' });
    });
    return this.get(id, user);
  }

  private async check(dto: AdjustmentDto, user: RequestUser) {
    await activeWarehouse(this.prisma, dto.warehouseId);
    await checkProducts(this.prisma, dto.lines.map((l) => l.productId));
    const canSetCost = user.permissions.has('inventory.cost.view');
    dto.lines.forEach((l, i) => {
      const q = D(l.quantity);
      if (q.isZero()) throw new BadRequestException(`Line ${i + 1}: quantity must not be zero`);
      if (l.unitCost !== undefined && l.unitCost !== null) {
        if (!canSetCost) throw new ForbiddenException('You need the inventory.cost.view permission to set costs');
        if (q.isNegative()) {
          throw new BadRequestException(`Line ${i + 1}: a cost is only allowed when adding stock`);
        }
      }
    });
  }
}

function lineData(dto: AdjustmentDto, keptCosts: Map<string, Prisma.Decimal | null>) {
  return dto.lines.map((l) => {
    const q = D(l.quantity);
    const given = l.unitCost !== undefined && l.unitCost !== null ? D(l.unitCost) : null;
    const cost = q.isPositive() ? (given ?? keptCosts.get(l.productId) ?? null) : null;
    return { productId: l.productId, quantity: q, unitCost: cost, notes: l.notes ?? null };
  });
}

function toListItem(d: ListRow): AdjustmentListItem {
  return {
    id: d.id,
    number: d.number,
    status: d.status,
    date: d.date.toISOString(),
    notes: d.notes,
    createdBy: d.createdBy.fullName,
    createdAt: d.createdAt.toISOString(),
    postedAt: d.postedAt?.toISOString() ?? null,
    warehouse: toWarehouse(d.warehouse),
    reason: d.reason,
    lineCount: d._count.lines,
  };
}

function snapshot(dto: AdjustmentDto, number: string): Prisma.InputJsonObject {
  return {
    number,
    warehouseId: dto.warehouseId,
    reason: dto.reason,
    lines: dto.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
  };
}

function docSnapshot(d: {
  number: string;
  warehouseId: string;
  reason: string;
  lines: { productId: string; quantity: Prisma.Decimal }[];
}): Prisma.InputJsonObject {
  return {
    number: d.number,
    warehouseId: d.warehouseId,
    reason: d.reason,
    lines: d.lines.map((l) => ({ productId: l.productId, quantity: l.quantity.toString() })),
  };
}
