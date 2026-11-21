'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Barcode, Check, FolderTree, Info, Ruler, Sparkles, Tag, Wallet } from 'lucide-react';
import type { Product, ProductFormOptions, ProductInput } from '@erp/shared';
import { ApiRequestError } from '@/lib/api';
import { flattenTree, productsApi } from '@/lib/inventory';
import { formatMoney, trimDecimal } from '@/lib/format';
import { Field, inputClass } from '@/components/ui/field';
import { Button } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

interface FormState {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  categoryId: string;
  baseUnitId: string;
  taxRateId: string;
  salePrice: string;
  minStock: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

const SKU_RE = /^[A-Z0-9._\-/]+$/;
const NUM_RE = /^\d+(\.\d{1,4})?$/;

function initialState(product: Product | undefined, options: ProductFormOptions): FormState {
  if (product) {
    return {
      name: product.name,
      sku: product.sku,
      barcode: product.barcode ?? '',
      description: product.description ?? '',
      categoryId: product.category?.id ?? '',
      baseUnitId: product.baseUnit.id,
      taxRateId: product.taxRate?.id ?? '',
      salePrice: trimDecimal(product.salePrice),
      minStock: trimDecimal(product.minStock),
    };
  }
  return {
    name: '',
    sku: '',
    barcode: '',
    description: '',
    categoryId: '',
    baseUnitId: options.units.find((u) => u.code === 'PCS')?.id ?? options.units[0]?.id ?? '',
    taxRateId: '',
    salePrice: '',
    minStock: '0',
  };
}

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Give the product a name (at least 2 characters).';
  if (!f.sku.trim()) e.sku = 'SKU is required.';
  else if (!SKU_RE.test(f.sku.trim().toUpperCase()))
    e.sku = 'Use letters, digits, dot, dash, underscore or slash only.';
  if (!f.baseUnitId) e.baseUnitId = 'Pick the unit stock is counted in.';
  if (f.salePrice.trim() === '') e.salePrice = 'Enter a sale price (0 is allowed).';
  else if (!NUM_RE.test(f.salePrice.trim())) e.salePrice = 'A positive number, max 4 decimals.';
  if (f.minStock.trim() !== '' && !NUM_RE.test(f.minStock.trim()))
    e.minStock = 'A positive number, max 4 decimals.';
  return e;
}

/** Suggests a SKU from the name: "Coca-Cola 33cl can" → "COCA-COLA-33CL-CAN". */
function suggestSku(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

/** Maps API error text to the field it is about. */
function serverErrorsToFields(err: ApiRequestError): Errors | null {
  const msgs = Array.isArray(err.body?.message) ? err.body.message : [err.message];
  const e: Errors = {};
  for (const m of msgs) {
    const lower = m.toLowerCase();
    if (lower.includes('sku')) e.sku = m;
    else if (lower.includes('barcode')) e.barcode = m;
    else if (lower.includes('base unit') || lower.includes('unit not found')) e.baseUnitId = m;
    else if (lower.includes('category')) e.categoryId = m;
    else if (lower.includes('tax')) e.taxRateId = m;
    else if (lower.startsWith('name')) e.name = m;
    else if (lower.includes('saleprice')) e.salePrice = m;
    else if (lower.includes('minstock')) e.minStock = m;
  }
  return Object.keys(e).length ? e : null;
}

interface Props {
  options: ProductFormOptions;
  product?: Product;
  canCost: boolean;
  readOnly?: boolean;
  onSaved?: (p: Product) => void;
}

export function ProductForm({ options, product, canCost, readOnly, onSaved }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => initialState(product, options));
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [shake, setShake] = useState(0);
  const [saving, setSaving] = useState<false | 'save' | 'another'>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [skuEdited, setSkuEdited] = useState(Boolean(product));

  const categoryRows = useMemo(() => flattenTree(options.categories), [options.categories]);
  const unit = options.units.find((u) => u.id === form.baseUnitId);
  const tax = options.taxRates.find((t) => t.id === form.taxRateId);
  const price = NUM_RE.test(form.salePrice.trim()) ? Number(form.salePrice) : null;
  const priceWithTax = price !== null && tax ? price * (1 + Number(tax.rate) / 100) : null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    const next = { ...form, [key]: value };
    if (key === 'name' && !skuEdited) next.sku = suggestSku(String(value));
    setForm(next);
    // live re-validation only for fields the user already left or that have an error
    if (touched[key] || errors[key]) {
      setErrors((e) => ({ ...e, [key]: validate(next)[key] }));
    }
  };
  const blur = (key: keyof FormState) => {
    setTouched((t) => ({ ...t, [key]: true }));
    setErrors((e) => ({ ...e, [key]: validate(form)[key] }));
  };

  async function submit(mode: 'save' | 'another') {
    setFormError(null);
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length > 0) {
      setShake((s) => s + 1);
      return;
    }
    const input: ProductInput = {
      name: form.name.trim(),
      sku: form.sku.trim().toUpperCase(),
      barcode: form.barcode.trim() || null,
      description: form.description.trim() || null,
      categoryId: form.categoryId || null,
      baseUnitId: form.baseUnitId,
      taxRateId: form.taxRateId || null,
      salePrice: Number(form.salePrice),
      minStock: Number(form.minStock || 0),
    };
    setSaving(mode);
    try {
      const saved = product
        ? await productsApi.update(product.id, input)
        : await productsApi.create(input);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      toast({
        kind: 'success',
        title: product ? 'Changes saved' : 'Product created',
        description: `${saved.name} · ${saved.sku}`,
      });
      if (product) {
        onSaved?.(saved);
      } else if (mode === 'another') {
        setForm({
          ...initialState(undefined, options),
          categoryId: form.categoryId,
          baseUnitId: form.baseUnitId,
          taxRateId: form.taxRateId,
        });
        setTouched({});
        setSkuEdited(false);
        document.getElementById('name')?.focus();
      } else {
        router.push(`/inventory/products/${saved.id}`);
      }
    } catch (err) {
      const fieldErrors = err instanceof ApiRequestError ? serverErrorsToFields(err) : null;
      if (fieldErrors) setErrors((e) => ({ ...e, ...fieldErrors }));
      else setFormError(err instanceof Error ? err.message : 'Something went wrong');
      setShake((s) => s + 1);
    } finally {
      setSaving(false);
    }
  }

  const describedBy = (k: keyof FormState) => (errors[k] ? `${k}-error` : undefined);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit('save');
      }}
      noValidate
      className="grid gap-6 lg:grid-cols-3"
    >
      <fieldset disabled={readOnly} className="contents">
        <div className="space-y-6 lg:col-span-2">
          <Section icon={Tag} title="Identity" subtitle="How the product is named and recognised.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                htmlFor="name"
                required
                error={errors.name}
                shakeKey={shake}
                className="sm:col-span-2"
              >
                <input
                  id="name"
                  autoFocus={!product}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  onBlur={() => blur('name')}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={describedBy('name')}
                  placeholder="e.g. Coca-Cola 33cl can"
                  className={inputClass(Boolean(errors.name))}
                />
              </Field>
              <Field
                label="SKU"
                htmlFor="sku"
                required
                error={errors.sku}
                shakeKey={shake}
                hint={
                  !skuEdited && form.sku
                    ? 'Suggested from the name — edit it if you like.'
                    : 'Your internal product code. Must be unique.'
                }
              >
                <div className="relative">
                  <input
                    id="sku"
                    value={form.sku}
                    onChange={(e) => {
                      setSkuEdited(true);
                      set('sku', e.target.value.toUpperCase());
                    }}
                    onBlur={() => blur('sku')}
                    aria-invalid={Boolean(errors.sku)}
                    aria-describedby={describedBy('sku')}
                    placeholder="COKE-33CL"
                    className={clsx(inputClass(Boolean(errors.sku)), 'pr-9 font-mono uppercase')}
                  />
                  {!skuEdited && form.sku && (
                    <Sparkles className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-emerald-500" />
                  )}
                </div>
              </Field>
              <Field
                label="Barcode"
                htmlFor="barcode"
                error={errors.barcode}
                shakeKey={shake}
                hint="EAN / UPC. Scan it straight into this box."
              >
                <div className="relative">
                  <Barcode className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="barcode"
                    inputMode="numeric"
                    value={form.barcode}
                    onChange={(e) => set('barcode', e.target.value)}
                    onBlur={() => blur('barcode')}
                    aria-invalid={Boolean(errors.barcode)}
                    aria-describedby={describedBy('barcode')}
                    placeholder="5449000000996"
                    className={clsx(inputClass(Boolean(errors.barcode)), 'pl-9 font-mono')}
                  />
                </div>
              </Field>
              <Field label="Description" htmlFor="description" className="sm:col-span-2">
                <textarea
                  id="description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Optional notes: packaging, supplier reference, storage…"
                  className={clsx(inputClass(), 'resize-y')}
                />
              </Field>
            </div>
          </Section>

          <Section
            icon={FolderTree}
            title="Classification"
            subtitle="Where it sits in the catalogue and how it is taxed."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Category"
                htmlFor="categoryId"
                error={errors.categoryId}
                shakeKey={shake}
              >
                <select
                  id="categoryId"
                  value={form.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                  className={inputClass(Boolean(errors.categoryId))}
                >
                  <option value="">No category</option>
                  {categoryRows
                    .filter((c) => c.isActive || c.id === form.categoryId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {'   '.repeat(c.depth)}
                        {c.name}
                        {c.isActive ? '' : ' (archived)'}
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label="Base unit"
                htmlFor="baseUnitId"
                required
                error={errors.baseUnitId}
                shakeKey={shake}
                hint="Stock is always counted in this unit."
              >
                <div className="relative">
                  <Ruler className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                  <select
                    id="baseUnitId"
                    value={form.baseUnitId}
                    onChange={(e) => set('baseUnitId', e.target.value)}
                    className={clsx(inputClass(Boolean(errors.baseUnitId)), 'pl-9')}
                  >
                    {options.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} — {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
              <Field
                label="Tax rate"
                htmlFor="taxRateId"
                error={errors.taxRateId}
                shakeKey={shake}
                hint={
                  options.taxRates.length === 0
                    ? 'No tax rates set up yet (Administration › Settings).'
                    : undefined
                }
              >
                <select
                  id="taxRateId"
                  value={form.taxRateId}
                  onChange={(e) => set('taxRateId', e.target.value)}
                  className={inputClass(Boolean(errors.taxRateId))}
                >
                  <option value="">No tax</option>
                  {options.taxRates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({Number(t.rate)}%)
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <Section icon={Wallet} title="Price & stock" subtitle="Selling price and reorder level.">
            <div className="space-y-4">
              <Field
                label="Sale price"
                htmlFor="salePrice"
                required
                error={errors.salePrice}
                shakeKey={shake}
                hint="Before tax."
              >
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs font-semibold text-slate-400">
                    {options.currency}
                  </span>
                  <input
                    id="salePrice"
                    inputMode="decimal"
                    value={form.salePrice}
                    onChange={(e) => set('salePrice', e.target.value.replace(',', '.'))}
                    onBlur={() => blur('salePrice')}
                    aria-invalid={Boolean(errors.salePrice)}
                    aria-describedby={describedBy('salePrice')}
                    placeholder="0.00"
                    className={clsx(
                      inputClass(Boolean(errors.salePrice)),
                      'pl-12 text-right font-medium tabular-nums',
                    )}
                  />
                </div>
              </Field>

              <AnimatePresence initial={false}>
                {priceWithTax !== null && tax && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center justify-between rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 px-4 py-3 ring-1 ring-emerald-100">
                      <span className="text-xs font-medium text-emerald-800">
                        With {tax.name} ({Number(tax.rate)}%)
                      </span>
                      <span className="font-semibold text-emerald-900 tabular-nums">
                        {formatMoney(priceWithTax, options.currency)}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <Field
                label="Minimum stock"
                htmlFor="minStock"
                error={errors.minStock}
                shakeKey={shake}
                hint="You get a low-stock alert below this. 0 turns it off."
              >
                <div className="relative">
                  <input
                    id="minStock"
                    inputMode="decimal"
                    value={form.minStock}
                    onChange={(e) => set('minStock', e.target.value.replace(',', '.'))}
                    onBlur={() => blur('minStock')}
                    aria-invalid={Boolean(errors.minStock)}
                    aria-describedby={describedBy('minStock')}
                    className={clsx(
                      inputClass(Boolean(errors.minStock)),
                      'pr-14 text-right tabular-nums',
                    )}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-slate-400">
                    {unit?.code}
                  </span>
                </div>
              </Field>

              {product && canCost && product.averageCost !== undefined && (
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    Average cost
                    <span title="Weighted average of what you paid. Updated by goods receipts.">
                      <Info className="size-3.5 text-slate-400" />
                    </span>
                  </span>
                  <span className="font-semibold text-slate-800 tabular-nums">
                    {formatMoney(product.averageCost, options.currency)}
                  </span>
                </div>
              )}
            </div>
          </Section>

          {!readOnly && (
            <div className="sticky bottom-4 z-10 space-y-3 rounded-2xl bg-white/90 p-4 shadow-lg ring-1 shadow-slate-900/5 ring-slate-200/80 backdrop-blur lg:static lg:shadow-sm">
              <AnimatePresence>
                {formError && (
                  <motion.p
                    role="alert"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0, x: [0, -6, 6, -3, 3, 0] }}
                    exit={{ opacity: 0 }}
                    className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                  >
                    {formError}
                  </motion.p>
                )}
              </AnimatePresence>
              <Button
                type="submit"
                loading={saving === 'save'}
                disabled={Boolean(saving)}
                className="w-full py-2.5"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {savedFlash ? (
                    <motion.span
                      key="ok"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="inline-flex items-center gap-2"
                    >
                      <Check className="size-4" /> Saved
                    </motion.span>
                  ) : (
                    <motion.span key="label" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      {product ? 'Save changes' : 'Create product'}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
              {!product && (
                <Button
                  type="button"
                  variant="secondary"
                  loading={saving === 'another'}
                  disabled={Boolean(saving)}
                  onClick={() => void submit('another')}
                  className="w-full"
                >
                  Create & add another
                </Button>
              )}
            </div>
          )}
        </div>
      </fieldset>
    </form>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Tag;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 sm:p-6"
    >
      <div className="mb-5 flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/20">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </motion.section>
  );
}
