'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Boxes,
  FolderPlus,
  Layers,
  Plus,
  Save,
  Tag,
  Trash2,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ApiRequestError } from '@/lib/api';
import {
  categoryLabels,
  productsApi,
  type FormOptions,
  type ProductDetail,
  type ProductInput,
  type VariantOption,
} from '@/lib/products';
import { Button, Field, inputClass, Skeleton, Toggle, useToast } from '@/components/ui';

const DECIMAL = /^\d{1,14}([.,]\d{1,4})?$/;
const SKU = /^[A-Za-z0-9._-]+$/;
const MAX_VARIANTS = 200;

interface State {
  sku: string;
  barcode: string;
  name: string;
  description: string;
  categoryId: string;
  baseUnitId: string;
  taxRateId: string;
  salePrice: string;
  minStock: string;
  hasVariants: boolean;
  options: VariantOption[];
  prices: Record<string, string>;
}

type Errors = Partial<Record<keyof State | 'options', string>>;

function fromProduct(p: ProductDetail | undefined, opts: FormOptions): State {
  const pcs = opts.units.find((u) => u.code === 'PCS') ?? opts.units[0];
  return {
    sku: p?.sku ?? '',
    barcode: p?.barcode ?? '',
    name: p?.name ?? '',
    description: p?.description ?? '',
    categoryId: p?.category?.id ?? '',
    baseUnitId: p?.baseUnit.id ?? pcs?.id ?? '',
    taxRateId: p?.taxRate?.id ?? '',
    salePrice: p ? String(Number(p.salePrice)) : '',
    minStock: p ? String(Number(p.minStock)) : '0',
    hasVariants: p?.hasVariants ?? false,
    options: p?.variantOptions ?? [
      { name: 'Size', values: [] },
      { name: 'Colour', values: [] },
    ],
    prices: Object.fromEntries(
      (p?.prices ?? []).map((r) => [r.priceList.id, r.price === null ? '' : String(Number(r.price))]),
    ),
  };
}

const dec = (v: string) => v.trim().replace(',', '.');

export function ProductForm({ product }: { product?: ProductDetail }) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = !!product;
  const isVariant = !!product?.parent;

  const [opts, setOpts] = useState<FormOptions | null>(null);
  const [s, setS] = useState<State | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState<string | null>(null);

  useEffect(() => {
    productsApi
      .formOptions()
      .then((o) => {
        setOpts(o);
        setS(fromProduct(product, o));
      })
      .catch((e: Error) => setServerError(e.message));
  }, [product]);

  const categories = useMemo(() => (opts ? categoryLabels(opts.categories) : []), [opts]);
  const cleanOptions = (s?.options ?? [])
    .map((o) => ({ name: o.name.trim(), values: o.values }))
    .filter((o) => o.name && o.values.length);
  const comboCount = cleanOptions.reduce((n, o) => n * o.values.length, cleanOptions.length ? 1 : 0);

  if (!s || !opts) {
    return serverError ? (
      <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{serverError}</p>
    ) : (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    );
  }

  const set = <K extends keyof State>(k: K, v: State[K]) => {
    setS((prev) => (prev ? { ...prev, [k]: v } : prev));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function validate(st: State): Errors {
    const e: Errors = {};
    if (!st.name.trim()) e.name = 'Name is required';
    if (!st.sku.trim()) e.sku = 'SKU is required';
    else if (!SKU.test(st.sku.trim())) e.sku = 'Letters, digits, dot, dash and underscore only';
    if (!st.baseUnitId) e.baseUnitId = 'Choose a unit';
    if (!DECIMAL.test(dec(st.salePrice))) e.salePrice = 'Enter a price, e.g. 19.90';
    if (st.minStock && !DECIMAL.test(dec(st.minStock))) e.minStock = 'Enter a quantity, e.g. 10';
    for (const [id, v] of Object.entries(st.prices)) {
      if (v.trim() && !DECIMAL.test(dec(v))) e.prices = `Invalid price for ${opts!.priceLists.find((p) => p.id === id)?.name}`;
    }
    if (!isEdit && st.hasVariants) {
      if (cleanOptions.length === 0) e.options = 'Add at least one option with values, e.g. Size: S, M, L';
      else if (comboCount > MAX_VARIANTS) e.options = `${comboCount} variants — the maximum is ${MAX_VARIANTS}`;
    }
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!s) return;
    const e = validate(s);
    setErrors(e);
    setServerError(null);
    if (Object.values(e).some(Boolean)) {
      toast('error', 'Please fix the highlighted fields');
      return;
    }

    const prices = opts!.priceLists.map((pl) => ({
      priceListId: pl.id,
      price: s.prices[pl.id]?.trim() ? dec(s.prices[pl.id]) : null,
    }));
    const input: ProductInput = {
      sku: s.sku.trim(),
      barcode: s.barcode.trim() || null,
      name: s.name.trim(),
      description: s.description.trim() || null,
      categoryId: s.categoryId || null,
      baseUnitId: s.baseUnitId,
      taxRateId: s.taxRateId || null,
      salePrice: dec(s.salePrice),
      minStock: dec(s.minStock || '0'),
    };

    setSaving(true);
    try {
      if (isEdit) {
        await productsApi.update(product!.id, input);
        await productsApi.setPrices(product!.id, prices);
        toast('success', 'Product saved');
        router.push(`/inventory/products/${product!.id}`);
      } else {
        const res = await productsApi.create({
          ...input,
          hasVariants: s.hasVariants,
          variantOptions: s.hasVariants ? cleanOptions : undefined,
          prices: prices.filter((p) => p.price !== null),
        });
        toast(
          'success',
          res.variantCount ? `Product created with ${res.variantCount} variants` : 'Product created',
        );
        router.push(`/inventory/products/${res.id}`);
      }
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not save the product';
      setServerError(msg);
      if (/sku/i.test(msg)) setErrors((x) => ({ ...x, sku: msg }));
      else if (/barcode/i.test(msg)) setErrors((x) => ({ ...x, barcode: msg }));
      toast('error', msg);
      setSaving(false);
    }
  }

  async function addCategory() {
    const name = newCategory?.trim();
    if (!name) return setNewCategory(null);
    try {
      const c = await productsApi.createCategory(name, null);
      setOpts((o) => (o ? { ...o, categories: [...o.categories, c] } : o));
      set('categoryId', c.id);
      setNewCategory(null);
      toast('success', `Category “${c.name}” added`);
    } catch (err) {
      toast('error', (err as Error).message);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <AnimatePresence>
        {serverError && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200"
          >
            {serverError}
          </motion.p>
        )}
      </AnimatePresence>

      <Section icon={Tag} title="General" subtitle="How the product is named and found" i={0}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" required error={errors.name} className="md:col-span-2">
            <input
              className={inputClass}
              value={s.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Cotton T-shirt"
              autoFocus={!isEdit}
            />
          </Field>
          <Field
            label="SKU"
            required
            error={errors.sku}
            hint={s.hasVariants && !isEdit ? 'Variants get SKU-SIZE-COLOUR, e.g. TSHIRT-M-RED' : 'Unique internal code'}
          >
            <input
              className={clsx(inputClass, 'font-mono uppercase')}
              value={s.sku}
              onChange={(e) => set('sku', e.target.value.toUpperCase())}
              placeholder="TSHIRT"
            />
          </Field>
          <Field label="Barcode" error={errors.barcode} hint={s.hasVariants ? 'Usually set per variant' : 'EAN / UPC — scan it here'}>
            <input
              className={clsx(inputClass, 'font-mono')}
              value={s.barcode}
              onChange={(e) => set('barcode', e.target.value)}
              placeholder="5449000000996"
            />
          </Field>
          <Field label="Category">
            {newCategory === null ? (
              <div className="flex gap-2">
                <select
                  className={inputClass}
                  value={s.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                  disabled={isVariant}
                >
                  <option value="">— None —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {!isVariant && (
                  <Button type="button" icon={FolderPlus} onClick={() => setNewCategory('')} title="New category" />
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  autoFocus
                  className={inputClass}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void addCategory();
                    }
                    if (e.key === 'Escape') setNewCategory(null);
                  }}
                  placeholder="New category name"
                />
                <Button type="button" variant="primary" onClick={addCategory}>
                  Add
                </Button>
                <Button type="button" variant="ghost" icon={X} onClick={() => setNewCategory(null)} />
              </div>
            )}
          </Field>
          <Field label="Description" className="md:col-span-2">
            <textarea
              rows={3}
              className={inputClass}
              value={s.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Optional details shown on the product page"
              disabled={isVariant}
            />
          </Field>
        </div>
        {isVariant && (
          <p className="mt-3 text-xs text-slate-500">
            Category and description are shared with the parent product “{product!.parent!.name}”.
          </p>
        )}
      </Section>

      <Section icon={Wallet} title="Pricing" subtitle="Default price and price lists" i={1}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Sale price" required error={errors.salePrice} hint="Used when a price list has no price">
            <input
              inputMode="decimal"
              className={clsx(inputClass, 'text-right tabular-nums')}
              value={s.salePrice}
              onChange={(e) => set('salePrice', e.target.value)}
              placeholder="0.00"
            />
          </Field>
          {opts.priceLists.map((pl) => (
            <Field key={pl.id} label={`${pl.name} price`} hint="Leave empty to use the sale price">
              <input
                inputMode="decimal"
                className={clsx(inputClass, 'text-right tabular-nums')}
                value={s.prices[pl.id] ?? ''}
                onChange={(e) => set('prices', { ...s.prices, [pl.id]: e.target.value })}
                placeholder={s.salePrice || '0.00'}
              />
            </Field>
          ))}
          <Field label="Tax rate" hint={opts.taxRates.length ? undefined : 'No tax rate defined yet (Admin › Settings)'}>
            <select
              className={inputClass}
              value={s.taxRateId}
              onChange={(e) => set('taxRateId', e.target.value)}
              disabled={isVariant || opts.taxRates.length === 0}
            >
              <option value="">— None —</option>
              {opts.taxRates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({Number(t.rate)} %)
                </option>
              ))}
            </select>
          </Field>
        </div>
        {errors.prices && <p className="mt-2 text-xs text-red-600">{errors.prices}</p>}
        {!isEdit && s.hasVariants && (
          <p className="mt-3 text-xs text-slate-500">Every variant starts with these prices; you can change them per variant later.</p>
        )}
      </Section>

      <Section icon={Boxes} title="Stock" subtitle="Unit and low-stock alert" i={2}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            label="Base unit"
            required
            error={errors.baseUnitId}
            hint={isEdit ? 'Locked once the product has stock movements' : 'Stock is counted in this unit'}
          >
            <select
              className={inputClass}
              value={s.baseUnitId}
              onChange={(e) => set('baseUnitId', e.target.value)}
              disabled={isVariant}
            >
              {opts.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} — {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Minimum stock"
            error={errors.minStock}
            hint={s.hasVariants ? 'Alert threshold for each variant (0 = no alert)' : 'Alert when stock goes under it (0 = no alert)'}
          >
            <input
              inputMode="decimal"
              className={clsx(inputClass, 'text-right tabular-nums')}
              value={s.minStock}
              onChange={(e) => set('minStock', e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {!isEdit && (
        <Section icon={Layers} title="Variants" subtitle="Sizes, colours… each variant has its own SKU, barcode, price and stock" i={3}>
          <Toggle
            checked={s.hasVariants}
            onChange={(v) => set('hasVariants', v)}
            label="This product comes in several variants"
            description="e.g. a T-shirt in sizes S / M / L and colours Red / Blue"
          />
          <AnimatePresence initial={false}>
            {s.hasVariants && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <VariantOptionsEditor
                  options={s.options}
                  onChange={(o) => {
                    set('options', o);
                    setErrors((e) => ({ ...e, options: undefined }));
                  }}
                  error={errors.options}
                  sku={s.sku || 'SKU'}
                  count={comboCount}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Section>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" icon={Save} loading={saving}>
          {isEdit
            ? 'Save changes'
            : s.hasVariants && comboCount > 0
              ? `Create product + ${comboCount} variants`
              : 'Create product'}
        </Button>
      </div>
    </form>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  i,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  i: number;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 md:p-6"
    >
      <header className="mb-5 flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/30">
          <Icon className="size-4.5" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </header>
      {children}
    </motion.section>
  );
}

/** Option rows ("Size": S, M, L) with chip inputs and a live preview of the variants. */
export function VariantOptionsEditor({
  options,
  onChange,
  error,
  sku,
  count,
  lockedNames,
}: {
  options: VariantOption[];
  onChange: (o: VariantOption[]) => void;
  error?: string;
  sku: string;
  count: number;
  /** When variants already exist, option names cannot change. */
  lockedNames?: boolean;
}) {
  const update = (i: number, patch: Partial<VariantOption>) =>
    onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  const preview = useMemo(() => {
    const clean = options.filter((o) => o.name.trim() && o.values.length);
    let combos: string[][] = clean.length ? [[]] : [];
    for (const o of clean) combos = combos.flatMap((c) => o.values.map((v) => [...c, v]));
    return combos.slice(0, 8);
  }, [options]);

  return (
    <div className="mt-5 space-y-3">
      {options.map((o, i) => (
        <motion.div
          key={i}
          layout
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className="grid gap-2 rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-200/70 md:grid-cols-[180px_1fr_auto]"
        >
          <input
            className={inputClass}
            value={o.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Option, e.g. Size"
            disabled={lockedNames}
          />
          <ChipsInput values={o.values} onChange={(values) => update(i, { values })} />
          {!lockedNames && (
            <Button
              type="button"
              variant="ghost"
              icon={Trash2}
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              aria-label="Remove option"
            />
          )}
        </motion.div>
      ))}
      {!lockedNames && options.length < 3 && (
        <Button type="button" size="sm" icon={Plus} onClick={() => onChange([...options, { name: '', values: [] }])}>
          Add option
        </Button>
      )}
      {error && (
        <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -6, 6, 0] }} className="text-xs text-red-600">
          {error}
        </motion.p>
      )}
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 ring-1 ring-violet-100"
        >
          <p className="text-sm font-medium text-violet-900">
            {count} variant{count > 1 ? 's' : ''} will be created
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <AnimatePresence>
              {preview.map((c) => (
                <motion.span
                  key={c.join('|')}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="rounded-md bg-white px-2 py-1 font-mono text-[11px] text-violet-700 shadow-sm ring-1 ring-violet-100"
                >
                  {[sku.toUpperCase(), ...c.map((v) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase())].join('-')}
                </motion.span>
              ))}
            </AnimatePresence>
            {count > preview.length && (
              <span className="self-center text-xs text-violet-600">+{count - preview.length} more</span>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

export function ChipsInput({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p && !values.some((v) => v.toLowerCase() === p.toLowerCase()));
    if (parts.length) onChange([...values, ...parts]);
    setText('');
  };
  return (
    <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-emerald-500">
      <AnimatePresence initial={false}>
        {values.map((v) => (
          <motion.span
            key={v}
            layout
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            className="inline-flex items-center gap-1 rounded-md bg-gradient-to-br from-emerald-50 to-teal-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-emerald-500 hover:text-emerald-900"
              aria-label={`Remove ${v}`}
            >
              <X className="size-3" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      <input
        value={text}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => text && add(text)}
        placeholder={values.length ? 'Add value…' : 'Type a value, press Enter (e.g. S, M, L)'}
        className="min-w-32 flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-slate-400"
      />
    </div>
  );
}
