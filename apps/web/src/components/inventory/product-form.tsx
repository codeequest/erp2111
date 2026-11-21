'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Save, ScanLine, Trash2 } from 'lucide-react';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  flattenCategories,
  fmtMoney,
  fmtPrice,
  listCategories,
  listTaxRates,
  listUnits,
  marginPct,
  priceWithTax,
  saleFromMargin,
  type CategoryNode,
  type ProductDetail,
  type ProductInput,
  type TaxRate,
  type Unit,
} from '@/lib/inventory';
import { BarcodeScanner } from './barcode-scanner';
import { Alert, Field, btn, btnPrimary, input } from './ui';

interface UnitRow {
  unitId: string;
  factor: string;
  forPurchase: boolean;
  forSale: boolean;
  barcode: string;
}

interface FormState {
  sku: string;
  barcode: string;
  name: string;
  description: string;
  categoryId: string;
  baseUnitId: string;
  taxRateId: string;
  salePrice: string;
  purchasePrice: string;
  /** Typed margin %; recomputed from the prices unless the user is typing in it */
  margin: string;
  minStock: string;
  trackLots: boolean;
  units: UnitRow[];
}

const fmtPct = (n: number | null) => (n === null ? '' : String(Math.round(n * 10) / 10));

function initialState(p?: ProductDetail, initialBarcode?: string): FormState {
  return {
    sku: p?.sku ?? '',
    barcode: p?.barcode ?? initialBarcode ?? '',
    name: p?.name ?? '',
    description: p?.description ?? '',
    categoryId: p?.categoryId ?? '',
    baseUnitId: p?.baseUnitId ?? '',
    taxRateId: p?.taxRateId ?? '',
    salePrice: p ? String(Number(p.salePrice)) : '0',
    purchasePrice: p?.purchasePrice !== undefined ? String(Number(p.purchasePrice)) : '0',
    margin: p ? fmtPct(marginPct(Number(p.salePrice), Number(p.purchasePrice ?? 0))) : '',
    minStock: p ? String(Number(p.minStock)) : '0',
    trackLots: p?.trackLots ?? false,
    units:
      p?.units.map((u) => ({
        unitId: u.unitId,
        factor: String(Number(u.factor)),
        forPurchase: u.forPurchase,
        forSale: u.forSale,
        barcode: u.barcode ?? '',
      })) ?? [],
  };
}

const toNumber = (v: string) => Number(v.trim().replace(',', '.'));

function validate(f: FormState, canCost: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.sku.trim()) e.sku = 'SKU is required';
  else if (!/^[A-Za-z0-9._\-/]+$/.test(f.sku.trim()))
    e.sku = 'Only letters, digits and . _ - / (no spaces)';
  if (!f.name.trim()) e.name = 'Name is required';
  if (!f.baseUnitId) e.baseUnitId = 'Choose the unit stock is counted in';
  const price = toNumber(f.salePrice);
  if (f.salePrice.trim() === '' || Number.isNaN(price) || price < 0)
    e.salePrice = 'Enter a price ≥ 0';
  if (canCost) {
    const purchase = toNumber(f.purchasePrice);
    if (f.purchasePrice.trim() === '' || Number.isNaN(purchase) || purchase < 0)
      e.purchasePrice = 'Enter a price ≥ 0';
  }
  const min = toNumber(f.minStock);
  if (f.minStock.trim() === '' || Number.isNaN(min) || min < 0) e.minStock = 'Enter a quantity ≥ 0';
  f.units.forEach((u, i) => {
    const factor = toNumber(u.factor);
    if (!u.unitId) e[`units.${i}`] = 'Choose a unit';
    else if (u.unitId === f.baseUnitId) e[`units.${i}`] = 'Already the base unit';
    else if (f.units.findIndex((o) => o.unitId === u.unitId) !== i)
      e[`units.${i}`] = 'Listed twice';
    else if (Number.isNaN(factor) || factor <= 0) e[`units.${i}`] = 'Factor must be > 0';
  });
  return e;
}

export function ProductForm({
  product,
  submitLabel,
  onSubmit,
  onCancel,
  baseUnitLocked,
  initialBarcode,
}: {
  product?: ProductDetail;
  submitLabel: string;
  onSubmit: (input: ProductInput) => Promise<void>;
  onCancel: () => void;
  /** True when the product has stock moves: the base unit can no longer change. */
  baseUnitLocked?: boolean;
  /** Pre-fills the barcode, e.g. after scanning an unknown code */
  initialBarcode?: string;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(product, initialBarcode));
  /** Which barcode field the camera fills: the product one, or a packaging row index */
  const [scanTarget, setScanTarget] = useState<'product' | number | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canCost = useAuth().can('inventory.cost.view');

  useEffect(() => {
    Promise.all([listUnits(), listCategories(), listTaxRates()])
      .then(([u, c, t]) => {
        setUnits(u);
        setCategories(c);
        setTaxRates(t);
        if (!product) {
          const pcs = u.find((x) => x.code === 'PCS') ?? u[0];
          if (pcs) setForm((f) => (f.baseUnitId ? f : { ...f, baseUnitId: pcs.id }));
        }
      })
      .catch((e: Error) => setServerError(e.message));
  }, [product]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setUnit = (i: number, patch: Partial<UnitRow>) =>
    setForm((f) => ({ ...f, units: f.units.map((u, j) => (j === i ? { ...u, ...patch } : u)) }));

  const flatCategories = flattenCategories(categories).filter(
    (c) => c.isActive || c.id === form.categoryId,
  );
  const baseUnit = units.find((u) => u.id === form.baseUnitId);
  const defaultRate = taxRates.find((t) => t.isDefault);
  const effectiveRate = taxRates.find((t) => t.id === form.taxRateId) ?? defaultRate;
  const price = toNumber(form.salePrice);
  const priceHint =
    !Number.isNaN(price) && effectiveRate
      ? `Excl. VAT — ${fmtPrice(priceWithTax(price, effectiveRate.rate))} incl. ${Number(effectiveRate.rate)} % VAT`
      : 'Excluding VAT';

  /** Sale or purchase price changed → recompute the margin. */
  const setPrice = (key: 'salePrice' | 'purchasePrice', value: string) =>
    setForm((f) => {
      const next = { ...f, [key]: value };
      return {
        ...next,
        margin: fmtPct(marginPct(toNumber(next.salePrice), toNumber(next.purchasePrice))),
      };
    });
  /** Margin changed → recompute the sale price from the purchase price. */
  const setMargin = (value: string) =>
    setForm((f) => {
      const sale = saleFromMargin(toNumber(f.purchasePrice), toNumber(value));
      return {
        ...f,
        margin: value,
        salePrice:
          value.trim() !== '' && sale !== null && !Number.isNaN(sale) ? String(sale) : f.salePrice,
      };
    });
  const purchase = toNumber(form.purchasePrice);
  const marginAmount = !Number.isNaN(price) && !Number.isNaN(purchase) ? price - purchase : null;

  const scanButton = (target: 'product' | number) => (
    <button
      type="button"
      aria-label="Scan barcode"
      title="Scan with the camera or a USB scanner"
      onClick={() => setScanTarget(target)}
      className="shrink-0 rounded-md border border-slate-300 px-2.5 text-slate-500 hover:bg-slate-50 hover:text-mod-inventory"
    >
      <ScanLine className="size-4" />
    </button>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate(form, canCost);
    setErrors(v);
    setServerError(null);
    if (Object.keys(v).length > 0) return;
    setSaving(true);
    try {
      await onSubmit({
        sku: form.sku.trim(),
        barcode: form.barcode.trim() || null,
        name: form.name.trim(),
        description: form.description.trim() || null,
        categoryId: form.categoryId || null,
        baseUnitId: form.baseUnitId,
        taxRateId: form.taxRateId || null,
        salePrice: toNumber(form.salePrice),
        ...(canCost ? { purchasePrice: toNumber(form.purchasePrice) } : {}),
        minStock: toNumber(form.minStock),
        trackLots: form.trackLots,
        units: form.units.map((u) => ({
          unitId: u.unitId,
          factor: toNumber(u.factor),
          forPurchase: u.forPurchase,
          forSale: u.forSale,
          barcode: u.barcode.trim() || null,
        })),
      });
    } catch (err) {
      setServerError(
        err instanceof ApiRequestError || err instanceof Error ? err.message : 'Save failed',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {serverError && <Alert>{serverError}</Alert>}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold text-slate-900">General</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="SKU / reference"
            required
            error={errors.sku}
            hint="Unique code, e.g. COCA-33CL"
          >
            <input
              className={input}
              value={form.sku}
              onChange={(e) => set('sku', e.target.value)}
              autoFocus={!product}
            />
          </Field>
          <Field label="Barcode (EAN)" hint="Optional, must be unique">
            <div className="flex gap-2">
              <input
                className={input}
                value={form.barcode}
                onChange={(e) => set('barcode', e.target.value)}
                inputMode="numeric"
              />
              {scanButton('product')}
            </div>
          </Field>
          <Field label="Name" required error={errors.name} className="md:col-span-2">
            <input
              className={input}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="Category">
            <select
              className={input}
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              <option value="">— No category —</option>
              {flatCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {'  '.repeat(c.depth)}
                  {c.name}
                  {!c.isActive ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Tax rate"
            hint={
              taxRates.length === 0 ? 'No tax rates yet (Administration › Tax rates)' : undefined
            }
          >
            <select
              className={input}
              value={form.taxRateId}
              onChange={(e) => set('taxRateId', e.target.value)}
            >
              <option value="">
                — Company default{defaultRate ? ` (${defaultRate.name})` : ''} —
              </option>
              {taxRates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({Number(t.rate)} %)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description" className="md:col-span-2">
            <textarea
              className={input}
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold text-slate-900">Price &amp; stock</h2>
        {/* Purchase price, sale price and margin on one line: editing the margin sets the sale price. */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {canCost && (
            <Field
              label={`Purchase price${baseUnit ? ` per ${baseUnit.code}` : ''}`}
              required
              error={errors.purchasePrice}
              hint="Excl. VAT — reference price (the average cost is computed from receipts)"
            >
              <input
                className={input}
                inputMode="decimal"
                value={form.purchasePrice}
                onChange={(e) => setPrice('purchasePrice', e.target.value)}
              />
            </Field>
          )}
          <Field
            label={`Sale price${baseUnit ? ` per ${baseUnit.code}` : ''}`}
            required
            error={errors.salePrice}
            hint={priceHint}
          >
            <input
              className={input}
              inputMode="decimal"
              value={form.salePrice}
              onChange={(e) => setPrice('salePrice', e.target.value)}
            />
          </Field>
          {canCost && (
            <Field
              label="Margin (%)"
              hint={
                marginAmount !== null
                  ? `${fmtMoney(marginAmount)} per ${baseUnit?.code ?? 'unit'} — on the sale price`
                  : 'On the sale price'
              }
            >
              <input
                className={input}
                inputMode="decimal"
                value={form.margin}
                onChange={(e) => setMargin(e.target.value)}
              />
            </Field>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 md:grid-cols-3">
          <Field
            label="Base unit"
            required
            error={errors.baseUnitId}
            hint={
              baseUnitLocked
                ? 'Locked: this product already has stock movements'
                : 'Stock is counted in this unit'
            }
          >
            <select
              className={input}
              value={form.baseUnitId}
              disabled={baseUnitLocked}
              onChange={(e) => set('baseUnitId', e.target.value)}
            >
              <option value="">— Choose —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} — {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Minimum stock"
            error={errors.minStock}
            hint="Low-stock alert at or below this quantity (0 = no alert)"
          >
            <input
              className={input}
              inputMode="decimal"
              value={form.minStock}
              onChange={(e) => set('minStock', e.target.value)}
            />
          </Field>
          <Field
            label="Lots & expiry dates"
            hint={
              baseUnitLocked
                ? 'Locked: this product already has stock movements'
                : 'Food, medicines, cosmetics… stock is kept per lot'
            }
          >
            <label className="flex h-[38px] items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.trackLots}
                disabled={baseUnitLocked}
                onChange={(e) => set('trackLots', e.target.checked)}
              />
              Track lot numbers and expiry dates
            </label>
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-1 flex items-center justify-between gap-4">
          <h2 className="font-semibold text-slate-900">Packaging / alternative units</h2>
          <button
            type="button"
            className={btn}
            onClick={() =>
              set('units', [
                ...form.units,
                { unitId: '', factor: '', forPurchase: true, forSale: true, barcode: '' },
              ])
            }
          >
            <Plus className="size-4" /> Add unit
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          E.g. buy by the carton: 1 CTN = 24 {baseUnit?.code ?? 'base units'}.
        </p>
        {form.units.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
            Only the base unit is used.
          </p>
        ) : (
          <div className="space-y-3">
            {form.units.map((u, i) => (
              <div
                key={i}
                className="grid grid-cols-2 items-start gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[1.2fr_1fr_1.4fr_auto_auto]"
              >
                <Field label="Unit" error={errors[`units.${i}`]}>
                  <select
                    className={input}
                    value={u.unitId}
                    onChange={(e) => setUnit(i, { unitId: e.target.value })}
                  >
                    <option value="">— Choose —</option>
                    {units
                      .filter((x) => x.id !== form.baseUnitId)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.code} — {x.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label={`= how many ${baseUnit?.code ?? 'base'}`}>
                  <input
                    className={input}
                    inputMode="decimal"
                    value={u.factor}
                    onChange={(e) => setUnit(i, { factor: e.target.value })}
                  />
                </Field>
                <Field label="Barcode" className="col-span-2 md:col-span-1">
                  <div className="flex gap-2">
                    <input
                      className={input}
                      value={u.barcode}
                      onChange={(e) => setUnit(i, { barcode: e.target.value })}
                    />
                    {scanButton(i)}
                  </div>
                </Field>
                <div className="flex gap-4 pt-7 text-sm text-slate-700">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={u.forPurchase}
                      onChange={(e) => setUnit(i, { forPurchase: e.target.checked })}
                    />
                    Buy
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={u.forSale}
                      onChange={(e) => setUnit(i, { forSale: e.target.checked })}
                    />
                    Sell
                  </label>
                </div>
                <button
                  type="button"
                  aria-label="Remove unit"
                  className="mt-6 justify-self-end rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  onClick={() =>
                    set(
                      'units',
                      form.units.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex justify-end gap-2">
        <button type="button" className={btn} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className={btnPrimary} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {submitLabel}
        </button>
      </div>
      {scanTarget !== null && (
        <BarcodeScanner
          title={
            scanTarget === 'product' ? 'Scan the product barcode' : 'Scan the packaging barcode'
          }
          onClose={() => setScanTarget(null)}
          onCode={(code) => {
            if (scanTarget === 'product') set('barcode', code);
            else setUnit(scanTarget, { barcode: code });
            setScanTarget(null);
          }}
        />
      )}
    </form>
  );
}
