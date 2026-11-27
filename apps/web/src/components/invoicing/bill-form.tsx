'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  PackageCheck,
  PackagePlus,
  Plus,
  ReceiptText,
  Send,
  Trash2,
} from 'lucide-react';
import {
  CURRENCIES,
  CURRENCY_DECIMALS,
  type BillDetail,
  type BillInput,
  type BillLookups,
  type BillableReceipt,
  type BillableReceiptLine,
  type CurrencyCode,
  type DiscountTypeCode,
  type SupplierDetail,
  type SupplierListItem,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  ErrorBox,
  Field,
  Spinner,
  btnSecondary,
  errorMessages,
  fieldClass,
  inputClass,
  useSuccess,
} from '@/components/purchasing/ui';
import { SupplierSelect } from './supplier-select';
import {
  InvoicingHero,
  addDays,
  btnInvoice,
  computeBillPreview,
  localToday,
  useCurrency,
} from './ui';

const DECIMAL_4 = /^\d{0,14}([.,]\d{0,4})?$/;

interface FormLine {
  key: string;
  goodsReceiptLineId: string | null;
  productId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  taxRateId: string | null;
  /** Received line details, for the hints */
  from?: {
    receipt: string;
    order: string;
    unit: string;
    toBill: number;
    orderPrice: string;
    orderDiscount: string;
  };
}

let seq = 0;
const newKey = () => `l${++seq}`;

/**
 * Creates or edits a draft supplier bill: lines from received goods (not billed yet)
 * and free lines (services, transport, fees). Saved as a draft, or saved and posted.
 */
export function BillForm({
  bill,
  presetSupplierId,
  presetReceiptId,
}: {
  bill?: BillDetail;
  presetSupplierId?: string;
  presetReceiptId?: string;
}) {
  const router = useRouter();
  const { t, lang, date, qty } = useI18n();
  const { fmt, label } = useCurrency();
  const { burst, celebrate } = useSuccess();

  const [lookups, setLookups] = useState<BillLookups | null>(null);
  const [supplier, setSupplier] = useState<{
    id: string;
    name: string;
    paymentTermDays: number;
  } | null>(bill ? { id: bill.supplier.id, name: bill.supplier.name, paymentTermDays: 0 } : null);
  const [supplierRef, setSupplierRef] = useState(bill?.supplierRef ?? '');
  const [issueDate, setIssueDate] = useState(bill?.issueDate ?? localToday());
  const [dueDate, setDueDate] = useState(bill?.dueDate ?? '');
  const [dueTouched, setDueTouched] = useState(Boolean(bill));
  const [currency, setCurrency] = useState<CurrencyCode>(bill?.currency ?? 'TND');
  const [discountType, setDiscountType] = useState<DiscountTypeCode | null>(
    bill?.discountType ?? null,
  );
  const [discountValue, setDiscountValue] = useState(
    bill && Number(bill.discountValue) ? String(Number(bill.discountValue)) : '',
  );
  const [notes, setNotes] = useState(bill?.notes ?? '');
  const [lines, setLines] = useState<FormLine[]>(
    () =>
      bill?.lines.map((l) => ({
        key: newKey(),
        goodsReceiptLineId: l.receiptLine?.id ?? null,
        productId: l.product?.id ?? null,
        description: l.description,
        quantity: String(Number(l.quantity)),
        unitPrice: String(Number(l.unitPrice)),
        discountPct: String(Number(l.discountPct)),
        taxRateId: l.taxRateId,
        from: l.receiptLine
          ? {
              receipt: l.receiptLine.receipt.number,
              order: l.receiptLine.purchaseOrder.number,
              unit: l.receiptLine.unit.code,
              toBill: Number(l.receiptLine.receivedQty) - Number(l.receiptLine.billedElsewhere),
              orderPrice: l.receiptLine.orderPrice,
              orderDiscount: l.receiptLine.orderDiscountPct,
            }
          : undefined,
      })) ?? [],
  );
  const [billable, setBillable] = useState<BillableReceipt[] | null>(null);
  const [saving, setSaving] = useState<null | 'draft' | 'post'>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | string[] | null>(null);
  const [presetDone, setPresetDone] = useState(false);

  useEffect(() => {
    api<BillLookups>('/invoicing/bills/lookups')
      .then((l) => {
        setLookups(l);
        if (!bill) setCurrency(l.companyCurrency);
      })
      .catch((e) => setError(errorMessages(e)));
  }, [bill]);

  // Payment terms of the supplier (and the preset supplier from the URL)
  useEffect(() => {
    const id = supplier?.id ?? presetSupplierId;
    if (!id || (supplier && supplier.paymentTermDays > 0)) return;
    api<SupplierDetail>(`/purchasing/suppliers/${id}`)
      .then((s) => setSupplier({ id: s.id, name: s.name, paymentTermDays: s.paymentTermDays }))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetSupplierId, supplier?.id]);

  // Default due date = issue date + payment terms, until the user changes it
  useEffect(() => {
    if (dueTouched) return;
    setDueDate(addDays(issueDate, supplier?.paymentTermDays ?? 0));
  }, [issueDate, supplier?.paymentTermDays, dueTouched]);

  // Received goods not billed yet
  useEffect(() => {
    if (!supplier) {
      setBillable(null);
      return;
    }
    setBillable(null);
    api<BillableReceipt[]>(`/invoicing/bills/billable?supplierId=${supplier.id}`)
      .then(setBillable)
      .catch(() => setBillable([]));
  }, [supplier?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const taxRates = lookups?.taxRates ?? [];
  const taxFor = (rate: string) =>
    taxRates.find((r) => Number(r.rate) === Number(rate))?.id ?? null;

  function receiptLineToForm(l: BillableReceiptLine): FormLine {
    return {
      key: newKey(),
      goodsReceiptLineId: l.goodsReceiptLineId,
      productId: l.product.id,
      description: l.product.name,
      quantity: String(Number(l.toBill)),
      unitPrice: String(Number(l.unitPrice)),
      discountPct: String(Number(l.discountPct)),
      taxRateId: taxFor(l.taxRate),
      from: {
        receipt: l.receipt.number,
        order: l.purchaseOrder.number,
        unit: l.unit.code,
        toBill: Number(l.toBill),
        orderPrice: l.unitPrice,
        orderDiscount: l.discountPct,
      },
    };
  }

  const onBill = new Set(lines.map((l) => l.goodsReceiptLineId).filter(Boolean));
  function addReceipt(r: BillableReceipt) {
    const add = r.lines.filter((l) => !onBill.has(l.goodsReceiptLineId)).map(receiptLineToForm);
    setLines((ls) => [...ls, ...add]);
    if (!supplierRef && r.supplierInvoiceNumber) {
      setSupplierRef(r.supplierInvoiceNumber);
      if (r.supplierInvoiceDate) setIssueDate(r.supplierInvoiceDate);
    }
  }

  // ?receiptId= : add that receipt once its lines are loaded
  useEffect(() => {
    if (presetDone || !presetReceiptId || !billable || !lookups) return;
    const r = billable.find((b) => b.id === presetReceiptId);
    if (r) addReceipt(r);
    setPresetDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billable, lookups, presetReceiptId, presetDone]);

  const decimals = CURRENCY_DECIMALS[currency];
  const preview = useMemo(
    () =>
      computeBillPreview(
        lines.map((l) => ({
          quantity: l.quantity || '0',
          unitPrice: l.unitPrice || '0',
          discountPct: l.discountPct || '0',
          taxRate: Number(taxRates.find((r) => r.id === l.taxRateId)?.rate ?? 0),
        })),
        { type: discountType, value: discountValue || '0' },
        currency,
      ),
    [lines, discountType, discountValue, currency, taxRates],
  );

  const lineErrors = lines.map((l) => {
    if (!l.description.trim()) return t('bill.err.description');
    if (!(Number(l.quantity) > 0)) return t('bill.err.qty');
    if (l.from && Number(l.quantity) > l.from.toBill + 1e-9) {
      return t('bill.err.moreThanReceived', { n: qty(l.from.toBill), unit: l.from.unit });
    }
    if (l.discountPct && Number(l.discountPct) > 100) return t('bill.err.discount');
    return null;
  });
  const headerError =
    issueDate > localToday()
      ? t('bill.err.future')
      : dueDate && dueDate < issueDate
        ? t('bill.err.due')
        : null;

  const show = (v: string) => (lang === 'fr' ? v.replace('.', ',') : v);
  const setLine = (key: string, patch: Partial<FormLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const num = (v: string) => v.trim().replace(',', '.');

  async function save(post: boolean) {
    setSubmitted(true);
    setError(null);
    if (!supplier) return setError(t('pay.err.supplier'));
    if (!lines.length) return setError(t('bill.err.noLines'));
    if (lineErrors.some(Boolean) || headerError) return;
    if (post && !supplierRef.trim()) return setError(t('bill.err.ref'));
    setSaving(post ? 'post' : 'draft');
    const body: BillInput = {
      supplierId: supplier.id,
      supplierRef: supplierRef.trim() || null,
      issueDate,
      dueDate: dueDate || null,
      currency,
      discountType,
      discountValue: discountType ? discountValue || '0' : '0',
      notes: notes.trim() || null,
      lines: lines.map((l) => ({
        goodsReceiptLineId: l.goodsReceiptLineId,
        productId: l.goodsReceiptLineId ? null : l.productId,
        description: l.description.trim(),
        quantity: l.quantity,
        unitPrice: l.unitPrice || '0',
        discountPct: l.discountPct || '0',
        taxRateId: l.taxRateId,
      })),
    };
    let saved: BillDetail;
    try {
      saved = await api<BillDetail>(bill ? `/invoicing/bills/${bill.id}` : '/invoicing/bills', {
        method: bill ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
    } catch (e) {
      setError(errorMessages(e));
      setSaving(null);
      return;
    }
    if (post) {
      try {
        saved = await api<BillDetail>(`/invoicing/bills/${saved.id}/post`, { method: 'POST' });
      } catch (e) {
        // Saved as a draft but not posted: open it so the problem can be fixed there.
        setError(errorMessages(e));
        setSaving(null);
        if (!bill) router.replace(`/invoicing/bills/${saved.id}/edit`);
        return;
      }
    }
    celebrate(post ? t('bill.posted', { number: saved.number }) : t('bill.savedDraft'), () =>
      router.push(`/invoicing/bills/${saved.id}`),
    );
  }

  const available = (billable ?? [])
    .map((r) => ({ ...r, lines: r.lines.filter((l) => !onBill.has(l.goodsReceiptLineId)) }))
    .filter((r) => r.lines.length > 0);

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-4">
      <InvoicingHero
        icon={ReceiptText}
        title={bill ? t('bill.editTitle', { number: bill.number }) : t('bill.newTitle')}
        subtitle={t('bill.formSubtitle')}
        crumb={[
          { label: t('nav.item.bills'), href: '/invoicing/bills' },
          ...(bill ? [{ label: bill.number, href: `/invoicing/bills/${bill.id}` }] : []),
          { label: bill ? t('bill.crumbEdit') : t('bill.crumbNew') },
        ]}
      />

      {error && <ErrorBox message={error} />}

      <section
        className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        style={{ animationDelay: '80ms' }}
      >
        <fieldset disabled={Boolean(saving)} className="grid gap-4 md:grid-cols-12">
          <Field label={t('bill.f.supplier')} className="md:col-span-5">
            <SupplierSelect
              value={supplier}
              disabled={Boolean(bill) || lines.some((l) => l.goodsReceiptLineId)}
              onChange={(s: SupplierListItem | null) => {
                setSupplier(
                  s ? { id: s.id, name: s.name, paymentTermDays: s.paymentTermDays } : null,
                );
                setDueTouched(false);
              }}
            />
          </Field>
          <Field label={t('bill.f.ref')} hint={t('bill.f.refHint')} className="md:col-span-3">
            <input
              value={supplierRef}
              maxLength={60}
              onChange={(e) => setSupplierRef(e.target.value)}
              placeholder="FA-2026-0917"
              className={clsx(inputClass, 'font-mono')}
            />
          </Field>
          <Field label={t('bill.f.currency')} className="md:col-span-4">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={label(c)}
                  onClick={() => setCurrency(c)}
                  className={clsx(
                    'rounded-md px-2 py-1.5 text-sm font-semibold transition',
                    currency === c
                      ? 'animate-pop bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <Field
            label={t('bill.f.issueDate')}
            className="md:col-span-3"
            error={submitted && headerError === t('bill.err.future') ? headerError : null}
          >
            <input
              type="date"
              value={issueDate}
              max={localToday()}
              onChange={(e) => setIssueDate(e.target.value || localToday())}
              className={inputClass}
            />
          </Field>
          <Field
            label={t('bill.f.dueDate')}
            className="md:col-span-3"
            hint={
              !dueTouched && supplier
                ? t('bill.f.dueHint', { n: supplier.paymentTermDays })
                : undefined
            }
            error={submitted && headerError === t('bill.err.due') ? headerError : null}
          >
            <input
              type="date"
              value={dueDate}
              min={issueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setDueTouched(true);
              }}
              className={inputClass}
            />
          </Field>
          <Field label={t('bill.f.discount')} className="md:col-span-3">
            <div className="flex gap-1.5">
              <select
                value={discountType ?? ''}
                onChange={(e) =>
                  setDiscountType((e.target.value || null) as DiscountTypeCode | null)
                }
                className={clsx(fieldClass, 'w-24')}
              >
                <option value="">{t('bill.f.noDiscount')}</option>
                <option value="PERCENT">%</option>
                <option value="AMOUNT">{currency}</option>
              </select>
              <input
                inputMode="decimal"
                disabled={!discountType}
                value={show(discountValue)}
                placeholder="0"
                onChange={(e) =>
                  DECIMAL_4.test(e.target.value.trim()) && setDiscountValue(num(e.target.value))
                }
                className={clsx(fieldClass, 'min-w-0 flex-1 text-right tabular-nums')}
              />
            </div>
          </Field>
          <Field label={t('grp.notes')} className="md:col-span-3">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </Field>
        </fieldset>
      </section>

      {/* Received goods not billed yet */}
      {supplier && (
        <section
          className="animate-rise overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/40 shadow-sm"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center gap-2 border-b border-indigo-100/70 px-5 py-3">
            <PackageCheck className="size-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">{t('bill.toBill')}</h2>
            {billable === null && <Spinner className="text-indigo-500" />}
          </div>
          {billable !== null && available.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-4 text-sm text-slate-500">
              <CheckCircle2 className="size-4 text-emerald-500" /> {t('bill.nothingToBill')}
            </p>
          ) : (
            <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {available.map((r, i) => (
                <li
                  key={r.id}
                  className="animate-rise rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-indigo-500/15"
                  style={{ animationDelay: `${140 + i * 40}ms` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        href={`/purchasing/receipts/${r.id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-slate-800 hover:text-indigo-700"
                      >
                        {r.number} <ExternalLink className="size-3" />
                      </Link>
                      <p className="text-xs text-slate-400">
                        {r.purchaseOrder.number} · {date(r.receivedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addReceipt(r)}
                      disabled={Boolean(saving)}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-600/15 transition hover:bg-indigo-100 active:scale-95"
                    >
                      <PackagePlus className="size-3.5" /> {t('bill.addReceipt')}
                    </button>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {r.lines.map((l) => (
                      <li key={l.goodsReceiptLineId} className="flex justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setLines((ls) => [...ls, receiptLineToForm(l)])}
                          className="truncate text-left hover:text-indigo-700 hover:underline"
                          title={t('bill.addLine')}
                        >
                          + {l.product.name}
                        </button>
                        <span className="whitespace-nowrap tabular-nums">
                          {qty(l.toBill)} {l.unit.code}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {r.supplierInvoiceNumber && (
                    <p className="mt-2 text-[11px] text-slate-400">
                      {t('bill.invOnReceipt', { number: r.supplierInvoiceNumber })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Lines */}
      <section
        className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ animationDelay: '160ms' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-slate-900">
            {t('bill.lines')}{' '}
            <span className="text-sm font-normal text-slate-400">({lines.length})</span>
          </h2>
          <button
            type="button"
            className={btnSecondary}
            disabled={Boolean(saving)}
            onClick={() =>
              setLines((ls) => [
                ...ls,
                {
                  key: newKey(),
                  goodsReceiptLineId: null,
                  productId: null,
                  description: '',
                  quantity: '1',
                  unitPrice: '',
                  discountPct: '',
                  taxRateId: lookups?.taxRates[0]?.id ?? null,
                },
              ])
            }
          >
            <Plus className="size-4" /> {t('bill.addFree')}
          </button>
        </div>
        {lines.length === 0 ? (
          <div className="animate-fade flex flex-col items-center px-6 py-12 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 ring-8 ring-indigo-50">
              <ReceiptText className="size-6 text-indigo-600" />
            </div>
            <p className="mt-4 font-medium text-slate-800">{t('bill.noLinesTitle')}</p>
            <p className="mt-1 max-w-md text-sm text-slate-500">{t('bill.noLinesText')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('bill.col.description')}</th>
                  <th className="w-28 px-2 py-2.5 text-right">{t('bill.col.qty')}</th>
                  <th className="w-32 px-2 py-2.5 text-right">{t('bill.col.price')}</th>
                  <th className="w-20 px-2 py-2.5 text-right">{t('bill.col.discount')}</th>
                  <th className="w-36 px-2 py-2.5">{t('bill.col.vat')}</th>
                  <th className="w-32 px-4 py-2.5 text-right">{t('bill.col.net')}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l, i) => {
                  const err = submitted ? lineErrors[i] : null;
                  // Order prices are in the company currency: compare only in it.
                  const priceDiff =
                    l.from &&
                    currency === lookups?.companyCurrency &&
                    l.unitPrice !== '' &&
                    Number(l.unitPrice) !== Number(l.from.orderPrice);
                  return (
                    <tr
                      key={l.key}
                      className="animate-rise align-top"
                      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                    >
                      <td className="px-4 py-2">
                        <input
                          value={l.description}
                          onChange={(e) => setLine(l.key, { description: e.target.value })}
                          placeholder={t('bill.descPh')}
                          className={clsx(
                            inputClass,
                            err === t('bill.err.description') && 'animate-shake border-red-400!',
                          )}
                        />
                        {l.from && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            {l.from.receipt} · {l.from.order} ·{' '}
                            {t('bill.leftToBill', { n: qty(l.from.toBill), unit: l.from.unit })}
                          </p>
                        )}
                        {err && err !== t('bill.err.description') && (
                          <p className="animate-fade mt-1 text-[11px] text-red-600">{err}</p>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          inputMode="decimal"
                          value={show(l.quantity)}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            DECIMAL_4.test(e.target.value.trim()) &&
                            setLine(l.key, { quantity: num(e.target.value) })
                          }
                          className={clsx(
                            fieldClass,
                            'w-full px-2 text-right tabular-nums',
                            err &&
                              err !== t('bill.err.description') &&
                              err !== t('bill.err.discount') &&
                              'border-red-400!',
                          )}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          inputMode="decimal"
                          value={show(l.unitPrice)}
                          placeholder="0"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            DECIMAL_4.test(e.target.value.trim()) &&
                            setLine(l.key, { unitPrice: num(e.target.value) })
                          }
                          className={clsx(
                            fieldClass,
                            'w-full px-2 text-right tabular-nums',
                            priceDiff && 'border-amber-400 bg-amber-50/50',
                          )}
                        />
                        {priceDiff && (
                          <p className="animate-fade mt-1 flex items-center justify-end gap-1 text-[11px] text-amber-700">
                            <AlertTriangle className="size-3" />
                            {t('bill.orderPrice', {
                              price: show(String(Number(l.from!.orderPrice))),
                            })}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          inputMode="decimal"
                          value={show(l.discountPct)}
                          placeholder="0"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            DECIMAL_4.test(e.target.value.trim()) &&
                            setLine(l.key, { discountPct: num(e.target.value) })
                          }
                          className={clsx(
                            fieldClass,
                            'w-full px-2 text-right tabular-nums',
                            err === t('bill.err.discount') && 'border-red-400!',
                          )}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={l.taxRateId ?? ''}
                          onChange={(e) => setLine(l.key, { taxRateId: e.target.value || null })}
                          className={clsx(fieldClass, 'w-full px-2')}
                        >
                          <option value="">{t('bill.noVat')}</option>
                          {taxRates.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                        {fmt(preview.lines[i]?.subtotal ?? 0, currency)}
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                          aria-label={t('bill.removeLine')}
                          className="mt-1 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
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

        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 bg-gradient-to-br from-slate-50 to-indigo-50/40 px-5 py-4">
          <p className="flex max-w-md items-start gap-2 text-xs text-slate-500">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-indigo-500" />
            {t('bill.formNote', { decimals })}
          </p>
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <Row label={t('bill.subtotal')} value={fmt(preview.subtotal, currency)} />
            {preview.discountTotal > 0 && (
              <Row
                label={t('bill.discountTotal')}
                value={`− ${fmt(preview.discountTotal, currency)}`}
              />
            )}
            <Row label={t('bill.taxTotal')} value={fmt(preview.taxTotal, currency)} />
            <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
              <dt className="font-semibold text-slate-900">{t('bill.total')}</dt>
              <dd
                key={`${preview.total}-${currency}`}
                className="animate-pop text-xl font-semibold text-indigo-700 tabular-nums"
              >
                {fmt(preview.total, currency)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div
        className="animate-rise sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 shadow-lg backdrop-blur"
        style={{ animationDelay: '220ms' }}
      >
        <p className="mr-auto hidden text-xs text-slate-500 sm:block">{t('bill.postNote')}</p>
        <button
          className={btnSecondary}
          onClick={() => router.push(bill ? `/invoicing/bills/${bill.id}` : '/invoicing/bills')}
          disabled={Boolean(saving)}
        >
          {t('common.cancel')}
        </button>
        <button
          className={btnSecondary}
          onClick={() => void save(false)}
          disabled={Boolean(saving)}
        >
          {saving === 'draft' && <Spinner />} {t('bill.saveDraft')}
        </button>
        <button className={btnInvoice} onClick={() => void save(true)} disabled={Boolean(saving)}>
          {saving === 'post' ? <Spinner /> : <Send className="size-4" />}
          {t('bill.saveAndPost')}
        </button>
      </div>
      {burst}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
