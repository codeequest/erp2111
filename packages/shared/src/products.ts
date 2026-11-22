/**
 * Product types shared by the API and the web app.
 * Money and quantities are sent as strings to keep full decimal precision.
 */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Ref {
  id: string;
  name: string;
}

export interface UnitRef {
  id: string;
  code: string;
  name: string;
}

export interface TaxRateRef {
  id: string;
  name: string;
  /** Percentage, e.g. "19.00" */
  rate: string;
}

export const PRODUCT_SORT_FIELDS = ['name', 'sku', 'salePrice', 'createdAt'] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export const PRODUCT_STATUS_FILTERS = ['active', 'inactive', 'all'] as const;
export type ProductStatusFilter = (typeof PRODUCT_STATUS_FILTERS)[number];

export interface ProductListItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: Ref | null;
  baseUnit: UnitRef;
  salePrice: string;
  /** Present only for users with inventory.cost.view */
  averageCost?: string;
  minStock: string;
  /** Sum of stock in every warehouse, in the base unit */
  stockOnHand: string;
  isActive: boolean;
}

export interface ProductStockLine {
  warehouse: { id: string; code: string; name: string };
  quantity: string;
}

export interface ProductStockMove {
  id: string;
  type: string;
  quantity: string;
  /** Present only for users with inventory.cost.view */
  unitCost?: string;
  reference: string | null;
  reason: string | null;
  warehouse: { id: string; code: string };
  createdAt: string;
}

export interface ProductDetail extends ProductListItem {
  description: string | null;
  taxRate: TaxRateRef | null;
  stockByWarehouse: ProductStockLine[];
  /** Other units the product is bought or sold in */
  packUnits: ProductPackUnit[];
  /** Present only for users with inventory.stock.read */
  recentMoves?: ProductStockMove[];
  createdAt: string;
  updatedAt: string;
}

/** Choices for the product form and filters. */
export interface ProductLookups {
  /** Active categories in tree order (parents before their children) */
  categories: CategoryNode[];
  units: UnitRef[];
  taxRates: TaxRateRef[];
}

/** Body of POST /inventory/products. PATCH accepts any subset. */
export interface ProductInput {
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  baseUnitId: string;
  taxRateId?: string | null;
  salePrice: string;
  minStock?: string;
}

// ── Phase 2: catalogue setup ────────────────────────────────────────────────

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  /** Full path, e.g. "Food › Oils" */
  path: string;
  /** 0 for top-level categories */
  depth: number;
  isActive: boolean;
  /** Products directly in this category (not in sub-categories) */
  productCount: number;
}

export interface CategoryInput {
  name: string;
  parentId?: string | null;
  isActive?: boolean;
}

export interface UnitRow extends UnitRef {
  productCount: number;
}

export interface UnitInput {
  code: string;
  name: string;
}

export interface TaxRateRow extends TaxRateRef {
  isActive: boolean;
}

export interface TaxRateInput {
  name: string;
  rate: string;
  isActive?: boolean;
}

/** A pack size of a product, e.g. 1 CTN = 24 PCS. */
export interface ProductPackUnit {
  unit: UnitRef;
  /** How many base units are in one of this unit */
  factor: string;
  forPurchase: boolean;
  forSale: boolean;
  barcode: string | null;
}

export interface ProductPackUnitInput {
  unitId: string;
  factor: string;
  forPurchase: boolean;
  forSale: boolean;
  barcode?: string | null;
}

/** Result of GET /inventory/products/barcode/:code */
export interface BarcodeMatch {
  product: ProductListItem;
  /** Set when the barcode belongs to a pack size rather than the base unit */
  packUnit: ProductPackUnit | null;
}

export interface LowStockSummary {
  count: number;
  /** The most urgent items (largest shortfall first) */
  items: Array<{
    id: string;
    sku: string;
    name: string;
    unitCode: string;
    stockOnHand: string;
    minStock: string;
  }>;
}
