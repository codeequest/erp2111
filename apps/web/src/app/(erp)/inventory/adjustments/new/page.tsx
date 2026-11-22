'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CheckCircle2, History, Loader2, Plus, Search, Send, Trash2 } from 'lucide-react';
import {
  ADJUSTMENT_REASONS,
  type AdjustmentMode,
  type StockAdjustmentInput,
  type StockAdjustmentResult,
  type StockLevelRow,
  type StockLevelsResponse,
  type WarehouseDto,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatQty } from '@/lib/format';
import { AccessDenied, Breadcrumbs } from '@/components/page-header';

interface Line {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  /** On hand in the selected warehouse when the line was loaded; null while loading. */
  current: number | null;
  input: string;
}

const inputCls =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

/** Rounds away float noise (0.1 + 0.2) to the 4 decimals the API stores. */
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export default function NewAdjustmentPage() {
  const { can } = useAuth();
  const router = useRouter();
  const canAdjust = can('inventory.stock.adjust');

  const [warehouses, setWarehouses] = useState<WarehouseDto[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [mode, setMode] = useState<AdjustmentMode>('count');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<StockAdjustmentResult | null>(null);

  useEffect(() => {
    if (!canAdjust) return;
    api<WarehouseDto[]>('/inventory/warehouses')
      .then((ws) => {
        const active = ws.filter((w) => w.isActive);
        setWarehouses(active);
        setWarehouseId(
          (cur) => cur || (active.find((w) => w.code === 'MAIN') ?? active[0])?.id || '',
        );
      })
      .catch((e: Error) => setErrors([e.message]));
  }, [canAdjust]);

  // Quantities on hand depend on the warehouse: reload them when it changes.
  const linesRef = useRef(lines);
  linesRef.current = lines;
  useEffect(() => {
    if (!warehouseId || linesRef.current.length === 0) return;
    setLines((ls) => ls.map((l) => ({ ...l, current: null })));
    for (const l of linesRef.current) {
      fetchOnHand(warehouseId, l.sku, l.productId).then((current) =>
        setLines((ls) => ls.map((x) => (x.productId === l.productId ? { ...x, current } : x))),
      );
    }
  }, [warehouseId]);

  if (!canAdjust) return <AccessDenied permission="inventory.stock.adjust" what="New adjustment" />;

  const warehouse = warehouses.find((w) => w.id === warehouseId);

  function addProduct(row: StockLevelRow) {
    if (lines.some((l) => l.productId === row.product.id)) return;
    setLines((ls) => [
      ...ls,
      {
        productId: row.product.id,
        sku: row.product.sku,
        name: row.product.name,
        unit: row.product.baseUnit.code,
        current: Number(row.total),
        input: '',
      },
    ]);
  }

  /** What each line will do, for the preview column and client-side checks. */
  const preview = lines.map((l) => {
    const n = Number(l.input);
    if (l.input.trim() === '' || !Number.isFinite(n) || l.current === null) return null;
    const change = round4(mode === 'count' ? n - l.current : n);
    return { change, after: round4(l.current + change) };
  });

  const finalReason = [reason, note.trim()].filter(Boolean).join(' — ');
  const filled = lines.filter((l) => l.input.trim() !== '');
  const problems: string[] = [];
  if (!warehouseId) problems.push('Choose a warehouse.');
  if (!reason) problems.push('Choose a reason.');
  if (reason === 'Other' && !note.trim()) problems.push('Explain the reason in the note.');
  if (filled.length === 0) problems.push('Add at least one product with a quantity.');
  if (preview.some((p) => p && p.after < 0)) problems.push('Some lines would make stock negative.');
  if (mode === 'count' && filled.some((l) => Number(l.input) < 0)) {
    problems.push('A counted quantity cannot be negative.');
  }
  const changing = preview.filter((p) => p && p.change !== 0).length;

  async function submit() {
    if (problems.length) return;
    const summary =
      mode === 'count'
        ? `${changing} product(s) will be corrected in ${warehouse?.code}.`
        : `${filled.length} product(s) will change in ${warehouse?.code}.`;
    if (!window.confirm(`Post this adjustment?\n\n${summary}\nReason: ${finalReason}`)) return;

    setSubmitting(true);
    setErrors([]);
    const body: StockAdjustmentInput = {
      warehouseId,
      mode,
      reason: finalReason,
      lines: filled.map((l) => ({ productId: l.productId, quantity: Number(l.input) })),
    };
    try {
      setResult(
        await api<StockAdjustmentResult>('/inventory/stock/adjustments', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
      window.scrollTo({ top: 0 });
    } catch (e) {
      const msg = (e as Error).message;
      setErrors(msg.split(', '));
    } finally {
      setSubmitting(false);
    }
  }

  const crumbs = [
    { label: 'Home', href: '/dashboard' },
    { label: 'Inventory' },
    { label: 'Adjustments', href: '/inventory/adjustments' },
    { label: result ? result.reference : 'New' },
  ];

  if (result) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Breadcrumbs items={crumbs} />
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 className="size-5" />
            <h1 className="text-lg font-semibold">Adjustment {result.reference} posted</h1>
          </div>
          <p className="mt-1 text-sm text-emerald-800">
            {result.warehouse.code} — {result.warehouse.name} · {result.reason}
            {result.unchanged > 0 &&
              ` · ${result.unchanged} product(s) already matched the count and were not changed`}
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5 text-right">Before</th>
                <th className="px-4 py-2.5 text-right">Change</th>
                <th className="px-4 py-2.5 text-right">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.lines.map((l) => {
                const c = Number(l.change);
                return (
                  <tr key={l.product.id}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-slate-400">{l.product.sku}</span>{' '}
                      {l.product.name}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
                      {formatQty(l.before)}
                    </td>
                    <td
                      className={clsx(
                        'px-4 py-2.5 text-right font-medium tabular-nums',
                        c > 0 ? 'text-emerald-700' : 'text-red-600',
                      )}
                    >
                      {c > 0 ? '+' : ''}
                      {formatQty(l.change)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                      {formatQty(l.after)}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        {l.product.baseUnit.code}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setResult(null);
              setLines([]);
              setNote('');
            }}
            className="bg-mod-inventory inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="size-4" /> New adjustment
          </button>
          <Link
            href="/inventory/adjustments"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <History className="size-4" /> All adjustments
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Breadcrumbs items={crumbs} />
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">New stock adjustment</h1>
      </div>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="warehouse" className="mb-1 block text-sm font-medium text-slate-700">
            Warehouse <span className="text-red-500">*</span>
          </label>
          <select
            id="warehouse"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className={inputCls}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            How do you enter it?
          </span>
          <div
            role="radiogroup"
            className="grid grid-cols-2 rounded-md border border-slate-300 p-0.5 text-sm"
          >
            {(
              [
                ['count', 'Counted quantity'],
                ['delta', 'Add / remove'],
              ] as [AdjustmentMode, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={clsx(
                  'rounded px-3 py-1.5',
                  mode === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {mode === 'count'
              ? 'Type what is on the shelf; the difference is posted.'
              : 'Type +5 to add or -5 to remove.'}
          </p>
        </div>
        <div>
          <label htmlFor="reason" className="mb-1 block text-sm font-medium text-slate-700">
            Reason <span className="text-red-500">*</span>
          </label>
          <select
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputCls}
          >
            <option value="" disabled>
              Select a reason…
            </option>
            {ADJUSTMENT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="note" className="mb-1 block text-sm font-medium text-slate-700">
            Note {reason === 'Other' && <span className="text-red-500">*</span>}
          </label>
          <input
            id="note"
            value={note}
            maxLength={250}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. 2 bottles broken during unloading"
            className={inputCls}
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-3">
          <ProductPicker
            warehouseId={warehouseId}
            excluded={new Set(lines.map((l) => l.productId))}
            onPick={addProduct}
          />
        </div>
        {lines.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            Search a product above to add it to the adjustment.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5 text-right">On hand</th>
                  <th className="w-40 px-4 py-2.5 text-right">
                    {mode === 'count' ? 'Counted' : 'Change (+/−)'}
                  </th>
                  <th className="px-4 py-2.5 text-right">
                    {mode === 'count' ? 'Difference' : 'After'}
                  </th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l, i) => {
                  const p = preview[i];
                  const negative = p !== null && p.after < 0;
                  return (
                    <tr key={l.productId} className={clsx(negative && 'bg-red-50/60')}>
                      <td className="px-4 py-2">
                        <div className="font-medium text-slate-900">{l.name}</div>
                        <div className="font-mono text-xs text-slate-400">{l.sku}</div>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600 tabular-nums">
                        {l.current === null ? (
                          <Loader2 className="ml-auto size-4 animate-spin text-slate-300" />
                        ) : (
                          <>
                            {formatQty(String(l.current))}{' '}
                            <span className="text-xs text-slate-400">{l.unit}</span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min={mode === 'count' ? 0 : undefined}
                          aria-label={`${mode === 'count' ? 'Counted quantity' : 'Change'} for ${l.sku}`}
                          value={l.input}
                          onChange={(e) =>
                            setLines((ls) =>
                              ls.map((x) =>
                                x.productId === l.productId ? { ...x, input: e.target.value } : x,
                              ),
                            )
                          }
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {p === null ? (
                          <span className="text-slate-300">—</span>
                        ) : negative ? (
                          <span className="text-xs font-medium text-red-600">Not enough stock</span>
                        ) : mode === 'count' ? (
                          <span
                            className={clsx(
                              'font-medium',
                              p.change > 0
                                ? 'text-emerald-700'
                                : p.change < 0
                                  ? 'text-red-600'
                                  : 'text-slate-400',
                            )}
                          >
                            {p.change > 0 ? '+' : ''}
                            {p.change === 0 ? 'no change' : formatQty(String(p.change))}
                          </span>
                        ) : (
                          <span className="font-medium">{formatQty(String(p.after))}</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() =>
                            setLines((ls) => ls.filter((x) => x.productId !== l.productId))
                          }
                          aria-label={`Remove ${l.sku}`}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {errors.length > 0 && (
        <div role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">The adjustment was not posted:</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {problems.length > 0 && lines.length > 0 && (
          <p className="mr-auto text-sm text-slate-500">{problems[0]}</p>
        )}
        <button
          onClick={() => router.push('/inventory/adjustments')}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting || problems.length > 0}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Post adjustment
        </button>
      </div>
    </div>
  );
}

async function fetchOnHand(warehouseId: string, sku: string, productId: string): Promise<number> {
  const qs = new URLSearchParams({ warehouseId, search: sku, pageSize: '20' });
  const res = await api<StockLevelsResponse>(`/inventory/stock/levels?${qs}`);
  return Number(res.items.find((r) => r.product.id === productId)?.total ?? 0);
}

/** Search box that lists matching products with their quantity in the warehouse. */
function ProductPicker({
  warehouseId,
  excluded,
  onPick,
}: {
  warehouseId: string;
  excluded: Set<string>;
  onPick: (row: StockLevelRow) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockLevelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q || !warehouseId) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ warehouseId, search: q, pageSize: '8' });
      api<StockLevelsResponse>(`/inventory/stock/levels?${qs}`)
        .then((res) => {
          if (cancelled) return;
          setResults(res.items.filter((r) => r.product.isActive));
          setActive(0);
        })
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, warehouseId]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (row: StockLevelRow) => {
    if (excluded.has(row.product.id)) return;
    onPick(row);
    setQuery('');
    setResults([]);
  };

  return (
    <div ref={boxRef} className="relative max-w-md">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
          if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            pick(results[active]);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Add a product: SKU, name or barcode…"
        aria-label="Add a product"
        role="combobox"
        aria-expanded={open && results.length > 0}
        className="w-full rounded-md border border-slate-300 py-2 pr-9 pl-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      />
      {loading && (
        <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-slate-400" />
      )}
      {open && query.trim() && !loading && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No active product found</li>
          ) : (
            results.map((r, i) => {
              const added = excluded.has(r.product.id);
              return (
                <li
                  key={r.product.id}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={added}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(r);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={clsx(
                    'flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm',
                    i === active && 'bg-slate-100',
                    added && 'cursor-default opacity-50',
                  )}
                >
                  <span className="truncate">
                    <span className="font-mono text-xs text-slate-400">{r.product.sku}</span>{' '}
                    {r.product.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                    {added ? 'added' : `${formatQty(r.total)} ${r.product.baseUnit.code}`}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
