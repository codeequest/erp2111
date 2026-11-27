'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  ClipboardList,
  Lock,
  Mail,
  MapPin,
  PackageCheck,
  Pencil,
  Phone,
  Printer,
  ReceiptText,
  Send,
  Trash2,
} from 'lucide-react';
import type { GoodsReceiptDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AccessDenied } from '@/components/page-header';
import {
  ErrorBox,
  ExportButton,
  Field,
  Modal,
  PurchasingHero,
  ReceiptStatusBadge,
  Spinner,
  btnDanger,
  btnSecondary,
  errorMessages,
  heroButton,
  heroGhostButton,
  inputClass,
  useSuccess,
} from '@/components/purchasing/ui';

export default function GoodsReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const { t, money, qty, date, dateTime } = useI18n();
  const canRead = can('purchasing.order.read');
  const canEdit = can('purchasing.receipt.create');
  const canCancel = can('purchasing.receipt.cancel');
  const canBill = can('invoicing.bill.write');
  const [receipt, setReceipt] = useState<GoodsReceiptDetail | null>(null);
  const [error, setError] = useState<string | string[] | null>(null);
  const [actionError, setActionError] = useState<string | string[] | null>(null);
  const [busy, setBusy] = useState<null | 'post' | 'delete' | 'cancel'>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { burst, celebrate } = useSuccess();

  useEffect(() => {
    if (!canRead) return;
    api<GoodsReceiptDetail>(`/purchasing/receipts/${id}`)
      .then(setReceipt)
      .catch((e) => setError(errorMessages(e)));
  }, [canRead, id]);

  if (!canRead) return <AccessDenied permission="purchasing.order.read" what={t('gr.title')} />;
  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ErrorBox message={error} />
        <Link
          href="/purchasing/receipts"
          className="text-sm font-medium text-orange-700 hover:underline"
        >
          {t('grp.back')}
        </Link>
      </div>
    );
  }
  if (!receipt) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="size-7 text-amber-500" />
      </div>
    );
  }

  const r = receipt;
  const s = r.supplierInfo;
  const posted = r.status === 'POSTED';
  const today = new Date().toISOString().slice(0, 10);

  async function act(kind: 'post' | 'delete' | 'cancel') {
    setBusy(kind);
    setActionError(null);
    try {
      if (kind === 'delete') {
        await api(`/purchasing/receipts/${id}`, { method: 'DELETE' });
        router.push('/purchasing/receipts?status=DRAFT');
        return;
      }
      const next = await api<GoodsReceiptDetail>(`/purchasing/receipts/${id}/${kind}`, {
        method: 'POST',
        ...(kind === 'cancel' && { body: JSON.stringify({ reason: reason.trim() }) }),
      });
      setReceipt(next);
      setCancelOpen(false);
      celebrate(
        kind === 'post'
          ? t('grf.saved', { number: next.number })
          : t('grx.cancelled', { number: next.number }),
      );
    } catch (e) {
      setActionError(errorMessages(e));
      setCancelOpen(false);
      setDeleteOpen(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link
        href="/purchasing/receipts"
        className="animate-fade inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-orange-700"
      >
        <ArrowLeft className="size-4" /> {t('grp.back')}
      </Link>
      <PurchasingHero
        icon={PackageCheck}
        title={r.number}
        badge={
          posted ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white ring-1 ring-white/40 backdrop-blur">
              <Lock className="size-3" /> {t('grx.status.POSTED')}
            </span>
          ) : (
            <ReceiptStatusBadge status={r.status} onHero />
          )
        }
        subtitle={`${s.name} · ${money(r.value)} ${t('grp.ht')}`}
        crumb={[{ label: t('gr.title'), href: '/purchasing/receipts' }, { label: r.number }]}
        actions={
          <>
            {r.status === 'DRAFT' && canEdit && (
              <>
                <Link href={`/purchasing/receipts/new?draftId=${r.id}`} className={heroGhostButton}>
                  <Pencil className="size-4" /> {t('grx.edit')}
                </Link>
                <button
                  className={heroGhostButton}
                  onClick={() => setDeleteOpen(true)}
                  disabled={Boolean(busy)}
                >
                  <Trash2 className="size-4" /> {t('grx.delete')}
                </button>
                <button
                  className={heroButton}
                  onClick={() => void act('post')}
                  disabled={Boolean(busy)}
                >
                  {busy === 'post' ? <Spinner /> : <Send className="size-4" />} {t('grx.post')}
                </button>
              </>
            )}
            {posted && (
              <>
                <Link href={`/print/receipts/${r.id}`} target="_blank" className={heroGhostButton}>
                  <Printer className="size-4" /> {t('grr.print')}
                </Link>
                <ExportButton
                  path={`/purchasing/receipts/${r.id}/export`}
                  fileName={`${r.number}.xlsx`}
                  onHero
                />
                {canCancel && r.bills.length === 0 && (
                  <button
                    className={heroGhostButton}
                    onClick={() => setCancelOpen(true)}
                    disabled={Boolean(busy)}
                  >
                    <Ban className="size-4" /> {t('grx.cancel')}
                  </button>
                )}
                {canBill && r.billing !== 'full' && (
                  <Link
                    href={`/invoicing/bills/new?supplierId=${s.id}&receiptId=${r.id}`}
                    className={heroButton}
                  >
                    <ReceiptText className="size-4" /> {t('grx.createBill')}
                  </Link>
                )}
              </>
            )}
          </>
        }
      />

      {actionError && <ErrorBox message={actionError} />}
      {r.status === 'CANCELLED' && (
        <div className="animate-fade flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Ban className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{t('grx.cancelledOn', { date: dateTime(r.cancelledAt) })}</p>
            {r.cancelReason && <p className="text-red-700">{r.cancelReason}</p>}
          </div>
        </div>
      )}
      {r.status === 'DRAFT' && (
        <div className="animate-fade flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <Pencil className="mt-0.5 size-4 shrink-0 text-slate-400" />
          {t('grr.draftBanner')}
        </div>
      )}

      {/* Header: reception + supplier */}
      <div className="grid gap-5 md:grid-cols-2">
        <section
          className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          style={{ animationDelay: '60ms' }}
        >
          <h2 className="mb-3 font-semibold text-slate-900">{t('grr.sec.receipt')}</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Info label={t('grf.date')} value={dateTime(r.receivedAt)} />
            <Info label={t('grf.bl')} value={r.supplierRef} mono />
            <Info
              label={t('grp.order')}
              value={
                <Link
                  href={`/purchasing/orders/${r.purchaseOrder.id}`}
                  className="inline-flex items-center gap-1 font-mono text-xs font-semibold hover:text-orange-700 hover:underline"
                >
                  <ClipboardList className="size-3.5" /> {r.purchaseOrder.number}
                </Link>
              }
              sub={date(r.purchaseOrderDate)}
            />
            <Info label={t('grp.warehouse')} value={`${r.warehouse.code} · ${r.warehouse.name}`} />
            <Info label={t('grp.by')} value={r.createdBy.fullName} />
            <Info label={t('grr.validatedOn')} value={r.postedAt ? dateTime(r.postedAt) : '—'} />
            {r.bills.length > 0 && (
              <Info
                label={t('grx.bills')}
                wide
                value={
                  <span className="flex flex-wrap gap-x-2">
                    {r.bills.map((b) => (
                      <Link
                        key={b.id}
                        href={`/invoicing/bills/${b.id}`}
                        className="font-mono text-xs font-semibold hover:text-orange-700 hover:underline"
                      >
                        {b.number}
                      </Link>
                    ))}
                    <span className="text-xs text-slate-400">
                      · {t(`grx.billing.${r.billing}`)}
                    </span>
                  </span>
                }
              />
            )}
            {r.notes && <Info label={t('grp.notes')} value={r.notes} wide />}
          </dl>
        </section>
        <section
          className="animate-rise rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-amber-50/40 p-5 shadow-sm"
          style={{ animationDelay: '120ms' }}
        >
          <h2 className="mb-3 font-semibold text-slate-900">{t('grp.supplier')}</h2>
          <p className="text-base font-semibold text-slate-900">{s.name}</p>
          <p className="font-mono text-xs text-slate-400">{s.code}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Info label={t('grr.sup.taxId')} value={s.taxId} mono />
            <Info label="RNE" value={s.rne} mono />
            <Info label={t('grr.sup.phone')} value={s.phone} icon={Phone} />
            <Info label="E-mail" value={s.email} icon={Mail} />
            <Info label={t('grr.sup.address')} value={s.address} icon={MapPin} wide />
          </dl>
        </section>
      </div>

      {/* Lines */}
      <section
        className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ animationDelay: '180ms' }}
      >
        <h2 className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">
          {t('grp.lines')}{' '}
          <span className="text-sm font-normal text-slate-400">({r.lines.length})</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">{t('grp.col.product')}</th>
                <th className="px-3 py-2.5 text-right">{t('grp.col.qty')}</th>
                <th className="px-3 py-2.5 text-right">{t('grx.col.refused')}</th>
                <th className="px-3 py-2.5">{t('grr.lot')}</th>
                <th className="px-3 py-2.5">{t('grr.expiry')}</th>
                <th className="px-3 py-2.5">{t('grr.quality')}</th>
                <th className="px-3 py-2.5 text-right">{t('grp.col.cost')}</th>
                <th className="px-4 py-2.5 text-right">{t('grp.col.value')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.lines.map((l, i) => {
                const expired = Boolean(l.expiryDate) && l.expiryDate! < today;
                return (
                  <tr
                    key={l.id}
                    className="animate-rise align-top"
                    style={{ animationDelay: `${200 + Math.min(i, 12) * 35}ms` }}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/inventory/products/${l.product.id}`}
                        className="font-medium text-slate-900 hover:text-orange-700"
                      >
                        {l.product.name}
                      </Link>
                      <p className="font-mono text-xs text-slate-400">
                        {l.product.sku}
                        {l.product.barcode && ` · ${l.product.barcode}`}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                      {qty(l.quantity)}{' '}
                      <span className="text-xs text-slate-400">{l.unit.code}</span>
                      {Number(l.unitFactor) !== 1 && (
                        <p className="text-[11px] text-slate-400">
                          = {qty(l.baseQuantity)} {l.product.baseUnitCode}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                      {Number(l.rejectedQty) > 0 ? (
                        <span className="font-medium text-red-600">{qty(l.rejectedQty)}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">
                      {l.lotNumber ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {l.expiryDate ? (
                        <span
                          className={clsx(expired ? 'font-medium text-red-600' : 'text-slate-700')}
                        >
                          {date(l.expiryDate)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                          l.quality === 'CONFORM'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                            : 'bg-red-50 text-red-700 ring-red-600/20',
                        )}
                      >
                        {l.quality === 'NON_CONFORM' && <AlertTriangle className="size-3" />}
                        {l.quality === 'CONFORM' ? t('grr.conform') : t('grr.nonConform')}
                      </span>
                      {l.rejectReason && (
                        <p className="mt-1 max-w-48 text-[11px] text-slate-500">{l.rejectReason}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap text-slate-600 tabular-nums">
                      {money(l.unitCost)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                      {money(l.value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 bg-gradient-to-br from-slate-50 to-emerald-50/40 px-5 py-4">
          <p className="flex max-w-md items-start gap-2 text-xs text-slate-500">
            <Lock className="mt-0.5 size-4 shrink-0 text-slate-400" />
            {r.status === 'DRAFT'
              ? t('grx.draftNote')
              : r.status === 'CANCELLED'
                ? t('grx.cancelledNote')
                : t('grp.locked')}
          </p>
          <div className="flex items-baseline gap-6">
            <span className="font-semibold text-slate-900">{t('grp.total')}</span>
            <span className="text-xl font-semibold text-orange-700 tabular-nums">
              {money(r.value)}
            </span>
          </div>
        </div>
      </section>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t('grx.cancelTitle', { number: r.number })}
        subtitle={t('grx.cancelText')}
        footer={
          <>
            <button className={btnSecondary} onClick={() => setCancelOpen(false)}>
              {t('common.close')}
            </button>
            <button
              className={btnDanger}
              onClick={() => void act('cancel')}
              disabled={!reason.trim() || busy === 'cancel'}
            >
              {busy === 'cancel' ? <Spinner /> : <Ban className="size-4" />} {t('grx.cancel')}
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
        title={t('grx.deleteTitle', { number: r.number })}
        subtitle={t('grx.deleteText')}
        footer={
          <>
            <button className={btnSecondary} onClick={() => setDeleteOpen(false)}>
              {t('common.close')}
            </button>
            <button
              className={btnDanger}
              onClick={() => void act('delete')}
              disabled={busy === 'delete'}
            >
              {busy === 'delete' ? <Spinner /> : <Trash2 className="size-4" />} {t('grx.delete')}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{t('grx.deleteHint')}</p>
      </Modal>
      {burst}
    </div>
  );
}

function Info({
  label,
  value,
  sub,
  mono,
  wide,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  mono?: boolean;
  wide?: boolean;
  icon?: typeof Phone;
}) {
  return (
    <div className={clsx('min-w-0', wide && 'col-span-2')}>
      <dt className="flex items-center gap-1 text-xs text-slate-400">
        {Icon && <Icon className="size-3" />} {label}
      </dt>
      <dd className={clsx('text-slate-800', mono && 'font-mono text-xs')}>{value || '—'}</dd>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
