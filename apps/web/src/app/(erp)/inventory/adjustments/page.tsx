'use client';

import { useCallback, useState } from 'react';
import clsx from 'clsx';
import { ClipboardCheck, Info, SlidersHorizontal } from 'lucide-react';
import type { StockPostingResult, WarehouseItem } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiData } from '@/lib/use-api-data';
import { DECIMAL_4 } from '@/lib/inventory';
import { newLine, StockLines, type StockLine } from '@/components/inventory/stock-lines';
import { RecentDocuments } from '@/components/inventory/recent-documents';
import {
  AccessDenied,
  ErrorBanner,
  Field,
  InventoryHeader,
  inputClass,
  PrimaryButton,
  Toast,
} from '@/components/ui';

type Mode = 'count' | 'delta';
const SIGNED = /^-?\d{1,14}(\.\d{1,4})?$/;
const REASONS = ['Stock count', 'Damaged', 'Expired', 'Theft / loss', 'Found stock'];

export default function AdjustmentsPage() {
  const { can } = useAuth();
  const warehouses = useApiData<WarehouseItem[]>(
    can('inventory.stock.read') ? '/inventory/warehouses' : null,
  );
  const active = warehouses.data?.filter((w) => w.isActive) ?? [];

  const [warehouseId, setWarehouseId] = useState('');
  const [mode, setMode] = useState<Mode>('count');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<StockLine[]>(() => [newLine()]);
  const [errors, setErrors] = useState<{
    warehouse?: string;
    reason?: string;
    lines?: Record<number, string>;
    form?: string;
  }>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const clearToast = useCallback(() => setToast(null), []);

  // Default to the first active warehouse once loaded.
  if (!warehouseId && active.length) setWarehouseId(active[0].id);

  if (!can('inventory.stock.adjust')) {
    return <AccessDenied permission="inventory.stock.adjust" what="stock adjustments" />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const lineErrors: Record<number, string> = {};
    const filled = lines.filter((l) => l.product || l.quantity.trim());
    for (const l of filled) {
      const q = l.quantity.trim();
      if (!l.product) lineErrors[l.key] = 'Choose a product.';
      else if (mode === 'count' && !DECIMAL_4.test(q))
        lineErrors[l.key] = 'Enter the quantity counted (0 or more).';
      else if (mode === 'delta' && (!SIGNED.test(q) || Number(q) === 0))
        lineErrors[l.key] = 'Enter a change such as -3 or 5.';
    }
    const next = {
      warehouse: warehouseId ? undefined : 'Choose a warehouse.',
      reason:
        reason.trim().length >= 3 ? undefined : 'Say why stock changes (3 characters or more).',
      lines: lineErrors,
      form: filled.length ? undefined : 'Add at least one product.',
    };
    setErrors(next);
    if (next.warehouse || next.reason || next.form || Object.keys(lineErrors).length) return;

    setSaving(true);
    try {
      const res = await api<StockPostingResult>('/inventory/stock/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          warehouseId,
          mode,
          reason: reason.trim(),
          lines: filled.map((l) => ({ productId: l.product!.id, quantity: l.quantity.trim() })),
        }),
      });
      setToast(`${res.reference} posted · ${res.moves} ${res.moves === 1 ? 'line' : 'lines'}`);
      setPosted(res.reference);
      setVersion((v) => v + 1);
      setLines([newLine()]);
      setReason('');
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Could not post the adjustment' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <InventoryHeader
        section="Adjustments"
        title="Stock adjustments"
        description="Correct stock after a count, breakage or loss. Every change keeps its reason."
        icon={SlidersHorizontal}
      />

      <form
        onSubmit={submit}
        noValidate
        className="animate-fade-up space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
        style={{ animationDelay: '80ms' }}
      >
        {errors.form && <ErrorBanner message={errors.form} />}

        <div className="grid gap-4 md:grid-cols-[1fr_1.3fr]">
          <Field label="Warehouse" error={errors.warehouse}>
            {(id, invalid) => (
              <select
                id={id}
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className={inputClass(invalid)}
              >
                {!warehouseId && <option value="">Choose…</option>}
                {active.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-slate-700">Type</span>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup">
              {(
                [
                  { value: 'count', label: 'Stock count', hint: 'Enter what you counted' },
                  { value: 'delta', label: 'Add / remove', hint: 'Enter the change, e.g. -3' },
                ] as const
              ).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.value}
                  onClick={() => setMode(m.value)}
                  className={clsx(
                    'rounded-md px-3 py-1.5 text-left transition-all duration-200',
                    mode === m.value
                      ? 'bg-white shadow-sm ring-1 ring-emerald-200'
                      : 'hover:bg-white/60',
                  )}
                >
                  <span
                    className={clsx(
                      'block text-sm font-medium',
                      mode === m.value ? 'text-mod-inventory' : 'text-slate-700',
                    )}
                  >
                    {m.label}
                  </span>
                  <span className="block text-xs text-slate-500">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <Field label="Reason" error={errors.reason}>
          {(id, invalid) => (
            <div className="space-y-2">
              <input
                id={id}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                placeholder="Why does stock change?"
                className={inputClass(invalid)}
              />
              <div className="flex flex-wrap gap-1.5">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={clsx(
                      'rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-all active:scale-95',
                      reason === r
                        ? 'bg-emerald-600 text-white ring-emerald-600'
                        : 'bg-white text-slate-600 ring-slate-200 hover:ring-emerald-300',
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>

        <div>
          <h2 className="mb-2 text-sm font-medium text-slate-700">Products</h2>
          <StockLines
            lines={lines}
            onChange={setLines}
            warehouseId={warehouseId}
            mode={mode}
            quantityLabel={mode === 'count' ? 'Counted' : 'Change'}
            errors={errors.lines}
            disabled={saving}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Info className="size-3.5" /> Posted adjustments cannot be edited: correct them with a
            new one.
          </p>
          <PrimaryButton type="submit" loading={saving}>
            <ClipboardCheck className="size-4" /> Post adjustment
          </PrimaryButton>
        </div>
      </form>

      <RecentDocuments
        types={['ADJUSTMENT']}
        title="Recent adjustments"
        emptyText="Adjustments you post appear here with their reason and lines."
        version={version}
        highlight={posted}
      />

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
