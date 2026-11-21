'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Lock, Plus, Trash2 } from 'lucide-react';
import type { CategoryNode, ProductDetail, UnitItem } from '@erp/shared';
import { api, ApiRequestError } from '@/lib/api';
import { useApiData } from '@/lib/use-api-data';
import { categoryOptionLabel, DECIMAL_4, flattenCategories } from '@/lib/inventory';
import { ErrorBanner, Field, inputClass, PrimaryButton } from '@/components/ui';

interface UnitRow {
  key: number;
  unitId: string;
  factor: string;
  forPurchase: boolean;
  forSale: boolean;
  barcode: string;
}

type Errors = Partial<
  Record<
    'sku' | 'barcode' | 'name' | 'baseUnitId' | 'salePrice' | 'minStock' | 'units' | 'form',
    string
  >
>;

let rowKey = 0;
const toRow = (u?: ProductDetail['units'][number]): UnitRow => ({
  key: ++rowKey,
  unitId: u?.unitId ?? '',
  factor: u?.factor ?? '',
  forPurchase: u?.forPurchase ?? true,
  forSale: u?.forSale ?? true,
  barcode: u?.barcode ?? '',
});

/**
 * Create / edit form for a product. `product` = null creates a new one.
 * Calls `onSaved` with the saved product returned by the API.
 */
export function ProductForm({
  product,
  readOnly,
  onSaved,
  cancelHref,
}: {
  product: ProductDetail | null;
  readOnly?: boolean;
  onSaved: (p: ProductDetail) => void;
  cancelHref: string;
}) {
  const units = useApiData<UnitItem[]>('/inventory/units');
  const categories = useApiData<CategoryNode[]>('/inventory/categories');
  const categoryRows = useMemo(() => {
    // Offer active categories, plus the product's current one even if it was deactivated since.
    return flattenCategories(categories.data ?? []).filter(
      (r) => r.node.isActive || r.node.id === product?.category?.id,
    );
  }, [categories.data, product?.category?.id]);

  const [sku, setSku] = useState(product?.sku ?? '');
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [categoryId, setCategoryId] = useState(product?.category?.id ?? '');
  const [baseUnitId, setBaseUnitId] = useState(product?.baseUnit.id ?? '');
  const [salePrice, setSalePrice] = useState(product?.salePrice ?? '');
  const [minStock, setMinStock] = useState(product?.minStock ?? '');
  const [rows, setRows] = useState<UnitRow[]>(() => (product?.units ?? []).map(toRow));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const baseLocked = Boolean(product?.hasStockMoves);
  const baseUnit = units.data?.find((u) => u.id === baseUnitId);

  // Default the base unit to PCS (or the first unit) for a new product.
  if (!product && !baseUnitId && units.data?.length) {
    setBaseUnitId((units.data.find((u) => u.code === 'PCS') ?? units.data[0]).id);
  }

  function updateRow(key: number, patch: Partial<UnitRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!/^[A-Za-z0-9._/-]{1,50}$/.test(sku.trim()))
      e.sku = 'Up to 50 letters, digits, ".", "_", "/" or "-" (no spaces).';
    if (!name.trim()) e.name = 'Give the product a name.';
    if (!baseUnitId) e.baseUnitId = 'Choose the unit stock is counted in.';
    if (salePrice.trim() && !DECIMAL_4.test(salePrice.trim()))
      e.salePrice = 'A positive number with at most 4 decimals.';
    if (minStock.trim() && !DECIMAL_4.test(minStock.trim()))
      e.minStock = 'A positive number with at most 4 decimals.';

    const seen = new Set<string>();
    for (const r of rows) {
      if (!r.unitId) e.units = 'Choose a unit on every line.';
      else if (r.unitId === baseUnitId) e.units = 'The base unit cannot be an extra unit.';
      else if (seen.has(r.unitId)) e.units = 'Each unit can only be listed once.';
      else if (!DECIMAL_4.test(r.factor.trim()) || Number(r.factor) <= 0)
        e.units = 'Each factor must be a number greater than 0.';
      seen.add(r.unitId);
    }
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const body = {
      sku: sku.trim(),
      barcode: barcode.trim() || null,
      name: name.trim(),
      description: description.trim() || null,
      categoryId: categoryId || null,
      baseUnitId,
      salePrice: salePrice.trim() || '0',
      minStock: minStock.trim() || '0',
      units: rows.map((r) => ({
        unitId: r.unitId,
        factor: r.factor.trim(),
        forPurchase: r.forPurchase,
        forSale: r.forSale,
        barcode: r.barcode.trim() || null,
      })),
    };

    setSaving(true);
    try {
      const saved = await api<ProductDetail>(
        product ? `/inventory/products/${product.id}` : '/inventory/products',
        { method: product ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );
      onSaved(saved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save';
      if (err instanceof ApiRequestError && err.status === 409) {
        setErrors(
          /sku/i.test(msg) ? { sku: msg } : /barcode/i.test(msg) ? { barcode: msg } : { form: msg },
        );
      } else {
        setErrors({ form: msg });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {errors.form && <ErrorBanner message={errors.form} />}
      <fieldset disabled={readOnly || saving} className="space-y-5">
        <Section
          title="Identification"
          description="How the product is recognised at the counter and on documents."
          delay={0}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SKU" hint="Your internal reference, e.g. BEV-COLA-33" error={errors.sku}>
              {(id, invalid) => (
                <input
                  id={id}
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  maxLength={50}
                  autoComplete="off"
                  className={inputClass(invalid) + ' font-mono'}
                />
              )}
            </Field>
            <Field
              label="Barcode"
              hint="Optional. EAN / UPC of one base unit."
              error={errors.barcode}
            >
              {(id, invalid) => (
                <input
                  id={id}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  maxLength={64}
                  autoComplete="off"
                  inputMode="numeric"
                  className={inputClass(invalid) + ' font-mono'}
                />
              )}
            </Field>
            <div className="sm:col-span-2">
              <Field label="Name" error={errors.name}>
                {(id, invalid) => (
                  <input
                    id={id}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={200}
                    placeholder="Cola 33cl can"
                    className={inputClass(invalid)}
                  />
                )}
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Description" hint="Optional.">
                {(id) => (
                  <textarea
                    id={id}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={2000}
                    rows={2}
                    className={inputClass() + ' resize-y'}
                  />
                )}
              </Field>
            </div>
          </div>
        </Section>

        <Section
          title="Classification"
          description="Where it sits in the catalogue and how stock is counted."
          delay={60}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Category"
              hint={categories.data && !categoryRows.length ? 'No categories yet.' : 'Optional.'}
            >
              {(id) => (
                <select
                  id={id}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={inputClass()}
                >
                  <option value="">— No category —</option>
                  {categoryRows.map((row) => (
                    <option key={row.node.id} value={row.node.id}>
                      {categoryOptionLabel(row)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              label="Base unit"
              hint={
                baseLocked
                  ? 'Locked: stock has already moved in this unit.'
                  : 'Stock levels are kept in this unit.'
              }
              error={errors.baseUnitId}
            >
              {(id, invalid) => (
                <div className="relative">
                  <select
                    id={id}
                    value={baseUnitId}
                    onChange={(e) => setBaseUnitId(e.target.value)}
                    disabled={baseLocked}
                    className={
                      inputClass(invalid) + ' disabled:bg-slate-50 disabled:text-slate-500'
                    }
                  >
                    {!baseUnitId && <option value="">Choose…</option>}
                    {units.data?.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} · {u.name}
                      </option>
                    ))}
                  </select>
                  {baseLocked && (
                    <Lock className="pointer-events-none absolute top-1/2 right-8 size-3.5 -translate-y-1/2 text-slate-400" />
                  )}
                </div>
              )}
            </Field>
          </div>
        </Section>

        <Section
          title="Price & stock alert"
          description="Prices are per base unit, tax excluded."
          delay={120}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sale price" error={errors.salePrice}>
              {(id, invalid) => (
                <input
                  id={id}
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className={inputClass(invalid) + ' text-right tabular-nums'}
                />
              )}
            </Field>
            <Field
              label="Minimum stock"
              hint={`Flagged as low stock below this quantity${baseUnit ? ` (${baseUnit.code})` : ''}.`}
              error={errors.minStock}
            >
              {(id, invalid) => (
                <input
                  id={id}
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className={inputClass(invalid) + ' text-right tabular-nums'}
                />
              )}
            </Field>
          </div>
        </Section>

        <Section
          title="Purchase & sale units"
          description={`Optional packs, e.g. a carton of 24${baseUnit ? ` ${baseUnit.code}` : ''}. Stock is still counted in the base unit.`}
          delay={180}
        >
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="hidden grid-cols-[1.3fr_0.8fr_1.2fr_auto_auto_auto] gap-2 px-1 text-xs font-medium text-slate-500 sm:grid">
                <span>Unit</span>
                <span>= base units</span>
                <span>Barcode</span>
                <span className="w-16 text-center">Buy</span>
                <span className="w-16 text-center">Sell</span>
                <span className="w-8" />
              </div>
              {rows.map((r) => (
                <div
                  key={r.key}
                  className="animate-fade-up grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2 sm:grid-cols-[1.3fr_0.8fr_1.2fr_auto_auto_auto] sm:items-center sm:border-0 sm:bg-transparent sm:p-0"
                >
                  <select
                    aria-label="Unit"
                    value={r.unitId}
                    onChange={(e) => updateRow(r.key, { unitId: e.target.value })}
                    className={inputClass() + ' col-span-2 sm:col-span-1'}
                  >
                    <option value="">Choose…</option>
                    {units.data
                      ?.filter((u) => u.id !== baseUnitId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.code} · {u.name}
                        </option>
                      ))}
                  </select>
                  <input
                    aria-label="Factor"
                    value={r.factor}
                    onChange={(e) => updateRow(r.key, { factor: e.target.value })}
                    inputMode="decimal"
                    placeholder="24"
                    className={inputClass() + ' text-right tabular-nums'}
                  />
                  <input
                    aria-label="Barcode"
                    value={r.barcode}
                    onChange={(e) => updateRow(r.key, { barcode: e.target.value })}
                    placeholder="Optional"
                    className={inputClass() + ' font-mono'}
                  />
                  <Check
                    label="Buy"
                    checked={r.forPurchase}
                    onChange={(v) => updateRow(r.key, { forPurchase: v })}
                  />
                  <Check
                    label="Sell"
                    checked={r.forSale}
                    onChange={(v) => updateRow(r.key, { forSale: v })}
                  />
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    aria-label="Remove unit"
                    className="grid size-8 place-items-center justify-self-end rounded-md text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 active:scale-90"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {errors.units && (
            <p key={errors.units} className="animate-shake mt-2 text-xs text-red-600">
              {errors.units}
            </p>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, toRow()])}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-lg border border-dashed border-emerald-300 px-3 py-2 text-sm font-medium text-mod-inventory transition-all hover:border-emerald-400 hover:bg-emerald-50',
                rows.length > 0 && 'mt-3',
              )}
            >
              <Plus className="size-4" /> Add a unit
            </button>
          )}
        </Section>
      </fieldset>

      {!readOnly && (
        <div className="animate-fade-up sticky bottom-3 z-10 flex justify-end gap-2 rounded-xl border border-slate-200 bg-white/85 px-4 py-3 shadow-lg shadow-slate-900/5 backdrop-blur">
          <Link
            href={cancelHref}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98]"
          >
            Cancel
          </Link>
          <PrimaryButton type="submit" loading={saving}>
            {product ? 'Save changes' : 'Create product'}
          </PrimaryButton>
        </div>
      )}
    </form>
  );
}

function Section({
  title,
  description,
  delay,
  children,
}: {
  title: string;
  description: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="animate-fade-up rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <p className="mb-4 text-sm text-slate-500">{description}</p>
      {children}
    </section>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex w-16 cursor-pointer items-center justify-center gap-1.5 text-xs text-slate-600 sm:justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded accent-emerald-600"
      />
      <span className="sm:hidden">{label}</span>
    </label>
  );
}
