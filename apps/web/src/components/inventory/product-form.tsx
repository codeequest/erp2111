'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ImagePlus, Loader2, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  inventoryApi,
  money,
  type ProductDetail,
  type ProductFormOptions,
  type ProductInput,
} from '@/lib/inventory';
import { Card, ErrorNotice, Field, Modal, ProductThumb, btn, inputCls } from './ui';

interface FormState {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  categoryId: string;
  baseUnitId: string;
  taxRateId: string;
  purchasePrice: string;
  salePrice: string;
  minStock: string;
  initialStock: string;
  warehouseId: string;
}

type Errors = Partial<Record<keyof FormState | 'image', string>>;

const MAX_IMAGE = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function fromProduct(p: ProductDetail | null, opts: ProductFormOptions): FormState {
  const pcs = opts.units.find((u) => u.code === 'PCS') ?? opts.units[0];
  return {
    name: p?.name ?? '',
    sku: p?.sku ?? '',
    barcode: p?.barcode ?? '',
    description: p?.description ?? '',
    categoryId: p?.category?.id ?? '',
    baseUnitId: p?.baseUnit.id ?? pcs?.id ?? '',
    taxRateId: p?.taxRate?.id ?? '',
    purchasePrice: p?.purchasePrice ? String(Number(p.purchasePrice)) : '',
    salePrice: p ? String(Number(p.salePrice)) : '',
    minStock: p ? String(Number(p.minStock)) : '',
    initialStock: '',
    warehouseId: opts.warehouses[0]?.id ?? '',
  };
}

/** Suggests a SKU from the name: "Olive oil 1L" → "OLIVE-OIL-1L". */
function suggestSku(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));

export function ProductForm({
  product,
  options,
  onOptionsChange,
  onSaved,
}: {
  product: ProductDetail | null;
  options: ProductFormOptions;
  onOptionsChange: (o: ProductFormOptions) => void;
  /** Called with the fresh product after an update or an image change. */
  onSaved?: (p: ProductDetail) => void;
}) {
  const router = useRouter();
  const { can } = useAuth();
  const isNew = !product;
  const canWrite = can('inventory.product.write');
  const canSeeCost = can('inventory.cost.view');
  const canOpenStock = can('inventory.stock.adjust') && options.warehouses.length > 0;
  const canManageVat = can('admin.settings.manage');

  const [form, setForm] = useState<FormState>(() => fromProduct(product, options));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(product?.imageUrl ?? null);
  const [imageBusy, setImageBusy] = useState(false);
  const [modal, setModal] = useState<'category' | 'vat' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(fromProduct(product, options));
    setImagePreview(product?.imageUrl ?? null);
    // Only when another product is loaded, not on every options change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setSaved(false);
  };

  // Live price preview
  const preview = useMemo(() => {
    const sale = num(form.salePrice) ?? 0;
    const cost = num(form.purchasePrice) ?? 0;
    const rate = Number(options.taxRates.find((t) => t.id === form.taxRateId)?.rate ?? 0);
    const incl = Math.round(sale * (1 + rate / 100) * 10000) / 10000;
    const margin = sale > 0 && cost > 0 ? ((sale - cost) / sale) * 100 : null;
    return { incl, margin, vat: incl - sale };
  }, [form.salePrice, form.purchasePrice, form.taxRateId, options.taxRates]);

  const validate = (): Errors => {
    const e: Errors = {};
    if (!form.name.trim()) e.name = 'Enter the product name';
    if (!form.sku.trim()) e.sku = 'Enter a SKU';
    else if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,63}$/.test(form.sku.trim()))
      e.sku = 'Letters, digits, ".", "_", "-" and "/" only — no spaces';
    if (form.barcode.trim() && !/^[0-9A-Za-z-]{4,64}$/.test(form.barcode.trim()))
      e.barcode = '4 to 64 letters or digits';
    for (const k of ['purchasePrice', 'salePrice', 'minStock', 'initialStock'] as const) {
      const v = num(form[k]);
      if (v !== undefined && (Number.isNaN(v) || v < 0)) e[k] = 'Enter a positive number';
    }
    if (num(form.initialStock) && !form.warehouseId) e.warehouseId = 'Pick a warehouse';
    return e;
  };

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setErrors((e) => ({ ...e, image: 'Use a JPEG, PNG, WebP or GIF image' }));
      return;
    }
    if (file.size > MAX_IMAGE) {
      setErrors((e) => ({ ...e, image: 'The image must be 2 MB or less' }));
      return;
    }
    setErrors((e) => ({ ...e, image: undefined }));
    if (isNew) setImageFile(file);
    else void uploadNow(file);
  };

  const uploadNow = async (file: File) => {
    if (!product) return;
    setImageBusy(true);
    try {
      const updated = await inventoryApi.uploadImage(product.id, file);
      setImagePreview(updated.imageUrl);
      onSaved?.(updated);
    } catch (err) {
      setErrors((e) => ({ ...e, image: (err as Error).message }));
    } finally {
      setImageBusy(false);
    }
  };

  const removeImage = async () => {
    if (isNew) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    setImageBusy(true);
    try {
      const updated = await inventoryApi.removeImage(product.id);
      setImagePreview(null);
      onSaved?.(updated);
    } catch (err) {
      setErrors((e) => ({ ...e, image: (err as Error).message }));
    } finally {
      setImageBusy(false);
    }
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;

    const body: ProductInput = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      barcode: form.barcode.trim() || null,
      description: form.description.trim() || null,
      categoryId: form.categoryId || null,
      baseUnitId: form.baseUnitId || undefined,
      taxRateId: form.taxRateId || null,
      salePrice: num(form.salePrice) ?? 0,
      minStock: num(form.minStock) ?? 0,
    };
    if (canSeeCost) body.purchasePrice = num(form.purchasePrice) ?? 0;
    if (isNew && canOpenStock && num(form.initialStock)) {
      body.initialStock = num(form.initialStock);
      body.warehouseId = form.warehouseId;
    }

    setSaving(true);
    try {
      const result = isNew
        ? await inventoryApi.createProduct(body)
        : await inventoryApi.updateProduct(product.id, body);
      if (isNew && imageFile) {
        await inventoryApi.uploadImage(result.id, imageFile).catch(() => undefined);
      }
      if (isNew) {
        router.replace(`/inventory/products/${result.id}?created=1`);
      } else {
        setSaved(true);
        onSaved?.(result);
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (err instanceof ApiRequestError && err.status === 409) {
        if (/sku/i.test(msg)) setErrors({ sku: msg });
        else if (/barcode/i.test(msg)) setErrors({ barcode: msg });
        else setFormError(msg);
      } else setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canWrite || saving;

  return (
    <>
      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {formError && <ErrorNotice message={formError} onClose={() => setFormError(null)} />}

          <Card title="General" description="How the product is named and identified">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Product name"
                htmlFor="name"
                required
                error={errors.name}
                className="sm:col-span-2"
              >
                <input
                  id="name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  disabled={disabled}
                  aria-invalid={!!errors.name}
                  maxLength={200}
                  className={inputCls}
                  placeholder="e.g. Olive oil extra virgin 1L"
                  autoFocus={isNew}
                />
              </Field>
              <Field
                label="SKU"
                htmlFor="sku"
                required
                error={errors.sku}
                hint="Your internal unique code"
              >
                <div className="flex gap-2">
                  <input
                    id="sku"
                    value={form.sku}
                    onChange={(e) => set('sku', e.target.value.toUpperCase())}
                    disabled={disabled}
                    aria-invalid={!!errors.sku}
                    maxLength={64}
                    className={clsx(inputCls, 'font-mono')}
                    placeholder="OIL-EV-1L"
                  />
                  {canWrite && (
                    <button
                      type="button"
                      className={btn.secondary}
                      onClick={() => set('sku', suggestSku(form.name))}
                      disabled={!form.name.trim() || disabled}
                      title="Generate from the name"
                      aria-label="Generate SKU from the name"
                    >
                      <Wand2 className="size-4" />
                    </button>
                  )}
                </div>
              </Field>
              <Field
                label="Barcode"
                htmlFor="barcode"
                error={errors.barcode}
                hint="EAN / UPC — scan it or type it"
              >
                <input
                  id="barcode"
                  value={form.barcode}
                  onChange={(e) => set('barcode', e.target.value)}
                  disabled={disabled}
                  aria-invalid={!!errors.barcode}
                  inputMode="numeric"
                  maxLength={64}
                  className={clsx(inputCls, 'font-mono')}
                  placeholder="6191234567890"
                />
              </Field>
              <Field label="Description" htmlFor="description" className="sm:col-span-2">
                <textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  disabled={disabled}
                  rows={3}
                  maxLength={5000}
                  className={inputCls}
                  placeholder="Size, packaging, supplier reference…"
                />
              </Field>
            </div>
          </Card>

          <Card title="Pricing & VAT" description="Prices are stored excluding VAT">
            <div className="grid gap-4 sm:grid-cols-3">
              {canSeeCost && (
                <Field
                  label="Purchase price"
                  htmlFor="purchasePrice"
                  error={errors.purchasePrice}
                  hint="Excl. VAT"
                >
                  <input
                    id="purchasePrice"
                    value={form.purchasePrice}
                    onChange={(e) => set('purchasePrice', e.target.value)}
                    disabled={disabled}
                    aria-invalid={!!errors.purchasePrice}
                    inputMode="decimal"
                    className={clsx(inputCls, 'text-right tabular-nums')}
                    placeholder="0.00"
                  />
                </Field>
              )}
              <Field
                label="Selling price"
                htmlFor="salePrice"
                error={errors.salePrice}
                hint="Excl. VAT"
              >
                <input
                  id="salePrice"
                  value={form.salePrice}
                  onChange={(e) => set('salePrice', e.target.value)}
                  disabled={disabled}
                  aria-invalid={!!errors.salePrice}
                  inputMode="decimal"
                  className={clsx(inputCls, 'text-right tabular-nums')}
                  placeholder="0.00"
                />
              </Field>
              <Field label="VAT rate" htmlFor="taxRateId">
                <div className="flex gap-2">
                  <select
                    id="taxRateId"
                    value={form.taxRateId}
                    onChange={(e) => set('taxRateId', e.target.value)}
                    disabled={disabled}
                    className={inputCls}
                  >
                    <option value="">No VAT</option>
                    {options.taxRates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({Number(t.rate)}%)
                      </option>
                    ))}
                  </select>
                  {canManageVat && canWrite && (
                    <button
                      type="button"
                      className={btn.secondary}
                      onClick={() => setModal('vat')}
                      title="New VAT rate"
                      aria-label="New VAT rate"
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
                </div>
              </Field>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">VAT amount</dt>
                <dd className="font-medium tabular-nums text-slate-900">
                  {money(String(preview.vat))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Price incl. VAT</dt>
                <dd className="font-semibold tabular-nums text-slate-900">
                  {money(String(preview.incl))}
                </dd>
              </div>
              {canSeeCost && (
                <div>
                  <dt className="text-xs text-slate-500">Gross margin</dt>
                  <dd
                    className={clsx(
                      'font-medium tabular-nums',
                      preview.margin !== null && preview.margin < 0
                        ? 'text-red-600'
                        : 'text-slate-900',
                    )}
                  >
                    {preview.margin === null ? '—' : `${preview.margin.toFixed(1)}%`}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card title="Stock" description="Stock is always counted in the base unit">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Base unit"
                htmlFor="baseUnitId"
                hint={!isNew ? 'Locked once stock has moved' : undefined}
              >
                <select
                  id="baseUnitId"
                  value={form.baseUnitId}
                  onChange={(e) => set('baseUnitId', e.target.value)}
                  disabled={disabled || (!isNew && (product?.recentMoves.length ?? 0) > 0)}
                  className={inputCls}
                >
                  {options.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} — {u.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Minimum stock"
                htmlFor="minStock"
                error={errors.minStock}
                hint="Alert when stock falls to this level"
              >
                <input
                  id="minStock"
                  value={form.minStock}
                  onChange={(e) => set('minStock', e.target.value)}
                  disabled={disabled}
                  aria-invalid={!!errors.minStock}
                  inputMode="decimal"
                  className={clsx(inputCls, 'text-right tabular-nums')}
                  placeholder="0"
                />
              </Field>
              {isNew && canOpenStock && (
                <>
                  <Field
                    label="Opening stock"
                    htmlFor="initialStock"
                    error={errors.initialStock}
                    hint="Recorded as an opening stock move"
                  >
                    <input
                      id="initialStock"
                      value={form.initialStock}
                      onChange={(e) => set('initialStock', e.target.value)}
                      disabled={disabled}
                      aria-invalid={!!errors.initialStock}
                      inputMode="decimal"
                      className={clsx(inputCls, 'text-right tabular-nums')}
                      placeholder="0"
                    />
                  </Field>
                  {num(form.initialStock) ? (
                    <Field label="Warehouse" htmlFor="warehouseId" error={errors.warehouseId}>
                      <select
                        id="warehouseId"
                        value={form.warehouseId}
                        onChange={(e) => set('warehouseId', e.target.value)}
                        disabled={disabled}
                        className={inputCls}
                      >
                        {options.warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code} — {w.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                </>
              )}
            </div>
            {!isNew && (
              <p className="mt-3 text-xs text-slate-500">
                To change the quantity on hand, post a{' '}
                <Link
                  href="/inventory/adjustments"
                  className="font-medium text-emerald-700 hover:underline"
                >
                  stock adjustment
                </Link>
                .
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Image">
            <div
              onDragOver={(e) => canWrite && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (canWrite) pickImage(e.dataTransfer.files[0]);
              }}
              className="relative"
            >
              <ProductThumb src={imagePreview} alt={form.name || 'Product image'} size="lg" />
              {imageBusy && (
                <div className="absolute inset-0 grid place-items-center rounded-lg bg-white/70">
                  <Loader2 className="size-6 animate-spin text-slate-500" />
                </div>
              )}
            </div>
            {errors.image && <p className="mt-2 text-xs text-red-600">{errors.image}</p>}
            {canWrite && (
              <div className="mt-3 flex gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept={IMAGE_TYPES.join(',')}
                  className="hidden"
                  onChange={(e) => {
                    pickImage(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className={clsx(btn.secondary, 'flex-1')}
                  onClick={() => fileRef.current?.click()}
                  disabled={imageBusy}
                >
                  <ImagePlus className="size-4" /> {imagePreview ? 'Replace' : 'Upload'}
                </button>
                {imagePreview && (
                  <button
                    type="button"
                    className={btn.danger}
                    onClick={removeImage}
                    disabled={imageBusy}
                    aria-label="Remove image"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">
              JPEG, PNG, WebP or GIF · max 2 MB · drag & drop works
            </p>
          </Card>

          <Card title="Classification">
            <Field label="Category" htmlFor="categoryId" hint="Subcategories are indented">
              <div className="flex gap-2">
                <select
                  id="categoryId"
                  value={form.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                  disabled={disabled}
                  className={inputCls}
                >
                  <option value="">Uncategorised</option>
                  {options.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {'   '.repeat(c.depth)}
                      {c.depth > 0 ? '└ ' : ''}
                      {c.name}
                    </option>
                  ))}
                </select>
                {canWrite && (
                  <button
                    type="button"
                    className={btn.secondary}
                    onClick={() => setModal('category')}
                    title="New category"
                    aria-label="New category"
                  >
                    <Plus className="size-4" />
                  </button>
                )}
              </div>
            </Field>
          </Card>

          {canWrite && (
            <div className="sticky bottom-4 flex gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
              <Link href="/inventory/products" className={clsx(btn.secondary, 'flex-1')}>
                Cancel
              </Link>
              <button type="submit" className={clsx(btn.primary, 'flex-1')} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {isNew ? 'Create product' : saved ? 'Saved' : 'Save changes'}
              </button>
            </div>
          )}
        </div>
      </form>

      <QuickCategoryModal
        open={modal === 'category'}
        onClose={() => setModal(null)}
        options={options}
        onCreated={async (id) => {
          const categories = await inventoryApi.listCategories();
          onOptionsChange({ ...options, categories });
          set('categoryId', id);
        }}
      />
      <QuickVatModal
        open={modal === 'vat'}
        onClose={() => setModal(null)}
        onCreated={(rate) => {
          onOptionsChange({
            ...options,
            taxRates: [...options.taxRates, rate].sort((a, b) => Number(a.rate) - Number(b.rate)),
          });
          set('taxRateId', rate.id);
        }}
      />
    </>
  );
}

function QuickCategoryModal({
  open,
  onClose,
  options,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  options: ProductFormOptions;
  onCreated: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName('');
      setParentId('');
      setError(null);
    }
  }, [open]);

  const save = async () => {
    if (!name.trim()) return setError('Enter a name');
    setBusy(true);
    try {
      const c = await inventoryApi.createCategory({
        name: name.trim(),
        parentId: parentId || null,
      });
      await onCreated(c.id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New category" open={open} onClose={onClose}>
      <div className="space-y-4">
        {error && <ErrorNotice message={error} />}
        <Field label="Name" htmlFor="qc-name" required>
          <input
            id="qc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            maxLength={100}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void save();
              }
            }}
          />
        </Field>
        <Field label="Parent category" htmlFor="qc-parent" hint="Leave empty for a main category">
          <select
            id="qc-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={inputCls}
          >
            <option value="">— None (main category) —</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.path}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btn.primary} onClick={save} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Create
          </button>
        </div>
      </div>
    </Modal>
  );
}

function QuickVatModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (rate: { id: string; name: string; rate: string }) => void;
}) {
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName('');
      setRate('');
      setError(null);
    }
  }, [open]);

  const save = async () => {
    const r = Number(rate.replace(',', '.'));
    if (!name.trim()) return setError('Enter a name');
    if (rate.trim() === '' || Number.isNaN(r) || r < 0 || r > 100)
      return setError('Enter a rate between 0 and 100');
    setBusy(true);
    try {
      onCreated(await inventoryApi.createTaxRate({ name: name.trim(), rate: r }));
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New VAT rate" open={open} onClose={onClose}>
      <div className="space-y-4">
        {error && <ErrorNotice message={error} />}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Name" htmlFor="qv-name" required className="col-span-2">
            <input
              id="qv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="Standard VAT"
              maxLength={50}
            />
          </Field>
          <Field label="Rate %" htmlFor="qv-rate" required>
            <input
              id="qv-rate"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              className={clsx(inputCls, 'text-right')}
              placeholder="19"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void save();
                }
              }}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btn.primary} onClick={save} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Create
          </button>
        </div>
      </div>
    </Modal>
  );
}
