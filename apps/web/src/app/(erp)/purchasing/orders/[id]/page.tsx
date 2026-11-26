'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  Ban,
  Check,
  ClipboardList,
  FileDown,
  PackageCheck,
  Send,
  Truck,
  Warehouse,
} from 'lucide-react';
import type { PurchaseOrderDetail, PurchaseOrderStatus } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { AccessDenied } from '@/components/page-header';
import { OrderForm } from '@/components/purchasing/order-form';
import { DeliveryBadge, deliveryStatusOf } from '@/components/purchasing/delivery';
import { takeFlash, type Flash } from '@/components/purchasing/flash';
import {
  ErrorBox,
  Modal,
  PoStatusBadge,
  PurchasingHero,
  Spinner,
  btnDanger,
  btnSecondary,
  errorMessages,
  heroButton,
  heroGhostButton,
  useSuccess,
} from '@/components/purchasing/ui';

export default function PurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const canRead = can('purchasing.order.read');
  const canWrite = can('purchasing.order.write');
  const canConfirm = can('purchasing.order.confirm');
  const canReceive = can('purchasing.receipt.create');
  const { t, money } = useI18n();

  const [order, setOrder] = useState<PurchaseOrderDetail | null>(null);
  const [error, setError] = useState<string | string[] | null>(null);
  const [flash, setFlashState] = useState<Flash | null>(null);
  const [acting, setActing] = useState<null | 'confirm' | 'cancel'>(null);
  const [askCancel, setAskCancel] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { burst, celebrate } = useSuccess();

  const load = useCallback(() => {
    api<PurchaseOrderDetail>(`/purchasing/orders/${id}`)
      .then((o) => {
        setOrder(o);
        setError(null);
      })
      .catch((e) => setError(errorMessages(e)));
  }, [id]);

  useEffect(() => {
    if (!canRead) return;
    setFlashState(takeFlash());
    load();
  }, [canRead, load]);

  if (!canRead) {
    return <AccessDenied permission="purchasing.order.read" what={t('po.title')} />;
  }

  if (error && !order) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pt-8">
        <ErrorBox message={error} />
        <Link href="/purchasing/orders" className={btnSecondary}>
          {t('pop.back')}
        </Link>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="grid place-items-center py-32">
        <Spinner className="size-7 text-amber-500" />
      </div>
    );
  }

  const received = order.lines.some((l) => Number(l.receivedQty) > 0);
  const cancellable =
    canConfirm && (order.status === 'DRAFT' || (order.status === 'CONFIRMED' && !received));
  const editable = order.status === 'DRAFT' && canWrite;

  async function act(kind: 'confirm' | 'cancel') {
    setActing(kind);
    setError(null);
    try {
      const updated = await api<PurchaseOrderDetail>(`/purchasing/orders/${id}/${kind}`, {
        method: 'POST',
      });
      setAskCancel(false);
      celebrate(
        kind === 'confirm'
          ? t('pof.confirmed', { number: updated.number })
          : t('pop.cancelled', { number: updated.number }),
        () => setOrder(updated),
      );
    } catch (e) {
      setError(errorMessages(e));
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-4">
      <PurchasingHero
        icon={ClipboardList}
        title={order.number}
        badge={<PoStatusBadge status={order.status} onHero />}
        subtitle={
          <>
            {order.supplier.name} · {money(order.total)}
          </>
        }
        crumb={[{ label: t('po.title'), href: '/purchasing/orders' }, { label: order.number }]}
        actions={
          <>
            {order.status === 'DRAFT' && canConfirm && !editable && (
              <button
                className={heroButton}
                disabled={acting !== null}
                onClick={() => act('confirm')}
              >
                {acting === 'confirm' ? <Spinner /> : <Send className="size-4" />}{' '}
                {t('pop.confirm')}
              </button>
            )}
            {canReceive &&
              (order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RECEIVED') && (
                <Link href={`/purchasing/receipts/new?orderId=${order.id}`} className={heroButton}>
                  <PackageCheck className="size-4" /> {t('pop.receive')}
                </Link>
              )}
            {cancellable && (
              <button
                className={heroGhostButton}
                disabled={acting !== null}
                onClick={() => setAskCancel(true)}
              >
                <Ban className="size-4" /> {t('pop.cancelOrder')}
              </button>
            )}
            <button className={heroGhostButton} disabled title={t('pop.pdfSoon')}>
              <FileDown className="size-4" /> PDF
            </button>
          </>
        }
      />

      {flash && (
        <div className="animate-rise">
          {flash.kind === 'warning' ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4" /> {t('pop.warnTitle')}
              </p>
              <ul className="mt-1 list-disc pl-10">
                {(Array.isArray(flash.message) ? flash.message : [flash.message]).map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {flash.message}
            </p>
          )}
        </div>
      )}
      {error && <ErrorBox message={error} />}

      <Progress status={order.status} />

      {editable ? (
        <OrderForm
          key={`${order.updatedAt}-${formKey}`}
          initial={order}
          canConfirm={canConfirm}
          onCancel={() => setFormKey((k) => k + 1)}
          onSaved={(saved, confirmed, warning) => {
            setFlashState(warning ? { kind: 'warning', message: warning } : null);
            if (warning) return setOrder(saved);
            celebrate(
              confirmed ? t('pof.confirmed', { number: saved.number }) : t('pof.draftSaved'),
              () => setOrder(saved),
            );
          }}
        />
      ) : (
        <ReadOnlyOrder order={order} />
      )}

      <Modal
        open={askCancel}
        onClose={() => acting === null && setAskCancel(false)}
        title={t('pop.cancelTitle', { number: order.number })}
        subtitle={t('pop.cancelSubtitle')}
        footer={
          <>
            <button
              className={btnSecondary}
              onClick={() => setAskCancel(false)}
              disabled={acting !== null}
            >
              {t('pop.keep')}
            </button>
            <button
              className={clsx(btnDanger, 'border-red-600 bg-red-600 text-white hover:bg-red-700')}
              onClick={() => act('cancel')}
              disabled={acting !== null}
            >
              {acting === 'cancel' && <Spinner />} {t('pop.cancelOrder')}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {order.status === 'CONFIRMED'
            ? t('pop.cancelConfirmed', { supplier: order.supplier.name })
            : t('pop.cancelDraft')}
        </p>
      </Modal>
      {burst}
    </div>
  );
}

// ── Progress tracker ─────────────────────────────────────────────────────────

const STEPS: { key: string; label: MessageKey; icon: typeof Check }[] = [
  { key: 'DRAFT', label: 'pop.step.DRAFT', icon: ClipboardList },
  { key: 'CONFIRMED', label: 'pop.step.CONFIRMED', icon: Send },
  { key: 'PARTIALLY_RECEIVED', label: 'pop.step.PARTIALLY_RECEIVED', icon: Truck },
  { key: 'RECEIVED', label: 'pop.step.RECEIVED', icon: PackageCheck },
];

function Progress({ status }: { status: PurchaseOrderStatus }) {
  const { t } = useI18n();
  if (status === 'CANCELLED') {
    return (
      <div className="animate-rise flex items-center gap-3 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-white px-5 py-4 text-sm text-red-800">
        <Ban className="size-5" /> {t('pop.cancelledBanner')}
      </div>
    );
  }
  const current = STEPS.findIndex((s) => s.key === status);
  return (
    <div
      className="animate-rise rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
      style={{ animationDelay: '60ms' }}
    >
      <ol className="flex items-center">
        {STEPS.map((s, i) => {
          const done = i < current || status === 'RECEIVED';
          const here = i === current && status !== 'RECEIVED';
          const Icon = done ? Check : s.icon;
          return (
            <li key={s.key} className={clsx('flex items-center', i > 0 && 'flex-1')}>
              {i > 0 && (
                <div className="mx-2 h-1 flex-1 overflow-hidden rounded-full bg-slate-100 sm:mx-3">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-[width] duration-700 ease-out"
                    style={{ width: i <= current ? '100%' : '0%' }}
                  />
                </div>
              )}
              <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2">
                <span
                  className={clsx(
                    'grid size-8 place-items-center rounded-full transition',
                    done && 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md',
                    here && 'bg-white text-orange-600 ring-2 ring-orange-500 ring-offset-2',
                    !done && !here && 'bg-slate-100 text-slate-400',
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span
                  className={clsx(
                    'text-xs font-medium sm:text-sm',
                    done || here ? 'text-slate-900' : 'text-slate-400',
                  )}
                >
                  {t(s.label)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Read-only view (confirmed and later) ─────────────────────────────────────

function ReadOnlyOrder({ order }: { order: PurchaseOrderDetail }) {
  const { t, money, qty, date, dateTime } = useI18n();
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section
        className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2"
        style={{ animationDelay: '120ms' }}
      >
        <h2 className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">
          {t('pop.products')}{' '}
          <span className="text-sm font-normal text-slate-400">({order.lines.length})</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">{t('pop.col.product')}</th>
                <th className="px-4 py-2.5 text-right">{t('pop.col.ordered')}</th>
                <th className="px-4 py-2.5">{t('pop.col.received')}</th>
                <th className="px-4 py-2.5 text-right">{t('pop.col.price')}</th>
                <th className="px-4 py-2.5 text-right">{t('pop.col.total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.lines.map((l, i) => {
                const pct = Math.min(100, (Number(l.receivedQty) / Number(l.quantity)) * 100 || 0);
                return (
                  <tr
                    key={l.id}
                    className="animate-rise"
                    style={{ animationDelay: `${160 + i * 40}ms` }}
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
                        {l.unitFactor !== '1.0000' &&
                          ` · ${t('pop.unitEq', { unit: l.unit.code, factor: qty(l.unitFactor), base: l.product.baseUnitCode })}`}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                      {qty(l.quantity)}{' '}
                      <span className="text-xs text-slate-400">{l.unit.code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={clsx(
                              'h-full rounded-full transition-[width] duration-700',
                              pct >= 100
                                ? 'bg-emerald-500'
                                : 'bg-gradient-to-r from-amber-400 to-orange-500',
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 tabular-nums">
                          {qty(l.receivedQty)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                      {money(l.unitPrice)}
                      {Number(l.discountPct) > 0 && (
                        <p className="text-xs text-emerald-600">−{qty(l.discountPct)} %</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums">
                      {money(l.lineTotal)}
                      <p className="text-xs font-normal text-slate-400">
                        {t('pop.plusTax', { rate: qty(l.taxRate) })}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t border-slate-100 bg-gradient-to-br from-slate-50 to-amber-50/40 px-5 py-4">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <Line label={t('pof.subtotal')} value={order.subtotal} />
            {Number(order.discountTotal) > 0 && (
              <Line label={t('pof.discounts')} value={`-${order.discountTotal}`} />
            )}
            <Line label={t('pof.tax')} value={order.taxTotal} />
            <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
              <dt className="font-semibold text-slate-900">{t('pof.total')}</dt>
              <dd className="text-xl font-semibold text-orange-700 tabular-nums">
                {money(order.total)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <aside className="space-y-6">
        <section
          className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          style={{ animationDelay: '180ms' }}
        >
          <h2 className="font-semibold text-slate-900">{t('pop.details')}</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <Info icon={Truck} label={t('pop.supplier')}>
              <Link
                href={`/purchasing/orders?supplierId=${order.supplier.id}`}
                className="font-medium text-slate-900 hover:text-orange-700"
              >
                {order.supplier.name}
              </Link>
              <span className="block font-mono text-xs text-slate-400">{order.supplier.code}</span>
            </Info>
            <Info icon={Warehouse} label={t('pop.deliverTo')}>
              {order.warehouse.code} · {order.warehouse.name}
            </Info>
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <Small label={t('pop.ordered')} value={date(order.orderDate)} />
              <Small label={t('pop.expected')} value={date(order.expectedDate)} />
              <Small label={t('pop.confirmedAt')} value={dateTime(order.confirmedAt)} />
              <Small label={t('pop.createdBy')} value={order.createdBy.fullName} />
            </div>
            <DeliveryInfo order={order} />
          </dl>
          {order.notes && (
            <p className="mt-4 rounded-lg bg-amber-50/60 px-3 py-2 text-sm whitespace-pre-line text-slate-700 ring-1 ring-amber-500/15">
              {order.notes}
            </p>
          )}
        </section>

        <section
          className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          style={{ animationDelay: '240ms' }}
        >
          <h2 className="font-semibold text-slate-900">{t('pop.receipts')}</h2>
          {order.receipts.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              {order.status === 'CONFIRMED' ? t('pop.noReceiptOpen') : t('pop.noReceipt')}
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {order.receipts.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/purchasing/receipts/${r.id}`}
                    className="group -mx-2 flex items-center justify-between rounded-lg px-2 py-2 transition hover:bg-amber-50"
                  >
                    <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold text-slate-800 group-hover:text-orange-700">
                      <PackageCheck className="size-4 text-emerald-600" />
                      {r.number}
                    </span>
                    <span className="text-slate-500">{dateTime(r.receivedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const { money } = useI18n();
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{label}</dt>
      <dd className="tabular-nums">{money(value)}</dd>
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
      <div>
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="text-slate-800">{children}</dd>
      </div>
    </div>
  );
}

function Small({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}

/** Delivery status of a confirmed order, with its delivery date or expected date. */
function DeliveryInfo({ order }: { order: PurchaseOrderDetail }) {
  const { t, date } = useI18n();
  const status = deliveryStatusOf(order.status);
  if (!status) return null;
  const last = order.receipts.at(-1)?.receivedAt ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const late =
    order.expectedDate &&
    (status === 'delivered'
      ? (last ?? '').slice(0, 10) > order.expectedDate
      : today > order.expectedDate);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-gradient-to-br from-slate-50 to-amber-50/50 px-3 py-2.5 ring-1 ring-slate-200/60">
      <DeliveryBadge status={status} />
      <span className="text-right text-xs">
        {status === 'delivered' ? (
          <>
            <span className="text-slate-500">{t('dl.deliveredOn')} </span>
            <span className="font-medium text-slate-800">{date(last)}</span>
          </>
        ) : order.expectedDate ? (
          <>
            <span className="text-slate-500">{t('dl.expectedOn')} </span>
            <span className={late ? 'font-medium text-red-600' : 'font-medium text-slate-800'}>
              {date(order.expectedDate)}
            </span>
          </>
        ) : (
          <span className="text-slate-400">{t('gr.noExpected')}</span>
        )}
        {late && <span className="block font-medium text-red-600">{t('gr.late')}</span>}
      </span>
    </div>
  );
}
