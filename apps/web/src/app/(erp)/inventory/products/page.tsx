'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderTree,
  LayoutGrid,
  List,
  Package,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react';
import {
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  type BulkResult,
  type CategoryDto,
  type Paginated,
  type ProductListItem,
} from '@erp/shared';
import { api, downloadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PermissionGate } from '@/components/permission-gate';
import { ImportDialog } from '@/components/products/import-dialog';
import {
  MarginText,
  ProductImage,
  StockBadge,
  TypeBadge,
} from '@/components/products/product-bits';
import {
  Badge,
  Breadcrumbs,
  Button,
  ConfirmDialog,
  ErrorBox,
  PageLoader,
  buttonClass,
  formatAmount,
  inputClass,
  useToast,
} from '@/components/ui';

const FILTER_KEYS = [
  'search',
  'categoryId',
  'type',
  'status',
  'stock',
  'sort',
  'dir',
  'page',
] as const;
type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;
const PAGE_SIZE = 25;

export default function ProductsPage() {
  return (
    <PermissionGate permission="inventory.product.read">
      <Suspense fallback={<PageLoader />}>
        <ProductList />
      </Suspense>
    </PermissionGate>
  );
}

function ProductList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useAuth();
  const toast = useToast();
  const canWrite = can('inventory.product.write');
  const canSeeCost = can('inventory.cost.view');

  // Filters live in the URL, so Back, refresh and shared links keep them.
  const filters: Filters = useMemo(() => {
    const f: Filters = {};
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) f[k] = v;
    }
    return f;
  }, [params]);
  const setFilters = useCallback(
    (patch: Filters, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries({
        ...patch,
        ...(resetPage ? { page: undefined } : {}),
      })) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const [data, setData] = useState<Paginated<ProductListItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<'deactivate' | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [searchText, setSearchText] = useState(filters.search ?? '');
  const reqId = useRef(0);

  useEffect(() => {
    const saved = localStorage.getItem('erp.products.view');
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);

  const queryString = useMemo(() => {
    const q = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    for (const [k, v] of Object.entries(filters)) if (v && k !== 'page') q.set(k, v);
    if (filters.page) q.set('page', filters.page);
    return q.toString();
  }, [filters]);

  const load = useCallback(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    api<Paginated<ProductListItem>>(`/inventory/products?${queryString}`)
      .then((d) => {
        if (id !== reqId.current) return; // a newer request is on its way
        setData(d);
        setSelected(new Set());
      })
      .catch((e: Error) => id === reqId.current && setError(e.message))
      .finally(() => id === reqId.current && setLoading(false));
  }, [queryString]);
  useEffect(load, [load]);

  useEffect(() => {
    api<CategoryDto[]>('/inventory/categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // Debounced search; Enter searches at once (barcode scanners type fast and press Enter).
  useEffect(() => {
    if ((filters.search ?? '') === searchText.trim()) return;
    const t = setTimeout(() => setFilters({ search: searchText.trim() || undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const onSearchEnter = async () => {
    const s = searchText.trim();
    if (!s) return;
    // A scanned barcode or exact SKU opens the product directly.
    try {
      const r = await api<Paginated<ProductListItem>>(
        `/inventory/products?status=all&pageSize=2&search=${encodeURIComponent(s)}`,
      );
      const exact = r.items.find((p) => p.barcode === s || p.sku.toLowerCase() === s.toLowerCase());
      if (r.total === 1 && exact) {
        router.push(`/inventory/products/${exact.id}`);
        return;
      }
    } catch {
      /* fall back to a normal search */
    }
    setFilters({ search: s });
  };

  const toggleSort = (field: string) => {
    const current = filters.sort ?? 'name';
    const dir = current === field && (filters.dir ?? 'asc') === 'asc' ? 'desc' : 'asc';
    setFilters({ sort: field, dir });
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const q = new URLSearchParams(queryString);
      q.delete('page');
      q.delete('pageSize');
      await downloadFile(`/inventory/products/export?${q}`, 'products.csv');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const runBulk = async (
    action: 'activate' | 'deactivate' | 'set-category',
    categoryId?: string | null,
  ) => {
    setBulkBusy(true);
    try {
      const r = await api<BulkResult>('/inventory/products/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selected], action, categoryId }),
      });
      if (r.failed.length) {
        toast(
          `${r.succeeded.length} updated, ${r.failed.length} failed: ${r.failed.map((f) => f.reason).join('; ')}`,
          'warning',
        );
      } else {
        toast(`${r.succeeded.length} product${r.succeeded.length === 1 ? '' : 's'} updated`);
      }
      setBulkConfirm(null);
      setBulkCategory('');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const page = Number(filters.page ?? 1);
  const hasFilters = !!(
    filters.search ||
    filters.categoryId ||
    filters.type ||
    filters.stock ||
    (filters.status && filters.status !== 'active')
  );
  const allSelected = items.length > 0 && items.every((p) => selected.has(p.id));

  const SortHeader = ({
    field,
    children,
    className,
  }: {
    field: string;
    children: React.ReactNode;
    className?: string;
  }) => {
    const active = (filters.sort ?? 'name') === field;
    const Icon = (filters.dir ?? 'asc') === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={clsx('px-3 py-2 font-medium', className)}>
        <button
          onClick={() => toggleSort(field)}
          className={clsx(
            'inline-flex items-center gap-1 hover:text-slate-800',
            active && 'text-slate-800',
          )}
        >
          {children}
          {active && <Icon className="size-3" />}
        </button>
      </th>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
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
            <div className="grid size-10 place-items-center rounded-lg bg-mod-inventory/10">
              <Package className="size-5 text-mod-inventory" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
              <p className="text-sm text-slate-500">Product catalogue, categories and units</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/inventory/products/categories" className={buttonClass()}>
              <FolderTree className="size-4" /> Categories &amp; units
            </Link>
            {canWrite && (
              <Button onClick={() => setImportOpen(true)}>
                <Upload className="size-4" /> Import
              </Button>
            )}
            <Button onClick={exportCsv} loading={exporting} disabled={!data?.total}>
              {!exporting && <Download className="size-4" />} Export
            </Button>
            {canWrite && (
              <Link href="/inventory/products/new" className={buttonClass('primary')}>
                <Plus className="size-4" /> New
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearchEnter()}
              placeholder="Search name, SKU or scan a barcode…"
              aria-label="Search products"
              className={clsx(inputClass, 'py-1.5 pl-9')}
            />
          </div>
          <select
            aria-label="Category"
            className={clsx(inputClass, 'w-auto py-1.5')}
            value={filters.categoryId ?? ''}
            onChange={(e) => setFilters({ categoryId: e.target.value || undefined })}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.path}
              </option>
            ))}
          </select>
          <select
            aria-label="Type"
            className={clsx(inputClass, 'w-auto py-1.5')}
            value={filters.type ?? ''}
            onChange={(e) => setFilters({ type: e.target.value || undefined })}
          >
            <option value="">All types</option>
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {PRODUCT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <select
            aria-label="Stock"
            className={clsx(inputClass, 'w-auto py-1.5')}
            value={filters.stock ?? ''}
            onChange={(e) => setFilters({ stock: e.target.value || undefined })}
          >
            <option value="">Any stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
          <select
            aria-label="Status"
            className={clsx(inputClass, 'w-auto py-1.5')}
            value={filters.status ?? 'active'}
            onChange={(e) =>
              setFilters({ status: e.target.value === 'active' ? undefined : e.target.value })
            }
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchText('');
                router.replace(pathname);
              }}
            >
              <X className="size-3.5" /> Clear
            </Button>
          )}
          <div className="ml-auto flex rounded-md border border-slate-200 p-0.5">
            {(['list', 'grid'] as const).map((v) => {
              const Icon = v === 'list' ? List : LayoutGrid;
              return (
                <button
                  key={v}
                  aria-label={`${v} view`}
                  aria-pressed={view === v}
                  onClick={() => {
                    setView(v);
                    localStorage.setItem('erp.products.view', v);
                  }}
                  className={clsx(
                    'rounded p-1.5',
                    view === v
                      ? 'bg-slate-100 text-slate-800'
                      : 'text-slate-400 hover:text-slate-600',
                  )}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Bulk actions */}
        {canWrite && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-mod-inventory/5 px-3 py-2 text-sm">
            <span className="font-medium text-slate-700">{selected.size} selected</span>
            <Button size="sm" onClick={() => runBulk('activate')} disabled={bulkBusy}>
              Activate
            </Button>
            <Button size="sm" onClick={() => setBulkConfirm('deactivate')} disabled={bulkBusy}>
              Deactivate
            </Button>
            <select
              aria-label="Move to category"
              className={clsx(inputClass, 'w-auto py-1 text-xs')}
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
            >
              <option value="">Move to category…</option>
              <option value="__none">— No category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.path}
                </option>
              ))}
            </select>
            {bulkCategory && (
              <Button
                size="sm"
                variant="primary"
                loading={bulkBusy}
                onClick={() =>
                  runBulk('set-category', bulkCategory === '__none' ? null : bulkCategory)
                }
              >
                Apply
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
        )}

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={load} />
          </div>
        ) : !data ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <EmptyState
            filtered={hasFilters}
            canWrite={canWrite}
            onImport={() => setImportOpen(true)}
            onClear={() => {
              setSearchText('');
              router.replace(pathname);
            }}
          />
        ) : view === 'grid' ? (
          <div
            className={clsx(
              'grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-5',
              loading && 'opacity-60',
            )}
          >
            {items.map((p) => (
              <Link
                key={p.id}
                href={`/inventory/products/${p.id}`}
                className="group rounded-lg border border-slate-200 p-3 transition hover:border-mod-inventory hover:shadow-sm"
              >
                <ProductImage
                  productId={p.id}
                  hasImage={p.hasImage}
                  version={p.updatedAt}
                  size="lg"
                  className="!size-full aspect-square"
                />
                <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-900 group-hover:text-mod-inventory">
                  {p.name}
                </p>
                <p className="font-mono text-xs text-slate-500">{p.sku}</p>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatAmount(p.salePrice)}
                  </span>
                  <StockBadge status={p.stockStatus} qty={p.stockOnHand} unit={p.baseUnitCode} />
                </div>
                {!p.isActive && (
                  <div className="mt-1">
                    <Badge tone="slate">Inactive</Badge>
                  </div>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className={clsx('overflow-x-auto', loading && 'opacity-60')}>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  {canWrite && (
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allSelected}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked ? new Set(items.map((p) => p.id)) : new Set(),
                          )
                        }
                      />
                    </th>
                  )}
                  <SortHeader field="name">Product</SortHeader>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <SortHeader field="salePrice" className="text-right">
                    Sale price
                  </SortHeader>
                  {canSeeCost && <th className="px-3 py-2 text-right font-medium">Cost</th>}
                  {canSeeCost && <th className="px-3 py-2 text-right font-medium">Margin</th>}
                  <th className="px-3 py-2 text-right font-medium">Stock</th>
                  <SortHeader field="updatedAt" className="text-right">
                    Updated
                  </SortHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((p) => (
                  <tr
                    key={p.id}
                    className={clsx('hover:bg-slate-50', !p.isActive && 'text-slate-400')}
                  >
                    {canWrite && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.name}`}
                          checked={selected.has(p.id)}
                          onChange={(e) =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(p.id);
                              else n.delete(p.id);
                              return n;
                            })
                          }
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <Link
                        href={`/inventory/products/${p.id}`}
                        className="flex items-center gap-3"
                      >
                        <ProductImage
                          productId={p.id}
                          hasImage={p.hasImage}
                          version={p.updatedAt}
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 font-medium text-slate-900 hover:text-mod-inventory">
                            <span className="truncate">{p.name}</span>
                            <TypeBadge type={p.type} />
                            {!p.isActive && <Badge tone="slate">Inactive</Badge>}
                          </span>
                          <span className="block font-mono text-xs text-slate-500">
                            {p.sku}
                            {p.barcode && ` · ${p.barcode}`}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {p.categoryName ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatAmount(p.salePrice)}
                    </td>
                    {canSeeCost && (
                      <td className="px-3 py-2 text-right text-slate-600 tabular-nums">
                        {formatAmount(Number(p.averageCost) > 0 ? p.averageCost : p.purchasePrice)}
                      </td>
                    )}
                    {canSeeCost && (
                      <td className="px-3 py-2 text-right">
                        <MarginText value={p.marginPct} />
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
                      <StockBadge
                        status={p.stockStatus}
                        qty={p.stockOnHand}
                        unit={p.baseUnitCode}
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap text-slate-500">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-sm text-slate-600">
            <span>
              {(page - 1) * data.pageSize + 1}–{Math.min(page * data.pageSize, data.total)} of{' '}
              {data.total}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                aria-label="Previous page"
                onClick={() => setFilters({ page: String(page - 1) }, false)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="px-2 tabular-nums">
                Page {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= totalPages}
                aria-label="Next page"
                onClick={() => setFilters({ page: String(page + 1) }, false)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />

      <ConfirmDialog
        open={bulkConfirm === 'deactivate'}
        title={`Deactivate ${selected.size} product(s)?`}
        confirmLabel="Deactivate"
        danger
        busy={bulkBusy}
        onCancel={() => setBulkConfirm(null)}
        onConfirm={() => runBulk('deactivate')}
      >
        Inactive products disappear from product pickers in orders and invoices. Their history and
        stock are kept, and you can re-activate them at any time.
      </ConfirmDialog>
    </div>
  );
}

function EmptyState({
  filtered,
  canWrite,
  onImport,
  onClear,
}: {
  filtered: boolean;
  canWrite: boolean;
  onImport: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-mod-inventory/10">
        <Package className="size-6 text-mod-inventory" />
      </div>
      {filtered ? (
        <>
          <h2 className="mt-4 font-semibold text-slate-900">No product matches these filters</h2>
          <Button className="mt-4" onClick={onClear}>
            Clear filters
          </Button>
        </>
      ) : (
        <>
          <h2 className="mt-4 font-semibold text-slate-900">No products yet</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Create your first product, or import your whole catalogue from a CSV / Excel file.
          </p>
          {canWrite && (
            <div className="mt-4 flex gap-2">
              <Button onClick={onImport}>
                <Upload className="size-4" /> Import
              </Button>
              <Link href="/inventory/products/new" className={buttonClass('primary')}>
                <Plus className="size-4" /> New product
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
