'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  History,
  Layers,
  Loader2,
  Search,
  Warehouse,
  X,
} from 'lucide-react';
import {
  STOCK_MOVE_TYPES,
  type CategoryDto,
  type Paginated,
  type StockFilter,
  type StockLevelsResponse,
  type StockMoveRow,
  type StockMoveType,
  type WarehouseDto,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatAmount, formatQty } from '@/lib/format';
import { AccessDenied, Breadcrumbs } from '@/components/page-header';

type Tab = 'levels' | 'moves';

const selectCls = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm';

const MOVE_TYPE_LABELS: Record<StockMoveType, string> = {
  OPENING: 'Opening balance',
  RECEIPT: 'Receipt',
  DELIVERY: 'Delivery',
  ADJUSTMENT: 'Adjustment',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
  CUSTOMER_RETURN: 'Customer return',
};

const MOVE_TYPE_COLORS: Record<StockMoveType, string> = {
  OPENING: 'bg-slate-100 text-slate-700',
  RECEIPT: 'bg-emerald-50 text-emerald-700',
  DELIVERY: 'bg-blue-50 text-blue-700',
  ADJUSTMENT: 'bg-amber-50 text-amber-700',
  TRANSFER_IN: 'bg-violet-50 text-violet-700',
  TRANSFER_OUT: 'bg-violet-50 text-violet-700',
  CUSTOMER_RETURN: 'bg-teal-50 text-teal-700',
};

export default function StockPage() {
  const { can } = useAuth();
  const canRead = can('inventory.stock.read');

  const [tab, setTab] = useState<Tab>('levels');
  /** Product the Movements tab is filtered on (set by clicking a row in Levels). */
  const [moveProduct, setMoveProduct] = useState<{ id: string; label: string } | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseDto[]>([]);
  /** The tab comes from the URL, which is only readable after mount. */
  const [ready, setReady] = useState(false);

  // Deep link: /inventory/stock?tab=moves&productId=…&product=SKU%20Name
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('tab') === 'moves') setTab('moves');
    const id = q.get('productId');
    if (id) setMoveProduct({ id, label: q.get('product') ?? 'Selected product' });
    setReady(true);
  }, []);

  useEffect(() => {
    if (!canRead) return;
    api<WarehouseDto[]>('/inventory/warehouses')
      .then(setWarehouses)
      .catch(() => setWarehouses([]));
  }, [canRead]);

  const showMovesFor = useCallback((id: string, label: string) => {
    setMoveProduct({ id, label });
    setTab('moves');
  }, []);

  if (!canRead) return <AccessDenied permission="inventory.stock.read" what="Stock levels" />;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Inventory' },
            { label: 'Stock levels' },
          ]}
        />
        <div className="mt-2 flex items-center gap-3">
          <div className="bg-mod-inventory/10 grid size-10 place-items-center rounded-lg">
            <Layers className="text-mod-inventory size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Stock levels</h1>
            <p className="text-sm text-slate-500">
              On-hand quantity per warehouse and the stock ledger
            </p>
          </div>
        </div>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        <TabButton active={tab === 'levels'} onClick={() => setTab('levels')} icon={Warehouse}>
          Levels
        </TabButton>
        <TabButton active={tab === 'moves'} onClick={() => setTab('moves')} icon={History}>
          Movements
        </TabButton>
      </div>

      {!ready ? null : tab === 'levels' ? (
        <LevelsTab warehouses={warehouses} onShowMoves={showMovesFor} />
      ) : (
        <MovesTab
          warehouses={warehouses}
          product={moveProduct}
          onClearProduct={() => setMoveProduct(null)}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Warehouse;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium',
        active
          ? 'border-mod-inventory text-slate-900'
          : 'border-transparent text-slate-500 hover:text-slate-700',
      )}
    >
      <Icon className="size-4" />
      {children}
    </button>
  );
}

// ── Levels ───────────────────────────────────────────────────────────────────

function LevelsTab({
  warehouses,
  onShowMoves,
}: {
  warehouses: WarehouseDto[];
  onShowMoves: (productId: string, label: string) => void;
}) {
  const { can } = useAuth();
  const canViewCost = can('inventory.cost.view');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stock, setStock] = useState<StockFilter>('all');
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [data, setData] = useState<StockLevelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    api<CategoryDto[]>('/inventory/categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ stock, page: String(page), pageSize: '50' });
    if (search) qs.set('search', search);
    if (warehouseId) qs.set('warehouseId', warehouseId);
    if (categoryId) qs.set('categoryId', categoryId);
    api<StockLevelsResponse>(`/inventory/stock/levels?${qs}`)
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
  }, [search, warehouseId, categoryId, stock, page]);

  const columns = data?.warehouses ?? [];
  // One column per warehouse only makes sense when there are several of them.
  const showWarehouseColumns = columns.length > 1;
  const reset =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };

  return (
    <div className="space-y-4">
      {canViewCost && data?.totalValue !== undefined && (
        <div className="flex flex-wrap gap-4">
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-3">
            <p className="text-xs font-medium text-slate-500">Stock value (at average cost)</p>
            <p className="mt-0.5 text-xl font-semibold text-slate-900 tabular-nums">
              {formatAmount(data.totalValue)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-3">
            <p className="text-xs font-medium text-slate-500">Products listed</p>
            <p className="mt-0.5 text-xl font-semibold text-slate-900 tabular-nums">{data.total}</p>
          </div>
        </div>
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
            value={warehouseId}
            onChange={(e) => reset(setWarehouseId)(e.target.value)}
            aria-label="Warehouse"
            className={selectCls}
          >
            <option value="">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
          <select
            value={categoryId}
            onChange={(e) => reset(setCategoryId)(e.target.value)}
            aria-label="Category"
            className={selectCls}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-md border border-slate-300 p-0.5 text-sm">
            {(
              [
                ['all', 'All'],
                ['inStock', 'In stock'],
                ['low', 'Low stock'],
                ['out', 'Out of stock'],
              ] as [StockFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => reset(setStock)(value)}
                aria-pressed={stock === value}
                className={clsx(
                  'rounded px-2.5 py-1',
                  stock === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {loading && <Loader2 className="size-4 animate-spin text-slate-400" />}
        </div>

        {error ? (
          <p role="alert" className="m-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : data && data.items.length === 0 && !loading ? (
          <EmptyState
            title={
              stock === 'low'
                ? 'No product is below its minimum stock'
                : 'No product matches these filters'
            }
            text={
              stock === 'low'
                ? 'Set a minimum stock on a product to get low-stock alerts.'
                : 'Try another search or clear the filters.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Product</th>
                  {showWarehouseColumns &&
                    columns.map((w) => (
                      <th key={w.id} className="px-4 py-2.5 text-right" title={w.name}>
                        {w.code}
                      </th>
                    ))}
                  <th className="px-4 py-2.5 text-right">{warehouseId ? 'On hand' : 'Total'}</th>
                  <th className="px-4 py-2.5 text-right">Min.</th>
                  {canViewCost && <th className="px-4 py-2.5 text-right">Value</th>}
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items.map((r) => {
                  const negative = Number(r.total) < 0;
                  return (
                    <tr key={r.product.id} className={clsx(!r.product.isActive && 'opacity-60')}>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/inventory/products/${r.product.id}`}
                          className="font-medium text-slate-900 hover:text-blue-600"
                        >
                          {r.product.name}
                        </Link>
                        <div className="font-mono text-xs text-slate-400">
                          {r.product.sku}
                          {!r.product.isActive && ' · inactive'}
                        </div>
                      </td>
                      {showWarehouseColumns &&
                        columns.map((w) => {
                          const q = r.byWarehouse[w.id];
                          return (
                            <td
                              key={w.id}
                              className={clsx(
                                'px-4 py-2.5 text-right tabular-nums',
                                q ? 'text-slate-700' : 'text-slate-300',
                              )}
                            >
                              {q ? formatQty(q) : '0'}
                            </td>
                          );
                        })}
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1 font-semibold',
                            negative
                              ? 'text-red-600'
                              : r.isLow
                                ? 'text-amber-700'
                                : 'text-slate-900',
                          )}
                          title={r.isLow ? 'Below minimum stock' : undefined}
                        >
                          {r.isLow && <AlertTriangle className="size-3.5" />}
                          {formatQty(r.total)}
                        </span>{' '}
                        <span className="text-xs text-slate-400">{r.product.baseUnit.code}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
                        {Number(r.minStock) > 0 ? formatQty(r.minStock) : '—'}
                      </td>
                      {canViewCost && (
                        <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                          {formatAmount(r.value)}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() =>
                            onShowMoves(r.product.id, `${r.product.sku} — ${r.product.name}`)
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                        >
                          <History className="size-3.5" /> Movements
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager data={data} page={page} setPage={setPage} />}
      </div>
    </div>
  );
}

// ── Movements ────────────────────────────────────────────────────────────────

function MovesTab({
  warehouses,
  product,
  onClearProduct,
}: {
  warehouses: WarehouseDto[];
  product: { id: string; label: string } | null;
  onClearProduct: () => void;
}) {
  const { can } = useAuth();
  const canViewCost = can('inventory.cost.view');

  const [warehouseId, setWarehouseId] = useState('');
  const [type, setType] = useState<StockMoveType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<StockMoveRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPage(1), [product?.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (product) qs.set('productId', product.id);
    if (warehouseId) qs.set('warehouseId', warehouseId);
    if (type) qs.set('type', type);
    // Date inputs give local calendar days: send local midnight as exact instants.
    if (from) qs.set('from', localMidnight(from).toISOString());
    if (to) {
      const end = localMidnight(to);
      end.setDate(end.getDate() + 1);
      qs.set('to', end.toISOString());
    }
    api<Paginated<StockMoveRow>>(`/inventory/stock/moves?${qs}`)
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
  }, [product, warehouseId, type, from, to, page]);

  const reset =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };
  const hasFilters = !!product || !!warehouseId || !!type || !!from || !!to;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
        {product && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pr-1 pl-3 text-sm text-blue-800">
            {product.label}
            <button
              onClick={onClearProduct}
              aria-label="Show all products"
              className="rounded-full p-0.5 hover:bg-blue-100"
            >
              <X className="size-3.5" />
            </button>
          </span>
        )}
        <select
          value={warehouseId}
          onChange={(e) => reset(setWarehouseId)(e.target.value)}
          aria-label="Warehouse"
          className={selectCls}
        >
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {w.name}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => reset(setType)(e.target.value as StockMoveType | '')}
          aria-label="Movement type"
          className={selectCls}
        >
          <option value="">All types</option>
          {STOCK_MOVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {MOVE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          From
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => reset(setFrom)(e.target.value)}
            className={selectCls}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          To
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => reset(setTo)(e.target.value)}
            className={selectCls}
          />
        </label>
        {loading && <Loader2 className="size-4 animate-spin text-slate-400" />}
      </div>

      {error ? (
        <p role="alert" className="m-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : data && data.items.length === 0 && !loading ? (
        <EmptyState
          title={hasFilters ? 'No movement matches these filters' : 'No stock movement yet'}
          text={
            hasFilters
              ? 'Try another period or clear the filters.'
              : 'Movements appear here when goods are received, delivered, adjusted or transferred.'
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Type</th>
                {!product && <th className="px-4 py-2.5">Product</th>}
                <th className="px-4 py-2.5">Warehouse</th>
                <th className="px-4 py-2.5 text-right">Quantity</th>
                {canViewCost && <th className="px-4 py-2.5 text-right">Unit cost</th>}
                <th className="px-4 py-2.5">Reference / reason</th>
                <th className="px-4 py-2.5">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.items.map((m) => {
                const qty = Number(m.quantity);
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 tabular-nums">
                      {new Date(m.createdAt).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={clsx(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                          MOVE_TYPE_COLORS[m.type],
                        )}
                      >
                        {MOVE_TYPE_LABELS[m.type]}
                      </span>
                    </td>
                    {!product && (
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/inventory/products/${m.product.id}`}
                          className="text-slate-900 hover:text-blue-600"
                        >
                          {m.product.name}
                        </Link>
                        <div className="font-mono text-xs text-slate-400">{m.product.sku}</div>
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-slate-600" title={m.warehouse.name}>
                      {m.warehouse.code}
                    </td>
                    <td
                      className={clsx(
                        'px-4 py-2.5 text-right font-medium whitespace-nowrap tabular-nums',
                        qty > 0 ? 'text-emerald-700' : 'text-red-600',
                      )}
                    >
                      {qty > 0 ? '+' : ''}
                      {formatQty(m.quantity)}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        {m.product.baseUnit.code}
                      </span>
                    </td>
                    {canViewCost && (
                      <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                        {formatAmount(m.unitCost, 4)}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-slate-600">
                      {m.reference && <div className="font-mono text-xs">{m.reference}</div>}
                      {m.reason && <div className="text-xs text-slate-500 italic">{m.reason}</div>}
                      {!m.reference && !m.reason && '—'}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                      {m.createdBy.fullName}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager data={data} page={page} setPage={setPage} />}
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────

function localMidnight(isoDay: string): Date {
  const [y, m, d] = isoDay.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="bg-mod-inventory/10 grid size-12 place-items-center rounded-full">
        <Layers className="text-mod-inventory size-6" />
      </div>
      <h2 className="mt-4 font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">{text}</p>
    </div>
  );
}

function Pager({
  data,
  page,
  setPage,
}: {
  data: Paginated<unknown>;
  page: number;
  setPage: (fn: (p: number) => number) => void;
}) {
  if (data.total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const from = (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.page * data.pageSize, data.total);
  return (
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
  );
}
