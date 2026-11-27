'use client';

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ClipboardList,
  FilePen,
  Mail,
  MapPin,
  PackageCheck,
  PackagePlus,
  Phone,
  Search,
  Trash2,
  Truck,
} from 'lucide-react';
import type {
  BarcodeMatch,
  GoodsReceiptDetail,
  GoodsReceiptInput,
  Paginated,
  ProductDetail,
  ProductListItem,
  PurchaseOrderDetail,
  PurchaseOrderListItem,
  ReceiptQuality,
  SupplierDetail,
  WarehouseDto,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AccessDenied } from '@/components/page-header';
import { BarcodeScanBox } from '@/components/products/barcode-scan-box';
import { SupplierSelect } from '@/components/invoicing/supplier-select';
import {
  ErrorBox,
  Field,
  Modal,
  PurchasingHero,
  Spinner,
  btnPrimary,
  btnSecondary,
  errorMessages,
  fieldClass,
  inputClass,
  useSuccess,
} from '@/components/purchasing/ui';

const DECIMAL_4 = /^\d{0,14}([.,]\d{0,4})?$/;

interface UnitChoice {
  id: string;
  code: string;
  factor: number;
}

/** One received line as typed */
interface Line {
  key: string;
  product: { id: string; sku: string; name: string; barcode: string | null };
  units: UnitChoice[];
  /** Last purchase cost per base unit (when the user may see costs) */
  baseCost: number;
  unitId: string;
  qty: string;
  price: string;
  priceTouched: boolean;
  refused: string;
  reason: string;
  lot: string;
  expiry: string;
  quality: ReceiptQuality;
  open: boolean;
}

let seq = 0;
const newKey = () => `r${++seq}`;

export default function NewGoodsReceiptPage() {
  return (
    <Suspense>
      <NewReceipt />
    </Suspense>
  );
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Same as the API: half up to the millime. */
const millimes = (v: number) => Math.round(Number((v * 1000).toPrecision(12))) / 1000;
const fmt4 = (n: number) => String(Number(n.toFixed(4)));

function NewReceipt() {
  const { can } = useAuth();
  const router = useRouter();
  const { t, money, qty, date, lang } = useI18n();
  const params = useSearchParams();
  const draftId = params.get('draftId') ?? '';
  const presetOrderId = params.get('orderId') ?? '';
  const { burst, celebrate } = useSuccess();

  const [supplier, setSupplier] = useState<{ id: string; name: string } | null>(null);
  const [supplierInfo, setSupplierInfo] = useState<SupplierDetail | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseDto[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [receivedDate, setReceivedDate] = useState(localToday());
  const [supplierRef, setSupplierRef] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState<GoodsReceiptDetail | null>(null);
  const [orderPicker, setOrderPicker] = useState(false);
  const [saving, setSaving] = useState<false | 'draft' | 'post'>(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | string[] | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const cache = useRef(new Map<string, ProductDetail>());

  /** Product detail (units, last cost), fetched once per product. */
  async function productDetail(id: string): Promise<ProductDetail> {
    const hit = cache.current.get(id);
    if (hit) return hit;
    const p = await api<ProductDetail>(`/inventory/products/${id}`);
    cache.current.set(id, p);
    return p;
  }

  function unitsOf(p: ProductDetail): UnitChoice[] {
    return [
      { id: p.baseUnit.id, code: p.baseUnit.code, factor: 1 },
      ...p.packUnits
        .filter((u) => u.forPurchase)
        .map((u) => ({ id: u.unit.id, code: u.unit.code, factor: Number(u.factor) })),
    ];
  }

  async function makeLine(
    productId: string,
    patch: Partial<
      Pick<Line, 'unitId' | 'qty' | 'price' | 'refused' | 'reason' | 'lot' | 'expiry' | 'quality'>
    > = {},
  ): Promise<Line> {
    const p = await productDetail(productId);
    const units = unitsOf(p);
    const unitId =
      patch.unitId && units.some((u) => u.id === patch.unitId) ? patch.unitId : units[0].id;
    const factor = units.find((u) => u.id === unitId)?.factor ?? 1;
    const baseCost = Number(p.lastPurchaseCost ?? 0);
    const hasDetails = Boolean(
      patch.lot || patch.expiry || Number(patch.refused) > 0 || patch.quality === 'NON_CONFORM',
    );
    return {
      key: newKey(),
      product: { id: p.id, sku: p.sku, name: p.name, barcode: p.barcode },
      units,
      baseCost,
      unitId,
      qty: patch.qty ?? '',
      price: patch.price ?? (baseCost > 0 ? fmt4(baseCost * factor) : ''),
      priceTouched: patch.price !== undefined,
      refused: patch.refused ?? '',
      reason: patch.reason ?? '',
      lot: patch.lot ?? '',
      expiry: patch.expiry ?? '',
      quality: patch.quality ?? 'CONFORM',
      open: hasDetails,
    };
  }

  useEffect(() => {
    api<WarehouseDto[] | Paginated<WarehouseDto>>('/inventory/warehouses')
      .then((r) => {
        const list = (Array.isArray(r) ? r : r.items).filter((w) => w.isActive !== false);
        setWarehouses(list);
        setWarehouseId((w) => w || list[0]?.id || '');
      })
      .catch(() => undefined);
  }, []);

  // Supplier card
  useEffect(() => {
    setSupplierInfo(null);
    if (!supplier) return;
    api<SupplierDetail>(`/purchasing/suppliers/${supplier.id}`)
      .then(setSupplierInfo)
      .catch(() => undefined);
  }, [supplier]);

  // Draft being edited
  useEffect(() => {
    if (!draftId) return;
    api<GoodsReceiptDetail>(`/purchasing/receipts/${draftId}`)
      .then(async (d) => {
        if (d.status !== 'DRAFT') {
          router.replace(`/purchasing/receipts/${d.id}`);
          return;
        }
        setDraft(d);
        setSupplier({ id: d.supplier.id, name: d.supplier.name });
        setWarehouseId(d.warehouse.id);
        setReceivedDate(d.receivedAt.slice(0, 10));
        setSupplierRef(d.supplierRef ?? '');
        setNotes(d.notes ?? '');
        const n = (v: string) => (Number(v) ? String(Number(v)) : '');
        setLines(
          await Promise.all(
            d.lines.map((l) =>
              makeLine(l.product.id, {
                unitId: l.unit.id,
                qty: n(l.quantity),
                price: String(Number(l.unitPrice)),
                refused: n(l.rejectedQty),
                reason: l.rejectReason ?? '',
                lot: l.lotNumber ?? '',
                expiry: l.expiryDate ?? '',
                quality: l.quality,
              }),
            ),
          ),
        );
      })
      .catch((e) => setError(errorMessages(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // ?orderId= : pre-fill from that order (optional shortcut)
  useEffect(() => {
    if (!presetOrderId || draftId) return;
    void fillFromOrder(presetOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetOrderId]);

  const rows = useMemo(
    () =>
      lines.map((l) => {
        const now = l.qty === '' ? 0 : Number(l.qty.replace(',', '.'));
        const refused = l.refused === '' ? 0 : Number(l.refused.replace(',', '.'));
        const price = l.price === '' ? 0 : Number(l.price.replace(',', '.'));
        const unit = l.units.find((u) => u.id === l.unitId) ?? l.units[0];
        const value = millimes(now * price);
        const needsReason = refused > 0 || l.quality === 'NON_CONFORM';
        const reasonMissing = needsReason && !l.reason.trim();
        const qtyMissing = now <= 0 && refused <= 0;
        const expired = Boolean(l.expiry) && l.expiry < localToday();
        const hasDetails = Boolean(l.lot || l.expiry || refused > 0 || l.quality !== 'CONFORM');
        return {
          l,
          now,
          refused,
          price,
          unit,
          value,
          reasonMissing,
          qtyMissing,
          expired,
          hasDetails,
        };
      }),
    [lines],
  );
  const total = rows.reduce((s, r) => s + r.value, 0);
  const hasErrors = rows.some((r) => r.reasonMissing || r.qtyMissing);
  const dateError = receivedDate > localToday() ? t('grf.dateErr') : null;

  if (!can('purchasing.receipt.create')) {
    return <AccessDenied permission="purchasing.receipt.create" what={t('grf.title')} />;
  }

  const show = (v: string) => (lang === 'fr' ? v.replace('.', ',') : v);
  const num = (v: string) => v.trim().replace(',', '.');
  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pulse = (key: string) => {
    setFlash(key);
    setTimeout(() => setFlash(null), 900);
  };

  async function addProduct(p: ProductListItem, unitId?: string) {
    const line = await makeLine(p.id, { unitId, qty: '1' });
    setLines((ls) => [...ls, line]);
    pulse(line.key);
  }

  /** A scan adds one unit: on the last line of that product and unit, or a new line. */
  async function scan(m: BarcodeMatch): Promise<string | void> {
    const p = await productDetail(m.product.id);
    const unitId = m.packUnit?.unit.id ?? p.baseUnit.id;
    const existing = [...lines].reverse().find((l) => l.product.id === p.id && l.unitId === unitId);
    if (existing) {
      setLine(existing.key, { qty: fmt4(Number(existing.qty || 0) + 1) });
      pulse(existing.key);
      return;
    }
    await addProduct(m.product, unitId);
  }

  async function fillFromOrder(orderId: string) {
    try {
      const o = await api<PurchaseOrderDetail>(`/purchasing/orders/${orderId}`);
      setSupplier({ id: o.supplier.id, name: o.supplier.name });
      if (o.warehouse?.id) setWarehouseId(o.warehouse.id);
      const added = await Promise.all(
        o.lines
          .filter((l) => Number(l.quantity) - Number(l.receivedQty) > 0)
          .map((l) =>
            makeLine(l.product.id, {
              unitId: l.unit.id,
              qty: fmt4(Number(l.quantity) - Number(l.receivedQty)),
              price: fmt4((Number(l.unitPrice) * (100 - Number(l.discountPct))) / 100),
            }),
          ),
      );
      setLines((ls) => [...ls, ...added]);
      setOrderPicker(false);
    } catch (e) {
      setError(errorMessages(e));
    }
  }

  async function submit(asDraft: boolean) {
    setSubmitted(true);
    setError(null);
    if (!supplier) return setError(t('grr.err.supplier'));
    if (!lines.length) return setError(t('grr.err.noLines'));
    if (hasErrors || dateError) {
      setLines((ls) =>
        ls.map((l) => {
          const r = rows.find((x) => x.l.key === l.key);
          return r?.reasonMissing ? { ...l, open: true } : l;
        }),
      );
      return;
    }
    setSaving(asDraft ? 'draft' : 'post');
    const body: GoodsReceiptInput = {
      supplierId: supplier.id,
      warehouseId: warehouseId || undefined,
      receivedDate,
      supplierRef: supplierRef.trim() || null,
      notes: notes.trim() || null,
      lines: rows.map((r) => ({
        productId: r.l.product.id,
        unitId: r.l.unitId,
        quantity: num(r.l.qty) || '0',
        unitPrice: num(r.l.price) || '0',
        rejectedQty: num(r.l.refused) || '0',
        rejectReason: r.l.reason.trim() || null,
        lotNumber: r.l.lot.trim() || null,
        expiryDate: r.l.expiry || null,
        quality: r.l.quality,
      })),
    };
    try {
      let receipt: GoodsReceiptDetail;
      if (draft) {
        receipt = await api<GoodsReceiptDetail>(`/purchasing/receipts/${draft.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        if (!asDraft) {
          receipt = await api<GoodsReceiptDetail>(`/purchasing/receipts/${draft.id}/post`, {
            method: 'POST',
          });
        }
      } else {
        receipt = await api<GoodsReceiptDetail>('/purchasing/receipts', {
          method: 'POST',
          body: JSON.stringify({ ...body, asDraft }),
        });
      }
      celebrate(asDraft ? t('grx.draftSaved') : t('grf.saved', { number: receipt.number }), () =>
        router.push(`/purchasing/receipts/${receipt.id}`),
      );
    } catch (e) {
      setError(errorMessages(e));
      setSaving(false);
    }
  }

  const busy = Boolean(saving);

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-4">
      <PurchasingHero
        icon={PackageCheck}
        title={draft ? t('grx.editTitle') : t('grf.title')}
        subtitle={t('grr.formSubtitle')}
        crumb={[
          { label: t('gr.title'), href: '/purchasing/receipts' },
          { label: draft ? t('grx.editCrumb') : t('grf.crumb') },
        ]}
      />

      {error && <ErrorBox message={error} />}

      {/* ── 1. Reception + supplier ── */}
      <div className="grid gap-5 lg:grid-cols-5">
        <section
          className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3"
          style={{ animationDelay: '60ms' }}
        >
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
            <Step n={1} /> {t('grr.sec.receipt')}
          </h2>
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('bill.f.supplier')}
              className="sm:col-span-2"
              error={submitted && !supplier ? t('grr.err.supplier') : null}
            >
              <SupplierSelect
                value={supplier}
                disabled={busy}
                onChange={(s) => setSupplier(s ? { id: s.id, name: s.name } : null)}
              />
            </Field>
            <Field label={t('grf.date')} error={submitted ? dateError : null}>
              <input
                type="date"
                value={receivedDate}
                max={localToday()}
                onChange={(e) => setReceivedDate(e.target.value || localToday())}
                className={inputClass}
              />
            </Field>
            <Field label={t('grp.warehouse')}>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className={inputClass}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('grf.bl')}>
              <input
                value={supplierRef}
                maxLength={60}
                onChange={(e) => setSupplierRef(e.target.value)}
                placeholder={t('grf.blPh')}
                className={clsx(inputClass, 'font-mono')}
              />
            </Field>
            <Field label={t('grf.notes')}>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('grf.notesPh')}
                className={inputClass}
              />
            </Field>
          </fieldset>
        </section>

        <section
          className="animate-rise rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-amber-50/40 p-5 shadow-sm lg:col-span-2"
          style={{ animationDelay: '120ms' }}
        >
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
            <Truck className="size-4 text-orange-600" /> {t('grp.supplier')}
          </h2>
          {!supplier ? (
            <p className="text-sm text-slate-400">{t('grr.sup.pickSupplier')}</p>
          ) : !supplierInfo ? (
            <Spinner className="text-amber-500" />
          ) : (
            <div className="animate-fade space-y-3 text-sm">
              <div>
                <p className="text-base font-semibold text-slate-900">{supplierInfo.name}</p>
                <p className="font-mono text-xs text-slate-400">{supplierInfo.code}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <SupInfo label={t('grr.sup.taxId')} value={supplierInfo.taxId} mono />
                <SupInfo label="RNE" value={supplierInfo.rne} mono />
                <SupInfo icon={Phone} label={t('grr.sup.phone')} value={supplierInfo.phone} />
                <SupInfo icon={Mail} label="E-mail" value={supplierInfo.email} />
                <SupInfo
                  icon={MapPin}
                  label={t('grr.sup.address')}
                  value={supplierInfo.address}
                  wide
                />
                <SupInfo
                  icon={Building2}
                  label={t('grr.sup.terms')}
                  value={t('grr.sup.termsDays', { n: supplierInfo.paymentTermDays })}
                  wide
                />
              </dl>
            </div>
          )}
        </section>
      </div>

      {/* ── 2. Products received ── */}
      <section
        className="animate-rise rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ animationDelay: '180ms' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Step n={2} /> {t('grr.sec.products')}
            <span className="text-sm font-normal text-slate-400">({lines.length})</span>
          </h2>
          <button
            type="button"
            className={btnSecondary}
            disabled={busy || !supplier}
            onClick={() => setOrderPicker(true)}
            title={supplier ? undefined : t('grr.sup.pickSupplier')}
          >
            <ClipboardList className="size-4" /> {t('grr.fromOrder')}
          </button>
        </div>
        <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3 sm:flex-row">
          <BarcodeScanBox
            accent="amber"
            onMatch={scan}
            disabled={busy}
            placeholder={t('grf.scanPh')}
            notFound={t('bill.scanUnknown')}
            className="sm:w-96"
          />
          <ProductSearch disabled={busy} onPick={(p) => void addProduct(p)} />
        </div>

        {lines.length === 0 ? (
          <div className="animate-fade flex flex-col items-center px-6 py-14 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100 ring-8 ring-amber-50">
              <PackagePlus className="size-6 text-orange-600" />
            </div>
            <p className="mt-4 font-medium text-slate-800">{t('grr.noLinesTitle')}</p>
            <p className="mt-1 max-w-md text-sm text-slate-500">{t('grr.noLinesText')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('grf.col.product')}</th>
                  <th className="w-28 px-2 py-2.5">{t('grr.unit')}</th>
                  <th className="w-32 px-2 py-2.5 text-right">{t('grr.qtyReceived')}</th>
                  <th className="w-36 px-2 py-2.5 text-right">{t('grr.unitPrice')}</th>
                  <th className="w-32 px-3 py-2.5 text-right">{t('grf.col.value')}</th>
                  <th className="w-40 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <Fragment key={r.l.key}>
                    <tr
                      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                      className={clsx(
                        'animate-rise border-t border-slate-100 align-top transition-colors duration-700',
                        flash === r.l.key && 'bg-emerald-50',
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{r.l.product.name}</p>
                        <p className="font-mono text-xs text-slate-400">
                          {r.l.product.sku}
                          {r.l.product.barcode && ` · ${r.l.product.barcode}`}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={r.l.unitId}
                          disabled={busy}
                          onChange={(e) => {
                            const u = r.l.units.find((x) => x.id === e.target.value);
                            setLine(r.l.key, {
                              unitId: e.target.value,
                              ...(!r.l.priceTouched &&
                                r.l.baseCost > 0 &&
                                u && { price: fmt4(r.l.baseCost * u.factor) }),
                            });
                          }}
                          className={clsx(fieldClass, 'w-full px-2')}
                        >
                          {r.l.units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.code}
                              {u.factor !== 1 ? ` (×${qty(u.factor)})` : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          inputMode="decimal"
                          value={show(r.l.qty)}
                          placeholder="0"
                          disabled={busy}
                          aria-label={`${t('grr.qtyReceived')} — ${r.l.product.name}`}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            DECIMAL_4.test(e.target.value.trim()) &&
                            setLine(r.l.key, { qty: num(e.target.value) })
                          }
                          className={clsx(
                            fieldClass,
                            'w-full px-2 text-right tabular-nums',
                            r.now > 0 && 'border-emerald-400 bg-emerald-50/40',
                            submitted && r.qtyMissing && 'animate-shake border-red-400!',
                          )}
                        />
                        {r.unit.factor !== 1 && r.now > 0 && (
                          <p className="mt-1 text-right text-[11px] text-slate-400">
                            = {qty(r.now * r.unit.factor)} {r.l.units[0].code}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          inputMode="decimal"
                          value={show(r.l.price)}
                          placeholder="0"
                          disabled={busy}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            DECIMAL_4.test(e.target.value.trim()) &&
                            setLine(r.l.key, { price: num(e.target.value), priceTouched: true })
                          }
                          className={clsx(fieldClass, 'w-full px-2 text-right tabular-nums')}
                        />
                        {!r.l.priceTouched && r.l.baseCost > 0 && (
                          <p className="mt-1 text-right text-[11px] text-slate-400">
                            {t('grr.lastPrice')}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                        {r.now > 0 ? money(r.value) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setLine(r.l.key, { open: !r.l.open })}
                            aria-expanded={r.l.open}
                            className={clsx(
                              'inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 transition',
                              submitted && r.reasonMissing
                                ? 'animate-shake bg-red-50 text-red-700 ring-red-300'
                                : r.hasDetails
                                  ? 'bg-amber-50 text-orange-800 ring-amber-500/30'
                                  : 'text-slate-500 ring-slate-200 hover:bg-slate-50',
                            )}
                          >
                            {(r.l.quality === 'NON_CONFORM' || r.refused > 0) && (
                              <AlertTriangle className="size-3.5" />
                            )}
                            {t('grr.details')}
                            <ChevronDown
                              className={clsx('size-3.5 transition', r.l.open && 'rotate-180')}
                            />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setLines((ls) => ls.filter((x) => x.key !== r.l.key))}
                            aria-label={t('bill.removeLine')}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {r.l.open && (
                      <tr className="bg-amber-50/30">
                        <td colSpan={6} className="px-4 pt-1 pb-4">
                          <div className="animate-fade grid gap-3 rounded-xl border border-amber-100 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
                            <Field label={t('grr.lot')}>
                              <input
                                value={r.l.lot}
                                maxLength={60}
                                disabled={busy}
                                onChange={(e) => setLine(r.l.key, { lot: e.target.value })}
                                placeholder="L2611-04"
                                className={clsx(inputClass, 'font-mono')}
                              />
                            </Field>
                            <Field
                              label={t('grr.expiry')}
                              error={r.expired ? t('grr.expired') : null}
                            >
                              <input
                                type="date"
                                value={r.l.expiry}
                                disabled={busy}
                                onChange={(e) => setLine(r.l.key, { expiry: e.target.value })}
                                className={clsx(inputClass, r.expired && 'border-amber-400')}
                              />
                            </Field>
                            <Field label={t('grr.quality')}>
                              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                                {(['CONFORM', 'NON_CONFORM'] as const).map((q) => (
                                  <button
                                    key={q}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setLine(r.l.key, { quality: q })}
                                    className={clsx(
                                      'rounded-md px-2 py-1.5 text-xs font-semibold transition',
                                      r.l.quality === q
                                        ? q === 'CONFORM'
                                          ? 'bg-white text-emerald-700 shadow-sm'
                                          : 'animate-pop bg-white text-red-700 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800',
                                    )}
                                  >
                                    {q === 'CONFORM' ? t('grr.conform') : t('grr.nonConform')}
                                  </button>
                                ))}
                              </div>
                            </Field>
                            <Field label={`${t('grx.col.refused')} (${r.unit.code})`}>
                              <input
                                inputMode="decimal"
                                value={show(r.l.refused)}
                                placeholder="0"
                                disabled={busy}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) =>
                                  DECIMAL_4.test(e.target.value.trim()) &&
                                  setLine(r.l.key, { refused: num(e.target.value) })
                                }
                                className={clsx(
                                  inputClass,
                                  'text-right tabular-nums',
                                  r.refused > 0 && 'border-red-300 bg-red-50/40',
                                )}
                              />
                            </Field>
                            <Field
                              label={t('grr.observation')}
                              error={submitted && r.reasonMissing ? t('grr.obsRequired') : null}
                            >
                              <input
                                value={r.l.reason}
                                maxLength={200}
                                disabled={busy}
                                placeholder={t('grx.reasonPh')}
                                onChange={(e) => setLine(r.l.key, { reason: e.target.value })}
                                className={clsx(
                                  inputClass,
                                  submitted && r.reasonMissing && 'animate-shake border-red-400!',
                                )}
                              />
                            </Field>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lines.length > 0 && (
          <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 bg-gradient-to-br from-slate-50 to-amber-50/40 px-5 py-4">
            <p className="max-w-md text-xs text-slate-500">{t('grr.scanHint')}</p>
            <dl className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>{t('grf.linesCount')}</dt>
                <dd className="tabular-nums">{lines.length}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
                <dt className="font-semibold text-slate-900">{t('grf.value')}</dt>
                <dd
                  key={total}
                  className="animate-pop text-xl font-semibold text-orange-700 tabular-nums"
                >
                  {money(millimes(total))}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      <div
        className="animate-rise sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 shadow-lg backdrop-blur"
        style={{ animationDelay: '240ms' }}
      >
        <p className="mr-auto hidden text-xs text-slate-500 sm:block">{t('grx.finalNote')}</p>
        <button
          className={btnSecondary}
          onClick={() =>
            router.push(draft ? `/purchasing/receipts/${draft.id}` : '/purchasing/receipts')
          }
          disabled={busy}
        >
          {t('common.cancel')}
        </button>
        <button
          className={btnSecondary}
          onClick={() => void submit(true)}
          disabled={busy || !supplier || !lines.length}
        >
          {saving === 'draft' ? <Spinner /> : <FilePen className="size-4" />} {t('grx.saveDraft')}
        </button>
        <button
          className={btnPrimary}
          onClick={() => void submit(false)}
          disabled={busy || !supplier || !lines.length}
        >
          {saving === 'post' ? <Spinner /> : <PackageCheck className="size-4" />}
          {draft ? t('grx.saveAndPost') : t('grf.submit')}
          {lines.length > 0 && (
            <span className="rounded-full bg-white/25 px-1.5 text-xs">{lines.length}</span>
          )}
        </button>
      </div>

      {supplier && (
        <OrderPicker
          open={orderPicker}
          supplierId={supplier.id}
          onClose={() => setOrderPicker(false)}
          onPick={(id) => void fillFromOrder(id)}
          date={date}
        />
      )}
      {burst}
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid size-6 place-items-center rounded-full bg-amber-100 text-xs font-bold text-orange-700">
      {n}
    </span>
  );
}

/** Type-ahead product search: Enter or click adds the product. */
function ProductSearch({
  onPick,
  disabled,
}: {
  onPick: (p: ProductListItem) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [term, setTerm] = useState('');
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = term.trim();
    if (!q) return setItems([]);
    const timer = setTimeout(() => {
      api<Paginated<ProductListItem>>(
        `/inventory/products?status=active&pageSize=8&search=${encodeURIComponent(q)}`,
      )
        .then((r) => {
          setItems(r.items);
          setActive(0);
        })
        .catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    const close = (e: MouseEvent) =>
      box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (p: ProductListItem) => {
    onPick(p);
    setTerm('');
    setItems([]);
  };

  return (
    <div ref={box} className="relative flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        value={term}
        disabled={disabled}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, items.length - 1));
          if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          if (e.key === 'Enter' && items[active]) {
            e.preventDefault();
            pick(items[active]);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={t('grr.searchProduct')}
        aria-label={t('grr.searchProduct')}
        className={clsx(inputClass, 'pl-9')}
      />
      {open && items.length > 0 && (
        <div className="animate-pop absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {items.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(p)}
              className={clsx(
                'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
                i === active ? 'bg-amber-50 text-orange-900' : 'text-slate-700',
              )}
            >
              <span className="truncate font-medium">{p.name}</span>
              <span className="font-mono text-xs text-slate-400">
                {p.sku}
                {p.barcode && ` · ${p.barcode}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Choose an open order of the supplier to copy what is still to receive. */
function OrderPicker({
  open,
  supplierId,
  onClose,
  onPick,
  date,
}: {
  open: boolean;
  supplierId: string;
  onClose: () => void;
  onPick: (orderId: string) => void;
  date: (v: string | null | undefined) => string;
}) {
  const { t } = useI18n();
  const [orders, setOrders] = useState<PurchaseOrderListItem[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setOrders(null);
    api<Paginated<PurchaseOrderListItem>>(
      `/purchasing/orders?status=open&pageSize=50&supplierId=${supplierId}`,
    )
      .then((r) => setOrders(r.items))
      .catch(() => setOrders([]));
  }, [open, supplierId]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('grr.fromOrder')}
      subtitle={t('grr.fromOrderText')}
    >
      {orders === null ? (
        <div className="grid place-items-center py-8">
          <Spinner className="text-amber-500" />
        </div>
      ) : orders.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{t('grr.noOpenOrder')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {orders.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onPick(o.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-amber-50"
              >
                <span>
                  <span className="font-mono text-sm font-semibold text-slate-900">{o.number}</span>
                  <span className="block text-xs text-slate-400">
                    {date(o.orderDate)} · {t('po.lines', { n: o.lineCount })}
                  </span>
                </span>
                <ClipboardList className="size-4 text-orange-600" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function SupInfo({
  label,
  value,
  icon: Icon,
  mono,
  wide,
}: {
  label: string;
  value: string | null;
  icon?: typeof Phone;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={clsx('min-w-0', wide && 'col-span-2')}>
      <dt className="flex items-center gap-1 text-slate-400">
        {Icon && <Icon className="size-3" />} {label}
      </dt>
      <dd
        className={clsx('truncate text-slate-700', mono && 'font-mono')}
        title={value ?? undefined}
      >
        {value || '—'}
      </dd>
    </div>
  );
}
