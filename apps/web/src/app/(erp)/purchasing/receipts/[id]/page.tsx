'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Ban,
  Send,
  Trash2,
  ReceiptText,
  ClipboardList,
  FileText,
  Lock,
  Pencil,
  PackageCheck,
  Receipt,
  Truck,
  UserRound,
  Warehouse,
} from 'lucide-react';
import type { GoodsReceiptDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AccessDenied } from '@/components/page-header';
import { SupplierInvoiceDialog } from '@/components/purchasing/invoice-dialog';
import {
  ErrorBox,
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
  const { can } = useAuth();
  const { t, money, qty, date, dateTime } = useI18n();
  const canRead = can('purchasing.order.read');
  const [receipt, setReceipt] = useState<GoodsReceiptDetail | null>(null);
  const [error, setError] = useState<string | string[] | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const { burst, celebrate } = useSuccess();
  const canInvoice = can('purchasing.receipt.create');
  const canCancel = can('purchasing.receipt.cancel');
  const canBill = can('invoicing.bill.write');
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'post' | 'delete' | 'cancel'>(null);
  const [actionError, setActionError] = useState<string | string[] | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState('');

  async function act(kind: 'post' | 'delete' | 'cancel') {
    setBusy(kind);
    setActionError(null);
    try {
      if (kind === 'delete') {
        await api(`/purchasing/receipts/${id}`, { method: 'DELETE' });
        router.push('/purchasing/receipts?view=receipts');
        return;
      }
      const r = await api<GoodsReceiptDetail>(`/purchasing/receipts/${id}/${kind}`, {
        method: 'POST',
        ...(kind === 'cancel' && { body: JSON.stringify({ reason: reason.trim() }) }),
      });
      setReceipt(r);
      setCancelOpen(false);
      celebrate(
        kind === 'post'
          ? t('grf.saved', { number: r.number })
          : t('grx.cancelled', { number: r.number }),
      );
    } catch (e) {
      setActionError(errorMessages(e));
      setCancelOpen(false);
      setDeleteOpen(false);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!canRead) return;
    api<GoodsReceiptDetail>(`/purchasing/receipts/${id}`)
      .then(setReceipt)
      .catch((e) => setError(errorMessages(e)));
  }, [canRead, id]);

  if (!canRead) {
    return <AccessDenied permission="purchasing.order.read" what={t('gr.title')} />;
  }
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

  const baseTotals = receipt.lines.reduce<Record<string, number>>((acc, l) => {
    acc[l.product.baseUnitCode] = (acc[l.product.baseUnitCode] ?? 0) + Number(l.baseQuantity);
    return acc;
  }, {});

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
        title={receipt.number}
        badge={
          receipt.status === 'POSTED' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white ring-1 ring-white/40 backdrop-blur">
              <Lock className="size-3" /> {t('grp.final')}
            </span>
          ) : (
            <ReceiptStatusBadge status={receipt.status} onHero />
          )
        }
        subtitle={`${receipt.supplier.name} · ${money(receipt.value)} ${t('grp.ht')}`}
        crumb={[{ label: t('gr.title'), href: '/purchasing/receipts' }, { label: receipt.number }]}
        actions={
          <>
            <Link
              href={`/purchasing/orders/${receipt.purchaseOrder.id}`}
              className={heroGhostButton}
            >
              <ClipboardList className="size-4" /> {receipt.purchaseOrder.number}
            </Link>
            {receipt.status === 'DRAFT' && canInvoice && (
              <>
                <Link
                  href={`/purchasing/receipts/new?draftId=${receipt.id}`}
                  className={heroGhostButton}
                >
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
            {receipt.status === 'POSTED' && canCancel && receipt.bills.length === 0 && (
              <button
                className={heroGhostButton}
                onClick={() => setCancelOpen(true)}
                disabled={Boolean(busy)}
              >
                <Ban className="size-4" /> {t('grx.cancel')}
              </button>
            )}
            {receipt.status === 'POSTED' && canBill && receipt.billing !== 'full' && (
              <Link
                href={`/invoicing/bills/new?supplierId=${receipt.supplier.id}&receiptId=${receipt.id}`}
                className={heroButton}
              >
                <ReceiptText className="size-4" /> {t('grx.createBill')}
              </Link>
            )}
          </>
        }
      />

      {actionError && <ErrorBox message={actionError} />}
      {receipt.status === 'CANCELLED' && (
        <div className="animate-fade flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Ban className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">
              {t('grx.cancelledOn', { date: dateTime(receipt.cancelledAt) })}
            </p>
            {receipt.cancelReason && <p className="text-red-700">{receipt.cancelReason}</p>}
          </div>
        </div>
      )}
      {receipt.status === 'DRAFT' && (
        <div className="animate-fade flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <Pencil className="mt-0.5 size-4 shrink-0 text-slate-400" />
          {t('grx.draftBanner')}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section
          className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2"
          style={{ animationDelay: '80ms' }}
        >
          <h2 className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">
            {t('grp.lines')}{' '}
            <span className="text-sm font-normal text-slate-400">({receipt.lines.length})</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('grp.col.product')}</th>
                  <th className="px-4 py-2.5 text-right">{t('grp.col.qty')}</th>
                  <th className="px-4 py-2.5 text-right">{t('grp.col.stock')}</th>
                  <th className="hidden px-4 py-2.5 text-right md:table-cell">
                    {t('grx.col.refused')}
                  </th>
                  <th className="hidden px-4 py-2.5 text-right md:table-cell">
                    {t('grx.col.billed')}
                  </th>
                  <th className="px-4 py-2.5 text-right">{t('grp.col.cost')}</th>
                  <th className="px-4 py-2.5 text-right">{t('grp.col.value')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receipt.lines.map((l, i) => (
                  <tr
                    key={l.id}
                    className="animate-rise"
                    style={{ animationDelay: `${120 + Math.min(i, 12) * 35}ms` }}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/inventory/products/${l.product.id}`}
                        className="font-medium text-slate-900 hover:text-orange-700"
                      >
                        {l.product.name}
                      </Link>
                      <p className="font-mono text-xs text-slate-400">{l.product.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                      {qty(l.quantity)}{' '}
                      <span className="text-xs text-slate-400">{l.unit.code}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                      <span
                        className={
                          receipt.status === 'POSTED'
                            ? 'font-medium text-emerald-700'
                            : 'text-slate-400 line-through decoration-slate-300'
                        }
                      >
                        +{qty(l.baseQuantity)}
                      </span>{' '}
                      <span className="text-xs text-slate-400">{l.product.baseUnitCode}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-right whitespace-nowrap tabular-nums md:table-cell">
                      {Number(l.rejectedQty) > 0 ? (
                        <span title={l.rejectReason ?? undefined}>
                          <span className="font-medium text-red-600">{qty(l.rejectedQty)}</span>{' '}
                          <span className="text-xs text-slate-400">{l.unit.code}</span>
                          <p className="max-w-40 truncate text-[11px] text-slate-400">
                            {l.rejectReason}
                          </p>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-right whitespace-nowrap tabular-nums md:table-cell">
                      {Number(l.billedQty) > 0 ? (
                        <span
                          className={
                            Number(l.billedQty) >= Number(l.quantity)
                              ? 'font-medium text-indigo-700'
                              : 'text-amber-700'
                          }
                        >
                          {qty(l.billedQty)} / {qty(l.quantity)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-slate-600 tabular-nums">
                      {money(l.unitCost)}
                      <span className="text-xs text-slate-400"> / {l.product.baseUnitCode}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                      {money(l.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 bg-gradient-to-br from-slate-50 to-emerald-50/40 px-5 py-4">
            <p className="flex max-w-md items-start gap-2 text-xs text-slate-500">
              <PackageCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              {receipt.status === 'POSTED'
                ? t('grp.stockNote', {
                    stock: Object.entries(baseTotals)
                      .map(([unit, n]) => `+${qty(n)} ${unit}`)
                      .join(', '),
                    warehouse: receipt.warehouse.code,
                  })
                : receipt.status === 'DRAFT'
                  ? t('grx.draftNote')
                  : t('grx.cancelledNote')}
            </p>
            <div className="flex items-baseline gap-6">
              <span className="font-semibold text-slate-900">{t('grp.total')}</span>
              <span className="text-xl font-semibold text-orange-700 tabular-nums">
                {money(receipt.value)}
              </span>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <section
            className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            style={{ animationDelay: '140ms' }}
          >
            <h2 className="font-semibold text-slate-900">{t('pop.details')}</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <Info icon={Truck} label={t('grp.supplier')}>
                <Link
                  href={`/purchasing/orders?supplierId=${receipt.supplier.id}`}
                  className="font-medium hover:text-orange-700"
                >
                  {receipt.supplier.name}
                </Link>
                <p className="font-mono text-xs text-slate-400">{receipt.supplier.code}</p>
              </Info>
              <Info icon={ClipboardList} label={t('grp.order')}>
                <Link
                  href={`/purchasing/orders/${receipt.purchaseOrder.id}`}
                  className="font-mono text-xs font-semibold hover:text-orange-700 hover:underline"
                >
                  {receipt.purchaseOrder.number}
                </Link>
              </Info>
              <Info icon={FileText} label={t('grp.bl')}>
                <span className="font-mono text-xs">{receipt.supplierRef ?? '—'}</span>
              </Info>
              <Info icon={Receipt} label={t('grp.invoice')}>
                {receipt.supplierInvoiceNumber ? (
                  <>
                    <span className="font-mono text-xs font-medium">
                      {receipt.supplierInvoiceNumber}
                    </span>
                    <p className="text-xs text-slate-400">
                      {t('grp.invoiceOf', { date: date(receipt.supplierInvoiceDate) })}
                    </p>
                  </>
                ) : receipt.invoiceEditable ? (
                  <span className="text-amber-700">{t('inv.missing')}</span>
                ) : (
                  <span className="text-slate-400">{t('inv.afterDelivery')}</span>
                )}
                {receipt.invoiceEditable && canInvoice && (
                  <button
                    onClick={() => setInvoiceOpen(true)}
                    className={
                      receipt.supplierInvoiceNumber
                        ? 'mt-1 inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:underline'
                        : 'mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm shadow-orange-600/20 transition hover:brightness-105 active:scale-[0.98]'
                    }
                  >
                    {receipt.supplierInvoiceNumber ? (
                      <Pencil className="size-3" />
                    ) : (
                      <Receipt className="size-3.5" />
                    )}
                    {receipt.supplierInvoiceNumber ? t('inv.edit') : t('inv.record')}
                  </button>
                )}
              </Info>
              {receipt.bills.length > 0 && (
                <Info icon={ReceiptText} label={t('grx.bills')}>
                  <span className="flex flex-wrap gap-x-2">
                    {receipt.bills.map((b) => (
                      <Link
                        key={b.id}
                        href={`/invoicing/bills/${b.id}`}
                        className="font-mono text-xs font-semibold hover:text-orange-700 hover:underline"
                      >
                        {b.number}
                      </Link>
                    ))}
                  </span>
                  <p className="text-xs text-slate-400">{t(`grx.billing.${receipt.billing}`)}</p>
                </Info>
              )}
              <Info icon={Warehouse} label={t('grp.warehouse')}>
                {receipt.warehouse.code} · {receipt.warehouse.name}
              </Info>
              <Info icon={UserRound} label={t('grp.by')}>
                {receipt.createdBy.fullName}
                <p className="text-xs text-slate-400">{dateTime(receipt.receivedAt)}</p>
              </Info>
            </dl>
          </section>

          {receipt.notes && (
            <section
              className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              style={{ animationDelay: '200ms' }}
            >
              <h2 className="font-semibold text-slate-900">{t('grp.notes')}</h2>
              <p className="mt-2 text-sm whitespace-pre-line text-slate-600">{receipt.notes}</p>
            </section>
          )}

          <p
            className="animate-rise flex gap-2 rounded-xl bg-slate-50 p-4 text-xs text-slate-500 ring-1 ring-slate-200"
            style={{ animationDelay: '240ms' }}
          >
            <Lock className="mt-0.5 size-4 shrink-0 text-slate-400" />{' '}
            {receipt.status === 'DRAFT'
              ? t('grx.draftNote')
              : receipt.status === 'CANCELLED'
                ? t('grx.cancelledNote')
                : t('grp.locked')}
          </p>
        </aside>
      </div>
      <SupplierInvoiceDialog
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        receipt={{
          id: receipt.id,
          number: receipt.number,
          orderNumber: receipt.purchaseOrder.number,
          supplierInvoiceNumber: receipt.supplierInvoiceNumber,
          supplierInvoiceDate: receipt.supplierInvoiceDate,
        }}
        onSaved={(r) => {
          setInvoiceOpen(false);
          setReceipt(r);
          celebrate(t('inv.saved', { number: r.supplierInvoiceNumber ?? '' }));
        }}
      />
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t('grx.cancelTitle', { number: receipt.number })}
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
        title={t('grx.deleteTitle', { number: receipt.number })}
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
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-orange-600">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="text-slate-800">{children}</dd>
      </div>
    </div>
  );
}
