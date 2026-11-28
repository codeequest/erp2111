'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Loader2, Printer, X } from 'lucide-react';
import type {
  BulkProductAction,
  BulkProductRequest,
  BulkProductResult,
  CategoryNode,
} from '@erp/shared';
import { api } from '@/lib/api';
import { fieldClass } from './ui';

import { tr } from '@/lib/i18n';
const PERCENT = /^-?\d{1,4}(\.\d{1,2})?$/;

/** Toolbar shown above the product table while rows are selected. */
export function BulkBar({
  ids,
  categories,
  onDone,
  onClear,
}: {
  ids: string[];
  categories: CategoryNode[];
  onDone: (message: string) => void;
  onClear: () => void;
}) {
  const [mode, setMode] = useState<'category' | 'price' | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [percent, setPercent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: BulkProductAction, extra: Partial<BulkProductRequest> = {}) {
    setBusy(true);
    setError(null);
    try {
      const body: BulkProductRequest = { ids, action, ...extra };
      const res = await api<BulkProductResult>('/inventory/products/bulk', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMode(null);
      setPercent('');
      onDone(
        tr('{n} product(s) updated.', { n: res.updated }) +
          (res.skipped ? ' ' + tr('{n} already up to date.', { n: res.skipped }) : ''),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pct = Number(percent);
  const percentValid = PERCENT.test(percent.trim()) && pct > -90 && pct <= 1000 && pct !== 0;
  const pill = 'rounded-md px-2.5 py-1 text-sm transition hover:bg-white/10 disabled:opacity-50';

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-900 px-3 py-2 text-white">
      <span className="text-sm font-medium">{ids.length} {' '}{tr("selected")}</span>
      <span className="mx-1 h-4 w-px bg-white/20" />

      {mode === 'category' ? (
        <>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={clsx(fieldClass, 'py-1 text-slate-900')}
            aria-label={tr("New category")}
          >
            <option value="">{tr("No category")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.path}
              </option>
            ))}
          </select>
          <button
            onClick={() => run('setCategory', { categoryId: categoryId || null })}
            disabled={busy}
            className="rounded-md bg-white px-3 py-1 text-sm font-medium text-slate-900 hover:bg-slate-100"
          >
            {tr("Apply")}</button>
          <button onClick={() => setMode(null)} className={pill}>
            {tr("Cancel")}</button>
        </>
      ) : mode === 'price' ? (
        <>
          <input
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            inputMode="decimal"
            placeholder={tr("+5 or -10")}
            aria-label={tr("Price change in percent")}
            className={clsx(fieldClass, 'w-28 py-1 text-slate-900 tabular-nums')}
            autoFocus
          />
          <span className="text-sm text-white/70">{tr("% (rounded to 2 decimals)")}</span>
          <button
            onClick={() => run('adjustPrice', { percent: percent.trim().replace(/^\+/, '') })}
            disabled={busy || !percentValid}
            className="rounded-md bg-white px-3 py-1 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50"
          >
            {tr("Apply")}</button>
          <button onClick={() => setMode(null)} className={pill}>
            {tr("Cancel")}</button>
        </>
      ) : (
        <>
          <button onClick={() => setMode('category')} disabled={busy} className={pill}>
            {tr("Set category")}</button>
          <button onClick={() => setMode('price')} disabled={busy} className={pill}>
            {tr("Change price")}</button>
          <button onClick={() => run('activate')} disabled={busy} className={pill}>
            {tr("Activate")}</button>
          <button onClick={() => run('deactivate')} disabled={busy} className={pill}>
            {tr("Deactivate")}</button>
          <Link
            href={`/inventory/products/labels?ids=${ids.join(',')}`}
            className={clsx(pill, 'inline-flex items-center gap-1.5')}
          >
            <Printer className="size-4" /> {' '}{tr("Print labels")}</Link>
        </>
      )}

      {busy && <Loader2 className="size-4 animate-spin" />}
      {error && <span className="text-sm text-red-300">{error}</span>}
      <button onClick={onClear} className={clsx(pill, 'ms-auto')} aria-label={tr("Clear selection")}>
        <X className="size-4" />
      </button>
    </div>
  );
}
