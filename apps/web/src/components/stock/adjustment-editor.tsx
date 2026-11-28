'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Ban, CheckCircle2, Loader2, Save, Trash2 } from 'lucide-react';
import type { AdjustmentDetail, StockDocProduct } from '@erp/shared';
import { MAX_STOCK_DOCUMENT_LINES } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatMoney, formatQty } from '@/lib/format';
import {
  Breadcrumbs,
  ErrorBox,
  btnPrimary,
  btnSecondary,
  fieldClass,
  inputClass,
} from '@/components/products/ui';
import {
  DocStatusBadge,
  ProductPicker,
  fetchStockByWarehouse,
  toDocProduct,
  useWarehouses,
} from './stock-ui';

import { tr } from '@/lib/i18n';
type Direction = 'remove' | 'add';

interface Line {
  product: StockDocProduct;
  direction: Direction;
  /** Positive amount typed by the user */
  amount: string;
  unitCost: string;
  notes: string;
  /** On-hand per warehouse id, once loaded */
  stock?: Record<string, string>;
}

const QTY = /^\d{1,14}([.,]\d{1,4})?$/;

function toLines(doc: AdjustmentDetail): Line[] {
  return doc.lines.map((l) => {
    const negative = l.quantity.startsWith('-');
    return {
      product: l.product,
      direction: negative ? 'remove' : 'add',
      amount: negative ? l.quantity.slice(1) : l.quantity,
      unitCost: l.unitCost ?? '',
      notes: l.notes ?? '',
      stock: l.onHand !== undefined ? { [doc.warehouse.id]: l.onHand } : undefined,
    };
  });
}

/**
 * Create, edit, validate or cancel an adjustment. A validated or cancelled
 * adjustment is shown read-only.
 */
export function AdjustmentEditor({ initial }: { initial?: AdjustmentDetail }) {
  const { can } = useAuth();
  const canSeeCost = can('inventory.cost.view');
  const { warehouses, error: whError } = useWarehouses();

  const [doc, setDoc] = useState<AdjustmentDetail | undefined>(initial);
  const [warehouseId, setWarehouseId] = useState(initial?.warehouse.id ?? '');
  const [reason, setReason] = useState(initial?.reason ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(initial ? toLines(initial) : []);
  const [dirty, setDirty] = useState(!initial);
  const [busy, setBusy] = useState<'save' | 'post' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editable = (!doc || doc.status === 'DRAFT') && can('inventory.stock.adjust');

  // Default to the main warehouse for a new adjustment.
  useEffect(() => {
    if (!warehouseId && warehouses.length) {
      setWarehouseId((warehouses.find((w) => w.code === 'MAIN') ?? warehouses[0]).id);
    }
  }, [warehouses, warehouseId]);

  // Load the stock of every product of a draft, so the warehouse can be changed.
  useEffect(() => {
    if (!editable) return;
    const missing = lines.filter((l) => !l.stock || Object.keys(l.stock).length <= 1).map((l) => l.product.id);
    if (!missing.length) return;
    Promise.all(missing.map(async (id) => [id, await fetchStockByWarehouse(id)] as const))
      .then((maps) => {
        const byId = new Map(maps);
        setLines((ls) => ls.map((l) => (byId.has(l.product.id) ? { ...l, stock: byId.get(l.product.id) } : l)));
      })
      .catch(() => undefined);
    // Only on first load: new lines load their own stock when added.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  const productIds = useMemo(() => new Set(lines.map((l) => l.product.id)), [lines]);

  function change(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  function addProduct(p: Parameters<typeof toDocProduct>[0]) {
    const line: Line = { product: toDocProduct(p), direction: 'remove', amount: '', unitCost: '', notes: '' };
    setLines((ls) => [...ls, line]);
    setDirty(true);
    fetchStockByWarehouse(p.id)
      .then((stock) => setLines((ls) => ls.map((l) => (l.product.id === p.id ? { ...l, stock } : l))))
      .catch(() => undefined);
  }

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!warehouseId) list.push(tr('Choose a warehouse'));
    if (!reason.trim()) list.push(tr('Give a reason'));
    if (!lines.length) list.push(tr('Add at least one product'));
    lines.forEach((l, i) => {
      if (!QTY.test(l.amount) || Number(l.amount.replace(',', '.')) === 0) {
        list.push(tr('Line {n}: enter a quantity more than zero', { n: i + 1 }));
      }
      if (l.direction === 'add' && l.unitCost && !QTY.test(l.unitCost)) {
        list.push(tr('Line {n}: the cost is not a valid number', { n: i + 1 }));
      }
    });
    return list;
  }, [warehouseId, reason, lines]);

  function body() {
    return JSON.stringify({
      warehouseId,
      reason,
      notes: notes || null,
      lines: lines.map((l) => ({
        productId: l.product.id,
        quantity: (l.direction === 'remove' ? '-' : '') + l.amount.replace(',', '.'),
        ...(canSeeCost && l.direction === 'add' && { unitCost: l.unitCost || null }),
        notes: l.notes || null,
      })),
    });
  }

  async function save(): Promise<AdjustmentDetail | null> {
    setError(null);
    const saved = doc
      ? await api<AdjustmentDetail>(`/inventory/adjustments/${doc.id}`, { method: 'PUT', body: body() })
      : await api<AdjustmentDetail>('/inventory/adjustments', { method: 'POST', body: body() });
    setDoc(saved);
    setDirty(false);
    // Show the document's own address without reloading the page (Validate may still be running).
    if (!doc) window.history.replaceState(null, '', `/inventory/adjustments/${saved.id}`);
    return saved;
  }

  async function run(kind: 'save' | 'post' | 'cancel') {
    if (kind === 'post' && !confirm(tr("Validate this adjustment? Stock will change and it cannot be edited afterwards."))) return;
    if (kind === 'cancel' && !confirm(tr("Cancel this draft? It will be kept as cancelled."))) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'save') {
        await save();
      } else {
        const current = dirty || !doc ? await save() : doc;
        if (!current) return;
        const result = await api<AdjustmentDetail>(`/inventory/adjustments/${current.id}/${kind}`, { method: 'POST' });
        setDoc(result);
        setLines(toLines(result));
        setDirty(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const onHandOf = (l: Line) => l.stock?.[warehouseId] ?? (l.stock ? '0' : undefined);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumbs
            trail={[{ label: tr("Adjustments"), href: '/inventory/adjustments' }, { label: doc?.number ?? tr('New') }]}
          />
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold text-slate-900">
            {doc ? tr('Adjustment {number}', { number: doc.number }) : tr("New adjustment")}
            {doc && <DocStatusBadge status={doc.status} />}
          </h1>
          <p className="text-sm text-slate-500">
            {doc
              ? tr('Created {date} by {user}', { date: formatDateTime(doc.createdAt), user: doc.createdBy }) +
                (doc.postedAt ? ' · ' + tr('validated {date}', { date: formatDateTime(doc.postedAt) }) : '')
              : tr("Correct the stock of a warehouse: damaged, lost or found goods.")}
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            {doc && (
              <button onClick={() => run('cancel')} disabled={busy !== null} className={btnSecondary}>
                {busy === 'cancel' ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
                {tr("Cancel draft")}</button>
            )}
            <button
              onClick={() => run('save')}
              disabled={busy !== null || problems.length > 0 || (!dirty && !!doc)}
              className={btnSecondary}
            >
              {busy === 'save' ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {tr("Save draft")}</button>
            <button onClick={() => run('post')} disabled={busy !== null || problems.length > 0} className={btnPrimary}>
              {busy === 'post' ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {tr("Validate")}</button>
          </div>
        )}
      </div>

      {(error || whError) && <ErrorBox message={(error ?? whError)!} />}
      {doc?.status === 'POSTED' && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {tr("This adjustment is validated: stock has changed. To correct it, create a new adjustment.")}</p>
      )}

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Warehouse")}</span>
          <select
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setDirty(true);
            }}
            disabled={!editable}
            className={inputClass}
          >
            {!editable && doc && <option value={doc.warehouse.id}>{doc.warehouse.code} — {doc.warehouse.name}</option>}
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Reason")}</span>
          <input
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setDirty(true);
            }}
            disabled={!editable}
            className={inputClass}
            placeholder={tr("e.g. Broken during handling")}
            maxLength={200}
          />
        </label>
        <label className="sm:col-span-3">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            {tr("Notes")}{' '}<span className="font-normal text-slate-400">{tr("(optional)")}</span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setDirty(true);
            }}
            disabled={!editable}
            rows={2}
            className={inputClass}
            maxLength={1000}
          />
        </label>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        {editable && (
          <ProductPicker
            onPick={addProduct}
            excludeIds={productIds}
            disabled={lines.length >= MAX_STOCK_DOCUMENT_LINES}
          />
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-start text-xs font-medium text-slate-500 uppercase">
              <tr className="border-b border-slate-200">
                <th className="px-2 py-2">{tr("Product")}</th>
                <th className="px-2 py-2 text-end">{tr("On hand")}</th>
                <th className="px-2 py-2">{tr("Change")}</th>
                <th className="px-2 py-2 text-end">{tr("Quantity")}</th>
                <th className="px-2 py-2 text-end">{tr("After")}</th>
                {canSeeCost && <th className="px-2 py-2 text-end">{tr("Unit cost")}</th>}
                <th className="px-2 py-2">{tr("Line note")}</th>
                {editable && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l, i) => {
                const onHand = onHandOf(l);
                const amount = Number(l.amount.replace(',', '.'));
                const after =
                  onHand !== undefined && QTY.test(l.amount)
                    ? Number(onHand) + (l.direction === 'remove' ? -amount : amount)
                    : undefined;
                return (
                  <tr key={l.product.id} className="align-middle">
                    <td className="px-2 py-2">
                      <span className="block font-medium text-slate-800">{l.product.name}</span>
                      <span className="font-mono text-xs text-slate-500">{l.product.sku}</span>
                    </td>
                    <td className="px-2 py-2 text-end text-slate-500 tabular-nums">
                      {onHand !== undefined ? `${formatQty(onHand)} ${l.product.unit}` : editable ? '…' : '—'}
                    </td>
                    <td className="px-2 py-2">
                      {editable ? (
                        <select
                          value={l.direction}
                          onChange={(e) => change(i, { direction: e.target.value as Direction })}
                          className={clsx(fieldClass, 'py-1')}
                          aria-label={tr("Add or remove")}
                        >
                          <option value="remove">{tr("Remove −")}</option>
                          <option value="add">{tr("Add +")}</option>
                        </select>
                      ) : (
                        <span className={l.direction === 'remove' ? 'text-red-600' : 'text-emerald-700'}>
                          {l.direction === 'remove' ? tr("Remove −") : tr("Add +")}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-end">
                      {editable ? (
                        <input
                          value={l.amount}
                          onChange={(e) => change(i, { amount: e.target.value })}
                          inputMode="decimal"
                          className={clsx(fieldClass, 'w-24 py-1 text-end')}
                          aria-label={tr('Quantity for {sku}', { sku: l.product.sku })}
                        />
                      ) : (
                        <span className="tabular-nums">
                          {formatQty(l.amount)} {l.product.unit}
                        </span>
                      )}
                    </td>
                    <td
                      className={clsx(
                        'px-2 py-2 text-end tabular-nums',
                        after !== undefined && after < 0 ? 'font-medium text-red-600' : 'text-slate-500',
                      )}
                    >
                      {editable && after !== undefined ? formatQty(String(after)) : '—'}
                    </td>
                    {canSeeCost && (
                      <td className="px-2 py-2 text-end">
                        {l.direction !== 'add' ? (
                          <span className="text-xs text-slate-400">{tr("average")}</span>
                        ) : editable ? (
                          <input
                            value={l.unitCost}
                            onChange={(e) => change(i, { unitCost: e.target.value })}
                            inputMode="decimal"
                            placeholder="average"
                            className={clsx(fieldClass, 'w-24 py-1 text-end')}
                            aria-label={tr('Unit cost for {sku}', { sku: l.product.sku })}
                          />
                        ) : (
                          <span className="tabular-nums">{l.unitCost ? formatMoney(l.unitCost) : 'average'}</span>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-2">
                      {editable ? (
                        <input
                          value={l.notes}
                          onChange={(e) => change(i, { notes: e.target.value })}
                          className={clsx(fieldClass, 'w-full min-w-[8rem] py-1')}
                          maxLength={200}
                          aria-label={tr('Note for {sku}', { sku: l.product.sku })}
                        />
                      ) : (
                        <span className="text-slate-500">{l.notes || '—'}</span>
                      )}
                    </td>
                    {editable && (
                      <td className="px-2 py-2 text-end">
                        <button
                          onClick={() => {
                            setLines((ls) => ls.filter((_, j) => j !== i));
                            setDirty(true);
                          }}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={tr('Remove {sku}', { sku: l.product.sku })}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!lines.length && (
            <p className="py-8 text-center text-sm text-slate-500">
              {editable ? tr("Search a product above to add it.") : tr("No lines.")}
            </p>
          )}
        </div>
      </div>

      {editable && problems.length > 0 && lines.length > 0 && (
        <ul className="list-disc space-y-0.5 ps-5 text-sm text-amber-700">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {editable && (
        <p className="text-xs text-slate-500">
          {tr("Saving a draft does not change stock. Stock changes only when you press")}{' '}
          <strong>{tr("Validate")}</strong>{tr("; it is refused if a quantity would go below zero.")}</p>
      )}
    </div>
  );
}
