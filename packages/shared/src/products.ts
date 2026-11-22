/** Product search — shared by the API and the web app. */

export type StockStatus = 'in_stock' | 'low' | 'out';
export type ProductStatusFilter = 'active' | 'inactive' | 'all';
export type ProductSort = 'relevance' | 'name' | 'sku' | 'price' | 'stock' | 'updated';
export type SortOrder = 'asc' | 'desc';

export const PRODUCT_SORTS: ProductSort[] = ['relevance', 'name', 'sku', 'price', 'stock', 'updated'];
export const STOCK_STATUSES: StockStatus[] = ['in_stock', 'low', 'out'];

export interface ProductSearchQuery {
  /** Free text: name, SKU, barcode, description. Every word must match. */
  q?: string;
  categoryId?: string;
  stockStatus?: StockStatus;
  status?: ProductStatusFilter;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
}

export interface ProductListItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: { id: string; name: string } | null;
  unit: string;
  salePrice: number;
  /** Present only with the inventory.cost.view permission */
  averageCost?: number;
  stock: number;
  minStock: number;
  stockStatus: StockStatus;
  isActive: boolean;
  updatedAt: string;
}

export interface ProductSearchResult {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Counts per stock status for the same search, ignoring the stock filter */
  facets: Record<StockStatus, number>;
}

export interface ProductDetail extends ProductListItem {
  description: string | null;
  taxRate: { name: string; rate: number } | null;
  stockByWarehouse: { warehouseId: string; code: string; name: string; quantity: number }[];
  createdAt: string;
}

export interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  productCount: number;
}

/** Same rule on both sides: out = 0 or less, low = at or below the minimum. */
export function stockStatusOf(stock: number, minStock: number): StockStatus {
  if (stock <= 0) return 'out';
  if (stock <= minStock) return 'low';
  return 'in_stock';
}
