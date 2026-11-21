import { Prisma } from '@prisma/client';

/**
 * Pure business rules of the Products module (no database access), so they
 * can be unit-tested. Money and quantities stay Prisma.Decimal end to end.
 */
type Dec = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export type StockStatus = 'ok' | 'low' | 'out';

/**
 * - out: nothing on hand (or negative)
 * - low: at or under the minimum stock, when a minimum is set
 * - ok:  everything else
 */
export function stockStatus(onHand: Dec, minStock: Dec): StockStatus {
  if (onHand.lte(0)) return 'out';
  if (minStock.gt(0) && onHand.lte(minStock)) return 'low';
  return 'ok';
}

/** Price including VAT, rounded to 4 decimals like stored prices. */
export function priceInclTax(price: Dec, ratePercent: Dec | null | undefined): Dec {
  if (!ratePercent) return price;
  return price.mul(D(100).add(ratePercent)).div(100).toDecimalPlaces(4);
}

/** Gross margin on the selling price, in percent (2 decimals). Null when not computable. */
export function marginPercent(salePrice: Dec, cost: Dec): Dec | null {
  if (salePrice.lte(0) || cost.lte(0)) return null;
  return salePrice.sub(cost).div(salePrice).mul(100).toDecimalPlaces(2);
}

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
}

/** "Food › Beverages › Juices" — walks up the tree, guarding against bad data loops. */
export function categoryPath(id: string, byId: Map<string, CategoryNode>): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(' › ');
}

/** True when moving `categoryId` under `newParentId` would create a loop. */
export function wouldCreateCycle(
  categoryId: string,
  newParentId: string | null,
  byId: Map<string, CategoryNode>,
): boolean {
  const seen = new Set<string>();
  let current = newParentId;
  while (current) {
    if (current === categoryId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/** The category and all of its descendants (used to filter products by category). */
export function descendantIds(rootId: string, nodes: CategoryNode[]): string[] {
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id]);
  }
  const result: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return result;
}
