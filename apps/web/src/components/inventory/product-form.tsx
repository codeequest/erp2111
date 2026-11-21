'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  AlertCircle,
  Barcode,
  Camera,
  Check,
  ChevronDown,
  Hash,
  Info,
  Layers,
  Loader2,
  Lock,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { barcodeProblem, isGtinLike } from '@erp/shared';
import type {
  CategoryDto,
  ProductDetail,
  ProductInput,
  TaxRateDto,
  TrackingMode,
  UnitDto,
} from '@erp/shared';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  TRACKING_LABELS,
  categoryPaths,
  inventoryApi,
} from '@/lib/inventory';
import { primaryBtn, secondaryBtn } from './products-header';
import { ProductPhoto } from './product-photo';

type Field =
  | 'sku'
  | 'barcode'
  | 'name'
  | 'description'
  | 'categoryId'
  | 'baseUnitId'
  | 'taxRateId'
  | 'salePrice'
  | 'minStock'
  | 'tracking'
  | 'photo';
type Values = Record<Exclude<Field, 'photo' | 'tracking'>, string> & { tracking: TrackingMode };
type Errors = Partial<Record<Field, string>>;

/** Same rules as the API DTO. */
const DECIMAL_4 = /^\d{1,14}(\.\d{1,4})?$/;
const SKU = /^[A-Za-z0-9._\-/]+$/;

function initialValues(p?: ProductDetail): Values {
  return {
    sku: p?.sku ?? '',
    barcode: p?.barcode ?? '',
    name: p?.name ?? '',
    description: p?.description ?? '',
    categoryId: p?.category?.id ?? '',
    baseUnitId: p?.baseUnit.id ?? '',
    taxRateId: p?.taxRate?.id ?? '',
    salePrice: p ? stripZeros(p.salePrice) : '',
    minStock: p ? stripZeros(p.minStock) : '',
    tracking: p?.tracking ?? 'NONE',
  };
}

/** "1.2500" → "1.25", "24.0000" → "24" — for editing comfort, without float conversion. */
function stripZeros(v: string): string {
  return v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v;
}

/** Names shown in the "please complete" summary, in screen order. */
const FIELD_LABELS: Partial<Record<Field, string>> = {
  name: 'Product name',
  sku: 'Product code',
  salePrice: 'Sale price',
  categoryId: 'Category',
  baseUnitId: 'Counted in',
  minStock: 'Warn me below',
  tracking: 'Follow each item by',
  barcode: 'Barcode',
  taxRateId: 'Tax',
};

/** Each field's DOM id, so the summary can jump to it. */
const fieldId = (f: Field) => `product-${f}`;

/** EAN-8 / UPC-A / EAN-13 / GTIN-14 name for a valid retail barcode, for reassuring feedback. */
function gtinName(code: string): string {
  return { 8: 'EAN-8', 12: 'UPC-A', 13: 'EAN-13', 14: 'GTIN-14' }[code.length] ?? 'retail';
}

function validate(v: Values, autoCode: boolean): Errors {
  const e: Errors = {};
  if (!autoCode) {
    if (!v.sku.trim()) e.sku = 'Type a code, or choose "Automatic"';
    else if (!SKU.test(v.sku.trim())) e.sku = 'Letters, digits and . _ - / only (no spaces)';
    else if (v.sku.trim().length > 64) e.sku = 'At most 64 characters';
  }
  if (!v.name.trim()) e.name = 'Give the product a name';
  if (v.barcode.trim().length > 64) e.barcode = 'At most 64 characters';
  else {
    const problem = barcodeProblem(v.barcode);
    if (problem) e.barcode = problem;
  }
  if (!v.baseUnitId) e.baseUnitId = 'Choose how you count it';
  if (!v.salePrice.trim()) e.salePrice = 'Enter a price (0 is allowed)';
  else if (!DECIMAL_4.test(v.salePrice.trim())) e.salePrice = 'A number like 12 or 12.50';
  if (v.minStock.trim() && !DECIMAL_4.test(v.minStock.trim()))
    e.minStock = 'A number like 10 or 2.5';
  return e;
}

/** Maps an API error to the field it concerns, when we can tell. */
function fieldFromServerMessage(msg: string): Field | null {
  const m = msg.toLowerCase();
  if (m.includes('sku') || m.includes('code')) return 'sku';
  if (m.includes('barcode')) return 'barcode';
  if (m.includes('base unit') || m.includes('baseunitid')) return 'baseUnitId';
  if (m.includes('tracking')) return 'tracking';
  if (m.includes('categoryid')) return 'categoryId';
  if (m.includes('taxrateid')) return 'taxRateId';
  if (m.includes('saleprice')) return 'salePrice';
  if (m.includes('minstock')) return 'minStock';
  return null;
}

function messagesOf(err: unknown): string[] {
  if (err instanceof ApiRequestError)
    return ([] as string[]).concat(err.body?.message ?? err.message);
  return [(err as Error).message];
}

export function ProductForm({
  product,
  submitLabel,
  onSubmit,
  onSaved,
  onCancel,
}: {
  product?: ProductDetail;
  submitLabel: string;
  onSubmit: (input: ProductInput) => Promise<ProductDetail>;
  /** `warning` is set when the article was saved but the photo step failed. */
  onSaved: (p: ProductDetail, warning?: string) => void;
  onCancel: () => void;
}) {
  const isEdit = !!product;
  const canManageNumbering = useAuth().can('admin.settings.manage');
  const [values, setValues] = useState<Values>(() => initialValues(product));
  const [autoCode, setAutoCode] = useState(!isEdit);
  const [nextCode, setNextCode] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(
    !!(product?.barcode || product?.description || product?.taxRate),
  );

  // Photo: a newly picked file, or a request to remove the current one.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [units, setUnits] = useState<UnitDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRateDto[]>([]);

  useEffect(() => {
    Promise.all([
      inventoryApi.listUnits(),
      inventoryApi.listCategories(),
      inventoryApi.listTaxRates(),
    ])
      .then(([u, c, t]) => {
        setUnits(u);
        setCategories(c);
        setTaxRates(t);
        if (!product) {
          // Sensible default: count in pieces.
          setValues((v) =>
            v.baseUnitId
              ? v
              : { ...v, baseUnitId: (u.find((x) => x.code === 'PCS') ?? u[0])?.id ?? '' },
          );
        }
      })
      .catch((e: Error) => setFormError(`Could not load the form: ${e.message}`));
    if (!product) {
      inventoryApi
        .getCodeSequence()
        .then((s) => setNextCode(s.nextCode))
        .catch(() => setNextCode(null));
    }
  }, [product]);

  // "Create a product with this barcode" from the list: pre-fill the scanned barcode.
  useEffect(() => {
    if (product) return;
    const scanned = new URLSearchParams(window.location.search).get('barcode');
    if (scanned) {
      setValues((v) => ({ ...v, barcode: scanned }));
      setTouched((t) => ({ ...t, barcode: true }));
      setMoreOpen(true);
    }
  }, [product]);

  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview],
  );

  const paths = useMemo(() => categoryPaths(categories), [categories]);
  const clientErrors = validate(values, autoCode);
  const errorFor = (f: Field) => serverErrors[f] ?? (touched[f] ? clientErrors[f] : undefined);
  const locked = product?.hasStockHistory ?? false;

  function set<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((v) => ({ ...v, [field]: value }));
    setServerErrors((e) => ({ ...e, [field]: undefined }));
    setSaved(false);
  }
  const touch = (f: Field) => () => setTouched((t) => ({ ...t, [f]: true }));

  function pickPhoto(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      setPhotoError('Use a JPG, PNG or WebP picture');
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setPhotoError('This picture is larger than 5 MB');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setRemovePhoto(false);
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(!!product?.photoUrl);
    setPhotoError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(Object.fromEntries(Object.keys(values).map((k) => [k, true])));
    setFormError(null);
    setSubmitAttempted(true);
    if (Object.keys(clientErrors).length > 0) {
      if (clientErrors.barcode) setMoreOpen(true);
      setShakeKey((k) => k + 1);
      summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    const input: ProductInput = {
      sku: autoCode ? null : values.sku.trim(),
      barcode: values.barcode.trim() || null,
      name: values.name.trim(),
      description: values.description.trim() || null,
      categoryId: values.categoryId || null,
      baseUnitId: values.baseUnitId,
      taxRateId: values.taxRateId || null,
      salePrice: values.salePrice.trim(),
      minStock: values.minStock.trim() || '0',
      tracking: values.tracking,
    };

    setSubmitting(true);
    let result: ProductDetail;
    try {
      result = await onSubmit(input);
    } catch (err) {
      const byField: Errors = {};
      const general: string[] = [];
      for (const m of messagesOf(err)) {
        const f = fieldFromServerMessage(m);
        if (f && !byField[f]) byField[f] = m;
        else general.push(m);
      }
      if (byField.sku && autoCode) setAutoCode(false);
      if (byField.barcode || byField.taxRateId) setMoreOpen(true);
      setServerErrors(byField);
      if (general.length) setFormError(general.join(' · '));
      setShakeKey((k) => k + 1);
      setSubmitting(false);
      return;
    }

    // The product is saved. The photo is a second, separate step.
    let warning: string | undefined;
    try {
      if (photoFile) result = await inventoryApi.uploadPhoto(result.id, photoFile);
      else if (removePhoto) result = await inventoryApi.removePhoto(result.id);
    } catch (err) {
      warning = `The product was saved, but the photo could not be saved: ${messagesOf(err).join(', ')}`;
    }

    setSubmitting(false);
    setSaved(true);
    setTimeout(() => onSaved(result, warning), 650); // let the success tick play
  }

  // Decimal inputs: accept a comma as decimal separator for convenience.
  const decimalChange = (f: 'salePrice' | 'minStock') => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(f, e.target.value.replace(',', '.'));

  const currentUnit = units.find((u) => u.id === values.baseUnitId);
  const showExistingPhoto = !photoPreview && !removePhoto && product?.photoUrl;
  const hasPhoto = !!photoPreview || !!showExistingPhoto;

  // Problems to list at the top once the user has tried to save (updates live as they fix them).
  const allErrors: Errors = { ...clientErrors, ...serverErrors };
  const problems = (Object.keys(FIELD_LABELS) as Field[]).filter((f) => allErrors[f]);

  function goTo(f: Field) {
    if (f === 'barcode' || f === 'taxRateId') setMoreOpen(true);
    setTimeout(() => {
      const el = document.getElementById(fieldId(f));
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
    }, 50);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div ref={summaryRef}>
        {submitAttempted && problems.length > 0 ? (
          <div
            key={`summary-${shakeKey}`}
            className="animate-shake rounded-xl border border-rose-200 bg-rose-50 p-4"
            role="alert"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-rose-800">
              <AlertCircle className="size-4 shrink-0" />
              {problems.length === 1
                ? 'One thing to fix before saving:'
                : `${problems.length} things to fix before saving:`}
            </p>
            <ul className="mt-2 space-y-1 pl-6 text-sm text-rose-700">
              {problems.map((f) => (
                <li key={f}>
                  <button
                    type="button"
                    onClick={() => goTo(f)}
                    className="text-left underline decoration-rose-300 underline-offset-2 hover:decoration-rose-600"
                  >
                    <span className="font-medium">{FIELD_LABELS[f]}</span>: {allErrors[f]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          !isEdit && (
            <div className="animate-fade-in-up flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-3.5 text-sm text-slate-700">
              <Info className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <p>
                Only <strong>3 things are required</strong>: the <strong>product name</strong>, the{' '}
                <strong>sale price</strong> and <strong>what you count it in</strong> (marked{' '}
                <span className="font-semibold text-rose-500">*</span>). Everything else is optional
                and can be added later.
              </p>
            </div>
          )
        )}
      </div>

      {formError && (
        <div
          key={`err-${shakeKey}`}
          className="animate-shake flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {formError}
        </div>
      )}

      {/* ───── 1. The essentials ───── */}
      <Card delay={0}>
        <div className="flex flex-col gap-5 sm:flex-row">
          {/* Photo */}
          <div className="sm:w-44">
            <div
              onClick={() => fileInput.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickPhoto(e.dataTransfer.files[0]);
              }}
              role="button"
              tabIndex={0}
              aria-label={hasPhoto ? 'Change the photo' : 'Add a photo'}
              className={clsx(
                'group relative mx-auto aspect-square w-40 cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition sm:w-full',
                dragOver
                  ? 'scale-[1.02] border-emerald-500 bg-emerald-50'
                  : hasPhoto
                    ? 'border-transparent'
                    : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40',
              )}
            >
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview blob
                <img
                  src={photoPreview}
                  alt=""
                  className="animate-fade-in-up size-full object-cover"
                />
              ) : showExistingPhoto ? (
                <ProductPhoto url={product!.photoUrl} alt={product!.name} className="size-full" />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center">
                  <div className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/30 transition group-hover:scale-110">
                    <Camera className="size-5" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">Add a photo</span>
                  <span className="text-xs text-slate-400">Click or drop a picture</span>
                </div>
              )}
              {hasPhoto && (
                <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-slate-900/60 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-white">
                    <Upload className="size-3.5" /> Change
                  </span>
                </div>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept={PHOTO_TYPES.join(',')}
              className="hidden"
              onChange={(e) => {
                pickPhoto(e.target.files?.[0]);
                e.target.value = ''; // allow picking the same file again
              }}
            />
            {hasPhoto && (
              <button
                type="button"
                onClick={clearPhoto}
                className="mx-auto mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600"
              >
                <Trash2 className="size-3.5" /> Remove photo
              </button>
            )}
            {photoError && (
              <p key={photoError} className="animate-shake mt-2 text-center text-xs text-rose-600">
                {photoError}
              </p>
            )}
          </div>

          {/* Name, code, price, category */}
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Product name"
              required
              className="sm:col-span-2"
              id={fieldId('name')}
              value={values.name}
              error={errorFor('name')}
              shakeKey={shakeKey}
              onChange={(e) => set('name', e.target.value)}
              onBlur={touch('name')}
              placeholder="e.g. Cola 33cl can"
              autoFocus={!isEdit}
            />

            {/* Code: automatic or typed */}
            <div className="sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">Product code</span>
              {!isEdit && (
                <div
                  className="mt-1 inline-flex w-full rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm sm:w-auto"
                  role="radiogroup"
                  aria-label="How to set the product code"
                >
                  {[
                    { auto: true, label: 'Automatic', icon: Sparkles },
                    { auto: false, label: 'I type my own', icon: Hash },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      role="radio"
                      aria-checked={autoCode === o.auto}
                      onClick={() => {
                        setAutoCode(o.auto);
                        setServerErrors((er) => ({ ...er, sku: undefined }));
                      }}
                      className={clsx(
                        'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 transition sm:flex-none',
                        autoCode === o.auto
                          ? 'bg-white font-medium text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700',
                      )}
                    >
                      <o.icon className="size-3.5" /> {o.label}
                    </button>
                  ))}
                </div>
              )}
              {autoCode ? (
                <div className="animate-fade-in-up mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-2 text-sm">
                  <Sparkles className="size-4 text-emerald-600" />
                  <span className="text-slate-600">This product will get the code</span>
                  <span className="font-mono font-semibold text-emerald-700">
                    {nextCode ?? 'next number'}
                  </span>
                  {canManageNumbering && (
                    // New tab, so what was already typed in this form is not lost.
                    <a
                      href="/admin/settings"
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                    >
                      Change numbering
                    </a>
                  )}
                </div>
              ) : (
                <div className="animate-fade-in-up">
                  <input
                    id={fieldId('sku')}
                    value={values.sku}
                    onChange={(e) => set('sku', e.target.value)}
                    onBlur={touch('sku')}
                    placeholder="e.g. BEV-COLA-33"
                    aria-label="Product code"
                    aria-invalid={!!errorFor('sku')}
                    className={inputClass(!!errorFor('sku'), 'font-mono')}
                  />
                  <FieldMessage
                    error={errorFor('sku')}
                    hint="Must be unique. Letters, digits and . _ - /"
                    shakeKey={shakeKey}
                  />
                </div>
              )}
            </div>

            <Input
              label="Sale price"
              required
              inputMode="decimal"
              id={fieldId('salePrice')}
              value={values.salePrice}
              error={errorFor('salePrice')}
              shakeKey={shakeKey}
              onChange={decimalChange('salePrice')}
              onBlur={touch('salePrice')}
              placeholder="0.00"
              hint={`Per ${currentUnit?.name.toLowerCase() ?? 'unit'}, before tax`}
              alignRight
            />
            <Select
              label="Category"
              id={fieldId('categoryId')}
              value={values.categoryId}
              error={errorFor('categoryId')}
              shakeKey={shakeKey}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              <option value="">No category</option>
              {[...categories]
                .sort((a, b) => (paths.get(a.id) ?? '').localeCompare(paths.get(b.id) ?? ''))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {paths.get(c.id)}
                  </option>
                ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* ───── 2. Stock ───── */}
      <Card title="Stock" delay={60}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Counted in"
            required
            id={fieldId('baseUnitId')}
            value={values.baseUnitId}
            error={errorFor('baseUnitId')}
            shakeKey={shakeKey}
            disabled={locked}
            onChange={(e) => set('baseUnitId', e.target.value)}
            hint={locked ? <LockedHint /> : 'The unit you count stock in.'}
          >
            <option value="" disabled>
              Choose…
            </option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.code})
              </option>
            ))}
          </Select>
          <Input
            label="Warn me below"
            inputMode="decimal"
            id={fieldId('minStock')}
            value={values.minStock}
            error={errorFor('minStock')}
            shakeKey={shakeKey}
            onChange={decimalChange('minStock')}
            onBlur={touch('minStock')}
            placeholder="No alert"
            hint="Shows a low-stock warning under this quantity."
            alignRight
          />
        </div>

        <fieldset id={fieldId('tracking')} className="mt-5 scroll-mt-24" disabled={locked}>
          <legend className="text-sm font-medium text-slate-700">Follow each item by</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup">
            {(['NONE', 'LOT', 'SERIAL'] as const).map((mode) => {
              const Icon = mode === 'NONE' ? Layers : mode === 'LOT' ? Barcode : Hash;
              const selected = values.tracking === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set('tracking', mode)}
                  className={clsx(
                    'relative flex items-start gap-3 rounded-xl border p-3 text-left transition',
                    selected
                      ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm',
                    locked && 'cursor-not-allowed opacity-60 hover:translate-y-0 hover:shadow-none',
                  )}
                >
                  <div
                    className={clsx(
                      'grid size-8 shrink-0 place-items-center rounded-lg transition',
                      selected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {TRACKING_LABELS[mode].label}
                    </div>
                    <div className="text-xs text-slate-500">{TRACKING_LABELS[mode].help}</div>
                  </div>
                  {selected && (
                    <Check className="animate-pop absolute top-2 right-2 size-4 text-emerald-600" />
                  )}
                </button>
              );
            })}
          </div>
          <FieldMessage
            error={errorFor('tracking')}
            hint={
              locked ? (
                <LockedHint />
              ) : values.tracking !== 'NONE' ? (
                `You will enter the ${values.tracking === 'LOT' ? 'lot number' : 'serial numbers'} when goods are received and delivered.`
              ) : undefined
            }
            shakeKey={shakeKey}
          />
        </fieldset>
      </Card>

      {/* ───── 3. Optional details ───── */}
      <div
        className="animate-fade-in-up rounded-xl border border-slate-200 bg-white shadow-sm"
        style={{ animationDelay: '120ms' }}
      >
        <button
          type="button"
          onClick={() => setMoreOpen(!moreOpen)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
          aria-expanded={moreOpen}
        >
          <span>
            <span className="text-sm font-semibold text-slate-800">More details</span>
            <span className="ml-2 text-xs text-slate-400">
              Barcode, tax, description (optional)
            </span>
          </span>
          <ChevronDown
            className={clsx('size-4 text-slate-400 transition-transform', moreOpen && 'rotate-180')}
          />
        </button>
        <div
          className={clsx(
            'grid transition-all duration-300 ease-out',
            moreOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div className="overflow-hidden">
            <div className="grid grid-cols-1 gap-4 border-t border-slate-100 px-5 pt-4 pb-5 sm:grid-cols-2">
              <Input
                label="Barcode"
                id={fieldId('barcode')}
                value={values.barcode}
                error={errorFor('barcode')}
                shakeKey={shakeKey}
                onChange={(e) => set('barcode', e.target.value)}
                onBlur={touch('barcode')}
                onKeyDown={(e) => {
                  // A barcode scanner types the digits then presses Enter: don't submit
                  // the form, just accept the value and check it straight away.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setTouched((t) => ({ ...t, barcode: true }));
                  }
                }}
                placeholder="Scan or type"
                hint={
                  isGtinLike(values.barcode.trim()) && !barcodeProblem(values.barcode) ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <Check className="size-3" /> Valid {gtinName(values.barcode.trim())} barcode
                    </span>
                  ) : (
                    'Click here, then scan with a barcode reader.'
                  )
                }
                autoComplete="off"
                mono
              />
              <Select
                label="Tax"
                id={fieldId('taxRateId')}
                value={values.taxRateId}
                error={errorFor('taxRateId')}
                shakeKey={shakeKey}
                onChange={(e) => set('taxRateId', e.target.value)}
              >
                <option value="">Company default</option>
                {taxRates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.rate}%)
                  </option>
                ))}
              </Select>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">Description</span>
                <textarea
                  value={values.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={3}
                  className={inputClass(false)}
                  placeholder="Notes for your team"
                />
              </label>
              {isEdit && (
                <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 sm:col-span-2">
                  The purchase cost is calculated automatically from goods receipts.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ───── Actions ───── */}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-slate-200 bg-white/80 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <button type="button" onClick={onCancel} className={secondaryBtn} disabled={submitting}>
          Cancel
        </button>
        <button
          type="submit"
          className={clsx(primaryBtn, 'min-w-36')}
          disabled={submitting || saved}
        >
          {saved ? (
            <span className="animate-pop inline-flex items-center gap-2">
              <Check className="size-4" /> Saved
            </span>
          ) : submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving…
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </form>
  );
}

// ───────────── Small building blocks ─────────────

function LockedHint() {
  return (
    <span className="inline-flex items-center gap-1">
      <Lock className="size-3" /> Locked: this product already has stock movements
    </span>
  );
}

function inputClass(hasError: boolean, extra?: string) {
  return clsx(
    'mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
    hasError
      ? 'border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
      : 'border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20',
    extra,
  );
}

function Card({
  title,
  delay,
  children,
}: {
  title?: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="animate-fade-in-up rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      {title && <h2 className="mb-4 text-sm font-semibold text-slate-800">{title}</h2>}
      {children}
    </section>
  );
}

function FieldMessage({
  error,
  hint,
  shakeKey,
}: {
  error?: string;
  hint?: React.ReactNode;
  shakeKey: number;
}) {
  if (error) {
    return (
      <span
        key={`${error}-${shakeKey}`}
        className="animate-shake mt-1 flex items-center gap-1 text-xs text-rose-600"
      >
        <AlertCircle className="size-3" /> {error}
      </span>
    );
  }
  return hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null;
}

function Input({
  label,
  required,
  error,
  hint,
  shakeKey,
  mono,
  alignRight,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  required?: boolean;
  error?: string;
  hint?: React.ReactNode;
  shakeKey: number;
  mono?: boolean;
  alignRight?: boolean;
}) {
  return (
    <label className={clsx('block', className)}>
      <span className="text-sm font-medium text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      <input
        {...props}
        aria-invalid={!!error}
        className={inputClass(
          !!error,
          clsx(mono && 'font-mono', alignRight && 'text-right tabular-nums'),
        )}
      />
      <FieldMessage error={error} hint={hint} shakeKey={shakeKey} />
    </label>
  );
}

function Select({
  label,
  required,
  error,
  hint,
  shakeKey,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  required?: boolean;
  error?: string;
  hint?: React.ReactNode;
  shakeKey: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      <select {...props} aria-invalid={!!error} className={inputClass(!!error)}>
        {children}
      </select>
      <FieldMessage error={error} hint={hint} shakeKey={shakeKey} />
    </label>
  );
}
