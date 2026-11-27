'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Banknote,
  CalendarClock,
  ClipboardList,
  FileText,
  Lock,
  PackageCheck,
  Pencil,
  ReceiptText,
  Send,
  Trash2,
  Truck,
  UserRound,
} from 'lucide-react';
import type { BillDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AccessDenied } from '@/components/page-header';
import {
  ErrorBox,
  Field,
  Modal,
  Spinner,
  btnDanger,
  btnSecondary,
  errorMessages,
  inputClass,
  useSuccess,
} from '@/components/purchasing/ui';
import { PaymentDialog } from '@/components/invoicing/payment-dialog';
import {
  BillStatusBadge,
  InvoicingHero,
  OverdueBadge,
  heroButtonInv,
  heroGhostInv,
  useCurrency,
} from '@/components/invoicing/ui';

export default function BillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const { t, qty, date, dateTime } = useI18n();
  const { fmt } = useCurrency();
  const canRead = can('invoicing.bill.read');
  const canWrite = can('invoicing.bill.write');
  const canPay = can('invoicing.payment.record');
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState<string | string[] | null>(null);
  const [actionError, setActionError] = useState<string | string[] | null>(null);
  const [busy, setBusy] = useState<null | 'post' | 'delete' | 'cancel'>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { burst, celebrate } = useSuccess();

  const load = () =>
    api<BillDetail>(`/invoicing/bills/${id}`)
      .then(setBill)
      .catch((e) => setError(errorMessages(e)));

  useEffect(() => {
    if (canRead) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, id]);

  if (!canRead) return <AccessDenied permission="invoicing.bill.read" what={t('nav.item.bills')} />;
  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ErrorBox message={error} />
        <Link
          href="/invoicing/bills"
          className="text-sm font-medium text-indigo-700 hover:underline"
        >
          {t('bill.back')}
        </Link>
      </div>
    );
  }
  if (!bill) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="size-7 text-indigo-500" />
      </div>
    );
  }

  const c = bill.currency;
  const isDraft = bill.status === 'DRAFT';
  const isOpenBill = bill.status === 'POSTED' || bill.status === 'PARTIALLY_PAID';
  const paidPct =
    Number(bill.total) > 0
      ? Math.min(100, (Number(bill.amountPaid) / Number(bill.total)) * 100)
      : 0;

  async function post() {
    setBusy('post');
    setActionError(null);
    try {
      const b = await api<BillDetail>(`/invoicing/bills/${id}/post`, { method: 'POST' });
      setBill(b);
      celebrate(t('bill.posted', { number: b.number }));
    } catch (e) {
      setActionError(errorMessages(e));
    } finally {
      setBusy(null);
    }
  }
  async function remove() {
    setBusy('delete');
    try {
      await api(`/invoicing/bills/${id}`, { method: 'DELETE' });
      router.push('/invoicing/bills?status=DRAFT');
    } catch (e) {
      setActionError(errorMessages(e));
      setDeleteOpen(false);
      setBusy(null);
    }
  }
  async function cancel() {
    if (!reason.trim()) return;
    setBusy('cancel');
    try {
      const b = await api<BillDetail>(`/invoicing/bills/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setBill(b);
      setCancelOpen(false);
      celebrate(t('bill.cancelled', { number: b.number }));
    } catch (e) {
      setActionError(errorMessages(e));
      setCancelOpen(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link
        href="/invoicing/bills"
        className="animate-fade inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-indigo-700"
      >
        <ArrowLeft className="size-4" /> {t('bill.back')}
      </Link>
      <InvoicingHero
        icon={ReceiptText}
        title={bill.number}
        badge={<BillStatusBadge status={bill.status} onHero />}
        subtitle={`${bill.supplier.name} · ${fmt(bill.total, c)}`}
        crumb={[{ label: t('nav.item.bills'), href: '/invoicing/bills' }, { label: bill.number }]}
        actions={
          <>
            {isDraft && canWrite && (
              <>
                <Link href={`/invoicing/bills/${bill.id}/edit`} className={heroGhostInv}>
                  <Pencil className="size-4" /> {t('bill.edit')}
                </Link>
                <button
                  className={heroGhostInv}
                  onClick={() => setDeleteOpen(true)}
                  disabled={Boolean(busy)}
                >
                  <Trash2 className="size-4" /> {t('bill.delete')}
                </button>
                <button
                  className={heroButtonInv}
                  onClick={() => void post()}
                  disabled={Boolean(busy)}
                >
                  {busy === 'post' ? <Spinner /> : <Send className="size-4" />} {t('bill.post')}
                </button>
              </>
            )}
            {isOpenBill && canWrite && Number(bill.amountPaid) === 0 && (
              <button
                className={heroGhostInv}
                onClick={() => setCancelOpen(true)}
                disabled={Boolean(busy)}
              >
                <Ban className="size-4" /> {t('bill.cancel')}
              </button>
            )}
            {isOpenBill && canPay && (
              <button className={heroButtonInv} onClick={() => setPayOpen(true)}>
                <Banknote className="size-4" /> {t('bill.pay')}
              </button>
            )}
          </>
        }
      />

      {actionError && <ErrorBox message={actionError} />}

      {bill.status === 'CANCELLED' && (
        <div className="animate-fade flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Ban className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">
              {t('bill.cancelledOn', { date: dateTime(bill.cancelledAt) })}
            </p>
            {bill.cancelReason && <p className="text-red-700">{bill.cancelReason}</p>}
          </div>
        </div>
      )}

      {bill.warnings.length > 0 && bill.status !== 'CANCELLED' && (
        <div className="animate-fade rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" /> {t('bill.warningsTitle')}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-10 text-amber-800">
            {bill.warnings.map((w) => (
              <li key={`${w.lineNo}-${w.kind}`}>
                {t(`bill.warn.${w.kind}`, {
                  line: w.lineNo,
                  billed: w.kind === 'price' ? fmt(w.billed, c) : qty(w.billed),
                  expected: w.kind === 'price' ? fmt(w.expected, c) : qty(w.expected),
                  receipt: w.receiptNumber,
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section
          className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2"
          style={{ animationDelay: '80ms' }}
        >
          <h2 className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">
            {t('bill.lines')}{' '}
            <span className="text-sm font-normal text-slate-400">({bill.lines.length})</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('bill.col.description')}</th>
                  <th className="px-4 py-2.5 text-right">{t('bill.col.qty')}</th>
                  <th className="px-4 py-2.5 text-right">{t('bill.col.price')}</th>
                  <th className="px-4 py-2.5 text-right">{t('bill.col.vat')}</th>
                  <th className="px-4 py-2.5 text-right">{t('bill.col.net')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bill.lines.map((l, i) => (
                  <tr
                    key={l.id}
                    className="animate-rise"
                    style={{ animationDelay: `${120 + Math.min(i, 12) * 35}ms` }}
                  >
                    <td className="px-4 py-3">
                      {l.product ? (
                        <Link
                          href={`/inventory/products/${l.product.id}`}
                          className="font-medium text-slate-900 hover:text-indigo-700"
                        >
                          {l.description}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-900">{l.description}</span>
                      )}
                      {l.receiptLine && (
                        <p className="text-xs text-slate-400">
                          <Link
                            href={`/purchasing/receipts/${l.receiptLine.receipt.id}`}
                            className="font-mono hover:text-indigo-700 hover:underline"
                          >
                            {l.receiptLine.receipt.number}
                          </Link>{' '}
                          {l.receiptLine.purchaseOrder && ` · ${l.receiptLine.purchaseOrder.number}`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                      {qty(l.quantity)}{' '}
                      {l.receiptLine && (
                        <span className="text-xs text-slate-400">{l.receiptLine.unit.code}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                      {fmt(l.unitPrice, c)}
                      {Number(l.discountPct) > 0 && (
                        <p className="text-xs text-slate-400">−{Number(l.discountPct)} %</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-slate-600 tabular-nums">
                      {Number(l.taxRate)} %
                      <p className="text-xs text-slate-400">{fmt(l.lineTax, c)}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                      {fmt(l.lineSubtotal, c)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end justify-end gap-4 border-t border-slate-100 bg-gradient-to-br from-slate-50 to-indigo-50/40 px-5 py-4">
            <dl className="w-full max-w-xs space-y-1.5 text-sm">
              <Row label={t('bill.subtotal')} value={fmt(bill.subtotal, c)} />
              {Number(bill.discountTotal) > 0 && (
                <Row label={t('bill.discountTotal')} value={`− ${fmt(bill.discountTotal, c)}`} />
              )}
              <Row label={t('bill.taxTotal')} value={fmt(bill.taxTotal, c)} />
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
                <dt className="font-semibold text-slate-900">{t('bill.total')}</dt>
                <dd className="text-xl font-semibold text-indigo-700 tabular-nums">
                  {fmt(bill.total, c)}
                </dd>
              </div>
              {!isDraft && bill.status !== 'CANCELLED' && (
                <>
                  <Row label={t('bill.paid')} value={fmt(bill.amountPaid, c)} />
                  <div className="flex items-baseline justify-between">
                    <dt className="font-medium text-slate-700">{t('bill.col.balance')}</dt>
                    <dd
                      className={clsx(
                        'font-semibold tabular-nums',
                        Number(bill.balance) > 0 ? 'text-indigo-700' : 'text-emerald-600',
                      )}
                    >
                      {fmt(bill.balance, c)}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        </section>

        <aside className="space-y-6">
          <section
            className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            style={{ animationDelay: '140ms' }}
          >
            <h2 className="font-semibold text-slate-900">{t('pop.details')}</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <Info icon={Truck} label={t('bill.f.supplier')}>
                <span className="font-medium">{bill.supplier.name}</span>
                <p className="font-mono text-xs text-slate-400">{bill.supplier.code}</p>
              </Info>
              <Info icon={FileText} label={t('bill.f.ref')}>
                <span className="font-mono text-xs">{bill.supplierRef ?? '—'}</span>
              </Info>
              <Info icon={CalendarClock} label={t('bill.dates')}>
                {date(bill.issueDate)} → {date(bill.dueDate)}
                <div className="mt-0.5">
                  <OverdueBadge days={bill.daysOverdue} />
                </div>
              </Info>
              <Info icon={Banknote} label={t('bill.f.currency')}>
                {bill.currency}
              </Info>
              {bill.purchaseOrder && (
                <Info icon={ClipboardList} label={t('grp.order')}>
                  <Link
                    href={`/purchasing/orders/${bill.purchaseOrder.id}`}
                    className="font-mono text-xs font-semibold hover:text-indigo-700 hover:underline"
                  >
                    {bill.purchaseOrder.number}
                  </Link>
                </Info>
              )}
              {bill.receipts.length > 0 && (
                <Info icon={PackageCheck} label={t('bill.receipts')}>
                  <span className="flex flex-wrap gap-x-2">
                    {bill.receipts.map((r) => (
                      <Link
                        key={r.id}
                        href={`/purchasing/receipts/${r.id}`}
                        className="font-mono text-xs font-semibold hover:text-indigo-700 hover:underline"
                      >
                        {r.number}
                      </Link>
                    ))}
                  </span>
                </Info>
              )}
              <Info icon={UserRound} label={t('bill.by')}>
                {bill.createdBy.fullName}
                <p className="text-xs text-slate-400">
                  {bill.postedAt
                    ? t('bill.postedAt', { date: dateTime(bill.postedAt) })
                    : dateTime(bill.createdAt)}
                </p>
              </Info>
            </dl>
          </section>

          {!isDraft && bill.status !== 'CANCELLED' && (
            <section
              className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              style={{ animationDelay: '200ms' }}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">{t('bill.payments')}</h2>
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  {Math.round(paidPct)} %
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-1000"
                  style={{ width: `${paidPct}%` }}
                />
              </div>
              {bill.payments.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">{t('bill.noPayments')}</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {bill.payments.map((p, i) => (
                    <li
                      key={p.paymentId}
                      className="animate-rise flex items-center justify-between gap-2"
                      style={{ animationDelay: `${240 + i * 40}ms` }}
                    >
                      <div>
                        <p className="font-mono text-xs font-semibold text-slate-800">{p.number}</p>
                        <p className="text-xs text-slate-400">
                          {date(p.paidAt)} · {t(`pay.method.${p.method}`)}
                        </p>
                      </div>
                      <span className="font-medium text-emerald-700 tabular-nums">
                        {fmt(p.amount, c)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {bill.notes && (
            <section
              className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              style={{ animationDelay: '240ms' }}
            >
              <h2 className="font-semibold text-slate-900">{t('grp.notes')}</h2>
              <p className="mt-2 text-sm whitespace-pre-line text-slate-600">{bill.notes}</p>
            </section>
          )}

          <p
            className="animate-rise flex gap-2 rounded-xl bg-slate-50 p-4 text-xs text-slate-500 ring-1 ring-slate-200"
            style={{ animationDelay: '280ms' }}
          >
            <Lock className="mt-0.5 size-4 shrink-0 text-slate-400" />{' '}
            {isDraft ? t('bill.draftNote') : t('bill.lockedNote')}
          </p>
        </aside>
      </div>

      <PaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        supplier={{ id: bill.supplier.id, name: bill.supplier.name }}
        currency={bill.currency}
        billId={bill.id}
        onSaved={(p) => {
          setPayOpen(false);
          void load();
          celebrate(t('pay.saved', { number: p.number }));
        }}
      />

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t('bill.cancelTitle', { number: bill.number })}
        subtitle={t('bill.cancelText')}
        footer={
          <>
            <button className={btnSecondary} onClick={() => setCancelOpen(false)}>
              {t('common.close')}
            </button>
            <button
              className={btnDanger}
              onClick={() => void cancel()}
              disabled={!reason.trim() || busy === 'cancel'}
            >
              {busy === 'cancel' ? <Spinner /> : <Ban className="size-4" />} {t('bill.cancel')}
            </button>
          </>
        }
      >
        <Field label={t('grx.reason')}>
          <input
            autoFocus
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
          />
        </Field>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('bill.deleteTitle', { number: bill.number })}
        subtitle={t('bill.deleteText')}
        footer={
          <>
            <button className={btnSecondary} onClick={() => setDeleteOpen(false)}>
              {t('common.close')}
            </button>
            <button
              className={btnDanger}
              onClick={() => void remove()}
              disabled={busy === 'delete'}
            >
              {busy === 'delete' ? <Spinner /> : <Trash2 className="size-4" />} {t('bill.delete')}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{t('bill.deleteHint')}</p>
      </Modal>
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

function Info({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Truck;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="text-slate-800">{children}</dd>
      </div>
    </div>
  );
}
