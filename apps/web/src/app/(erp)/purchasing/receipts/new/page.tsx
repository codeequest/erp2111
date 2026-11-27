'use client';

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  Building2,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Eraser,
  ExternalLink,
  FilePen,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  Truck,
  Warehouse,
} from 'lucide-react';
import type {
  BarcodeMatch,
  GoodsReceiptDetail,
  GoodsReceiptInput,
  Paginated,
  PurchaseOrderDetail,
  PurchaseOrderListItem,
  ReceiptQuality,
  ReceivingSettings,
  SupplierDetail,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AccessDenied } from '@/components/page-header';
import { BarcodeScanBox } from '@/components/products/barcode-scan-box';
import {
  ErrorBox,
  Field,
  PoStatusBadge,
  PurchasingHero,
  Spinner,
  btnPrimary,
  btnSecondary,
  errorMessages,
  fieldClass,
  inputClass,
  useSuccess,
} from '@/components/purchasing/ui';

const DECIMAL_4 = /^\d{1,14}(\.\d{1,4})?$/;

/** What the user typed for one order line */
interface LineEntry {
  qty: string;
  refused: string;
  reason: string;
  lot: string;
  expiry: string;
  quality: ReceiptQuality;
}
const EMPTY: LineEntry = {
  qty: '',
  refused: '',
  reason: '',
  lot: '',
  expiry: '',
  quality: 'CONFORM',
};

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

function NewReceipt() {
  const { can } = useAuth();
  const router = useRouter();
  const { t, money, qty, date, lang } = useI18n();
  const searchParams = useSearchParams();
  const presetOrderId = searchParams.get('orderId') ?? '';
  /** Editing a draft receipt */
  const draftId = searchParams.get('draftId') ?? '';
  const { burst, celebrate } = useSuccess();

  const [openOrders, setOpenOrders] = useState<PurchaseOrderListItem[] | null>(null);
  const [orderId, setOrderId] = useState(presetOrderId);
  const [order, setOrder] = useState<PurchaseOrderDetail | null>(null);
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [entries, setEntries] = useState<Record<string, LineEntry>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [receivedDate, setReceivedDate] = useState(localToday());
  const [supplierRef, setSupplierRef] = useState('');
  const [notes, setNotes] = useState('');
  const [tolerance, setTolerance] = useState(0);
  const [draft, setDraft] = useState<GoodsReceiptDetail | null>(null);
  const pendingDraft = useRef<GoodsReceiptDetail | null>(null);
  const [saving, setSaving] = useState<false | 'draft' | 'post'>(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | string[] | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    api<Paginated<PurchaseOrderListItem>>('/purchasing/orders?status=open&pageSize=100')
      .then((r) => setOpenOrders(r.items))
      .catch(() => setOpenOrders([]));
    api<ReceivingSettings>('/purchasing/receipts/settings')
      .then((s) => setTolerance(Number(s.tolerancePct)))
      .catch(() => undefined);
  }, []);

  // Draft being edited: load it, then its order (its lines are applied once the order is in)
  useEffect(() => {
    if (!draftId) return;
    api<GoodsReceiptDetail>(`/purchasing/receipts/${draftId}`)
      .then((d) => {
        if (d.status !== 'DRAFT') {
          router.replace(`/purchasing/receipts/${d.id}`);
          return;
        }
        setDraft(d);
        pendingDraft.current = d;
        setOrderId(d.purchaseOrder.id);
        setReceivedDate(d.receivedAt.slice(0, 10));
        setSupplierRef(d.supplierRef ?? '');
        setNotes(d.notes ?? '');
      })
      .catch((e) => setError(errorMessages(e)));
  }, [draftId, router]);

  useEffect(() => {
    setOrder(null);
    setSupplier(null);
    setEntries({});
    setOpen({});
    setError(null);
    setSubmitted(false);
    if (!orderId) return;
    setLoadingOrder(true);
    api<PurchaseOrderDetail>(`/purchasing/orders/${orderId}`)
      .then((o) => {
        setOrder(o);
        const d = pendingDraft.current;
        const byLine = new Map((d?.lines ?? []).map((l) => [l.purchaseOrderLineId, l]));
        const n = (v: string | undefined) => (v && Number(v) ? String(Number(v)) : '');
        const next: Record<string, LineEntry> = {};
        const opened: Record<string, boolean> = {};
        for (const l of o.lines) {
          const dl = byLine.get(l.id);
          next[l.id] = dl
            ? {
                qty: n(dl.quantity),
                refused: n(dl.rejectedQty),
                reason: dl.rejectReason ?? '',
                lot: dl.lotNumber ?? '',
                expiry: dl.expiryDate ?? '',
                quality: dl.quality,
              }
            : { ...EMPTY };
          if (
            dl &&
            (dl.lotNumber || dl.expiryDate || dl.quality !== 'CONFORM' || n(dl.rejectedQty))
          ) {
            opened[l.id] = true;
          }
        }
        setEntries(next);
        setOpen(opened);
        pendingDraft.current = null;
        return api<SupplierDetail>(`/purchasing/suppliers/${o.supplier.id}`).then(setSupplier);
      })
      .catch((e) => setError(errorMessages(e)))
      .finally(() => setLoadingOrder(false));
  }, [orderId]);

  const rows = useMemo(
    () =>
      (order?.lines ?? []).map((l) => {
        const e = entries[l.id] ?? EMPTY;
        const remaining = Math.max(0, Number(l.quantity) - Number(l.receivedQty));
        const now = e.qty === '' ? 0 : Number(e.qty);
        const refused = e.refused === '' ? 0 : Number(e.refused);
        const invalid =
          (e.qty !== '' && !DECIMAL_4.test(e.qty)) ||
          (e.refused !== '' && !DECIMAL_4.test(e.refused));
        const limit = Math.max(0, remaining + (Number(l.quantity) * tolerance) / 100);
        const over = !invalid && now > limit + 1e-9;
        const extra = !over && now > remaining + 1e-9;
        const needsReason = refused > 0 || e.quality === 'NON_CONFORM';
        const reasonMissing = needsReason && !e.reason.trim();
        const expired = Boolean(e.expiry) && e.expiry < localToday();
        const gross = millimes(now * Number(l.unitPrice));
        const value = invalid
          ? 0
          : millimes(gross - millimes((gross * Number(l.discountPct)) / 100));
        const hasDetails = Boolean(e.lot || e.expiry || refused > 0 || e.quality !== 'CONFORM');
        return {
          l,
          e,
          remaining,
          now,
          refused,
          invalid,
          over,
          extra,
          reasonMissing,
          expired,
          value,
          hasDetails,
        };
      }),
    [order, entries, tolerance],
  );

  const receiving = rows.filter((r) => (r.now > 0 || r.refused > 0) && !r.invalid);
  const totalValue = receiving.reduce((s, r) => s + r.value, 0);
  const hasLineErrors = rows.some((r) => r.invalid || r.over || r.reasonMissing);
  const willComplete =
    rows.length > 0 && rows.every((r) => r.remaining - (r.invalid ? 0 : r.now) <= 1e-9);
  const orderDate = order?.orderDate ?? '';
  const dateError =
    receivedDate > localToday() || (orderDate && receivedDate < orderDate)
      ? t('grf.dateErr')
      : null;

  if (!can('purchasing.receipt.create')) {
    return <AccessDenied permission="purchasing.receipt.create" what={t('grf.title')} />;
  }

  const show = (v: string) => (lang === 'fr' ? v.replace('.', ',') : v);
  const fmt = (n: number) => String(Number(n.toFixed(4)));
  const setEntry = (id: string, patch: Partial<LineEntry>) =>
    setEntries((all) => ({ ...all, [id]: { ...(all[id] ?? EMPTY), ...patch } }));
  const num = (v: string) => v.trim().replace(',', '.');

  function receiveAll() {
    setEntries((all) => {
      const next = { ...all };
      for (const r of rows)
        next[r.l.id] = { ...(all[r.l.id] ?? EMPTY), qty: r.remaining > 0 ? fmt(r.remaining) : '' };
      return next;
    });
  }

  /** A scan counts one unit on the matching line (product, and pack size for a pack barcode). */
  function scan(m: BarcodeMatch): string | void {
    const unitId = m.packUnit?.unit.id;
    const candidates = rows.filter(
      (r) => r.l.product.id === m.product.id && (!unitId || r.l.unit.id === unitId),
    );
    if (!candidates.length) return t('grf.scanNotOnOrder', { code: m.product.name });
    const target = candidates.find((r) => r.now + 1 <= r.remaining + 1e-9);
    if (!target) return t('grf.scanFull', { name: m.product.name });
    setEntry(target.l.id, { qty: fmt(target.now + 1) });
    setFlash(target.l.id);
    setTimeout(() => setFlash(null), 900);
  }

  async function submit(asDraft: boolean) {
    setSubmitted(true);
    setError(null);
    if (!order || hasLineErrors || dateError) {
      // Open the lines whose details need attention
      setOpen((o) => ({
        ...o,
        ...Object.fromEntries(rows.filter((r) => r.reasonMissing).map((r) => [r.l.id, true])),
      }));
      return;
    }
    if (!receiving.length) {
      setError(t('grf.needQty'));
      return;
    }
    setSaving(asDraft ? 'draft' : 'post');
    const body: GoodsReceiptInput = {
      purchaseOrderId: order.id,
      receivedDate,
      supplierRef: supplierRef.trim() || null,
      supplierInvoiceNumber: null,
      supplierInvoiceDate: null,
      notes: notes.trim() || null,
      lines: receiving.map((r) => ({
        purchaseOrderLineId: r.l.id,
        quantity: r.e.qty || '0',
        rejectedQty: r.e.refused || '0',
        rejectReason: r.e.reason.trim() || null,
        lotNumber: r.e.lot.trim() || null,
        expiryDate: r.e.expiry || null,
        quality: r.e.quality,
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

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-4">
      <PurchasingHero
        icon={PackageCheck}
        title={draft ? t('grx.editTitle') : t('grf.title')}
        subtitle={t('grf.subtitle')}
        crumb={[
          { label: t('gr.title'), href: '/purchasing/receipts' },
          { label: draft ? t('grx.editCrumb') : t('grf.crumb') },
        ]}
      />

      {error && <ErrorBox message={error} />}

      {/* ── 1. Order, reception details, supplier ── */}
      <div className="grid gap-5 lg:grid-cols-5">
        <section
          className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3"
          style={{ animationDelay: '60ms' }}
        >
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid size-6 place-items-center rounded-full bg-amber-100 text-xs font-bold text-orange-700">
              1
            </span>
            {t('grr.sec.receipt')}
          </h2>
          <fieldset disabled={Boolean(saving)} className="grid gap-4 sm:grid-cols-2">
            <Field label={t('grf.order')} className="sm:col-span-2">
              <select
                value={orderId}
                disabled={Boolean(draft)}
                onChange={(e) => {
                  setOrderId(e.target.value);
                  router.replace(
                    e.target.value
                      ? `/purchasing/receipts/new?orderId=${e.target.value}`
                      : '/purchasing/receipts/new',
                  );
                }}
                className={inputClass}
              >
                <option value="">
                  {openOrders && openOrders.length === 0 ? t('grf.noOpen') : t('grf.orderPh')}
                </option>
                {order && !openOrders?.some((o) => o.id === order.id) && (
                  <option value={order.id}>
                    {order.number} · {order.supplier.name}
                  </option>
                )}
                {openOrders?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number} · {o.supplier.name}
                    {o.expectedDate ? ` · ${date(o.expectedDate)}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('grf.date')} error={submitted ? dateError : null}>
              <input
                type="date"
                value={receivedDate}
                max={localToday()}
                min={orderDate || undefined}
                onChange={(e) => setReceivedDate(e.target.value || localToday())}
                className={clsx(inputClass, submitted && dateError && 'border-red-400!')}
              />
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
            <Field label={t('grf.notes')} className="sm:col-span-2">
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
          {!order ? (
            <p className="text-sm text-slate-400">{t('grr.sup.pick')}</p>
          ) : (
            <div className="animate-fade space-y-3 text-sm">
              <div>
                <p className="text-base font-semibold text-slate-900">{order.supplier.name}</p>
                <p className="font-mono text-xs text-slate-400">{order.supplier.code}</p>
              </div>
              {supplier ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <SupInfo label={t('grr.sup.taxId')} value={supplier.taxId} mono />
                  <SupInfo label="RNE" value={supplier.rne} mono />
                  <SupInfo icon={Phone} label={t('grr.sup.phone')} value={supplier.phone} />
                  <SupInfo icon={Mail} label="E-mail" value={supplier.email} />
                  <SupInfo
                    icon={MapPin}
                    label={t('grr.sup.address')}
                    value={supplier.address}
                    wide
                  />
                  <SupInfo
                    icon={Building2}
                    label={t('grr.sup.terms')}
                    value={t('grr.sup.termsDays', { n: supplier.paymentTermDays })}
                    wide
                  />
                </dl>
              ) : (
                <Spinner className="text-amber-500" />
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-amber-100 pt-3 text-xs text-slate-600">
                <Link
                  href={`/purchasing/orders/${order.id}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 font-mono font-semibold text-orange-700 hover:underline"
                >
                  {order.number} <ExternalLink className="size-3" />
                </Link>
                <span>{date(order.orderDate)}</span>
                <PoStatusBadge status={order.status} />
                <span className="inline-flex items-center gap-1">
                  <Warehouse className="size-3.5 text-orange-600" /> {order.warehouse.code}
                </span>
                {order.expectedDate && (
                  <span>{t('gr.expected', { date: date(order.expectedDate) })}</span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── 2. Goods ── */}
      <section
        className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ animationDelay: '180ms' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid size-6 place-items-center rounded-full bg-amber-100 text-xs font-bold text-orange-700">
              2
            </span>
            {t('grf.lines')}
          </h2>
          {order && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <BarcodeScanBox
                accent="amber"
                onMatch={scan}
                disabled={Boolean(saving)}
                placeholder={t('grf.scanPh')}
                notFound={t('bill.scanUnknown')}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className={clsx(btnSecondary, 'flex-1')}
                  onClick={receiveAll}
                  disabled={Boolean(saving)}
                >
                  <CheckCheck className="size-4" /> {t('grf.all')}
                </button>
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() =>
                    setEntries((all) =>
                      Object.fromEntries(Object.keys(all).map((k) => [k, { ...EMPTY }])),
                    )
                  }
                  disabled={Boolean(saving)}
                  title={t('grf.clear')}
                  aria-label={t('grf.clear')}
                >
                  <Eraser className="size-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {loadingOrder ? (
          <div className="grid place-items-center py-14">
            <Spinner className="size-6 text-amber-500" />
          </div>
        ) : !order ? (
          <div className="animate-fade flex flex-col items-center px-6 py-14 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100 ring-8 ring-amber-50">
              <PackageCheck className="size-6 text-orange-600" />
            </div>
            <p className="mt-4 font-medium text-slate-800">{t('grf.pickTitle')}</p>
            <p className="mt-1 max-w-md text-sm text-slate-500">{t('grf.pickText')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('grf.col.product')}</th>
                  <th className="px-3 py-2.5 text-right">{t('grf.col.ordered')}</th>
                  <th className="px-3 py-2.5 text-right">{t('grf.col.remaining')}</th>
                  <th className="w-40 px-3 py-2.5 text-right">{t('grf.col.now')}</th>
                  <th className="px-3 py-2.5 text-right">{t('grf.col.value')}</th>
                  <th className="w-32 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const done = r.remaining <= 0;
                  const factor = Number(r.l.unitFactor);
                  const isOpen = open[r.l.id] ?? false;
                  return (
                    <Fragment key={r.l.id}>
                      <tr
                        style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                        className={clsx(
                          'animate-rise border-t border-slate-100 align-top transition-colors duration-700',
                          flash === r.l.id && 'bg-emerald-50',
                          done && 'bg-slate-50/60',
                        )}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{r.l.product.name}</p>
                          <p className="font-mono text-xs text-slate-400">
                            {r.l.product.sku}
                            {factor !== 1 &&
                              ` · ${t('pop.unitEq', { unit: r.l.unit.code, factor: qty(factor), base: r.l.product.baseUnitCode })}`}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                          {qty(r.l.quantity)}{' '}
                          <span className="text-xs text-slate-400">{r.l.unit.code}</span>
                          {Number(r.l.receivedQty) > 0 && (
                            <p className="text-[11px] text-slate-400">
                              {t('grr.already', { n: qty(r.l.receivedQty) })}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                          {done ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                              <CheckCircle2 className="size-3.5" /> {t('grf.done')}
                            </span>
                          ) : (
                            <>
                              {qty(r.remaining)}{' '}
                              <span className="text-xs text-slate-400">{r.l.unit.code}</span>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {!done && (
                            <>
                              <div className="flex items-center gap-1.5">
                                <input
                                  inputMode="decimal"
                                  value={show(r.e.qty)}
                                  placeholder="0"
                                  disabled={Boolean(saving)}
                                  aria-label={`${t('grf.col.now')} — ${r.l.product.name}`}
                                  onChange={(e) => setEntry(r.l.id, { qty: num(e.target.value) })}
                                  onFocus={(e) => e.target.select()}
                                  className={clsx(
                                    fieldClass,
                                    'w-full px-2 text-right tabular-nums',
                                    r.now > 0 &&
                                      !r.invalid &&
                                      !r.over &&
                                      'border-emerald-400 bg-emerald-50/40',
                                    (r.invalid || r.over) && 'animate-shake border-red-400!',
                                  )}
                                />
                                <span className="w-9 text-xs text-slate-400">{r.l.unit.code}</span>
                              </div>
                              {r.over ? (
                                <p className="mt-1 text-right text-[11px] text-red-600">
                                  {tolerance > 0
                                    ? t('grx.overTolerance', { pct: tolerance })
                                    : t('grf.over')}
                                </p>
                              ) : r.extra ? (
                                <p className="mt-1 text-right text-[11px] text-amber-700">
                                  {t('grx.extra', { pct: tolerance })}
                                </p>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                          {r.now > 0 && !r.invalid ? (
                            money(r.value)
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {!done && (
                            <button
                              type="button"
                              onClick={() => setOpen((o) => ({ ...o, [r.l.id]: !isOpen }))}
                              aria-expanded={isOpen}
                              className={clsx(
                                'inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 transition',
                                r.reasonMissing && submitted
                                  ? 'animate-shake bg-red-50 text-red-700 ring-red-300'
                                  : r.hasDetails
                                    ? 'bg-amber-50 text-orange-800 ring-amber-500/30'
                                    : 'text-slate-500 ring-slate-200 hover:bg-slate-50',
                              )}
                            >
                              {r.e.quality === 'NON_CONFORM' || r.refused > 0 ? (
                                <AlertTriangle className="size-3.5" />
                              ) : null}
                              {t('grr.details')}
                              <ChevronDown
                                className={clsx('size-3.5 transition', isOpen && 'rotate-180')}
                              />
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && !done && (
                        <tr className="bg-amber-50/30">
                          <td colSpan={6} className="px-4 pt-1 pb-4">
                            <div className="animate-fade grid gap-3 rounded-xl border border-amber-100 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
                              <Field label={t('grr.lot')}>
                                <input
                                  value={r.e.lot}
                                  maxLength={60}
                                  disabled={Boolean(saving)}
                                  onChange={(e) => setEntry(r.l.id, { lot: e.target.value })}
                                  placeholder="L2611-04"
                                  className={clsx(inputClass, 'font-mono')}
                                />
                              </Field>
                              <Field
                                label={t('grr.expiry')}
                                hint={r.expired ? undefined : undefined}
                                error={r.expired ? t('grr.expired') : null}
                              >
                                <input
                                  type="date"
                                  value={r.e.expiry}
                                  disabled={Boolean(saving)}
                                  onChange={(e) => setEntry(r.l.id, { expiry: e.target.value })}
                                  className={clsx(inputClass, r.expired && 'border-amber-400')}
                                />
                              </Field>
                              <Field label={t('grr.quality')}>
                                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                                  {(['CONFORM', 'NON_CONFORM'] as const).map((q) => (
                                    <button
                                      key={q}
                                      type="button"
                                      disabled={Boolean(saving)}
                                      onClick={() => setEntry(r.l.id, { quality: q })}
                                      className={clsx(
                                        'rounded-md px-2 py-1.5 text-xs font-semibold transition',
                                        r.e.quality === q
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
                              <Field label={`${t('grx.col.refused')} (${r.l.unit.code})`}>
                                <input
                                  inputMode="decimal"
                                  value={show(r.e.refused)}
                                  placeholder="0"
                                  disabled={Boolean(saving)}
                                  onChange={(e) =>
                                    setEntry(r.l.id, { refused: num(e.target.value) })
                                  }
                                  onFocus={(e) => e.target.select()}
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
                                  value={r.e.reason}
                                  maxLength={200}
                                  disabled={Boolean(saving)}
                                  placeholder={t('grx.reasonPh')}
                                  onChange={(e) => setEntry(r.l.id, { reason: e.target.value })}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {order && (
          <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 bg-gradient-to-br from-slate-50 to-amber-50/40 px-5 py-4">
            <p className="max-w-md text-xs text-slate-500">{t('grr.scanHint')}</p>
            <dl className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>{t('grf.linesCount')}</dt>
                <dd className="tabular-nums">
                  {receiving.length} / {rows.length}
                </dd>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <dt>{t('grf.after')}</dt>
                <dd>
                  <PoStatusBadge
                    status={
                      receiving.length === 0
                        ? order.status
                        : willComplete
                          ? 'RECEIVED'
                          : 'PARTIALLY_RECEIVED'
                    }
                  />
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
                <dt className="font-semibold text-slate-900">{t('grf.value')}</dt>
                <dd
                  key={totalValue}
                  className="animate-pop text-xl font-semibold text-orange-700 tabular-nums"
                >
                  {money(millimes(totalValue))}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      {/* Actions */}
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
          disabled={Boolean(saving)}
        >
          {t('common.cancel')}
        </button>
        <button
          className={btnSecondary}
          onClick={() => void submit(true)}
          disabled={Boolean(saving) || !order}
        >
          {saving === 'draft' ? <Spinner /> : <FilePen className="size-4" />}
          {t('grx.saveDraft')}
        </button>
        <button
          className={btnPrimary}
          onClick={() => void submit(false)}
          disabled={Boolean(saving) || !order}
        >
          {saving === 'post' ? <Spinner /> : <PackageCheck className="size-4" />}
          {draft ? t('grx.saveAndPost') : t('grf.submit')}
          {receiving.length > 0 && (
            <span className="rounded-full bg-white/25 px-1.5 text-xs">{receiving.length}</span>
          )}
        </button>
      </div>
      {burst}
    </div>
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
