import type {
  CategoryDto,
  PageResult,
  ProductCodeSequence,
  ProductDetail,
  ProductInput,
  ProductListItem,
  ProductListQuery,
  TaxRateDto,
  TrackingMode,
  UnitDto,
} from '@erp/shared';
import { api } from './api';

/** Typed calls to the Inventory API. */

function toQuery(params: object): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const inventoryApi = {
  listProducts: (q: ProductListQuery) =>
    api<PageResult<ProductListItem>>(`/inventory/products${toQuery(q)}`),
  getProduct: (id: string) => api<ProductDetail>(`/inventory/products/${id}`),
  createProduct: (body: ProductInput) =>
    api<ProductDetail>('/inventory/products', { method: 'POST', body: JSON.stringify(body) }),
  updateProduct: (id: string, body: Partial<ProductInput>) =>
    api<ProductDetail>(`/inventory/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  setProductActive: (id: string, active: boolean) =>
    api<ProductDetail>(`/inventory/products/${id}/${active ? 'activate' : 'deactivate'}`, {
      method: 'POST',
    }),
  uploadPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api<ProductDetail>(`/inventory/products/${id}/photo`, { method: 'POST', body: form });
  },
  removePhoto: (id: string) =>
    api<ProductDetail>(`/inventory/products/${id}/photo`, { method: 'DELETE' }),
  getCodeSequence: () => api<ProductCodeSequence>('/inventory/product-code'),
  listUnits: () => api<UnitDto[]>('/inventory/units'),
  listCategories: () => api<CategoryDto[]>('/inventory/categories'),
  listTaxRates: () => api<TaxRateDto[]>('/inventory/tax-rates'),
};

/** Plain-language labels for the tracking modes (shown to non-technical users). */
export const TRACKING_LABELS: Record<TrackingMode, { label: string; help: string }> = {
  NONE: { label: 'Quantity only', help: 'Just count how many you have.' },
  LOT: { label: 'By lot / batch', help: 'Each batch has a lot number, e.g. food or medicine.' },
  SERIAL: { label: 'By serial number', help: 'Every single item has its own number, e.g. phones.' },
};

/**
 * "Edit from the list": the list stores its own address under RETURN_KEY so the
 * product page can go back to the same page / filters; the product page stores the
 * edited id under EDITED_KEY so the list can briefly highlight that row.
 */
export const LIST_RETURN_KEY = 'products:returnTo';
export const LIST_EDITED_KEY = 'products:justEdited';

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Display-only formatting of a decimal string from the API ("12.5000" → "12.50").
 * Never use the result for calculations — the API does all the maths in Decimal.
 */
export function formatAmount(value: string | undefined, decimals = 2): string {
  if (value === undefined) return '—';
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Quantities: show only the decimals that matter ("24.0000" → "24", "1.5000" → "1.5"). */
export function formatQty(value: string): string {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** Category label with its parent path, e.g. "Beverages › Sodas". */
export function categoryPaths(categories: CategoryDto[]): Map<string, string> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const paths = new Map<string, string>();
  for (const c of categories) {
    const parts: string[] = [];
    let cursor: CategoryDto | undefined = c;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      parts.unshift(cursor.name);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    paths.set(c.id, parts.join(' › '));
  }
  return paths;
}
