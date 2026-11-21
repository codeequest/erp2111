'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pencil,
  Lock,
  PackageSearch,
  Plus,
  RefreshCw,
  ScanBarcode,
  Search,
  X,
} from 'lucide-react';
import type {
  CategoryDto,
  PageResult,
  ProductListItem,
  ProductSortField,
  ProductStatusFilter,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import {
  LIST_EDITED_KEY,
  LIST_RETURN_KEY,
  categoryPaths,
  formatAmount,
  formatQty,
  inventoryApi,
} from '@/lib/inventory';
import {
  ProductsHeader,
  StatusBadge,
  primaryBtn,
  secondaryBtn,
} from '@/components/inventory/products-header';
import { ProductPhoto } from '@/components/inventory/product-photo';

const RETURN_KEY = LIST_RETURN_KEY;
const EDITED_KEY = LIST_EDITED_KEY;

const PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

export default function ProductsPage() {
  const { can } = useAuth();
  const router = useRouter();
  const canWrite = can('inventory.product.write');
  const canCost = can('inventory.cost.view');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<ProductStatusFilter>('active');
  const [lowStock, setLowStock] = useState(false);
  const [sort, setSort] = useState<ProductSortField>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [reload, setReload] = useState(0);
  /** False until filters were restored from the address bar (avoids a wasted first load). */
  const [ready, setReady] = useState(false);
  const tableTop = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<PageResult<ProductListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);

  const [scanNotice, setScanNotice] = useState<string | null>(null);

  /**
   * Enter in the search box (what a barcode scanner sends after the digits):
   * one exact match on barcode or code → open it directly; nothing → say so clearly;
   * several → just show them in the list.
   */
  async function lookUp(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setSearch(value); // apply now, skip the debounce
    setPage(1);
    try {
      const res = await inventoryApi.listProducts({ search: value, status: 'all', pageSize: 5 });
      const exact = res.items.filter(
        (p) => p.barcode === value || p.sku.toLowerCase() === value.toLowerCase(),
      );
      if (exact.length === 1) {
        router.push(`/inventory/products/${exact[0].id}`);
      } else if (res.total === 1) {
        router.push(`/inventory/products/${res.items[0].id}`);
      } else if (res.total === 0) {
        setScanNotice(value);
      }
    } catch {
      /* the list below shows the error */
    }
  }

  // Restore filters, page and page size from the address bar, so "Back" from a product
  // returns to the same place. (Read after mount to keep server and client HTML identical.)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const q = p.get('q') ?? '';
    setSearchInput(q);
    setSearch(q);
    setCategoryId(p.get('category') ?? '');
    const s = p.get('status');
    if (s === 'inactive' || s === 'all') setStatus(s);
    setLowStock(p.get('low') === '1');
    const so = p.get('sort');
    if (so === 'sku' || so === 'salePrice' || so === 'createdAt') setSort(so);
    if (p.get('order') === 'desc') setOrder('desc');
    const size = Number(p.get('size'));
    if (PAGE_SIZES.includes(size)) setPageSize(size);
    const pg = Number(p.get('page'));
    if (Number.isInteger(pg) && pg > 1) setPage(pg);
    setReady(true);
  }, []);

  // Keep the address bar in sync (only non-default values, so plain URLs stay plain).
  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    if (categoryId) p.set('category', categoryId);
    if (status !== 'active') p.set('status', status);
    if (lowStock) p.set('low', '1');
    if (sort !== 'name') p.set('sort', sort);
    if (order !== 'asc') p.set('order', order);
    if (pageSize !== DEFAULT_PAGE_SIZE) p.set('size', String(pageSize));
    if (page > 1) p.set('page', String(page));
    const qs = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [ready, search, categoryId, status, lowStock, sort, order, pageSize, page]);

  // Debounce the search box so we don't call the API on every keystroke.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      const next = searchInput.trim();
      setSearch((prev) => {
        if (prev !== next) setPage(1); // new search → back to page 1
        return next;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, ready]);

  useEffect(() => {
    inventoryApi
      .listCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    inventoryApi
      .listProducts({ page, pageSize, search, categoryId, status, lowStock, sort, order })
      .then((res) => {
        if (cancelled) return;
        // The page no longer exists (fewer results than before): jump to the last one.
        const last = Math.max(1, Math.ceil(res.total / res.pageSize));
        if (res.items.length === 0 && res.total > 0 && page > last) setPage(last);
        else setData(res);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ready, page, pageSize, search, categoryId, status, lowStock, sort, order, reload]);

  /**
   * Opens the edit form directly. The list address (filters, page) is remembered so
   * Save / Cancel bring the user back exactly here, with the edited row highlighted.
   */
  function editFromList(id: string) {
    try {
      sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);
    } catch {
      /* private mode: Save will fall back to the plain list */
    }
    router.push(`/inventory/products/${id}?edit=1`);
  }

  // Briefly highlight the product that was just edited from the list.
  const [justEdited, setJustEdited] = useState<string | null>(null);
  useEffect(() => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(EDITED_KEY);
      sessionStorage.removeItem(EDITED_KEY);
    } catch {
      /* ignore */
    }
    if (!id) return;
    setJustEdited(id);
    const t = setTimeout(() => setJustEdited(null), 1800);
    return () => clearTimeout(t);
  }, []);

  function goToPage(p: number) {
    setPage(p);
    tableTop.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const paths = useMemo(() => categoryPaths(categories), [categories]);
  const sortedCategories = useMemo(
    () =>
      [...categories].sort((a, b) => (paths.get(a.id) ?? '').localeCompare(paths.get(b.id) ?? '')),
    [categories, paths],
  );

  const hasFilters = search || categoryId || status !== 'active' || lowStock;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function toggleSort(field: ProductSortField) {
    if (sort === field) setOrder(order === 'asc' ? 'desc' : 'asc');
    else {
      setSort(field);
      setOrder('asc');
    }
    setPage(1);
  }

  function clearFilters() {
    setSearchInput('');
    setSearch('');
    setCategoryId('');
    setStatus('active');
    setLowStock(false);
    setPage(1);
  }

  if (!can('inventory.product.read')) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <Lock className="mx-auto size-8 text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Access denied</h1>
        <p className="mt-1 text-sm text-slate-500">
          You need the <code className="rounded bg-slate-100 px-1">inventory.product.read</code>{' '}
          permission. Ask an administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ProductsHeader
        title="Products"
        subtitle="Catalogue of items you buy, stock and sell"
        actions={
          canWrite && (
            <Link href="/inventory/products/new" className={primaryBtn}>
              <Plus className="size-4" /> New product
            </Link>
          )
        }
      />

      <div
        className="animate-fade-in-up overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        style={{ animationDelay: '60ms' }}
      >
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setScanNotice(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void lookUp(searchInput);
                }
              }}
              placeholder="Search name or code, or scan a barcode…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-8 pl-9 text-sm transition outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              aria-label="Search products"
              autoFocus
              autoComplete="off"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            <option value="none">Without category</option>
            {sortedCategories.length > 0 && <option disabled>──────────</option>}
            {sortedCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {paths.get(c.id)}
              </option>
            ))}
          </select>

          <div
            className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm"
            role="group"
          >
            {(['active', 'inactive', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                className={clsx(
                  'rounded-md px-3 py-1.5 capitalize transition',
                  status === s
                    ? 'bg-white font-medium text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}
                aria-pressed={status === s}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setLowStock(!lowStock);
              setPage(1);
            }}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition',
              lowStock
                ? 'border-amber-300 bg-amber-50 font-medium text-amber-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
            aria-pressed={lowStock}
          >
            <AlertTriangle className="size-4" /> Low stock
          </button>

          {hasFilters && (
            <button onClick={clearFilters} className="text-sm text-slate-500 hover:text-slate-800">
              Clear filters
            </button>
          )}

          <span className="ml-auto text-sm text-slate-500">
            {data &&
              !loading &&
              `${data.total.toLocaleString()} product${data.total === 1 ? '' : 's'}`}
          </span>
        </div>

        {scanNotice && (
          <div
            className="animate-fade-in-up flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="status"
          >
            <ScanBarcode className="size-4 shrink-0" />
            <span className="flex-1">
              No product has the barcode or code{' '}
              <span className="font-mono font-semibold">{scanNotice}</span>.
            </span>
            {canWrite && (
              <Link
                href={`/inventory/products/new?barcode=${encodeURIComponent(scanNotice)}`}
                className="font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950"
              >
                Create a product with this barcode
              </Link>
            )}
            <button
              onClick={() => setScanNotice(null)}
              className="rounded p-0.5 text-amber-600 hover:text-amber-900"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Table */}
        <div ref={tableTop} className="scroll-mt-4" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <SortTh
                  field="name"
                  label="Product"
                  sort={sort}
                  order={order}
                  onSort={toggleSort}
                />
                <th className="hidden px-4 py-3 md:table-cell">Category</th>
                <SortTh
                  field="salePrice"
                  label="Sale price"
                  sort={sort}
                  order={order}
                  onSort={toggleSort}
                  right
                />
                {canCost && (
                  <th className="hidden px-4 py-3 text-right lg:table-cell">Avg. cost</th>
                )}
                <th className="px-4 py-3 text-right">On hand</th>
                <th className="hidden px-4 py-3 sm:table-cell">Status</th>
                {canWrite && (
                  <th className="py-3 pr-3">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data && (
                <SkeletonRows cols={5 + (canCost ? 1 : 0) + (canWrite ? 1 : 0)} />
              )}
              {data?.items.map((p, i) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/inventory/products/${p.id}`)}
                  className={clsx(
                    'animate-fade-in-up cursor-pointer transition-colors duration-700 hover:bg-emerald-50/50',
                    loading && 'opacity-50',
                    !p.isActive && 'text-slate-400',
                    justEdited === p.id && 'bg-emerald-100/70',
                  )}
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <ProductPhoto
                        url={p.photoUrl}
                        alt=""
                        className={clsx(
                          'size-10 rounded-lg',
                          !p.isActive && 'opacity-50 grayscale',
                        )}
                        iconClassName="size-4"
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/inventory/products/${p.id}`}
                          className="font-medium text-slate-900 hover:text-emerald-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.name}
                        </Link>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                          <span className="font-mono">{p.sku}</span>
                          {p.tracking !== 'NONE' && (
                            <span className="rounded bg-sky-50 px-1.5 py-px font-medium text-sky-700 ring-1 ring-sky-600/15">
                              {p.tracking === 'LOT' ? 'Lot' : 'Serial no.'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                    {p.category ? (
                      (paths.get(p.category.id) ?? p.category.name)
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                    {formatAmount(p.salePrice)}
                  </td>
                  {canCost && (
                    <td className="hidden px-4 py-3 text-right whitespace-nowrap text-slate-500 tabular-nums lg:table-cell">
                      {formatAmount(p.averageCost)}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                    <StockQty
                      onHand={p.onHand}
                      minStock={p.minStock}
                      isLow={p.isLowStock}
                      unit={p.baseUnit.code}
                    />
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <StatusBadge active={p.isActive} />
                  </td>
                  {canWrite && (
                    <td className="py-2 pr-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          editFromList(p.id);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-emerald-100/70 hover:text-emerald-800 focus-visible:bg-emerald-100/70"
                        aria-label={`Edit ${p.name}`}
                        title="Edit"
                      >
                        <Pencil className="size-4" />
                        <span className="hidden xl:inline">Edit</span>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <AlertTriangle className="size-8 text-rose-500" />
            <p className="text-sm text-slate-600">Could not load products: {error}</p>
            <button onClick={() => setReload((n) => n + 1)} className={secondaryBtn}>
              <RefreshCw className="size-4" /> Try again
            </button>
          </div>
        )}

        {!error && data && data.items.length === 0 && (
          <div className="animate-fade-in-up flex flex-col items-center px-6 py-16 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100">
              <PackageSearch className="size-7 text-emerald-600" />
            </div>
            {hasFilters ? (
              <>
                <h2 className="mt-4 font-semibold text-slate-900">
                  No product matches these filters
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Try another search or clear the filters.
                </p>
                <button onClick={clearFilters} className={clsx(secondaryBtn, 'mt-4')}>
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <h2 className="mt-4 font-semibold text-slate-900">Your catalogue is empty</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add your first product to start buying, stocking and selling it.
                </p>
                {canWrite && (
                  <Link href="/inventory/products/new" className={clsx(primaryBtn, 'mt-4')}>
                    <Plus className="size-4" /> New product
                  </Link>
                )}
              </>
            )}
          </div>
        )}

        {/* Pagination — always visible once there are results */}
        {data && data.total > 0 && !error && (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={totalPages}
            disabled={loading}
            onPage={goToPage}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** On-hand quantity: amber below the minimum, red when negative, with an explanation on hover. */
function StockQty({
  onHand,
  minStock,
  isLow,
  unit,
}: {
  onHand: string;
  minStock: string;
  isLow: boolean;
  unit: string;
}) {
  const negative = onHand.startsWith('-');
  const title = negative
    ? 'Negative stock: more went out than came in'
    : isLow
      ? `Below the minimum of ${formatQty(minStock)} ${unit}`
      : undefined;
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1',
        negative ? 'font-semibold text-rose-600' : isLow && 'font-medium text-amber-600',
      )}
    >
      {(negative || isLow) && <AlertTriangle className="size-3.5" aria-label={title} />}
      {formatQty(onHand)} <span className="text-xs text-slate-400">{unit}</span>
    </span>
  );
}

/**
 * Page numbers to show around the current page, with gaps ("…") for long lists.
 * e.g. page 6 of 12 → 1 … 5 6 7 … 12
 */
function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  disabled,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  disabled: boolean;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const navBtn =
    'grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-35';

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span>
          Showing{' '}
          <span className="font-medium text-slate-900 tabular-nums">
            {from}–{to}
          </span>{' '}
          of <span className="font-medium text-slate-900 tabular-nums">{total}</span>
        </span>
        <label className="flex items-center gap-2 text-slate-500">
          Rows per page
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav className="flex items-center gap-1 self-center sm:self-auto" aria-label="Pagination">
        <button
          className={navBtn}
          onClick={() => onPage(1)}
          disabled={disabled || page <= 1}
          aria-label="First page"
        >
          <ChevronsLeft className="size-4" />
        </button>
        <button
          className={navBtn}
          onClick={() => onPage(page - 1)}
          disabled={disabled || page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>

        {/* Numbered pages on larger screens, "x / y" on phones */}
        <span className="px-2 tabular-nums sm:hidden">
          {page} / {totalPages}
        </span>
        <div className="hidden items-center gap-1 sm:flex">
          {pageWindow(page, totalPages).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 text-slate-400">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p)}
                disabled={disabled}
                aria-current={p === page ? 'page' : undefined}
                className={clsx(
                  'min-w-8 rounded-lg px-2 py-1 tabular-nums transition',
                  p === page
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 font-medium text-white shadow-sm shadow-emerald-600/25'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <button
          className={navBtn}
          onClick={() => onPage(page + 1)}
          disabled={disabled || page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
        <button
          className={navBtn}
          onClick={() => onPage(totalPages)}
          disabled={disabled || page >= totalPages}
          aria-label="Last page"
        >
          <ChevronsRight className="size-4" />
        </button>
      </nav>
    </div>
  );
}

function SortTh({
  field,
  label,
  sort,
  order,
  onSort,
  right,
}: {
  field: ProductSortField;
  label: string;
  sort: ProductSortField;
  order: 'asc' | 'desc';
  onSort: (f: ProductSortField) => void;
  right?: boolean;
}) {
  const active = sort === field;
  const Arrow = order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={clsx('px-4 py-3', right && 'text-right')}
      aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        onClick={() => onSort(field)}
        className={clsx(
          'inline-flex items-center gap-1 uppercase transition hover:text-slate-800',
          active && 'text-slate-800',
        )}
      >
        {label}
        <Arrow className={clsx('size-3 transition', active ? 'opacity-100' : 'opacity-0')} />
      </button>
    </th>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-4 py-3.5">
              <div
                className="h-3.5 animate-pulse rounded bg-slate-100"
                style={{ width: `${50 + ((r + c) % 4) * 12}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
