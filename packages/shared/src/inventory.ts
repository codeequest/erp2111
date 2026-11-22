/**
 * Inventory API contracts shared by the API and the web app.
 *
 * Decimal values (prices, costs, quantities) travel as strings, e.g. "12.5000",
 * so no precision is lost in JSON.
 */

import type { Paginated } from './products';

// ── Stock ─────────────────────────────────────────────────────────────────────

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export const STOCK_MOVE_TYPES = [
  'OPENING',
  'RECEIPT',
  'DELIVERY',
  'ADJUSTMENT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'CUSTOMER_RETURN',
] as const;
export type StockMoveType = (typeof STOCK_MOVE_TYPES)[number];

/**
 * all      every active product (+ inactive ones that still have stock)
 * inStock  total on hand > 0
 * low      0 < min stock and total on hand < min stock
 * out      total on hand <= 0
 */
export type StockFilter = 'all' | 'inStock' | 'low' | 'out';

export interface StockLevelRow {
  product: {
    id: string;
    sku: string;
    name: string;
    isActive: boolean;
    baseUnit: { id: string; code: string };
    category: { id: string; name: string } | null;
  };
  /** Quantity per warehouse id; warehouses with no balance row are omitted (= 0). */
  byWarehouse: Record<string, string>;
  /** Sum over all warehouses (or the filtered warehouse). */
  total: string;
  minStock: string;
  isLow: boolean;
  /** total × average cost — only with `inventory.cost.view`. */
  value?: string;
}

export interface StockLevelsResponse extends Paginated<StockLevelRow> {
  /** Columns to show, in display order. */
  warehouses: WarehouseDto[];
  /** Value of all matching rows (not only this page) — only with `inventory.cost.view`. */
  totalValue?: string;
}

export interface StockMoveRow {
  id: string;
  createdAt: string;
  type: StockMoveType;
  /** Signed, in the base unit: + in, - out */
  quantity: string;
  /** Only with `inventory.cost.view`. */
  unitCost?: string;
  reference: string | null;
  reason: string | null;
  product: { id: string; sku: string; name: string; baseUnit: { code: string } };
  warehouse: { id: string; code: string; name: string };
  createdBy: { id: string; fullName: string };
}

// ── Stock adjustments ─────────────────────────────────────────────────────────

/**
 * count  each line gives the quantity counted on the shelf; the difference is posted
 * delta  each line gives the quantity to add (+) or remove (-)
 */
export type AdjustmentMode = 'count' | 'delta';

export const ADJUSTMENT_REASONS = [
  'Inventory count',
  'Damaged',
  'Expired',
  'Lost or stolen',
  'Found',
  'Data entry correction',
  'Other',
] as const;

export interface StockAdjustmentInput {
  warehouseId: string;
  mode: AdjustmentMode;
  reason: string;
  lines: { productId: string; quantity: number }[];
}

export interface StockAdjustmentResult {
  id: string;
  /** e.g. "ADJ-2026-00001" */
  reference: string;
  createdAt: string;
  warehouse: { id: string; code: string; name: string };
  reason: string;
  lines: {
    product: { id: string; sku: string; name: string; baseUnit: { code: string } };
    before: string;
    /** Signed change actually posted. */
    change: string;
    after: string;
  }[];
  /** Products whose counted quantity already matched: nothing was posted for them. */
  unchanged: number;
}

export interface StockAdjustmentListItem {
  id: string;
  reference: string;
  createdAt: string;
  warehouse: { id: string; code: string; name: string };
  reason: string;
  createdBy: { id: string; fullName: string };
  lines: {
    product: { id: string; sku: string; name: string; baseUnit: { code: string } };
    change: string;
  }[];
  /** Σ change × unit cost — only with `inventory.cost.view`. Negative = stock value lost. */
  valueChange?: string;
}
