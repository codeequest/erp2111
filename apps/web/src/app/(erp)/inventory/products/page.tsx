'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Package,
  Plus,
  ScanBarcode,
  Search,
} from 'lucide-react';
import type { CategoryNode, Paginated, ProductListItem } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useApiData } from '@/lib/use-api-data';
import { categoryOptionLabel, flattenCategories, formatDecimal, isBelow } from '@/lib/inventory';
import { CatalogHeader } from '@/components/inventory/catalog-header';
import { ExportMenu } from '@/components/export-menu';
import { exportRows, fetchAllPages, FMT, type ExportColumn, type ExportFormat } from '@/lib/export';
import {
  AccessDenied,
  EmptyState,
  ErrorBanner,
  inputClass,
  PrimaryLink,
  SkeletonRows,
  Toast,
} from '@/components/ui';

type Status = 'active' | 'inactive' | 'all';
const PAGE_SIZE = 25;
const STATUSES: { value: Status; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
];

export default function ProductsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const canRead = can('inventory.product.read');
  const canWrite = can('inventory.product.write');
  const showCost = can('inventory.cost.view');
  const showStock = can('inventory.stock.read');

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => setPage(1), [debounced, categoryId, status]);

  const path = useMemo(() => {
    const params = new URLSearchParams({ status, page: String(page), pageSize: String(PAGE_SIZE) });
    if (debounced) params.set('q', debounced);
    if (categoryId) params.set('categoryId', categoryId);
    return `/inventory/products?${params}`;
  }, [debounced, categoryId, status, page]);

  const { data, error, loading, reload } = useApiData<Paginated<ProductListItem>>(
    canRead ? path : null,
  );
  const categories = useApiData<CategoryNode[]>(canRead ? '/inventory/categories' : null);
  const categoryRows = useMemo(() => flattenCategories(categories.data ?? []), [categories.data]);

  if (!canRead) return <AccessDenied permission="inventory.product.read" what="products" />;

  /** Every product matching the current filters (all pages), in the chosen format. */
  async function exportProducts(format: ExportFormat): Promise<number> {
    setExportError(null);
    const params = new URLSearchParams({ status });
    if (debounced) params.set('q', debounced);
    if (categoryId) params.set('categoryId', categoryId);
    const { items } = await fetchAllPages<ProductListItem>(`/inventory/products?${params}`, 100);
    const columns: ExportColumn<ProductListItem>[] = [
      { header: 'SKU', value: (p) => p.sku, width: 18 },
      { header: 'Barcode', value: (p) => p.barcode, width: 16 },
      { header: 'Name', value: (p) => p.name, width: 36 },
      { header: 'Category', value: (p) => p.category?.name, width: 20 },
      { header: 'Base unit', value: (p) => p.baseUnit.code },
      { header: 'Sale price', value: (p) => p.salePrice, type: 'number', numFmt: FMT.cost },
    ];
    if (showCost) {
      columns.push({
        header: 'Average cost',
        value: (p) => p.averageCost,
        type: 'number',
        numFmt: FMT.cost,
      });
    }
    if (showStock) {
      columns.push({ header: 'On hand', value: (p) => p.onHand, type: 'number', numFmt: FMT.qty });
    }
    columns.push(
      { header: 'Min. stock', value: (p) => p.minStock, type: 'number', numFmt: FMT.qty },
      { header: 'Status', value: (p) => (p.isActive ? 'Active' : 'Inactive') },
    );
    await exportRows({ format, fileName: 'products', sheetName: 'Products', columns, rows: items });
    return items.length;
  }

  const filtered = Boolean(debounced || categoryId || status !== 'active');
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const newButton = canWrite && (
    <PrimaryLink href="/inventory/products/new" onDark>
      <Plus className="size-4" /> New product
    </PrimaryLink>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <CatalogHeader
        title="Products"
        description="Product catalogue, categories and units"
        icon={Package}
        actions={newButton}
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {exportError && <ErrorBanner message={exportError} />}

      <section
        className="animate-fade-up overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
        style={{ animationDelay: '80ms' }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, SKU or scan a barcode…"
              className={inputClass() + ' pl-9'}
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Category"
            className={inputClass() + ' w-full sm:w-56'}
          >
            <option value="">All categories</option>
            {categoryRows.map((row) => (
              <option key={row.node.id} value={row.node.id}>
                {categoryOptionLabel(row)}
              </option>
            ))}
          </select>
          <div className="flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Status">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                aria-pressed={status === s.value}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200',
                  status === s.value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {data && (
              <span className="hidden text-xs text-slate-500 md:block">
                {data.total.toLocaleString()} {data.total === 1 ? 'product' : 'products'}
              </span>
            )}
            <ExportMenu
              onExport={exportProducts}
              disabled={!data || data.total === 0}
              onDone={(n, f) =>
                setToast(
                  `${n} ${n === 1 ? 'product' : 'products'} exported to ${f === 'xlsx' ? 'Excel' : 'CSV'}`,
                )
              }
              onError={setExportError}
            />
          </div>
        </div>

        {loading && !data ? (
          <SkeletonRows rows={6} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={filtered ? Search : Package}
            title={filtered ? 'No product matches these filters' : 'No products yet'}
            text={
              filtered
                ? 'Try another search, category or status.'
                : 'Create your first product. Set up its category and units first if needed.'
            }
            action={
              !filtered &&
              canWrite && (
                <PrimaryLink href="/inventory/products/new">
                  <Plus className="size-4" /> New product
                </PrimaryLink>
              )
            }
          />
        ) : (
          <div className={clsx('overflow-x-auto transition-opacity', loading && 'opacity-60')}>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50/70 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5 text-right">Sale price</th>
                  {showCost && <th className="px-4 py-2.5 text-right">Avg. cost</th>}
                  {showStock && <th className="px-4 py-2.5 text-right">On hand</th>}
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((p, i) => {
                  const low = isBelow(p.onHand, p.minStock);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/inventory/products/${p.id}`)}
                      className="group animate-fade-up cursor-pointer transition-colors hover:bg-emerald-50/40"
                      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/inventory/products/${p.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-slate-900 group-hover:text-mod-inventory"
                        >
                          {p.name}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono">{p.sku}</span>
                          {p.barcode && (
                            <span className="flex items-center gap-1">
                              <ScanBarcode className="size-3" /> {p.barcode}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {p.category?.name ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-800 tabular-nums">
                        {formatDecimal(p.salePrice, 2)}
                      </td>
                      {showCost && (
                        <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                          {formatDecimal(p.averageCost, 2)}
                        </td>
                      )}
                      {showStock && (
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span
                            className={clsx(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                              low
                                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                                : 'text-slate-700',
                            )}
                            title={
                              low ? `Below the minimum of ${formatDecimal(p.minStock)}` : undefined
                            }
                          >
                            {low && <AlertTriangle className="size-3" />}
                            {formatDecimal(p.onHand)}{' '}
                            <span className="text-slate-400">{p.baseUnit.code}</span>
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                            p.isActive
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          <span
                            className={clsx(
                              'size-1.5 rounded-full',
                              p.isActive ? 'bg-emerald-500' : 'bg-slate-400',
                            )}
                          />
                          {p.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm text-slate-500">
            <span>
              Page {data.page} of {pages}
            </span>
            <div className="flex gap-1">
              <PagerButton
                label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-4" />
              </PagerButton>
              <PagerButton
                label="Next page"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </PagerButton>
            </div>
          </div>
        )}
      </section>

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

function PagerButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      aria-label={label}
      className="grid size-8 place-items-center rounded-md border border-slate-200 bg-white transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
