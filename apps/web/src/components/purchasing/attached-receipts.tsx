'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Link2, PackageCheck, Unlink } from 'lucide-react';
import type { AttachableReceipt, GoodsReceiptDetail, PurchaseOrderDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import {
  ErrorBox,
  Modal,
  Spinner,
  btnPrimary,
  btnSecondary,
  errorMessages,
  useSuccess,
} from './ui';

/**
 * Order page: the goods receipts attached to the order. Attaching a validated receipt
 * of the supplier counts what it received on the order lines; detaching undoes it.
 * Stock is never touched here: the receipt moved it when it was validated.
 */
export function AttachedReceipts({
  order,
  onChanged,
}: {
  order: PurchaseOrderDetail;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const { t, money, qty, dateTime } = useI18n();
  const { burst, celebrate } = useSuccess();
  const canAttach = can('purchasing.receipt.create');
  const open = order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RECEIVED';
  const attached = order.receipts.filter((r) => r.status === 'POSTED');

  const [picking, setPicking] = useState(false);
  const [candidates, setCandidates] = useState<AttachableReceipt[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | string[] | null>(null);

  useEffect(() => {
    if (!picking) return;
    setCandidates(null);
    setError(null);
    api<AttachableReceipt[]>(`/purchasing/receipts/attachable?purchaseOrderId=${order.id}`)
      .then(setCandidates)
      .catch((e) => setError(errorMessages(e)));
  }, [picking, order.id]);

  async function attach(r: AttachableReceipt) {
    setBusy(r.id);
    setError(null);
    try {
      const done = await api<GoodsReceiptDetail>(`/purchasing/receipts/${r.id}/attach`, {
        method: 'POST',
        body: JSON.stringify({ purchaseOrderId: order.id }),
      });
      setPicking(false);
      celebrate(t('grr.att.attached', { number: done.number }));
      onChanged();
    } catch (e) {
      setError(errorMessages(e));
    } finally {
      setBusy(null);
    }
  }

  async function detach(id: string, number: string) {
    setBusy(id);
    setError(null);
    try {
      await api(`/purchasing/receipts/${id}/detach`, { method: 'POST' });
      celebrate(t('grr.att.detached', { number }));
      onChanged();
    } catch (e) {
      setError(errorMessages(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      style={{ animationDelay: '240ms' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{t('grr.att.title')}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{t('grr.att.text')}</p>
        </div>
      </div>
      {error && !picking && (
        <div className="mt-3">
          <ErrorBox message={error} />
        </div>
      )}
      {attached.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">{t('grr.att.none')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {attached.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <Link
                href={`/purchasing/receipts/${r.id}`}
                className="group inline-flex min-w-0 items-center gap-2"
              >
                <PackageCheck className="size-4 shrink-0 text-emerald-600" />
                <span className="font-mono text-xs font-semibold text-slate-800 group-hover:text-orange-700">
                  {r.number}
                </span>
                <span className="truncate text-xs text-slate-400">{dateTime(r.receivedAt)}</span>
              </Link>
              {canAttach && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void detach(r.id, r.number)}
                  title={t('grr.att.detach')}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200 transition hover:bg-red-50 hover:text-red-600"
                >
                  {busy === r.id ? <Spinner /> : <Unlink className="size-3.5" />}
                  {t('grr.att.detach')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAttach && open && (
        <button
          type="button"
          className={clsx(btnPrimary, 'mt-4 w-full')}
          onClick={() => setPicking(true)}
          disabled={busy !== null}
        >
          <Link2 className="size-4" /> {t('grr.att.add')}
        </button>
      )}

      <Modal
        open={picking}
        onClose={() => busy === null && setPicking(false)}
        title={t('grr.att.pickTitle', { number: order.number })}
        subtitle={order.supplier.name}
        wide
        footer={
          <button
            className={btnSecondary}
            onClick={() => setPicking(false)}
            disabled={busy !== null}
          >
            {t('common.close')}
          </button>
        }
      >
        {error && (
          <div className="mb-3">
            <ErrorBox message={error} />
          </div>
        )}
        {candidates === null ? (
          <div className="grid place-items-center py-8">
            <Spinner className="text-amber-500" />
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">{t('grr.att.noneAvailable')}</p>
        ) : (
          <ul className="space-y-3">
            {candidates.map((r, i) => (
              <li
                key={r.id}
                className="animate-rise rounded-xl border border-slate-200 p-3 transition hover:shadow-md hover:ring-2 hover:ring-amber-500/20"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-slate-900">{r.number}</p>
                    <p className="text-xs text-slate-400">
                      {dateTime(r.receivedAt)}
                      {r.supplierRef && ` · ${r.supplierRef}`} · {money(r.value)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={busy !== null || !r.lines.some((l) => l.onOrder)}
                    onClick={() => void attach(r)}
                  >
                    {busy === r.id ? <Spinner /> : <Link2 className="size-4" />}
                    {t('grr.att.attach')}
                  </button>
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {r.lines.map((l, j) => (
                    <li
                      key={j}
                      className={clsx(
                        'rounded-full px-2 py-0.5 text-[11px] ring-1',
                        l.onOrder
                          ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/20'
                          : 'bg-slate-50 text-slate-500 ring-slate-300',
                      )}
                      title={l.onOrder ? undefined : t('grr.att.notOnOrder')}
                    >
                      {l.product.name} · {qty(l.quantity)} {l.unit.code}
                      {!l.onOrder && ` (${t('grr.att.notOnOrder')})`}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      {burst}
    </section>
  );
}
