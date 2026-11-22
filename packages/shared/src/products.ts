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
  /** Present only for users with inventory.stock.read */
  recentMoves?: ProductStockMove[];
  createdAt: string;
  updatedAt: string;
}

/** Choices for the product form and filters. */
export interface ProductLookups {
  categories: Ref[];
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
