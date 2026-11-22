'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Settings2,
  Tags,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageIcon,
  Loader2,
  Package,
  Plus,
  Search,
  Upload,
} from 'lucide-react';
import type {
  BarcodeMatch,
  Paginated,
  ProductListItem,
  ProductLookups,
  ProductSortField,
  ProductStatusFilter,
} from '@erp/shared';
import { ApiRequestError, api, apiDownload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatQty } from '@/lib/format';
import {
  Breadcrumbs,
  ErrorBox,
  StatusBadge,
  btnPrimary,
  btnSecondary,
  fieldClass,
  inputClass,
} from '@/components/products/ui';
import { BulkBar } from '@/components/products/bulk-bar';

const PAGE_SIZE = 25;

export default function ProductsPage() {
  const { can } = useAuth();
  const router = useRouter();
  const canWrite = can('inventory.product.write');
  const canSeeCost = can('inventory.cost.view');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<ProductStatusFilter>('active');
  const [sort, setSort] = useState<ProductSortField>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [lowStock, setLowStock] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [data, setData] = useState<Paginated<ProductListItem> | null>(null);
  const [lookups, setLookups] = useState<ProductLookups | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The dashboard links here with ?lowStock=1.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('lowStock') === '1') setLowStock(true);
  }, []);

  // Debounce typing so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    api<ProductLookups>('/inventory/products/lookups')
      .then(setLookups)
      .catch(() => setLookups({ categories: [], units: [], taxRates: [] }));
  }, []);

  /** The current filters as query parameters (shared by the list and the export). */
  function filterParams() {
    const params = new URLSearchParams({ status, sort, order });
    if (search) params.set('search', search);
    if (categoryId) params.set('categoryId', categoryId);
    if (lowStock) params.set('lowStock', 'true');
    return params;
  }

  useEffect(() => {
    let cancelled = false;
    const params = filterParams();
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));

    setLoading(true);
    api<Paginated<ProductListItem>>(`/inventory/products?${params}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
        // Selection is per page: forget rows that are no longer shown.
        setSelected((prev) => new Set(res.items.filter((i) => prev.has(i.id)).map((i) => i.id)));
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [search, categoryId, status, sort, order, page, lowStock, reloadKey]);

  async function exportCsv() {
    setExporting(true);
    setNotice(null);
    try {
      await apiDownload(`/inventory/products/export?${filterParams()}`, 'products.csv');
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Enter in the search box: if it is a barcode, open that product directly. */
  async function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const code = searchInput.trim();
    setNotice(null);
    if (!/^[0-9A-Za-z-]{4,64}$/.test(code)) return;
    try {
      const match = await api<BarcodeMatch>(
        `/inventory/products/barcode/${encodeURIComponent(code)}`,
      );
      router.push(`/inventory/products/${match.product.id}`);
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 404))
        setNotice((err as Error).message);
    }
  }

  function toggleSort(field: ProductSortField) {
    if (sort === field) setOrder(order === 'asc' ? 'desc' : 'asc');
    else {
      setSort(field);
      setOrder('asc');
    }
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = Boolean(search || categoryId || status !== 'active' || lowStock);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Breadcrumbs trail={[{ label: 'Products' }]} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-mod-inventory/10">
              <Package className="size-5 text-mod-inventory" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
              <p className="text-sm text-slate-500">
                {data ? `${data.total} product${data.total === 1 ? '' : 's'}` : 'Product catalogue'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportCsv} disabled={exporting} className={btnSecondary}>
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Export
            </button>
            {canWrite && (
              <Link href="/inventory/products/import" className={btnSecondary}>
                <Upload className="size-4" /> Import
              </Link>
            )}
            <Link href="/inventory/products/price-lists" className={btnSecondary}>
              <Tags className="size-4" /> Price lists
            </Link>
            <Link href="/inventory/products/setup" className={btnSecondary}>
              <Settings2 className="size-4" /> Catalogue setup
            </Link>
            {canWrite && (
              <Link href="/inventory/products/new" className={btnPrimary}>
                <Plus className="size-4" /> New product
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
          <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Search, or scan a barcode and press Enter…"
              aria-label="Search products"
              className={clsx(inputClass, 'py-1.5 pl-9')}
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by category"
            className={clsx(fieldClass, 'py-1.5')}
          >
            <option value="">All categories</option>
            {lookups?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {'  '.repeat(c.depth)}
                {c.name}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-sm">
            {(['active', 'inactive', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                className={clsx(
                  'rounded px-3 py-1 capitalize transition',
                  status === s ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
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
            aria-pressed={lowStock}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition',
              lowStock
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
          >
            <AlertTriangle className="size-4" /> Low stock
          </button>
          {loading && <Loader2 className="size-4 animate-spin text-slate-400" />}
        </div>

        {canWrite && selected.size > 0 && (
          <BulkBar
            ids={[...selected]}
            categories={lookups?.categories ?? []}
            onClear={() => setSelected(new Set())}
            onDone={(msg) => {
              setFlash(msg);
              setSelected(new Set());
              setReloadKey((k) => k + 1);
              setTimeout(() => setFlash(null), 5000);
            }}
          />
        )}
        {flash && (
          <div
            className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800"
            role="status"
          >
            {flash}
          </div>
        )}

        {notice && (
          <div className="p-3">
            <ErrorBox message={notice} />
          </div>
        )}
        {error && (
          <div className="p-3">
            <ErrorBox message={error} />
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                {canWrite && (
                  <th className="w-10 pl-4">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={!!data?.items.length && data.items.every((i) => selected.has(i.id))}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? new Set(data?.items.map((i) => i.id)) : new Set(),
                        )
                      }
                    />
                  </th>
                )}
                <SortTh field="sku" label="SKU" sort={sort} order={order} onSort={toggleSort} />
                <SortTh field="name" label="Name" sort={sort} order={order} onSort={toggleSort} />
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Unit</th>
                <SortTh
                  field="salePrice"
                  label="Sale price"
                  sort={sort}
                  order={order}
                  onSort={toggleSort}
                  align="right"
                />
                {canSeeCost && <th className="px-4 py-2.5 text-right">Avg. cost</th>}
                <th className="px-4 py-2.5 text-right">On hand</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.items.map((p) => {
                const low = Number(p.minStock) > 0 && Number(p.stockOnHand) < Number(p.minStock);
                return (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/inventory/products/${p.id}`)}
                    className={clsx(
                      'cursor-pointer transition hover:bg-slate-50',
                      selected.has(p.id) && 'bg-mod-inventory/5',
                    )}
                  >
                    {canWrite && (
                      <td className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.name}`}
                          checked={selected.has(p.id)}
                          onChange={() => toggleRow(p.id)}
                        />
                      </td>
                    )}
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{p.sku}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-100">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="size-4 text-slate-300" />
                          )}
                        </div>
                        <div>
                          <Link
                            href={`/inventory/products/${p.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-slate-900 hover:text-mod-inventory"
                          >
                            {p.name}
                          </Link>
                          {p.barcode && <div className="text-xs text-slate-400">{p.barcode}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{p.category?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.baseUnit.code}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(p.salePrice)}
                    </td>
                    {canSeeCost && (
                      <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                        {formatMoney(p.averageCost)}
                      </td>
                    )}
                    <td
                      className={clsx(
                        'px-4 py-2.5 text-right tabular-nums',
                        low ? 'font-medium text-amber-600' : 'text-slate-700',
                      )}
                      title={low ? `Below minimum stock (${formatQty(p.minStock)})` : undefined}
                    >
                      {formatQty(p.stockOnHand)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge active={p.isActive} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {data && data.items.length === 0 && (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-mod-inventory/10">
                <Package className="size-6 text-mod-inventory" />
              </div>
              <h2 className="mt-4 font-semibold text-slate-900">
                {filtered ? 'No products match your filters' : 'No products yet'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {filtered
                  ? 'Try another search or clear the filters.'
                  : 'Create your first product to start building the catalogue.'}
              </p>
              {!filtered && canWrite && (
                <Link href="/inventory/products/new" className={clsx(btnPrimary, 'mt-4')}>
                  <Plus className="size-4" /> New product
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Paging */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-sm text-slate-600">
            <span>
              {(data.page - 1) * data.pageSize + 1}–
              {Math.min(data.page * data.pageSize, data.total)} of {data.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                aria-label="Previous page"
                className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="px-2">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SortTh({
  field,
  label,
  sort,
  order,
  onSort,
  align,
}: {
  field: ProductSortField;
  label: string;
  sort: ProductSortField;
  order: 'asc' | 'desc';
  onSort: (f: ProductSortField) => void;
  align?: 'right';
}) {
  const active = sort === field;
  const Arrow = order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={clsx('px-4 py-2.5', align === 'right' && 'text-right')}
      aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        onClick={() => onSort(field)}
        className={clsx(
          'inline-flex items-center gap-1 uppercase hover:text-slate-800',
          active && 'text-slate-800',
        )}
      >
        {label}
        {active && <Arrow className="size-3" />}
      </button>
    </th>
  );
}
