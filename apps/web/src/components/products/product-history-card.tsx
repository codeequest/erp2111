'use client';

import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import type { HistoryEntry } from '@erp/shared';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

import { tr } from '@/lib/i18n';
const FIELD_LABELS: Record<string, string> = {
  sku: 'SKU',
  barcode: 'Barcode',
  name: 'Name',
  description: 'Description',
  categoryId: 'Category',
  baseUnitId: 'Base unit',
  taxRateId: 'Tax rate',
  salePrice: 'Sale price',
  minStock: 'Minimum stock',
  isActive: 'Active',
  packUnits: 'Pack sizes',
  image: 'Photo',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Edited',
  import: 'Imported',
  activate: 'Activated',
  deactivate: 'Deactivated',
  'bulk adjustPrice': 'Bulk price change',
  'bulk setCategory': 'Bulk category change',
  'bulk activate': 'Bulk activation',
  'bulk deactivate': 'Bulk deactivation',
  'price list': 'Price list change',
};

const INITIAL = 8;

/**
 * Who changed what and when. `version` changes whenever the product is saved
 * on this page, so the list reloads.
 */
export function ProductHistoryCard({ productId, version }: { productId: string; version: string }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api<HistoryEntry[]>(`/inventory/products/${productId}/history`)
      .then(setEntries)
      .catch((e: Error) => setError(e.message));
  }, [productId, version]);

  const visible = showAll ? entries : entries?.slice(0, INITIAL);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <History className="size-4 text-slate-400" /> {' '}{tr("Change history")}</h2>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !visible ? (
        <Loader2 className="mx-auto size-5 animate-spin text-slate-400" />
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-500">{tr("No changes recorded.")}</p>
      ) : (
        <ol className="relative space-y-4 border-s border-slate-200 ps-4">
          {visible.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute top-1.5 -start-[1.3rem] size-2 rounded-full bg-slate-300 ring-4 ring-white" />
              <p className="text-sm">
                <span className="font-medium text-slate-900">
                  {tr(ACTION_LABELS[h.action] ?? h.action)}
                </span>
                <span className="text-slate-500">
                  {' '}
                  · {h.user ?? tr('unknown user')} · {formatDateTime(h.createdAt)}
                </span>
              </p>
              {h.action !== 'create' && h.changes.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                  {h.changes.map((c) => (
                    <li key={c.field}>
                      {tr(FIELD_LABELS[c.field] ?? c.field)}:{' '}
                      <span className="text-slate-400 line-through">{c.from ?? 'empty'}</span> →{' '}
                      <span className="font-medium text-slate-800">{c.to ?? 'empty'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      {entries && entries.length > INITIAL && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 text-xs font-medium text-mod-inventory hover:underline"
        >
          {showAll ? tr("Show fewer") : tr('Show all {n} changes', { n: entries.length })}
        </button>
      )}
    </section>
  );
}
