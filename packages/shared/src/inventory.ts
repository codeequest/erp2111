/**
 * Inventory API contracts shared by the API and the web app.
 * Decimal values travel as strings (e.g. "12.5000") so no precision is lost.
 */

export type ProductStatusFilter = 'active' | 'inactive' | 'all';
export type ProductSortField = 'name' | 'sku' | 'salePrice' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export interface ProductListQuery {
  search?: string;
  categoryId?: string;
  status?: ProductStatusFilter;
  lowStock?: boolean;
  sort?: ProductSortField;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
}

export interface RefOption {
  id: string;
  name: string;
}

export interface UnitOption {
  id: string;
  code: string;
  name: string;
}

export interface TaxRateOption {
  id: string;
  name: string;
  /** Percentage, e.g. "19.00" */
  rate: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category: RefOption | null;
  baseUnit: UnitOption;
  taxRate: TaxRateOption | null;
  salePrice: string;
  /** Only present when the user holds inventory.cost.view */
  averageCost?: string;
  minStock: string;
  /** Sum of on-hand quantity across all warehouses, in the base unit */
  onHand: string;
  lowStock: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductStats {
  total: number;
  active: number;
  inactive: number;
  lowStock: number;
}

export interface ProductListResponse extends Paginated<Product> {
  stats: ProductStats;
}

export interface ProductInput {
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  baseUnitId: string;
  taxRateId?: string | null;
  salePrice: number;
  minStock: number;
}

export interface ProductFormOptions {
  categories: CategoryNode[];
  units: UnitOption[];
  taxRates: TaxRateOption[];
  /** ISO 4217 code from company settings */
  currency: string;
}

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  /** Products directly in this category (active and inactive) */
  productCount: number;
}

export interface CategoryInput {
  name: string;
  parentId?: string | null;
}

export interface CategoryUpdate {
  name?: string;
  parentId?: string | null;
  isActive?: boolean;
}
