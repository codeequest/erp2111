import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  DeliveryListItem,
  DeliveryStatus,
  GoodsReceiptDetail,
  GoodsReceiptListItem,
  GoodsReceiptSummary,
  Paginated,
  ReceivingSettings,
} from '@erp/shared';
import { audit } from '../../common/audit';
import { nextDocumentNumber } from '../../common/document-number';
import { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { toAuditJson } from '../inventory/prisma-errors';
import { lockBalance, postMove } from '../inventory/stock-ledger';
import {
  CancelGoodsReceiptDto,
  CreateGoodsReceiptDto,
  ListDeliveriesQueryDto,
  ListGoodsReceiptsQueryDto,
  SetSupplierInvoiceDto,
  UpdateGoodsReceiptDto,
  UpdateReceivingSettingsDto,
} from './dto/goods-receipt.dto';
import { refreshLastPurchaseCost } from './last-purchase-cost';
import {
  MONEY_DECIMALS,
  averageCostAfterReversal,
  canReceive,
  receiptLineAmounts,
  receivableLimit,
  statusAfterCancelledReceipt,
  statusAfterReceipt,
  toDateString,
  weightedAverageCost,
} from './purchase-order-rules';

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const LIST_INCLUDE = {
  purchaseOrder: {
    select: {
      id: true,
      number: true,
      supplier: { select: { id: true, code: true, name: true } },
    },
  },
  warehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  lines: { select: { value: true, quantity: true, billedQty: true } },
} satisfies Prisma.GoodsReceiptInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  lines: {
    include: {
      product: {
        select: { id: true, sku: true, name: true, baseUnit: { select: { code: true } } },
      },
      purchaseOrderLine: {
        select: {
          lineNo: true,
          unitFactor: true,
          quantity: true,
          receivedQty: true,
          unit: { select: { id: true, code: true } },
        },
      },
      invoiceLines: {
        where: { invoice: { status: { not: 'CANCELLED' } } },
        select: { invoice: { select: { id: true, number: true, status: true } } },
      },
    },
  },
} satisfies Prisma.GoodsReceiptInclude;

type ListRow = Prisma.GoodsReceiptGetPayload<{ include: typeof LIST_INCLUDE }>;
type DetailRow = Prisma.GoodsReceiptGetPayload<{ include: typeof DETAIL_INCLUDE }>;

@Injectable()
export class GoodsReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListGoodsReceiptsQueryDto): Promise<Paginated<GoodsReceiptListItem>> {
    const where = receiptWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ receivedAt: 'desc' }, { number: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);
    return { items: rows.map(toListItem), total, page: query.page, pageSize: query.pageSize };
  }

  async settings(): Promise<ReceivingSettings> {
    const s = await this.prisma.companySettings.findUnique({
      where: { id: 1 },
      select: { receiptTolerancePct: true },
    });
    return { tolerancePct: (s?.receiptTolerancePct ?? D(0)).toFixed(2) };
  }

  async updateSettings(
    dto: UpdateReceivingSettingsDto,
    user: RequestUser,
  ): Promise<ReceivingSettings> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.companySettings.findUniqueOrThrow({
        where: { id: 1 },
        select: { receiptTolerancePct: true },
      });
      await tx.companySettings.update({
        where: { id: 1 },
        data: { receiptTolerancePct: D(dto.tolerancePct) },
      });
      await audit(
        tx,
        user,
        'update',
        'CompanySettings',
        '1',
        { receiptTolerancePct: before.receiptTolerancePct.toString() },
        { receiptTolerancePct: dto.tolerancePct },
      );
    });
    return this.settings();
  }

  /** Counters of the deliveries screen. */
  async summary(): Promise<GoodsReceiptSummary> {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const today = new Date(`${toDateString(now)}T00:00:00.000Z`);
    const [drafts, waiting, inProgress, deliveredThisMonth, late, monthReceipts, monthValue] =
      await Promise.all([
        this.prisma.goodsReceipt.count({ where: { status: 'DRAFT' } }),
        this.prisma.purchaseOrder.count({ where: { status: 'CONFIRMED' } }),
        this.prisma.purchaseOrder.count({ where: { status: 'PARTIALLY_RECEIVED' } }),
        // Fully received, with a delivery this month (so the last one is this month)
        this.prisma.purchaseOrder.count({
          where: {
            status: 'RECEIVED',
            receipts: { some: { status: 'POSTED', receivedAt: { gte: monthStart } } },
          },
        }),
        this.prisma.purchaseOrder.count({
          where: {
            status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] },
            expectedDate: { lt: today },
          },
        }),
        this.prisma.goodsReceipt.count({
          where: { status: 'POSTED', receivedAt: { gte: monthStart } },
        }),
        this.prisma.goodsReceiptLine.aggregate({
          where: { goodsReceipt: { status: 'POSTED', receivedAt: { gte: monthStart } } },
          _sum: { value: true },
        }),
      ]);
    return {
      drafts,
      waiting,
      inProgress,
      deliveredThisMonth,
      late,
      monthReceipts,
      monthValue: (monthValue._sum.value ?? D(0)).toFixed(MONEY_DECIMALS),
    };
  }

  /**
   * Delivery follow-up: confirmed orders with their delivery status (waiting,
   * in progress, delivered), expected date, delivery dates and receipts.
   */
  async deliveries(query: ListDeliveriesQueryDto): Promise<Paginated<DeliveryListItem>> {
    const where = deliveryWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: DELIVERY_INCLUDE,
        orderBy: deliveryOrderBy(query.status),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { items: rows.map(toDelivery), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<GoodsReceiptDetail> {
    const row = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw new NotFoundException('Goods receipt not found');
    // The invoice can be recorded on the receipt that completed a delivered order.
    const [order, last] = await Promise.all([
      this.prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: row.purchaseOrderId },
        select: { status: true },
      }),
      this.prisma.goodsReceipt.findFirst({
        where: { purchaseOrderId: row.purchaseOrderId, status: 'POSTED' },
        orderBy: [{ receivedAt: 'desc' }, { number: 'desc' }],
        select: { id: true },
      }),
    ]);
    const settings = await this.prisma.companySettings.findUnique({
      where: { id: 1 },
      select: { receiptTolerancePct: true },
    });
    return toDetail(
      row,
      row.status === 'POSTED' && order.status === 'RECEIVED' && last?.id === row.id,
      (settings?.receiptTolerancePct ?? D(0)).toFixed(2),
    );
  }

  /**
   * Creates a receipt against a confirmed order. By default it is posted at once
   * (stock IN, average and last purchase cost, received quantities and order status);
   * with `asDraft` it is only saved, and nothing moves until it is posted.
   */
  async create(dto: CreateGoodsReceiptDto, user: RequestUser): Promise<GoodsReceiptDetail> {
    const header = checkHeader(dto);
    const id = await this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, dto.purchaseOrderId);
      assertReceivable(order);
      if (header.day < toDateString(order.orderDate)) {
        throw new BadRequestException('The reception date cannot be before the order date');
      }
      const tolerance = await tolerancePct(tx);
      const lines = checkLines(order, dto.lines, tolerance);

      const receipt = await tx.goodsReceipt.create({
        data: {
          number: draftNumber(),
          status: 'DRAFT',
          purchaseOrderId: order.id,
          warehouseId: order.warehouseId,
          receivedAt: header.receivedAt,
          supplierRef: dto.supplierRef ?? null,
          supplierInvoiceNumber: header.invoiceNumber,
          supplierInvoiceDate: header.invoiceDate
            ? new Date(`${header.invoiceDate}T00:00:00.000Z`)
            : null,
          notes: dto.notes ?? null,
          createdById: user.id,
          lines: { createMany: { data: lines.map(toLineData) } },
        },
      });
      await audit(tx, user, 'create', 'GoodsReceipt', receipt.id, null, {
        status: 'DRAFT',
        purchaseOrder: order.number,
        supplierRef: dto.supplierRef ?? null,
        receivedAt: header.receivedAt.toISOString(),
        lines: auditLines(lines),
      } as Prisma.InputJsonObject);
      if (!dto.asDraft) await postReceipt(tx, receipt.id, user);
      return receipt.id;
    });
    return this.get(id);
  }

  /** Replaces the header and the lines of a draft (same order). */
  async update(
    id: string,
    dto: UpdateGoodsReceiptDto,
    user: RequestUser,
  ): Promise<GoodsReceiptDetail> {
    const header = checkHeader(dto);
    await this.prisma.$transaction(async (tx) => {
      const draft = await lockReceipt(tx, id);
      if (draft.status !== 'DRAFT') {
        throw new ConflictException(`${draft.number} is posted: it cannot be changed any more`);
      }
      if (dto.purchaseOrderId !== draft.purchaseOrderId) {
        throw new BadRequestException('A draft receipt cannot be moved to another order');
      }
      const order = await lockOrder(tx, draft.purchaseOrderId);
      assertReceivable(order);
      if (header.day < toDateString(order.orderDate)) {
        throw new BadRequestException('The reception date cannot be before the order date');
      }
      const lines = checkLines(order, dto.lines, await tolerancePct(tx));
      const before = await tx.goodsReceipt.findUniqueOrThrow({
        where: { id },
        include: { lines: { include: { product: { select: { sku: true } } } } },
      });
      await tx.goodsReceiptLine.deleteMany({ where: { goodsReceiptId: id } });
      await tx.goodsReceipt.update({
        where: { id },
        data: {
          receivedAt: header.receivedAt,
          supplierRef: dto.supplierRef ?? null,
          supplierInvoiceNumber: header.invoiceNumber,
          supplierInvoiceDate: header.invoiceDate
            ? new Date(`${header.invoiceDate}T00:00:00.000Z`)
            : null,
          notes: dto.notes ?? null,
          lines: { createMany: { data: lines.map(toLineData) } },
        },
      });
      await audit(
        tx,
        user,
        'update',
        'GoodsReceipt',
        id,
        toAuditJson({
          receivedAt: before.receivedAt.toISOString(),
          supplierRef: before.supplierRef,
          lines: before.lines.map((l) => ({
            sku: l.product.sku,
            quantity: l.quantity.toString(),
            rejectedQty: l.rejectedQty.toString(),
          })),
        }) as Prisma.InputJsonObject,
        {
          receivedAt: header.receivedAt.toISOString(),
          supplierRef: dto.supplierRef ?? null,
          lines: auditLines(lines),
        } as Prisma.InputJsonObject,
      );
    });
    return this.get(id);
  }

  /** Deletes a draft (nothing was moved yet). */
  async remove(id: string, user: RequestUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const draft = await lockReceipt(tx, id);
      if (draft.status !== 'DRAFT') {
        throw new ConflictException(`${draft.number} is posted: cancel it instead of deleting it`);
      }
      await tx.goodsReceipt.delete({ where: { id } });
      await audit(tx, user, 'delete', 'GoodsReceipt', id, { number: draft.number }, null);
    });
  }

  /** Posts a draft: the goods enter the stock and the receipt becomes immutable. */
  async post(id: string, user: RequestUser): Promise<GoodsReceiptDetail> {
    await this.prisma.$transaction((tx) => postReceipt(tx, id, user));
    return this.get(id);
  }

  /**
   * Cancels a posted receipt: the goods leave the stock again (reversing moves, the
   * ledger is never rewritten), the order gets its quantities back and the costs are
   * recomputed. Refused once the receipt is on a supplier bill, or when the stock
   * would become negative (unless the settings allow it).
   */
  async cancel(
    id: string,
    dto: CancelGoodsReceiptDto,
    user: RequestUser,
  ): Promise<GoodsReceiptDetail> {
    await this.prisma.$transaction(async (tx) => {
      const head = await lockReceipt(tx, id);
      if (head.status === 'DRAFT') {
        throw new ConflictException(`${head.number} is a draft: delete it instead`);
      }
      if (head.status === 'CANCELLED') {
        throw new ConflictException(`${head.number} is already cancelled`);
      }
      const order = await lockOrder(tx, head.purchaseOrderId);
      const receipt = await tx.goodsReceipt.findUniqueOrThrow({
        where: { id },
        include: {
          lines: {
            include: {
              product: { select: { sku: true } },
              purchaseOrderLine: { select: { lineNo: true } },
              invoiceLines: {
                where: { invoice: { status: { not: 'CANCELLED' } } },
                select: { invoice: { select: { number: true } } },
              },
            },
          },
        },
      });
      const bills = [
        ...new Set(receipt.lines.flatMap((l) => l.invoiceLines.map((il) => il.invoice.number))),
      ];
      if (bills.length) {
        throw new ConflictException(
          `${receipt.number} is on supplier bill ${bills.join(', ')}: cancel or correct the bill first`,
        );
      }

      const settings = await tx.companySettings.findUnique({
        where: { id: 1 },
        select: { allowNegativeStock: true },
      });
      const moving = receipt.lines
        .filter((l) => l.quantity.gt(0))
        .sort((a, b) =>
          a.productId === b.productId
            ? a.purchaseOrderLine.lineNo - b.purchaseOrderLine.lineNo
            : a.productId < b.productId
              ? -1
              : 1,
        );
      const productIds = [...new Set(moving.map((l) => l.productId))];
      if (productIds.length) {
        await tx.$queryRaw`
          SELECT id FROM products WHERE id IN (${Prisma.join(productIds.map((p) => Prisma.sql`${p}::uuid`))})
          ORDER BY id FOR UPDATE`;
      }

      const errors: string[] = [];
      const costChanges: Record<string, { before: string; after: string }> = {};
      const reason = `Cancellation of ${receipt.number}: ${dto.reason}`;
      for (const l of moving) {
        const balance = await lockBalance(tx, l.productId, receipt.warehouseId);
        const after = balance.minus(l.baseQuantity);
        if (after.isNegative() && !settings?.allowNegativeStock) {
          errors.push(
            `${l.product.sku}: only ${trim(balance)} left in stock, ${trim(l.baseQuantity)} would have to go out`,
          );
          continue;
        }
        const product = await tx.product.findUniqueOrThrow({
          where: { id: l.productId },
          select: { averageCost: true },
        });
        const stock = await tx.stockBalance.aggregate({
          where: { productId: l.productId },
          _sum: { quantity: true },
        });
        const average = averageCostAfterReversal(
          stock._sum.quantity ?? 0,
          product.averageCost,
          l.baseQuantity,
          l.unitCost,
        );
        if (!average.eq(product.averageCost)) {
          await tx.product.update({ where: { id: l.productId }, data: { averageCost: average } });
        }
        costChanges[l.product.sku] = {
          before: costChanges[l.product.sku]?.before ?? product.averageCost.toFixed(4),
          after: average.toFixed(4),
        };
        await postMove(
          tx,
          {
            productId: l.productId,
            warehouseId: receipt.warehouseId,
            type: 'RECEIPT',
            quantity: l.baseQuantity.negated(),
            unitCost: l.unitCost,
            createdById: user.id,
            sourceType: 'GoodsReceipt',
            sourceId: receipt.id,
            reference: receipt.number,
            reason,
          },
          after,
        );
        await tx.purchaseOrderLine.update({
          where: { id: l.purchaseOrderLineId },
          data: { receivedQty: { decrement: l.quantity } },
        });
      }
      if (errors.length) {
        throw new BadRequestException([
          'The stock is too low to take these goods out again:',
          ...errors,
        ]);
      }

      const lines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: order.id },
        select: { quantity: true, receivedQty: true },
      });
      const status = statusAfterCancelledReceipt(lines);
      if (status !== order.status) {
        await tx.purchaseOrder.update({ where: { id: order.id }, data: { status } });
      }
      await tx.goodsReceipt.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: dto.reason },
      });
      const lastCost = await refreshLastPurchaseCost(tx, productIds);

      await audit(
        tx,
        user,
        'cancel',
        'GoodsReceipt',
        id,
        { status: 'POSTED' },
        toAuditJson({
          status: 'CANCELLED',
          reason: dto.reason,
          averageCost: costChanges,
          lastPurchaseCost: lastCost,
        }) as Prisma.InputJsonObject,
      );
      await audit(
        tx,
        user,
        'receipt-cancelled',
        'PurchaseOrder',
        order.id,
        { status: order.status },
        toAuditJson({ status, receipt: receipt.number }) as Prisma.InputJsonObject,
      );
    });
    return this.get(id);
  }

  /**
   * Records (or corrects) the supplier invoice once the order is delivered:
   * only on the receipt that completed the order (its last receipt).
   */
  async setInvoice(
    id: string,
    dto: SetSupplierInvoiceDto,
    user: RequestUser,
  ): Promise<GoodsReceiptDetail> {
    if (dto.supplierInvoiceDate > toDateString(new Date())) {
      throw new BadRequestException('The supplier invoice date cannot be in the future');
    }
    await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.findUnique({
        where: { id },
        select: {
          id: true,
          number: true,
          status: true,
          purchaseOrderId: true,
          supplierInvoiceNumber: true,
          supplierInvoiceDate: true,
        },
      });
      if (!receipt) throw new NotFoundException('Goods receipt not found');
      if (receipt.status !== 'POSTED') {
        throw new ConflictException(
          receipt.status === 'DRAFT'
            ? 'Enter the supplier invoice on the draft, or post the receipt first'
            : `${receipt.number} is cancelled`,
        );
      }
      const order = await lockOrder(tx, receipt.purchaseOrderId);
      if (order.status !== 'RECEIVED') throw new ConflictException(INVOICE_NOT_COMPLETE);
      const last = await tx.goodsReceipt.findFirstOrThrow({
        where: { purchaseOrderId: order.id, status: 'POSTED' },
        orderBy: [{ receivedAt: 'desc' }, { number: 'desc' }],
        select: { id: true, number: true },
      });
      if (last.id !== receipt.id) {
        throw new ConflictException(
          `Record the supplier invoice on ${last.number}, the receipt that completed ${order.number}`,
        );
      }
      const before = {
        supplierInvoice: receipt.supplierInvoiceNumber
          ? {
              number: receipt.supplierInvoiceNumber,
              date: receipt.supplierInvoiceDate ? toDateString(receipt.supplierInvoiceDate) : null,
            }
          : null,
      };
      await tx.goodsReceipt.update({
        where: { id },
        data: {
          supplierInvoiceNumber: dto.supplierInvoiceNumber,
          supplierInvoiceDate: new Date(`${dto.supplierInvoiceDate}T00:00:00.000Z`),
        },
      });
      await audit(tx, user, 'invoice', 'GoodsReceipt', id, before, {
        supplierInvoice: { number: dto.supplierInvoiceNumber, date: dto.supplierInvoiceDate },
      });
    });
    return this.get(id);
  }
}

const INVOICE_NOT_COMPLETE =
  'The supplier invoice can be recorded only once the order is delivered and 100% received';

// ── helpers ──────────────────────────────────────────────────────────────────

/** The list filters, shared by the list and the Excel export. */
export function receiptWhere(
  query: Pick<
    ListGoodsReceiptsQueryDto,
    'search' | 'supplierId' | 'purchaseOrderId' | 'from' | 'to'
  > & { status?: ListGoodsReceiptsQueryDto['status'] },
): Prisma.GoodsReceiptWhereInput {
  const receivedAt: Prisma.DateTimeFilter = {};
  if (query.from) receivedAt.gte = new Date(`${query.from}T00:00:00.000Z`);
  if (query.to) {
    const end = new Date(`${query.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    receivedAt.lt = end;
  }
  const contains = (v: string) => ({ contains: v, mode: 'insensitive' as const });
  return {
    ...(query.status && query.status !== 'all' && { status: query.status }),
    ...((query.from || query.to) && { receivedAt }),
    ...(query.purchaseOrderId && { purchaseOrderId: query.purchaseOrderId }),
    ...(query.supplierId && { purchaseOrder: { supplierId: query.supplierId } }),
    ...(query.search && {
      OR: [
        { number: contains(query.search) },
        { supplierRef: contains(query.search) },
        { supplierInvoiceNumber: contains(query.search) },
        { purchaseOrder: { number: contains(query.search) } },
        { purchaseOrder: { supplier: { name: contains(query.search) } } },
        { purchaseOrder: { supplier: { code: contains(query.search) } } },
      ],
    }),
  };
}

const DELIVERY_PO_STATUS = {
  waiting: 'CONFIRMED',
  in_progress: 'PARTIALLY_RECEIVED',
  delivered: 'RECEIVED',
} as const;

const DELIVERY_INCLUDE = {
  supplier: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  lines: { select: { quantity: true, receivedQty: true, unitPrice: true } },
  receipts: {
    where: { status: 'POSTED' },
    orderBy: { receivedAt: 'asc' },
    select: {
      id: true,
      number: true,
      receivedAt: true,
      supplierRef: true,
      supplierInvoiceNumber: true,
      supplierInvoiceDate: true,
    },
  },
} satisfies Prisma.PurchaseOrderInclude;

type DeliveryRow = Prisma.PurchaseOrderGetPayload<{ include: typeof DELIVERY_INCLUDE }>;

/** The delivery filters, shared by the list and the Excel export. */
export function deliveryWhere(
  query: Pick<ListDeliveriesQueryDto, 'status' | 'search' | 'supplierId' | 'lateOnly'>,
): Prisma.PurchaseOrderWhereInput {
  const statuses =
    query.status === 'all'
      ? Object.values(DELIVERY_PO_STATUS)
      : query.status === 'open'
        ? [DELIVERY_PO_STATUS.waiting, DELIVERY_PO_STATUS.in_progress]
        : [DELIVERY_PO_STATUS[query.status]];
  const contains = (v: string) => ({ contains: v, mode: 'insensitive' as const });
  const today = new Date(`${toDateString(new Date())}T00:00:00.000Z`);
  return {
    status: { in: query.lateOnly ? statuses.filter((st) => st !== 'RECEIVED') : statuses },
    ...(query.lateOnly && { expectedDate: { lt: today } }),
    ...(query.supplierId && { supplierId: query.supplierId }),
    ...(query.search && {
      OR: [
        { number: contains(query.search) },
        { supplier: { name: contains(query.search) } },
        { supplier: { code: contains(query.search) } },
        { receipts: { some: { number: contains(query.search) } } },
        { receipts: { some: { supplierRef: contains(query.search) } } },
        { receipts: { some: { supplierInvoiceNumber: contains(query.search) } } },
      ],
    }),
  };
}

/** Open orders: most urgent first (expected date, none last). Delivered: latest first. */
export function deliveryOrderBy(
  status: ListDeliveriesQueryDto['status'],
): Prisma.PurchaseOrderOrderByWithRelationInput[] {
  if (status === 'delivered') return [{ updatedAt: 'desc' }, { number: 'desc' }];
  if (status === 'all') return [{ orderDate: 'desc' }, { number: 'desc' }];
  return [
    { expectedDate: { sort: 'asc', nulls: 'last' } },
    { orderDate: 'asc' },
    { number: 'asc' },
  ];
}

function toDelivery(o: DeliveryRow): DeliveryListItem {
  const status: DeliveryStatus =
    o.status === 'RECEIVED'
      ? 'delivered'
      : o.status === 'PARTIALLY_RECEIVED'
        ? 'in_progress'
        : 'waiting';
  // Progress weighted by value, so 24 bottles do not hide a missing line (price 0 counts as 1).
  let ordered = D(0);
  let received = D(0);
  for (const l of o.lines) {
    const w = l.unitPrice.gt(0) ? l.unitPrice : D(1);
    ordered = ordered.plus(l.quantity.mul(w));
    received = received.plus(Prisma.Decimal.min(l.receivedQty, l.quantity).mul(w));
  }
  const pct = ordered.gt(0) ? Math.floor(received.div(ordered).mul(100).toNumber()) : 0;
  const first = o.receipts[0]?.receivedAt ?? null;
  const last = o.receipts.at(-1)?.receivedAt ?? null;
  const expected = o.expectedDate ? toDateString(o.expectedDate) : null;
  const late = expected
    ? status === 'delivered'
      ? toDateString(last!) > expected
      : toDateString(new Date()) > expected
    : false;
  return {
    order: {
      id: o.id,
      number: o.number,
      orderDate: toDateString(o.orderDate),
      total: o.total.toFixed(MONEY_DECIMALS),
    },
    supplier: o.supplier,
    warehouse: o.warehouse,
    status,
    expectedDate: expected,
    firstDeliveryAt: first?.toISOString() ?? null,
    lastDeliveryAt: last?.toISOString() ?? null,
    late,
    progressPct: status === 'delivered' ? 100 : Math.min(pct, 99),
    lineCount: o.lines.length,
    linesDone: o.lines.filter((l) => l.receivedQty.gte(l.quantity)).length,
    receipts: o.receipts.map((r) => ({
      id: r.id,
      number: r.number,
      receivedAt: r.receivedAt.toISOString(),
      supplierRef: r.supplierRef,
      supplierInvoiceNumber: r.supplierInvoiceNumber,
      supplierInvoiceDate: r.supplierInvoiceDate ? toDateString(r.supplierInvoiceDate) : null,
    })),
  };
}

/** Locks the order until commit: two receipts on the same order never interleave. */
async function lockOrder(tx: Tx, id: string) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM purchase_orders WHERE id = ${id}::uuid FOR UPDATE`;
  if (!locked.length) throw new NotFoundException('Purchase order not found');
  return tx.purchaseOrder.findUniqueOrThrow({
    where: { id },
    include: {
      lines: {
        orderBy: { lineNo: 'asc' },
        include: {
          product: { select: { sku: true } },
          unit: { select: { code: true } },
        },
      },
    },
  });
}

/** "12.5000" → "12.5" in messages */
const trim = (d: Prisma.Decimal | string) => D(d).toString();

function toListItem(r: ListRow): GoodsReceiptListItem {
  return {
    id: r.id,
    number: r.number,
    receivedAt: r.receivedAt.toISOString(),
    purchaseOrder: { id: r.purchaseOrder.id, number: r.purchaseOrder.number },
    supplier: r.purchaseOrder.supplier,
    warehouse: r.warehouse,
    supplierRef: r.supplierRef,
    supplierInvoiceNumber: r.supplierInvoiceNumber,
    supplierInvoiceDate: r.supplierInvoiceDate ? toDateString(r.supplierInvoiceDate) : null,
    lineCount: r.lines.length,
    value: r.lines.reduce((s, l) => s.plus(l.value), D(0)).toFixed(MONEY_DECIMALS),
    createdBy: r.createdBy,
    status: r.status,
    billing: billingState(r.lines),
  };
}

/** How much of a receipt is on posted supplier bills. */
export function billingState(
  lines: { quantity: Prisma.Decimal; billedQty: Prisma.Decimal }[],
): 'none' | 'partial' | 'full' {
  const received = lines.filter((l) => l.quantity.gt(0));
  if (!received.length || received.every((l) => l.billedQty.lte(0))) return 'none';
  return received.every((l) => l.billedQty.gte(l.quantity)) ? 'full' : 'partial';
}

function toDetail(r: DetailRow, invoiceEditable: boolean, tolerance: string): GoodsReceiptDetail {
  const bills = new Map<string, { id: string; number: string; status: string }>();
  for (const l of r.lines) for (const il of l.invoiceLines) bills.set(il.invoice.id, il.invoice);
  return {
    ...toListItem(r),
    invoiceEditable,
    notes: r.notes,
    postedAt: r.postedAt?.toISOString() ?? null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelReason: r.cancelReason,
    bills: [...bills.values()],
    tolerancePct: tolerance,
    createdAt: r.createdAt.toISOString(),
    lines: [...r.lines]
      .sort((a, b) => a.purchaseOrderLine.lineNo - b.purchaseOrderLine.lineNo)
      .map((l) => ({
        id: l.id,
        purchaseOrderLineId: l.purchaseOrderLineId,
        product: {
          id: l.product.id,
          sku: l.product.sku,
          name: l.product.name,
          baseUnitCode: l.product.baseUnit.code,
        },
        unit: l.purchaseOrderLine.unit,
        unitFactor: l.purchaseOrderLine.unitFactor.toFixed(4),
        quantity: l.quantity.toFixed(4),
        baseQuantity: l.baseQuantity.toFixed(4),
        unitCost: l.unitCost.toFixed(4),
        value: l.value.toFixed(MONEY_DECIMALS),
        rejectedQty: l.rejectedQty.toFixed(4),
        rejectReason: l.rejectReason,
        billedQty: l.billedQty.toFixed(4),
        orderedQty: l.purchaseOrderLine.quantity.toFixed(4),
        receivedOnOrder: l.purchaseOrderLine.receivedQty.toFixed(4),
      })),
  };
}

// ── create / post helpers ────────────────────────────────────────────────────

type LockedOrder = Awaited<ReturnType<typeof lockOrder>>;

interface CheckedLine {
  line: LockedOrder['lines'][number];
  quantity: Prisma.Decimal;
  rejectedQty: Prisma.Decimal;
  rejectReason: string | null;
  baseQuantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  value: Prisma.Decimal;
}

/** Dates and supplier invoice of a receipt body. */
function checkHeader(dto: CreateGoodsReceiptDto | UpdateGoodsReceiptDto) {
  const today = toDateString(new Date());
  const day = dto.receivedDate ?? today;
  if (day > today) throw new BadRequestException('The reception date cannot be in the future');
  // Today: the real time. Another day: midday UTC, so the date reads the same everywhere.
  const receivedAt = day === today ? new Date() : new Date(`${day}T12:00:00.000Z`);
  const invoiceNumber = dto.supplierInvoiceNumber ?? null;
  const invoiceDate = dto.supplierInvoiceDate ?? null;
  if (Boolean(invoiceNumber) !== Boolean(invoiceDate)) {
    throw new BadRequestException(
      invoiceNumber
        ? 'Enter the date of the supplier invoice'
        : 'Enter the number of the supplier invoice',
    );
  }
  if (invoiceDate && invoiceDate > today) {
    throw new BadRequestException('The supplier invoice date cannot be in the future');
  }
  return { day, receivedAt, invoiceNumber, invoiceDate };
}

function assertReceivable(order: LockedOrder) {
  if (!canReceive(order.status)) {
    throw new ConflictException(
      order.status === 'RECEIVED'
        ? `${order.number} is already fully received`
        : `${order.number} is ${order.status.toLowerCase().replace('_', ' ')}: goods cannot be received`,
    );
  }
}

async function tolerancePct(tx: Tx): Promise<Prisma.Decimal> {
  const settings = await tx.companySettings.findUnique({
    where: { id: 1 },
    select: { receiptTolerancePct: true },
  });
  return settings?.receiptTolerancePct ?? D(0);
}

/**
 * Checks every line against what can still be received (what is left plus the
 * tolerance) and values it at the order price. Lines with nothing accepted and
 * nothing rejected are dropped.
 */
function checkLines(
  order: LockedOrder,
  input: {
    purchaseOrderLineId: string;
    quantity: string;
    rejectedQty?: string;
    rejectReason?: string | null;
  }[],
  tolerance: Prisma.Decimal,
): CheckedLine[] {
  const byId = new Map(order.lines.map((l) => [l.id, l]));
  const seen = new Set<string>();
  const errors: string[] = [];
  const wanted = input.filter((l) => {
    if (seen.has(l.purchaseOrderLineId)) {
      errors.push('Each order line can appear only once');
      return false;
    }
    seen.add(l.purchaseOrderLineId);
    return D(l.quantity).gt(0) || D(l.rejectedQty ?? 0).gt(0);
  });
  for (const l of wanted) {
    const line = byId.get(l.purchaseOrderLineId);
    if (!line) {
      errors.push('A line does not belong to this order');
      continue;
    }
    const limit = receivableLimit(line.quantity, line.receivedQty, tolerance);
    if (D(l.quantity).gt(limit)) {
      const remaining = line.quantity.minus(line.receivedQty);
      errors.push(
        tolerance.gt(0)
          ? `Line ${line.lineNo} (${line.product.sku}): ${trim(l.quantity)} ${line.unit.code} is more than the ${trim(limit)} ${line.unit.code} allowed (${trim(remaining.isNegative() ? D(0) : remaining)} left + ${trim(tolerance)} % tolerance)`
          : `Line ${line.lineNo} (${line.product.sku}): ${trim(l.quantity)} ${line.unit.code} is more than the ${trim(remaining)} ${line.unit.code} still to receive`,
      );
    }
    if (D(l.rejectedQty ?? 0).gt(0) && !l.rejectReason) {
      errors.push(`Line ${line.lineNo} (${line.product.sku}): enter why goods were refused`);
    }
  }
  if (errors.length) throw new BadRequestException([...new Set(errors)]);
  if (!wanted.length) throw new BadRequestException('Enter a quantity on at least one line');

  return (
    wanted
      .map((l) => {
        const line = byId.get(l.purchaseOrderLineId)!;
        const rejected = D(l.rejectedQty ?? 0);
        return {
          line,
          quantity: D(l.quantity),
          rejectedQty: rejected,
          rejectReason: rejected.gt(0) ? (l.rejectReason ?? null) : null,
          ...receiptLineAmounts(l.quantity, line.unitPrice, line.discountPct, line.unitFactor),
        };
      })
      // Stable lock order (product, then line) so concurrent documents cannot deadlock.
      .sort((a, b) =>
        a.line.productId === b.line.productId
          ? a.line.lineNo - b.line.lineNo
          : a.line.productId < b.line.productId
            ? -1
            : 1,
      )
  );
}

function toLineData(l: CheckedLine) {
  return {
    purchaseOrderLineId: l.line.id,
    productId: l.line.productId,
    quantity: l.quantity,
    baseQuantity: l.baseQuantity,
    unitCost: l.unitCost,
    value: l.value,
    rejectedQty: l.rejectedQty,
    rejectReason: l.rejectReason,
  };
}

function auditLines(lines: CheckedLine[]) {
  return lines.map((l) => ({
    sku: l.line.product.sku,
    quantity: l.quantity.toString(),
    rejectedQty: l.rejectedQty.toString(),
    unit: l.line.unit.code,
    baseQuantity: l.baseQuantity.toString(),
    unitCost: l.unitCost.toString(),
  }));
}

/** Temporary unique number of a draft; the real one is taken when it is posted. */
function draftNumber(): string {
  return `DRAFT-GR-${randomUUID().slice(0, 8).toUpperCase()}`;
}

/** Locks the receipt row until commit. */
async function lockReceipt(tx: Tx, id: string) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM goods_receipts WHERE id = ${id}::uuid FOR UPDATE`;
  if (!locked.length) throw new NotFoundException('Goods receipt not found');
  return tx.goodsReceipt.findUniqueOrThrow({
    where: { id },
    select: { id: true, number: true, status: true, purchaseOrderId: true },
  });
}

/**
 * Posts a draft receipt, in the caller's transaction: number, stock moves (IN),
 * warehouse balances, weighted average cost, last purchase cost, received quantities
 * and status of the order. The quantities are checked again: another receipt may
 * have been posted on the same order since the draft was saved.
 */
async function postReceipt(tx: Tx, id: string, user: RequestUser): Promise<void> {
  const head = await lockReceipt(tx, id);
  if (head.status !== 'DRAFT') {
    throw new ConflictException(`${head.number} is already ${head.status.toLowerCase()}`);
  }
  const order = await lockOrder(tx, head.purchaseOrderId);
  assertReceivable(order);
  const draft = await tx.goodsReceipt.findUniqueOrThrow({
    where: { id },
    include: { lines: true },
  });
  const warehouse = await tx.warehouse.findUniqueOrThrow({
    where: { id: draft.warehouseId },
    select: { code: true, isActive: true },
  });
  if (!warehouse.isActive) {
    throw new BadRequestException(`Warehouse ${warehouse.code} is inactive`);
  }
  const lines = checkLines(
    order,
    draft.lines.map((l) => ({
      purchaseOrderLineId: l.purchaseOrderLineId,
      quantity: l.quantity.toString(),
      rejectedQty: l.rejectedQty.toString(),
      rejectReason: l.rejectReason,
    })),
    await tolerancePct(tx),
  );

  const moving = lines.filter((l) => l.quantity.gt(0));
  const productIds = [...new Set(moving.map((l) => l.line.productId))];
  if (productIds.length) {
    // The average cost is per product (all warehouses): lock the products while it changes.
    await tx.$queryRaw`
      SELECT id FROM products WHERE id IN (${Prisma.join(productIds.map((p) => Prisma.sql`${p}::uuid`))})
      ORDER BY id FOR UPDATE`;
  }

  const number = await nextDocumentNumber(tx, 'GOODS_RECEIPT', draft.receivedAt);
  await tx.goodsReceipt.update({
    where: { id },
    data: { number, status: 'POSTED', postedAt: new Date() },
  });

  const costChanges: Record<string, { before: string; after: string }> = {};
  for (const l of moving) {
    const productId = l.line.productId;
    const product = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: { averageCost: true },
    });
    const stock = await tx.stockBalance.aggregate({
      where: { productId },
      _sum: { quantity: true },
    });
    const average = weightedAverageCost(
      stock._sum.quantity ?? 0,
      product.averageCost,
      l.baseQuantity,
      l.unitCost,
    );
    if (!average.eq(product.averageCost)) {
      await tx.product.update({ where: { id: productId }, data: { averageCost: average } });
    }
    costChanges[l.line.product.sku] = {
      before: costChanges[l.line.product.sku]?.before ?? product.averageCost.toFixed(4),
      after: average.toFixed(4),
    };

    const balance = await lockBalance(tx, productId, draft.warehouseId);
    await postMove(
      tx,
      {
        productId,
        warehouseId: draft.warehouseId,
        type: 'RECEIPT',
        quantity: l.baseQuantity,
        unitCost: l.unitCost,
        createdById: user.id,
        sourceType: 'GoodsReceipt',
        sourceId: id,
        reference: number,
      },
      balance.plus(l.baseQuantity),
    );

    await tx.purchaseOrderLine.update({
      where: { id: l.line.id },
      data: { receivedQty: { increment: l.quantity } },
    });
  }

  const after = await tx.purchaseOrderLine.findMany({
    where: { purchaseOrderId: order.id },
    select: { quantity: true, receivedQty: true },
  });
  const status = moving.length ? statusAfterReceipt(after) : order.status;
  // The supplier invoice comes with the delivery that completes the order.
  if (draft.supplierInvoiceNumber && status !== 'RECEIVED') {
    throw new BadRequestException(INVOICE_NOT_COMPLETE);
  }
  if (status !== order.status) {
    await tx.purchaseOrder.update({ where: { id: order.id }, data: { status } });
  }
  const lastCost = await refreshLastPurchaseCost(tx, productIds);

  await audit(
    tx,
    user,
    'post',
    'GoodsReceipt',
    id,
    { status: 'DRAFT', number: draft.number },
    toAuditJson({
      status: 'POSTED',
      number,
      purchaseOrder: order.number,
      supplierInvoice: draft.supplierInvoiceNumber
        ? {
            number: draft.supplierInvoiceNumber,
            date: draft.supplierInvoiceDate ? toDateString(draft.supplierInvoiceDate) : null,
          }
        : null,
      lines: auditLines(lines),
      averageCost: costChanges,
      lastPurchaseCost: lastCost,
    }) as Prisma.InputJsonObject,
  );
  await audit(
    tx,
    user,
    'receive',
    'PurchaseOrder',
    order.id,
    { status: order.status },
    toAuditJson({ status, receipt: number }) as Prisma.InputJsonObject,
  );
}
