import { Prisma } from '@prisma/client';

const DECIMAL_INPUT = /^\d{1,14}([.,]\d{1,4})?$/;

/**
 * Parses an amount typed by a user: "12.5", "12,500", " 1 200,000 ".
 * Returns null when it is not a valid non-negative number with ≤ 4 decimals.
 */
export function parseDecimal(input: string | number | null | undefined): Prisma.Decimal | null {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/[\s  ]/g, '');
  if (!DECIMAL_INPUT.test(s)) return null;
  return new Prisma.Decimal(s.replace(',', '.'));
}

/** Price including VAT, rounded to the currency's decimals (TND → 3). */
export function inclTax(
  priceExclTax: Prisma.Decimal,
  ratePercent: Prisma.Decimal | null,
  decimals: number,
) {
  const rate = ratePercent ?? new Prisma.Decimal(0);
  return priceExclTax
    .mul(rate.div(100).add(1))
    .toDecimalPlaces(decimals, Prisma.Decimal.ROUND_HALF_UP);
}

/** Number of decimals of a currency (TND = 3, EUR = 2…). */
export function currencyDecimals(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** Decimal → plain string without useless trailing zeros ("24.0000" → "24"). */
export function plain(d: Prisma.Decimal): string {
  return d.toDecimalPlaces(4).toString();
}
