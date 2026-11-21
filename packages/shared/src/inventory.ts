/**
 * Response shapes of the Inventory API, shared by the API and the web app.
 * Decimal values (prices, quantities, costs) travel as STRINGS, e.g. "12.5000",
 * so no precision is lost in JSON. Never parse them with parseFloat for maths.
 */

/** GET /inventory/units */
export interface UnitItem {
  id: string;
  code: string;
  name: string;
  /** Number of products using it as base unit. */
  productCount: number;
}

/** GET /inventory/categories returns a list of root nodes. */
export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  /** Products directly in this category (not in sub-categories). */
  productCount: number;
  children: CategoryNode[];
}

/** GET /inventory/warehouses */
export interface WarehouseItem {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  /** Number of products with non-zero stock in this warehouse. */
  productsInStock: number;
}

export interface ProductUnitItem {
  unitId: string;
  unitCode: string;
  unitName: string;
  /** How many base units are in one of this unit, e.g. "24" for a carton of 24. */
  factor: string;
  forPurchase: boolean;
  forSale: boolean;
  barcode: string | null;
}

/** One row of GET /inventory/products */
export interface ProductListItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: { id: string; name: string } | null;
  baseUnit: { id: string; code: string };
  salePrice: string;
  minStock: string;
  isActive: boolean;
  /** Only present for users with inventory.cost.view */
  averageCost?: string;
  /** Total on hand in all warehouses (base unit). Only with inventory.stock.read */
  onHand?: string;
}

/** GET /inventory/products/:id */
export interface ProductDetail extends ProductListItem {
  description: string | null;
  taxRateId: string | null;
  units: ProductUnitItem[];
  createdAt: string;
  updatedAt: string;
  /** True once stock has moved: the base unit can no longer change. */
  hasStockMoves: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
