'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ImagePlus, Lock, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  type CategoryDto,
  type ProductDetail,
  type ProductType,
  type TaxRateDto,
  type UnitDto,
} from '@erp/shared';
import { api, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Button,
  ConfirmDialog,
  ErrorBox,
  Field,
  PageLoader,
  inputClass,
  useToast,
} from '@/components/ui';
import { DECIMAL_RE, MarginText, ProductImage, normalizeDecimal } from './product-bits';

interface UnitRow {
  key: number;
  unitId: string;
  factor: string;
  barcode: string;
  forPurchase: boolean;
  forSale: boolean;
}

interface FormState {
  name: string;
  sku: string;
  barcode: string;
  type: ProductType;
  categoryId: string;
  description: string;
  salePrice: string;
  purchasePrice: string;
  taxRateId: string;
  baseUnitId: string;
  minStock: string;
  units: UnitRow[];
}

type Tab = 'general' | 'prices' | 'units' | 'stock';
const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'prices', label: 'Prices' },
  { key: 'units', label: 'Units' },
  { key: 'stock', label: 'Stock' },
];
const FIELD_TAB: Record<string, Tab> = {
  name: 'general',
  sku: 'general',
  barcode: 'general',
  description: 'general',
  salePrice: 'prices',
  purchasePrice: 'prices',
  baseUnitId: 'units',
  units: 'units',
  minStock: 'stock',
};

let rowKey = 1;

function fromProduct(p: ProductDetail | undefined, duplicate: boolean): FormState {
  return {
    name: p ? (duplicate ? `${p.name} (copy)` : p.name) : '',
    sku: p && !duplicate ? p.sku : '',
    barcode: p && !duplicate ? (p.barcode ?? '') : '',
    type: p?.type ?? 'STOCKABLE',
    categoryId: p?.categoryId ?? '',
    description: p?.description ?? '',
    salePrice: p ? p.salePrice : '',
    purchasePrice: p?.purchasePrice ?? '',
    taxRateId: p?.taxRateId ?? '',
    baseUnitId: p?.baseUnitId ?? '',
    minStock: p ? p.minStock : '',
    units: (p?.units ?? []).map((u) => ({
      key: rowKey++,
      unitId: u.unitId,
      factor: u.factor,
      barcode: duplicate ? '' : (u.barcode ?? ''),
      forPurchase: u.forPurchase,
      forSale: u.forSale,
    })),
  };
}

function validate(f: FormState, canSeeCost: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e.name = 'Name is required';
  if (!f.baseUnitId) e.baseUnitId = 'Choose the unit stock is counted in';
  const dec = (key: 'salePrice' | 'purchasePrice' | 'minStock', label: string) => {
    const v = normalizeDecimal(f[key]);
    if (v !== '' && !DECIMAL_RE.test(v))
      e[key] = `${label} must be a positive number (max 4 decimals)`;
  };
  dec('salePrice', 'Sale price');
  if (canSeeCost) dec('purchasePrice', 'Purchase price');
  dec('minStock', 'Minimum stock');

  const seen = new Set<string>();
  const codes = new Set<string>(f.barcode.trim() ? [f.barcode.trim()] : []);
  for (const u of f.units) {
    if (!u.unitId) e.units = 'Choose a unit on every extra-unit line';
    else if (u.unitId === f.baseUnitId) e.units = 'The base unit cannot also be an extra unit';
    else if (seen.has(u.unitId)) e.units = 'The same unit is listed twice';
    seen.add(u.unitId);
    const factor = normalizeDecimal(u.factor);
    if (!DECIMAL_RE.test(factor) || Number(factor) <= 0)
      e.units = 'Each extra unit needs a factor greater than 0';
    const code = u.barcode.trim();
    if (code && codes.has(code)) e.units = `Barcode ${code} is used twice on this product`;
    if (code) codes.add(code);
  }
  return e;
}

/**
 * Create / edit / duplicate form.
 *  - `product` + mode "edit": edits it (with concurrent-edit detection)
 *  - `product` + mode "duplicate": pre-fills a new product from it
 */
export function ProductForm({
  product,
  mode,
}: {
  product?: ProductDetail;
  mode: 'create' | 'edit' | 'duplicate';
}) {
  const router = useRouter();
  const toast = useToast();
  const { can } = useAuth();
  const canSeeCost = can('inventory.cost.view');
  const isEdit = mode === 'edit';

  const initial = useMemo(() => fromProduct(product, mode === 'duplicate'), [product, mode]);
  const [form, setForm] = useState<FormState>(initial);
  const [tab, setTab] = useState<Tab>('general');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<{ message: string; conflict: boolean } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const [lookups, setLookups] = useState<{
    categories: CategoryDto[];
    units: UnitDto[];
    taxRates: TaxRateDto[];
  } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Image: chosen locally, uploaded after the product is saved.
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || !!imageFile || removeImage;

  const loadLookups = () => {
    setLookupError(null);
    Promise.all([
      api<CategoryDto[]>('/inventory/categories'),
      api<UnitDto[]>('/inventory/units'),
      api<TaxRateDto[]>('/inventory/tax-rates'),
    ])
      .then(([categories, units, taxRates]) => {
        setLookups({ categories, units, taxRates });
        // New product: default to PCS (or the only unit) so the user has one less field to fill.
        if (!product && !form.baseUnitId) {
          const def =
            units.find((u) => u.code === 'PCS') ?? (units.length === 1 ? units[0] : undefined);
          if (def) setForm((f) => ({ ...f, baseUnitId: def.id }));
        }
      })
      .catch((e: Error) => setLookupError(e.message));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadLookups, []);

  // Warn before closing / reloading the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  useEffect(
    () => () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    },
    [imagePreview],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as string]) setErrors(({ [key as string]: _, ...rest }) => rest);
  };
  const setUnit = (key: number, patch: Partial<UnitRow>) => {
    setForm((f) => ({ ...f, units: f.units.map((u) => (u.key === key ? { ...u, ...patch } : u)) }));
    if (errors.units) setErrors(({ units: _, ...rest }) => rest);
  };

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      toast('Choose a PNG, JPEG, WebP or GIF image', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast('The image must be 2 MB or smaller', 'error');
      return;
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const margin = useMemo(() => {
    const sale = Number(normalizeDecimal(form.salePrice));
    const avg = Number(product?.averageCost ?? 0);
    const cost = avg > 0 ? avg : Number(normalizeDecimal(form.purchasePrice));
    if (!(sale > 0) || !(cost > 0)) return null;
    return (((sale - cost) / sale) * 100).toFixed(2);
  }, [form.salePrice, form.purchasePrice, product?.averageCost]);

  const save = async () => {
    const e = validate(form, canSeeCost);
    setErrors(e);
    setServerError(null);
    const firstBad = Object.keys(e)[0];
    if (firstBad) {
      setTab(FIELD_TAB[firstBad] ?? 'general');
      return;
    }

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      type: form.type,
      categoryId: form.categoryId || null,
      description: form.description.trim() || null,
      salePrice: normalizeDecimal(form.salePrice) || '0',
      taxRateId: form.taxRateId || null,
      baseUnitId: form.baseUnitId,
      minStock: normalizeDecimal(form.minStock) || '0',
      units: form.units.map((u) => ({
        unitId: u.unitId,
        factor: normalizeDecimal(u.factor),
        barcode: u.barcode.trim() || null,
        forPurchase: u.forPurchase,
        forSale: u.forSale,
      })),
    };
    if (canSeeCost) body.purchasePrice = normalizeDecimal(form.purchasePrice) || '0';
    if (isEdit) {
      body.expectedUpdatedAt = product!.updatedAt;
      if (!body.sku) delete body.sku; // the SKU of an existing product cannot be cleared
    }

    setSaving(true);
    try {
      const saved = await api<ProductDetail>(
        isEdit ? `/inventory/products/${product!.id}` : '/inventory/products',
        {
          method: isEdit ? 'PATCH' : 'POST',
          body: JSON.stringify(body),
        },
      );
      // The product is saved; an image problem must not lose it.
      try {
        if (imageFile) {
          const fd = new FormData();
          fd.append('file', imageFile);
          await api(`/inventory/products/${saved.id}/image`, { method: 'POST', body: fd });
        } else if (removeImage) {
          await api(`/inventory/products/${saved.id}/image`, { method: 'DELETE' });
        }
      } catch (err) {
        toast(`Product saved, but the image was not: ${(err as Error).message}`, 'warning');
      }
      toast(isEdit ? `${saved.name} updated` : `${saved.name} created (${saved.sku})`);
      router.push(`/inventory/products/${saved.id}`);
    } catch (err) {
      const status = err instanceof ApiRequestError ? err.status : 0;
      setServerError({
        message: (err as Error).message,
        conflict: status === 409 && /changed by someone/.test((err as Error).message),
      });
      setSaving(false);
    }
  };

  const cancel = () => {
    if (dirty) setConfirmLeave(true);
    else router.back();
  };

  if (lookupError) return <ErrorBox message={lookupError} onRetry={loadLookups} />;
  if (!lookups) return <PageLoader />;

  const tabHasError = (t: Tab) => Object.keys(errors).some((k) => FIELD_TAB[k] === t);
  const baseUnitLocked = isEdit && !!product?.isUsed;
  const unitOptions = lookups.units;

  return (
    <div className="space-y-4">
      {serverError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <span className="flex-1">{serverError.message}</span>
          {serverError.conflict && (
            <Button size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="size-3.5" /> Reload latest version
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2" role="tablist">
            {TABS.filter((t) => t.key !== 'stock' || form.type === 'STOCKABLE').map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={clsx(
                  'relative -mb-px border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap',
                  tab === t.key
                    ? 'border-mod-inventory text-mod-inventory'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
              >
                {t.label}
                {tabHasError(t.key) && (
                  <span className="absolute top-2 right-0.5 size-1.5 rounded-full bg-red-500" />
                )}
              </button>
            ))}
          </div>

          <div className="space-y-4 p-4">
            {tab === 'general' && (
              <>
                <Field label="Name" htmlFor="name" required error={errors.name}>
                  <input
                    id="name"
                    className={inputClass}
                    value={form.name}
                    maxLength={200}
                    autoFocus
                    aria-invalid={!!errors.name}
                    onChange={(e) => set('name', e.target.value)}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="SKU (product code)"
                    htmlFor="sku"
                    hint={isEdit ? 'Must stay unique' : 'Leave empty to generate one (PRD-00001…)'}
                  >
                    <input
                      id="sku"
                      className={inputClass}
                      value={form.sku}
                      maxLength={64}
                      placeholder={isEdit ? '' : 'Automatic'}
                      onChange={(e) => set('sku', e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Barcode"
                    htmlFor="barcode"
                    hint="EAN / UPC — you can scan it into this field"
                  >
                    <input
                      id="barcode"
                      className={inputClass}
                      value={form.barcode}
                      maxLength={64}
                      onChange={(e) => set('barcode', e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Type"
                    htmlFor="type"
                    hint={
                      form.type === 'STOCKABLE'
                        ? 'Stock is tracked per warehouse'
                        : 'No stock is tracked for this type'
                    }
                  >
                    <select
                      id="type"
                      className={inputClass}
                      value={form.type}
                      onChange={(e) => set('type', e.target.value as ProductType)}
                    >
                      {PRODUCT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {PRODUCT_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Category"
                    htmlFor="category"
                    hint={
                      <Link
                        href="/inventory/products/categories"
                        className="text-mod-inventory hover:underline"
                      >
                        Manage categories
                      </Link>
                    }
                  >
                    <select
                      id="category"
                      className={inputClass}
                      value={form.categoryId}
                      onChange={(e) => set('categoryId', e.target.value)}
                    >
                      <option value="">— No category —</option>
                      {lookups.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.path}
                        </option>
                      ))}
                      {product?.categoryId &&
                        !lookups.categories.some((c) => c.id === product.categoryId) && (
                          <option value={product.categoryId}>
                            {product.categoryName} (inactive)
                          </option>
                        )}
                    </select>
                  </Field>
                </div>
                <Field label="Description" htmlFor="description">
                  <textarea
                    id="description"
                    rows={4}
                    className={inputClass}
                    value={form.description}
                    maxLength={5000}
                    onChange={(e) => set('description', e.target.value)}
                  />
                </Field>
              </>
            )}

            {tab === 'prices' && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Sale price"
                    htmlFor="salePrice"
                    error={errors.salePrice}
                    hint="Per base unit, before tax"
                  >
                    <input
                      id="salePrice"
                      inputMode="decimal"
                      className={inputClass}
                      value={form.salePrice}
                      placeholder="0.00"
                      aria-invalid={!!errors.salePrice}
                      onChange={(e) => set('salePrice', e.target.value)}
                    />
                  </Field>
                  <Field label="Tax rate" htmlFor="taxRate">
                    <select
                      id="taxRate"
                      className={inputClass}
                      value={form.taxRateId}
                      onChange={(e) => set('taxRateId', e.target.value)}
                    >
                      <option value="">— Company default —</option>
                      {lookups.taxRates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.rate}%)
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {canSeeCost ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Purchase price"
                      htmlFor="purchasePrice"
                      error={errors.purchasePrice}
                      hint="Default buying price per base unit"
                    >
                      <input
                        id="purchasePrice"
                        inputMode="decimal"
                        className={inputClass}
                        value={form.purchasePrice}
                        placeholder="0.00"
                        aria-invalid={!!errors.purchasePrice}
                        onChange={(e) => set('purchasePrice', e.target.value)}
                      />
                    </Field>
                    <div>
                      <p className="mb-1 text-sm font-medium text-slate-700">Margin</p>
                      <p className="py-2 text-lg font-semibold">
                        <MarginText value={margin} />
                      </p>
                      <p className="text-xs text-slate-500">
                        {Number(product?.averageCost ?? 0) > 0
                          ? `Based on the average cost (${product!.averageCost})`
                          : 'Based on the purchase price until goods are received'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-xs text-slate-500">
                    <Lock className="size-3.5" /> Purchase price and margin are hidden (needs
                    inventory.cost.view).
                  </p>
                )}
                {margin !== null && Number(margin) < 0 && (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Warning: the sale price is below cost.
                  </p>
                )}
              </>
            )}

            {tab === 'units' && (
              <>
                <Field
                  label="Base unit"
                  htmlFor="baseUnit"
                  required
                  error={errors.baseUnitId}
                  hint={
                    baseUnitLocked
                      ? 'Locked: this product already has stock movements or documents. Add other units below instead.'
                      : 'Stock is always counted in this unit'
                  }
                >
                  <select
                    id="baseUnit"
                    className={inputClass}
                    value={form.baseUnitId}
                    disabled={baseUnitLocked}
                    aria-invalid={!!errors.baseUnitId}
                    onChange={(e) => set('baseUnitId', e.target.value)}
                  >
                    <option value="">— Choose —</option>
                    {unitOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} — {u.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Extra units</p>
                      <p className="text-xs text-slate-500">
                        e.g. 1 Carton = 24 Pieces. Each can have its own barcode.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          units: [
                            ...f.units,
                            {
                              key: rowKey++,
                              unitId: '',
                              factor: '',
                              barcode: '',
                              forPurchase: true,
                              forSale: true,
                            },
                          ],
                        }))
                      }
                    >
                      <Plus className="size-3.5" /> Add unit
                    </Button>
                  </div>
                  {errors.units && <p className="mb-2 text-xs text-red-600">{errors.units}</p>}
                  {form.units.length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                      Only the base unit is used.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[36rem] text-sm">
                        <thead className="text-left text-xs text-slate-500">
                          <tr>
                            <th className="pb-1 font-medium">Unit</th>
                            <th className="pb-1 font-medium">= base units</th>
                            <th className="pb-1 font-medium">Barcode</th>
                            <th className="pb-1 text-center font-medium">Buy</th>
                            <th className="pb-1 text-center font-medium">Sell</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {form.units.map((u) => (
                            <tr key={u.key}>
                              <td className="py-1 pr-2">
                                <select
                                  className={inputClass}
                                  value={u.unitId}
                                  aria-label="Unit"
                                  onChange={(e) => setUnit(u.key, { unitId: e.target.value })}
                                >
                                  <option value="">— Choose —</option>
                                  {unitOptions
                                    .filter((o) => o.id !== form.baseUnitId)
                                    .map((o) => (
                                      <option key={o.id} value={o.id}>
                                        {o.code} — {o.name}
                                      </option>
                                    ))}
                                </select>
                              </td>
                              <td className="py-1 pr-2">
                                <input
                                  className={clsx(inputClass, 'w-28')}
                                  inputMode="decimal"
                                  value={u.factor}
                                  placeholder="24"
                                  aria-label="Factor"
                                  onChange={(e) => setUnit(u.key, { factor: e.target.value })}
                                />
                              </td>
                              <td className="py-1 pr-2">
                                <input
                                  className={inputClass}
                                  value={u.barcode}
                                  aria-label="Unit barcode"
                                  maxLength={64}
                                  onChange={(e) => setUnit(u.key, { barcode: e.target.value })}
                                />
                              </td>
                              <td className="py-1 text-center">
                                <input
                                  type="checkbox"
                                  checked={u.forPurchase}
                                  aria-label="Use for purchase"
                                  onChange={(e) =>
                                    setUnit(u.key, { forPurchase: e.target.checked })
                                  }
                                />
                              </td>
                              <td className="py-1 text-center">
                                <input
                                  type="checkbox"
                                  checked={u.forSale}
                                  aria-label="Use for sale"
                                  onChange={(e) => setUnit(u.key, { forSale: e.target.checked })}
                                />
                              </td>
                              <td className="py-1 pl-1">
                                <button
                                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                  aria-label="Remove unit"
                                  onClick={() =>
                                    setForm((f) => ({
                                      ...f,
                                      units: f.units.filter((x) => x.key !== u.key),
                                    }))
                                  }
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    Missing a unit?{' '}
                    <Link
                      href="/inventory/products/categories#units"
                      className="text-mod-inventory hover:underline"
                    >
                      Create it here
                    </Link>
                    .
                  </p>
                </div>
              </>
            )}

            {tab === 'stock' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Minimum stock (alert level)"
                  htmlFor="minStock"
                  error={errors.minStock}
                  hint="The product shows as “Low” at or below this quantity. 0 = no alert."
                >
                  <input
                    id="minStock"
                    inputMode="decimal"
                    className={inputClass}
                    value={form.minStock}
                    placeholder="0"
                    aria-invalid={!!errors.minStock}
                    onChange={(e) => set('minStock', e.target.value)}
                  />
                </Field>
                <p className="self-center text-xs text-slate-500">
                  Stock quantities are not typed here: they change through goods receipts,
                  deliveries, adjustments and transfers, so every change stays traceable.
                </p>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Picture</p>
            <div className="flex flex-col items-center gap-3">
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreview}
                  alt=""
                  className="size-48 rounded-xl border border-slate-200 object-contain"
                />
              ) : (
                <ProductImage
                  productId={product?.id ?? 'none'}
                  hasImage={!!product?.hasImage && !removeImage && mode === 'edit'}
                  size="lg"
                />
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  pickImage(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => fileInput.current?.click()}>
                  <ImagePlus className="size-3.5" />{' '}
                  {imagePreview || (product?.hasImage && !removeImage && isEdit) ? 'Change' : 'Add'}
                </Button>
                {(imagePreview || (product?.hasImage && !removeImage && isEdit)) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                      setRemoveImage(isEdit && !!product?.hasImage);
                    }}
                  >
                    <Trash2 className="size-3.5" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-center text-xs text-slate-400">
                PNG, JPEG, WebP or GIF · max 2 MB
              </p>
            </div>
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <Button onClick={cancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} loading={saving}>
          {isEdit ? 'Save changes' : 'Create product'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Discard changes?"
        confirmLabel="Discard"
        danger
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => router.back()}
      >
        You have unsaved changes. If you leave now they will be lost.
      </ConfirmDialog>
    </div>
  );
}
