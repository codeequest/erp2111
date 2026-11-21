import { api } from './api';

/** Types and API calls of Inventory › Products. Decimals are strings (exact values). */

export interface Ref {
  id: string;
  name: string;
}
export interface UnitRef {
  id: string;
  code: string;
  name?: string;
}
export interface PriceListRef {
  id: string;
  code: string;
  name: string;
}
export type VariantValues = Record<string, string>;
export interface VariantOption {
  name: string;
  values: string[];
}

export interface ProductListItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: Ref | null;
  baseUnit: UnitRef;
  parent: Ref | null;
  salePrice: string;
  averageCost?: string;
  minStock: string;
  isActive: boolean;
  hasVariants: boolean;
  variantCount: number;
  variantValues: VariantValues | null;
  onHand: string;
  lowStock: boolean;
  imageUrl: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PriceRow {
  priceList: PriceListRef;
  price: string | null;
}

export interface ProductVariant {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  variantValues: VariantValues | null;
  salePrice: string;
  averageCost?: string;
  minStock: string;
  isActive: boolean;
  onHand: string;
  lowStock: boolean;
  prices: PriceRow[];
  imageUrl: string | null;
}

export interface ProductImage {
  id: string;
  url: string;
  fileName: string;
  isMain: boolean;
}

export interface ProductDetail {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category: Ref | null;
  baseUnit: UnitRef;
  taxRate: { id: string; name: string; rate: string } | null;
  salePrice: string;
  averageCost?: string;
  minStock: string;
  isActive: boolean;
  hasVariants: boolean;
  variantOptions: VariantOption[] | null;
  variantValues: VariantValues | null;
  parent: { id: string; name: string; sku: string } | null;
  createdAt: string;
  updatedAt: string;
  onHand: string;
  units: {
    id: string;
    unit: UnitRef;
    factor: string;
    forPurchase: boolean;
    forSale: boolean;
    barcode: string | null;
  }[];
  images: ProductImage[];
  prices: PriceRow[];
  variants: ProductVariant[];
  stock: { warehouse: { id: string; code: string; name: string }; quantity: string }[];
  recentMoves: {
    id: string;
    createdAt: string;
    type: string;
    sku: string;
    warehouse: string;
    quantity: string;
    reference: string | null;
    reason: string | null;
    createdBy: string;
  }[];
}

export interface ProductStats {
  days: number;
  since: string;
  onHand: string;
  soldQty: string;
  revenue: string;
  orderCount: number;
  coverageDays: number | null;
  stockValue?: string;
  cost?: string;
  grossMargin?: string;
  marginPct?: number | null;
  series: { date: string; revenue: string }[];
}

export interface FormOptions {
  categories: { id: string; name: string; parentId: string | null }[];
  units: UnitRef[];
  taxRates: { id: string; name: string; rate: string }[];
  priceLists: PriceListRef[];
  warehouses: { id: string; code: string; name: string }[];
}

export interface LowStockItem {
  id: string;
  sku: string;
  name: string;
  minStock: string;
  onHand: string;
  shortage: string;
  parentId: string | null;
  baseUnit: { code: string };
}

export interface ProductInput {
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  baseUnitId: string;
  taxRateId: string | null;
  salePrice: string;
  minStock: string;
  hasVariants?: boolean;
  variantOptions?: VariantOption[];
  prices?: { priceListId: string; price: string | null }[];
}

export interface ListQuery {
  q?: string;
  categoryId?: string;
  status?: 'active' | 'inactive' | 'all';
  lowStock?: boolean;
  sort?: 'name' | 'sku' | 'salePrice' | 'createdAt';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

const BASE = '/inventory/products';
const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const productsApi = {
  list(query: ListQuery) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== false) params.set(k, String(v));
    });
    return api<Page<ProductListItem>>(`${BASE}?${params}`);
  },
  get: (id: string) => api<ProductDetail>(`${BASE}/${id}`),
  stats: (id: string, days = 30) => api<ProductStats>(`${BASE}/${id}/stats?days=${days}`),
  formOptions: () => api<FormOptions>(`${BASE}/form-options`),
  create: (input: ProductInput) =>
    api<{ id: string; variantCount: number }>(BASE, json('POST', input)),
  update: (id: string, input: Partial<ProductInput>) =>
    api<{ id: string }>(`${BASE}/${id}`, json('PATCH', input)),
  setActive: (id: string, active: boolean) =>
    api(`${BASE}/${id}/${active ? 'activate' : 'deactivate'}`, { method: 'POST' }),
  addVariants: (id: string, variantOptions: VariantOption[]) =>
    api<{ created: number }>(`${BASE}/${id}/variants`, json('POST', { variantOptions })),
  setPrices: (
    id: string,
    prices: { priceListId: string; price: string | null }[],
    applyToVariants = false,
  ) => api(`${BASE}/${id}/prices`, json('PUT', { prices, applyToVariants })),
  uploadImages(id: string, files: File[]) {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return api<ProductImage[]>(`${BASE}/${id}/images`, { method: 'POST', body: form });
  },
  setMainImage: (id: string, imageId: string) =>
    api(`${BASE}/${id}/images/${imageId}/main`, { method: 'POST' }),
  deleteImage: (id: string, imageId: string) =>
    api(`${BASE}/${id}/images/${imageId}`, { method: 'DELETE' }),
  lowStock: (limit = 5) =>
    api<{ total: number; items: LowStockItem[] }>(`/inventory/stock/low-stock?limit=${limit}`),
  createCategory: (name: string, parentId: string | null) =>
    api<{ id: string; name: string; parentId: string | null }>(
      '/inventory/categories',
      json('POST', { name, parentId }),
    ),
};

/** "Clothing › T-shirts" labels for a flat category list, sorted. */
export function categoryLabels(categories: FormOptions['categories']) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const label = (id: string, depth = 0): string => {
    const c = byId.get(id);
    if (!c) return '';
    return c.parentId && depth < 10 ? `${label(c.parentId, depth + 1)} › ${c.name}` : c.name;
  };
  return categories
    .map((c) => ({ id: c.id, label: label(c.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
