'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Banknote, Plus, Search, Wallet } from 'lucide-react';
import {
  PAYMENT_METHODS,
  type Paginated,
  type PaymentListItem,
  type PaymentMethodCode,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AccessDenied } from '@/components/page-header';
import {
  EmptyState,
  ErrorBox,
  Pager,
  Spinner,
  errorMessages,
  fieldClass,
  inputClass,
  useSuccess,
} from '@/components/purchasing/ui';
import { PaymentDialog } from '@/components/invoicing/payment-dialog';
import { InvoicingHero, heroButtonInv, useCurrency } from '@/components/invoicing/ui';

const PAGE_SIZE = 25;

export default function PaymentsPage() {
  const { can } = useAuth();
  const { t, date } = useI18n();
  const { fmt } = useCurrency();
  const canRead = can('invoicing.payment.read');
  const canPay = can('invoicing.payment.record');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [method, setMethod] = useState<PaymentMethodCode | ''>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<PaymentListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | string[] | null>(null);
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const { burst, celebrate } = useSuccess();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debounced) qs.set('search', debounced);
    if (method) qs.set('method', method);
    api<Paginated<PaymentListItem>>(`/invoicing/payments?${qs}`)
      .then((r) => {
        if (cancelled) return;
        setData(r);
        setError(null);
      })
      .catch((e) => !cancelled && setError(errorMessages(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [canRead, page, debounced, method, reload]);

  if (!canRead)
    return <AccessDenied permission="invoicing.payment.read" what={t('nav.item.payments')} />;
  const filtered = Boolean(debounced || method);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <InvoicingHero
        icon={Wallet}
        title={t('nav.item.payments')}
        subtitle={t('pay.pageSubtitle')}
        crumb={[{ label: t('nav.item.payments') }]}
        actions={
          canPay && (
            <button className={heroButtonInv} onClick={() => setOpen(true)}>
              <Plus className="size-4" /> {t('pay.new')}
            </button>
          )
        }
      />

      <div
        className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ animationDelay: '120ms' }}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('pay.search')}
              className={clsx(inputClass, 'pl-9')}
            />
          </div>
          <select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as PaymentMethodCode | '');
              setPage(1);
            }}
            className={fieldClass}
            aria-label={t('pay.f.method')}
          >
            <option value="">{t('pay.allMethods')}</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`pay.method.${m}`)}
              </option>
            ))}
          </select>
          {loading && <Spinner className="text-indigo-500" />}
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} />
          </div>
        ) : data && data.items.length === 0 && !loading ? (
          <EmptyState
            icon={Banknote}
            title={filtered ? t('bill.emptyMatch') : t('pay.emptyNone')}
            text={filtered ? t('bill.emptyMatchText') : t('pay.emptyNoneText')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('pay.col.number')}</th>
                  <th className="px-4 py-2.5">{t('bill.col.supplier')}</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">{t('pay.f.method')}</th>
                  <th className="hidden px-4 py-2.5 lg:table-cell">{t('pay.col.bills')}</th>
                  <th className="px-4 py-2.5 text-right">{t('pay.col.amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items.map((p, i) => (
                  <tr
                    key={p.id}
                    className="animate-rise transition hover:bg-indigo-50/40"
                    style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-slate-900">
                        {p.number}
                      </span>
                      <p className="text-xs text-slate-400">{date(p.paidAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-800">{p.supplier?.name ?? '—'}</span>
                      <p className="text-xs text-slate-400">{p.createdBy.fullName}</p>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="text-slate-700">{t(`pay.method.${p.method}`)}</span>
                      {p.reference && (
                        <p className="font-mono text-xs text-slate-400">{p.reference}</p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <span className="flex flex-wrap gap-x-2">
                        {p.allocations.map((a) => (
                          <Link
                            key={a.invoiceId}
                            href={`/invoicing/bills/${a.invoiceId}`}
                            className="font-mono text-xs text-slate-600 hover:text-indigo-700 hover:underline"
                            title={fmt(a.amount, p.currency)}
                          >
                            {a.number}
                          </Link>
                        ))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-emerald-700 tabular-nums">
                      {fmt(p.amount, p.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && (
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={data.total}
            rangeKey="pager.payments"
            onPage={setPage}
          />
        )}
      </div>

      <PaymentDialog
        open={open}
        onClose={() => setOpen(false)}
        onSaved={(p) => {
          setOpen(false);
          setReload((r) => r + 1);
          celebrate(t('pay.saved', { number: p.number }));
        }}
      />
      {burst}
    </div>
  );
}
