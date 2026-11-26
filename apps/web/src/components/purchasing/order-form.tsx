'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import {
  CheckCircle2,
  ExternalLink,
  LayoutGrid,
  Package,
  ScanBarcode,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import type {
  BarcodeMatch,
  Paginated,
  ProductDetail,
  ProductListItem,
  PurchaseOrderDetail,
  PurchaseOrderInput,
  SupplierListItem,
  WarehouseDto,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  ErrorBox,
  Field,
  Spinner,
  btnPrimary,
  btnSecondary,
  errorMessages,
  fieldClass,
  inputClass,
} from './ui';
import { ProductPicker } from './product-picker';

/** Same rule as the API: non-negative, at most 4 decimals. */
const DECIMAL_4 = /^\d{1,14}(\.\d{1,4})?$/;
const PERCENT = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;

interface UnitOption {
  id: string;
  code: string;
  /** Base units per unit */
  factor: string;
}

interface Line {
  key: string;
  productId: string;
  sku: string;
  name: string;
  baseUnitCode: string;
  units: UnitOption[];
  unitId: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  /** The product's own VAT %, used when the supplier has no rate of its own */
  productTaxRate: string;
  /** Per base unit; only for users who may see cost */
  averageCost?: string;
  /** True until the user types a price: unit changes then re-suggest it */
  autoPrice: boolean;
}

let keySeq = 0;
const newKey = () => `l${++keySeq}`;

function unitsOf(p: ProductDetail): UnitOption[] {
  return [
    { id: p.baseUnit.id, code: p.baseUnit.code, factor: '1' },
    ...p.packUnits
      .filter((u) => u.forPurchase)
      .map((u) => ({ id: u.unit.id, code: u.unit.code, factor: u.factor })),
  ];
}

function suggestedPrice(averageCost: string | undefined, factor: string): string {
  if (!averageCost || Number(averageCost) === 0) return '';
  return (Math.round(Number(averageCost) * Number(factor) * 10000) / 10000).toString();
}
/** Display-only mirror of the API: half up to the millime (3 decimals). toPrecision drops float noise
 *  (1.2345 × 1000 is 1234.4999…, read as 1234.5 → 1.235). The API stores the real figures. */
const millimes = (v: number) => Math.round(Number((v * 1000).toPrecision(12))) / 1000;
function amounts(l: Line & { taxRate: string }) {
  const gross = millimes(Number(l.quantity || 0) * Number(l.unitPrice || 0));
  const discount = millimes((gross * Number(l.discountPct || 0)) / 100);
  const net = gross - discount;
  const tax = millimes((net * Number(l.taxRate || 0)) / 100);
  return { gross, discount, net, tax };
}

export interface OrderFormProps {
  /** Existing draft to edit; omitted for a new order */
  initial?: PurchaseOrderDetail;
  presetSupplierId?: string | null;
  canConfirm: boolean;
  /**
   * Called after a successful save. `confirmed` when it was also confirmed; `warning` when
   * the save worked but confirming did not (the order stays a draft).
   */
  onSaved: (order: PurchaseOrderDetail, confirmed: boolean, warning?: string | string[]) => void;
  onCancel: () => void;
}

export function OrderForm({
  initial,
  presetSupplierId,
  canConfirm,
  onSaved,
  onCancel,
}: OrderFormProps) {
  const { t, money, qty, lang } = useI18n();
  /** In French the inputs show a decimal comma ("14,500"); the value stays "14.500". */
  const show = (v: string) => (lang === 'fr' ? v.replace('.', ',') : v);
  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDto[]>([]);
  const [supplierId, setSupplierId] = useState(initial?.supplier.id ?? presetSupplierId ?? '');
  const [warehouseId, setWarehouseId] = useState(initial?.warehouse.id ?? '');
  const [orderDate, setOrderDate] = useState(initial?.orderDate ?? localToday());
  const [expectedDate, setExpectedDate] = useState(initial?.expectedDate ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lines, setLines] = useState<Line[]>([]);
  const [loadingLines, setLoadingLines] = useState(Boolean(initial?.lines.length));
  const [saving, setSaving] = useState<null | 'draft' | 'confirm'>(null);
  const [error, setError] = useState<string | string[] | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    api<Paginated<SupplierListItem>>('/purchasing/suppliers?status=active&pageSize=100')
      .then((r) => setSuppliers(r.items))
      .catch(() => setSuppliers([]));
    api<WarehouseDto[]>('/inventory/warehouses')
      .then((ws) => {
        const active = ws.filter((w) => w.isActive);
        setWarehouses(active);
        setWarehouseId((cur) => cur || (active.length === 1 ? active[0].id : cur));
      })
      .catch(() => setWarehouses([]));
  }, []);

  // Editing a draft: rebuild each line with its product's purchase units.
  useEffect(() => {
    if (!initial?.lines.length) return;
    const ids = [...new Set(initial.lines.map((l) => l.product.id))];
    Promise.all(ids.map((id) => api<ProductDetail>(`/inventory/products/${id}`).catch(() => null)))
      .then((products) => {
        const byId = new Map(products.filter(Boolean).map((p) => [p!.id, p!]));
        setLines(
          initial.lines.map((l) => {
            const p = byId.get(l.product.id);
            const units = p
              ? unitsOf(p)
              : [{ id: l.unit.id, code: l.unit.code, factor: l.unitFactor }];
            if (!units.some((u) => u.id === l.unit.id)) {
              units.push({ id: l.unit.id, code: l.unit.code, factor: l.unitFactor });
            }
            return {
              key: newKey(),
              productId: l.product.id,
              sku: l.product.sku,
              name: l.product.name,
              baseUnitCode: l.product.baseUnitCode,
              units,
              unitId: l.unit.id,
              quantity: trimZeros(l.quantity),
              unitPrice: trimZeros(l.unitPrice),
              discountPct: trimZeros(l.discountPct),
              productTaxRate: p?.taxRate?.rate ?? l.taxRate,
              averageCost: p?.averageCost,
              autoPrice: false,
            };
          }),
        );
      })
      .finally(() => setLoadingLines(false));
  }, [initial]);

  function addProduct(p: ProductDetail, unitId?: string) {
    addLine(p, unitId);
    setFlash(p.id);
    setTimeout(() => setFlash(null), 900);
  }

  function addLine(p: ProductDetail, unitId?: string) {
    const units = unitsOf(p);
    const unit = units.find((u) => u.id === unitId) ?? units[0];
    setLines((ls) => {
      // Scanning the same product + unit again adds one more instead of a new line.
      const same = ls.find((l) => l.productId === p.id && l.unitId === unit.id);
      if (same) {
        return ls.map((l) =>
          l === same ? { ...l, quantity: String(Number(l.quantity || 0) + 1) } : l,
        );
      }
      return [
        ...ls,
        {
          key: newKey(),
          productId: p.id,
          sku: p.sku,
          name: p.name,
          baseUnitCode: p.baseUnit.code,
          units,
          unitId: unit.id,
          quantity: '1',
          unitPrice: suggestedPrice(p.averageCost, unit.factor),
          discountPct: '0',
          productTaxRate: p.taxRate?.rate ?? '0',
          averageCost: p.averageCost,
          autoPrice: true,
        },
      ];
    });
  }

  /** From the catalogue: products already on the order keep their line as it is. */
  function addFromCatalogue(products: ProductDetail[]) {
    const present = new Set(lines.map((l) => l.productId));
    products.filter((p) => !present.has(p.id)).forEach((p) => addLine(p));
  }

  const update = (key: string, patch: Partial<Line>) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.unitId && l.autoPrice) {
          const u = l.units.find((x) => x.id === patch.unitId)!;
          next.unitPrice = suggestedPrice(l.averageCost, u.factor);
        }
        if (patch.unitPrice !== undefined) next.autoPrice = false;
        return next;
      }),
    );

  // Same rule as the API: the supplier's VAT rate, when it has one, wins over the product's.
  const supplierRate = suppliers.find((s) => s.id === supplierId)?.taxRate ?? null;
  const withRate = (l: Line) => ({ ...l, taxRate: supplierRate?.rate ?? l.productTaxRate });

  const totals = useMemo(() => {
    const parts = lines.map((l) => amounts(withRate(l)));
    const subtotal = parts.reduce((s, a) => s + a.gross, 0);
    const discount = parts.reduce((s, a) => s + a.discount, 0);
    const tax = parts.reduce((s, a) => s + a.tax, 0);
    return { subtotal, discount, tax, total: subtotal - discount + tax };
  }, [lines, supplierRate]);

  const lineErrors = (l: Line) => ({
    quantity: !DECIMAL_4.test(l.quantity) || Number(l.quantity) <= 0,
    unitPrice: !DECIMAL_4.test(l.unitPrice),
    discountPct: !PERCENT.test(l.discountPct || '0'),
  });
  const headerErrors = {
    supplier: !supplierId ? t('pof.supplierErr') : null,
    warehouse: !warehouseId ? t('pof.warehouseErr') : null,
    expected: expectedDate && expectedDate < orderDate ? t('pof.expectedErr') : null,
  };
  const hasErrors =
    Object.values(headerErrors).some(Boolean) ||
    lines.some((l) => Object.values(lineErrors(l)).some(Boolean));

  async function save(andConfirm: boolean) {
    setSubmitted(true);
    setError(null);
    if (hasErrors) return;
    if (andConfirm && lines.length === 0) {
      setError(t('pof.needLine'));
      return;
    }
    setSaving(andConfirm ? 'confirm' : 'draft');
    const body: PurchaseOrderInput = {
      supplierId,
      warehouseId,
      orderDate,
      expectedDate: expectedDate || null,
      notes: notes.trim() || null,
      lines: lines.map((l) => ({
        productId: l.productId,
        unitId: l.unitId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct || '0',
      })),
    };
    try {
      let order = initial
        ? await api<PurchaseOrderDetail>(`/purchasing/orders/${initial.id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          })
        : await api<PurchaseOrderDetail>('/purchasing/orders', {
            method: 'POST',
            body: JSON.stringify(body),
          });
      if (andConfirm) {
        try {
          order = await api<PurchaseOrderDetail>(`/purchasing/orders/${order.id}/confirm`, {
            method: 'POST',
          });
        } catch (e) {
          // Saved as a draft, but not confirmed: land on the draft and say why.
          onSaved(order, false, errorMessages(e));
          return;
        }
      }
      onSaved(order, andConfirm);
    } catch (e) {
      setError(errorMessages(e));
    } finally {
      setSaving(null);
    }
  }

  const busy = saving !== null;

  return (
    <div className="space-y-5">
      {error && <ErrorBox message={error} />}

      {/* Header */}
      <section
        className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        style={{ animationDelay: '80ms' }}
      >
        <fieldset disabled={busy} className="grid gap-4 md:grid-cols-12">
          <Field
            label={t('pof.supplier')}
            className="md:col-span-5"
            error={submitted ? headerErrors.supplier : null}
            hint={
              supplierRate
                ? t('pof.vatSupplier', { name: supplierRate.name })
                : supplierId
                  ? t('pof.vatProduct')
                  : undefined
            }
          >
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={clsx(inputClass, submitted && headerErrors.supplier && 'border-red-400!')}
            >
              <option value="">{t('pof.supplierPh')}</option>
              {initial && !suppliers.some((s) => s.id === initial.supplier.id) && (
                <option value={initial.supplier.id}>
                  {initial.supplier.code} · {initial.supplier.name}
                </option>
              )}
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t('pof.warehouse')}
            className="md:col-span-3"
            error={submitted ? headerErrors.warehouse : null}
          >
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={clsx(inputClass, submitted && headerErrors.warehouse && 'border-red-400!')}
            >
              <option value="">{t('pof.warehousePh')}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pof.orderDate')} className="md:col-span-2">
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value || localToday())}
              className={inputClass}
            />
          </Field>
          <Field label={t('pof.expected')} className="md:col-span-2" error={headerErrors.expected}>
            <input
              type="date"
              value={expectedDate}
              min={orderDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className={clsx(inputClass, headerErrors.expected && 'border-red-400!')}
            />
          </Field>
          <Field label={t('pof.notes')} className="md:col-span-12">
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('pof.notesPh')}
              className={inputClass}
            />
          </Field>
        </fieldset>
      </section>

      {/* Lines */}
      <section
        className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ animationDelay: '160ms' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-slate-900">
            {t('pof.products')}{' '}
            {lines.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                {lines.length}
              </span>
            )}
          </h2>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <ProductSearch onPick={addProduct} disabled={busy} />
            <button
              type="button"
              className={clsx(btnSecondary, 'justify-center')}
              onClick={() => setPicking(true)}
              disabled={busy}
            >
              <LayoutGrid className="size-4" /> {t('pick.browse')}
            </button>
          </div>
        </div>
        <ProductPicker
          open={picking}
          onClose={() => setPicking(false)}
          onAdd={addFromCatalogue}
          inOrder={new Set(lines.map((l) => l.productId))}
        />

        {loadingLines ? (
          <div className="grid place-items-center py-12">
            <Spinner className="size-6 text-amber-500" />
          </div>
        ) : lines.length === 0 ? (
          <div className="animate-fade flex flex-col items-center px-6 py-12 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100 ring-8 ring-amber-50">
              <ScanBarcode className="size-6 text-orange-600" />
            </div>
            <p className="mt-4 font-medium text-slate-800">{t('pof.emptyTitle')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('pof.emptyText')}</p>
            <button
              type="button"
              className={clsx(btnPrimary, 'mt-5')}
              onClick={() => setPicking(true)}
              disabled={busy}
            >
              <LayoutGrid className="size-4" /> {t('pick.browse')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="w-10 px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">{t('pof.col.product')}</th>
                  <th className="w-36 px-3 py-2.5">{t('pof.col.unit')}</th>
                  <th className="w-28 px-3 py-2.5 text-right">{t('pof.col.qty')}</th>
                  <th className="w-32 px-3 py-2.5 text-right">{t('pof.col.price')}</th>
                  <th className="w-24 px-3 py-2.5 text-right">{t('pof.col.disc')}</th>
                  <th className="w-20 px-3 py-2.5 text-right">{t('pof.col.tax')}</th>
                  <th className="w-32 px-3 py-2.5 text-right">{t('pof.col.total')}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l, i) => {
                  const err = submitted ? lineErrors(l) : null;
                  const unit = l.units.find((u) => u.id === l.unitId);
                  const rated = withRate(l);
                  const a = amounts(rated);
                  return (
                    <tr
                      key={l.key}
                      className={clsx(
                        'animate-rise align-top transition-colors duration-700',
                        flash === l.productId && 'bg-amber-50',
                      )}
                    >
                      <td className="px-3 py-3 text-xs text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/inventory/products/${l.productId}`}
                          target="_blank"
                          title={t('pof.viewProduct')}
                          className="group inline-flex items-center gap-1 font-medium text-slate-900 hover:text-orange-700"
                        >
                          {l.name}
                          <ExternalLink className="size-3 opacity-0 transition group-hover:opacity-100" />
                        </Link>
                        <p className="font-mono text-xs text-slate-400">{l.sku}</p>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={l.unitId}
                          disabled={busy}
                          onChange={(e) => update(l.key, { unitId: e.target.value })}
                          className={clsx(fieldClass, 'w-full px-2')}
                        >
                          {l.units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.code}
                              {u.factor !== '1' ? ` ×${qty(u.factor)}` : ''}
                            </option>
                          ))}
                        </select>
                        {unit && unit.factor !== '1' && Number(l.quantity) > 0 && (
                          <p className="mt-1 text-xs text-slate-400">
                            = {qty(Number(l.quantity) * Number(unit.factor))} {l.baseUnitCode}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          inputMode="decimal"
                          value={show(l.quantity)}
                          disabled={busy}
                          onChange={(e) =>
                            update(l.key, { quantity: decimalInput(e.target.value) })
                          }
                          className={clsx(
                            fieldClass,
                            'w-full px-2 text-right tabular-nums',
                            err?.quantity && 'animate-shake border-red-400!',
                          )}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          inputMode="decimal"
                          value={show(l.unitPrice)}
                          placeholder={lang === 'fr' ? '0,000' : '0.000'}
                          disabled={busy}
                          onChange={(e) =>
                            update(l.key, { unitPrice: decimalInput(e.target.value) })
                          }
                          className={clsx(
                            fieldClass,
                            'w-full px-2 text-right tabular-nums',
                            err?.unitPrice && 'animate-shake border-red-400!',
                          )}
                        />
                        {l.autoPrice && l.unitPrice && (
                          <p className="mt-1 text-right text-[11px] text-slate-400">
                            {t('pof.fromCost')}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          inputMode="decimal"
                          value={show(l.discountPct)}
                          disabled={busy}
                          onChange={(e) =>
                            update(l.key, { discountPct: decimalInput(e.target.value) })
                          }
                          className={clsx(
                            fieldClass,
                            'w-full px-2 text-right tabular-nums',
                            err?.discountPct && 'animate-shake border-red-400!',
                          )}
                        />
                      </td>
                      <td
                        className={clsx(
                          'px-3 py-3 text-right tabular-nums',
                          supplierRate ? 'font-medium text-orange-700' : 'text-slate-500',
                        )}
                        title={
                          supplierRate
                            ? t('pof.rateSupplier', { name: supplierRate.name })
                            : t('pof.rateProduct')
                        }
                      >
                        {qty(rated.taxRate)}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-slate-900 tabular-nums">
                        {money(a.net)}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                          aria-label={t('pof.remove', { name: l.name })}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div className="flex justify-end border-t border-slate-100 bg-gradient-to-br from-slate-50 to-amber-50/40 px-5 py-4">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <Row label={t('pof.subtotal')} value={totals.subtotal} />
            {totals.discount > 0 && <Row label={t('pof.discounts')} value={-totals.discount} />}
            <Row label={t('pof.tax')} value={totals.tax} />
            <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
              <dt className="font-semibold text-slate-900">{t('pof.total')}</dt>
              <dd className="text-xl font-semibold text-orange-700 tabular-nums">
                {money(millimes(totals.total))}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Actions */}
      <div
        className="animate-rise sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 shadow-lg backdrop-blur"
        style={{ animationDelay: '240ms' }}
      >
        <p className="mr-auto hidden text-xs text-slate-500 sm:block">{t('pof.serverNote')}</p>
        <button className={btnSecondary} onClick={onCancel} disabled={busy}>
          {t('pof.discard')}
        </button>
        <button className={btnSecondary} onClick={() => save(false)} disabled={busy}>
          {saving === 'draft' ? <Spinner /> : <CheckCircle2 className="size-4" />}
          {t('pof.saveDraft')}
        </button>
        {canConfirm && (
          <button className={btnPrimary} onClick={() => save(true)} disabled={busy}>
            {saving === 'confirm' ? <Spinner /> : <Send className="size-4" />}
            {t('pof.saveConfirm')}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  const { money } = useI18n();
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{label}</dt>
      <dd className="tabular-nums">{money(millimes(value))}</dd>
    </div>
  );
}

// ── Product search (type-ahead + barcode scan) ───────────────────────────────

function ProductSearch({
  onPick,
  disabled,
}: {
  onPick: (p: ProductDetail, unitId?: string) => void;
  disabled?: boolean;
}) {
  const { t, qty } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ProductListItem[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ search: term, pageSize: '8', status: 'active' });
      api<Paginated<ProductListItem>>(`/inventory/products?${qs}`)
        .then((r) => {
          if (cancelled) return;
          setResults(r.items);
          setActive(0);
        })
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function pick(id: string, unitId?: string) {
    const p = await api<ProductDetail>(`/inventory/products/${id}`);
    onPick(p, unitId);
    setQ('');
    setResults([]);
    setOpen(false);
    input.current?.focus();
  }

  async function onEnter() {
    const term = q.trim();
    if (!term) return;
    // Typed text with a highlighted result: take it. A barcode scanner "types" digits
    // then Enter: look the code up (also when the search found nothing).
    const looksLikeBarcode = /^\d{6,}$/.test(term);
    if (!looksLikeBarcode && results[active]) return pick(results[active].id);
    try {
      const match = await api<BarcodeMatch>(
        `/inventory/products/barcode/${encodeURIComponent(term)}`,
      );
      if (match.product.isActive) return pick(match.product.id, match.packUnit?.unit.id);
    } catch {
      /* not a barcode: fall back to the highlighted search result */
    }
    if (results[active]) return pick(results[active].id);
    setNotFound(term);
    setTimeout(() => setNotFound(null), 1800);
  }

  return (
    <div ref={box} className="relative w-full sm:w-96">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={input}
        value={q}
        disabled={disabled}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            void onEnter();
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder={t('pof.searchPh')}
        className={clsx(inputClass, 'pr-9 pl-9', notFound && 'animate-shake border-red-400!')}
      />
      {loading && <Spinner className="absolute top-1/2 right-3 -translate-y-1/2 text-amber-500" />}
      {notFound && (
        <p className="animate-fade absolute top-full right-0 mt-1 text-xs text-red-600">
          {t('pof.notFound', { q: notFound })}
        </p>
      )}
      {open && q.trim() && results.length > 0 && (
        <ul className="animate-pop absolute top-full right-0 left-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {results.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => void pick(p.id)}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition',
                  i === active ? 'bg-amber-50' : 'hover:bg-slate-50',
                )}
              >
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100">
                  <Package className="size-4 text-slate-500" />
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {p.name}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">{p.sku}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                  {t('pof.inStock', { qty: qty(p.stockOnHand), unit: p.baseUnit.code })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Accepts a decimal comma ("0,85", as typed in French) and stores "0.85". */
function decimalInput(v: string): string {
  return v.trim().replace(',', '.');
}

/** "12.5000" → "12.5", "3.0000" → "3" (for editable inputs). */
function trimZeros(v: string): string {
  return v.includes('.') ? v.replace(/\.?0+$/, '') : v;
}
