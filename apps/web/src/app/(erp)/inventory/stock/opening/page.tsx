'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Flag, Info } from 'lucide-react';
import type { StockPostingResult, WarehouseItem } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiData } from '@/lib/use-api-data';
import { DECIMAL_4 } from '@/lib/inventory';
import { newLine, StockLines, type StockLine } from '@/components/inventory/stock-lines';
import {
  AccessDenied,
  ErrorBanner,
  Field,
  InventoryHeader,
  inputClass,
  PrimaryButton,
  Toast,
} from '@/components/ui';

/** Go-live: the stock and cost of each product per warehouse, posted once. */
export default function OpeningBalancesPage() {
  const { can } = useAuth();
  const allowed = can('inventory.stock.adjust') && can('inventory.cost.view');
  const warehouses = useApiData<WarehouseItem[]>(allowed ? '/inventory/warehouses' : null);
  const active = warehouses.data?.filter((w) => w.isActive) ?? [];

  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<StockLine[]>(() => [newLine()]);
  const [errors, setErrors] = useState<{ lines?: Record<number, string>; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  if (!warehouseId && active.length) setWarehouseId(active[0].id);

  if (!allowed) {
    return (
      <AccessDenied
        permission={
          can('inventory.stock.adjust') ? 'inventory.cost.view' : 'inventory.stock.adjust'
        }
        what="opening balances (they set product costs)"
      />
    );
  }

  // Display-only total; the API stores exact decimals.
  const total = lines.reduce((sum, l) => {
    const q = Number(l.quantity);
    const c = Number(l.unitCost);
    return Number.isFinite(q * c) ? sum + q * c : sum;
  }, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const lineErrors: Record<number, string> = {};
    const filled = lines.filter((l) => l.product || l.quantity.trim() || l.unitCost.trim());
    for (const l of filled) {
      if (!l.product) lineErrors[l.key] = 'Choose a product.';
      else if (!DECIMAL_4.test(l.quantity.trim()) || Number(l.quantity) <= 0)
        lineErrors[l.key] = 'Enter a quantity greater than 0.';
      else if (!DECIMAL_4.test(l.unitCost.trim()))
        lineErrors[l.key] = 'Enter the cost of one unit (0 or more).';
    }
    const next = {
      lines: lineErrors,
      form: filled.length ? undefined : 'Add at least one product.',
    };
    setErrors(next);
    if (next.form || Object.keys(lineErrors).length) return;

    setSaving(true);
    try {
      const res = await api<StockPostingResult>('/inventory/stock/opening-balances', {
        method: 'POST',
        body: JSON.stringify({
          warehouseId,
          lines: filled.map((l) => ({
            productId: l.product!.id,
            quantity: l.quantity.trim(),
            unitCost: l.unitCost.trim(),
          })),
        }),
      });
      setToast(
        `${res.reference} posted · ${res.moves} ${res.moves === 1 ? 'product' : 'products'}`,
      );
      setLines([newLine()]);
    } catch (err) {
      setErrors({
        form: err instanceof Error ? err.message : 'Could not post the opening balance',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <InventoryHeader
        section="Opening balances"
        title="Opening balances"
        description="The stock you start with in each warehouse, and what it cost."
        icon={Flag}
        actions={
          <Link
            href="/inventory/stock"
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium text-white ring-1 ring-white/30 backdrop-blur transition-all hover:bg-white/20"
          >
            <ArrowLeft className="size-4" /> Stock levels
          </Link>
        }
      />

      <div
        className="animate-fade-up flex gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-900"
        style={{ animationDelay: '60ms' }}
      >
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Post an opening balance <strong>once per product and warehouse</strong>, before any other
          movement. The cost you enter becomes the product&apos;s average cost. Corrections
          afterwards are made with an adjustment.
        </p>
      </div>

      <form
        onSubmit={submit}
        noValidate
        className="animate-fade-up space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
        style={{ animationDelay: '120ms' }}
      >
        {errors.form && <ErrorBanner message={errors.form} />}
        <div className="max-w-sm">
          <Field label="Warehouse">
            {(id) => (
              <select
                id={id}
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className={inputClass()}
              >
                {active.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <StockLines
          lines={lines}
          onChange={setLines}
          warehouseId={warehouseId}
          quantityLabel="Quantity"
          showCost
          errors={errors.lines}
          disabled={saving}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600">
            Stock value{' '}
            <span className="font-semibold text-slate-900 tabular-nums">
              {total.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </p>
          <PrimaryButton type="submit" loading={saving}>
            <Flag className="size-4" /> Post opening balance
          </PrimaryButton>
        </div>
      </form>

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
