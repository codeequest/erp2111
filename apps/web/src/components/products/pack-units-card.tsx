'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Boxes, Loader2, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import type { ProductDetail, ProductPackUnitInput, UnitRef } from '@erp/shared';
import { api } from '@/lib/api';
import { formatQty } from '@/lib/format';
import { ErrorBox, btnPrimary, btnSecondary, fieldClass } from './ui';

import { tr } from '@/lib/i18n';
const FACTOR = /^\d{1,14}(\.\d{1,4})?$/;

interface Row {
  unitId: string;
  factor: string;
  forPurchase: boolean;
  forSale: boolean;
  barcode: string;
}

/** Shows and edits the pack sizes of a product, e.g. 1 CTN = 24 PCS. */
export function PackUnitsCard({
  product,
  canWrite,
  onSaved,
}: {
  product: ProductDetail;
  canWrite: boolean;
  onSaved: (p: ProductDetail) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [units, setUnits] = useState<UnitRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const base = product.baseUnit.code;

  async function startEditing() {
    setError(null);
    setRows(
      product.packUnits.map((u) => ({
        unitId: u.unit.id,
        factor: u.factor,
        forPurchase: u.forPurchase,
        forSale: u.forSale,
        barcode: u.barcode ?? '',
      })),
    );
    setEditing(true);
    if (!units) {
      try {
        const all = await api<UnitRef[]>('/inventory/units');
        setUnits(all.filter((u) => u.id !== product.baseUnit.id));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  async function save() {
    setError(null);
    for (const r of rows) {
      if (!r.unitId) return setError(tr("Choose a unit on every line"));
      if (!FACTOR.test(r.factor.trim()) || Number(r.factor) <= 0) {
        return setError(tr('Enter how many {unit} are in one pack (a number above 0)', { unit: base }));
      }
    }
    const body: { units: ProductPackUnitInput[] } = {
      units: rows.map((r) => ({
        unitId: r.unitId,
        factor: r.factor.trim(),
        forPurchase: r.forPurchase,
        forSale: r.forSale,
        barcode: r.barcode.trim(),
      })),
    };
    setSaving(true);
    try {
      onSaved(
        await api<ProductDetail>(`/inventory/products/${product.id}/units`, {
          method: 'PUT',
          body: JSON.stringify(body),
        }),
      );
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const usedUnits = new Set(rows.map((r) => r.unitId));
  const freeUnits = units?.filter((u) => !usedUnits.has(u.id)) ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{tr("Pack sizes")}</h2>
        {canWrite && !editing && (
          <button onClick={startEditing} className={clsx(btnSecondary, 'px-2 py-1 text-xs')}>
            <Pencil className="size-3.5" /> {' '}{tr("Edit")}</button>
        )}
      </div>

      {error && (
        <div className="mb-3">
          <ErrorBox message={error} />
        </div>
      )}

      {!editing ? (
        product.packUnits.length === 0 ? (
          <p className="text-sm text-slate-500">
            {tr("Sold and bought by the")}{' '}{product.baseUnit.name.toLowerCase()} ({base}{tr(") only.")}{canWrite && ' ' + tr('Add a pack size such as a carton to buy or sell in bulk.')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {product.packUnits.map((u) => (
              <li key={u.unit.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <Boxes className="size-4 text-slate-400" />
                <span className="font-medium">
                  1 {u.unit.code} = {formatQty(u.factor)} {base}
                </span>
                <span className="text-xs text-slate-500">
                  {[u.forPurchase && tr('Purchase'), u.forSale && tr('Sale')].filter(Boolean).join(' · ') ||
                    tr('Not used')}
                </span>
                {u.barcode && (
                  <span className="ms-auto font-mono text-xs text-slate-500">{u.barcode}</span>
                )}
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="space-y-3">
          {rows.length === 0 && (
            <p className="text-sm text-slate-500">{tr("No pack sizes. Add one below.")}</p>
          )}
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm"
            >
              <span className="text-slate-500">1</span>
              <select
                value={r.unitId}
                onChange={(e) => update(i, { unitId: e.target.value })}
                className={clsx(fieldClass, 'py-1.5')}
                aria-label={tr("Pack unit")}
              >
                <option value="">{tr("Unit…")}</option>
                {units
                  ?.filter((u) => u.id === r.unitId || !usedUnits.has(u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} — {u.name}
                    </option>
                  ))}
              </select>
              <span className="text-slate-500">=</span>
              <input
                value={r.factor}
                onChange={(e) => update(i, { factor: e.target.value })}
                inputMode="decimal"
                className={clsx(fieldClass, 'w-20 py-1.5 tabular-nums')}
                aria-label={tr('{unit} per pack', { unit: base })}
                placeholder="24"
              />
              <span className="text-slate-500">{base}</span>
              <input
                value={r.barcode}
                onChange={(e) => update(i, { barcode: e.target.value })}
                className={clsx(fieldClass, 'w-40 py-1.5 font-mono text-xs')}
                aria-label={tr("Pack barcode")}
                placeholder={tr("Barcode (optional)")}
                maxLength={64}
              />
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={r.forPurchase}
                  onChange={(e) => update(i, { forPurchase: e.target.checked })}
                />
                {tr("Purchase")}</label>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={r.forSale}
                  onChange={(e) => update(i, { forSale: e.target.checked })}
                />
                {tr("Sale")}</label>
              <button
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                className="ms-auto rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label={tr("Remove pack size")}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={() =>
                setRows((rs) => [
                  ...rs,
                  { unitId: '', factor: '', forPurchase: true, forSale: true, barcode: '' },
                ])
              }
              disabled={!units || freeUnits.length === 0}
              title={
                units && freeUnits.length === 0 ? tr("Create more units in Catalogue setup") : undefined
              }
              className={clsx(btnSecondary, 'px-2 py-1 text-xs')}
            >
              <Plus className="size-3.5" /> {' '}{tr("Add pack size")}</button>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className={btnSecondary}>
                {tr("Cancel")}</button>
              <button onClick={save} disabled={saving} className={btnPrimary}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{' '}
                {tr("Save")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
