/**
 * Inventory API contracts shared by the API and the web app.
 *
 * Decimal values (prices, costs, quantities) travel as strings, e.g. "12.5000",
 * so no precision is lost in JSON.
 */

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
}

export interface TaxRateOption {
  id: string;
  name: string;
  /** Percentage, e.g. "19.00" */
  rate: string;
}

/** Everything the product form needs to fill its dropdowns. */
export interface ProductFormOptions {
  units: UnitDto[];
  categories: CategoryDto[];
  taxRates: TaxRateOption[];
}

export type ProductStatusFilter = 'active' | 'inactive' | 'all';
export type ProductSortField = 'name' | 'sku' | 'salePrice' | 'createdAt';

export interface ProductListItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: { id: string; name: string } | null;
  baseUnit: UnitDto;
  salePrice: string;
  /** Present only for users with `inventory.cost.view`. */
  averageCost?: string;
  minStock: string;
  /** Sum of on-hand quantity over all warehouses, in the base unit. */
  onHand: string;
  isActive: boolean;
}

export interface ProductDetail extends ProductListItem {
  description: string | null;
  taxRate: TaxRateOption | null;
  createdAt: string;
  updatedAt: string;
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
  minStock?: number;
}
