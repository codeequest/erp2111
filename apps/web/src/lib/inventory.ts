/** Types and calls for the Inventory › Products API. Decimals arrive as strings. */
import { api } from './api';

export interface Unit {
  id: string;
  code: string;
  name: string;
  _count?: { baseProducts: number; productUnits: number };
}

export interface TaxRate {
  id: string;
  name: string;
  rate: string;
  isDefault?: boolean;
}

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  productCount: number;
  children: CategoryNode[];
}

export interface ProductListItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  isActive: boolean;
  salePrice: string;
  /** Only present with inventory.cost.view */
  averageCost?: string;
  /** Reference purchase price — only present with inventory.cost.view */
  purchasePrice?: string;
  /** Price in the price list asked for with priceListId */
  listPrice?: string;
  trackLots: boolean;
  minStock: string;
  onHand: string;
  isLowStock: boolean;
  /** Set when the product has a photo */
  imageUpdatedAt: string | null;
  category: { id: string; name: string } | null;
  baseUnit: Unit;
  taxRate: TaxRate | null;
}

export interface ProductDetail extends ProductListItem {
  description: string | null;
  categoryId: string | null;
  baseUnitId: string;
  taxRateId: string | null;
  createdAt: string;
  updatedAt: string;
  units: {
    id: string;
    unitId: string;
    factor: string;
    forPurchase: boolean;
    forSale: boolean;
    barcode: string | null;
    unit: Unit;
  }[];
  stockBalances: {
    warehouseId: string;
    quantity: string;
    warehouse: { id: string; code: string; name: string; isActive: boolean };
  }[];
  lots: Lot[];
}

export interface Lot {
  id: string;
  lotNumber: string;
  /** ISO date, or null when the lot does not expire */
  expiryDate: string | null;
  balances: {
    warehouseId: string;
    quantity: string;
    warehouse: { id: string; code: string; name: string };
  }[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductInput {
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  baseUnitId: string;
  taxRateId: string | null;
  salePrice: number;
  /** Only sent by users who may see costs */
  purchasePrice?: number;
  minStock: number;
  trackLots: boolean;
  units: {
    unitId: string;
    factor: number;
    forPurchase: boolean;
    forSale: boolean;
    barcode: string | null;
  }[];
}

export interface ImportReport {
  dryRun: boolean;
  totalRows: number;
  created: number;
  updated: number;
  newCategories: string[];
  errors: { line: number; message: string }[];
  saved: boolean;
}

export interface ProductQuery {
  q?: string;
  categoryId?: string;
  status?: 'active' | 'inactive' | 'all';
  lowStock?: boolean;
  /** Lot-tracked products with stock expiring within 30 days or expired */
  expiring?: boolean;
  priceListId?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export function listProducts(query: ProductQuery) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '' && v !== false) params.set(k, String(v));
  }
  return api<Page<ProductListItem>>(`/inventory/products?${params}`);
}

export const getProduct = (id: string) => api<ProductDetail>(`/inventory/products/${id}`);

export const createProduct = (input: ProductInput) =>
  api<ProductDetail>('/inventory/products', { method: 'POST', body: JSON.stringify(input) });

export const updateProduct = (id: string, input: Partial<ProductInput>) =>
  api<ProductDetail>(`/inventory/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) });

export const setProductActive = (id: string, active: boolean) =>
  api<ProductDetail>(`/inventory/products/${id}/${active ? 'activate' : 'deactivate'}`, {
    method: 'POST',
  });

export const importProducts = (csv: string, dryRun: boolean) =>
  api<ImportReport>('/inventory/products/import', {
    method: 'POST',
    body: JSON.stringify({ csv, dryRun }),
  });

export const listUnits = () => api<Unit[]>('/inventory/units');
export const createUnit = (code: string, name: string) =>
  api<Unit>('/inventory/units', { method: 'POST', body: JSON.stringify({ code, name }) });

export const listTaxRates = () => api<TaxRate[]>('/inventory/tax-rates');

export const listCategories = () => api<CategoryNode[]>('/inventory/categories');
export const createCategory = (name: string, parentId: string | null) =>
  api('/inventory/categories', { method: 'POST', body: JSON.stringify({ name, parentId }) });
export const updateCategory = (
  id: string,
  data: { name?: string; parentId?: string | null; isActive?: boolean },
) => api(`/inventory/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

/** Flattens the category tree into an indented list for <select>s. */
export function flattenCategories(
  nodes: CategoryNode[],
  depth = 0,
): (CategoryNode & { depth: number; path: string })[] {
  return nodes.flatMap((n) => [
    { ...n, depth, path: n.name },
    ...flattenCategories(n.children, depth + 1).map((c) => ({
      ...c,
      path: `${n.name} › ${c.path}`,
    })),
  ]);
}

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const money = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export const fmtQty = (v: string | number) => number.format(Number(v));
export const fmtMoney = (v: string | number) => money.format(Number(v));

/** Builds a CSV (semicolon, Excel-friendly) and downloads it. */
export function downloadCsv(
  filename: string,
  header: string[],
  rows: (string | number | null)[][],
) {
  const esc = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = '﻿' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ───────────── Photos, warehouses, opening stock, tax ─────────────

/** Public, cache-busted URL of a product photo (null when it has none). */
export function productImageUrl(p: { id: string; imageUpdatedAt: string | null }): string | null {
  return p.imageUpdatedAt
    ? `/api/v1/inventory/products/${p.id}/image?v=${new Date(p.imageUpdatedAt).getTime()}`
    : null;
}

export const uploadProductImage = (id: string, dataUrl: string) =>
  api<{ id: string; imageUpdatedAt: string | null }>(`/inventory/products/${id}/image`, {
    method: 'PUT',
    body: JSON.stringify({ dataUrl }),
  });

export const removeProductImage = (id: string) =>
  api<{ id: string; imageUpdatedAt: string | null }>(`/inventory/products/${id}/image`, {
    method: 'DELETE',
  });

/** Shrinks a picture in the browser (max 800 px, JPEG) so uploads stay small. */
export async function resizeImage(file: File, max = 800): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error('Choose a JPEG, PNG or WebP picture');
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs get a white background
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}
export const listWarehouses = () => api<Warehouse[]>('/inventory/warehouses');

export interface OpeningReport {
  dryRun: boolean;
  totalRows: number;
  totalQuantity: string;
  totalValue: string;
  errors: { line: number; message: string }[];
  saved: boolean;
}

export const openingBalances = (
  body:
    | { csv: string; dryRun: boolean }
    | {
        lines: {
          productId: string;
          warehouseId: string;
          quantity: number;
          unitCost: number;
          lotNumber?: string;
          expiryDate?: string;
        }[];
        dryRun: boolean;
      },
) =>
  api<OpeningReport>('/inventory/stock/opening-balances', {
    method: 'POST',
    body: JSON.stringify(body),
  });

/** Sale price including tax; uses the product's rate, else the company default. */
export function priceWithTax(salePrice: string | number, rate: string | number | undefined) {
  return Number(salePrice) * (1 + Number(rate ?? 0) / 100);
}

// ───────────── CSV in the browser (for small reference lists) ─────────────

/** Minimal CSV parser: `,` or `;` (auto-detected), quotes, BOM. Returns rows of cells. */
export function parseCsvText(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const head = src.split(/\r?\n/, 1)[0] ?? '';
  const d = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        f += '"';
        i++;
      } else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === d) {
      row.push(f);
      f = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = '';
    } else f += c;
  }
  if (f !== '' || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/** Lower-cases and strips accents so "Catégorie" matches "categorie". */
export const normHeader = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]+/g, '_');

export const toNum = (v: string) => Number(v.trim().replace(/\s/g, '').replace(',', '.'));

/** Exact lookup used by barcode scanners (product barcode, packaging barcode or SKU). */
export const findProductByCode = (code: string) =>
  api<{ product: ProductDetail | null; matchedUnit: { code: string; factor: string } | null }>(
    `/inventory/products/by-code/${encodeURIComponent(code)}`,
  );

const price2 = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
/** Customer-facing price (incl. VAT), rounded to cents. */
export const fmtPrice = (v: string | number) => price2.format(Number(v));

// ───────────── Margin ─────────────

/** Margin on the sale price, in % (null when there is no sale price). */
export function marginPct(sale: number, purchase: number): number | null {
  return sale > 0 ? ((sale - purchase) / sale) * 100 : null;
}

/** Sale price giving a margin of `pct` % on the sale price (null when pct ≥ 100). */
export function saleFromMargin(purchase: number, pct: number): number | null {
  return pct < 100 ? Math.round((purchase / (1 - pct / 100)) * 100) / 100 : null;
}

// ───────────── Lots / expiry ─────────────

/** Whole days from today until an ISO date (negative = already expired). */
export function daysLeft(iso: string): number {
  const d = new Date(iso);
  const expiry = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((expiry - today) / 86_400_000);
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { timeZone: 'UTC' });

export interface ExpiringLot {
  id: string;
  lotNumber: string;
  expiryDate: string;
  daysLeft: number;
  quantity: string;
  product: { id: string; sku: string; name: string; baseUnit: { code: string } };
}
export const listExpiringLots = (days = 30) =>
  api<ExpiringLot[]>(`/inventory/stock/expiring-lots?days=${days}`);

// ───────────── Stock movements ─────────────

export type StockMoveType =
  | 'OPENING'
  | 'RECEIPT'
  | 'DELIVERY'
  | 'ADJUSTMENT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'CUSTOMER_RETURN';

export const MOVE_TYPE_LABELS: Record<StockMoveType, string> = {
  OPENING: 'Opening stock',
  RECEIPT: 'Goods receipt',
  DELIVERY: 'Delivery',
  ADJUSTMENT: 'Adjustment',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
  CUSTOMER_RETURN: 'Customer return',
};

export interface StockMoveRow {
  id: string;
  createdAt: string;
  type: StockMoveType;
  quantity: string;
  unitCost?: string;
  reference: string | null;
  reason: string | null;
  product: { id: string; sku: string; name: string; baseUnit: { code: string } };
  warehouse: { id: string; code: string; name: string };
  lot: { id: string; lotNumber: string; expiryDate: string | null } | null;
  createdBy: { id: string; fullName: string };
  balanceAfter?: string;
}

export interface MovesQuery {
  productId?: string;
  warehouseId?: string;
  type?: StockMoveType;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function listMoves(query: MovesQuery) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== '') params.set(k, String(v));
  return api<Page<StockMoveRow>>(`/inventory/stock/moves?${params}`);
}

// ───────────── Price lists ─────────────

export interface PriceList {
  id: string;
  code: string;
  name: string;
  adjustmentPct: string;
  isActive: boolean;
  fixedPriceCount?: number;
  customerCount?: number;
}

export interface PriceListItem {
  id: string;
  sku: string;
  name: string;
  salePrice: string;
  baseUnit: { code: string };
  fixedPrice: string | null;
  price: string;
}

export interface ProductListPrice {
  priceListId: string;
  code: string;
  name: string;
  adjustmentPct: string;
  fixedPrice: string | null;
  price: string;
}

export interface PriceImportReport {
  dryRun: boolean;
  totalRows: number;
  fixed: number;
  cleared: number;
  errors: { line: number; message: string }[];
  saved: boolean;
}

export const listPriceLists = () => api<PriceList[]>('/inventory/price-lists');
export const createPriceList = (data: { code: string; name: string; adjustmentPct: number }) =>
  api<PriceList>('/inventory/price-lists', { method: 'POST', body: JSON.stringify(data) });
export const updatePriceList = (
  id: string,
  data: Partial<{ code: string; name: string; adjustmentPct: number; isActive: boolean }>,
) =>
  api<PriceList>(`/inventory/price-lists/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export function listPriceListItems(
  id: string,
  query: { q?: string; page?: number; pageSize?: number },
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== '') params.set(k, String(v));
  return api<Page<PriceListItem> & { priceList: PriceList }>(
    `/inventory/price-lists/${id}/items?${params}`,
  );
}

export const importPriceListPrices = (id: string, csv: string, dryRun: boolean) =>
  api<PriceImportReport>(`/inventory/price-lists/${id}/import`, {
    method: 'POST',
    body: JSON.stringify({ csv, dryRun }),
  });

export const getProductPrices = (productId: string) =>
  api<ProductListPrice[]>(`/inventory/products/${productId}/prices`);

export const setProductPrices = (
  productId: string,
  prices: { priceListId: string; price: number | null }[],
) =>
  api<ProductListPrice[]>(`/inventory/products/${productId}/prices`, {
    method: 'PUT',
    body: JSON.stringify({ prices }),
  });

/** Fetches every page of a paged endpoint (for exports). */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<Page<T>>,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    const res = await fetchPage(page);
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) return all;
  }
}
