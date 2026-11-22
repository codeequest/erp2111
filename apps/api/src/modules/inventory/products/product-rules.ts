import { Prisma } from '@prisma/client';
import type { ProductType, StockStatus } from '@erp/shared';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** A non-negative amount with up to 4 decimals, e.g. "12", "12.5", "0.0001". */
export const DECIMAL_PATTERN = /^\d{1,14}(\.\d{1,4})?$/;

/**
 * Reads a user-typed number: "12,5", "1 234,50", "1,234.50", "1.234,50" → Decimal.
 * The LAST separator is the decimal one; the others are thousands separators.
 * Returns null for anything that is not a valid non-negative number.
 */
export function parseUserDecimal(raw: string): Decimal | null {
  let s = raw.trim().replace(/[\s  ]/g, '');
  if (s === '') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const decimalSep = lastComma > lastDot ? ',' : '.';
  const thousandsSep = decimalSep === ',' ? '.' : ',';
  // With a single separator that appears once, treat it as the decimal separator.
  s = s.split(thousandsSep).join('');
  if (decimalSep === ',') s = s.replace(',', '.');
  if (!DECIMAL_PATTERN.test(s)) return null;
  return new Decimal(s);
}

/** Margin on sale price, in % with 2 decimals. Uses average cost, or purchase price if no cost yet. */
export function computeMarginPct(
  salePrice: Decimal,
  averageCost: Decimal,
  purchasePrice: Decimal,
): string | null {
  if (salePrice.lte(0)) return null;
  const cost = averageCost.gt(0) ? averageCost : purchasePrice;
  if (cost.lte(0)) return null;
  return salePrice.minus(cost).div(salePrice).mul(100).toFixed(2);
}

export function computeStockStatus(
  type: ProductType,
  onHand: Decimal,
  minStock: Decimal,
): StockStatus {
  if (type !== 'STOCKABLE') return 'none';
  if (onHand.lte(0)) return 'out';
  if (minStock.gt(0) && onHand.lte(minStock)) return 'low';
  return 'in';
}

/** Names of the top-level fields whose JSON value differs between two audit snapshots. */
export function changedFields(before: unknown, after: unknown): string[] {
  const b = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>;
  const ignored = new Set(['updatedAt', 'createdAt', 'id']);
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((k) => !ignored.has(k) && JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .sort();
}

/** "PRD-00041" → next free number in the PRD- series. */
export const AUTO_SKU_PREFIX = 'PRD-';
export function nextAutoSku(lastSku: string | null | undefined, offset = 0): string {
  const match = lastSku?.match(/^PRD-(\d+)$/);
  const next = (match ? parseInt(match[1], 10) : 0) + 1 + offset;
  return AUTO_SKU_PREFIX + String(next).padStart(5, '0');
}

/** Accepts the code ("SERVICE"), the label ("Service") or common short forms. */
export function parseProductType(raw: string): ProductType | null {
  const s = raw.trim().toUpperCase();
  if (s === '') return 'STOCKABLE';
  if (['STOCKABLE', 'STOCKABLE PRODUCT', 'PRODUCT', 'STOCK', 'STORABLE'].includes(s))
    return 'STOCKABLE';
  if (['CONSUMABLE', 'CONSU'].includes(s)) return 'CONSUMABLE';
  if (['SERVICE', 'SRV'].includes(s)) return 'SERVICE';
  return null;
}

/** yes/no, true/false, 1/0, oui/non, active/inactive. Empty → fallback. */
export function parseBoolean(raw: string, fallback: boolean): boolean | null {
  const s = raw.trim().toLowerCase();
  if (s === '') return fallback;
  if (['yes', 'y', 'true', '1', 'oui', 'o', 'active', 'actif'].includes(s)) return true;
  if (['no', 'n', 'false', '0', 'non', 'inactive', 'inactif'].includes(s)) return false;
  return null;
}
