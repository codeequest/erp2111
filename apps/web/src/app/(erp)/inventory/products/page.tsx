'use client';

/**
 * Product search: free text (name, SKU, barcode, description, category), filters
 * (category, stock status, active/inactive, price range), sortable columns,
 * pagination and a detail panel. The filters live in the URL so a search can be
 * shared or bookmarked.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Package,
  PackageSearch,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type {
  CategoryOption,
  ProductDetail,
  ProductListItem,
  ProductSearchResult,
  ProductSort,
  ProductStatusFilter,
  SortOrder,
  StockStatus,
} from '@erp/shared';
import { api, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Filters {
  q: string;
  categoryId: string;
  stockStatus: StockStatus | '';
  status: ProductStatusFilter;
  minPrice: string;
  maxPrice: string;
  sort: ProductSort;
  order: SortOrder;
  page: number;
  pageSize: number;
}

const DEFAULTS: Filters = {
  q: '',
  categoryId: '',
  stockStatus: '',
  status: 'active',
  minPrice: '',
  maxPrice: '',
  sort: 'relevance',
  order: 'asc',
  page: 1,
  pageSize: 25,
};

const STOCK_LABELS: Record<StockStatus, { label: string; badge: string; dot: string }> = {
  in_stock: { label: 'In stock', badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  low: { label: 'Low stock', badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  out: { label: 'Out of stock', badge: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
};

const money = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

function readUrl(): Filters {
  if (typeof window === 'undefined') return DEFAULTS;
  const p = new URLSearchParams(window.location.search);
  const f = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof Filters)[]) {
    const v = p.get(key);
    if (v === null) continue;
    (f as Record<string, unknown>)[key] = typeof DEFAULTS[key] === 'number' ? Number(v) || DEFAULTS[key] : v;
  }
  return f;
}

function toQuery(f: Filters, includeDefaults: boolean): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(f)) {
    if (value === '' || (!includeDefaults && value === DEFAULTS[key as keyof Filters])) continue;
    p.set(key, String(value));
  }
  return p.toString();
}

/** Highlights every search word inside a cell. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length || !text) return <>{text}</>;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-sm bg-yellow-100 text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default function ProductsPage() {
  const { can } = useAuth();
  const canViewCost = can('inventory.cost.view');

  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [searchText, setSearchText] = useState('');
  const [result, setResult] = useState<ProductSearchResult | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  // Start from the URL (shared / bookmarked searches).
  useEffect(() => {
    const initial = readUrl();
    setFilters(initial);
    setSearchText(initial.q);
    setShowFilters(Boolean(initial.categoryId || initial.minPrice || initial.maxPrice || initial.status !== 'active'));
  }, []);

  const update = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, page: 1, ...patch }));
  }, []);

  // Debounce typing: search 250 ms after the last key.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === searchText.trim() ? f : { ...f, q: searchText.trim(), page: 1 }));
    }, 250);
    return () => clearTimeout(t);
  }, [searchText]);

  // Load results whenever the filters change; ignore answers to older requests.
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    const qs = toQuery(filters, false);
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    api<ProductSearchResult>(`/inventory/products?${toQuery(filters, true)}`)
      .then((r) => {
        if (id !== requestId.current) return;
        setResult(r);
        setError(null);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(e instanceof ApiRequestError ? e.message : 'Could not load products');
      })
      .finally(() => id === requestId.current && setLoading(false));
  }, [filters]);

  useEffect(() => {
    api<CategoryOption[]>('/inventory/categories').then(setCategories).catch(() => setCategories([]));
  }, []);

  // "/" focuses the search box, Escape clears it or closes the panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = (e.target as HTMLElement)?.closest('input, select, textarea');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (selectedId) setSelectedId(null);
        else if (document.activeElement === searchRef.current) setSearchText('');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const terms = useMemo(() => filters.q.split(/\s+/).filter(Boolean), [filters.q]);
  const categoryTree = useMemo(() => {
    const roots = categories.filter((c) => !c.parentId);
    return roots.map((r) => ({ ...r, children: categories.filter((c) => c.parentId === r.id) }));
  }, [categories]);

  const activeChips: { label: string; clear: Partial<Filters> }[] = [];
  if (filters.categoryId) {
    const c = categories.find((x) => x.id === filters.categoryId);
    activeChips.push({ label: `Category: ${c?.name ?? '…'}`, clear: { categoryId: '' } });
  }
  if (filters.minPrice) activeChips.push({ label: `Price ≥ ${filters.minPrice}`, clear: { minPrice: '' } });
  if (filters.maxPrice) activeChips.push({ label: `Price ≤ ${filters.maxPrice}`, clear: { maxPrice: '' } });
  if (filters.status !== 'active')
    activeChips.push({ label: filters.status === 'all' ? 'Active + inactive' : 'Inactive only', clear: { status: 'active' } });

  function sortBy(sort: ProductSort) {
    if (filters.sort === sort) update({ order: filters.order === 'asc' ? 'desc' : 'asc' });
    else update({ sort, order: sort === 'updated' || sort === 'stock' ? 'desc' : 'asc' });
  }

  if (!can('inventory.product.read')) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <Lock className="mx-auto size-8 text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Access denied</h1>
        <p className="mt-1 text-sm text-slate-500">
          You need the <code className="rounded bg-slate-100 px-1">inventory.product.read</code> permission.
        </p>
      </div>
    );
  }

  const total = result?.total ?? 0;
  const facets = result?.facets ?? { in_stock: 0, low: 0, out: 0 };
  const allCount = facets.in_stock + facets.low + facets.out;
  const pages = Math.max(1, Math.ceil(total / filters.pageSize));
  const from = total ? (filters.page - 1) * filters.pageSize + 1 : 0;
  const to = Math.min(filters.page * filters.pageSize, total);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div>
        <nav className="flex items-center gap-1 text-xs text-slate-500">
          <Link href="/dashboard" className="hover:text-slate-700">Home</Link>
          <ChevronRight className="size-3" />
          <span className="text-mod-inventory">Inventory</span>
          <ChevronRight className="size-3" />
          <span>Products</span>
        </nav>
        <div className="mt-2 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-mod-inventory/10">
            <Package className="size-5 text-mod-inventory" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
            <p className="text-sm text-slate-500">Search the catalogue by name, SKU, barcode or category</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Search bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
          <div className="relative min-w-60 flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search products, SKU, barcode…"
              aria-label="Search products"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-16 pl-9 text-sm outline-none focus:border-mod-inventory focus:bg-white focus:ring-2 focus:ring-mod-inventory/20"
            />
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
              {loading && <Loader2 className="size-4 animate-spin text-slate-400" />}
              {searchText ? (
                <button onClick={() => setSearchText('')} aria-label="Clear search" className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <X className="size-4" />
                </button>
              ) : (
                <kbd className="rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-400">/</kbd>
              )}
            </div>
          </div>

          <select
            value={filters.categoryId}
            onChange={(e) => update({ categoryId: e.target.value })}
            aria-label="Category"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {categoryTree.map((root) => (
              <optgroup key={root.id} label={root.name}>
                <option value={root.id}>All {root.name}</option>
                {root.children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.productCount})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <button
            onClick={() => setShowFilters((s) => !s)}
            className={clsx(
              'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
              showFilters ? 'border-mod-inventory bg-mod-inventory/5 text-mod-inventory' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
          >
            <SlidersHorizontal className="size-4" /> Filters
          </button>
        </div>

        {/* Advanced filters */}
        {showFilters && (
          <div className="grid gap-3 border-b border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-slate-500">
              Status
              <select
                value={filters.status}
                onChange={(e) => update({ status: e.target.value as ProductStatusFilter })}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Min price
              <input
                type="number" min={0} step="0.01" value={filters.minPrice}
                onChange={(e) => update({ minPrice: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Max price
              <input
                type="number" min={0} step="0.01" value={filters.maxPrice}
                onChange={(e) => update({ maxPrice: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>
          </div>
        )}

        {/* Stock status tabs with counts */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
          {([['', 'All', allCount], ['in_stock', 'In stock', facets.in_stock], ['low', 'Low stock', facets.low], ['out', 'Out of stock', facets.out]] as const).map(
            ([value, label, count]) => (
              <button
                key={value}
                onClick={() => update({ stockStatus: value })}
                className={clsx(
                  'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm',
                  filters.stockStatus === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {value && <span className={clsx('size-2 rounded-full', STOCK_LABELS[value].dot)} />}
                {label}
                <span className={clsx('text-xs', filters.stockStatus === value ? 'text-slate-300' : 'text-slate-400')}>{count}</span>
              </button>
            ),
          )}
          {activeChips.map((chip) => (
            <button
              key={chip.label}
              onClick={() => update(chip.clear)}
              className="inline-flex items-center gap-1 rounded-full bg-mod-inventory/10 px-3 py-1 text-xs text-mod-inventory hover:bg-mod-inventory/20"
            >
              {chip.label} <X className="size-3" />
            </button>
          ))}
          {(activeChips.length > 0 || filters.q || filters.stockStatus) && (
            <button
              onClick={() => {
                setSearchText('');
                setFilters(DEFAULTS);
              }}
              className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Reset all
            </button>
          )}
        </div>

        {/* Results */}
        {error ? (
          <div className="p-10 text-center text-sm text-red-600">{error}</div>
        ) : result && result.items.length === 0 && !loading ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <PackageSearch className="size-10 text-slate-300" />
            <h2 className="mt-3 font-semibold text-slate-900">No products found</h2>
            <p className="mt-1 text-sm text-slate-500">Try other words, or remove some filters.</p>
          </div>
        ) : (
          <div className={clsx('overflow-x-auto transition-opacity', loading && result && 'opacity-60')}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <SortHeader label="Product" sort="name" filters={filters} onSort={sortBy} />
                  <SortHeader label="SKU" sort="sku" filters={filters} onSort={sortBy} />
                  <th className="px-4 py-2.5">Category</th>
                  <SortHeader label="Price" sort="price" filters={filters} onSort={sortBy} align="right" />
                  {canViewCost && <th className="px-4 py-2.5 text-right">Cost</th>}
                  <SortHeader label="Stock" sort="stock" filters={filters} onSort={sortBy} align="right" />
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!result
                  ? Array.from({ length: 8 }, (_, i) => (
                      <tr key={i}>
                        <td colSpan={canViewCost ? 7 : 6} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-slate-100" />
                        </td>
                      </tr>
                    ))
                  : result.items.map((p) => (
                      <ProductRow
                        key={p.id}
                        p={p}
                        terms={terms}
                        canViewCost={canViewCost}
                        selected={p.id === selectedId}
                        onOpen={() => setSelectedId(p.id)}
                      />
                    ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
          <span>
            {total ? `${from}–${to} of ${total} products` : 'No results'}
          </span>
          <div className="flex items-center gap-3">
            <select
              value={filters.pageSize}
              onChange={(e) => update({ pageSize: Number(e.target.value) })}
              aria-label="Rows per page"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
            <button
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              disabled={filters.page <= 1}
              aria-label="Previous page"
              className="rounded-md border border-slate-200 p-1.5 enabled:hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span>Page {filters.page} / {pages}</span>
            <button
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              disabled={filters.page >= pages}
              aria-label="Next page"
              className="rounded-md border border-slate-200 p-1.5 enabled:hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {selectedId && (
        <ProductPanel id={selectedId} canViewCost={canViewCost} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function SortHeader({
  label, sort, filters, onSort, align = 'left',
}: {
  label: string;
  sort: ProductSort;
  filters: Filters;
  onSort: (s: ProductSort) => void;
  align?: 'left' | 'right';
}) {
  const active = filters.sort === sort;
  const Icon = filters.order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={clsx('px-4 py-2.5', align === 'right' && 'text-right')}
      aria-sort={active ? (filters.order === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button
        onClick={() => onSort(sort)}
        className={clsx('inline-flex items-center gap-1 uppercase hover:text-slate-800', active && 'text-slate-900')}
      >
        {label}
        {active && <Icon className="size-3" />}
      </button>
    </th>
  );
}

function ProductRow({
  p, terms, canViewCost, selected, onOpen,
}: {
  p: ProductListItem;
  terms: string[];
  canViewCost: boolean;
  selected: boolean;
  onOpen: () => void;
}) {
  const s = STOCK_LABELS[p.stockStatus];
  return (
    <tr
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      tabIndex={0}
      className={clsx('cursor-pointer outline-none hover:bg-slate-50 focus:bg-slate-50', selected && 'bg-mod-inventory/5')}
    >
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">
          <Highlight text={p.name} terms={terms} />
        </div>
        {p.barcode && (
          <div className="font-mono text-xs text-slate-400">
            <Highlight text={p.barcode} terms={terms} />
          </div>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-600">
        <Highlight text={p.sku} terms={terms} />
      </td>
      <td className="px-4 py-3 text-slate-600">{p.category ? <Highlight text={p.category.name} terms={terms} /> : '—'}</td>
      <td className="px-4 py-3 text-right font-medium text-slate-900 tabular-nums">{money.format(p.salePrice)}</td>
      {canViewCost && (
        <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
          {p.averageCost !== undefined ? money.format(p.averageCost) : '—'}
        </td>
      )}
      <td className="px-4 py-3 text-right tabular-nums">
        <span className="font-medium text-slate-900">{qty.format(p.stock)}</span>{' '}
        <span className="text-xs text-slate-400">{p.unit}</span>
      </td>
      <td className="px-4 py-3">
        <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', s.badge)}>
          <span className={clsx('size-1.5 rounded-full', s.dot)} />
          {s.label}
        </span>
        {!p.isActive && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactive</span>}
      </td>
    </tr>
  );
}

function ProductPanel({ id, canViewCost, onClose }: { id: string; canViewCost: boolean; onClose: () => void }) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProduct(null);
    setError(null);
    api<ProductDetail>(`/inventory/products/${id}`)
      .then(setProduct)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load product'));
  }, [id]);

  const margin =
    product && product.averageCost !== undefined && product.salePrice > 0
      ? ((product.salePrice - product.averageCost) / product.salePrice) * 100
      : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Product details">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <p className="font-mono text-xs text-slate-500">{product?.sku ?? ' '}</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{product?.name ?? 'Loading…'}</h2>
            {product?.category && <p className="text-sm text-slate-500">{product.category.name}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="size-5" />
          </button>
        </div>

        {error && <p className="p-5 text-sm text-red-600">{error}</p>}
        {!product && !error && (
          <div className="grid flex-1 place-items-center">
            <Loader2 className="size-6 animate-spin text-slate-400" />
          </div>
        )}

        {product && (
          <div className="space-y-6 p-5">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Sale price" value={money.format(product.salePrice)} />
              <Stat label="Total stock" value={`${qty.format(product.stock)} ${product.unit}`} tone={STOCK_LABELS[product.stockStatus]} />
              {canViewCost && product.averageCost !== undefined && (
                <>
                  <Stat label="Average cost" value={money.format(product.averageCost)} />
                  <Stat label="Margin" value={margin === null ? '—' : `${margin.toFixed(1)} %`} />
                </>
              )}
            </div>

            <dl className="grid grid-cols-3 gap-y-2 text-sm">
              <dt className="text-slate-500">Barcode</dt>
              <dd className="col-span-2 font-mono text-slate-900">{product.barcode ?? '—'}</dd>
              <dt className="text-slate-500">Unit</dt>
              <dd className="col-span-2 text-slate-900">{product.unit}</dd>
              <dt className="text-slate-500">Tax</dt>
              <dd className="col-span-2 text-slate-900">{product.taxRate ? product.taxRate.name : '—'}</dd>
              <dt className="text-slate-500">Min. stock</dt>
              <dd className="col-span-2 text-slate-900">{qty.format(product.minStock)} {product.unit}</dd>
              <dt className="text-slate-500">Status</dt>
              <dd className="col-span-2 text-slate-900">{product.isActive ? 'Active' : 'Inactive'}</dd>
            </dl>

            {product.description && (
              <div>
                <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Description</h3>
                <p className="mt-1 text-sm text-slate-700">{product.description}</p>
              </div>
            )}

            <div>
              <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Stock by warehouse</h3>
              {product.stockByWarehouse.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No stock in any warehouse.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {product.stockByWarehouse.map((w) => (
                    <li key={w.warehouseId} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>
                        <span className="font-mono text-xs text-slate-400">{w.code}</span>{' '}
                        <span className="text-slate-700">{w.name}</span>
                      </span>
                      <span className="font-medium text-slate-900 tabular-nums">{qty.format(w.quantity)} {product.unit}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: { label: string; badge: string } }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{value}</p>
      {tone && <span className={clsx('mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium', tone.badge)}>{tone.label}</span>}
    </div>
  );
}
