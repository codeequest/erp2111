import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CURRENCY_DECIMALS,
  isCurrency,
  type BillStatus,
  type CurrencyCode,
  type Paginated,
  type PaymentDetail,
  type PaymentListItem,
} from '@erp/shared';
import { audit } from '../../common/audit';
import { nextDocumentNumber } from '../../common/document-number';
import { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { toAuditJson } from '../inventory/prisma-errors';
import { isOpen, statusAfterPayment } from './bill-rules';
import { CreatePaymentDto, ListPaymentsQueryDto } from './dto/bill.dto';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const toDay = (d: Date) => d.toISOString().slice(0, 10);

const INCLUDE = {
  supplier: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  allocations: {
    include: { invoice: { select: { id: true, number: true } } },
    orderBy: { invoice: { number: 'asc' } },
  },
} satisfies Prisma.PaymentInclude;

type Row = Prisma.PaymentGetPayload<{ include: typeof INCLUDE }>;

/** Supplier payments (money out), split over one or more open bills. */
@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPaymentsQueryDto): Promise<Paginated<PaymentListItem>> {
    const contains = (v: string) => ({ contains: v, mode: 'insensitive' as const });
    const where: Prisma.PaymentWhereInput = {
      ...(query.supplierId && { supplierId: query.supplierId }),
      ...(query.method && { method: query.method }),
      ...(query.invoiceId && { allocations: { some: { invoiceId: query.invoiceId } } }),
      ...(query.search && {
        OR: [
          { number: contains(query.search) },
          { reference: contains(query.search) },
          { supplier: { name: contains(query.search) } },
          { supplier: { code: contains(query.search) } },
        ],
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { items: rows.map(toItem), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<PaymentDetail> {
    const row = await this.prisma.payment.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new NotFoundException('Payment not found');
    return { ...toItem(row), notes: row.notes, createdAt: row.createdAt.toISOString() };
  }

  /**
   * Records a payment to a supplier. Every allocation must be on an open bill of that
   * supplier, in the payment's currency, and not above what is left to pay; the
   * allocations add up to the amount paid.
   */
  async create(dto: CreatePaymentDto, user: RequestUser): Promise<PaymentDetail> {
    const errors: string[] = [];
    const day = toDay(new Date());
    const paidAt = dto.paidAt ?? day;
    if (paidAt > day) errors.push('The payment date cannot be in the future');
    const currency = dto.currency;
    const decimals = CURRENCY_DECIMALS[currency];
    const amount = D(dto.amount);
    if (amount.lte(0)) errors.push('The amount must be above 0');
    if (amount.decimalPlaces() > decimals) {
      errors.push(`${currency} amounts have at most ${decimals} decimals`);
    }
    const ids = dto.allocations.map((a) => a.invoiceId);
    if (new Set(ids).size !== ids.length)
      errors.push('Each bill can be paid only once per payment');
    const allocated = dto.allocations.reduce((s, a) => s.plus(D(a.amount)), D(0));
    if (!allocated.eq(amount)) {
      errors.push(
        `The amounts on the bills (${allocated.toFixed(decimals)}) must add up to the payment (${amount.toFixed(decimals)})`,
      );
    }
    for (const a of dto.allocations) {
      if (D(a.amount).lte(0)) errors.push('Every amount on a bill must be above 0');
      if (D(a.amount).decimalPlaces() > decimals) {
        errors.push(`${currency} amounts have at most ${decimals} decimals`);
      }
    }
    if (errors.length) throw new BadRequestException([...new Set(errors)]);

    const id = await this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id: dto.supplierId },
        select: { id: true, name: true },
      });
      if (!supplier) throw new BadRequestException('Supplier not found');

      // Lock the bills in a stable order.
      const sorted = [...ids].sort();
      await tx.$queryRaw`
        SELECT id FROM invoices
        WHERE id IN (${Prisma.join(sorted.map((v) => Prisma.sql`${v}::uuid`))})
        ORDER BY id FOR UPDATE`;
      const bills = new Map(
        (await tx.invoice.findMany({ where: { id: { in: ids } } })).map((b) => [b.id, b]),
      );
      for (const a of dto.allocations) {
        const b = bills.get(a.invoiceId);
        if (!b || b.type !== 'SUPPLIER_BILL') {
          errors.push('A bill was not found');
          continue;
        }
        if (b.supplierId !== supplier.id) errors.push(`${b.number} is from another supplier`);
        if (!isOpen(b.status as BillStatus)) {
          errors.push(`${b.number} is ${b.status.toLowerCase().replace('_', ' ')}: nothing to pay`);
          continue;
        }
        if (b.currency !== currency) {
          errors.push(`${b.number} is in ${b.currency}, the payment in ${currency}`);
        }
        const left = b.total.minus(b.amountPaid);
        if (D(a.amount).gt(left)) {
          errors.push(
            `${b.number}: ${D(a.amount).toFixed(decimals)} is more than the ${left.toFixed(decimals)} ${b.currency} left to pay`,
          );
        }
      }
      if (errors.length) throw new BadRequestException([...new Set(errors)]);

      const number = await nextDocumentNumber(tx, 'PAYMENT_OUT', new Date(`${paidAt}T00:00:00Z`));
      const payment = await tx.payment.create({
        data: {
          number,
          direction: 'OUT',
          method: dto.method,
          amount,
          currency,
          paidAt: new Date(`${paidAt}T00:00:00.000Z`),
          supplierId: supplier.id,
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          createdById: user.id,
          allocations: {
            createMany: {
              data: dto.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: D(a.amount) })),
            },
          },
        },
      });
      const changes: Record<string, { status: string; amountPaid: string }> = {};
      for (const a of dto.allocations) {
        const b = bills.get(a.invoiceId)!;
        const paid = b.amountPaid.plus(D(a.amount));
        const status = statusAfterPayment(b.total, paid);
        await tx.invoice.update({ where: { id: b.id }, data: { amountPaid: paid, status } });
        changes[b.number] = { status, amountPaid: paid.toFixed(decimals) };
      }
      await audit(
        tx,
        user,
        'create',
        'Payment',
        payment.id,
        null,
        toAuditJson({
          number,
          direction: 'OUT',
          supplier: supplier.name,
          amount: amount.toFixed(decimals),
          currency,
          method: dto.method,
          bills: changes,
        }) as Prisma.InputJsonObject,
      );
      return payment.id;
    });
    return this.get(id);
  }
}

function toItem(r: Row): PaymentListItem {
  const currency = (isCurrency(r.currency) ? r.currency : 'TND') as CurrencyCode;
  const decimals = CURRENCY_DECIMALS[currency];
  return {
    id: r.id,
    number: r.number,
    direction: r.direction,
    method: r.method,
    amount: r.amount.toFixed(decimals),
    currency,
    paidAt: toDay(r.paidAt),
    supplier: r.supplier,
    reference: r.reference,
    allocations: r.allocations.map((a) => ({
      invoiceId: a.invoice.id,
      number: a.invoice.number,
      amount: a.amount.toFixed(decimals),
    })),
    createdBy: r.createdBy,
  };
}
