'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowRight, Ban, CheckCircle2, Loader2, Save, Trash2 } from 'lucide-react';
import type { StockDocProduct, TransferDetail } from '@erp/shared';
import { MAX_STOCK_DOCUMENT_LINES } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatQty } from '@/lib/format';
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
interface Line {
  product: StockDocProduct;
  quantity: string;
  /** On-hand per warehouse id, once loaded */
  stock?: Record<string, string>;
}

const QTY = /^\d{1,14}([.,]\d{1,4})?$/;

function toLines(doc: TransferDetail): Line[] {
  return doc.lines.map((l) => ({
    product: l.product,
    quantity: l.quantity,
    stock: l.onHand !== undefined ? { [doc.fromWarehouse.id]: l.onHand } : undefined,
  }));
}

/** Create, edit, validate or cancel a transfer. Validated or cancelled ones are read-only. */
export function TransferEditor({ initial }: { initial?: TransferDetail }) {
  const { can } = useAuth();
  const { warehouses, error: whError } = useWarehouses();

  const [doc, setDoc] = useState<TransferDetail | undefined>(initial);
  const [fromId, setFromId] = useState(initial?.fromWarehouse.id ?? '');
  const [toId, setToId] = useState(initial?.toWarehouse.id ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(initial ? toLines(initial) : []);
  const [dirty, setDirty] = useState(!initial);
  const [busy, setBusy] = useState<'save' | 'post' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editable = (!doc || doc.status === 'DRAFT') && can('inventory.stock.transfer');

  useEffect(() => {
    if (!fromId && warehouses.length) {
      setFromId((warehouses.find((w) => w.code === 'MAIN') ?? warehouses[0]).id);
    }
  }, [warehouses, fromId]);

  // Load the stock of every product of a draft, so the source warehouse can be changed.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  const productIds = useMemo(() => new Set(lines.map((l) => l.product.id)), [lines]);

  function addProduct(p: Parameters<typeof toDocProduct>[0]) {
    setLines((ls) => [...ls, { product: toDocProduct(p), quantity: '' }]);
    setDirty(true);
    fetchStockByWarehouse(p.id)
      .then((stock) => setLines((ls) => ls.map((l) => (l.product.id === p.id ? { ...l, stock } : l))))
      .catch(() => undefined);
  }

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!fromId || !toId) list.push(tr('Choose both warehouses'));
    else if (fromId === toId) list.push(tr('Choose two different warehouses'));
    if (!lines.length) list.push(tr('Add at least one product'));
    lines.forEach((l, i) => {
      if (!QTY.test(l.quantity) || Number(l.quantity.replace(',', '.')) === 0) {
        list.push(tr('Line {n}: enter a quantity more than zero', { n: i + 1 }));
      }
    });
    return list;
  }, [fromId, toId, lines]);

  function body() {
    return JSON.stringify({
      fromWarehouseId: fromId,
      toWarehouseId: toId,
      notes: notes || null,
      lines: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity.replace(',', '.') })),
    });
  }

  async function save(): Promise<TransferDetail> {
    const saved = doc
      ? await api<TransferDetail>(`/inventory/transfers/${doc.id}`, { method: 'PUT', body: body() })
      : await api<TransferDetail>('/inventory/transfers', { method: 'POST', body: body() });
    setDoc(saved);
    setDirty(false);
    // Show the document's own address without reloading the page (Validate may still be running).
    if (!doc) window.history.replaceState(null, '', `/inventory/transfers/${saved.id}`);
    return saved;
  }

  async function run(kind: 'save' | 'post' | 'cancel') {
    if (kind === 'post' && !confirm(tr("Validate this transfer? Stock will move and it cannot be edited afterwards."))) return;
    if (kind === 'cancel' && !confirm(tr("Cancel this draft? It will be kept as cancelled."))) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'save') {
        await save();
      } else {
        const current = dirty || !doc ? await save() : doc;
        const result = await api<TransferDetail>(`/inventory/transfers/${current.id}/${kind}`, { method: 'POST' });
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

  const warehouseSelect = (value: string, onChange: (v: string) => void, label: string, fallback?: TransferDetail['fromWarehouse']) => (
    <label className="flex-1">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setDirty(true);
        }}
        disabled={!editable}
        className={inputClass}
      >
        <option value="">{tr("Choose…")}</option>
        {!editable && fallback && (
          <option value={fallback.id}>
            {fallback.code} — {fallback.name}
          </option>
        )}
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.code} — {w.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumbs
            trail={[{ label: tr("Transfers"), href: '/inventory/transfers' }, { label: doc?.number ?? tr('New') }]}
          />
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold text-slate-900">
            {doc ? tr('Transfer {number}', { number: doc.number }) : tr("New transfer")}
            {doc && <DocStatusBadge status={doc.status} />}
          </h1>
          <p className="text-sm text-slate-500">
            {doc
              ? tr('Created {date} by {user}', { date: formatDateTime(doc.createdAt), user: doc.createdBy }) +
                (doc.postedAt ? ' · ' + tr('validated {date}', { date: formatDateTime(doc.postedAt) }) : '')
              : tr("Move goods from one warehouse to another.")}
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
          {tr("This transfer is validated: the goods have moved. To send them back, create a new transfer.")}</p>
      )}

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
          {warehouseSelect(fromId, setFromId, 'From', doc?.fromWarehouse)}
          <ArrowRight className="rtl:-scale-x-100 mx-auto mb-2.5 hidden size-5 shrink-0 text-slate-400 sm:block" />
          {warehouseSelect(toId, setToId, 'To', doc?.toWarehouse)}
        </div>
        <label className="block">
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
          <ProductPicker onPick={addProduct} excludeIds={productIds} disabled={lines.length >= MAX_STOCK_DOCUMENT_LINES} />
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-start text-xs font-medium text-slate-500 uppercase">
              <tr className="border-b border-slate-200">
                <th className="px-2 py-2">{tr("Product")}</th>
                {editable && <th className="px-2 py-2 text-end">{tr("Available in source")}</th>}
                <th className="px-2 py-2 text-end">{tr("Quantity to move")}</th>
                {editable && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l, i) => {
                const onHand = l.stock ? (l.stock[fromId] ?? '0') : undefined;
                const tooMuch =
                  onHand !== undefined && QTY.test(l.quantity) && Number(l.quantity.replace(',', '.')) > Number(onHand);
                return (
                  <tr key={l.product.id}>
                    <td className="px-2 py-2">
                      <span className="block font-medium text-slate-800">{l.product.name}</span>
                      <span className="font-mono text-xs text-slate-500">{l.product.sku}</span>
                    </td>
                    {editable && (
                      <td className="px-2 py-2 text-end text-slate-500 tabular-nums">
                        {onHand !== undefined ? `${formatQty(onHand)} ${l.product.unit}` : '…'}
                      </td>
                    )}
                    <td className="px-2 py-2 text-end">
                      {editable ? (
                        <>
                          <input
                            value={l.quantity}
                            onChange={(e) => {
                              const quantity = e.target.value;
                              setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity } : x)));
                              setDirty(true);
                            }}
                            inputMode="decimal"
                            className={clsx(fieldClass, 'w-28 py-1 text-end', tooMuch && 'border-red-400')}
                            aria-label={tr('Quantity for {sku}', { sku: l.product.sku })}
                          />
                          {tooMuch && <span className="block text-xs text-red-600">{tr("More than available")}</span>}
                        </>
                      ) : (
                        <span className="tabular-nums">
                          {formatQty(l.quantity)} {l.product.unit}
                        </span>
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
          {tr("Saving a draft does not move stock. Stock moves only when you press")}{' '}<strong>{tr("Validate")}</strong>{tr("; it is refused if the source warehouse does not have enough.")}</p>
      )}
    </div>
  );
}
