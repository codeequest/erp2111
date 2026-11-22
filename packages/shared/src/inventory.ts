/**
 * Inventory · Products — types shared by the API and the web app.
 * Money and quantities travel as strings (Decimal) to avoid floating-point errors.
 */

export const PRODUCT_TYPES = ['STOCKABLE', 'CONSUMABLE', 'SERVICE'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  STOCKABLE: 'Stockable product',
  CONSUMABLE: 'Consumable',
  SERVICE: 'Service',
};

/** in = above min stock, low = at or below min stock, out = nothing on hand, none = not tracked */
export type StockStatus = 'in' | 'low' | 'out' | 'none';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UnitDto {
  id: string;
  code: string;
  name: string;
}

export interface CategoryDto {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  /** Full path, e.g. "Electronics / Phones" */
  path: string;
  productCount: number;
}

export interface TaxRateDto {
  id: string;
  name: string;
  rate: string;
}

export interface ProductUnitDto {
  id: string;
  unitId: string;
  unitCode: string;
  unitName: string;
  factor: string;
  forPurchase: boolean;
  forSale: boolean;
  barcode: string | null;
}

export interface ProductListItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  type: ProductType;
  categoryId: string | null;
  categoryName: string | null;
  baseUnitCode: string;
  salePrice: string;
  /** Only present with inventory.cost.view */
  purchasePrice?: string;
  averageCost?: string;
  marginPct?: string | null;
  minStock: string;
  stockOnHand: string;
  stockStatus: StockStatus;
  isActive: boolean;
  hasImage: boolean;
  updatedAt: string;
}

export interface ProductDetail extends ProductListItem {
  description: string | null;
  baseUnitId: string;
  baseUnitName: string;
  taxRateId: string | null;
  taxRateName: string | null;
  units: ProductUnitDto[];
  createdAt: string;
  /** True once the product appears in stock moves or documents: base unit can no longer change. */
  isUsed: boolean;
}

export interface ProductStockDto {
  balances: {
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    quantity: string;
  }[];
  moves: {
    id: string;
    date: string;
    type: string;
    warehouseCode: string;
    quantity: string;
    reference: string | null;
    userName: string;
  }[];
}

export interface ProductHistoryEntry {
  id: string;
  date: string;
  action: string;
  userName: string | null;
  /** Names of the fields that changed (values are not exposed here). */
  changedFields: string[];
}

export interface DeactivationCheck {
  stockOnHand: string;
  openPurchaseOrders: number;
  openSalesOrders: number;
}

export interface BulkResult {
  succeeded: string[];
  failed: { id: string; sku: string; reason: string }[];
}

// ── CSV import / export ──────────────────────────────────────────────────────

export const IMPORT_MODES = ['create', 'update', 'upsert'] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

/** Columns of the import template and of the export (same layout = re-importable). */
export const PRODUCT_CSV_COLUMNS = [
  'sku',
  'name',
  'barcode',
  'type',
  'category',
  'base_unit',
  'tax_rate',
  'sale_price',
  'purchase_price',
  'min_stock',
  'description',
  'active',
] as const;
export type ProductCsvColumn = (typeof PRODUCT_CSV_COLUMNS)[number];

export interface ImportRowResult {
  /** Line number in the file (header = line 1) */
  line: number;
  sku: string;
  name: string;
  action: 'create' | 'update' | 'skip';
  errors: string[];
}

export interface ImportPreview {
  mode: ImportMode;
  totalRows: number;
  validRows: number;
  errorRows: number;
  toCreate: number;
  toUpdate: number;
  rows: ImportRowResult[];
}

export interface ImportResult {
  created: number;
  updated: number;
}
