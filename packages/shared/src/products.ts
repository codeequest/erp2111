/**
 * Types of the Products (catalog) module, shared by the API and the web app.
 * Amounts and quantities travel as strings (Decimal) — never as floats.
 */

/** Standard shape of every paginated list returned by the API. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Readable by every logged-in user (needed to format amounts). */
export interface PublicSettings {
  name: string;
  logoUrl: string | null;
  currency: string;
  /** VAT rate proposed for new products */
  defaultTaxRateId: string | null;
}

export interface TaxRateDto {
  id: string;
  name: string;
  /** Percentage, e.g. "19.00" */
  rate: string;
  isActive: boolean;
}

// ── Categories ───────────────────────────────────────────────────────────────

export interface CategoryDto {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  /** Full path, e.g. "Boissons › Jus" */
  path: string;
  /** Products directly in this category */
  productCount: number;
}

export interface SaveCategoryRequest {
  name: string;
  parentId?: string | null;
  isActive?: boolean;
}

/** Separator used to show and import category paths. */
export const CATEGORY_PATH_SEPARATOR = ' › ';

// ── Units ────────────────────────────────────────────────────────────────────

export interface UnitDto {
  id: string;
  /** Short code, e.g. PCS, KG, CTN */
  code: string;
  name: string;
  /** Products using it as base unit or packaging */
  productCount: number;
}

export interface SaveUnitRequest {
  code: string;
  name: string;
}

// ── Products ─────────────────────────────────────────────────────────────────

export interface ProductListItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: { id: string; path: string } | null;
  baseUnit: { id: string; code: string };
  taxRate: { id: string; name: string; rate: string } | null;
  /** Excluding VAT (HT) */
  salePrice: string;
  /** Including VAT (TTC), computed by the API and rounded to the currency */
  salePriceInclTax: string;
  /** Only present for users with inventory.cost.view */
  purchasePrice?: string;
  /** URL of the photo (served by the API), or null */
  photoUrl: string | null;
  isActive: boolean;
  updatedAt: string;
}

/** Packaging, e.g. 1 carton (CTN) = 24 base units. */
export interface PackagingDto {
  id?: string;
  unitId: string;
  /** How many base units are in one of this unit, e.g. "24" */
  factor: string;
  barcode: string | null;
  forPurchase: boolean;
  forSale: boolean;
  /** Sale price excl. VAT for one of this unit; null = base price × factor */
  salePrice?: string | null;
}

/** A packaging as returned by the API, with its effective prices. */
export interface PackagingDetail extends PackagingDto {
  id: string;
  unit: { id: string; code: string; name: string };
  salePrice: string | null;
  /** salePrice, or base price × factor when not set */
  effectivePrice: string;
  effectivePriceInclTax: string;
}

export interface ProductDetail extends ProductListItem {
  description: string | null;
  packagings: PackagingDetail[];
  createdAt: string;
}

export interface SaveProductRequest {
  /** Leave empty to get an automatic reference (PRD-00001…) */
  sku?: string | null;
  barcode?: string | null;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  baseUnitId: string;
  taxRateId?: string | null;
  salePrice: string;
  /** Ignored for users without inventory.cost.view */
  purchasePrice?: string;
  isActive?: boolean;
  packagings?: PackagingDto[];
}

export interface ProductStats {
  active: number;
  inactive: number;
  categories: number;
  withoutBarcode: number;
  withoutCategory: number;
}

// ── CSV import ───────────────────────────────────────────────────────────────

/** Columns of the import / export file, in order. */
export const PRODUCT_CSV_COLUMNS = [
  'sku',
  'name',
  'barcode',
  'category',
  'unit',
  'sale_price',
  'purchase_price',
  'vat_rate',
  'description',
  'active',
] as const;

export interface ImportProductsRequest {
  /** Content of the CSV file (separator ; or , detected automatically) */
  csv: string;
  /** Only check the file and report what would happen */
  dryRun?: boolean;
}

export interface ImportProductsResult {
  dryRun: boolean;
  /** Data rows read (header excluded) */
  rows: number;
  created: number;
  updated: number;
  /** Categories that will be / were created from paths */
  newCategories: string[];
  /** When not empty, nothing was imported */
  errors: { line: number; message: string }[];
}

// ── Photos ───────────────────────────────────────────────────────────────────

export const PRODUCT_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PRODUCT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

// ── Labels ───────────────────────────────────────────────────────────────────

/** What a barcode label needs. */
export interface ProductLabelItem {
  productId: string;
  name: string;
  sku: string;
  /** EAN-13 / other code; when null the label encodes the SKU */
  barcode: string | null;
  /** Unit printed on the label, e.g. PCS or CTN */
  unitCode: string;
  priceInclTax: string;
}
