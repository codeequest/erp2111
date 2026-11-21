'use client';

import { useCallback, useState } from 'react';
import { ArrowLeftRight, ArrowRightLeft, Send } from 'lucide-react';
import type { StockPostingResult, WarehouseItem } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiData } from '@/lib/use-api-data';
import { DECIMAL_4 } from '@/lib/inventory';
import { newLine, StockLines, type StockLine } from '@/components/inventory/stock-lines';
import { RecentDocuments } from '@/components/inventory/recent-documents';
import {
  AccessDenied,
  EmptyState,
  ErrorBanner,
  Field,
  InventoryHeader,
  inputClass,
  PrimaryButton,
  Toast,
} from '@/components/ui';

export default function TransfersPage() {
  const { can } = useAuth();
  const warehouses = useApiData<WarehouseItem[]>(
    can('inventory.stock.read') ? '/inventory/warehouses' : null,
  );
  const active = warehouses.data?.filter((w) => w.isActive) ?? [];

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<StockLine[]>(() => [newLine()]);
  const [errors, setErrors] = useState<{
    from?: string;
    to?: string;
    lines?: Record<number, string>;
    form?: string;
  }>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const clearToast = useCallback(() => setToast(null), []);

  if (!fromId && !toId && active.length >= 2) {
    setFromId(active[0].id);
    setToId(active[1].id);
  }

  if (!can('inventory.stock.transfer')) {
    return <AccessDenied permission="inventory.stock.transfer" what="stock transfers" />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const lineErrors: Record<number, string> = {};
    const filled = lines.filter((l) => l.product || l.quantity.trim());
    for (const l of filled) {
      if (!l.product) lineErrors[l.key] = 'Choose a product.';
      else if (!DECIMAL_4.test(l.quantity.trim()) || Number(l.quantity) <= 0)
        lineErrors[l.key] = 'Enter a quantity greater than 0.';
    }
    const next = {
      from: fromId ? undefined : 'Choose where the stock leaves from.',
      to: !toId
        ? 'Choose where the stock goes.'
        : toId === fromId
          ? 'Choose a different warehouse.'
          : undefined,
      lines: lineErrors,
      form: filled.length ? undefined : 'Add at least one product.',
    };
    setErrors(next);
    if (next.from || next.to || next.form || Object.keys(lineErrors).length) return;

    setSaving(true);
    try {
      const res = await api<StockPostingResult>('/inventory/stock/transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromWarehouseId: fromId,
          toWarehouseId: toId,
          note: note.trim() || undefined,
          lines: filled.map((l) => ({ productId: l.product!.id, quantity: l.quantity.trim() })),
        }),
      });
      const products = res.moves / 2;
      setToast(
        `${res.reference} posted · ${products} ${products === 1 ? 'product' : 'products'} moved`,
      );
      setPosted(res.reference);
      setVersion((v) => v + 1);
      setLines([newLine()]);
      setNote('');
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Could not post the transfer' });
    } finally {
      setSaving(false);
    }
  }

  const select = (value: string, onChange: (v: string) => void, invalid: boolean, id: string) => (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass(invalid)}
    >
      {!value && <option value="">Choose…</option>}
      {active.map((w) => (
        <option key={w.id} value={w.id}>
          {w.code} · {w.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <InventoryHeader
        section="Transfers"
        title="Stock transfers"
        description="Move stock between shops and depots. Stock leaves one and arrives in the other at once."
        icon={ArrowLeftRight}
      />

      {warehouses.data && active.length < 2 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            icon={ArrowLeftRight}
            title="You need two active warehouses"
            text="Create a second warehouse (e.g. a shop or a depot) to move stock between them."
          />
        </div>
      ) : (
        <form
          onSubmit={submit}
          noValidate
          className="animate-fade-up space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
          style={{ animationDelay: '80ms' }}
        >
          {errors.form && <ErrorBanner message={errors.form} />}

          <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
            <Field label="From" error={errors.from}>
              {(id, invalid) => select(fromId, setFromId, invalid, id)}
            </Field>
            <button
              type="button"
              onClick={() => {
                setFromId(toId);
                setToId(fromId);
              }}
              aria-label="Swap warehouses"
              title="Swap"
              className="mb-0.5 grid size-9 place-items-center justify-self-center rounded-full border border-slate-200 bg-white text-slate-500 transition-all hover:rotate-180 hover:border-emerald-300 hover:text-mod-inventory"
            >
              <ArrowRightLeft className="size-4" />
            </button>
            <Field label="To" error={errors.to}>
              {(id, invalid) => select(toId, setToId, invalid, id)}
            </Field>
          </div>

          <Field label="Note" hint="Optional, e.g. why the stock moves.">
            {(id) => (
              <input
                id={id}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                className={inputClass()}
              />
            )}
          </Field>

          <div>
            <h2 className="mb-2 text-sm font-medium text-slate-700">Products</h2>
            <StockLines
              lines={lines}
              onChange={setLines}
              warehouseId={fromId}
              quantityLabel="Quantity"
              errors={errors.lines}
              disabled={saving}
            />
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <PrimaryButton type="submit" loading={saving}>
              <Send className="size-4" /> Post transfer
            </PrimaryButton>
          </div>
        </form>
      )}

      <RecentDocuments
        types={['TRANSFER_OUT', 'TRANSFER_IN']}
        title="Recent transfers"
        emptyText="Transfers you post appear here with their route and lines."
        version={version}
        highlight={posted}
      />

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
