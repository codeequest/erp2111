'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  Save,
  ScanLine,
  Search,
} from 'lucide-react';
import type {
  Paginated,
  ProductListItem,
  StockCountDetail,
  StockCountImportReport,
  StockCountLine,
} from '@erp/shared';
import { MAX_COUNT_LINES_PER_SAVE } from '@erp/shared';
import { api, apiDownload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatMoney, formatQty } from '@/lib/format';
import { Breadcrumbs, ErrorBox, btnPrimary, btnSecondary, fieldClass } from '@/components/products/ui';
import { DocStatusBadge } from './stock-ui';

import { tr } from '@/lib/i18n';
type Filter = 'all' | 'todo' | 'diff' | 'moved';
const QTY = /^\d{1,14}([.,]\d{1,4})?$/;
/** Rows drawn at once; the search narrows big counts. */
const SHOWN = 300;

export function CountSheet({ initial }: { initial: StockCountDetail }) {
  const { can } = useAuth();
  const canSeeCost = can('inventory.cost.view');
  const [doc, setDoc] = useState(initial);
  /** Unsaved quantities typed by the user, per product id ('' = clear) */
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [blind, setBlind] = useState(false);
  const [scan, setScan] = useState('');
  const [busy, setBusy] = useState<'save' | 'post' | 'cancel' | 'import' | 'scan' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const draft = doc.status === 'DRAFT';
  const editable = draft && can('inventory.stock.adjust');
  const dirty = Object.keys(edits).length;
  const invalid = Object.values(edits).filter((v) => v !== '' && !QTY.test(v)).length;

  // Warn before leaving with unsaved counts.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const counted = (l: StockCountLine) => (l.product.id in edits ? edits[l.product.id] : (l.countedQty ?? ''));
  const differenceOf = (l: StockCountLine): number | null => {
    if (!draft) return l.difference === null ? null : Number(l.difference);
    const v = counted(l);
    if (v === '' || !QTY.test(v)) return null;
    return Number(v.replace(',', '.')) - Number(l.currentQty ?? l.expectedQty);
  };
  const moved = (l: StockCountLine) => draft && l.currentQty !== undefined && Number(l.currentQty) !== Number(l.expectedQty);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return doc.lines.filter((l) => {
      if (q && !l.product.name.toLowerCase().includes(q) && !l.product.sku.toLowerCase().includes(q) && l.barcode !== search.trim()) {
        return false;
      }
      if (filter === 'todo') return counted(l) === '';
      if (filter === 'diff') return (differenceOf(l) ?? 0) !== 0;
      if (filter === 'moved') return moved(l);
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, edits, filter, search]);

  const countedNow = doc.lines.filter((l) => counted(l) !== '').length;
  const diffsNow = doc.lines.filter((l) => (differenceOf(l) ?? 0) !== 0).length;

  function focusLine(productId: string) {
    setFilter('all');
    setSearch('');
    setHighlight(productId);
    // Wait for the row to be drawn.
    setTimeout(() => {
      const input = inputs.current.get(productId);
      input?.scrollIntoView({ block: 'center' });
      input?.focus();
      input?.select();
    }, 50);
  }

  async function saveEdits(): Promise<StockCountDetail | null> {
    const lines = Object.entries(edits).map(([productId, v]) => ({
      productId,
      countedQty: v === '' ? null : v.replace(',', '.'),
    }));
    let latest: StockCountDetail | null = null;
    for (let i = 0; i < lines.length; i += MAX_COUNT_LINES_PER_SAVE) {
      latest = await api<StockCountDetail>(`/inventory/counts/${doc.id}/lines`, {
        method: 'PUT',
        body: JSON.stringify({ lines: lines.slice(i, i + MAX_COUNT_LINES_PER_SAVE) }),
      });
    }
    if (latest) {
      setDoc(latest);
      setEdits({});
    }
    return latest;
  }

  /** Scanner / keyboard: find the line by barcode or SKU, or add the product to the count. */
  async function onScan(e: React.FormEvent) {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    setError(null);
    setNotice(null);
    const line = doc.lines.find((l) => l.barcode === code || l.product.sku.toLowerCase() === code.toLowerCase());
    if (line) {
      setScan('');
      focusLine(line.product.id);
      return;
    }
    setBusy('scan');
    try {
      const found = await api<Paginated<ProductListItem>>(
        `/inventory/products?status=all&pageSize=5&search=${encodeURIComponent(code)}`,
      );
      const product = found.items.find((p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase());
      if (!product) {
        setError(tr('No product with barcode or SKU "{code}"', { code }));
        return;
      }
      if (dirty) await saveEdits();
      const updated = await api<StockCountDetail>(`/inventory/counts/${doc.id}/lines`, {
        method: 'PUT',
        body: JSON.stringify({ lines: [{ productId: product.id, countedQty: null }] }),
      });
      setDoc(updated);
      setScan('');
      setNotice(tr('{name} was not on this count: it has been added.', { name: product.name }));
      focusLine(product.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function run(kind: 'save' | 'post' | 'cancel') {
    setError(null);
    setNotice(null);
    if (kind === 'post') {
      const untouched = doc.lines.length - countedNow;
      const msg =
        tr('Validate this count? {n} product(s) will be adjusted to the counted quantity.', { n: diffsNow }) +
        (untouched ? '\n' + tr('{n} product(s) not counted will be left as they are.', { n: untouched }) : '');
      if (!confirm(msg)) return;
    }
    if (kind === 'cancel' && !confirm(tr("Cancel this count? Nothing will change in stock."))) return;
    setBusy(kind);
    try {
      if (dirty) await saveEdits();
      if (kind === 'save') {
        setNotice(tr("Counts saved."));
      } else {
        setDoc(await api<StockCountDetail>(`/inventory/counts/${doc.id}/${kind}`, { method: 'POST' }));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setBusy('import');
    setError(null);
    setNotice(null);
    try {
      if (dirty) await saveEdits();
      const body = new FormData();
      body.append('file', file);
      const r = await api<StockCountImportReport>(`/inventory/counts/${doc.id}/import`, { method: 'POST', body });
      setDoc(await api<StockCountDetail>(`/inventory/counts/${doc.id}`));
      setNotice(
        tr('Imported {n} count(s).', { n: r.updated }) +
          (r.added ? ' ' + tr('{n} product(s) added.', { n: r.added }) : '') +
          (r.skipped ? ' ' + tr('{n} empty row(s) skipped.', { n: r.skipped }) : ''),
      );
      if (r.errors.length) {
        setError(
          tr('{n} row(s) not imported:', { n: r.errors.length }) + ' ' +
            r.errors.slice(0, 5).map((e) => `${tr('line {n}', { n: e.line })} (${e.sku || '—'}): ${e.error}`).join('; ') +
            (r.errors.length > 5 ? '…' : ''),
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const pct = doc.lines.length ? Math.round((countedNow / doc.lines.length) * 100) : 0;
  const filters: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: tr("All"), count: doc.lines.length },
    { key: 'todo', label: tr("Not counted"), count: doc.lines.length - countedNow },
    { key: 'diff', label: tr("With difference"), count: diffsNow },
    ...(draft ? [{ key: 'moved' as const, label: tr("Stock moved"), count: doc.summary.movedSinceStart }] : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumbs trail={[{ label: tr("Stock counts"), href: '/inventory/counts' }, { label: doc.number }]} />
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold text-slate-900">
            {tr("Count")}{' '}{doc.number} <DocStatusBadge status={doc.status} />
          </h1>
          <p className="text-sm text-slate-500">
            {doc.warehouse.code} — {doc.warehouse.name} · {doc.category ? `only ${doc.category.name}` : tr("all products")} {' '}{tr("· started")}{' '}{formatDateTime(doc.createdAt)} {' '}{tr("by")}{' '}{doc.createdBy}
            {doc.postedAt && ` · validated ${formatDateTime(doc.postedAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => apiDownload(`/inventory/counts/${doc.id}/sheet?blind=true`, `${doc.number}.xlsx`)} className={btnSecondary}>
            <Download className="size-4" /> {' '}{tr("Count sheet")}</button>
          {editable && (
            <>
              <input ref={fileRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
              <button onClick={() => fileRef.current?.click()} disabled={busy !== null} className={btnSecondary}>
                {busy === 'import' ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} {' '}{tr("Import counts")}</button>
              <button onClick={() => run('cancel')} disabled={busy !== null} className={btnSecondary}>
                {busy === 'cancel' ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />} {' '}{tr("Cancel")}</button>
              <button onClick={() => run('save')} disabled={busy !== null || !dirty || invalid > 0} className={btnSecondary}>
                {busy === 'save' ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {' '}{tr("Save")}{dirty ? ` (${dirty})` : ''}
              </button>
              <button onClick={() => run('post')} disabled={busy !== null || invalid > 0 || countedNow === 0} className={btnPrimary}>
                {busy === 'post' ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} {' '}{tr("Validate")}</button>
            </>
          )}
        </div>
      </div>

      {error && <ErrorBox message={error} />}
      {notice && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
      )}
      {doc.status === 'POSTED' && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {tr("This count is validated: every counted product was adjusted to the counted quantity.")}</p>
      )}

      <div className={clsx('grid gap-3', canSeeCost && !draft ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{tr("Counted")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {countedNow} <span className="text-base font-normal text-slate-400">/ {doc.lines.length}</span>
          </p>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full bg-mod-inventory transition-all" style={{ width: `${pct}%` }} />
          </span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{tr("With a difference")}</p>
          <p className={clsx('mt-1 text-2xl font-semibold', diffsNow ? 'text-amber-600' : 'text-slate-900')}>{diffsNow}</p>
        </div>
        {draft ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{tr("Stock moved since the start")}</p>
            <p className={clsx('mt-1 text-2xl font-semibold', doc.summary.movedSinceStart ? 'text-amber-600' : 'text-slate-900')}>
              {doc.summary.movedSinceStart}
            </p>
            {doc.summary.movedSinceStart > 0 && (
              <p className="mt-1 text-xs text-slate-500">{tr("Recount these if goods moved while counting.")}</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{tr("Not counted (left as they were)")}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{doc.lines.length - countedNow}</p>
          </div>
        )}
        {canSeeCost && !draft && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{tr("Value of the differences")}</p>
            <p className={clsx('mt-1 text-2xl font-semibold', Number(doc.summary.differenceValue) < 0 ? 'text-red-600' : 'text-slate-900')}>
              {formatMoney(doc.summary.differenceValue)}
            </p>
          </div>
        )}
      </div>

      {editable && (
        <form onSubmit={onScan} className="flex flex-wrap items-center gap-3 rounded-xl border border-mod-inventory/30 bg-white p-4">
          <ScanLine className="size-5 text-mod-inventory" />
          <input
            ref={scanRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            className={clsx(fieldClass, 'min-w-[14rem] flex-1')}
            placeholder={tr("Scan a barcode or type a SKU, then Enter")}
            aria-label={tr("Scan a barcode")}
            autoFocus
          />
          {busy === 'scan' && <Loader2 className="size-4 animate-spin text-slate-400" />}
          <span className="text-xs text-slate-500">
            {tr("Goes to the product (adds it if it is not on the count). Type the quantity and press Enter to scan the next one.")}</span>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={clsx(
                'rounded-md px-3 py-1 text-sm transition',
                filter === f.key ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {f.label} <span className="text-xs text-slate-400">{f.count}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("Find in this count")} className={`${fieldClass} w-full ps-9`} aria-label={tr("Find in this count")} />
        </div>
        {draft && (
          <label className="flex items-center gap-2 text-sm text-slate-600" title={tr("Counters do not see what the system expects, so they count for real")}>
            <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /> {' '}{tr("Blind count (hide expected)")}</label>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs font-medium text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">{tr("Product")}</th>
                {!blind && <th className="px-4 py-2.5 text-end">{tr("Expected")}</th>}
                <th className="px-4 py-2.5 text-end">{tr("Counted")}</th>
                {!blind && <th className="px-4 py-2.5 text-end">{tr("Difference")}</th>}
                {canSeeCost && !draft && <th className="px-4 py-2.5 text-end">{tr("Value")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.slice(0, SHOWN).map((l, i) => {
                const value = counted(l);
                const bad = value !== '' && !QTY.test(value);
                const diff = differenceOf(l);
                return (
                  <tr key={l.id} className={clsx(highlight === l.product.id && 'bg-sky-50', l.product.id in edits && 'bg-amber-50/40')}>
                    <td className="px-4 py-2">
                      <span className="block font-medium text-slate-800">{l.product.name}</span>
                      <span className="font-mono text-xs text-slate-500">
                        {l.product.sku}
                        {l.barcode && ` · ${l.barcode}`}
                      </span>
                    </td>
                    {!blind && (
                      <td className="px-4 py-2 text-end text-slate-500 tabular-nums">
                        {formatQty(l.expectedQty)} <span className="text-xs text-slate-400">{l.product.unit}</span>
                        {moved(l) && (
                          <span className="flex items-center justify-end gap-1 text-xs text-amber-700" title={tr("Stock changed since the count started")}>
                            <AlertTriangle className="size-3" /> {' '}{tr("now")}{' '}{formatQty(l.currentQty)}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2 text-end">
                      {editable ? (
                        <input
                          ref={(el) => {
                            if (el) inputs.current.set(l.product.id, el);
                            else inputs.current.delete(l.product.id);
                          }}
                          value={value}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            setEdits((ed) => {
                              const next = { ...ed };
                              if (v === (l.countedQty ?? '')) delete next[l.product.id];
                              else next[l.product.id] = v;
                              return next;
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            // After a scan, go back to the scanner; otherwise go to the next line.
                            if (highlight === l.product.id) {
                              setHighlight(null);
                              scanRef.current?.focus();
                            } else {
                              const next = visible[i + 1];
                              if (next) inputs.current.get(next.product.id)?.focus();
                            }
                          }}
                          inputMode="decimal"
                          placeholder="—"
                          className={clsx(fieldClass, 'w-28 py-1 text-end', bad && 'border-red-400')}
                          aria-label={tr('Counted quantity for {sku}', { sku: l.product.sku })}
                        />
                      ) : (
                        <span className="tabular-nums">{l.countedQty === null ? <span className="text-slate-300">{tr("not counted")}</span> : formatQty(l.countedQty)}</span>
                      )}
                    </td>
                    {!blind && (
                      <td
                        className={clsx(
                          'px-4 py-2 text-end font-medium tabular-nums',
                          diff === null || diff === 0 ? 'text-slate-400' : diff < 0 ? 'text-red-600' : 'text-emerald-700',
                        )}
                      >
                        {diff === null ? '—' : diff === 0 ? '0' : `${diff > 0 ? '+' : ''}${formatQty(String(diff))}`}
                      </td>
                    )}
                    {canSeeCost && !draft && (
                      <td className="px-4 py-2 text-end text-slate-500 tabular-nums">{l.differenceValue ? formatMoney(l.differenceValue) : '—'}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-500">{tr("No line matches.")}</p>}
        {visible.length > SHOWN && (
          <p className="border-t border-slate-200 px-4 py-2 text-center text-xs text-slate-500">
            {tr("Showing")}{' '}{SHOWN} {' '}{tr("of")}{' '}{visible.length} {' '}{tr("lines: use the search or scan a product to find the others.")}</p>
        )}
      </div>

      {editable && (
        <p className="text-xs text-slate-500">
          {tr("Counted quantities are in the base unit. Save as often as you like; several people can count and save. When you validate, each counted product is set to the counted quantity, compared with the stock")}{' '}<strong>{tr("at that moment")}</strong>{tr(", so sales made during the count are not lost. Products left empty are not changed.")}</p>
      )}
    </div>
  );
}
