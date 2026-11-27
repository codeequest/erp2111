'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Banknote, CheckCheck, Wallet } from 'lucide-react';
import {
  CURRENCIES,
  CURRENCY_DECIMALS,
  PAYMENT_METHODS,
  type BillListItem,
  type CurrencyCode,
  type Paginated,
  type PaymentDetail,
  type PaymentInput,
  type PaymentMethodCode,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  ErrorBox,
  Field,
  Modal,
  Spinner,
  btnSecondary,
  errorMessages,
  inputClass,
} from '@/components/purchasing/ui';
import { SupplierSelect } from './supplier-select';
import { OverdueBadge, btnInvoice, localToday, useCurrency } from './ui';

const MONEY_INPUT = /^\d{0,14}([.,]\d{0,3})?$/;

/**
 * Records a payment to a supplier and splits it over their open bills (same currency).
 * Opened from a bill (that bill is pre-filled with its balance) or from the payments
 * screen (the supplier and currency are chosen in the dialog).
 */
export function PaymentDialog({
  open,
  onClose,
  onSaved,
  supplier: fixedSupplier,
  currency: fixedCurrency,
  billId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (p: PaymentDetail) => void;
  supplier?: { id: string; name: string };
  currency?: CurrencyCode;
  /** Pre-select this bill with its full balance */
  billId?: string;
}) {
  const { t, lang, date } = useI18n();
  const { fmt, label } = useCurrency();
  const [supplier, setSupplier] = useState<{ id: string; name: string } | null>(
    fixedSupplier ?? null,
  );
  const [currency, setCurrency] = useState<CurrencyCode>(fixedCurrency ?? 'TND');
  const [bills, setBills] = useState<BillListItem[] | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<PaymentMethodCode>('BANK_TRANSFER');
  const [paidAt, setPaidAt] = useState(localToday());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | string[] | null>(null);

  // Reset when (re)opened
  useEffect(() => {
    if (!open) return;
    setSupplier(fixedSupplier ?? null);
    setCurrency(fixedCurrency ?? 'TND');
    setMethod('BANK_TRANSFER');
    setPaidAt(localToday());
    setReference('');
    setNotes('');
    setError(null);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !supplier) {
      setBills(null);
      return;
    }
    setBills(null);
    const qs = new URLSearchParams({
      status: 'open',
      supplierId: supplier.id,
      currency,
      pageSize: '100',
    });
    api<Paginated<BillListItem>>(`/invoicing/bills?${qs}`)
      .then((r) => {
        setBills(r.items);
        setAmounts(
          Object.fromEntries(r.items.map((b) => [b.id, b.id === billId ? b.balance : ''])),
        );
      })
      .catch((e) => setError(errorMessages(e)));
  }, [open, supplier, currency, billId]);

  const decimals = CURRENCY_DECIMALS[currency];
  const show = (v: string) => (lang === 'fr' ? v.replace('.', ',') : v);
  const rows = useMemo(
    () =>
      (bills ?? []).map((b) => {
        const raw = amounts[b.id] ?? '';
        const n = raw === '' ? 0 : Number(raw);
        const over = n > Number(b.balance) + 1e-9;
        const tooPrecise = (raw.split('.')[1]?.length ?? 0) > decimals;
        return { b, raw, n, over, tooPrecise };
      }),
    [bills, amounts, decimals],
  );
  const total = rows.reduce((s, r) => s + (r.over || r.tooPrecise ? 0 : r.n), 0);
  const invalid = rows.some((r) => r.over || r.tooPrecise);
  const paying = rows.filter((r) => r.n > 0);

  async function submit() {
    setError(null);
    if (!supplier) return setError(t('pay.err.supplier'));
    if (!paying.length) return setError(t('pay.err.none'));
    if (invalid) return;
    if (paidAt > localToday()) return setError(t('pay.err.future'));
    setSaving(true);
    const body: PaymentInput = {
      supplierId: supplier.id,
      method,
      currency,
      amount: total.toFixed(decimals),
      paidAt,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
      allocations: paying.map((r) => ({ invoiceId: r.b.id, amount: r.n.toFixed(decimals) })),
    };
    try {
      const p = await api<PaymentDetail>('/invoicing/payments', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onSaved(p);
    } catch (e) {
      setError(errorMessages(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={t('pay.title')}
      subtitle={supplier ? supplier.name : t('pay.subtitle')}
      wide
      footer={
        <>
          <span className="mr-auto text-sm text-slate-500">
            {t('pay.total')}{' '}
            <span className="text-lg font-semibold text-indigo-700 tabular-nums">
              {fmt(total, currency)}
            </span>
          </span>
          <button className={btnSecondary} onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button
            className={btnInvoice}
            onClick={() => void submit()}
            disabled={saving || !paying.length || invalid}
          >
            {saving ? <Spinner /> : <Banknote className="size-4" />}
            {t('pay.submit')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorBox message={error} />}
        <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2">
          {!fixedSupplier && (
            <Field label={t('bill.f.supplier')} className="sm:col-span-2">
              <SupplierSelect value={supplier} onChange={setSupplier} />
            </Field>
          )}
          <Field label={t('bill.f.currency')}>
            <select
              value={currency}
              disabled={Boolean(fixedCurrency)}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className={inputClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pay.f.method')}>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethodCode)}
              className={inputClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`pay.method.${m}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pay.f.date')}>
            <input
              type="date"
              value={paidAt}
              max={localToday()}
              onChange={(e) => setPaidAt(e.target.value || localToday())}
              className={inputClass}
            />
          </Field>
          <Field label={t('pay.f.reference')} hint={t('pay.f.referenceHint')}>
            <input
              value={reference}
              maxLength={100}
              onChange={(e) => setReference(e.target.value)}
              className={clsx(inputClass, 'font-mono')}
            />
          </Field>
          <Field label={t('grp.notes')} className="sm:col-span-2">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </Field>
        </fieldset>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2">
            <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              {t('pay.bills')}
            </span>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setAmounts(Object.fromEntries(rows.map((r) => [r.b.id, r.b.balance])))
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
              >
                <CheckCheck className="size-3.5" /> {t('pay.all')}
              </button>
            )}
          </div>
          {!supplier ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">{t('pay.pickSupplier')}</p>
          ) : bills === null ? (
            <div className="grid place-items-center py-8">
              <Spinner className="text-indigo-500" />
            </div>
          ) : bills.length === 0 ? (
            <div className="animate-fade flex flex-col items-center px-4 py-8 text-center">
              <Wallet className="size-7 text-indigo-400" />
              <p className="mt-2 text-sm text-slate-500">{t('pay.noBills', { currency })}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <li
                  key={r.b.id}
                  className="animate-rise flex flex-wrap items-center gap-3 px-4 py-2.5"
                  style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-mono text-xs font-semibold text-slate-800">
                      {r.b.number} <OverdueBadge days={r.b.daysOverdue} />
                    </p>
                    <p className="text-xs text-slate-400">
                      {r.b.supplierRef ?? '—'} · {t('bill.due', { date: date(r.b.dueDate) })} ·{' '}
                      {t('bill.left', { amount: fmt(r.b.balance, r.b.currency) })}
                    </p>
                  </div>
                  <div className="w-40">
                    <input
                      inputMode="decimal"
                      value={show(r.raw)}
                      placeholder="0"
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (!MONEY_INPUT.test(v)) return;
                        setAmounts((a) => ({ ...a, [r.b.id]: v.replace(',', '.') }));
                      }}
                      className={clsx(
                        inputClass,
                        'text-right tabular-nums',
                        r.n > 0 && !r.over && 'border-indigo-400 bg-indigo-50/40',
                        (r.over || r.tooPrecise) && 'animate-shake border-red-400!',
                      )}
                    />
                    {r.over && (
                      <p className="mt-0.5 text-right text-[11px] text-red-600">{t('pay.over')}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
