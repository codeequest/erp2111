'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Save } from 'lucide-react';
import type { ProductDetail, ProductInput, ProductLookups } from '@erp/shared';
import { api } from '@/lib/api';
import { ErrorBox, btnPrimary, btnSecondary, inputClass } from './ui';

interface Props {
  /** Omit to create a new product. */
  product?: ProductDetail;
  onSaved: (product: ProductDetail) => void;
  cancelHref: string;
}

const DECIMAL = /^\d{1,14}(\.\d{1,4})?$/;

type FormState = Record<keyof ProductInput, string>;

function initialState(p?: ProductDetail): FormState {
  return {
    sku: p?.sku ?? '',
    barcode: p?.barcode ?? '',
    name: p?.name ?? '',
    description: p?.description ?? '',
    categoryId: p?.category?.id ?? '',
    baseUnitId: p?.baseUnit.id ?? '',
    taxRateId: p?.taxRate?.id ?? '',
    salePrice: p?.salePrice ?? '',
    minStock: p?.minStock ?? '0',
  };
}

export function ProductForm({ product, onSaved, cancelHref }: Props) {
  const [form, setForm] = useState<FormState>(() => initialState(product));
  const [lookups, setLookups] = useState<ProductLookups | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof ProductInput, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<ProductLookups>('/inventory/products/lookups')
      .then((l) => {
        setLookups(l);
        // Pre-select the only unit when creating (usually PCS).
        if (!product && l.units.length === 1) {
          setForm((f) => (f.baseUnitId ? f : { ...f, baseUnitId: l.units[0].id }));
        }
      })
      .catch((e: Error) => setServerError(`Could not load form choices: ${e.message}`));
  }, [product]);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.sku.trim()) e.sku = 'SKU is required';
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.baseUnitId) e.baseUnitId = 'Choose a unit';
    if (!DECIMAL.test(form.salePrice.trim())) e.salePrice = 'Enter a price, e.g. 12.50';
    if (!DECIMAL.test(form.minStock.trim())) e.minStock = 'Enter a quantity, e.g. 10';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    if (!validate()) return;

    // Empty strings clear optional fields (the API turns them into null).
    const body: ProductInput = {
      sku: form.sku.trim(),
      barcode: form.barcode.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      categoryId: form.categoryId,
      baseUnitId: form.baseUnitId,
      taxRateId: form.taxRateId,
      salePrice: form.salePrice.trim(),
      minStock: form.minStock.trim(),
    };

    setSaving(true);
    try {
      const saved = await api<ProductDetail>(
        product ? `/inventory/products/${product.id}` : '/inventory/products',
        { method: product ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );
      onSaved(saved);
    } catch (e) {
      setServerError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {serverError && <ErrorBox message={serverError} />}

      <Section title="Identification">
        <Field label="SKU" required error={errors.sku} htmlFor="sku">
          <input
            id="sku"
            value={form.sku}
            onChange={(e) => set('sku', e.target.value)}
            className={`${inputClass} font-mono`}
            maxLength={64}
            autoFocus={!product}
          />
        </Field>
        <Field
          label="Barcode"
          error={errors.barcode}
          htmlFor="barcode"
          hint="Optional, must be unique"
        >
          <input
            id="barcode"
            value={form.barcode}
            onChange={(e) => set('barcode', e.target.value)}
            className={`${inputClass} font-mono`}
            maxLength={64}
          />
        </Field>
        <Field label="Name" required error={errors.name} htmlFor="name" wide>
          <input
            id="name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className={inputClass}
            maxLength={200}
          />
        </Field>
        <Field label="Description" htmlFor="description" wide>
          <textarea
            id="description"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            className={inputClass}
            rows={3}
            maxLength={2000}
          />
        </Field>
      </Section>

      <Section title="Classification">
        <Field label="Category" htmlFor="categoryId" hint={noneHint(lookups?.categories.length)}>
          <select
            id="categoryId"
            value={form.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
            className={inputClass}
          >
            <option value="">No category</option>
            {lookups?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.path}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Base unit"
          required
          error={errors.baseUnitId}
          htmlFor="baseUnitId"
          hint="Stock is counted in this unit"
        >
          <select
            id="baseUnitId"
            value={form.baseUnitId}
            onChange={(e) => set('baseUnitId', e.target.value)}
            className={inputClass}
          >
            <option value="">Choose…</option>
            {lookups?.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} — {u.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Pricing and stock">
        <Field label="Sale price" required error={errors.salePrice} htmlFor="salePrice">
          <input
            id="salePrice"
            inputMode="decimal"
            value={form.salePrice}
            onChange={(e) => set('salePrice', e.target.value)}
            className={`${inputClass} tabular-nums`}
            placeholder="0.00"
          />
        </Field>
        <Field label="Tax rate" htmlFor="taxRateId" hint={noneHint(lookups?.taxRates.length)}>
          <select
            id="taxRateId"
            value={form.taxRateId}
            onChange={(e) => set('taxRateId', e.target.value)}
            className={inputClass}
          >
            <option value="">Company default</option>
            {lookups?.taxRates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.rate}%)
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Minimum stock"
          error={errors.minStock}
          htmlFor="minStock"
          hint="Low-stock alert below this quantity (0 = off)"
        >
          <input
            id="minStock"
            inputMode="decimal"
            value={form.minStock}
            onChange={(e) => set('minStock', e.target.value)}
            className={`${inputClass} tabular-nums`}
          />
        </Field>
      </Section>

      <div className="flex justify-end gap-2">
        <Link href={cancelHref} className={btnSecondary}>
          Cancel
        </Link>
        <button type="submit" disabled={saving || !lookups} className={btnPrimary}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {product ? 'Save changes' : 'Create product'}
        </button>
      </div>
    </form>
  );
}

function noneHint(count: number | undefined) {
  return count === 0 ? 'None defined yet' : undefined;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-5">
      <legend className="px-1 text-sm font-semibold text-slate-900">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  wide,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}
