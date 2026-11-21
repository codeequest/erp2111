import { api } from './api';

/** Shapes returned by /api/v1/inventory/* — decimals arrive as strings. */
export type StockStatus = 'ok' | 'low' | 'out';

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  depth: number;
  path: string;
  productCount: number;
  childCount: number;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: string;
}

export interface WarehouseRef {
  id: string;
  code: string;
  name: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  category: { id: string; name: string; path: string } | null;
  baseUnit: Unit;
  taxRate: TaxRate | null;
  salePrice: string;
  salePriceInclTax: string;
  /** Only with inventory.cost.view */
  purchasePrice?: string;
  averageCost?: string;
  marginPercent?: string | null;
  minStock: string;
  onHand: string;
  stockStatus: StockStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetail extends Product {
  stockByWarehouse: { warehouse: WarehouseRef; quantity: string }[];
  recentMoves: {
    id: string;
    type: string;
    warehouse: string;
    quantity: string;
    unitCost?: string;
    reference: string | null;
    reason: string | null;
    createdAt: string;
  }[];
}

export interface ProductPage {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  summary: { total: number; low: number; out: number };
}

export interface ProductFormOptions {
  categories: Category[];
  units: Unit[];
  taxRates: TaxRate[];
  warehouses: WarehouseRef[];
}

export interface ProductQuery {
  search?: string;
  categoryId?: string;
  status?: 'active' | 'inactive' | 'all';
  stock?: 'all' | 'low' | 'out';
  sort?: 'name' | 'sku' | 'salePrice' | 'onHand' | 'updatedAt';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export type ProductInput = Partial<{
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  baseUnitId: string;
  taxRateId: string | null;
  purchasePrice: number;
  salePrice: number;
  minStock: number;
  initialStock: number;
  warehouseId: string;
}>;

function qs(query: object): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '' && v !== null) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const inventoryApi = {
  listProducts: (q: ProductQuery) => api<ProductPage>(`/inventory/products${qs(q)}`),
  getProduct: (id: string) => api<ProductDetail>(`/inventory/products/${id}`),
  formOptions: () => api<ProductFormOptions>('/inventory/products/options'),
  createProduct: (body: ProductInput) =>
    api<ProductDetail>('/inventory/products', json('POST', body)),
  updateProduct: (id: string, body: ProductInput) =>
    api<ProductDetail>(`/inventory/products/${id}`, json('PATCH', body)),
  setActive: (id: string, active: boolean) =>
    api<ProductDetail>(`/inventory/products/${id}/${active ? 'activate' : 'deactivate'}`, {
      method: 'POST',
    }),
  uploadImage: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api<ProductDetail>(`/inventory/products/${id}/image`, { method: 'POST', body: form });
  },
  removeImage: (id: string) =>
    api<ProductDetail>(`/inventory/products/${id}/image`, { method: 'DELETE' }),

  listCategories: (includeInactive = false) =>
    api<Category[]>(
      `/inventory/categories${qs({ includeInactive: includeInactive || undefined })}`,
    ),
  createCategory: (body: { name: string; parentId: string | null }) =>
    api<Category>('/inventory/categories', json('POST', body)),
  updateCategory: (
    id: string,
    body: Partial<{ name: string; parentId: string | null; isActive: boolean }>,
  ) => api<Category>(`/inventory/categories/${id}`, json('PATCH', body)),

  createUnit: (body: { code: string; name: string }) =>
    api<Unit>('/inventory/units', json('POST', body)),
  createTaxRate: (body: { name: string; rate: number }) =>
    api<TaxRate>('/settings/tax-rates', json('POST', body)),
};

const numberFmt = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const qtyFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

/** Display a decimal string as money (2 decimals). */
export const money = (v: string | null | undefined) =>
  v === null || v === undefined ? '—' : numberFmt.format(Number(v));
/** Display a quantity (up to 4 decimals, no trailing zeros). */
export const qty = (v: string | null | undefined) =>
  v === null || v === undefined ? '—' : qtyFmt.format(Number(v));
