import { Prisma } from '@prisma/client';

/**
 * Price of a product in a price list: the fixed price when one is set, otherwise the
 * retail price adjusted by the list's % rule, rounded to cents (half up).
 */
export function listPrice(
  retail: Prisma.Decimal,
  adjustmentPct: Prisma.Decimal,
  fixed: Prisma.Decimal | null | undefined,
): Prisma.Decimal {
  if (fixed !== null && fixed !== undefined) return fixed;
  return retail
    .times(new Prisma.Decimal(100).plus(adjustmentPct))
    .dividedBy(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Days from `today` until `expiry` (negative = already expired). Both are calendar dates. */
export function daysUntil(expiry: Date, today: Date = new Date()): number {
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((day(expiry) - t) / 86_400_000);
}
