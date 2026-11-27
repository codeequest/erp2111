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
  /** Cost of the latest receipt or supplier bill (base unit) — only with inventory.cost.view */
  lastPurchaseCost?: string;
  /** ISO date of that document */
  lastPurchaseAt?: string | null;
  minStock: string;
  /** Sum of stock in every warehouse, in the base unit */
  stockOnHand: string;
  /** Relative URL of the product photo, or null */
  imageUrl: string | null;
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

// ── Phase 3: import / export, history, bulk actions ─────────────────────────

/** Columns of the product CSV, in order. average_cost is export-only. */
export const PRODUCT_CSV_COLUMNS = [
  'sku',
  'barcode',
  'name',
  'description',
  'category',
  'base_unit',
  'tax_rate',
  'sale_price',
  'min_stock',
  'active',
] as const;

export type ImportRowAction = 'create' | 'update' | 'unchanged' | 'error';

export interface ImportRowResult {
  /** Line number in the file (the header is line 1) */
  line: number;
  sku: string;
  action: ImportRowAction;
  /** Why the row was rejected (action = error) */
  errors: string[];
  /** Fields that will change (action = update) */
  changes: string[];
}

export interface ImportReport {
  /** true when nothing was written (preview) */
  dryRun: boolean;
  totals: Record<ImportRowAction, number>;
  rows: ImportRowResult[];
}

export interface HistoryEntry {
  id: string;
  action: string;
  user: string | null;
  createdAt: string;
  /** One line per changed field */
  changes: Array<{ field: string; from: string | null; to: string | null }>;
}

export const BULK_PRODUCT_ACTIONS = [
  'setCategory',
  'adjustPrice',
  'activate',
  'deactivate',
] as const;
export type BulkProductAction = (typeof BULK_PRODUCT_ACTIONS)[number];

export interface BulkProductRequest {
  ids: string[];
  action: BulkProductAction;
  /** setCategory: null removes the category */
  categoryId?: string | null;
  /** adjustPrice: e.g. "5" for +5 %, "-10" for -10 % */
  percent?: string;
}

export interface BulkProductResult {
  /** Products actually changed */
  updated: number;
  /** Selected products already in the requested state */
  skipped: number;
}

// ── Price lists and labels ──────────────────────────────────────────────────

export interface PriceListRow {
  id: string;
  name: string;
  description: string | null;
  /** Applied to the sale price when a product has no fixed price, e.g. "-10.00" */
  adjustPercent: string;
  isActive: boolean;
  /** Number of fixed prices in the list */
  itemCount: number;
}

export interface PriceListInput {
  name: string;
  description?: string | null;
  adjustPercent: string;
  isActive?: boolean;
}

/** One selling unit of a product inside a price list. */
export interface PriceLine {
  unit: UnitRef;
  /** Base units in this unit ("1" for the base unit) */
  factor: string;
  /** Normal price for this unit: sale price x factor */
  standardPrice: string;
  /** The price this list charges (fixed, or computed from the list's percentage) */
  price: string;
  /** true when the list has its own price for this unit */
  fixed: boolean;
}

export interface PriceListProductRow {
  product: { id: string; sku: string; name: string; imageUrl: string | null };
  lines: PriceLine[];
}

/** PUT /inventory/price-lists/:id/products/:productId. A null price removes the fixed price. */
export interface SetProductPricesInput {
  prices: Array<{ unitId: string; price: string | null }>;
}

/** Prices of one product in every active price list (product page). */
export interface ProductListPrices {
  priceList: { id: string; name: string; adjustPercent: string };
  lines: PriceLine[];
}

export interface ProductLabel {
  id: string;
  sku: string;
  name: string;
  /** The product barcode, or null (the label then encodes the SKU) */
  barcode: string | null;
  unitCode: string;
  /** Sale price, or the chosen price list's price */
  price: string;
}
