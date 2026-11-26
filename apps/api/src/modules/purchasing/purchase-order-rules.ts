import { Prisma } from '@prisma/client';
import type { PurchaseOrderStatus } from '@erp/shared';

type Num = Prisma.Decimal | string | number;
const D = (v: Num) => new Prisma.Decimal(v);
/** Tunisian dinar: 1 TND = 1000 millimes, so amounts are kept to 3 decimals. */
export const MONEY_DECIMALS = 3;
const millimes = (v: Prisma.Decimal) =>
  v.toDecimalPlaces(MONEY_DECIMALS, Prisma.Decimal.ROUND_HALF_UP);

export interface LineAmounts {
  /** quantity × unit price, rounded to the millime */
  gross: Prisma.Decimal;
  /** gross × discount %, rounded to the millime */
  discount: Prisma.Decimal;
  /** gross − discount: stored as the line total */
  net: Prisma.Decimal;
  /** net × tax %, rounded to the millime */
  tax: Prisma.Decimal;
}

/**
 * Amounts of one order line. Each part is rounded to the millime on its own, so the
 * document totals are exact sums of what is shown on the lines:
 *   total = Σ gross − Σ discount + Σ tax
 */
export function lineAmounts(
  quantity: Num,
  unitPrice: Num,
  discountPct: Num,
  taxRate: Num,
): LineAmounts {
  const gross = millimes(D(quantity).mul(D(unitPrice)));
  const discount = millimes(gross.mul(D(discountPct)).div(100));
  const net = gross.minus(discount);
  const tax = millimes(net.mul(D(taxRate)).div(100));
  return { gross, discount, net, tax };
}

export interface OrderTotals {
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
}

export function orderTotals(lines: LineAmounts[]): OrderTotals {
  const zero = D(0);
  const subtotal = lines.reduce((s, l) => s.plus(l.gross), zero);
  const discountTotal = lines.reduce((s, l) => s.plus(l.discount), zero);
  const taxTotal = lines.reduce((s, l) => s.plus(l.tax), zero);
  return { subtotal, discountTotal, taxTotal, total: subtotal.minus(discountTotal).plus(taxTotal) };
}

/** Only drafts can be edited. */
export const canEdit = (status: PurchaseOrderStatus) => status === 'DRAFT';

/** Only drafts can be confirmed. */
export const canConfirm = (status: PurchaseOrderStatus) => status === 'DRAFT';

/**
 * Drafts and confirmed orders can be cancelled, as long as nothing was received:
 * once goods are in, the order must be completed instead (v1 has no "close short").
 */
export function canCancel(status: PurchaseOrderStatus, anythingReceived: boolean): boolean {
  if (status === 'DRAFT') return true;
  return status === 'CONFIRMED' && !anythingReceived;
}

/** Next automatic supplier code, given the highest number among existing SUP-<digits> codes. */
export function nextSupplierCode(highestNumber: number | null): string {
  return `SUP-${String((highestNumber ?? 0) + 1).padStart(5, '0')}`;
}

/** A @db.Date column as YYYY-MM-DD. */
export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Goods receipts ───────────────────────────────────────────────────────────

/** Goods can be received on confirmed orders until everything is in. */
export const canReceive = (status: PurchaseOrderStatus) =>
  status === 'CONFIRMED' || status === 'PARTIALLY_RECEIVED';

const COST_DECIMALS = 4;
const cost = (v: Prisma.Decimal) => v.toDecimalPlaces(COST_DECIMALS, Prisma.Decimal.ROUND_HALF_UP);

export interface ReceiptLineAmounts {
  /** quantity × unit factor: what enters the stock, in the base unit */
  baseQuantity: Prisma.Decimal;
  /** Per base unit: order price after discount, before VAT (VAT is recoverable) */
  unitCost: Prisma.Decimal;
  /** quantity × order price after discount, before VAT, to the millime */
  value: Prisma.Decimal;
}

/** Quantities and cost of one received line, valued at the order price. */
export function receiptLineAmounts(
  quantity: Num,
  unitPrice: Num,
  discountPct: Num,
  unitFactor: Num,
): ReceiptLineAmounts {
  const netPrice = D(unitPrice)
    .mul(D(100).minus(D(discountPct)))
    .div(100);
  return {
    baseQuantity: D(quantity).mul(D(unitFactor)).toDecimalPlaces(COST_DECIMALS),
    unitCost: cost(netPrice.div(D(unitFactor))),
    value: lineAmounts(quantity, unitPrice, discountPct, 0).net,
  };
}

/**
 * Weighted average cost after a receipt (per base unit):
 *   (stock on hand × current average + quantity in × cost in) / (stock on hand + quantity in)
 * When there is no stock (or negative stock) the receipt cost becomes the average.
 */
export function weightedAverageCost(
  onHand: Num,
  currentAverage: Num,
  quantityIn: Num,
  unitCostIn: Num,
): Prisma.Decimal {
  const stock = D(onHand);
  const qtyIn = D(quantityIn);
  if (stock.lte(0)) return cost(D(unitCostIn));
  const total = stock.mul(D(currentAverage)).plus(qtyIn.mul(D(unitCostIn)));
  return cost(total.div(stock.plus(qtyIn)));
}

/** Order status once the received quantities are updated. */
export function statusAfterReceipt(
  lines: { quantity: Num; receivedQty: Num }[],
): 'RECEIVED' | 'PARTIALLY_RECEIVED' {
  return lines.every((l) => D(l.receivedQty).gte(D(l.quantity)))
    ? 'RECEIVED'
    : 'PARTIALLY_RECEIVED';
}
