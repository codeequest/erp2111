'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
} from 'lucide-react';
import {
  MOVE_TYPE_LABELS,
  downloadCsv,
  fetchAllPages,
  fmtMoney,
  fmtQty,
  listMoves,
  listWarehouses,
  type MovesQuery,
  type Page,
  type StockMoveRow,
  type StockMoveType,
  type Warehouse,
} from '@/lib/inventory';
import { btn, inputBase } from './ui';

const PAGE_SIZE = 20;

/** Stock ledger of one product: every in / out, with the balance after each move. */
export function StockMovements({
  productId,
  sku,
  unitCode,
  trackLots,
}: {
  productId: string;
  sku: string;
  unitCode: string;
  trackLots: boolean;
}) {
  const [query, setQuery] = useState<MovesQuery>({ productId, page: 1, pageSize: PAGE_SIZE });
  const [data, setData] = useState<Page<StockMoveRow> | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listMoves(query)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [query]);
  useEffect(load, [load]);
  useEffect(() => {
    listWarehouses()
      .then(setWarehouses)
      .catch(() => undefined);
  }, []);

  const update = (patch: Partial<MovesQuery>) => setQuery((q) => ({ ...q, page: 1, ...patch }));
  const showCost = data?.items.some((m) => m.unitCost !== undefined) ?? false;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await fetchAllPages((page) => listMoves({ ...query, page, pageSize: 500 }));
      const header = [
        'date',
        'type',
        'warehouse',
        'lot',
        'expiry',
        'quantity',
        'balance_after',
        'reference',
        'reason',
        'user',
      ];
      if (showCost) header.splice(6, 0, 'unit_cost');
      downloadCsv(
        `movements-${sku}-${new Date().toISOString().slice(0, 10)}.csv`,
        header,
        all.map((m) => {
          const row: (string | number | null)[] = [
            new Date(m.createdAt).toLocaleString(),
            MOVE_TYPE_LABELS[m.type],
            m.warehouse.code,
            m.lot?.lotNumber ?? null,
            m.lot?.expiryDate?.slice(0, 10) ?? null,
            m.quantity,
            m.balanceAfter ?? null,
            m.reference,
            m.reason,
            m.createdBy.fullName,
          ];
          if (showCost) row.splice(6, 0, m.unitCost ?? null);
          return row;
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
        <h2 className="mr-auto px-2 font-semibold text-slate-900">Stock movements</h2>
        <select
          aria-label="Warehouse"
          className={clsx(inputBase, 'py-1.5')}
          value={query.warehouseId ?? ''}
          onChange={(e) => update({ warehouseId: e.target.value || undefined })}
        >
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code}
            </option>
          ))}
        </select>
        <select
          aria-label="Movement type"
          className={clsx(inputBase, 'py-1.5')}
          value={query.type ?? ''}
          onChange={(e) =>
            update({ type: (e.target.value || undefined) as StockMoveType | undefined })
          }
        >
          <option value="">All types</option>
          {Object.entries(MOVE_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          From
          <input
            type="date"
            className={clsx(inputBase, 'py-1.5')}
            value={query.from ?? ''}
            onChange={(e) => update({ from: e.target.value || undefined })}
          />
        </label>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          to
          <input
            type="date"
            className={clsx(inputBase, 'py-1.5')}
            value={query.to ?? ''}
            onChange={(e) => update({ to: e.target.value || undefined })}
          />
        </label>
        <button
          className={btn}
          onClick={() => void exportCsv()}
          disabled={exporting || !data?.total}
        >
          {exporting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Export
        </button>
      </div>

      {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Warehouse</th>
              {trackLots && <th className="px-4 py-2.5">Lot</th>}
              <th className="px-4 py-2.5 text-right">In / out</th>
              {showCost && <th className="px-4 py-2.5 text-right">Unit cost</th>}
              <th className="px-4 py-2.5 text-right">Balance</th>
              <th className="px-4 py-2.5">Reference</th>
              <th className="px-4 py-2.5">By</th>
            </tr>
          </thead>
          <tbody className={clsx('divide-y divide-slate-100', loading && data && 'opacity-60')}>
            {!data ? (
              <tr>
                <td colSpan={9} className="py-10 text-center">
                  <Loader2 className="mx-auto size-5 animate-spin text-slate-400" />
                </td>
              </tr>
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  No movements
                  {query.type || query.from || query.to || query.warehouseId
                    ? ' match these filters'
                    : ' yet'}
                  .
                </td>
              </tr>
            ) : (
              data.items.map((m) => {
                const qty = Number(m.quantity);
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                      {new Date(m.createdAt).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{MOVE_TYPE_LABELS[m.type]}</td>
                    <td className="px-4 py-2">{m.warehouse.code}</td>
                    {trackLots && (
                      <td className="px-4 py-2 font-mono text-xs">{m.lot?.lotNumber ?? '—'}</td>
                    )}
                    <td
                      className={clsx(
                        'px-4 py-2 text-right font-medium whitespace-nowrap tabular-nums',
                        qty >= 0 ? 'text-emerald-700' : 'text-red-600',
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {qty >= 0 ? (
                          <ArrowDownLeft className="size-3.5" />
                        ) : (
                          <ArrowUpRight className="size-3.5" />
                        )}
                        {qty > 0 ? '+' : ''}
                        {fmtQty(qty)} {unitCode}
                      </span>
                    </td>
                    {showCost && (
                      <td className="px-4 py-2 text-right text-slate-600 tabular-nums">
                        {m.unitCost !== undefined ? fmtMoney(m.unitCost) : '—'}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right tabular-nums">
                      {m.balanceAfter !== undefined ? fmtQty(m.balanceAfter) : '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {m.reference ?? '—'}
                      {m.reason && <span className="block text-xs text-slate-400">{m.reason}</span>}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                      {m.createdBy.fullName}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
          <span>
            {data.total} movements — page {data.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              className={btn}
              disabled={data.page <= 1}
              onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) - 1 }))}
            >
              <ChevronLeft className="size-4" /> Newer
            </button>
            <button
              className={btn}
              disabled={data.page >= totalPages}
              onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))}
            >
              Older <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
