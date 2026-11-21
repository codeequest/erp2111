/**
 * Inventory API contracts shared by the API and the web app.
 *
 * Decimal values (prices, costs, quantities) travel as strings, e.g. "12.5000",
 * so no precision is lost in JSON. Never convert them to `number` for maths.
 */

export interface PageResult<T> {
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
}

export interface TaxRateDto {
  id: string;
  name: string;
  rate: string;
}

/** How individual items are traced. Lot / serial numbers are captured on receipts and deliveries. */
export type TrackingMode = 'NONE' | 'LOT' | 'SERIAL';

/** Automatic article code numbering, e.g. prefix "ART-" + 5 digits → ART-00042. */
export interface ProductCodeSequence {
  prefix: string;
  padding: number;
  nextNumber: number;
  /** The code the next automatic product will get (already skips codes in use) */
  nextCode: string;
}

export type ProductStatusFilter = 'active' | 'inactive' | 'all';
export type ProductSortField = 'name' | 'sku' | 'salePrice' | 'createdAt';

export interface ProductListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  /** A category id (sub-categories included), or 'none' for products without a category */
  categoryId?: string | 'none';
  status?: ProductStatusFilter;
  lowStock?: boolean;
  sort?: ProductSortField;
  order?: 'asc' | 'desc';
}

export interface ProductListItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: { id: string; name: string } | null;
  baseUnit: { id: string; code: string };
  salePrice: string;
  /** Only present when the caller holds inventory.cost.view */
  averageCost?: string;
  minStock: string;
  /** Sum of stock over every warehouse, in base unit */
  onHand: string;
  isLowStock: boolean;
  tracking: TrackingMode;
  /** API path of the photo (needs the access token), with a cache-busting version; null = none */
  photoUrl: string | null;
  isActive: boolean;
}

export interface ProductStockLine {
  warehouse: { id: string; code: string; name: string };
  quantity: string;
}

export interface ProductDetail extends ProductListItem {
  description: string | null;
  taxRate: TaxRateDto | null;
  stock: ProductStockLine[];
  /** True once the product has stock movements: base unit and tracking are then locked */
  hasStockHistory: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  /** Article code. Leave empty on create to get the next automatic code. */
  sku?: string | null;
  barcode?: string | null;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  baseUnitId: string;
  taxRateId?: string | null;
  salePrice: string;
  minStock?: string;
  tracking?: TrackingMode;
}
