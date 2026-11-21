'use client';

import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import type { StockLevels } from '@erp/shared';
import { useApiData } from '@/lib/use-api-data';
import { formatDecimal } from '@/lib/inventory';
import { inputClass } from '@/components/ui';
import { ProductPicker, type PickedProduct } from './product-picker';

export interface StockLine {
  key: number;
  product: PickedProduct | null;
  quantity: string;
  unitCost: string;
}

let nextKey = 0;
export const newLine = (): StockLine => ({
  key: ++nextKey,
  product: null,
  quantity: '',
  unitCost: '',
});

/**
 * Editable product lines for stock documents. Shows what is on hand in
 * `warehouseId` next to each product; in "count" mode it also shows the
 * difference the adjustment will post.
 */
export function StockLines({
  lines,
  onChange,
  warehouseId,
  quantityLabel,
  mode = 'quantity',
  showCost = false,
  errors = {},
  disabled,
}: {
  lines: StockLine[];
  onChange: (lines: StockLine[]) => void;
  warehouseId: string;
  quantityLabel: string;
  /** count = counted quantity; delta = signed change; quantity = positive quantity */
  mode?: 'count' | 'delta' | 'quantity';
  showCost?: boolean;
  errors?: Record<number, string>;
  disabled?: boolean;
}) {
  const update = (key: number, patch: Partial<StockLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const used = lines.map((l) => l.product?.id).filter((id): id is string => !!id);
  const grid = showCost
    ? 'sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
    : 'sm:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto]';

  return (
    <div className="space-y-2">
      <div className={clsx('hidden gap-3 px-1 text-xs font-medium text-slate-500 sm:grid', grid)}>
        <span>Product</span>
        <span className="text-right">{quantityLabel}</span>
        {showCost && <span className="text-right">Unit cost</span>}
        <span className="text-right">{mode === 'count' ? 'In system → change' : 'In stock'}</span>
        <span className="w-8" />
      </div>

      {lines.map((line, i) => (
        <div key={line.key} className="animate-fade-up">
          <div
            className={clsx(
              'grid grid-cols-2 items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2 sm:gap-3 sm:border-0 sm:bg-transparent sm:p-0',
              grid,
            )}
          >
            <div className="col-span-2 sm:col-span-1">
              <ProductPicker
                value={line.product}
                onChange={(product) => update(line.key, { product })}
                exclude={used}
                invalid={Boolean(errors[line.key]) && !line.product}
                autoFocus={i === lines.length - 1 && i > 0 && !line.product}
              />
            </div>
            <div className="relative">
              <input
                aria-label={quantityLabel}
                value={line.quantity}
                onChange={(e) => update(line.key, { quantity: e.target.value })}
                inputMode="decimal"
                placeholder={mode === 'delta' ? '-3 or 5' : '0'}
                disabled={disabled}
                className={
                  inputClass(Boolean(errors[line.key]) && !!line.product) +
                  ' pr-12 text-right tabular-nums'
                }
              />
              {line.product && (
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">
                  {line.product.baseUnit.code}
                </span>
              )}
            </div>
            {showCost && (
              <input
                aria-label="Unit cost"
                value={line.unitCost}
                onChange={(e) => update(line.key, { unitCost: e.target.value })}
                inputMode="decimal"
                placeholder="0.00"
                disabled={disabled}
                className={inputClass() + ' text-right tabular-nums'}
              />
            )}
            <OnHand line={line} warehouseId={warehouseId} mode={mode} />
            <button
              type="button"
              onClick={() =>
                onChange(lines.length > 1 ? lines.filter((l) => l.key !== line.key) : [newLine()])
              }
              aria-label="Remove line"
              disabled={disabled}
              className="grid size-8 place-items-center justify-self-end rounded-md text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 active:scale-90"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          {errors[line.key] && (
            <p key={errors[line.key]} className="animate-shake mt-1 px-1 text-xs text-red-600">
              {errors[line.key]}
            </p>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...lines, newLine()])}
        disabled={disabled}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-emerald-300 px-3 py-2 text-sm font-medium text-mod-inventory transition-all hover:border-emerald-400 hover:bg-emerald-50"
      >
        <Plus className="size-4" /> Add a line
      </button>
    </div>
  );
}

/** Current quantity of the line's product in the chosen warehouse (and the count difference). */
function OnHand({
  line,
  warehouseId,
  mode,
}: {
  line: StockLine;
  warehouseId: string;
  mode: 'count' | 'delta' | 'quantity';
}) {
  const path =
    line.product && warehouseId
      ? `/inventory/stock/levels?productId=${line.product.id}&warehouseId=${warehouseId}`
      : null;
  const { data, loading } = useApiData<StockLevels>(path);
  if (!line.product) return <span className="text-right text-xs text-slate-300">—</span>;
  if (!warehouseId)
    return <span className="text-right text-xs text-slate-400">Pick a warehouse</span>;
  if (loading || !data)
    return <span className="h-4 w-12 animate-pulse justify-self-end rounded bg-slate-100" />;

  const current = data.items[0]?.total ?? '0';
  const qty = line.quantity.trim();
  // Display-only arithmetic; the API computes the real change with decimals.
  const diff = mode === 'count' && /^\d+(\.\d+)?$/.test(qty) ? Number(qty) - Number(current) : null;

  return (
    <span className="text-right text-sm text-slate-600 tabular-nums">
      {formatDecimal(current)}
      {diff !== null && (
        <span
          className={clsx(
            'ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium',
            diff > 0 && 'bg-emerald-50 text-emerald-700',
            diff < 0 && 'bg-red-50 text-red-600',
            diff === 0 && 'bg-slate-100 text-slate-500',
          )}
        >
          {diff > 0 ? '+' : ''}
          {formatDecimal(String(diff))}
        </span>
      )}
    </span>
  );
}
