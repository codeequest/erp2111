import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  AGING_BUCKETS,
  CURRENCY_DECIMALS,
  isCurrency,
  type BillDetail,
  type BillListItem,
  type BillLookups,
  type BillStatus,
  type BillSummary,
  type BillWarning,
  type BillableReceipt,
  type CurrencyAmounts,
  type CurrencyCode,
  type Paginated,
} from '@erp/shared';
import { audit } from '../../common/audit';
import { nextDocumentNumber } from '../../common/document-number';
import { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { toAuditJson } from '../inventory/prisma-errors';
import { refreshLastPurchaseCost } from '../purchasing/last-purchase-cost';
import { agingBucket, computeBill, daysOverdue, defaultDueDate, isOpen } from './bill-rules';
import {
  BillableQueryDto,
  CancelBillDto,
  CreateBillDto,
  ListBillsQueryDto,
  UpdateBillDto,
} from './dto/bill.dto';

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const TYPE = 'SUPPLIER_BILL' as const;
const OPEN_STATUSES: BillStatus[] = ['POSTED', 'PARTIALLY_PAID'];

const toDay = (d: Date) => d.toISOString().slice(0, 10);
const today = () => toDay(new Date());
const asDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
/** "12.5000" → "12.5" in messages */
const trim = (d: Prisma.Decimal | string) => D(d).toString();

const LIST_INCLUDE = {
  supplier: { select: { id: true, code: true, name: true } },
  purchaseOrder: { select: { id: true, number: true } },
} satisfies Prisma.InvoiceInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  createdBy: { select: { id: true, fullName: true } },
  lines: {
    orderBy: { lineNo: 'asc' },
    include: {
      product: {
        select: { id: true, sku: true, name: true, baseUnit: { select: { code: true } } },
      },
      goodsReceiptLine: {
        select: {
          id: true,
          quantity: true,
          billedQty: true,
          unitPrice: true,
          unit: { select: { id: true, code: true } },
          goodsReceipt: {
            select: {
              id: true,
              number: true,
              receivedAt: true,
              purchaseOrder: { select: { id: true, number: true } },
            },
          },
        },
      },
    },
  },
  allocations: {
    orderBy: { payment: { paidAt: 'asc' } },
    include: {
      payment: { select: { id: true, number: true, paidAt: true, method: true } },
    },
  },
} satisfies Prisma.InvoiceInclude;

type ListRow = Prisma.InvoiceGetPayload<{ include: typeof LIST_INCLUDE }>;
type DetailRow = Prisma.InvoiceGetPayload<{ include: typeof DETAIL_INCLUDE }>;

@Injectable()
export class BillsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListBillsQueryDto): Promise<Paginated<BillListItem>> {
    const where = billWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy:
          query.status === 'open' || query.status === 'overdue'
            ? [{ dueDate: { sort: 'asc', nulls: 'last' } }, { issueDate: 'asc' }]
            : [{ issueDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    const day = today();
    return {
      items: rows.map((r) => toListItem(r, day)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Rows of the Excel export (same filters as the list, at most 5000). */
  async exportRows(query: Omit<ListBillsQueryDto, 'page' | 'pageSize'>): Promise<BillListItem[]> {
    const rows = await this.prisma.invoice.findMany({
      where: billWhere(query),
      include: LIST_INCLUDE,
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      take: 5000,
    });
    const day = today();
    return rows.map((r) => toListItem(r, day));
  }

  /** Counters and balances of the bills screen; amounts are kept per currency. */
  async summary(): Promise<BillSummary> {
    const day = today();
    const monthStart = asDate(`${day.slice(0, 7)}-01`);
    const [drafts, open, paid] = await Promise.all([
      this.prisma.invoice.count({ where: { type: TYPE, status: 'DRAFT' } }),
      this.prisma.invoice.findMany({
        where: { type: TYPE, status: { in: OPEN_STATUSES } },
        select: { total: true, amountPaid: true, currency: true, dueDate: true },
      }),
      this.prisma.payment.groupBy({
        by: ['currency'],
        where: { direction: 'OUT', paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);
    const add = (acc: Record<string, Prisma.Decimal>, cur: string, v: Prisma.Decimal) => {
      acc[cur] = (acc[cur] ?? D(0)).plus(v);
    };
    const fmt = (acc: Record<string, Prisma.Decimal>): CurrencyAmounts =>
      Object.fromEntries(
        Object.entries(acc).map(([cur, v]) => [
          cur,
          v.toFixed(isCurrency(cur) ? CURRENCY_DECIMALS[cur] : 3),
        ]),
      );
    const openBalance: Record<string, Prisma.Decimal> = {};
    const overdueBalance: Record<string, Prisma.Decimal> = {};
    const buckets = Object.fromEntries(
      AGING_BUCKETS.map((b) => [b, { count: 0, balance: {} as Record<string, Prisma.Decimal> }]),
    );
    let overdue = 0;
    for (const b of open) {
      const balance = b.total.minus(b.amountPaid);
      add(openBalance, b.currency, balance);
      const days = daysOverdue(b.dueDate ? toDay(b.dueDate) : null, day);
      if (days > 0) {
        overdue += 1;
        add(overdueBalance, b.currency, balance);
      }
      const bucket = buckets[agingBucket(days)];
      bucket.count += 1;
      add(bucket.balance, b.currency, balance);
    }
    const paidThisMonth: Record<string, Prisma.Decimal> = {};
    for (const p of paid) add(paidThisMonth, p.currency, p._sum.amount ?? D(0));
    return {
      drafts,
      open: open.length,
      openBalance: fmt(openBalance),
      overdue,
      overdueBalance: fmt(overdueBalance),
      paidThisMonth: fmt(paidThisMonth),
      aging: AGING_BUCKETS.map((bucket) => ({
        bucket,
        count: buckets[bucket].count,
        balance: fmt(buckets[bucket].balance),
      })),
    };
  }

  async lookups(): Promise<BillLookups> {
    const [settings, taxRates] = await Promise.all([
      this.prisma.companySettings.findUnique({ where: { id: 1 }, select: { currency: true } }),
      this.prisma.taxRate.findMany({
        where: { isActive: true },
        orderBy: { rate: 'desc' },
        select: { id: true, name: true, rate: true },
      }),
    ]);
    const currency = settings?.currency;
    return {
      companyCurrency: isCurrency(currency) ? currency : 'TND',
      taxRates: taxRates.map((t) => ({ id: t.id, name: t.name, rate: t.rate.toFixed(2) })),
    };
  }

  /** Posted receipts of a supplier with quantities not on a posted bill yet. */
  async billable(query: BillableQueryDto): Promise<BillableReceipt[]> {
    const receipts = await this.prisma.goodsReceipt.findMany({
      where: {
        status: 'POSTED',
        supplierId: query.supplierId,
        ...(query.purchaseOrderId && { purchaseOrderId: query.purchaseOrderId }),
      },
      orderBy: [{ receivedAt: 'asc' }, { number: 'asc' }],
      include: {
        purchaseOrder: { select: { id: true, number: true } },
        lines: {
          orderBy: { lineNo: 'asc' },
          include: {
            product: {
              select: { id: true, sku: true, name: true, taxRate: { select: { rate: true } } },
            },
            unit: { select: { id: true, code: true } },
          },
        },
      },
    });
    return receipts
      .map((r) => ({
        id: r.id,
        number: r.number,
        receivedAt: r.receivedAt.toISOString(),
        purchaseOrder: r.purchaseOrder,
        supplierInvoiceNumber: r.supplierInvoiceNumber,
        supplierInvoiceDate: r.supplierInvoiceDate ? toDay(r.supplierInvoiceDate) : null,
        lines: r.lines
          .filter((l) => l.quantity.gt(l.billedQty))
          .map((l) => ({
            goodsReceiptLineId: l.id,
            receipt: { id: r.id, number: r.number, receivedAt: r.receivedAt.toISOString() },
            purchaseOrder: r.purchaseOrder,
            product: { id: l.product.id, sku: l.product.sku, name: l.product.name },
            unit: l.unit,
            receivedQty: l.quantity.toFixed(4),
            billedQty: l.billedQty.toFixed(4),
            toBill: l.quantity.minus(l.billedQty).toFixed(4),
            unitPrice: l.unitPrice.toFixed(4),
            taxRate: (l.product.taxRate?.rate ?? D(0)).toFixed(2),
          })),
      }))
      .filter((r) => r.lines.length > 0);
  }

  async get(id: string): Promise<BillDetail> {
    const row = await this.prisma.invoice.findFirst({
      where: { id, type: TYPE },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw new NotFoundException('Supplier bill not found');
    const settings = await this.prisma.companySettings.findUnique({
      where: { id: 1 },
      select: { currency: true },
    });
    return toDetail(row, today(), settings?.currency ?? 'TND');
  }

  /** Saves a draft bill (nothing is posted yet). */
  async create(dto: CreateBillDto, user: RequestUser): Promise<BillDetail> {
    const id = await this.prisma.$transaction(async (tx) => {
      const data = await prepareBill(tx, dto);
      const bill = await tx.invoice.create({
        data: {
          number: `DRAFT-BILL-${randomUUID().slice(0, 8).toUpperCase()}`,
          type: TYPE,
          status: 'DRAFT',
          createdById: user.id,
          ...data.header,
          lines: { createMany: { data: data.lines } },
        },
      });
      await audit(
        tx,
        user,
        'create',
        'Invoice',
        bill.id,
        null,
        toAuditJson({ type: TYPE, ...data.audit }) as Prisma.InputJsonObject,
      );
      return bill.id;
    });
    return this.get(id);
  }

  /** Replaces a draft's header and lines. */
  async update(id: string, dto: UpdateBillDto, user: RequestUser): Promise<BillDetail> {
    await this.prisma.$transaction(async (tx) => {
      const bill = await lockBill(tx, id);
      if (bill.status !== 'DRAFT') {
        throw new ConflictException(`${bill.number} is posted: it cannot be changed any more`);
      }
      const data = await prepareBill(tx, dto);
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.update({
        where: { id },
        data: { ...data.header, lines: { createMany: { data: data.lines } } },
      });
      await audit(
        tx,
        user,
        'update',
        'Invoice',
        id,
        toAuditJson({
          total: bill.total.toString(),
          supplierRef: bill.supplierRef,
        }) as Prisma.InputJsonObject,
        toAuditJson(data.audit) as Prisma.InputJsonObject,
      );
    });
    return this.get(id);
  }

  async remove(id: string, user: RequestUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const bill = await lockBill(tx, id);
      if (bill.status !== 'DRAFT') {
        throw new ConflictException(`${bill.number} is posted: cancel it instead of deleting it`);
      }
      await tx.invoice.delete({ where: { id } });
      await audit(tx, user, 'delete', 'Invoice', id, { number: bill.number }, null);
    });
  }

  /**
   * Posts a draft: final number, the received lines count as billed, the bill becomes
   * immutable and the last purchase cost of its products is updated.
   */
  async post(id: string, user: RequestUser): Promise<BillDetail> {
    await this.prisma.$transaction(async (tx) => {
      const bill = await lockBill(tx, id);
      if (bill.status !== 'DRAFT') {
        throw new ConflictException(`${bill.number} is already posted`);
      }
      const full = await tx.invoice.findUniqueOrThrow({
        where: { id },
        include: { lines: true, supplier: { select: { name: true, isActive: true } } },
      });
      const errors: string[] = [];
      if (!full.supplierRef) errors.push("Enter the supplier's bill number before posting");
      if (!full.lines.length) errors.push('Add at least one line');
      if (full.total.lte(0)) errors.push('The total of the bill must be above 0');
      if (full.supplierRef) {
        const duplicate = await tx.invoice.findFirst({
          where: {
            id: { not: id },
            type: TYPE,
            supplierId: full.supplierId,
            status: { notIn: ['DRAFT', 'CANCELLED'] },
            supplierRef: { equals: full.supplierRef, mode: 'insensitive' },
          },
          select: { number: true },
        });
        if (duplicate) {
          errors.push(
            `${full.supplier?.name ?? 'This supplier'}'s bill ${full.supplierRef} is already recorded as ${duplicate.number}`,
          );
        }
      }
      if (errors.length) throw new BadRequestException(errors);

      // The received lines: lock them (stable order) and check nothing was billed twice.
      const receiptLineIds = full.lines
        .map((l) => l.goodsReceiptLineId)
        .filter((v): v is string => Boolean(v))
        .sort();
      if (receiptLineIds.length) {
        await tx.$queryRaw`
          SELECT id FROM goods_receipt_lines
          WHERE id IN (${Prisma.join(receiptLineIds.map((v) => Prisma.sql`${v}::uuid`))})
          ORDER BY id FOR UPDATE`;
        const received = await tx.goodsReceiptLine.findMany({
          where: { id: { in: receiptLineIds } },
          include: {
            goodsReceipt: { select: { number: true, status: true } },
            product: { select: { sku: true } },
          },
        });
        const byId = new Map(received.map((r) => [r.id, r]));
        for (const l of full.lines) {
          if (!l.goodsReceiptLineId) continue;
          const r = byId.get(l.goodsReceiptLineId);
          if (!r || r.goodsReceipt.status !== 'POSTED') {
            errors.push(`Line ${l.lineNo}: its receipt is no longer posted`);
            continue;
          }
          const left = r.quantity.minus(r.billedQty);
          if (l.quantity.gt(left)) {
            errors.push(
              `Line ${l.lineNo} (${r.product.sku}): ${trim(l.quantity)} billed but only ${trim(left)} of ${r.goodsReceipt.number} is left to bill`,
            );
          }
        }
        if (errors.length) throw new BadRequestException(errors);
        for (const l of full.lines) {
          if (!l.goodsReceiptLineId) continue;
          await tx.goodsReceiptLine.update({
            where: { id: l.goodsReceiptLineId },
            data: { billedQty: { increment: l.quantity } },
          });
        }
      }

      const number = await nextDocumentNumber(tx, 'SUPPLIER_BILL', full.issueDate);
      await tx.invoice.update({
        where: { id },
        data: { number, status: 'POSTED', postedAt: new Date() },
      });
      const productIds = full.lines.map((l) => l.productId).filter((v): v is string => Boolean(v));
      const lastCost = await refreshLastPurchaseCost(tx, productIds);
      await audit(
        tx,
        user,
        'post',
        'Invoice',
        id,
        { status: 'DRAFT', number: full.number },
        toAuditJson({
          status: 'POSTED',
          number,
          supplierRef: full.supplierRef,
          total: full.total.toString(),
          currency: full.currency,
          lastPurchaseCost: lastCost,
        }) as Prisma.InputJsonObject,
      );
    });
    return this.get(id);
  }

  /** Cancels a posted bill with no payment: its received lines can be billed again. */
  async cancel(id: string, dto: CancelBillDto, user: RequestUser): Promise<BillDetail> {
    await this.prisma.$transaction(async (tx) => {
      const bill = await lockBill(tx, id);
      if (bill.status === 'DRAFT') {
        throw new ConflictException(`${bill.number} is a draft: delete it instead`);
      }
      if (bill.status === 'CANCELLED') {
        throw new ConflictException(`${bill.number} is already cancelled`);
      }
      if (bill.amountPaid.gt(0)) {
        throw new ConflictException(
          `${bill.number} has payments: it cannot be cancelled (a supplier credit note is needed)`,
        );
      }
      const lines = await tx.invoiceLine.findMany({ where: { invoiceId: id } });
      const receiptLineIds = lines
        .map((l) => l.goodsReceiptLineId)
        .filter((v): v is string => Boolean(v))
        .sort();
      if (receiptLineIds.length) {
        await tx.$queryRaw`
          SELECT id FROM goods_receipt_lines
          WHERE id IN (${Prisma.join(receiptLineIds.map((v) => Prisma.sql`${v}::uuid`))})
          ORDER BY id FOR UPDATE`;
        for (const l of lines) {
          if (!l.goodsReceiptLineId) continue;
          await tx.goodsReceiptLine.update({
            where: { id: l.goodsReceiptLineId },
            data: { billedQty: { decrement: l.quantity } },
          });
        }
      }
      await tx.invoice.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: dto.reason },
      });
      const lastCost = await refreshLastPurchaseCost(
        tx,
        lines.map((l) => l.productId).filter((v): v is string => Boolean(v)),
      );
      await audit(
        tx,
        user,
        'cancel',
        'Invoice',
        id,
        { status: bill.status },
        toAuditJson({
          status: 'CANCELLED',
          reason: dto.reason,
          lastPurchaseCost: lastCost,
        }) as Prisma.InputJsonObject,
      );
    });
    return this.get(id);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** The list filters, shared by the list and the Excel export. */
export function billWhere(
  query: Pick<ListBillsQueryDto, 'status' | 'search' | 'supplierId' | 'currency' | 'from' | 'to'>,
): Prisma.InvoiceWhereInput {
  const issueDate: Prisma.DateTimeFilter = {};
  if (query.from) issueDate.gte = asDate(query.from);
  if (query.to) issueDate.lte = asDate(query.to);
  const contains = (v: string) => ({ contains: v, mode: 'insensitive' as const });
  const status: Prisma.InvoiceWhereInput =
    query.status === 'all'
      ? {}
      : query.status === 'open'
        ? { status: { in: OPEN_STATUSES } }
        : query.status === 'overdue'
          ? { status: { in: OPEN_STATUSES }, dueDate: { lt: asDate(today()) } }
          : { status: query.status };
  return {
    type: TYPE,
    ...status,
    ...((query.from || query.to) && { issueDate }),
    ...(query.supplierId && { supplierId: query.supplierId }),
    ...(query.currency && { currency: query.currency }),
    ...(query.search && {
      OR: [
        { number: contains(query.search) },
        { supplierRef: contains(query.search) },
        { supplier: { name: contains(query.search) } },
        { supplier: { code: contains(query.search) } },
        { purchaseOrder: { number: contains(query.search) } },
      ],
    }),
  };
}

async function lockBill(tx: Tx, id: string) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM invoices WHERE id = ${id}::uuid AND type = 'SUPPLIER_BILL' FOR UPDATE`;
  if (!locked.length) throw new NotFoundException('Supplier bill not found');
  return tx.invoice.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      amountPaid: true,
      supplierRef: true,
    },
  });
}

/**
 * Checks a draft body and computes every amount: supplier, dates, currency, tax rates,
 * received lines (posted, this supplier, not billed twice) and free lines.
 */
async function prepareBill(tx: Tx, dto: CreateBillDto) {
  const errors: string[] = [];
  const day = today();
  const issueDate = dto.issueDate ?? day;
  if (issueDate > day) errors.push('The bill date cannot be in the future');

  const supplier = await tx.supplier.findUnique({
    where: { id: dto.supplierId },
    select: { id: true, name: true, isActive: true, paymentTermDays: true },
  });
  if (!supplier) throw new BadRequestException('Supplier not found');
  if (!supplier.isActive) errors.push(`${supplier.name} is inactive`);

  const dueDate = dto.dueDate ?? defaultDueDate(issueDate, supplier.paymentTermDays);
  if (dueDate < issueDate) errors.push('The due date cannot be before the bill date');

  const currency = dto.currency;
  const decimals = CURRENCY_DECIMALS[currency];
  const discountType = dto.discountType ?? null;
  const discountValue = D(discountType ? (dto.discountValue ?? '0') : '0');
  if (discountType === 'PERCENT' && discountValue.gt(100)) {
    errors.push('The bill discount cannot be above 100 %');
  }
  if (discountType === 'AMOUNT' && discountValue.decimalPlaces() > decimals) {
    errors.push(`${currency} amounts have at most ${decimals} decimals`);
  }

  // Tax rates
  const taxIds = [...new Set(dto.lines.map((l) => l.taxRateId).filter((v): v is string => !!v))];
  const taxRates = new Map(
    (await tx.taxRate.findMany({ where: { id: { in: taxIds } } })).map((t) => [t.id, t]),
  );
  // Received lines
  const receiptLineIds = dto.lines
    .map((l) => l.goodsReceiptLineId)
    .filter((v): v is string => Boolean(v));
  const receiptLines = new Map(
    (
      await tx.goodsReceiptLine.findMany({
        where: { id: { in: receiptLineIds } },
        include: {
          goodsReceipt: {
            select: {
              number: true,
              status: true,
              supplierId: true,
              purchaseOrderId: true,
            },
          },
          product: { select: { name: true } },
        },
      })
    ).map((r) => [r.id, r]),
  );
  // Free lines with a product
  const productIds = [
    ...new Set(
      dto.lines
        .filter((l) => !l.goodsReceiptLineId && l.productId)
        .map((l) => l.productId as string),
    ),
  ];
  const products = new Set(
    (await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true } })).map(
      (p) => p.id,
    ),
  );

  const seen = new Set<string>();
  const orders = new Set<string>();
  const prepared = dto.lines.map((l, i) => {
    const n = i + 1;
    const qty = D(l.quantity);
    if (qty.lte(0)) errors.push(`Line ${n}: the quantity must be above 0`);
    if (l.taxRateId && !taxRates.has(l.taxRateId)) errors.push(`Line ${n}: unknown tax rate`);
    let productId: string | null = null;
    if (l.goodsReceiptLineId) {
      const r = receiptLines.get(l.goodsReceiptLineId);
      if (!r) {
        errors.push(`Line ${n}: received line not found`);
      } else {
        productId = r.productId;
        if (seen.has(r.id)) errors.push(`Line ${n}: this received line is on the bill twice`);
        seen.add(r.id);
        if (r.goodsReceipt.status !== 'POSTED') {
          errors.push(`Line ${n}: ${r.goodsReceipt.number} is not posted`);
        }
        if (r.goodsReceipt.supplierId !== dto.supplierId) {
          errors.push(`Line ${n}: ${r.goodsReceipt.number} is from another supplier`);
        }
        if (r.goodsReceipt.purchaseOrderId) orders.add(r.goodsReceipt.purchaseOrderId);
        const left = r.quantity.minus(r.billedQty);
        if (qty.gt(left)) {
          errors.push(
            `Line ${n} (${r.product.name}): ${trim(qty)} is more than the ${trim(left)} received and not billed yet on ${r.goodsReceipt.number}`,
          );
        }
      }
    } else if (l.productId) {
      if (!products.has(l.productId)) errors.push(`Line ${n}: product not found`);
      productId = l.productId;
    }
    return {
      lineNo: n,
      productId,
      goodsReceiptLineId: l.goodsReceiptLineId ?? null,
      description: l.description,
      quantity: qty,
      unitPrice: D(l.unitPrice),
      discountPct: D(l.discountPct ?? '0'),
      taxRateId: l.taxRateId ?? null,
      taxRate: l.taxRateId ? (taxRates.get(l.taxRateId)?.rate ?? D(0)) : D(0),
    };
  });
  if (errors.length) throw new BadRequestException([...new Set(errors)]);

  const calc = computeBill(
    prepared.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      taxRate: l.taxRate,
    })),
    { type: discountType, value: discountValue },
    currency,
  );
  const purchaseOrderId = orders.size === 1 ? [...orders][0] : null;
  return {
    header: {
      supplierId: supplier.id,
      supplierRef: dto.supplierRef ?? null,
      purchaseOrderId,
      issueDate: asDate(issueDate),
      dueDate: asDate(dueDate),
      currency,
      discountType,
      discountValue,
      subtotal: calc.subtotal,
      discountTotal: calc.discountTotal,
      taxTotal: calc.taxTotal,
      total: calc.total,
      notes: dto.notes ?? null,
    },
    lines: prepared.map((l, i) => ({
      lineNo: l.lineNo,
      productId: l.productId,
      goodsReceiptLineId: l.goodsReceiptLineId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      taxRateId: l.taxRateId,
      taxRate: l.taxRate,
      lineSubtotal: calc.lines[i].subtotal,
      lineTax: calc.lines[i].tax,
      lineTotal: calc.lines[i].total,
    })),
    audit: {
      supplierRef: dto.supplierRef ?? null,
      currency,
      issueDate,
      dueDate,
      total: calc.total.toString(),
      lines: prepared.length,
    },
  };
}

function money(v: Prisma.Decimal, currency: string) {
  return v.toFixed(isCurrency(currency) ? CURRENCY_DECIMALS[currency] : 3);
}

function toListItem(r: ListRow, day: string): BillListItem {
  const currency = (isCurrency(r.currency) ? r.currency : 'TND') as CurrencyCode;
  const status = r.status as BillStatus;
  const open = isOpen(status);
  const due = r.dueDate ? toDay(r.dueDate) : null;
  const days = open ? daysOverdue(due, day) : 0;
  return {
    id: r.id,
    number: r.number,
    status,
    supplier: r.supplier ?? { id: '', code: '', name: '—' },
    supplierRef: r.supplierRef,
    purchaseOrder: r.purchaseOrder,
    issueDate: toDay(r.issueDate),
    dueDate: due,
    currency,
    total: money(r.total, currency),
    amountPaid: money(r.amountPaid, currency),
    balance: money(open ? r.total.minus(r.amountPaid) : D(0), currency),
    overdue: days > 0,
    daysOverdue: days,
  };
}

function toDetail(r: DetailRow, day: string, companyCurrency: string): BillDetail {
  const base = toListItem(r, day);
  const c = base.currency;
  const posted = r.status !== 'DRAFT' && r.status !== 'CANCELLED';
  const warnings: BillWarning[] = [];
  const receipts = new Map<string, { id: string; number: string; receivedAt: string }>();
  const lines = r.lines.map((l) => {
    const rl = l.goodsReceiptLine;
    let receiptLine: BillDetail['lines'][number]['receiptLine'] = null;
    if (rl) {
      const billedElsewhere = posted ? rl.billedQty.minus(l.quantity) : rl.billedQty;
      const gr = rl.goodsReceipt;
      receipts.set(gr.id, {
        id: gr.id,
        number: gr.number,
        receivedAt: gr.receivedAt.toISOString(),
      });
      receiptLine = {
        id: rl.id,
        receipt: { id: gr.id, number: gr.number },
        purchaseOrder: gr.purchaseOrder,
        unit: rl.unit,
        receivedQty: rl.quantity.toFixed(4),
        billedElsewhere: billedElsewhere.toFixed(4),
        receiptPrice: rl.unitPrice.toFixed(4),
      };
      // Receipt prices are in the company currency: compare only bills in it.
      const net = l.unitPrice.mul(D(100).minus(l.discountPct)).div(100).toDecimalPlaces(4);
      if (r.currency === companyCurrency && !net.eq(rl.unitPrice)) {
        warnings.push({
          lineNo: l.lineNo,
          kind: 'price',
          billed: trim(net),
          expected: trim(rl.unitPrice),
          receiptNumber: gr.number,
          message: `Line ${l.lineNo}: net price ${trim(net)} differs from the price ${trim(rl.unitPrice)} on ${gr.number}`,
        });
      }
      if (l.quantity.gt(rl.quantity.minus(billedElsewhere))) {
        warnings.push({
          lineNo: l.lineNo,
          kind: 'quantity',
          billed: trim(l.quantity),
          expected: trim(rl.quantity.minus(billedElsewhere)),
          receiptNumber: gr.number,
          message: `Line ${l.lineNo}: ${trim(l.quantity)} billed but only ${trim(rl.quantity.minus(billedElsewhere))} received and not billed elsewhere`,
        });
      }
    }
    return {
      id: l.id,
      lineNo: l.lineNo,
      product: l.product
        ? {
            id: l.product.id,
            sku: l.product.sku,
            name: l.product.name,
            baseUnitCode: l.product.baseUnit.code,
          }
        : null,
      description: l.description,
      quantity: l.quantity.toFixed(4),
      unitPrice: l.unitPrice.toFixed(4),
      discountPct: l.discountPct.toFixed(2),
      taxRateId: l.taxRateId,
      taxRate: l.taxRate.toFixed(2),
      lineSubtotal: money(l.lineSubtotal, c),
      lineTax: money(l.lineTax, c),
      lineTotal: money(l.lineTotal, c),
      receiptLine,
    };
  });
  return {
    ...base,
    discountType: r.discountType,
    discountValue: r.discountValue.toString(),
    subtotal: money(r.subtotal, c),
    discountTotal: money(r.discountTotal, c),
    taxTotal: money(r.taxTotal, c),
    notes: r.notes,
    postedAt: r.postedAt?.toISOString() ?? null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelReason: r.cancelReason,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    lines,
    payments: r.allocations.map((a) => ({
      paymentId: a.payment.id,
      number: a.payment.number,
      paidAt: toDay(a.payment.paidAt),
      method: a.payment.method,
      amount: money(a.amount, c),
    })),
    warnings,
    receipts: [...receipts.values()],
  };
}
