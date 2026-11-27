'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  CheckCheck,
  CheckCircle2,
  Eraser,
  FilePen,
  ExternalLink,
  PackageCheck,
  ScanBarcode,
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
  ReceivingSettings,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AccessDenied } from '@/components/page-header';
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
  const [draft, setDraft] = useState<GoodsReceiptDetail | null>(null);
  const pendingDraft = useRef<GoodsReceiptDetail | null>(null);
  const [rejected, setRejected] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [tolerance, setTolerance] = useState(0);

  const [openOrders, setOpenOrders] = useState<PurchaseOrderListItem[] | null>(null);
  const [orderId, setOrderId] = useState(presetOrderId);
  const [order, setOrder] = useState<PurchaseOrderDetail | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [receivedDate, setReceivedDate] = useState(localToday());
  const [supplierRef, setSupplierRef] = useState('');
  const [notes, setNotes] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
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

  // Draft being edited: load it, then its order (the quantities are applied once the order is in)
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
        setInvoiceNumber(d.supplierInvoiceNumber ?? '');
        setInvoiceDate(d.supplierInvoiceDate ?? '');
      })
      .catch((e) => setError(errorMessages(e)));
  }, [draftId, router]);

  useEffect(() => {
    setOrder(null);
    setQuantities({});
    setRejected({});
    setReasons({});
    setError(null);
    setSubmitted(false);
    if (!orderId) return;
    setLoadingOrder(true);
    api<PurchaseOrderDetail>(`/purchasing/orders/${orderId}`)
      .then((o) => {
        setOrder(o);
        const d = pendingDraft.current;
        const byLine = new Map((d?.lines ?? []).map((l) => [l.purchaseOrderLineId, l]));
        const fmt4 = (v: string) => (Number(v) ? String(Number(v)) : '');
        setQuantities(
          Object.fromEntries(o.lines.map((l) => [l.id, fmt4(byLine.get(l.id)?.quantity ?? '')])),
        );
        setRejected(
          Object.fromEntries(o.lines.map((l) => [l.id, fmt4(byLine.get(l.id)?.rejectedQty ?? '')])),
        );
        setReasons(
          Object.fromEntries(o.lines.map((l) => [l.id, byLine.get(l.id)?.rejectReason ?? ''])),
        );
        pendingDraft.current = null;
      })
      .catch((e) => setError(errorMessages(e)))
      .finally(() => setLoadingOrder(false));
  }, [orderId]);

  const rows = useMemo(
    () =>
      (order?.lines ?? []).map((l) => {
        const remaining = Math.max(0, Number(l.quantity) - Number(l.receivedQty));
        const raw = quantities[l.id] ?? '';
        const now = raw === '' ? 0 : Number(raw);
        const rawRejected = rejected[l.id] ?? '';
        const refused = rawRejected === '' ? 0 : Number(rawRejected);
        const invalid =
          (raw !== '' && !DECIMAL_4.test(raw)) ||
          (rawRejected !== '' && !DECIMAL_4.test(rawRejected));
        // Over-receipt tolerance (company settings), as a % of the ordered quantity
        const limit = Math.max(0, remaining + (Number(l.quantity) * tolerance) / 100);
        const over = !invalid && now > limit + 1e-9;
        const extra = !over && now > remaining + 1e-9;
        const reason = reasons[l.id] ?? '';
        const reasonMissing = refused > 0 && !reason.trim();
        const netPrice = (Number(l.unitPrice) * (100 - Number(l.discountPct))) / 100;
        const gross = millimes(now * Number(l.unitPrice));
        const value = invalid
          ? 0
          : millimes(gross - millimes((gross * Number(l.discountPct)) / 100));
        return {
          l,
          remaining,
          raw,
          now,
          invalid,
          over,
          extra,
          netPrice,
          value,
          rawRejected,
          refused,
          reason,
          reasonMissing,
        };
      }),
    [order, quantities, rejected, reasons, tolerance],
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
  // The supplier invoice is recorded only on the receipt that completes the order (100 % received).
  const invoiceOpen = willComplete && !hasLineErrors;
  // It stays optional, but its number and date go together.
  const invoiceError = !invoiceOpen
    ? null
    : invoiceNumber.trim() && !invoiceDate
      ? t('grf.invDateErr')
      : invoiceDate && !invoiceNumber.trim()
        ? t('grf.invNumberErr')
        : invoiceDate > localToday()
          ? t('grf.invFutureErr')
          : null;

  if (!can('purchasing.receipt.create')) {
    return <AccessDenied permission="purchasing.receipt.create" what={t('grf.title')} />;
  }

  const show = (v: string) => (lang === 'fr' ? v.replace('.', ',') : v);
  const setQty = (id: string, v: string) =>
    setQuantities((q) => ({ ...q, [id]: v.trim().replace(',', '.') }));
  const fmt = (n: number) => String(Number(n.toFixed(4)));

  function receiveAll() {
    setQuantities(
      Object.fromEntries(rows.map((r) => [r.l.id, r.remaining > 0 ? fmt(r.remaining) : ''])),
    );
  }

  /** A scan adds one unit of the line that matches (product, and pack size when the code is a pack barcode). */
  async function scan(code: string) {
    if (!order) return;
    let productId: string | null = null;
    let unitId: string | null = null;
    try {
      const m = await api<BarcodeMatch>(`/inventory/products/barcode/${encodeURIComponent(code)}`);
      productId = m.product.id;
      unitId = m.packUnit?.unit.id ?? null;
    } catch {
      /* unknown barcode */
    }
    const candidates = rows.filter(
      (r) => r.l.product.id === productId && (!unitId || r.l.unit.id === unitId),
    );
    if (!candidates.length) return { error: t('grf.scanNotOnOrder', { code }) };
    const target = candidates.find((r) => r.now + 1 <= r.remaining + 1e-9);
    if (!target) return { error: t('grf.scanFull', { name: candidates[0].l.product.name }) };
    setQty(target.l.id, fmt(target.now + 1));
    setFlash(target.l.id);
    setTimeout(() => setFlash(null), 900);
    return { ok: true };
  }

  async function submit(asDraft: boolean) {
    setSubmitted(true);
    setError(null);
    if (!order || hasLineErrors || dateError || invoiceError) return;
    if (!receiving.length) {
      setError(t('grf.needQty'));
      return;
    }
    setSaving(asDraft ? 'draft' : 'post');
    const body: GoodsReceiptInput = {
      purchaseOrderId: order.id,
      receivedDate,
      supplierRef: supplierRef.trim() || null,
      supplierInvoiceNumber: (invoiceOpen && invoiceNumber.trim()) || null,
      supplierInvoiceDate: (invoiceOpen && invoiceDate) || null,
      notes: notes.trim() || null,
      lines: receiving.map((r) => ({
        purchaseOrderLineId: r.l.id,
        quantity: r.raw || '0',
        rejectedQty: r.rawRejected || '0',
        rejectReason: r.refused > 0 ? r.reason.trim() : null,
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

      {/* Order + delivery details */}
      <section
        className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        style={{ animationDelay: '80ms' }}
      >
        <fieldset disabled={Boolean(saving)} className="grid gap-4 md:grid-cols-12">
          <Field label={t('grf.order')} className="md:col-span-6">
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
          <Field
            label={t('grf.date')}
            className="md:col-span-3"
            error={submitted ? dateError : null}
          >
            <input
              type="date"
              value={receivedDate}
              max={localToday()}
              min={orderDate || undefined}
              onChange={(e) => setReceivedDate(e.target.value || localToday())}
              className={clsx(inputClass, submitted && dateError && 'border-red-400!')}
            />
          </Field>
          <Field label={t('grf.bl')} className="md:col-span-3">
            <input
              value={supplierRef}
              maxLength={60}
              onChange={(e) => setSupplierRef(e.target.value)}
              placeholder={t('grf.blPh')}
              className={clsx(inputClass, 'font-mono')}
            />
          </Field>
          <Field
            label={t('grf.invNumber')}
            className="md:col-span-3"
            hint={invoiceOpen ? t('grf.invHint') : t('grf.invLocked')}
            error={submitted && invoiceError === t('grf.invNumberErr') ? invoiceError : null}
          >
            <input
              value={invoiceNumber}
              maxLength={60}
              disabled={!invoiceOpen}
              title={invoiceOpen ? undefined : t('grf.invLocked')}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder={invoiceOpen ? t('grf.invNumberPh') : t('grf.invLockedPh')}
              className={clsx(
                inputClass,
                'font-mono disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
                submitted && invoiceError === t('grf.invNumberErr') && 'border-red-400!',
              )}
            />
          </Field>
          <Field
            label={t('grf.invDate')}
            className="md:col-span-3"
            error={submitted && invoiceError !== t('grf.invNumberErr') ? invoiceError : null}
          >
            <input
              type="date"
              value={invoiceDate}
              max={localToday()}
              disabled={!invoiceOpen}
              title={invoiceOpen ? undefined : t('grf.invLocked')}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className={clsx(
                inputClass,
                'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
                submitted &&
                  invoiceError &&
                  invoiceError !== t('grf.invNumberErr') &&
                  'border-red-400!',
              )}
            />
          </Field>
          <Field label={t('grf.notes')} className="md:col-span-6">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('grf.notesPh')}
              className={inputClass}
            />
          </Field>
        </fieldset>

        {order && (
          <div className="animate-fade mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-gradient-to-br from-slate-50 to-amber-50/50 px-4 py-3 text-sm">
            <span className="inline-flex items-center gap-2 text-slate-700">
              <Truck className="size-4 text-orange-600" />
              <span className="font-medium">{order.supplier.name}</span>
              <span className="font-mono text-xs text-slate-400">{order.supplier.code}</span>
            </span>
            <span className="inline-flex items-center gap-2 text-slate-700">
              <Warehouse className="size-4 text-orange-600" />
              {t('grf.into', { warehouse: `${order.warehouse.code} · ${order.warehouse.name}` })}
            </span>
            {order.expectedDate && (
              <span className="text-slate-500">
                {t('gr.expected', { date: date(order.expectedDate) })}
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-3">
              <PoStatusBadge status={order.status} />
              <Link
                href={`/purchasing/orders/${order.id}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:underline"
              >
                {order.number} <ExternalLink className="size-3.5" />
              </Link>
            </span>
          </div>
        )}
      </section>

      {/* Lines */}
      <section
        className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ animationDelay: '160ms' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-slate-900">{t('grf.lines')}</h2>
          {order && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <ScanBox onScan={scan} disabled={Boolean(saving)} />
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
                  onClick={() => setQuantities({})}
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
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('grf.col.product')}</th>
                  <th className="px-4 py-2.5 text-right">{t('grf.col.ordered')}</th>
                  <th className="w-44 px-4 py-2.5">{t('grf.col.already')}</th>
                  <th className="px-4 py-2.5 text-right">{t('grf.col.remaining')}</th>
                  <th className="w-40 px-4 py-2.5 text-right">{t('grf.col.now')}</th>
                  <th className="w-44 px-4 py-2.5 text-right">{t('grx.col.refused')}</th>
                  <th className="px-4 py-2.5 text-right">{t('grf.col.value')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => {
                  const done = r.remaining <= 0;
                  const ordered = Number(r.l.quantity);
                  const before = Number(r.l.receivedQty);
                  const pctBefore = ordered > 0 ? (before / ordered) * 100 : 0;
                  const factor = Number(r.l.unitFactor);
                  return (
                    <tr
                      key={r.l.id}
                      style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                      className={clsx(
                        'animate-rise align-top transition-colors duration-700',
                        flash === r.l.id && 'bg-emerald-50',
                        done && 'bg-slate-50/60',
                      )}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/inventory/products/${r.l.product.id}`}
                          target="_blank"
                          className="font-medium text-slate-900 hover:text-orange-700"
                        >
                          {r.l.product.name}
                        </Link>
                        <p className="font-mono text-xs text-slate-400">
                          {r.l.product.sku}
                          {factor !== 1 &&
                            ` · ${t('pop.unitEq', { unit: r.l.unit.code, factor: qty(factor), base: r.l.product.baseUnitCode })}`}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        {qty(ordered)}{' '}
                        <span className="text-xs text-slate-400">{r.l.unit.code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="absolute inset-y-0 left-0 bg-emerald-500"
                              style={{ width: `${pctBefore}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-xs text-slate-500 tabular-nums">
                            {qty(before)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
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
                      <td className="px-4 py-2">
                        {!done && (
                          <>
                            <div className="flex items-center gap-1.5">
                              <input
                                inputMode="decimal"
                                value={show(r.raw)}
                                placeholder="0"
                                disabled={Boolean(saving)}
                                onChange={(e) => setQty(r.l.id, e.target.value)}
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
                            ) : (
                              factor !== 1 &&
                              r.now > 0 && (
                                <p className="mt-1 text-right text-[11px] text-slate-400">
                                  = {qty(r.now * factor)} {r.l.product.baseUnitCode}
                                </p>
                              )
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {!done && (
                          <>
                            <input
                              inputMode="decimal"
                              value={show(r.rawRejected)}
                              placeholder="0"
                              disabled={Boolean(saving)}
                              aria-label={t('grx.col.refused')}
                              onChange={(e) =>
                                setRejected((q) => ({
                                  ...q,
                                  [r.l.id]: e.target.value.trim().replace(',', '.'),
                                }))
                              }
                              onFocus={(e) => e.target.select()}
                              className={clsx(
                                fieldClass,
                                'w-full px-2 text-right tabular-nums',
                                r.refused > 0 && 'border-red-300 bg-red-50/40',
                              )}
                            />
                            {r.refused > 0 && (
                              <input
                                value={r.reason}
                                maxLength={200}
                                disabled={Boolean(saving)}
                                placeholder={t('grx.reasonPh')}
                                onChange={(e) =>
                                  setReasons((q) => ({ ...q, [r.l.id]: e.target.value }))
                                }
                                className={clsx(
                                  fieldClass,
                                  'animate-fade mt-1 w-full px-2 text-xs',
                                  submitted && r.reasonMissing && 'animate-shake border-red-400!',
                                )}
                              />
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                        {r.now > 0 && !r.invalid ? (
                          money(r.value)
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {order && (
          <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 bg-gradient-to-br from-slate-50 to-amber-50/40 px-5 py-4">
            <p className="max-w-md text-xs text-slate-500">{t('grf.stockNote')}</p>
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
                <dd className="text-xl font-semibold text-orange-700 tabular-nums">
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
            router.push(
              draft
                ? `/purchasing/receipts/${draft.id}`
                : order
                  ? `/purchasing/orders/${order.id}`
                  : '/purchasing/receipts',
            )
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

/** Barcode field: a scanner types the code and presses Enter; each scan counts one unit. */
function ScanBox({
  onScan,
  disabled,
}: {
  onScan: (code: string) => Promise<{ error?: string; ok?: boolean } | undefined>;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function go() {
    const term = code.trim();
    if (!term) return;
    setBusy(true);
    const res = await onScan(term);
    setBusy(false);
    setCode('');
    input.current?.focus();
    if (res?.error) {
      setMessage(res.error);
      setTimeout(() => setMessage(null), 2200);
    }
  }

  return (
    <div className="relative w-full sm:w-80">
      <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={input}
        value={code}
        disabled={disabled}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void go();
          }
        }}
        placeholder={t('grf.scanPh')}
        className={clsx(inputClass, 'pr-9 pl-9', message && 'animate-shake border-red-400!')}
      />
      {busy && <Spinner className="absolute top-1/2 right-3 -translate-y-1/2 text-amber-500" />}
      {message && (
        <p className="animate-fade absolute top-full right-0 z-10 mt-1 rounded bg-white px-1 text-xs text-red-600">
          {message}
        </p>
      )}
    </div>
  );
}
