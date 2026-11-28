'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { Loader2, Minus, Plus, Printer } from 'lucide-react';
import type { PriceListRow, ProductLabel } from '@erp/shared';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Barcode } from '@/components/products/barcode';
import { Breadcrumbs, ErrorBox, btnPrimary, fieldClass } from '@/components/products/ui';

import { tr } from '@/lib/i18n';
const SIZES = {
  small: {
    label: tr("Small · 38 × 25 mm"),
    w: 38,
    h: 25,
    bar: 22,
    name: 'text-[7pt]',
    price: 'text-[9pt]',
  },
  medium: {
    label: tr("Medium · 50 × 30 mm"),
    w: 50,
    h: 30,
    bar: 28,
    name: 'text-[8pt]',
    price: 'text-[11pt]',
  },
  large: {
    label: tr("Large · 70 × 40 mm"),
    w: 70,
    h: 40,
    bar: 36,
    name: 'text-[10pt]',
    price: 'text-[14pt]',
  },
} as const;
type Size = keyof typeof SIZES;

const MAX_COPIES = 100;

export default function LabelsPage() {
  return (
    <Suspense fallback={<Loader2 className="mx-auto my-16 size-6 animate-spin text-slate-400" />}>
      <Labels />
    </Suspense>
  );
}

function Labels() {
  const params = useSearchParams();
  const ids = useMemo(() => (params.get('ids') ?? '').split(',').filter(Boolean), [params]);

  const [priceLists, setPriceLists] = useState<PriceListRow[]>([]);
  const [priceListId, setPriceListId] = useState('');
  const [labels, setLabels] = useState<ProductLabel[] | null>(null);
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [size, setSize] = useState<Size>('medium');
  const [showPrice, setShowPrice] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PriceListRow[]>('/inventory/price-lists')
      .then(setPriceLists)
      .catch(() => setPriceLists([]));
  }, []);

  useEffect(() => {
    if (!ids.length) return setLabels([]);
    const q = new URLSearchParams({ ids: ids.join(',') });
    if (priceListId) q.set('priceListId', priceListId);
    api<ProductLabel[]>(`/inventory/products/labels?${q}`)
      .then(setLabels)
      .catch((e: Error) => setError(e.message));
  }, [ids, priceListId]);

  const s = SIZES[size];
  const sheet = (labels ?? []).flatMap((l) =>
    Array.from({ length: copies[l.id] ?? 1 }, (_, i) => ({ label: l, key: `${l.id}-${i}` })),
  );
  const setCount = (id: string, n: number) =>
    setCopies((c) => ({ ...c, [id]: Math.max(0, Math.min(MAX_COPIES, n)) }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Only the label sheet is printed */}
      <style>{`
        @media print {
          @page { margin: 8mm; }
          body * { visibility: hidden !important; }
          .label-sheet, .label-sheet * { visibility: visible !important; }
          .label-sheet { position: absolute; left: 0; top: 0; padding: 0 !important; border: 0 !important; background: white !important; }
        }
      `}</style>

      <div className="print:hidden">
        <Breadcrumbs
          trail={[{ label: tr("Products"), href: '/inventory/products' }, { label: tr("Print labels") }]}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{tr("Print labels")}</h1>
            <p className="text-sm text-slate-500">
              {tr("Shelf and product labels with barcode. Products without a barcode get their SKU.")}</p>
          </div>
          <button onClick={() => window.print()} disabled={!sheet.length} className={btnPrimary}>
            <Printer className="size-4" /> {' '}{tr("Print")}{' '}{sheet.length} {' '}{tr("label")}{sheet.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {!ids.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {tr("No products chosen. Tick products in the product list and choose “Print labels”.")}</div>
      ) : !labels ? (
        <Loader2 className="mx-auto my-16 size-6 animate-spin text-slate-400" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          {/* Options */}
          <aside className="space-y-4 print:hidden">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Label size")}</span>
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value as Size)}
                  className={clsx(fieldClass, 'w-full')}
                >
                  {Object.entries(SIZES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Price")}</span>
                <select
                  value={priceListId}
                  onChange={(e) => setPriceListId(e.target.value)}
                  className={clsx(fieldClass, 'w-full')}
                  disabled={!showPrice}
                >
                  <option value="">{tr("Sale price")}</option>
                  {priceLists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                />
                {tr("Show price")}</label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={showSku}
                  onChange={(e) => setShowSku(e.target.checked)}
                />
                {tr("Show SKU")}</label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700">
                <span>{tr("Copies")}</span>
                <span className="flex gap-1">
                  {[1, 5, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCopies(Object.fromEntries(labels.map((l) => [l.id, n])))}
                      className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                      title={tr('{n} of each', { n })}
                    >
                      {tr("all")}{' '}{n}
                    </button>
                  ))}
                </span>
              </div>
              <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
                {labels.map((l) => {
                  const n = copies[l.id] ?? 1;
                  return (
                    <li key={l.id} className="flex items-center gap-2 px-4 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-900">{l.name}</span>
                        <span className="font-mono text-xs text-slate-500">{l.sku}</span>
                      </span>
                      <button
                        onClick={() => setCount(l.id, n - 1)}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        aria-label={tr('Fewer labels for {sku}', { sku: l.sku })}
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <input
                        value={n}
                        onChange={(e) =>
                          setCount(l.id, Number(e.target.value.replace(/\D/g, '')) || 0)
                        }
                        inputMode="numeric"
                        aria-label={tr('Labels for {sku}', { sku: l.sku })}
                        className={clsx(fieldClass, 'w-12 px-1 py-0.5 text-center tabular-nums')}
                      />
                      <button
                        onClick={() => setCount(l.id, n + 1)}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        aria-label={tr('More labels for {sku}', { sku: l.sku })}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>

          {/* Preview = what is printed */}
          <div className="label-sheet flex flex-wrap content-start gap-[2mm] rounded-xl border border-slate-200 bg-slate-100 p-4">
            {sheet.map(({ label: l, key }) => (
              <div
                key={key}
                className="flex flex-col items-center justify-between overflow-hidden rounded-sm border border-slate-300 bg-white px-[1.5mm] py-[1mm] text-black break-inside-avoid print:rounded-none print:border-dashed"
                style={{ width: `${s.w}mm`, height: `${s.h}mm` }}
              >
                <div
                  className={clsx(
                    'w-full truncate text-center leading-tight font-semibold',
                    s.name,
                  )}
                >
                  {l.name}
                </div>
                <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                  <Barcode value={l.barcode ?? l.sku} height={s.bar} />
                </div>
                <div className="flex w-full items-baseline justify-between gap-1 leading-none">
                  {showSku ? (
                    <span className="truncate font-mono text-[6pt] text-slate-600">{l.sku}</span>
                  ) : (
                    <span />
                  )}
                  {showPrice && (
                    <span className={clsx('font-bold whitespace-nowrap tabular-nums', s.price)}>
                      {formatMoney(l.price)}
                      <span className="ms-0.5 text-[6pt] font-normal">/{l.unitCode}</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
            {!sheet.length && (
              <p className="w-full py-10 text-center text-sm text-slate-500">
                {tr("Every product is set to 0 copies.")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
