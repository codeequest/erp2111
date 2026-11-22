import { Prisma } from '@prisma/client';

type Num = Prisma.Decimal | string | number;
const D = (v: Num) => new Prisma.Decimal(v);

/** Normal price of a unit: sale price x factor, rounded to cents. */
export function standardPrice(salePrice: Num, factor: Num): Prisma.Decimal {
  return D(salePrice).mul(D(factor)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * The price a list charges for one unit of a product:
 * its fixed price when it has one, otherwise the standard price
 * adjusted by the list's percentage (e.g. -10 = 10 % cheaper), rounded to cents.
 */
export function listPrice(
  salePrice: Num,
  factor: Num,
  adjustPercent: Num,
  fixed?: Num | null,
): Prisma.Decimal {
  if (fixed !== undefined && fixed !== null) return D(fixed);
  return D(salePrice)
    .mul(D(factor))
    .mul(D(adjustPercent).div(100).add(1))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
