'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  CheckCircle2,
  ChevronRight,
  Download,
  Loader2,
  Package,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react';
import type {
  CategoryDto,
  Paginated,
  ProductImportResult,
  ProductListItem,
  ProductSortField,
  ProductStatusFilter,
} from '@erp/shared';
import { api, apiDownload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatAmount, formatQty } from '@/lib/format';
import { AccessDenied, Breadcrumbs, StatusBadge } from '@/components/page-header';

const PAGE_SIZE = 25;

export default function ProductsPage() {
  const { can } = useAuth();
  const router = useRouter();
  const canRead = can('inventory.product.read');
  const canWrite = can('inventory.product.write');
  const canViewCost = can('inventory.cost.view');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<ProductStatusFilter>('active');
  const [sort, setSort] = useState<ProductSortField>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<ProductListItem> | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ProductImportResult | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!canRead) return;
    api<CategoryDto[]>('/inventory/categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [canRead]);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({
      status,
      sort,
      order,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (search) qs.set('search', search);
    if (categoryId) qs.set('categoryId', categoryId);
    api<Paginated<ProductListItem>>(`/inventory/products?${qs}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [canRead, search, categoryId, status, sort, order, page, reloadKey]);

  if (!canRead) return <AccessDenied permission="inventory.product.read" what="Products" />;

  const toggleSort = (field: ProductSortField) => {
    if (sort === field) setOrder(order === 'asc' ? 'desc' : 'asc');
    else {
      setSort(field);
      setOrder('asc');
    }
    setPage(1);
  };

  /** Exports every product matching the current filters (not only this page). */
  const handleExport = async () => {
    setExporting(true);
    setTransferError(null);
    try {
      const qs = new URLSearchParams({ status, sort, order });
      // What is typed now, even if the 300 ms list debounce has not fired yet.
      const term = searchInput.trim();
      if (term) qs.set('search', term);
      if (categoryId) qs.set('categoryId', categoryId);
      await apiDownload(`/inventory/products/export?${qs}`, 'products.xlsx');
    } catch (e) {
      setTransferError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    setTransferError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await api<ProductImportResult>('/inventory/products/import', {
        method: 'POST',
        body,
      });
      setImportResult(res);
      if (res.errors.length === 0) setReloadKey((k) => k + 1);
    } catch (e) {
      setTransferError((e as Error).message);
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const hasFilters = !!search || !!categoryId || status !== 'active';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Inventory' },
            { label: 'Products' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-mod-inventory/10 grid size-10 place-items-center rounded-lg">
              <Package className="text-mod-inventory size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
              <p className="text-sm text-slate-500">Product catalogue, prices and stock alerts</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImport(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={importing}
                  title="Import products from an Excel file (.xlsx)"
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                >
                  {importing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Import
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting}
              title="Export the products matching the filters to Excel (.xlsx)"
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Export
            </button>
            {canWrite && (
              <Link
                href="/inventory/products/new"
                className="bg-mod-inventory inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90"
              >
                <Plus className="size-4" /> New product
              </Link>
            )}
          </div>
        </div>
      </div>

      {transferError && (
        <Notice tone="error" onClose={() => setTransferError(null)}>
          {transferError}
        </Notice>
      )}
      {importResult && (
        <ImportResultNotice result={importResult} onClose={() => setImportResult(null)} />
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search SKU, name or barcode…"
              aria-label="Search products"
              className="w-full rounded-md border border-slate-300 py-1.5 pr-3 pl-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            aria-label="Category"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ProductStatusFilter);
              setPage(1);
            }}
            aria-label="Status"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
          {loading && <Loader2 className="size-4 animate-spin text-slate-400" />}
        </div>

        {error ? (
          <p role="alert" className="m-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : data && data.items.length === 0 && !loading ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="bg-mod-inventory/10 grid size-12 place-items-center rounded-full">
              <Package className="text-mod-inventory size-6" />
            </div>
            <h2 className="mt-4 font-semibold text-slate-900">
              {hasFilters ? 'No product matches these filters' : 'No products yet'}
            </h2>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              {hasFilters
                ? 'Try another search or clear the filters.'
                : 'Create your first product to start buying, stocking and selling it.'}
            </p>
            {!hasFilters && canWrite && (
              <Link
                href="/inventory/products/new"
                className="bg-mod-inventory mt-4 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <Plus className="size-4" /> New product
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <SortableTh field="sku" sort={sort} order={order} onSort={toggleSort}>
                    SKU
                  </SortableTh>
                  <SortableTh field="name" sort={sort} order={order} onSort={toggleSort}>
                    Name
                  </SortableTh>
                  <th className="px-4 py-2.5">Category</th>
                  <SortableTh
                    field="salePrice"
                    sort={sort}
                    order={order}
                    onSort={toggleSort}
                    align="right"
                  >
                    Sale price
                  </SortableTh>
                  {canViewCost && <th className="px-4 py-2.5 text-right">Avg. cost</th>}
                  <th className="px-4 py-2.5 text-right">On hand</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items.map((p) => {
                  const low = Number(p.minStock) > 0 && Number(p.onHand) < Number(p.minStock);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/inventory/products/${p.id}`)}
                      className={clsx(
                        'cursor-pointer hover:bg-slate-50',
                        !p.isActive && 'opacity-60',
                      )}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{p.sku}</td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/inventory/products/${p.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-slate-900 hover:text-blue-600"
                        >
                          {p.name}
                        </Link>
                        {p.barcode && (
                          <div className="font-mono text-xs text-slate-400">{p.barcode}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{p.category?.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatAmount(p.salePrice)}
                      </td>
                      {canViewCost && (
                        <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                          {formatAmount(p.averageCost)}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1',
                            low && 'font-medium text-amber-700',
                          )}
                          title={low ? `Below minimum stock (${formatQty(p.minStock)})` : undefined}
                        >
                          {low && <AlertTriangle className="size-3.5" />}
                          {formatQty(p.onHand)}{' '}
                          <span className="text-xs text-slate-400">{p.baseUnit.code}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge active={p.isActive} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-sm text-slate-500">
            <span>
              {from}–{to} of {data.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
                aria-label="Previous page"
                className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="px-2">
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40"
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

function Notice({
  tone,
  onClose,
  children,
}: {
  tone: 'success' | 'error';
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm',
        tone === 'error'
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800',
      )}
    >
      {tone === 'error' ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">{children}</div>
      <button onClick={onClose} aria-label="Dismiss" className="rounded p-0.5 hover:bg-black/5">
        <X className="size-4" />
      </button>
    </div>
  );
}

const MAX_SHOWN_ERRORS = 50;

function ImportResultNotice({
  result,
  onClose,
}: {
  result: ProductImportResult;
  onClose: () => void;
}) {
  if (result.errors.length === 0) {
    return (
      <Notice tone="success" onClose={onClose}>
        Import done: <strong>{result.created}</strong> created, <strong>{result.updated}</strong>{' '}
        updated, {result.unchanged} unchanged.
      </Notice>
    );
  }
  const count = result.errors.length;
  const shown = result.errors.slice(0, MAX_SHOWN_ERRORS);
  return (
    <Notice tone="error" onClose={onClose}>
      <p className="font-medium">
        Nothing was imported: fix {count === 1 ? 'this error' : `these ${count} errors`} in the file
        and import it again.
      </p>
      <ul className="mt-2 max-h-60 space-y-0.5 overflow-y-auto">
        {shown.map((e, i) => (
          <li key={i}>
            <span className="font-mono text-xs">Row {e.row}</span> — {e.message}
          </li>
        ))}
      </ul>
      {count > shown.length && <p className="mt-1 text-xs">…and {count - shown.length} more.</p>}
    </Notice>
  );
}

function SortableTh({
  field,
  sort,
  order,
  onSort,
  align = 'left',
  children,
}: {
  field: ProductSortField;
  sort: ProductSortField;
  order: 'asc' | 'desc';
  onSort: (f: ProductSortField) => void;
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const active = sort === field;
  const Arrow = order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={clsx('px-4 py-2.5', align === 'right' && 'text-right')}
      aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button
        onClick={() => onSort(field)}
        className={clsx(
          'inline-flex items-center gap-1 uppercase hover:text-slate-700',
          active && 'text-slate-700',
        )}
      >
        {children}
        {active && <Arrow className="size-3" />}
      </button>
    </th>
  );
}
