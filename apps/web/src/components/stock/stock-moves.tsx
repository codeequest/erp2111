'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Loader2, RotateCcw, Search, X } from 'lucide-react';
import type { Paginated, StockDocProduct, StockMoveRow, StockMoveTypeCode } from '@erp/shared';
import { STOCK_MOVE_TYPES } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatMoney, formatQty } from '@/lib/format';
import { ErrorBox, btnSecondary, fieldClass } from '@/components/products/ui';
import { ProductPicker, toDocProduct, useWarehouses } from './stock-ui';

import { tr } from '@/lib/i18n';
const PAGE_SIZE = 50;

export const MOVE_TYPE_LABEL: Record<StockMoveTypeCode, string> = {
  OPENING: 'Opening stock',
  RECEIPT: 'Receipt',
  DELIVERY: 'Delivery',
  ADJUSTMENT: 'Adjustment',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
  CUSTOMER_RETURN: 'Customer return',
};

/** Screen of the document that caused a move, when there is one. */
function sourceHref(m: StockMoveRow): string | null {
  if (!m.sourceId) return null;
  if (m.sourceType === 'StockAdjustment') return `/inventory/adjustments/${m.sourceId}`;
  if (m.sourceType === 'StockTransfer') return `/inventory/transfers/${m.sourceId}`;
  return null;
}

/** Local midnight of a yyyy-mm-dd day, plus `days`, as an ISO instant for the API. */
function dayStart(day: string, days = 0) {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function StockMoves({
  product,
  onProduct,
  initialWarehouseId,
}: {
  product: StockDocProduct | null;
  onProduct: (p: StockDocProduct | null) => void;
  initialWarehouseId: string;
}) {
  const { can } = useAuth();
  const canSeeCost = can('inventory.cost.view');
  const { warehouses } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [type, setType] = useState<'' | StockMoveTypeCode>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<StockMoveRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPage(1), [product, initialWarehouseId]);
  useEffect(() => setWarehouseId(initialWarehouseId), [initialWarehouseId]);

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (product) q.set('productId', product.id);
    if (warehouseId) q.set('warehouseId', warehouseId);
    if (type) q.set('type', type);
    if (from) q.set('from', dayStart(from));
    if (to) q.set('to', dayStart(to, 1));
    if (search.trim()) q.set('search', search.trim());
    setLoading(true);
    const timer = setTimeout(() => {
      api<Paginated<StockMoveRow>>(`/inventory/stock/moves?${q}`)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [product, warehouseId, type, from, to, search, page]);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-2">
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Product")}</span>
          {product ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium text-slate-800">{product.name}</span>{' '}
                <span className="font-mono text-xs text-slate-500">{product.sku}</span>
              </span>
              <button onClick={() => onProduct(null)} className="rounded p-0.5 text-slate-500 hover:bg-slate-200" aria-label={tr("All products")}>
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <ProductPicker onPick={(p) => onProduct(toDocProduct(p))} excludeIds={new Set()} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="col-span-2 sm:col-span-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Warehouse")}</span>
            <select value={warehouseId} onChange={(e) => reset(setWarehouseId)(e.target.value)} className={`${fieldClass} w-full`}>
              <option value="">{tr("All")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Type")}</span>
            <select value={type} onChange={(e) => reset(setType)(e.target.value as '' | StockMoveTypeCode)} className={`${fieldClass} w-full`}>
              <option value="">{tr("All")}</option>
              {STOCK_MOVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {tr(MOVE_TYPE_LABEL[t])}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">{tr("From")}</span>
            <input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} className={`${fieldClass} w-full`} />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">{tr("To")}</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} className={`${fieldClass} w-full`} />
          </label>
        </div>
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => reset(setSearch)(e.target.value)}
            placeholder={tr("Search by document number, e.g. ADJ-2026-00012")}
            className={`${fieldClass} w-full ps-9`}
            aria-label={tr("Search by document number")}
          />
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs font-medium text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">{tr("Date")}</th>
                <th className="px-4 py-2.5">{tr("Type")}</th>
                {!product && <th className="px-4 py-2.5">{tr("Product")}</th>}
                <th className="px-4 py-2.5">{tr("Warehouse")}</th>
                <th className="px-4 py-2.5 text-end">{tr("Quantity")}</th>
                <th className="px-4 py-2.5 text-end">{tr("Balance after")}</th>
                {canSeeCost && <th className="px-4 py-2.5 text-end">{tr("Unit cost")}</th>}
                <th className="px-4 py-2.5">{tr("Document")}</th>
                <th className="px-4 py-2.5">{tr("Reason · user")}</th>
              </tr>
            </thead>
            <tbody className={clsx('divide-y divide-slate-100', loading && data && 'opacity-60')}>
              {data?.items.map((m) => {
                const href = sourceHref(m);
                const positive = !m.quantity.startsWith('-');
                return (
                  <tr key={m.id} className="align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{formatDateTime(m.createdAt)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {tr(MOVE_TYPE_LABEL[m.type])}
                      {m.isReversal && (
                        <span className="ms-1.5 inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 text-xs text-slate-600">
                          <RotateCcw className="size-3" /> {' '}{tr("reversal")}</span>
                      )}
                    </td>
                    {!product && (
                      <td className="px-4 py-2.5">
                        <button onClick={() => onProduct(m.product)} className="text-start hover:underline" title={tr("Show only this product")}>
                          <span className="block font-medium text-slate-800">{m.product.name}</span>
                          <span className="font-mono text-xs text-slate-500">{m.product.sku}</span>
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-2.5 font-mono text-xs">{m.warehouse.code}</td>
                    <td className={clsx('px-4 py-2.5 text-end font-medium tabular-nums', positive ? 'text-emerald-700' : 'text-red-600')}>
                      {positive ? '+' : ''}
                      {formatQty(m.quantity)}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {formatQty(m.balanceAfter)} <span className="text-xs text-slate-400">{m.product.unit}</span>
                    </td>
                    {canSeeCost && <td className="px-4 py-2.5 text-end text-slate-500 tabular-nums">{formatMoney(m.unitCost)}</td>}
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                      {href ? (
                        <Link href={href} className="text-mod-inventory hover:underline">
                          {m.reference}
                        </Link>
                      ) : (
                        (m.reference ?? '—')
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {m.reason && <span className="block text-slate-700">{m.reason}</span>}
                      <span className="text-xs">{m.createdBy}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading && !data && (
          <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" /> {' '}{tr("Loading…")}</p>
        )}
        {data?.items.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-500">{tr("No movement matches these filters.")}</p>}
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm text-slate-600">
            <span>
              {tr("Page")}{' '}{data.page} {' '}{tr("of")}{' '}{pages} · {data.total} {' '}{tr("movements")}</span>
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
        {tr("Every change of stock is listed here and can never be edited or deleted. \"Balance after\" is the stock of the product in that warehouse right after the movement.")}</p>
    </div>
  );
}
