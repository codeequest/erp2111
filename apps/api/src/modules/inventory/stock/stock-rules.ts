import { Prisma, StockMoveType } from '@prisma/client';

/**
 * Pure stock rules: no database access, so they are easy to unit-test.
 * Used by StockEngine.
 */

export type Num = Prisma.Decimal | string | number;
export const D = (v: Num) => new Prisma.Decimal(v);
const ZERO = D(0);

/** Quantities and unit costs are stored as Decimal(18,4). */
export const SCALE = 4;

/** Types that must add stock (quantity > 0). */
const INBOUND: ReadonlySet<StockMoveType> = new Set([
  'OPENING',
  'RECEIPT',
  'TRANSFER_IN',
  'CUSTOMER_RETURN',
]);
/** Types that must remove stock (quantity < 0). */
const OUTBOUND: ReadonlySet<StockMoveType> = new Set(['DELIVERY', 'TRANSFER_OUT']);
/** Types whose cost must be given by the caller (purchase price, opening cost, original sale cost). */
const COST_REQUIRED: ReadonlySet<StockMoveType> = new Set(['OPENING', 'RECEIPT', 'CUSTOMER_RETURN']);

export interface MoveLineRule {
  type: StockMoveType;
  quantity: Num;
  unitCost?: Num | null;
  reason?: string | null;
  /** Reversal moves have the opposite sign of their type, so the sign rule is skipped. */
  reversesMoveId?: string | null;
}

/** Returns why a line cannot be posted, or null when it is valid. */
export function moveLineError(line: MoveLineRule, documentReason?: string | null): string | null {
  const q = D(line.quantity);
  if (!q.isFinite() || q.isZero()) return 'quantity must not be zero';
  if (q.decimalPlaces() > SCALE) return `quantity has more than ${SCALE} decimals`;

  const isReversal = !!line.reversesMoveId;
  if (!isReversal) {
    if (INBOUND.has(line.type) && q.isNegative()) return `${line.type} must add stock (quantity > 0)`;
    if (OUTBOUND.has(line.type) && q.isPositive()) return `${line.type} must remove stock (quantity < 0)`;
  }

  const hasCost = line.unitCost !== undefined && line.unitCost !== null;
  if (hasCost) {
    const c = D(line.unitCost!);
    if (!c.isFinite() || c.isNegative()) return 'unit cost must be zero or more';
    if (q.isNegative()) return 'unit cost is only allowed when adding stock (outgoing stock leaves at average cost)';
    if (line.type === 'TRANSFER_IN') return 'unit cost is not allowed on a transfer (stock moves at average cost)';
  } else if (!isReversal && COST_REQUIRED.has(line.type)) {
    return `${line.type} needs a unit cost`;
  }

  if (line.type === 'ADJUSTMENT' && !isReversal && !(line.reason ?? documentReason)?.trim()) {
    return 'an adjustment needs a reason';
  }
  return null;
}

/** Company-wide stock position of one product, used for weighted average cost. */
export interface CostState {
  /** Total on-hand quantity in all warehouses (base unit) */
  onHand: Prisma.Decimal;
  /** Current weighted average cost per base unit */
  avgCost: Prisma.Decimal;
}

export interface CostResult extends CostState {
  /** Cost per base unit recorded on the move */
  unitCost: Prisma.Decimal;
}

/**
 * Weighted average cost after one move.
 *
 *  - Stock in WITH a cost (receipt, opening, return, adjustment with cost):
 *      newAvg = (onHand x avg + qty x cost) / (onHand + qty)
 *    When stock was zero or negative before, the new cost simply becomes the average
 *    (no meaningful old value to blend with, and no division by zero).
 *  - Stock in WITHOUT a cost (transfer in, adjustment without cost): enters at the
 *    current average, which does not change.
 *  - Stock out: leaves at the current average (this is the cost of goods sold),
 *    which does not change.
 */
export function applyMove(state: CostState, quantity: Num, explicitCost?: Num | null): CostResult {
  const q = D(quantity);
  const onHand = state.onHand.add(q);

  if (q.isPositive() && explicitCost !== undefined && explicitCost !== null) {
    const cost = D(explicitCost).toDecimalPlaces(SCALE, Prisma.Decimal.ROUND_HALF_UP);
    const avgCost =
      state.onHand.lte(ZERO) || onHand.lte(ZERO)
        ? cost
        : state.onHand
            .mul(state.avgCost)
            .add(q.mul(cost))
            .div(onHand)
            .toDecimalPlaces(SCALE, Prisma.Decimal.ROUND_HALF_UP);
    return { onHand, avgCost, unitCost: cost };
  }

  return { onHand, avgCost: state.avgCost, unitCost: state.avgCost };
}

/** Sorts by product id (stable), the order in which product rows are locked. */
export function lockOrder<T extends { productId: string }>(lines: T[]): T[] {
  return lines
    .map((line, i) => ({ line, i }))
    .sort((a, b) => (a.line.productId < b.line.productId ? -1 : a.line.productId > b.line.productId ? 1 : a.i - b.i))
    .map((x) => x.line);
}
