'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Power, PowerOff, Save, Trash2 } from 'lucide-react';
import type {
  CategoryDto,
  PackagingDto,
  ProductDetail,
  SaveProductRequest,
  TaxRateDto,
  UnitDto,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/lib/company';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { currencyDecimals, formatDateTime, formatPercent } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox, inputClass, SelectField, TextAreaField, TextField } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/modal';
import { Badge, Card } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { ProductPhoto } from './product-photo';

/** Amount typed by a user: digits, optional , or . and up to 4 decimals. */
const AMOUNT = /^\d{1,14}([.,]\d{1,4})?$/;
const CODE = /^[0-9A-Za-z-]{1,40}$/;
const SKU = /^[A-Za-z0-9._/-]{1,40}$/;

const toNumber = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));
const toApiAmount = (v: string) => v.replace(/\s/g, '').replace(',', '.');

interface PackagingRow extends Omit<PackagingDto, 'barcode' | 'salePrice'> {
  key: number;
  barcode: string;
  /** Own sale price excl. VAT; '' = base price × quantity */
  salePrice: string;
}

let rowKey = 1;

export function ProductForm({
  product,
  onSaved,
}: {
  product: ProductDetail | null;
  onSaved?: (p: ProductDetail) => void;
}) {
  const isNew = product === null;
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const { company, money } = useCompany();
  const toast = useToast();
  const router = useRouter();
  const canWrite = can('inventory.product.write');
  const canSeeCost = can('inventory.cost.view');
  const readOnly = !canWrite;

  const units = useApiQuery<UnitDto[]>('/units');
  const categories = useApiQuery<CategoryDto[]>('/categories');
  const taxRates = useApiQuery<TaxRateDto[]>('/settings/tax-rates');
  const nextSku = useApiQuery<{ sku: string }>(isNew && canWrite ? '/products/next-sku' : null);

  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  const [categoryId, setCategoryId] = useState(product?.category?.id ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [baseUnitId, setBaseUnitId] = useState(product?.baseUnit.id ?? '');
  // undefined = not touched yet → use the company default for new products
  const [taxRateId, setTaxRateId] = useState<string | undefined>(
    product ? (product.taxRate?.id ?? '') : undefined,
  );
  const [salePrice, setSalePrice] = useState(product ? formatInput(product.salePrice) : '');
  const [purchasePrice, setPurchasePrice] = useState(
    product?.purchasePrice ? formatInput(product.purchasePrice) : '',
  );
  const [packagings, setPackagings] = useState<PackagingRow[]>(
    product?.packagings.map((p) => ({
      unitId: p.unitId,
      factor: p.factor,
      forPurchase: p.forPurchase,
      forSale: p.forSale,
      barcode: p.barcode ?? '',
      salePrice: p.salePrice ? formatInput(p.salePrice) : '',
      key: rowKey++,
    })) ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const pcsId = units.data?.find((u) => u.code === 'PCS')?.id;
  const effectiveBaseUnit = baseUnitId || (isNew ? (pcsId ?? '') : '');
  const effectiveTax = taxRateId ?? company?.defaultTaxRateId ?? '';
  const decimals = currencyDecimals(company?.currency ?? 'TND');
  const baseUnitCode = units.data?.find((u) => u.id === effectiveBaseUnit)?.code ?? '';

  // Live preview only — the API computes and stores the real figures.
  const preview = useMemo(() => {
    const ht = AMOUNT.test(salePrice.replace(/\s/g, '')) ? toNumber(salePrice) : null;
    const rate = Number(taxRates.data?.find((r) => r.id === effectiveTax)?.rate ?? 0);
    const ttc = ht === null ? null : round(ht * (1 + rate / 100), decimals);
    const cost = AMOUNT.test(purchasePrice.replace(/\s/g, '')) ? toNumber(purchasePrice) : null;
    const margin = ht !== null && cost !== null ? ht - cost : null;
    const marginRate = margin !== null && ht ? (margin / ht) * 100 : null;
    return { ht, ttc, margin, marginRate, rate };
  }, [salePrice, purchasePrice, effectiveTax, taxRates.data, decimals]);

  function validate() {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = t('validation.minLength', { min: 2 });
    if (sku.trim() && !SKU.test(sku.trim())) e.sku = t('products.form.skuInvalid');
    if (barcode.trim() && !CODE.test(barcode.trim())) e.barcode = t('products.form.barcodeInvalid');
    if (!AMOUNT.test(salePrice.replace(/\s/g, ''))) e.salePrice = t('validation.amount');
    if (canSeeCost && purchasePrice.trim() && !AMOUNT.test(purchasePrice.replace(/\s/g, ''))) {
      e.purchasePrice = t('validation.amount');
    }
    if (!effectiveBaseUnit) e.baseUnit = t('validation.required');
    const codes = new Set<string>(barcode.trim() ? [barcode.trim()] : []);
    packagings.forEach((p, i) => {
      if (!p.unitId) e[`pk${i}.unit`] = t('validation.required');
      else if (p.unitId === effectiveBaseUnit) e[`pk${i}.unit`] = t('error.packagingBaseUnit');
      else if (packagings.findIndex((o) => o.unitId === p.unitId) !== i)
        e[`pk${i}.unit`] = t('products.form.unitTwice');
      if (!AMOUNT.test(p.factor.replace(/\s/g, '')) || toNumber(p.factor) <= 0)
        e[`pk${i}.factor`] = t('error.packagingFactor');
      const b = p.barcode.trim();
      if (b && !CODE.test(b)) e[`pk${i}.barcode`] = t('products.form.barcodeInvalid');
      else if (b && codes.has(b)) e[`pk${i}.barcode`] = t('error.barcodeTwice', { barcode: b });
      if (b) codes.add(b);
      if (p.salePrice.trim() && !AMOUNT.test(p.salePrice.replace(/\s/g, '')))
        e[`pk${i}.price`] = t('validation.amount');
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) {
      toast.error(t('validation.fixErrors'));
      return;
    }
    setSaving(true);
    const body: SaveProductRequest = {
      name: name.trim(),
      sku: sku.trim() || null,
      barcode: barcode.trim() || null,
      categoryId: categoryId || null,
      description: description.trim() || null,
      baseUnitId: effectiveBaseUnit,
      taxRateId: effectiveTax || null,
      salePrice: toApiAmount(salePrice),
      ...(canSeeCost && { purchasePrice: purchasePrice.trim() ? toApiAmount(purchasePrice) : '0' }),
      packagings: packagings.map((p) => ({
        unitId: p.unitId,
        factor: toApiAmount(p.factor),
        barcode: p.barcode.trim() || null,
        forPurchase: p.forPurchase,
        forSale: p.forSale,
        salePrice: p.salePrice.trim() ? toApiAmount(p.salePrice) : null,
      })),
    };
    try {
      const saved = await api<ProductDetail>(isNew ? '/products' : `/products/${product.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        body: JSON.stringify(body),
      });
      toast.success(
        t(isNew ? 'products.created' : 'products.updated', { name: saved.name, sku: saved.sku }),
      );
      if (isNew) router.replace(`/inventory/products/${saved.id}`);
      else onSaved?.(saved);
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  }

  const unitOptions = (units.data ?? []).map((u) => ({
    value: u.id,
    label: `${u.code} — ${u.name}`,
  }));
  const ratesForSelect = (taxRates.data ?? []).filter((r) => r.isActive || r.id === effectiveTax);

  return (
    <form onSubmit={save} className="space-y-6 pb-24" noValidate>
      {product ? (
        <ProductPhoto product={product} />
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
          {t('photo.afterCreate')}
        </p>
      )}
      <fieldset disabled={readOnly} className="space-y-6">
        <Card title={t('products.form.general')}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              containerClassName="md:col-span-2"
              label={t('products.form.name')}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              placeholder={t('products.form.namePlaceholder')}
              autoFocus={isNew}
            />
            <TextField
              label={t('products.form.sku')}
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              error={errors.sku}
              placeholder={isNew ? nextSku.data?.sku : undefined}
              hint={isNew ? t('products.form.skuHint') : undefined}
              className="font-mono"
            />
            <TextField
              label={t('products.form.barcode')}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              error={errors.barcode}
              hint={t('products.form.barcodeHint')}
              inputMode="numeric"
              className="font-mono"
            />
            <SelectField
              label={t('products.form.category')}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder={t('products.form.noCategory')}
              options={(categories.data ?? [])
                .filter((c) => c.isActive || c.id === categoryId)
                .map((c) => ({ value: c.id, label: c.path }))}
            />
            <SelectField
              label={t('products.form.baseUnit')}
              required
              value={effectiveBaseUnit}
              onChange={(e) => setBaseUnitId(e.target.value)}
              placeholder={units.data ? '' : '…'}
              options={unitOptions}
              error={errors.baseUnit}
              hint={t('products.form.baseUnitHint')}
            />
            <TextAreaField
              containerClassName="md:col-span-2"
              label={t('products.form.description')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </Card>

        <Card title={t('products.form.prices')} description={t('products.form.pricesHelp')}>
          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              label={t('products.form.salePrice', { currency: company?.currency ?? '' })}
              required
              inputMode="decimal"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              error={errors.salePrice}
              placeholder={(0).toFixed(decimals)}
              className="text-right"
            />
            <SelectField
              label={t('products.form.vat')}
              value={effectiveTax}
              onChange={(e) => setTaxRateId(e.target.value)}
              placeholder={t('products.form.noVat')}
              // Show the rate only when the name does not already contain it ("TVA 19 %").
              options={ratesForSelect.map((r) => ({
                value: r.id,
                label: r.name.includes('%')
                  ? r.name
                  : `${r.name} (${formatPercent(r.rate, locale)})`,
              }))}
            />
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">
                {t('products.form.priceIncl')}
              </p>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-semibold text-slate-900">
                {preview.ttc === null ? '—' : money(preview.ttc)}
              </div>
              <p className="mt-1 text-xs text-slate-500">{t('products.form.priceInclHint')}</p>
            </div>

            {canSeeCost && (
              <>
                <TextField
                  label={t('products.form.purchasePrice', { currency: company?.currency ?? '' })}
                  inputMode="decimal"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  error={errors.purchasePrice}
                  placeholder={(0).toFixed(decimals)}
                  className="text-right"
                  hint={t('products.form.purchaseHint')}
                />
                <div className="md:col-span-2">
                  <p className="mb-1 text-sm font-medium text-slate-700">
                    {t('products.form.margin')}
                  </p>
                  <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    {preview.margin === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <>
                        <span
                          className={
                            preview.margin < 0
                              ? 'font-semibold text-red-600'
                              : 'font-semibold text-slate-900'
                          }
                        >
                          {money(preview.margin)}
                        </span>
                        {preview.marginRate !== null && (
                          <Badge tone={preview.margin < 0 ? 'red' : 'green'}>
                            {formatPercent(round(preview.marginRate, 1), locale)}
                          </Badge>
                        )}
                        {preview.margin < 0 && (
                          <span className="text-xs text-red-600">
                            {t('products.form.negativeMargin')}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card
          title={t('products.form.packagings')}
          description={t('products.form.packagingsHelp', { unit: baseUnitCode || '…' })}
          actions={
            !readOnly && (
              <Button
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={() =>
                  setPackagings((rows) => [
                    ...rows,
                    {
                      key: rowKey++,
                      unitId: '',
                      factor: '',
                      barcode: '',
                      forPurchase: true,
                      forSale: true,
                      salePrice: '',
                    },
                  ])
                }
              >
                {t('products.form.addPackaging')}
              </Button>
            )
          }
        >
          {packagings.length === 0 ? (
            <p className="text-sm text-slate-500">{t('products.form.noPackaging')}</p>
          ) : (
            <div className="space-y-3">
              {packagings.map((p, i) => {
                const update = (patch: Partial<PackagingRow>) =>
                  setPackagings((rows) =>
                    rows.map((r) => (r.key === p.key ? { ...r, ...patch } : r)),
                  );
                const unitCode = units.data?.find((u) => u.id === p.unitId)?.code;
                const factor = AMOUNT.test(p.factor.replace(/\s/g, '')) ? toNumber(p.factor) : null;
                // Price per packaging: its own price, or base price × quantity.
                const computed =
                  factor && preview.ht !== null ? round(preview.ht * factor, decimals) : null;
                const own = AMOUNT.test(p.salePrice.replace(/\s/g, ''))
                  ? toNumber(p.salePrice)
                  : null;
                const packHt = own ?? computed;
                const packTtc =
                  packHt === null ? null : round(packHt * (1 + preview.rate / 100), decimals);
                const discount =
                  own !== null && computed ? round(((own - computed) / computed) * 100, 1) : null;
                return (
                  <div key={p.key} className="rounded-lg border border-slate-200 p-3">
                    <div className="grid items-start gap-3 md:grid-cols-[1fr_auto_1fr_auto]">
                      <SelectField
                        label={t('products.form.packUnit')}
                        value={p.unitId}
                        onChange={(e) => update({ unitId: e.target.value })}
                        placeholder={t('common.choose')}
                        options={unitOptions.filter(
                          (o) => o.value !== effectiveBaseUnit || o.value === p.unitId,
                        )}
                        error={errors[`pk${i}.unit`]}
                      />
                      <div>
                        <p className="mb-1 text-sm font-medium text-slate-700">
                          {t('products.form.contains')}
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            className={`${inputClass} w-24 text-right`}
                            inputMode="decimal"
                            value={p.factor}
                            onChange={(e) => update({ factor: e.target.value })}
                            aria-label={t('products.form.contains')}
                            aria-invalid={!!errors[`pk${i}.factor`]}
                          />
                          <span className="text-sm text-slate-500">{baseUnitCode}</span>
                        </div>
                        {errors[`pk${i}.factor`] && (
                          <p className="mt-1 text-xs text-red-600">{errors[`pk${i}.factor`]}</p>
                        )}
                      </div>
                      <TextField
                        label={t('products.form.barcode')}
                        value={p.barcode}
                        onChange={(e) => update({ barcode: e.target.value })}
                        error={errors[`pk${i}.barcode`]}
                        className="font-mono"
                      />
                      {!readOnly && (
                        <IconButton
                          className="mt-7"
                          icon={Trash2}
                          tone="danger"
                          label={t('common.delete')}
                          onClick={() =>
                            setPackagings((rows) => rows.filter((r) => r.key !== p.key))
                          }
                        />
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                      <Checkbox
                        checked={p.forSale}
                        onChange={(e) => update({ forSale: e.target.checked })}
                        label={t('products.form.forSale')}
                      />
                      <Checkbox
                        checked={p.forPurchase}
                        onChange={(e) => update({ forPurchase: e.target.checked })}
                        label={t('products.form.forPurchase')}
                      />
                    </div>
                    <div className="mt-3 grid items-start gap-3 border-t border-slate-100 pt-3 md:grid-cols-2">
                      <TextField
                        label={t('products.form.packSalePrice', { unit: unitCode ?? '…' })}
                        inputMode="decimal"
                        value={p.salePrice}
                        onChange={(e) => update({ salePrice: e.target.value })}
                        error={errors[`pk${i}.price`]}
                        placeholder={computed !== null ? computed.toFixed(decimals) : ''}
                        hint={t('products.form.packSalePriceHint')}
                        className="text-right"
                      />
                      <div>
                        <p className="mb-1 text-sm font-medium text-slate-700">
                          {t('products.form.packPriceIncl')}
                        </p>
                        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                          <span className="font-semibold text-slate-900">
                            {packTtc === null ? '—' : money(packTtc)}
                          </span>
                          {discount !== null && discount !== 0 && (
                            <Badge tone={discount < 0 ? 'green' : 'amber'}>
                              {t('products.form.vsUnit', {
                                value: `${discount > 0 ? '+' : ''}${formatPercent(discount, locale)}`,
                              })}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </fieldset>

      {product && (
        <p className="text-xs text-slate-500">
          {t('products.form.meta', {
            created: formatDateTime(product.createdAt, locale),
            updated: formatDateTime(product.updatedAt, locale),
          })}
        </p>
      )}

      {canWrite && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-6">
            {product ? (
              product.isActive ? (
                <Button
                  variant="ghost"
                  icon={PowerOff}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setToggling(true)}
                >
                  {t('products.deactivate')}
                </Button>
              ) : (
                <Button variant="ghost" icon={Power} onClick={() => setToggling(true)}>
                  {t('products.activate')}
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => router.push('/inventory/products')}
                disabled={saving}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" icon={Save} loading={saving}>
                {isNew ? t('common.create') : t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {product && (
        <ConfirmDialog
          open={toggling}
          tone={product.isActive ? 'danger' : 'primary'}
          title={product.isActive ? t('products.deactivate') : t('products.activate')}
          message={t(product.isActive ? 'products.confirmDeactivate' : 'products.confirmActivate', {
            name: product.name,
          })}
          confirmLabel={product.isActive ? t('products.deactivate') : t('products.activate')}
          onClose={() => setToggling(false)}
          onConfirm={async () => {
            try {
              const saved = await api<ProductDetail>(
                `/products/${product.id}/${product.isActive ? 'deactivate' : 'activate'}`,
                {
                  method: 'POST',
                },
              );
              setToggling(false);
              toast.success(
                t(saved.isActive ? 'products.activated' : 'products.deactivated', {
                  name: saved.name,
                }),
              );
              onSaved?.(saved);
            } catch (err) {
              toast.error(errorMessage(err, t));
            }
          }}
        />
      )}
    </form>
  );
}

function round(n: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Drops useless zeros for editing: "1.2500" → "1.25". */
function formatInput(v: string): string {
  return String(Number(v));
}
