import { Prisma } from '@prisma/client';
import { CURRENCY_DECIMALS, type BillStatus, type CurrencyCode } from '@erp/shared';

type Num = Prisma.Decimal | string | number;
const D = (v: Num) => new Prisma.Decimal(v);

/** Rounds half up to the currency's smallest unit (millime for TND, cent for EUR / USD). */
export function roundMoney(v: Num, currency: CurrencyCode): Prisma.Decimal {
  return D(v).toDecimalPlaces(CURRENCY_DECIMALS[currency], Prisma.Decimal.ROUND_HALF_UP);
}

export interface BillLineCalcInput {
  quantity: Num;
  unitPrice: Num;
  discountPct: Num;
  taxRate: Num;
}

export interface BillLineCalc {
  /** quantity × unit price */
  gross: Prisma.Decimal;
  /** gross × line discount % */
  lineDiscount: Prisma.Decimal;
  /** This line's share of the bill discount */
  billDiscount: Prisma.Decimal;
  /** gross − both discounts: the taxable base */
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
}

export interface BillCalc {
  lines: BillLineCalc[];
  /** Σ gross */
  subtotal: Prisma.Decimal;
  /** Σ line discounts + bill discount */
  discountTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
}

/**
 * Amounts of a supplier bill. Every part is rounded to the currency on its own, so the
 * totals are exact sums of what is printed on the lines:
 *   total = subtotal − discountTotal + taxTotal
 *
 * The bill discount (a % or an amount) is spread over the lines in proportion to their
 * net amount, so the VAT is computed on what is really paid. Any rounding remainder
 * goes to the largest line.
 */
export function computeBill(
  lines: BillLineCalcInput[],
  discount: { type: 'PERCENT' | 'AMOUNT' | null; value: Num },
  currency: CurrencyCode,
): BillCalc {
  const r = (v: Prisma.Decimal) => roundMoney(v, currency);
  const base = lines.map((l) => {
    const gross = r(D(l.quantity).mul(D(l.unitPrice)));
    const lineDiscount = r(gross.mul(D(l.discountPct)).div(100));
    return { gross, lineDiscount, net: gross.minus(lineDiscount), taxRate: D(l.taxRate) };
  });
  const netTotal = base.reduce((s, l) => s.plus(l.net), D(0));

  let billDiscount = D(0);
  if (discount.type === 'PERCENT') billDiscount = r(netTotal.mul(D(discount.value)).div(100));
  if (discount.type === 'AMOUNT') billDiscount = r(D(discount.value));
  if (billDiscount.gt(netTotal)) billDiscount = netTotal;

  // Spread the bill discount, remainder on the largest line.
  const shares = base.map((l) =>
    netTotal.gt(0) ? r(billDiscount.mul(l.net).div(netTotal)) : D(0),
  );
  const remainder = billDiscount.minus(shares.reduce((s, v) => s.plus(v), D(0)));
  if (!remainder.isZero() && base.length) {
    let largest = 0;
    base.forEach((l, i) => {
      if (l.net.gt(base[largest].net)) largest = i;
    });
    shares[largest] = shares[largest].plus(remainder);
  }

  const out = base.map((l, i) => {
    const subtotal = l.net.minus(shares[i]);
    const tax = r(subtotal.mul(l.taxRate).div(100));
    return {
      gross: l.gross,
      lineDiscount: l.lineDiscount,
      billDiscount: shares[i],
      subtotal,
      tax,
      total: subtotal.plus(tax),
    };
  });
  const subtotal = out.reduce((s, l) => s.plus(l.gross), D(0));
  const discountTotal = out.reduce((s, l) => s.plus(l.lineDiscount).plus(l.billDiscount), D(0));
  const taxTotal = out.reduce((s, l) => s.plus(l.tax), D(0));
  return {
    lines: out,
    subtotal,
    discountTotal,
    taxTotal,
    total: subtotal.minus(discountTotal).plus(taxTotal),
  };
}

/** Due date = issue date + the supplier's payment terms (days), as YYYY-MM-DD. */
export function defaultDueDate(issueDate: string, paymentTermDays: number): string {
  const d = new Date(`${issueDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + paymentTermDays);
  return d.toISOString().slice(0, 10);
}

/** Status once the paid amount changes. */
export function statusAfterPayment(total: Num, amountPaid: Num): BillStatus {
  const paid = D(amountPaid);
  if (paid.lte(0)) return 'POSTED';
  return paid.gte(D(total)) ? 'PAID' : 'PARTIALLY_PAID';
}

/** Something is still to pay on it. */
export const isOpen = (status: BillStatus) => status === 'POSTED' || status === 'PARTIALLY_PAID';

/** Days past the due date (0 when not due yet), `today` as YYYY-MM-DD. */
export function daysOverdue(dueDate: string | null, today: string): number {
  if (!dueDate || dueDate >= today) return 0;
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function agingBucket(days: number): 'current' | '1-30' | '31-60' | '61-90' | '90+' {
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}
