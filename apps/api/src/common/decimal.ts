import { Prisma } from '@prisma/client';

/**
 * The ONE place where quantities and amounts are rounded (design doc §9).
 * Never use JavaScript `number` arithmetic for money or stock.
 *
 *  - quantities, unit prices, costs ...... 4 decimals  (DB: Decimal(18,4))
 *  - document totals, payments ........... 2 decimals  (DB: Decimal(18,2))
 *
 * Rounding is "half up", away from zero (2.345 → 2.35, -2.345 → -2.35),
 * which is what customers and accountants expect on an invoice.
 */
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export type DecimalInput = Prisma.Decimal | string | number;

export const QTY_SCALE = 4;
export const MONEY_SCALE = 2;

/** Converts input to a Decimal. Rejects NaN, Infinity and empty strings. */
export function toDecimal(value: DecimalInput): Decimal {
  if (typeof value === 'string' && value.trim() === '') {
    throw new Error('Empty string is not a valid decimal');
  }
  const d = new Decimal(value);
  if (!d.isFinite()) throw new Error(`Not a finite decimal: ${String(value)}`);
  return d;
}

/** Rounds to `scale` decimals, half away from zero. */
export function round(value: DecimalInput, scale: number): Decimal {
  return toDecimal(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

/** Quantities, unit prices and costs (4 decimals). */
export function roundQty(value: DecimalInput): Decimal {
  return round(value, QTY_SCALE);
}

/** Document totals and payments (2 decimals). */
export function roundMoney(value: DecimalInput): Decimal {
  return round(value, MONEY_SCALE);
}
