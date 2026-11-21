'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Layers,
  Lock,
  Package,
  PackageSearch,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatQty, toNum } from '@/lib/format';
import {
  categoryLabels,
  productsApi,
  type FormOptions,
  type ListQuery,
  type Page,
  type ProductListItem,
} from '@/lib/products';
import {
  AnimatedNumber,
  Badge,
  Breadcrumbs,
  ButtonLink,
  EmptyState,
  inputClass,
  Skeleton,
} from '@/components/ui';

const PAGE_SIZE = 25;
type Sort = NonNullable<ListQuery['sort']>;

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsList />
    </Suspense>
  );
}

function ProductsList() {
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Filters live in the URL so a filtered list can be bookmarked / shared.
  const query: ListQuery = {
    q: params.get('q') ?? '',
    categoryId: params.get('category') ?? '',
    status: (params.get('status') as ListQuery['status']) ?? 'active',
    lowStock: params.get('low') === '1',
    sort: (params.get('sort') as Sort) ?? 'name',
    order: (params.get('order') as 'asc' | 'desc') ?? 'asc',
    page: Number(params.get('page') ?? 1),
    pageSize: PAGE_SIZE,
  };

  const setParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete('page');
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  };

  const [search, setSearch] = useState(query.q ?? '');
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== (query.q ?? '')) setParams({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const [data, setData] = useState<Page<ProductListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [lowCount, setLowCount] = useState<number | null>(null);

  const key = params.toString();
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    productsApi
      .list(query)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    productsApi.formOptions().then(setOptions).catch(() => undefined);
    if (can('inventory.stock.read')) {
      productsApi
        .lowStock(1)
        .then((r) => setLowCount(r.total))
        .catch(() => undefined);
    }
  }, [can]);

  const categories = useMemo(() => (options ? categoryLabels(options.categories) : []), [options]);
  const showCost = can('inventory.cost.view');
  const canWrite = can('inventory.product.write');
  const filtered = !!(query.q || query.categoryId || query.lowStock || query.status !== 'active');

  if (!can('inventory.product.read')) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <Lock className="mx-auto size-8 text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Access denied</h1>
        <p className="mt-1 text-sm text-slate-500">You need inventory.product.read to see products.</p>
      </div>
    );
  }

  const sortBy = (field: Sort) =>
    setParams({
      sort: field,
      order: query.sort === field && query.order === 'asc' ? 'desc' : 'asc',
    });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 p-6 text-white shadow-lg shadow-emerald-600/20"
      >
        <div className="absolute -top-16 -right-10 size-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-20 left-1/3 size-48 rounded-full bg-teal-300/20 blur-2xl" />
        <div className="relative">
          <div className="[&_a]:text-emerald-50/80 [&_a:hover]:text-white [&_span]:text-emerald-50/80 [&_span.font-medium]:text-white">
            <Breadcrumbs
              items={[{ label: 'Home', href: '/dashboard' }, { label: 'Inventory' }, { label: 'Products' }]}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                <Package className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Products</h1>
                <p className="text-sm text-emerald-50/90">Catalogue, variants, prices and stock</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Stat label="Products" value={data?.total} />
              {lowCount !== null && (
                <button
                  onClick={() => setParams({ low: query.lowStock ? null : '1', status: null })}
                  className="text-left"
                >
                  <Stat label="Low stock" value={lowCount} warn={lowCount > 0} />
                </button>
              )}
              {canWrite && (
                <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
                  <Link
                    href="/inventory/products/new"
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-md hover:shadow-lg"
                  >
                    <Plus className="size-4" /> New product
                  </Link>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Table card */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 md:flex-row md:items-center">
          <div className="relative flex-1 md:max-w-sm">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, SKU or barcode…"
              className={clsx(inputClass, 'pl-9')}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <select
            value={query.categoryId}
            onChange={(e) => setParams({ category: e.target.value || null })}
            className={clsx(inputClass, 'md:w-56')}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <Segmented
            value={query.status!}
            onChange={(v) => setParams({ status: v === 'active' ? null : v })}
            options={[
              ['active', 'Active'],
              ['inactive', 'Inactive'],
              ['all', 'All'],
            ]}
          />
          <button
            onClick={() => setParams({ low: query.lowStock ? null : '1' })}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ring-1 transition',
              query.lowStock
                ? 'bg-amber-50 text-amber-700 ring-amber-300'
                : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
            )}
          >
            <AlertTriangle className="size-4" /> Low stock
          </button>
        </div>

        {error && <p className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="w-14 py-3 pl-4" />
                <SortTh label="Product" field="name" query={query} onSort={sortBy} />
                <SortTh label="SKU" field="sku" query={query} onSort={sortBy} className="hidden md:table-cell" />
                <th className="hidden px-3 py-3 lg:table-cell">Category</th>
                <SortTh label="Price" field="salePrice" query={query} onSort={sortBy} align="right" />
                {showCost && <th className="hidden px-3 py-3 text-right xl:table-cell">Avg. cost</th>}
                <th className="px-3 py-3">Stock</th>
                <th className="py-3 pr-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data
                ? Array.from({ length: 6 }, (_, i) => <SkeletonRow key={i} cost={showCost} />)
                : null}
              <AnimatePresence initial={false}>
                {data?.items.map((p, i) => (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: loading ? 0.5 : 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(i * 0.025, 0.3), duration: 0.25 }}
                    onClick={() => router.push(`/inventory/products/${p.id}`)}
                    className="group cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-emerald-50/40"
                  >
                    <td className="py-2.5 pl-4">
                      <Thumb url={p.imageUrl} name={p.name} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/inventory/products/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-slate-900 group-hover:text-emerald-700"
                      >
                        {p.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-slate-500 md:hidden">{p.sku}</span>
                        {p.hasVariants && (
                          <Badge tone="violet" icon={Layers}>
                            {p.variantCount} variants
                          </Badge>
                        )}
                        {p.parent && <Badge tone="violet">Variant of {p.parent.name}</Badge>}
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 font-mono text-xs text-slate-600 md:table-cell">
                      {p.sku}
                    </td>
                    <td className="hidden px-3 py-2.5 text-slate-600 lg:table-cell">
                      {p.category?.name ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-900 tabular-nums">
                      {formatMoney(p.salePrice)}
                    </td>
                    {showCost && (
                      <td className="hidden px-3 py-2.5 text-right text-slate-500 tabular-nums xl:table-cell">
                        {formatMoney(p.averageCost)}
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <StockCell item={p} />
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      {p.isActive ? (
                        <Badge tone="green">Active</Badge>
                      ) : (
                        <Badge tone="slate">Inactive</Badge>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {data && data.items.length === 0 && !loading && (
          <EmptyState
            icon={filtered ? PackageSearch : Package}
            title={filtered ? 'No product matches these filters' : 'No products yet'}
            text={
              filtered
                ? 'Try another search term or clear the filters.'
                : 'Create your first product to start tracking stock, prices and sales.'
            }
            action={
              filtered ? (
                <button
                  onClick={() => {
                    setSearch('');
                    router.replace(pathname);
                  }}
                  className="text-sm font-medium text-emerald-700 hover:underline"
                >
                  Clear filters
                </button>
              ) : canWrite ? (
                <ButtonLink href="/inventory/products/new" icon={Plus} variant="primary">
                  New product
                </ButtonLink>
              ) : undefined
            }
          />
        )}

        {/* Pagination */}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
            <span>
              {(data.page - 1) * PAGE_SIZE + 1}–{Math.min(data.page * PAGE_SIZE, data.total)} of{' '}
              {data.total}
            </span>
            <div className="flex items-center gap-1">
              <PageBtn
                disabled={data.page <= 1}
                onClick={() => setParams({ page: String(data.page - 1) }, false)}
                label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </PageBtn>
              <span className="px-2 tabular-nums">
                {data.page} / {totalPages}
              </span>
              <PageBtn
                disabled={data.page >= totalPages}
                onClick={() => setParams({ page: String(data.page + 1) }, false)}
                label="Next page"
              >
                <ChevronRight className="size-4" />
              </PageBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value?: number; warn?: boolean }) {
  return (
    <div
      className={clsx(
        'rounded-xl px-4 py-2 ring-1 backdrop-blur transition',
        warn ? 'bg-amber-400/25 ring-amber-200/50 hover:bg-amber-400/35' : 'bg-white/15 ring-white/25',
      )}
    >
      <p className="text-[11px] font-medium tracking-wide text-emerald-50/90 uppercase">{label}</p>
      <p className="text-xl leading-tight font-semibold tabular-nums">
        {value === undefined ? '—' : <AnimatedNumber value={value} format={(n) => String(Math.round(n))} />}
      </p>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={clsx(
            'relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === v ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {value === v && (
            <motion.span
              layoutId="status-pill"
              className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-slate-200"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  );
}

function SortTh({
  label,
  field,
  query,
  onSort,
  align,
  className,
}: {
  label: string;
  field: Sort;
  query: ListQuery;
  onSort: (f: Sort) => void;
  align?: 'right';
  className?: string;
}) {
  const active = query.sort === field;
  const Arrow = query.order === 'desc' ? ArrowDown : ArrowUp;
  return (
    <th className={clsx('px-3 py-3', align === 'right' && 'text-right', className)}>
      <button
        onClick={() => onSort(field)}
        className={clsx(
          'inline-flex items-center gap-1 uppercase hover:text-slate-800',
          active && 'text-emerald-700',
        )}
      >
        {label}
        <Arrow className={clsx('size-3 transition', active ? 'opacity-100' : 'opacity-0')} />
      </button>
    </th>
  );
}

function Thumb({ url, name }: { url: string | null; name: string }) {
  return (
    <div className="grid size-10 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 ring-1 ring-slate-200 transition group-hover:ring-emerald-300">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} width={40} height={40} className="size-10 object-cover" />
      ) : (
        <ImageOff className="size-4 text-slate-300" />
      )}
    </div>
  );
}

function StockCell({ item }: { item: ProductListItem }) {
  const onHand = toNum(item.onHand);
  const min = toNum(item.minStock);
  // Bar: full at 2× the minimum (or at the stock itself when no minimum is set).
  const scale = min > 0 ? min * 2 : Math.max(onHand, 1);
  const pct = Math.max(0, Math.min(100, (onHand / scale) * 100));
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div className="w-full max-w-24">
        <div className="flex items-baseline justify-between gap-2">
          <span className={clsx('font-medium tabular-nums', item.lowStock ? 'text-amber-700' : 'text-slate-900')}>
            {formatQty(onHand)}
          </span>
          <span className="text-[11px] text-slate-400">{item.baseUnit.code}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className={clsx(
              'h-full rounded-full',
              item.lowStock ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-emerald-400 to-teal-500',
            )}
          />
        </div>
      </div>
      {item.lowStock && (
        <span title={min > 0 ? `Minimum: ${formatQty(min)}` : 'A variant is under its minimum'}>
          <Badge tone="amber" pulse>
            Low
          </Badge>
        </span>
      )}
    </div>
  );
}

function SkeletonRow({ cost }: { cost: boolean }) {
  return (
    <tr className="border-b border-slate-50">
      <td className="py-3 pl-4">
        <Skeleton className="size-10 rounded-lg" />
      </td>
      <td className="px-3">
        <Skeleton className="h-4 w-40" />
      </td>
      <td className="hidden px-3 md:table-cell">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="hidden px-3 lg:table-cell">
        <Skeleton className="h-4 w-24" />
      </td>
      <td className="px-3">
        <Skeleton className="ml-auto h-4 w-14" />
      </td>
      {cost && (
        <td className="hidden px-3 xl:table-cell">
          <Skeleton className="ml-auto h-4 w-14" />
        </td>
      )}
      <td className="px-3">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="pr-4">
        <Skeleton className="ml-auto h-5 w-14 rounded-full" />
      </td>
    </tr>
  );
}

function PageBtn({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="rounded-lg p-1.5 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
