'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Plus, Save, X } from 'lucide-react';
import type {
  CategoryDto,
  ProductDetail,
  ProductFormOptions,
  ProductInput,
  UnitDto,
} from '@erp/shared';
import { api } from '@/lib/api';
import { decimalToInput } from '@/lib/format';

const inputCls =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500';
const labelCls = 'mb-1 block text-sm font-medium text-slate-700';

interface FormState {
  sku: string;
  barcode: string;
  name: string;
  description: string;
  categoryId: string;
  baseUnitId: string;
  taxRateId: string;
  salePrice: string;
  minStock: string;
}

function initialState(p?: ProductDetail): FormState {
  return {
    sku: p?.sku ?? '',
    barcode: p?.barcode ?? '',
    name: p?.name ?? '',
    description: p?.description ?? '',
    categoryId: p?.category?.id ?? '',
    baseUnitId: p?.baseUnit.id ?? '',
    taxRateId: p?.taxRate?.id ?? '',
    salePrice: decimalToInput(p?.salePrice) || '',
    minStock: decimalToInput(p?.minStock) || '0',
  };
}

export function ProductForm({
  product,
  readOnly = false,
  onSaved,
  onCancel,
}: {
  product?: ProductDetail;
  readOnly?: boolean;
  onSaved: (p: ProductDetail) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(product));
  const [options, setOptions] = useState<ProductFormOptions | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setForm(initialState(product)), [product]);

  useEffect(() => {
    api<ProductFormOptions>('/inventory/products/form-options')
      .then((o) => {
        setOptions(o);
        // Pre-select the only unit when creating (most companies start with PCS).
        if (!product && o.units.length === 1) {
          setForm((f) => (f.baseUnitId ? f : { ...f, baseUnitId: o.units[0].id }));
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [product]);

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body: ProductInput = {
      sku: form.sku,
      barcode: form.barcode || null,
      name: form.name,
      description: form.description || null,
      categoryId: form.categoryId || null,
      baseUnitId: form.baseUnitId,
      taxRateId: form.taxRateId || null,
      salePrice: Number(form.salePrice),
      minStock: Number(form.minStock || 0),
    };
    try {
      const saved = await api<ProductDetail>(
        product ? `/inventory/products/${product.id}` : '/inventory/products',
        { method: product ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Categories in the dropdown include the current one even if it was deactivated.
  const categories: CategoryDto[] = options?.categories ?? [];
  const currentCategory = product?.category;
  const categoryChoices =
    currentCategory && !categories.some((c) => c.id === currentCategory.id)
      ? [...categories, { ...currentCategory, parentId: null, isActive: false }]
      : categories;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset disabled={readOnly || saving} className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">General</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className={labelCls}>
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                required
                maxLength={200}
                value={form.name}
                onChange={set('name')}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="sku" className={labelCls}>
                SKU <span className="text-red-500">*</span>
              </label>
              <input
                id="sku"
                required
                maxLength={64}
                value={form.sku}
                onChange={set('sku')}
                className={`${inputCls} font-mono`}
                placeholder="e.g. COF-500"
              />
            </div>
            <div>
              <label htmlFor="barcode" className={labelCls}>
                Barcode
              </label>
              <input
                id="barcode"
                maxLength={64}
                value={form.barcode}
                onChange={set('barcode')}
                className={`${inputCls} font-mono`}
                placeholder="EAN / UPC"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="categoryId" className="text-sm font-medium text-slate-700">
                  Category
                </label>
                {!readOnly && (
                  <QuickCreate
                    label="category"
                    fields={[{ key: 'name', placeholder: 'Category name' }]}
                    create={(v) =>
                      api<CategoryDto>('/inventory/categories', {
                        method: 'POST',
                        body: JSON.stringify({ name: v.name }),
                      })
                    }
                    onCreated={(c) => {
                      setOptions((o) => o && { ...o, categories: [...o.categories, c] });
                      setForm((f) => ({ ...f, categoryId: c.id }));
                    }}
                  />
                )}
              </div>
              <select
                id="categoryId"
                value={form.categoryId}
                onChange={set('categoryId')}
                className={inputCls}
              >
                <option value="">— None —</option>
                {categoryChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.isActive ? '' : ' (inactive)'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="baseUnitId" className="text-sm font-medium text-slate-700">
                  Base unit <span className="text-red-500">*</span>
                </label>
                {!readOnly && (
                  <QuickCreate
                    label="unit"
                    fields={[
                      { key: 'code', placeholder: 'Code (CTN)', width: 'w-24' },
                      { key: 'name', placeholder: 'Name (Carton)' },
                    ]}
                    create={(v) =>
                      api<UnitDto>('/inventory/units', {
                        method: 'POST',
                        body: JSON.stringify({ code: v.code, name: v.name }),
                      })
                    }
                    onCreated={(u) => {
                      setOptions((o) => o && { ...o, units: [...o.units, u] });
                      setForm((f) => ({ ...f, baseUnitId: u.id }));
                    }}
                  />
                )}
              </div>
              <select
                id="baseUnitId"
                required
                value={form.baseUnitId}
                onChange={set('baseUnitId')}
                className={inputCls}
              >
                <option value="" disabled>
                  Select a unit…
                </option>
                {options?.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Stock is counted in this unit. It cannot change once stock has moved.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="description" className={labelCls}>
                Description
              </label>
              <textarea
                id="description"
                rows={3}
                maxLength={2000}
                value={form.description}
                onChange={set('description')}
                className={inputCls}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Pricing & stock</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="salePrice" className={labelCls}>
                Sale price <span className="text-red-500">*</span>
              </label>
              <input
                id="salePrice"
                type="number"
                required
                min={0}
                step="0.0001"
                inputMode="decimal"
                value={form.salePrice}
                onChange={set('salePrice')}
                className={`${inputCls} text-right tabular-nums`}
              />
              <p className="mt-1 text-xs text-slate-500">Excluding tax, per base unit.</p>
            </div>
            <div>
              <label htmlFor="taxRateId" className={labelCls}>
                Tax rate
              </label>
              <select
                id="taxRateId"
                value={form.taxRateId}
                onChange={set('taxRateId')}
                className={inputCls}
              >
                <option value="">— Company default —</option>
                {options?.taxRates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({Number(t.rate)}%)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="minStock" className={labelCls}>
                Minimum stock
              </label>
              <input
                id="minStock"
                type="number"
                min={0}
                step="0.0001"
                inputMode="decimal"
                value={form.minStock}
                onChange={set('minStock')}
                className={`${inputCls} text-right tabular-nums`}
              />
              <p className="mt-1 text-xs text-slate-500">Low-stock alert below this quantity.</p>
            </div>
          </div>
        </section>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {!readOnly && (
        <div className="flex justify-end gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={saving || !options}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {product ? 'Save changes' : 'Create product'}
          </button>
        </div>
      )}
    </form>
  );
}

/** Small inline "+ New …" control so users don't have to leave the product form. */
function QuickCreate<T>({
  label,
  fields,
  create,
  onCreated,
}: {
  label: string;
  fields: { key: string; placeholder: string; width?: string }[];
  create: (values: Record<string, string>) => Promise<T>;
  onCreated: (item: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setValues({});
    setError(null);
  };

  async function submit() {
    if (fields.some((f) => !values[f.key]?.trim())) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await create(values));
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:underline"
      >
        <Plus className="size-3" /> New {label}
      </button>
    );
  }

  return (
    <QuickCreatePanel
      fields={fields}
      values={values}
      setValues={setValues}
      busy={busy}
      error={error}
      submit={submit}
      close={close}
    />
  );
}

function QuickCreatePanel(props: {
  fields: { key: string; placeholder: string; width?: string }[];
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  busy: boolean;
  error: string | null;
  submit: () => void;
  close: () => void;
}) {
  const { fields, values, setValues, busy, error, submit, close } = props;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        {fields.map((f, i) => (
          <input
            key={f.key}
            autoFocus={i === 0}
            placeholder={f.placeholder}
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') close();
            }}
            className={`${f.width ?? 'flex-1'} rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:border-blue-500`}
          />
        ))}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          aria-label="Add"
          className="rounded bg-blue-600 p-1 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Cancel"
          className="rounded p-1 text-slate-500 hover:bg-slate-100"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
