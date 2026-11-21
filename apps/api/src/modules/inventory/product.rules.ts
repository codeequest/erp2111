import { Prisma } from '@prisma/client';
import { formatSequenceValue } from '@erp/shared';
import type { ProductDetail, ProductListItem } from '@erp/shared';

/**
 * Pure business rules of the Products feature — no database access, so they
 * are easy to unit test (see product.rules.spec.ts).
 */

type Decimal = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);

/**
 * Low stock = below the minimum (when one is set), or negative in any case:
 * stock below zero always needs attention, even for products without a minimum.
 */
export function isLowStock(onHand: Decimal, minStock: Decimal): boolean {
  return onHand.lt(ZERO) || (minStock.gt(ZERO) && onHand.lt(minStock));
}

/** Decimal → fixed 4-place string, the format every inventory amount uses in the API. */
export function dec(value: Decimal | number | string): string {
  return new Prisma.Decimal(value).toFixed(4);
}

/**
 * The base unit cannot change once stock has moved: every StockMove and the
 * average cost are expressed in it, so changing it would silently rescale history.
 */
export function canChangeBaseUnit(
  currentBaseUnitId: string,
  requestedBaseUnitId: string | undefined,
  stockMoveCount: number,
): boolean {
  if (requestedBaseUnitId === undefined || requestedBaseUnitId === currentBaseUnitId) return true;
  return stockMoveCount === 0;
}

/**
 * Same rule for the tracking mode: lot / serial numbers recorded on past movements
 * would no longer match (or be missing) if tracking changed afterwards.
 */
export const canChangeTracking = canChangeBaseUnit;

/**
 * Automatic product code: prefix + zero-padded number, e.g. ("ART-", 5, 42) → "ART-00042".
 * Same formula as the Settings page preview (shared formatSequenceValue, year 0).
 */
export function formatProductCode(prefix: string, padding: number, n: number): string {
  return formatSequenceValue({ prefix, padding, year: 0 }, n);
}

/**
 * Finds the first automatic code not already taken (a user may have typed a code
 * that matches the pattern). `isTaken` is called with each candidate in order.
 */
export async function nextFreeProductCode(
  prefix: string,
  padding: number,
  start: number,
  isTaken: (code: string) => Promise<boolean>,
  maxTries = 1000,
): Promise<{ code: string; number: number }> {
  for (let n = start; n < start + maxTries; n++) {
    const code = formatProductCode(prefix, padding, n);
    if (!(await isTaken(code))) return { code, number: n };
  }
  throw new Error(`No free product code found after ${maxTries} tries from ${start}`);
}

export type ImageType = { ext: 'jpg' | 'png' | 'webp'; mime: string };

/**
 * Identifies an image from its first bytes ("magic number"). The browser-sent
 * MIME type and file name are not trusted.
 */
export function detectImageType(buf: Buffer): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

/**
 * Moving category `id` under `newParentId` must not create a loop.
 * `parentOf` maps every category id to its parent id (null for roots).
 */
export function wouldCreateCategoryCycle(
  id: string,
  newParentId: string | null,
  parentOf: Map<string, string | null>,
): boolean {
  let cursor = newParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === id) return true;
    if (seen.has(cursor)) return true; // already-corrupt data: refuse too
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}

/**
 * A category id plus all its sub-categories at any depth, so filtering on
 * "Beverages" also returns products filed under "Beverages › Soft Drinks".
 */
export function categoryWithDescendants(
  rootId: string,
  categories: { id: string; parentId: string | null }[],
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const c of categories) {
    if (!c.parentId) continue;
    childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c.id]);
  }
  const result = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    for (const child of childrenOf.get(queue.shift()!) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return [...result];
}

/** Removes the purchase cost unless the caller may see it (inventory.cost.view). */
export function applyCostVisibility<T extends ProductListItem | ProductDetail>(
  product: T,
  canViewCost: boolean,
): T {
  if (canViewCost) return product;
  const { averageCost: _hidden, ...rest } = product;
  return rest as T;
}

/** Trims, and turns empty strings into null, for optional text fields. */
export function emptyToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
