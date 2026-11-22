'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import type { Paginated, StockAdjustmentListItem, WarehouseDto } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatAmount, formatQty } from '@/lib/format';
import { AccessDenied, Breadcrumbs } from '@/components/page-header';

export default function AdjustmentsPage() {
  const { can } = useAuth();
  const canRead = can('inventory.stock.read');
  const canAdjust = can('inventory.stock.adjust');
  const canViewCost = can('inventory.cost.view');

  const [warehouses, setWarehouses] = useState<WarehouseDto[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<StockAdjustmentListItem> | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    api<WarehouseDto[]>('/inventory/warehouses')
      .then(setWarehouses)
      .catch(() => setWarehouses([]));
  }, [canRead]);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (warehouseId) qs.set('warehouseId', warehouseId);
    api<Paginated<StockAdjustmentListItem>>(`/inventory/stock/adjustments?${qs}`)
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
  }, [canRead, warehouseId, page]);

  if (!canRead && !canAdjust) {
    return <AccessDenied permission="inventory.stock.adjust" what="Adjustments" />;
  }

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Inventory' },
            { label: 'Adjustments' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-mod-inventory/10 grid size-10 place-items-center rounded-lg">
              <SlidersHorizontal className="text-mod-inventory size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Stock adjustments</h1>
              <p className="text-sm text-slate-500">
                Correct stock after a count, breakage or loss — always with a reason
              </p>
            </div>
          </div>
          {canAdjust && (
            <Link
              href="/inventory/adjustments/new"
              className="bg-mod-inventory inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90"
            >
              <Plus className="size-4" /> New adjustment
            </Link>
          )}
        </div>
      </div>

      {!canRead ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          You can post adjustments but not view their history (needs{' '}
          <code className="rounded bg-slate-100 px-1">inventory.stock.read</code>).
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 border-b border-slate-200 p-3">
            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setPage(1);
              }}
              aria-label="Warehouse"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
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
                <SlidersHorizontal className="text-mod-inventory size-6" />
              </div>
              <h2 className="mt-4 font-semibold text-slate-900">No adjustment yet</h2>
              <p className="mt-1 max-w-md text-sm text-slate-500">
                Post an adjustment after a stock count, or when goods are damaged, lost or found.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="w-8 px-2 py-2.5" />
                    <th className="px-4 py-2.5">Reference</th>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Warehouse</th>
                    <th className="px-4 py-2.5">Reason</th>
                    <th className="px-4 py-2.5 text-right">Products</th>
                    {canViewCost && <th className="px-4 py-2.5 text-right">Value change</th>}
                    <th className="hidden px-4 py-2.5 2xl:table-cell">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.items.map((a) => {
                    const isOpen = open.has(a.id);
                    const value = Number(a.valueChange ?? 0);
                    return (
                      <Fragment key={a.id}>
                        <tr
                          onClick={() => toggle(a.id)}
                          className="cursor-pointer hover:bg-slate-50"
                          aria-expanded={isOpen}
                        >
                          <td className="px-2 py-2.5 text-slate-400">
                            <ChevronDown
                              className={clsx('size-4 transition', !isOpen && '-rotate-90')}
                            />
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs font-medium whitespace-nowrap text-slate-900">
                            {a.reference}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 tabular-nums">
                            {new Date(a.createdAt).toLocaleString(undefined, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600" title={a.warehouse.name}>
                            {a.warehouse.code}
                          </td>
                          <td
                            className="max-w-56 truncate px-4 py-2.5 text-slate-700"
                            title={a.reason}
                          >
                            {a.reason}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{a.lines.length}</td>
                          {canViewCost && (
                            <td
                              className={clsx(
                                'px-4 py-2.5 text-right tabular-nums',
                                value < 0 ? 'text-red-600' : value > 0 ? 'text-emerald-700' : '',
                              )}
                            >
                              {value > 0 ? '+' : ''}
                              {formatAmount(a.valueChange)}
                            </td>
                          )}
                          <td className="hidden px-4 py-2.5 whitespace-nowrap text-slate-600 2xl:table-cell">
                            {a.createdBy.fullName}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-slate-50/60">
                            <td />
                            <td colSpan={canViewCost ? 7 : 6} className="px-4 py-2">
                              <ul className="max-w-xl divide-y divide-slate-100">
                                {a.lines.map((l) => {
                                  const q = Number(l.change);
                                  return (
                                    <li
                                      key={l.product.id}
                                      className="flex items-center justify-between py-1.5"
                                    >
                                      <Link
                                        href={`/inventory/products/${l.product.id}`}
                                        className="text-slate-700 hover:text-blue-600"
                                      >
                                        <span className="font-mono text-xs text-slate-400">
                                          {l.product.sku}
                                        </span>{' '}
                                        {l.product.name}
                                      </Link>
                                      <span
                                        className={clsx(
                                          'font-medium tabular-nums',
                                          q > 0 ? 'text-emerald-700' : 'text-red-600',
                                        )}
                                      >
                                        {q > 0 ? '+' : ''}
                                        {formatQty(l.change)}{' '}
                                        <span className="text-xs font-normal text-slate-400">
                                          {l.product.baseUnit.code}
                                        </span>
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data && data.total > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-sm text-slate-500">
              <span>
                {data.total} adjustment{data.total > 1 ? 's' : ''}
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
      )}
    </div>
  );
}
