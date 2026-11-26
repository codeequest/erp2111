import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Paginated,
  PurchaseOrderDetail,
  PurchaseOrderListItem,
  PurchaseOrderStatus,
} from '@erp/shared';
import { audit } from '../../common/audit';
import { nextDocumentNumber } from '../../common/document-number';
import { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { toAuditJson } from '../inventory/prisma-errors';
import {
  CreatePurchaseOrderDto,
  ListPurchaseOrdersQueryDto,
  PurchaseOrderLineDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import {
  MONEY_DECIMALS,
  canCancel,
  canConfirm,
  canEdit,
  lineAmounts,
  orderTotals,
  toDateString,
  type LineAmounts,
} from './purchase-order-rules';

type Tx = Prisma.TransactionClient;

const LIST_INCLUDE = {
  supplier: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.PurchaseOrderInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  createdBy: { select: { id: true, fullName: true } },
  lines: {
    orderBy: { lineNo: 'asc' },
    include: {
      product: {
        select: { id: true, sku: true, name: true, baseUnit: { select: { code: true } } },
      },
      unit: { select: { id: true, code: true, name: true } },
    },
  },
  receipts: {
    orderBy: { receivedAt: 'asc' },
    select: { id: true, number: true, receivedAt: true },
  },
} satisfies Prisma.PurchaseOrderInclude;

type ListRow = Prisma.PurchaseOrderGetPayload<{ include: typeof LIST_INCLUDE }>;
type DetailRow = Prisma.PurchaseOrderGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/** A validated line, ready to be stored. */
interface PreparedLine {
  data: Omit<Prisma.PurchaseOrderLineCreateManyInput, 'purchaseOrderId'>;
  amounts: LineAmounts;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPurchaseOrdersQueryDto): Promise<Paginated<PurchaseOrderListItem>> {
    const where = orderWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ orderDate: 'desc' }, { number: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { items: rows.map(toListItem), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<PurchaseOrderDetail> {
    const row = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw new NotFoundException('Purchase order not found');
    return toDetail(row);
  }

  /** Creates a draft. The PO number is taken now, inside the transaction (gap-free). */
  async create(dto: CreatePurchaseOrderDto, user: RequestUser): Promise<PurchaseOrderDetail> {
    const orderDate = toDbDate(dto.orderDate ?? toDateString(new Date()));
    const expectedDate = dto.expectedDate ? toDbDate(dto.expectedDate) : null;
    checkDates(orderDate, expectedDate);

    const id = await this.prisma.$transaction(async (tx) => {
      const supplier = await requireActiveSupplier(tx, dto.supplierId);
      await requireActiveWarehouse(tx, dto.warehouseId);
      const lines = await prepareLines(tx, dto.lines ?? [], supplier.taxRate);
      const totals = orderTotals(lines.map((l) => l.amounts));

      const order = await tx.purchaseOrder.create({
        data: {
          number: await nextDocumentNumber(tx, 'PURCHASE_ORDER', orderDate),
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId,
          orderDate,
          expectedDate,
          notes: dto.notes ?? null,
          ...totals,
          createdById: user.id,
          lines: { createMany: { data: lines.map((l) => l.data) } },
        },
        include: { lines: true },
      });
      await audit(tx, user, 'create', 'PurchaseOrder', order.id, null, auditJson(order));
      return order.id;
    });
    return this.get(id);
  }

  /** Edits a draft. When `lines` is sent it replaces every line. */
  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    user: RequestUser,
  ): Promise<PurchaseOrderDetail> {
    await this.prisma.$transaction(async (tx) => {
      const before = await lockOrder(tx, id);
      if (!canEdit(before.status)) {
        throw new ConflictException(
          `${before.number} is ${label(before.status)}: only draft orders can be edited`,
        );
      }

      const orderDate = dto.orderDate ? toDbDate(dto.orderDate) : before.orderDate;
      const expectedDate =
        dto.expectedDate === undefined
          ? before.expectedDate
          : dto.expectedDate
            ? toDbDate(dto.expectedDate)
            : null;
      checkDates(orderDate, expectedDate);
      const supplierChanged = Boolean(dto.supplierId && dto.supplierId !== before.supplierId);
      const supplierRate = supplierChanged
        ? (await requireActiveSupplier(tx, dto.supplierId!)).taxRate
        : await supplierTaxRate(tx, before.supplierId);
      if (dto.warehouseId && dto.warehouseId !== before.warehouseId) {
        await requireActiveWarehouse(tx, dto.warehouseId);
      }

      // A new supplier may apply another VAT rate: recompute the lines even when not sent.
      const lineInput =
        dto.lines ??
        (supplierChanged
          ? before.lines
              .sort((a, b) => a.lineNo - b.lineNo)
              .map((l) => ({
                productId: l.productId,
                unitId: l.unitId,
                quantity: l.quantity.toString(),
                unitPrice: l.unitPrice.toString(),
                discountPct: l.discountPct.toString(),
              }))
          : undefined);
      let totals = {};
      if (lineInput) {
        const lines = await prepareLines(tx, lineInput, supplierRate);
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderLine.createMany({
          data: lines.map((l) => ({ ...l.data, purchaseOrderId: id })),
        });
        totals = orderTotals(lines.map((l) => l.amounts));
      }

      const after = await tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(dto.supplierId && { supplierId: dto.supplierId }),
          ...(dto.warehouseId && { warehouseId: dto.warehouseId }),
          orderDate,
          expectedDate,
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...totals,
        },
        include: { lines: true },
      });
      await audit(tx, user, 'update', 'PurchaseOrder', id, auditJson(before), auditJson(after));
    });
    return this.get(id);
  }

  /** DRAFT → CONFIRMED. The order is then sent to the supplier and can be received. */
  async confirm(id: string, user: RequestUser): Promise<PurchaseOrderDetail> {
    await this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, id);
      if (!canConfirm(order.status)) {
        throw new ConflictException(
          `${order.number} is ${label(order.status)}: it cannot be confirmed`,
        );
      }
      if (order.lines.length === 0) {
        throw new BadRequestException('Add at least one line before confirming the order');
      }
      await requireActiveSupplier(tx, order.supplierId);
      await requireActiveWarehouse(tx, order.warehouseId);
      const inactive = await tx.product.findMany({
        where: { id: { in: order.lines.map((l) => l.productId) }, isActive: false },
        select: { sku: true },
      });
      if (inactive.length) {
        throw new BadRequestException(
          `Inactive product(s) on the order: ${inactive.map((p) => p.sku).join(', ')}`,
        );
      }

      await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });
      await audit(
        tx,
        user,
        'confirm',
        'PurchaseOrder',
        id,
        { status: order.status },
        { status: 'CONFIRMED' },
      );
    });
    return this.get(id);
  }

  /** DRAFT or CONFIRMED (nothing received) → CANCELLED. Documents are never deleted. */
  async cancel(id: string, user: RequestUser): Promise<PurchaseOrderDetail> {
    await this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, id);
      const received = order.lines.some((l) => l.receivedQty.gt(0));
      if (!canCancel(order.status, received)) {
        throw new ConflictException(
          received
            ? `Goods were already received on ${order.number}: it can no longer be cancelled`
            : `${order.number} is ${label(order.status)}: it cannot be cancelled`,
        );
      }
      await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
      await audit(
        tx,
        user,
        'cancel',
        'PurchaseOrder',
        id,
        { status: order.status },
        { status: 'CANCELLED' },
      );
    });
    return this.get(id);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** The list filters (status, supplier, search), shared by the list and the Excel export. */
export function orderWhere(
  query: Pick<ListPurchaseOrdersQueryDto, 'status' | 'supplierId' | 'search'>,
): Prisma.PurchaseOrderWhereInput {
  const status: Prisma.PurchaseOrderWhereInput =
    query.status === 'all'
      ? {}
      : query.status === 'open'
        ? { status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] } }
        : { status: query.status };
  return {
    ...status,
    ...(query.supplierId && { supplierId: query.supplierId }),
    ...(query.search && {
      OR: [
        { number: { contains: query.search, mode: 'insensitive' } },
        { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
        { supplier: { code: { contains: query.search, mode: 'insensitive' } } },
      ],
    }),
  };
}

/** Locks the order row until commit, so an edit and a confirm can never interleave. */
async function lockOrder(tx: Tx, id: string) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM purchase_orders WHERE id = ${id}::uuid FOR UPDATE`;
  if (!locked.length) throw new NotFoundException('Purchase order not found');
  return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
}

/** Checks the supplier can be ordered from; returns the VAT rate it applies (or null). */
async function requireActiveSupplier(tx: Tx, id: string) {
  const s = await tx.supplier.findUnique({
    where: { id },
    select: { code: true, isActive: true, taxRate: { select: { rate: true } } },
  });
  if (!s) throw new BadRequestException('Unknown supplier');
  if (!s.isActive) throw new BadRequestException(`Supplier ${s.code} is inactive`);
  return { taxRate: s.taxRate?.rate ?? null };
}

async function supplierTaxRate(tx: Tx, id: string): Promise<Prisma.Decimal | null> {
  const s = await tx.supplier.findUnique({
    where: { id },
    select: { taxRate: { select: { rate: true } } },
  });
  return s?.taxRate?.rate ?? null;
}

async function requireActiveWarehouse(tx: Tx, id: string) {
  const w = await tx.warehouse.findUnique({
    where: { id },
    select: { code: true, isActive: true },
  });
  if (!w) throw new BadRequestException('Unknown warehouse');
  if (!w.isActive) throw new BadRequestException(`Warehouse ${w.code} is inactive`);
}

/**
 * Checks every line and computes its amounts. The unit must be the product's base
 * unit (factor 1) or one of its pack units allowed for purchase (factor copied).
 * The tax % is copied at order time: the supplier's VAT rate when it has one (e.g. an
 * exempt supplier), otherwise the product's own rate.
 */
async function prepareLines(
  tx: Tx,
  input: PurchaseOrderLineDto[],
  supplierRate: Prisma.Decimal | null,
): Promise<PreparedLine[]> {
  if (!input.length) return [];
  const products = await tx.product.findMany({
    where: { id: { in: [...new Set(input.map((l) => l.productId))] } },
    select: {
      id: true,
      sku: true,
      isActive: true,
      baseUnitId: true,
      taxRate: { select: { rate: true } },
      units: { select: { unitId: true, factor: true, forPurchase: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const errors: string[] = [];
  const prepared: PreparedLine[] = [];
  input.forEach((line, i) => {
    const n = i + 1;
    const product = byId.get(line.productId);
    if (!product) return void errors.push(`Line ${n}: unknown product`);
    if (!product.isActive) return void errors.push(`Line ${n}: ${product.sku} is inactive`);

    let factor: Prisma.Decimal;
    if (line.unitId === product.baseUnitId) {
      factor = new Prisma.Decimal(1);
    } else {
      const pack = product.units.find((u) => u.unitId === line.unitId);
      if (!pack || !pack.forPurchase) {
        return void errors.push(`Line ${n}: ${product.sku} cannot be bought in this unit`);
      }
      factor = pack.factor;
    }
    const quantity = new Prisma.Decimal(line.quantity);
    if (quantity.lte(0)) return void errors.push(`Line ${n}: the quantity must be more than 0`);

    const discountPct = new Prisma.Decimal(line.discountPct ?? 0);
    const taxRate = supplierRate ?? product.taxRate?.rate ?? new Prisma.Decimal(0);
    const amounts = lineAmounts(quantity, line.unitPrice, discountPct, taxRate);
    prepared.push({
      amounts,
      data: {
        lineNo: n,
        productId: product.id,
        unitId: line.unitId,
        unitFactor: factor,
        quantity,
        unitPrice: new Prisma.Decimal(line.unitPrice),
        discountPct,
        taxRate,
        lineTotal: amounts.net,
      },
    });
  });
  if (errors.length) throw new BadRequestException(errors);
  return prepared;
}

/** "2026-11-26" (or a full ISO string) → midnight UTC, as stored in a @db.Date column. */
function toDbDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function checkDates(orderDate: Date, expectedDate: Date | null) {
  if (expectedDate && expectedDate < orderDate) {
    throw new BadRequestException('The expected date cannot be before the order date');
  }
}

const label = (s: PurchaseOrderStatus) => s.toLowerCase().replace('_', ' ');

const auditJson = (v: unknown) => toAuditJson(v) as Prisma.InputJsonObject;

function toListItem(o: ListRow): PurchaseOrderListItem {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    supplier: o.supplier,
    warehouse: o.warehouse,
    orderDate: toDateString(o.orderDate),
    expectedDate: o.expectedDate ? toDateString(o.expectedDate) : null,
    lineCount: o._count.lines,
    total: o.total.toFixed(MONEY_DECIMALS),
  };
}

function toDetail(o: DetailRow): PurchaseOrderDetail {
  return {
    ...toListItem(o),
    notes: o.notes,
    subtotal: o.subtotal.toFixed(MONEY_DECIMALS),
    discountTotal: o.discountTotal.toFixed(MONEY_DECIMALS),
    taxTotal: o.taxTotal.toFixed(MONEY_DECIMALS),
    confirmedAt: o.confirmedAt?.toISOString() ?? null,
    createdBy: o.createdBy,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    lines: o.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      product: {
        id: l.product.id,
        sku: l.product.sku,
        name: l.product.name,
        baseUnitCode: l.product.baseUnit.code,
      },
      unit: l.unit,
      unitFactor: l.unitFactor.toFixed(4),
      quantity: l.quantity.toFixed(4),
      unitPrice: l.unitPrice.toFixed(4),
      discountPct: l.discountPct.toFixed(2),
      taxRate: l.taxRate.toFixed(2),
      lineTotal: l.lineTotal.toFixed(MONEY_DECIMALS),
      receivedQty: l.receivedQty.toFixed(4),
    })),
    receipts: o.receipts.map((r) => ({
      id: r.id,
      number: r.number,
      receivedAt: r.receivedAt.toISOString(),
    })),
  };
}
