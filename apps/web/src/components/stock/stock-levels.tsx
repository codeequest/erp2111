'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Loader2,
  Search,
} from 'lucide-react';
import type {
  ProductLookups,
  StockConsistency,
  StockDocProduct,
  StockLevelSort,
  StockLevelsPage,
} from '@erp/shared';
import { api, apiDownload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatQty } from '@/lib/format';
import { ErrorBox, btnSecondary, fieldClass } from '@/components/products/ui';
import { useWarehouses } from './stock-ui';

import { tr } from '@/lib/i18n';
const PAGE_SIZE = 50;

export function StockLevels({
  initialLow,
  onHistory,
}: {
  initialLow: boolean;
  onHistory: (p: StockDocProduct, warehouseId: string) => void;
}) {
  const { can } = useAuth();
  const canSeeCost = can('inventory.cost.view');
  const { warehouses } = useWarehouses();
  const [categories, setCategories] = useState<ProductLookups['categories']>([]);

  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [inStock, setInStock] = useState(false);
  const [lowStock, setLowStock] = useState(initialLow);
  const [sort, setSort] = useState<StockLevelSort>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StockLevelsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consistency, setConsistency] = useState<StockConsistency | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (can('inventory.product.read')) {
      api<ProductLookups>('/inventory/products/lookups')
        .then((l) => setCategories(l.categories))
        .catch(() => undefined);
    }
    api<StockConsistency>('/inventory/stock/consistency')
      .then(setConsistency)
      .catch(() => undefined);
    // Once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function query(withPage: boolean) {
    const q = new URLSearchParams({ sort, order });
    if (withPage) {
      q.set('page', String(page));
      q.set('pageSize', String(PAGE_SIZE));
    }
    if (search.trim()) q.set('search', search.trim());
    if (warehouseId) q.set('warehouseId', warehouseId);
    if (categoryId) q.set('categoryId', categoryId);
    if (inStock) q.set('inStock', 'true');
    if (lowStock) q.set('lowStock', 'true');
    return q;
  }

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      api<StockLevelsPage>(`/inventory/stock/levels?${query(true)}`)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, warehouseId, categoryId, inStock, lowStock, sort, order, page]);

  function sortBy(field: StockLevelSort) {
    if (sort === field) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(field);
      setOrder(field === 'name' || field === 'sku' ? 'asc' : 'desc');
    }
    setPage(1);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await apiDownload(`/inventory/stock/levels/export?${query(false)}`, 'stock-levels.xlsx');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const SortHeader = ({ field, children, right }: { field: StockLevelSort; children: React.ReactNode; right?: boolean }) => (
    <th className={clsx('px-4 py-2.5', right && 'text-end')}>
      <button
        onClick={() => sortBy(field)}
        className={clsx('inline-flex items-center gap-1 uppercase hover:text-slate-800', sort === field && 'text-slate-800')}
      >
        {children}
        {sort === field && (order === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      {consistency && !consistency.ok && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" /> {' '}{tr("Stock check failed: some balances do not match the movement history or the open orders.")}</p>
          <ul className="mt-1 list-disc ps-6 text-xs">
            {consistency.differences.slice(0, 5).map((d) => (
              <li key={`${d.product.id}-${d.warehouse.id}`}>
                {d.product.sku} {' '}{tr("in")}{' '}{d.warehouse.code}{tr(": balance")}{' '}{d.balance}{tr(", history")}{' '}{d.ledger}
              </li>
            ))}
            {consistency.reservationDifferences.slice(0, 5).map((d) => (
              <li key={"r-" + d.product.id + "-" + d.warehouse.id}>
                {d.product.sku} {' '}{tr("in")}{' '}{d.warehouse.code}{tr(": reserved")}{' '}{d.reserved}{tr(", open orders")}{' '}{d.orders}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">{tr("Tell your administrator: stock was changed outside the ERP.")}</p>
        </div>
      )}

      <div className={clsx('grid gap-3', canSeeCost ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{tr("Products")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{data?.summary.products ?? '—'}</p>
        </div>
        <button
          onClick={() => reset(setLowStock)(!lowStock)}
          className={clsx(
            'rounded-xl border bg-white p-4 text-start transition hover:border-amber-300',
            lowStock ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200',
          )}
        >
          <p className="text-sm text-slate-500">{tr("Low stock")}{' '}{lowStock ? tr("(showing only these)") : tr("— click to show")}</p>
          <p className={clsx('mt-1 text-2xl font-semibold', data?.summary.low ? 'text-amber-600' : 'text-slate-900')}>
            {data?.summary.low ?? '—'}
          </p>
        </button>
        {canSeeCost && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{tr("Stock value")}{' '}{warehouseId ? tr("(this warehouse)") : ''}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(data?.summary.value)}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => reset(setSearch)(e.target.value)}
            placeholder={tr("Search name, SKU or barcode")}
            className={`${fieldClass} w-full ps-9`}
            aria-label={tr("Search products")}
          />
        </div>
        <select value={warehouseId} onChange={(e) => reset(setWarehouseId)(e.target.value)} className={fieldClass} aria-label={tr("Warehouse")}>
          <option value="">{tr("All warehouses")}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {w.name}
            </option>
          ))}
        </select>
        {categories.length > 0 && (
          <select value={categoryId} onChange={(e) => reset(setCategoryId)(e.target.value)} className={fieldClass} aria-label={tr("Category")}>
            <option value="">{tr("All categories")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {'  '.repeat(c.depth)}
                {c.name}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={inStock} onChange={(e) => reset(setInStock)(e.target.checked)} />
          {tr("Only in stock")}</label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={lowStock} onChange={(e) => reset(setLowStock)(e.target.checked)} />
          {tr("Low stock only")}</label>
        <button onClick={exportCsv} disabled={exporting} className={clsx(btnSecondary, 'ms-auto')}>
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} {' '}{tr("Export Excel")}</button>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs font-medium text-slate-500 uppercase">
              <tr>
                <SortHeader field="name">{tr("Product")}</SortHeader>
                <SortHeader field="onHand" right>
                  {tr("On hand")}</SortHeader>
                <th className="px-4 py-2.5 text-end">{tr("Reserved")}</th>
                <SortHeader field="available" right>
                  {tr("Available")}</SortHeader>
                <th className="px-4 py-2.5 text-end">{tr("Min stock")}</th>
                {canSeeCost && <th className="px-4 py-2.5 text-end">{tr("Avg cost")}</th>}
                {canSeeCost && (
                  <SortHeader field="value" right>
                    {tr("Value")}</SortHeader>
                )}
                <th className="w-12 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className={clsx('divide-y divide-slate-100', loading && data && 'opacity-60')}>
              {data?.items.map((r) => (
                <tr key={r.product.id} className={clsx(r.low && 'bg-amber-50/60', !r.isActive && 'text-slate-400')}>
                  <td className="px-4 py-2.5">
                    <span className="block font-medium text-slate-800">
                      {r.product.name}
                      {!r.isActive && <span className="ms-2 text-xs font-normal text-slate-400">{tr("(inactive)")}</span>}
                    </span>
                    <span className="font-mono text-xs text-slate-500">{r.product.sku}</span>
                  </td>
                  <td className="px-4 py-2.5 text-end font-medium tabular-nums">
                    <span className={Number(r.onHand) < 0 ? 'text-red-600' : ''}>{formatQty(r.onHand)}</span>{' '}
                    <span className="text-xs font-normal text-slate-400">{r.product.unit}</span>
                  </td>
                  <td className="px-4 py-2.5 text-end text-slate-500 tabular-nums">
                    {Number(r.reserved) ? formatQty(r.reserved) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">{formatQty(r.available)}</td>
                  <td className="px-4 py-2.5 text-end tabular-nums">
                    {Number(r.minStock) ? (
                      <span className={r.low ? 'inline-flex items-center gap-1 font-medium text-amber-700' : 'text-slate-500'}>
                        {r.low && <AlertTriangle className="size-3.5" />}
                        {formatQty(r.minStock)}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  {canSeeCost && <td className="px-4 py-2.5 text-end text-slate-500 tabular-nums">{formatMoney(r.averageCost)}</td>}
                  {canSeeCost && <td className="px-4 py-2.5 text-end tabular-nums">{formatMoney(r.value)}</td>}
                  <td className="px-2 py-2.5 text-end">
                    <button
                      onClick={() => onHistory(r.product, warehouseId)}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                      title={tr("Movement history")}
                      aria-label={tr('Movement history of {sku}', { sku: r.product.sku })}
                    >
                      <History className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && !data && (
          <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" /> {' '}{tr("Loading…")}</p>
        )}
        {data?.items.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            {lowStock ? tr("No product is below its minimum stock.") : tr("No product matches these filters.")}
          </p>
        )}
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm text-slate-600">
            <span>
              {tr("Page")}{' '}{data.page} {' '}{tr("of")}{' '}{pages} · {data.total} {' '}{tr("products")}</span>
            <span className="flex gap-2">
              <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1} className={btnSecondary} aria-label={tr("Previous page")}>
                <ChevronLeft className="rtl:-scale-x-100 size-4" />
              </button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= pages} className={btnSecondary} aria-label={tr("Next page")}>
                <ChevronRight className="rtl:-scale-x-100 size-4" />
              </button>
            </span>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {tr("Available = on hand − reserved for confirmed sales orders. Low stock compares the total of all warehouses with the product's minimum.")}</p>
    </div>
  );
}
