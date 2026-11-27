import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  AttachableReceipt,
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
  AttachReceiptDto,
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
  statusAfterCancelledReceipt,
  statusAfterReceipt,
  toDateString,
  weightedAverageCost,
} from './purchase-order-rules';

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const LIST_INCLUDE = {
  supplier: { select: { id: true, code: true, name: true } },
  purchaseOrder: { select: { id: true, number: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  lines: { select: { value: true, quantity: true, billedQty: true } },
} satisfies Prisma.GoodsReceiptInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  supplier: {
    select: {
      id: true,
      code: true,
      name: true,
      taxId: true,
      rne: true,
      phone: true,
      email: true,
      address: true,
      paymentTermDays: true,
    },
  },
  purchaseOrder: { select: { id: true, number: true, orderDate: true } },
  lines: {
    orderBy: { lineNo: 'asc' },
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          barcode: true,
          baseUnit: { select: { code: true } },
        },
      },
      unit: { select: { id: true, code: true } },
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
    const settings = await this.prisma.companySettings.findUnique({
      where: { id: 1 },
      select: { receiptTolerancePct: true },
    });
    return toDetail(row, (settings?.receiptTolerancePct ?? D(0)).toFixed(2));
  }

  /**
   * Creates a receipt for a supplier with the products received (entered by hand or
   * scanned). Posted at once by default (stock IN, costs); with `asDraft` it is only
   * saved, and nothing moves until it is posted.
   */
  async create(dto: CreateGoodsReceiptDto, user: RequestUser): Promise<GoodsReceiptDetail> {
    const day = checkDate(dto.receivedDate);
    const id = await this.prisma.$transaction(async (tx) => {
      const supplier = await activeSupplier(tx, dto.supplierId);
      const warehouseId = await pickWarehouse(tx, dto.warehouseId);
      const lines = await checkLines(tx, dto.lines);
      const receipt = await tx.goodsReceipt.create({
        data: {
          number: draftNumber(),
          status: 'DRAFT',
          supplierId: supplier.id,
          warehouseId,
          receivedAt: day.receivedAt,
          supplierRef: dto.supplierRef ?? null,
          notes: dto.notes ?? null,
          createdById: user.id,
          lines: { createMany: { data: lines.map(toLineData) } },
        },
      });
      await audit(tx, user, 'create', 'GoodsReceipt', receipt.id, null, {
        status: 'DRAFT',
        supplier: supplier.name,
        supplierRef: dto.supplierRef ?? null,
        receivedAt: day.receivedAt.toISOString(),
        lines: auditLines(lines),
      } as Prisma.InputJsonObject);
      if (!dto.asDraft) await postReceipt(tx, receipt.id, user);
      return receipt.id;
    });
    return this.get(id);
  }

  /** Replaces the header and the lines of a draft. */
  async update(
    id: string,
    dto: UpdateGoodsReceiptDto,
    user: RequestUser,
  ): Promise<GoodsReceiptDetail> {
    const day = checkDate(dto.receivedDate);
    await this.prisma.$transaction(async (tx) => {
      const draft = await lockReceipt(tx, id);
      if (draft.status !== 'DRAFT') {
        throw new ConflictException(`${draft.number} is posted: it cannot be changed any more`);
      }
      const supplier = await activeSupplier(tx, dto.supplierId);
      const warehouseId = await pickWarehouse(tx, dto.warehouseId);
      const lines = await checkLines(tx, dto.lines);
      await tx.goodsReceiptLine.deleteMany({ where: { goodsReceiptId: id } });
      await tx.goodsReceipt.update({
        where: { id },
        data: {
          supplierId: supplier.id,
          warehouseId,
          receivedAt: day.receivedAt,
          supplierRef: dto.supplierRef ?? null,
          notes: dto.notes ?? null,
          lines: { createMany: { data: lines.map(toLineData) } },
        },
      });
      await audit(tx, user, 'update', 'GoodsReceipt', id, { number: draft.number }, {
        supplier: supplier.name,
        receivedAt: day.receivedAt.toISOString(),
        supplierRef: dto.supplierRef ?? null,
        lines: auditLines(lines),
      } as Prisma.InputJsonObject);
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
   * Cancels a posted receipt: the goods leave the stock again (reversing moves; the
   * ledger is never rewritten) and the costs are recomputed. When it is attached to an
   * order, it is detached first (the order gets its quantities back). Refused once the
   * receipt is on a supplier bill, or when the stock would become negative (unless the
   * settings allow it).
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
      const receipt = await tx.goodsReceipt.findUniqueOrThrow({
        where: { id },
        include: {
          lines: {
            include: {
              product: { select: { sku: true } },
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
      if (receipt.purchaseOrderId) await detachFromOrder(tx, receipt.id, user);

      const settings = await tx.companySettings.findUnique({
        where: { id: 1 },
        select: { allowNegativeStock: true },
      });
      const moving = receipt.lines
        .filter((l) => l.quantity.gt(0))
        .sort((a, b) =>
          a.productId === b.productId ? a.lineNo - b.lineNo : a.productId < b.productId ? -1 : 1,
        );
      const productIds = [...new Set(moving.map((l) => l.productId))];
      await lockProducts(tx, productIds);

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
      }
      if (errors.length) {
        throw new BadRequestException([
          'The stock is too low to take these goods out again:',
          ...errors,
        ]);
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
    });
    return this.get(id);
  }

  /** Posted receipts of the order's supplier not attached to any order yet. */
  async attachable(purchaseOrderId: string): Promise<AttachableReceipt[]> {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: { supplierId: true, lines: { select: { productId: true } } },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    const onOrder = new Set(order.lines.map((l) => l.productId));
    const receipts = await this.prisma.goodsReceipt.findMany({
      where: { supplierId: order.supplierId, status: 'POSTED', purchaseOrderId: null },
      orderBy: [{ receivedAt: 'desc' }, { number: 'desc' }],
      take: 50,
      include: {
        lines: {
          orderBy: { lineNo: 'asc' },
          include: {
            product: { select: { id: true, sku: true, name: true } },
            unit: { select: { id: true, code: true } },
          },
        },
      },
    });
    return receipts.map((r) => ({
      id: r.id,
      number: r.number,
      receivedAt: r.receivedAt.toISOString(),
      supplierRef: r.supplierRef,
      value: r.lines.reduce((s, l) => s.plus(l.value), D(0)).toFixed(MONEY_DECIMALS),
      lines: r.lines
        .filter((l) => l.quantity.gt(0))
        .map((l) => ({
          product: l.product,
          quantity: l.quantity.toFixed(4),
          unit: l.unit,
          onOrder: onOrder.has(l.productId),
        })),
    }));
  }

  /**
   * Attaches a posted receipt to an order of the same supplier: each received product
   * is matched to the order line of that product (same unit first), the order's
   * received quantities go up and its status follows. Stock is not touched: the goods
   * entered it when the receipt was posted.
   */
  async attach(id: string, dto: AttachReceiptDto, user: RequestUser): Promise<GoodsReceiptDetail> {
    await this.prisma.$transaction(async (tx) => {
      const head = await lockReceipt(tx, id);
      if (head.status !== 'POSTED') {
        throw new ConflictException(`${head.number} must be validated before it is attached`);
      }
      if (head.purchaseOrderId) {
        throw new ConflictException(`${head.number} is already attached to an order`);
      }
      const order = await lockOrder(tx, dto.purchaseOrderId);
      if (!canReceive(order.status)) {
        throw new ConflictException(
          `${order.number} is ${order.status.toLowerCase().replace('_', ' ')}: no receipt can be attached`,
        );
      }
      const receipt = await tx.goodsReceipt.findUniqueOrThrow({
        where: { id },
        include: { lines: { orderBy: { lineNo: 'asc' } } },
      });
      if (receipt.supplierId !== order.supplierId) {
        throw new BadRequestException(`${receipt.number} is from another supplier`);
      }
      let matched = 0;
      for (const l of receipt.lines) {
        if (l.quantity.lte(0)) continue;
        const pol =
          order.lines.find((o) => o.productId === l.productId && o.unitId === l.unitId) ??
          order.lines.find((o) => o.productId === l.productId);
        if (!pol) continue;
        const qty = l.baseQuantity.div(pol.unitFactor).toDecimalPlaces(4);
        await tx.goodsReceiptLine.update({
          where: { id: l.id },
          data: { purchaseOrderLineId: pol.id, matchedQty: qty },
        });
        await tx.purchaseOrderLine.update({
          where: { id: pol.id },
          data: { receivedQty: { increment: qty } },
        });
        matched += 1;
      }
      if (!matched) {
        throw new BadRequestException(
          `None of the products of ${receipt.number} is on ${order.number}`,
        );
      }
      await tx.goodsReceipt.update({ where: { id }, data: { purchaseOrderId: order.id } });
      const after = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: order.id },
        select: { quantity: true, receivedQty: true },
      });
      const status = statusAfterReceipt(after);
      if (status !== order.status) {
        await tx.purchaseOrder.update({ where: { id: order.id }, data: { status } });
      }
      await audit(
        tx,
        user,
        'attach',
        'GoodsReceipt',
        id,
        null,
        toAuditJson({
          purchaseOrder: order.number,
          matchedLines: matched,
        }) as Prisma.InputJsonObject,
      );
      await audit(
        tx,
        user,
        'receive',
        'PurchaseOrder',
        order.id,
        { status: order.status },
        toAuditJson({ status, receipt: receipt.number }) as Prisma.InputJsonObject,
      );
    });
    return this.get(id);
  }

  /** Detaches a receipt from its order: the order's received quantities go back down. */
  async detach(id: string, user: RequestUser): Promise<GoodsReceiptDetail> {
    await this.prisma.$transaction(async (tx) => {
      const head = await lockReceipt(tx, id);
      if (!head.purchaseOrderId) {
        throw new ConflictException(`${head.number} is not attached to an order`);
      }
      await detachFromOrder(tx, id, user);
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
      if (!receipt.purchaseOrderId) {
        throw new ConflictException('Attach the receipt to its order first');
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
    ...(query.supplierId && { supplierId: query.supplierId }),
    ...(query.search && {
      OR: [
        { number: contains(query.search) },
        { supplierRef: contains(query.search) },
        { purchaseOrder: { number: contains(query.search) } },
        { supplier: { name: contains(query.search) } },
        { supplier: { code: contains(query.search) } },
        { lines: { some: { lotNumber: contains(query.search) } } },
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
    status: r.status,
    receivedAt: r.receivedAt.toISOString(),
    purchaseOrder: r.purchaseOrder,
    supplier: r.supplier,
    warehouse: r.warehouse,
    supplierRef: r.supplierRef,
    supplierInvoiceNumber: r.supplierInvoiceNumber,
    supplierInvoiceDate: r.supplierInvoiceDate ? toDateString(r.supplierInvoiceDate) : null,
    lineCount: r.lines.length,
    value: r.lines.reduce((s, l) => s.plus(l.value), D(0)).toFixed(MONEY_DECIMALS),
    createdBy: r.createdBy,
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

function toDetail(r: DetailRow, tolerance: string): GoodsReceiptDetail {
  const bills = new Map<string, { id: string; number: string; status: string }>();
  for (const l of r.lines) for (const il of l.invoiceLines) bills.set(il.invoice.id, il.invoice);
  return {
    ...toListItem({
      ...r,
      supplier: { id: r.supplier.id, code: r.supplier.code, name: r.supplier.name },
      purchaseOrder: r.purchaseOrder
        ? { id: r.purchaseOrder.id, number: r.purchaseOrder.number }
        : null,
    }),
    supplierInfo: r.supplier,
    purchaseOrderDate: r.purchaseOrder ? toDateString(r.purchaseOrder.orderDate) : null,
    invoiceEditable: false,
    notes: r.notes,
    postedAt: r.postedAt?.toISOString() ?? null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelReason: r.cancelReason,
    bills: [...bills.values()],
    tolerancePct: tolerance,
    createdAt: r.createdAt.toISOString(),
    lines: r.lines.map((l) => ({
      id: l.id,
      purchaseOrderLineId: l.purchaseOrderLineId,
      matchedQty: l.matchedQty.toFixed(4),
      product: {
        id: l.product.id,
        sku: l.product.sku,
        name: l.product.name,
        baseUnitCode: l.product.baseUnit.code,
        barcode: l.product.barcode,
      },
      unit: l.unit,
      unitFactor: l.unitFactor.toFixed(4),
      unitPrice: l.unitPrice.toFixed(4),
      quantity: l.quantity.toFixed(4),
      baseQuantity: l.baseQuantity.toFixed(4),
      unitCost: l.unitCost.toFixed(4),
      value: l.value.toFixed(MONEY_DECIMALS),
      rejectedQty: l.rejectedQty.toFixed(4),
      rejectReason: l.rejectReason,
      billedQty: l.billedQty.toFixed(4),
      lotNumber: l.lotNumber,
      expiryDate: l.expiryDate ? toDateString(l.expiryDate) : null,
      quality: l.quality,
    })),
  };
}

// ── create / post helpers ────────────────────────────────────────────────────

interface CheckedLine {
  lineNo: number;
  productId: string;
  sku: string;
  unitId: string;
  unitCode: string;
  unitFactor: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  quantity: Prisma.Decimal;
  rejectedQty: Prisma.Decimal;
  rejectReason: string | null;
  lotNumber: string | null;
  expiryDate: Date | null;
  quality: 'CONFORM' | 'NON_CONFORM';
  baseQuantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  value: Prisma.Decimal;
}

/** Reception day: not in the future. Today keeps the real time; another day reads midday UTC. */
function checkDate(receivedDate?: string) {
  const today = toDateString(new Date());
  const day = receivedDate ?? today;
  if (day > today) throw new BadRequestException('The reception date cannot be in the future');
  return { day, receivedAt: day === today ? new Date() : new Date(`${day}T12:00:00.000Z`) };
}

async function activeSupplier(tx: Tx, id: string) {
  const supplier = await tx.supplier.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  });
  if (!supplier) throw new BadRequestException('Supplier not found');
  if (!supplier.isActive) throw new BadRequestException(`${supplier.name} is inactive`);
  return supplier;
}

/** The given warehouse (must be active), or the first active one. */
async function pickWarehouse(tx: Tx, id?: string): Promise<string> {
  const warehouse = id
    ? await tx.warehouse.findUnique({
        where: { id },
        select: { id: true, code: true, isActive: true },
      })
    : await tx.warehouse.findFirst({
        where: { isActive: true },
        orderBy: { code: 'asc' },
        select: { id: true, code: true, isActive: true },
      });
  if (!warehouse) throw new BadRequestException('Warehouse not found');
  if (!warehouse.isActive) throw new BadRequestException(`Warehouse ${warehouse.code} is inactive`);
  return warehouse.id;
}

/**
 * Checks the received lines: active product, a unit of that product (its base unit or
 * one of its pack sizes), quantities, and the observation required when goods are
 * refused or non-conform. Values each line at its own price. The same product can
 * appear on several lines (e.g. two lots).
 */
async function checkLines(
  tx: Tx,
  input: {
    productId: string;
    unitId: string;
    quantity: string;
    unitPrice: string;
    rejectedQty?: string;
    rejectReason?: string | null;
    lotNumber?: string | null;
    expiryDate?: string | null;
    quality?: 'CONFORM' | 'NON_CONFORM';
  }[],
): Promise<CheckedLine[]> {
  if (!input.length) throw new BadRequestException('Add at least one product');
  const products = new Map(
    (
      await tx.product.findMany({
        where: { id: { in: [...new Set(input.map((l) => l.productId))] } },
        select: {
          id: true,
          sku: true,
          isActive: true,
          baseUnitId: true,
          baseUnit: { select: { id: true, code: true } },
          units: { select: { unitId: true, factor: true, unit: { select: { code: true } } } },
        },
      })
    ).map((p) => [p.id, p]),
  );
  const errors: string[] = [];
  const out: CheckedLine[] = [];
  input.forEach((l, i) => {
    const n = i + 1;
    const p = products.get(l.productId);
    if (!p) return errors.push(`Line ${n}: product not found`);
    if (!p.isActive) errors.push(`Line ${n} (${p.sku}): the product is inactive`);
    let factor = D(1);
    let unitCode = p.baseUnit.code;
    if (l.unitId !== p.baseUnitId) {
      const pack = p.units.find((u) => u.unitId === l.unitId);
      if (!pack)
        return errors.push(`Line ${n} (${p.sku}): this unit is not one of the product's units`);
      factor = pack.factor;
      unitCode = pack.unit.code;
    }
    const qty = D(l.quantity);
    const rejected = D(l.rejectedQty ?? 0);
    if (qty.lte(0) && rejected.lte(0)) {
      errors.push(`Line ${n} (${p.sku}): enter the quantity received`);
    }
    const nonConform = l.quality === 'NON_CONFORM';
    if (rejected.gt(0) && !l.rejectReason) {
      errors.push(`Line ${n} (${p.sku}): enter why goods were refused`);
    }
    if (nonConform && !l.rejectReason) {
      errors.push(`Line ${n} (${p.sku}): enter an observation for a non-conform line`);
    }
    const price = D(l.unitPrice);
    out.push({
      lineNo: n,
      productId: p.id,
      sku: p.sku,
      unitId: l.unitId,
      unitCode,
      unitFactor: factor,
      unitPrice: price,
      quantity: qty,
      rejectedQty: rejected,
      rejectReason: rejected.gt(0) || nonConform ? (l.rejectReason ?? null) : null,
      lotNumber: l.lotNumber ?? null,
      expiryDate: l.expiryDate ? new Date(`${l.expiryDate}T00:00:00.000Z`) : null,
      quality: l.quality ?? 'CONFORM',
      ...receiptLineAmounts(qty, price, 0, factor),
    });
  });
  if (errors.length) throw new BadRequestException([...new Set(errors)]);
  return out;
}

function toLineData(l: CheckedLine) {
  return {
    lineNo: l.lineNo,
    productId: l.productId,
    unitId: l.unitId,
    unitFactor: l.unitFactor,
    unitPrice: l.unitPrice,
    quantity: l.quantity,
    baseQuantity: l.baseQuantity,
    unitCost: l.unitCost,
    value: l.value,
    rejectedQty: l.rejectedQty,
    rejectReason: l.rejectReason,
    lotNumber: l.lotNumber,
    expiryDate: l.expiryDate,
    quality: l.quality,
  };
}

function auditLines(lines: CheckedLine[]) {
  return lines.map((l) => ({
    sku: l.sku,
    quantity: l.quantity.toString(),
    unit: l.unitCode,
    unitPrice: l.unitPrice.toString(),
    rejectedQty: l.rejectedQty.toString(),
    lot: l.lotNumber,
    quality: l.quality,
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

/** The average cost is per product (all warehouses): lock the products while it changes. */
async function lockProducts(tx: Tx, productIds: string[]) {
  if (!productIds.length) return;
  await tx.$queryRaw`
    SELECT id FROM products WHERE id IN (${Prisma.join(productIds.map((p) => Prisma.sql`${p}::uuid`))})
    ORDER BY id FOR UPDATE`;
}

/**
 * Posts a draft receipt, in the caller's transaction: number, stock moves (IN),
 * warehouse balances, weighted average cost and last purchase cost.
 */
async function postReceipt(tx: Tx, id: string, user: RequestUser): Promise<void> {
  const head = await lockReceipt(tx, id);
  if (head.status !== 'DRAFT') {
    throw new ConflictException(`${head.number} is already ${head.status.toLowerCase()}`);
  }
  const draft = await tx.goodsReceipt.findUniqueOrThrow({
    where: { id },
    include: { lines: { orderBy: { lineNo: 'asc' } }, supplier: { select: { name: true } } },
  });
  await activeSupplier(tx, draft.supplierId);
  await pickWarehouse(tx, draft.warehouseId);
  const lines = await checkLines(
    tx,
    draft.lines.map((l) => ({
      productId: l.productId,
      unitId: l.unitId,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
      rejectedQty: l.rejectedQty.toString(),
      rejectReason: l.rejectReason,
      lotNumber: l.lotNumber,
      expiryDate: l.expiryDate ? toDateString(l.expiryDate) : null,
      quality: l.quality,
    })),
  );
  const moving = lines
    .filter((l) => l.quantity.gt(0))
    // Stable lock order so concurrent documents cannot deadlock.
    .sort((a, b) =>
      a.productId === b.productId ? a.lineNo - b.lineNo : a.productId < b.productId ? -1 : 1,
    );
  if (!moving.length) {
    throw new BadRequestException('Nothing was accepted: enter a received quantity on a line');
  }
  const productIds = [...new Set(moving.map((l) => l.productId))];
  await lockProducts(tx, productIds);

  const number = await nextDocumentNumber(tx, 'GOODS_RECEIPT', draft.receivedAt);
  await tx.goodsReceipt.update({
    where: { id },
    data: { number, status: 'POSTED', postedAt: new Date() },
  });

  const costChanges: Record<string, { before: string; after: string }> = {};
  for (const l of moving) {
    const product = await tx.product.findUniqueOrThrow({
      where: { id: l.productId },
      select: { averageCost: true },
    });
    const stock = await tx.stockBalance.aggregate({
      where: { productId: l.productId },
      _sum: { quantity: true },
    });
    const average = weightedAverageCost(
      stock._sum.quantity ?? 0,
      product.averageCost,
      l.baseQuantity,
      l.unitCost,
    );
    if (!average.eq(product.averageCost)) {
      await tx.product.update({ where: { id: l.productId }, data: { averageCost: average } });
    }
    costChanges[l.sku] = {
      before: costChanges[l.sku]?.before ?? product.averageCost.toFixed(4),
      after: average.toFixed(4),
    };
    const balance = await lockBalance(tx, l.productId, draft.warehouseId);
    await postMove(
      tx,
      {
        productId: l.productId,
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
      supplier: draft.supplier.name,
      lines: auditLines(lines),
      averageCost: costChanges,
      lastPurchaseCost: lastCost,
    }) as Prisma.InputJsonObject,
  );
}

/** Undoes what attaching did on the order (in the caller's transaction). */
async function detachFromOrder(tx: Tx, receiptId: string, user: RequestUser): Promise<void> {
  const receipt = await tx.goodsReceipt.findUniqueOrThrow({
    where: { id: receiptId },
    include: { lines: true },
  });
  if (!receipt.purchaseOrderId) return;
  const order = await lockOrder(tx, receipt.purchaseOrderId);
  for (const l of receipt.lines) {
    if (!l.purchaseOrderLineId) continue;
    await tx.purchaseOrderLine.update({
      where: { id: l.purchaseOrderLineId },
      data: { receivedQty: { decrement: l.matchedQty } },
    });
  }
  await tx.goodsReceiptLine.updateMany({
    where: { goodsReceiptId: receiptId },
    data: { purchaseOrderLineId: null, matchedQty: 0 },
  });
  await tx.goodsReceipt.update({ where: { id: receiptId }, data: { purchaseOrderId: null } });
  const after = await tx.purchaseOrderLine.findMany({
    where: { purchaseOrderId: order.id },
    select: { quantity: true, receivedQty: true },
  });
  const status = statusAfterCancelledReceipt(after);
  if (status !== order.status) {
    await tx.purchaseOrder.update({ where: { id: order.id }, data: { status } });
  }
  await audit(
    tx,
    user,
    'detach',
    'GoodsReceipt',
    receiptId,
    toAuditJson({ purchaseOrder: order.number }) as Prisma.InputJsonObject,
    null,
  );
  await audit(
    tx,
    user,
    'receipt-detached',
    'PurchaseOrder',
    order.id,
    { status: order.status },
    toAuditJson({ status, receipt: receipt.number }) as Prisma.InputJsonObject,
  );
}
