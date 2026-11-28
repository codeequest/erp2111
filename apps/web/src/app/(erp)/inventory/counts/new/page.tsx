'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import type { ProductLookups, StockCountDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Breadcrumbs, ErrorBox, btnPrimary, inputClass } from '@/components/products/ui';
import { useWarehouses } from '@/components/stock/stock-ui';

import { tr } from '@/lib/i18n';
export default function NewStockCountPage() {
  const router = useRouter();
  const { can } = useAuth();
  const { warehouses, error: whError } = useWarehouses();
  const [categories, setCategories] = useState<ProductLookups['categories']>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [includeZero, setIncludeZero] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ProductLookups>('/inventory/products/lookups')
      .then((l) => setCategories(l.categories))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!warehouseId && warehouses.length) {
      setWarehouseId((warehouses.find((w) => w.code === 'MAIN') ?? warehouses[0]).id);
    }
  }, [warehouses, warehouseId]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const count = await api<StockCountDetail>('/inventory/counts', {
        method: 'POST',
        body: JSON.stringify({ warehouseId, categoryId: categoryId || null, includeZero, notes: notes || null }),
      });
      router.push(`/inventory/counts/${count.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!can('inventory.stock.adjust')) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBox message={tr("You need the inventory.stock.adjust permission to start a stock count.")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Breadcrumbs trail={[{ label: tr("Stock counts"), href: '/inventory/counts' }, { label: tr("New") }]} />
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{tr("Start a stock count")}</h1>
        <p className="text-sm text-slate-500">
          {tr("The system lists the products to count with the quantity it expects. Nothing changes until you validate.")}</p>
      </div>

      {(error || whError) && <ErrorBox message={(error ?? whError)!} />}

      <form onSubmit={start} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Warehouse to count")}</span>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={inputClass}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Products")}</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
            <option value="">{tr("All products of the warehouse")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {'  '.repeat(c.depth)}
                {tr("Only")}{' '}{c.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            {tr("For a big warehouse, count one category at a time (a cycle count).")}</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} className="mt-0.5" />
          <span>
            {tr("Also list products with no stock here")}<span className="block text-xs text-slate-500">
              {tr("Useful to count goods the system does not know are here. Products found during the count can also be added by scanning them.")}</span>
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            {tr("Notes")}{' '}<span className="font-normal text-slate-400">{tr("(optional)")}</span>
          </span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} maxLength={1000} />
        </label>
        <button type="submit" disabled={busy || !warehouseId} className={btnPrimary}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />} {' '}{tr("Start count")}</button>
      </form>
    </div>
  );
}
