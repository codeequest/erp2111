'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  Loader2,
  Package,
  PackageX,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  inventoryApi,
  money,
  qty,
  type Category,
  type Product,
  type ProductPage,
  type ProductQuery,
} from '@/lib/inventory';
import {
  AccessDenied,
  Breadcrumb,
  ErrorNotice,
  ProductThumb,
  StatusPill,
  StockBadge,
  btn,
  inputCls,
} from '@/components/inventory/ui';

type Sort = NonNullable<ProductQuery['sort']>;
const PAGE_SIZE = 25;
/** Same look as inputCls, but sized to the content so filters sit on one row. */
const filterCls = inputCls.replace('w-full ', 'w-full sm:w-auto ').replace('py-2 ', 'py-1.5 ');

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsList />
    </Suspense>
  );
}

function ProductsList() {
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Filters live in the URL so a filtered list can be bookmarked or linked (e.g. ?stock=low).
  const query: ProductQuery = useMemo(
    () => ({
      search: params.get('search') ?? undefined,
      categoryId: params.get('category') ?? undefined,
      status: (params.get('status') as ProductQuery['status']) ?? 'active',
      stock: (params.get('stock') as ProductQuery['stock']) ?? 'all',
      sort: (params.get('sort') as Sort) ?? 'name',
      order: (params.get('order') as 'asc' | 'desc') ?? 'asc',
      page: Number(params.get('page') ?? 1) || 1,
      pageSize: PAGE_SIZE,
    }),
    [params],
  );

  const setParams = useCallback(
    (changes: Record<string, string | undefined>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === undefined || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (resetPage) next.delete('page');
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const [data, setData] = useState<ProductPage | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState(query.search ?? '');

  const canRead = can('inventory.product.read');
  const canWrite = can('inventory.product.write');
  const canSeeCost = can('inventory.cost.view');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await inventoryApi.listProducts(query));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  useEffect(() => {
    if (canRead)
      inventoryApi
        .listCategories()
        .then(setCategories)
        .catch(() => setCategories([]));
  }, [canRead]);

  // Debounced search box → URL
  useEffect(() => {
    const t = setTimeout(() => {
      if ((query.search ?? '') !== searchText.trim()) setParams({ search: searchText.trim() });
    }, 300);
    return () => clearTimeout(t);
  }, [searchText, query.search, setParams]);

  if (!canRead) return <AccessDenied permission="inventory.product.read" what="open Products" />;

  const toggleActive = async (p: Product) => {
    if (p.isActive && !confirm(`Deactivate "${p.name}"? It will be hidden from new documents.`))
      return;
    setBusyId(p.id);
    try {
      await inventoryApi.setActive(p.id, !p.isActive);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const sortBy = (s: Sort) =>
    setParams({
      sort: s,
      order: query.sort === s && query.order === 'asc' ? 'desc' : 'asc',
    });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filtersActive =
    !!query.search || !!query.categoryId || query.status !== 'active' || query.stock !== 'all';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Breadcrumb items={[{ label: 'Inventory' }, { label: 'Products' }]} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-mod-inventory/10">
              <Package className="size-5 text-mod-inventory" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
              <p className="text-sm text-slate-500">Catalogue, prices, VAT and stock alerts</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/inventory/products/categories" className={btn.secondary}>
              <FolderTree className="size-4" /> Categories
            </Link>
            {canWrite && (
              <Link href="/inventory/products/new" className={btn.primary}>
                <Plus className="size-4" /> New product
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Stock alert summary — each tile filters the list */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryTile
          label="Products"
          value={data?.summary.total}
          icon={Package}
          active={query.stock === 'all'}
          tone="slate"
          onClick={() => setParams({ stock: undefined })}
        />
        <SummaryTile
          label="Low stock"
          value={data?.summary.low}
          icon={AlertTriangle}
          active={query.stock === 'low'}
          tone="amber"
          onClick={() => setParams({ stock: query.stock === 'low' ? undefined : 'low' })}
        />
        <SummaryTile
          label="Out of stock"
          value={data?.summary.out}
          icon={PackageX}
          active={query.stock === 'out'}
          tone="red"
          onClick={() => setParams({ stock: query.stock === 'out' ? undefined : 'out' })}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search name, SKU, barcode…"
              aria-label="Search products"
              className={clsx(inputCls, 'py-1.5 pl-9')}
            />
          </div>
          <select
            aria-label="Category"
            value={query.categoryId ?? ''}
            onChange={(e) => setParams({ category: e.target.value || undefined })}
            className={filterCls}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {'  '.repeat(c.depth)}
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Stock"
            value={query.stock}
            onChange={(e) =>
              setParams({ stock: e.target.value === 'all' ? undefined : e.target.value })
            }
            className={filterCls}
          >
            <option value="all">Any stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
          <select
            aria-label="Status"
            value={query.status}
            onChange={(e) =>
              setParams({ status: e.target.value === 'active' ? undefined : e.target.value })
            }
            className={filterCls}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All statuses</option>
          </select>
          {filtersActive && (
            <button
              className={btn.ghost}
              onClick={() => {
                setSearchText('');
                router.replace(pathname, { scroll: false });
              }}
            >
              <RotateCcw className="size-3.5" /> Reset
            </button>
          )}
        </div>

        {error && (
          <div className="p-3">
            <ErrorNotice message={error} onClose={() => setError(null)} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <SortTh label="Product" col="name" query={query} onSort={sortBy} />
                <th className="px-4 py-2.5">Category</th>
                <SortTh
                  label="Price excl. VAT"
                  col="salePrice"
                  query={query}
                  onSort={sortBy}
                  align="right"
                />
                <th className="px-4 py-2.5 text-right">Incl. VAT</th>
                {canSeeCost && <th className="px-4 py-2.5 text-right">Cost · margin</th>}
                <SortTh label="Stock" col="onHand" query={query} onSort={sortBy} align="right" />
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </td>
                </tr>
              ) : data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState filtered={filtersActive} canWrite={canWrite} />
                  </td>
                </tr>
              ) : (
                data?.items.map((p) => (
                  <tr
                    key={p.id}
                    className={clsx(
                      'group hover:bg-slate-50',
                      !p.isActive && 'opacity-60',
                      loading && 'opacity-50',
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/inventory/products/${p.id}`}
                        className="flex items-center gap-3"
                      >
                        <ProductThumb src={p.imageUrl} alt="" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900 group-hover:text-emerald-700">
                            {p.name}
                          </p>
                          <p className="truncate font-mono text-xs text-slate-500">
                            {p.sku}
                            {p.barcode && <span className="text-slate-400"> · {p.barcode}</span>}
                          </p>
                        </div>
                        {!p.isActive && <StatusPill active={false} />}
                      </Link>
                    </td>
                    <td
                      className="max-w-52 truncate px-4 py-2.5 text-slate-600"
                      title={p.category?.path}
                    >
                      {p.category?.path ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">
                      {money(p.salePrice)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                      {money(p.salePriceInclTax)}
                      {p.taxRate && (
                        <span className="block text-xs text-slate-400">
                          VAT {Number(p.taxRate.rate)}%
                        </span>
                      )}
                    </td>
                    {canSeeCost && (
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                        {money(p.purchasePrice)}
                        <span
                          className={clsx(
                            'block text-xs',
                            p.marginPercent && Number(p.marginPercent) < 0
                              ? 'text-red-600'
                              : 'text-slate-400',
                          )}
                        >
                          {p.marginPercent ? `${Number(p.marginPercent)}%` : '—'}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right">
                      <p className="font-medium tabular-nums text-slate-900">
                        {qty(p.onHand)}{' '}
                        <span className="text-xs font-normal text-slate-400">
                          {p.baseUnit.code}
                        </span>
                      </p>
                      <div className="mt-0.5 flex justify-end">
                        <StockBadge status={p.stockStatus} />
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap">
                      {canWrite && (
                        <>
                          <Link
                            href={`/inventory/products/${p.id}`}
                            className={btn.ghost}
                            title="Edit"
                            aria-label={`Edit ${p.name}`}
                          >
                            <Pencil className="size-4" />
                          </Link>
                          <button
                            onClick={() => toggleActive(p)}
                            disabled={busyId === p.id}
                            className={clsx(
                              btn.ghost,
                              p.isActive ? 'hover:text-red-600' : 'hover:text-emerald-700',
                            )}
                            title={p.isActive ? 'Deactivate' : 'Re-activate'}
                            aria-label={`${p.isActive ? 'Deactivate' : 'Re-activate'} ${p.name}`}
                          >
                            {busyId === p.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : p.isActive ? (
                              <Power className="size-4" />
                            ) : (
                              <RotateCcw className="size-4" />
                            )}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-2.5 text-sm text-slate-500">
            <p>
              {(data.page - 1) * PAGE_SIZE + 1}–{Math.min(data.page * PAGE_SIZE, data.total)} of{' '}
              {data.total}
            </p>
            <div className="flex items-center gap-1">
              <button
                className={btn.ghost}
                disabled={data.page <= 1}
                onClick={() => setParams({ page: String(data.page - 1) }, false)}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="tabular-nums">
                {data.page} / {totalPages}
              </span>
              <button
                className={btn.ghost}
                disabled={data.page >= totalPages}
                onClick={() => setParams({ page: String(data.page + 1) }, false)}
                aria-label="Next page"
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

const TONES = {
  slate: { icon: 'text-slate-500 bg-slate-100', ring: 'ring-slate-400' },
  amber: { icon: 'text-amber-600 bg-amber-50', ring: 'ring-amber-500' },
  red: { icon: 'text-red-600 bg-red-50', ring: 'ring-red-500' },
};

function SummaryTile({
  label,
  value,
  icon: Icon,
  active,
  tone,
  onClick,
}: {
  label: string;
  value: number | undefined;
  icon: typeof Package;
  active: boolean;
  tone: keyof typeof TONES;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 sm:p-4',
        active && `ring-2 ${TONES[tone].ring} border-transparent`,
      )}
    >
      <div
        className={clsx(
          'hidden size-10 shrink-0 place-items-center rounded-lg sm:grid',
          TONES[tone].icon,
        )}
      >
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-xs text-slate-500 sm:text-sm">{label}</p>
        <p className="text-xl sm:text-2xl font-semibold tabular-nums text-slate-900">
          {value ?? '—'}
        </p>
      </div>
    </button>
  );
}

function SortTh({
  label,
  col,
  query,
  onSort,
  align,
}: {
  label: string;
  col: Sort;
  query: ProductQuery;
  onSort: (s: Sort) => void;
  align?: 'right';
}) {
  const active = query.sort === col;
  const Arrow = query.order === 'desc' ? ArrowDown : ArrowUp;
  return (
    <th
      className={clsx('px-4 py-2.5', align === 'right' && 'text-right')}
      aria-sort={active ? (query.order === 'desc' ? 'descending' : 'ascending') : 'none'}
    >
      <button
        onClick={() => onSort(col)}
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

function EmptyState({ filtered, canWrite }: { filtered: boolean; canWrite: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-emerald-50">
        <Package className="size-6 text-mod-inventory" />
      </div>
      <h2 className="mt-4 font-semibold text-slate-900">
        {filtered ? 'No product matches these filters' : 'No products yet'}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        {filtered
          ? 'Try another search or reset the filters.'
          : 'Add your first product with its prices, VAT and minimum stock.'}
      </p>
      {!filtered && canWrite && (
        <Link href="/inventory/products/new" className={clsx(btn.primary, 'mt-4')}>
          <Plus className="size-4" /> New product
        </Link>
      )}
    </div>
  );
}
