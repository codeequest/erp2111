'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  Package,
  PackageCheck,
  PackageSearch,
  PackageX,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import type {
  Product,
  ProductFormOptions,
  ProductListResponse,
  ProductSortField,
  ProductStatusFilter,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { flattenTree, productsApi } from '@/lib/inventory';
import { formatMoney, formatQty } from '@/lib/format';
import { AccessDenied } from '@/components/access-denied';
import { HeaderButton, ProductsHeader } from '@/components/inventory/products-header';
import { CountUp } from '@/components/ui/count-up';
import { Button, Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

const PAGE_SIZE = 20;

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
  const toast = useToast();

  // URL is the source of truth for filters, so back/forward and shared links work.
  const q = params.get('q') ?? '';
  const categoryId = params.get('cat') ?? '';
  const status = (params.get('status') as ProductStatusFilter) || 'active';
  const lowStock = params.get('low') === '1';
  const sort = (params.get('sort') as ProductSortField) || 'name';
  const order = params.get('order') === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const setParams = useCallback(
    (patch: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (resetPage) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => setParams({ q: search.trim() }), 300);
    return () => clearTimeout(t);
  }, [search, q, setParams]);

  const [options, setOptions] = useState<ProductFormOptions | null>(null);
  const [data, setData] = useState<ProductListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirm, setConfirm] = useState<Product | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canRead = can('inventory.product.read');
  const canWrite = can('inventory.product.write');
  const canCost = can('inventory.cost.view');

  useEffect(() => {
    if (!canRead) return;
    productsApi
      .options()
      .then(setOptions)
      .catch(() => undefined);
  }, [canRead]);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    productsApi
      .list({
        search: q,
        categoryId: categoryId || undefined,
        status,
        lowStock,
        sort,
        order,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((res) => !cancelled && setData(res))
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [canRead, q, categoryId, status, lowStock, sort, order, page, reloadKey]);

  const categoryRows = useMemo(() => flattenTree(options?.categories ?? []), [options]);
  const currency = options?.currency ?? 'USD';
  const filtersActive = Boolean(q || categoryId || lowStock || status !== 'active');

  async function setArchived(product: Product, archived: boolean) {
    setBusyId(product.id);
    try {
      await (archived ? productsApi.archive(product.id) : productsApi.restore(product.id));
      setReloadKey((k) => k + 1);
      toast({
        kind: 'success',
        title: archived ? 'Product archived' : 'Product restored',
        description: product.name,
        action: archived
          ? { label: 'Undo', onClick: () => void setArchived(product, false) }
          : undefined,
      });
    } catch (err) {
      toast({ kind: 'error', title: 'Could not update the product', description: String(err) });
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  }

  if (!canRead) return <AccessDenied permission="inventory.product.read" what="view products" />;

  const stats = data?.stats;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <ProductsHeader
        title="Products"
        subtitle="Your catalogue: what you buy, stock and sell."
        actions={
          canWrite && (
            <Link href="/inventory/products/new">
              <HeaderButton>
                <Plus className="size-4" /> New product
              </HeaderButton>
            </Link>
          )
        }
      />

      {/* KPI cards */}
      <motion.section
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      >
        <StatCard
          icon={Boxes}
          label="All products"
          value={stats?.total}
          tone="slate"
          active={status === 'all' && !lowStock}
          onClick={() => setParams({ status: 'all', low: null })}
        />
        <StatCard
          icon={PackageCheck}
          label="Active"
          value={stats?.active}
          tone="emerald"
          active={status === 'active' && !lowStock}
          onClick={() => setParams({ status: null, low: null })}
        />
        <StatCard
          icon={AlertTriangle}
          label="Low stock"
          value={stats?.lowStock}
          tone="amber"
          active={lowStock}
          onClick={() => setParams({ low: lowStock ? null : '1', status: null })}
        />
        <StatCard
          icon={PackageX}
          label="Archived"
          value={stats?.inactive}
          tone="rose"
          active={status === 'inactive' && !lowStock}
          onClick={() => setParams({ status: 'inactive', low: null })}
        />
      </motion.section>

      {/* Table card */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80"
      >
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:p-4 md:flex-row md:items-center">
          <div className="relative flex-1 md:max-w-sm">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, SKU or barcode…"
              aria-label="Search products"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-2 pr-9 pl-9 text-sm transition outline-none placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <FolderTree className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <select
                value={categoryId}
                onChange={(e) => setParams({ cat: e.target.value })}
                aria-label="Filter by category"
                className="max-w-[14rem] appearance-none rounded-lg border border-slate-200 bg-white py-2 pr-8 pl-9 text-sm text-slate-700 transition outline-none hover:border-slate-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
              >
                <option value="">All categories</option>
                {categoryRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {'  '.repeat(c.depth)}
                    {c.name}
                    {c.isActive ? '' : ' (archived)'}
                  </option>
                ))}
              </select>
              <ChevronRight className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 rotate-90 text-slate-400" />
            </div>

            <Segmented
              value={status}
              onChange={(v) => setParams({ status: v === 'active' ? null : v })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Archived' },
                { value: 'all', label: 'All' },
              ]}
            />

            <button
              onClick={() => setParams({ low: lowStock ? null : '1' })}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ring-1 transition',
                lowStock
                  ? 'bg-amber-50 text-amber-800 ring-amber-200'
                  : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300',
              )}
              aria-pressed={lowStock}
            >
              <AlertTriangle className="size-4" /> Low stock
            </button>

            <AnimatePresence>
              {filtersActive && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => {
                    setSearch('');
                    setParams({ q: null, cat: null, status: null, low: null });
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  <RotateCcw className="size-3.5" /> Reset
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Body */}
        {error ? (
          <EmptyState
            icon={AlertTriangle}
            tone="rose"
            title="Couldn't load products"
            text={error}
            action={
              <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
                <RotateCcw className="size-4" /> Try again
              </Button>
            }
          />
        ) : !data ? (
          <SkeletonRows />
        ) : data.items.length === 0 ? (
          filtersActive ? (
            <EmptyState
              icon={PackageSearch}
              title="No products match"
              text="Try another search, or reset the filters."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setParams({ q: null, cat: null, status: null, low: null });
                  }}
                >
                  <RotateCcw className="size-4" /> Reset filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Package}
              title="Your catalogue is empty"
              text="Add your first product to start buying, stocking and selling it."
              action={
                canWrite && (
                  <Link href="/inventory/products/new">
                    <Button>
                      <Plus className="size-4" /> New product
                    </Button>
                  </Link>
                )
              }
            />
          )
        ) : (
          <div className={clsx('transition-opacity', loading && 'opacity-60')}>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    <SortHeader
                      field="name"
                      label="Product"
                      sort={sort}
                      order={order}
                      onSort={setParams}
                    />
                    <th className="px-4 py-3">Category</th>
                    <SortHeader
                      field="salePrice"
                      label="Sale price"
                      sort={sort}
                      order={order}
                      onSort={setParams}
                      align="right"
                    />
                    {canCost && <th className="px-4 py-3 text-right">Avg. cost</th>}
                    <th className="px-4 py-3 text-right">On hand</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="w-24 px-4 py-3" />
                  </tr>
                </thead>
                <motion.tbody
                  key={`${q}|${categoryId}|${status}|${lowStock}|${sort}|${order}|${page}`}
                  initial="hidden"
                  animate="show"
                  variants={{ show: { transition: { staggerChildren: 0.03 } } }}
                >
                  {data.items.map((p) => (
                    <motion.tr
                      key={p.id}
                      variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                      className="group border-b border-slate-100 last:border-0 hover:bg-emerald-50/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/inventory/products/${p.id}`}
                          className="flex items-center gap-3"
                        >
                          <ProductAvatar product={p} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900 group-hover:text-emerald-700">
                              {p.name}
                            </p>
                            <p className="truncate font-mono text-xs text-slate-500">
                              {p.sku}
                              {p.barcode && <span className="text-slate-400"> · {p.barcode}</span>}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {p.category ? (
                          <button
                            onClick={() => setParams({ cat: p.category!.id })}
                            className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-emerald-100 hover:text-emerald-800"
                          >
                            {p.category.name}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900 tabular-nums">
                        {formatMoney(p.salePrice, currency)}
                        {p.taxRate && (
                          <p className="text-xs font-normal text-slate-400">
                            + {Number(p.taxRate.rate)}% tax
                          </p>
                        )}
                      </td>
                      {canCost && (
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                          {p.averageCost ? formatMoney(p.averageCost, currency) : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        <StockCell product={p} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge active={p.isActive} />
                      </td>
                      <td className="px-4 py-3">
                        {canWrite && (
                          <RowActions
                            product={p}
                            busy={busyId === p.id}
                            onArchive={() => setConfirm(p)}
                            onRestore={() => void setArchived(p, false)}
                          />
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <motion.ul
              key={`m-${q}|${categoryId}|${status}|${lowStock}|${page}`}
              className="divide-y divide-slate-100 md:hidden"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.05 } } }}
            >
              {data.items.map((p) => (
                <motion.li
                  key={p.id}
                  variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
                >
                  <Link
                    href={`/inventory/products/${p.id}`}
                    className="flex items-center gap-3 p-4 active:bg-slate-50"
                  >
                    <ProductAvatar product={p} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-slate-900">{p.name}</p>
                        {!p.isActive && <StatusBadge active={false} />}
                      </div>
                      <p className="truncate font-mono text-xs text-slate-500">{p.sku}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <span className="font-semibold text-slate-800 tabular-nums">
                          {formatMoney(p.salePrice, currency)}
                        </span>
                        <StockCell product={p} compact />
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-slate-300" />
                  </Link>
                </motion.li>
              ))}
            </motion.ul>

            {/* Pagination */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
              <p>
                <span className="font-medium text-slate-700">
                  {(data.page - 1) * data.pageSize + 1}–
                  {Math.min(data.page * data.pageSize, data.total)}
                </span>{' '}
                of <span className="font-medium text-slate-700">{data.total}</span>
              </p>
              <div className="flex items-center gap-1">
                <PageButton
                  disabled={page <= 1}
                  onClick={() => setParams({ page: String(page - 1) }, false)}
                  label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </PageButton>
                <span className="px-2 tabular-nums">
                  {page} / {totalPages}
                </span>
                <PageButton
                  disabled={page >= totalPages}
                  onClick={() => setParams({ page: String(page + 1) }, false)}
                  label="Next page"
                >
                  <ChevronRight className="size-4" />
                </PageButton>
              </div>
            </div>
          </div>
        )}
      </motion.section>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Archive this product?"
        icon={
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-rose-50">
            <Archive className="size-5 text-rose-600" />
          </div>
        }
        description={
          <>
            <span className="font-medium text-slate-700">{confirm?.name}</span> will be hidden from
            new orders and invoices. Its history is kept and you can restore it at any time.
          </>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busyId === confirm?.id}
              onClick={() => confirm && void setArchived(confirm, true)}
            >
              Archive
            </Button>
          </>
        }
      />
    </div>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────────

const TONES = {
  slate: { icon: 'from-slate-600 to-slate-800', ring: 'ring-slate-400' },
  emerald: { icon: 'from-emerald-500 to-teal-600', ring: 'ring-emerald-400' },
  amber: { icon: 'from-amber-400 to-orange-500', ring: 'ring-amber-400' },
  rose: { icon: 'from-rose-400 to-pink-600', ring: 'ring-rose-400' },
} as const;

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  tone: keyof typeof TONES;
  active: boolean;
  onClick: () => void;
}) {
  const t = TONES[tone];
  return (
    <motion.button
      variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 transition-shadow hover:shadow-md sm:p-5',
        active ? clsx('ring-2', t.ring) : 'ring-slate-200/80',
      )}
    >
      <div
        className={clsx(
          'grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm sm:size-11',
          t.icon,
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
        <p className="text-xl font-semibold text-slate-900 tabular-nums sm:text-2xl">
          {value === undefined ? (
            <span className="inline-block h-6 w-10 animate-pulse rounded bg-slate-100" />
          ) : (
            <CountUp value={value} />
          )}
        </p>
      </div>
    </motion.button>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === o.value ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId="status-seg"
              className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-slate-200"
              transition={{ type: 'spring', stiffness: 450, damping: 35 }}
            />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function SortHeader({
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
  onSort: (patch: Record<string, string | null>) => void;
  align?: 'right';
}) {
  const active = sort === field;
  const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={clsx('px-4 py-3', align === 'right' && 'text-right')}>
      <button
        onClick={() =>
          onSort({
            sort: field === 'name' ? null : field,
            order: active && order === 'asc' ? 'desc' : null,
          })
        }
        className={clsx(
          'inline-flex items-center gap-1 uppercase hover:text-slate-800',
          active && 'text-slate-800',
        )}
      >
        {label}
        <Icon className={clsx('size-3.5', !active && 'opacity-40')} />
      </button>
    </th>
  );
}

const AVATAR_GRADIENTS = [
  'from-emerald-400 to-teal-600',
  'from-sky-400 to-blue-600',
  'from-violet-400 to-purple-600',
  'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600',
  'from-cyan-400 to-sky-600',
];

function ProductAvatar({ product }: { product: Product }) {
  const hash = [...product.sku].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const initials = product.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <div
      className={clsx(
        'grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-xs font-bold text-white shadow-sm',
        product.isActive
          ? AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
          : 'from-slate-300 to-slate-400',
      )}
    >
      {initials}
    </div>
  );
}

function StockCell({ product, compact }: { product: Product; compact?: boolean }) {
  const qty = `${formatQty(product.onHand)} ${product.baseUnit.code}`;
  if (product.lowStock) {
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-1 rounded-full bg-amber-50 font-medium text-amber-700 ring-1 ring-amber-200 tabular-nums',
          compact ? 'px-1.5 py-0 text-xs' : 'px-2 py-0.5 text-xs',
        )}
        title={`Below minimum of ${formatQty(product.minStock)} ${product.baseUnit.code}`}
      >
        <AlertTriangle className="size-3" /> {qty}
      </span>
    );
  }
  return <span className="text-slate-600 tabular-nums">{qty}</span>;
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
      <span className="size-1.5 rounded-full bg-emerald-500" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
      <span className="size-1.5 rounded-full bg-slate-400" /> Archived
    </span>
  );
}

function RowActions({
  product,
  busy,
  onArchive,
  onRestore,
}: {
  product: Product;
  busy: boolean;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const btn =
    'grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700 hover:shadow-sm hover:ring-1 hover:ring-slate-200 disabled:opacity-50';
  return (
    <div className="flex justify-end gap-1 opacity-70 transition-opacity group-hover:opacity-100">
      <Link href={`/inventory/products/${product.id}`} className={btn} title="Edit">
        <Pencil className="size-4" />
      </Link>
      {product.isActive ? (
        <button
          onClick={onArchive}
          disabled={busy}
          className={clsx(btn, 'hover:text-rose-600')}
          title="Archive"
        >
          <Archive className="size-4" />
        </button>
      ) : (
        <button
          onClick={onRestore}
          disabled={busy}
          className={clsx(btn, 'hover:text-emerald-600')}
          title="Restore"
        >
          <ArchiveRestore className="size-4" />
        </button>
      )}
    </div>
  );
}

function PageButton({
  children,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  tone = 'emerald',
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: React.ReactNode;
  tone?: 'emerald' | 'rose';
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center px-6 py-16 text-center"
    >
      <div className="relative">
        <div
          className={clsx(
            'absolute inset-0 rounded-full blur-xl',
            tone === 'emerald' ? 'bg-emerald-200/60' : 'bg-rose-200/60',
          )}
        />
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className={clsx(
            'relative grid size-16 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg',
            tone === 'emerald' ? 'from-emerald-400 to-teal-600' : 'from-rose-400 to-pink-600',
          )}
        >
          <Icon className="size-7" />
        </motion.div>
      </div>
      <h2 className="mt-5 font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="size-10 animate-pulse rounded-xl bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/5 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="hidden h-3.5 w-20 animate-pulse rounded bg-slate-100 sm:block" />
        </div>
      ))}
    </div>
  );
}
