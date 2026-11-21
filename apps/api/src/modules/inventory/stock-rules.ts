import { Decimal, DecimalInput, roundQty, toDecimal } from '../../common/decimal';

/**
 * Weighted average cost after stock comes IN with a known cost (opening
 * balance, goods receipt). Design doc §8: costing method = weighted average.
 *
 *   new avg = (onHand × avg + inQty × inCost) / (onHand + inQty)
 *
 * When nothing (or less than nothing) was on hand, the old average means
 * nothing any more: the incoming cost becomes the new average.
 */
export function weightedAverageCost(
  onHand: DecimalInput,
  currentAverage: DecimalInput,
  inQty: DecimalInput,
  inUnitCost: DecimalInput,
): Decimal {
  const qty = toDecimal(onHand);
  const incoming = toDecimal(inQty);
  if (!incoming.greaterThan(0)) throw new Error('Incoming quantity must be positive');
  if (!qty.greaterThan(0)) return roundQty(inUnitCost);

  const value = qty.times(currentAverage).plus(incoming.times(inUnitCost));
  return roundQty(value.dividedBy(qty.plus(incoming)));
}

/** Quantity change needed to go from what the system has to what was counted. */
export function countDelta(systemQty: DecimalInput, countedQty: DecimalInput): Decimal {
  return toDecimal(countedQty).minus(systemQty);
}

/** Sums the signed quantities per key, e.g. per "product|warehouse". */
export function netByKey<T>(items: T[], key: (i: T) => string, qty: (i: T) => DecimalInput) {
  const out = new Map<string, Decimal>();
  for (const i of items) {
    const k = key(i);
    out.set(k, (out.get(k) ?? new Decimal(0)).plus(qty(i)));
  }
  return out;
}
