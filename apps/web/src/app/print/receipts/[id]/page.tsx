'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FileDown, Loader2, Printer } from 'lucide-react';
import type { GoodsReceiptDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

/**
 * Printable goods receipt note (A4). "Print" and "PDF" both open the browser's print
 * dialog: choose a printer, or "Save as PDF".
 */
export default function PrintReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status, can } = useAuth();
  const { t, money, qty, date, dateTime } = useI18n();
  const [r, setR] = useState<GoodsReceiptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=/print/receipts/${id}`);
    if (status !== 'authenticated') return;
    if (!can('purchasing.order.read')) return setError('Access denied');
    api<GoodsReceiptDetail>(`/purchasing/receipts/${id}`)
      .then((d) => {
        setR(d);
        document.title = d.number;
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'));
  }, [status, id, router, can]);

  if (error) return <p className="p-8 text-red-600">{error}</p>;
  if (!r) {
    return (
      <div className="grid h-screen place-items-center text-slate-400">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const s = r.supplierInfo;
  const quality = (q: string) => (q === 'CONFORM' ? t('grr.conform') : t('grr.nonConform'));

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 12mm; } @media print { .no-print { display: none !important; } }`}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-2">
        <p className="text-sm text-slate-500">{t('grr.printHint')}</p>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <FileDown className="size-4" /> PDF
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm"
          >
            <Printer className="size-4" /> {t('grr.printNow')}
          </button>
        </div>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white p-[12mm] text-[11px] leading-snug text-slate-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        {/* Title */}
        <header className="flex items-start justify-between border-b-2 border-slate-900 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-wide">{t('grr.printTitle')}</h1>
            <p className="mt-0.5 font-mono text-sm font-semibold">{r.number}</p>
          </div>
          <div className="text-right">
            {r.status !== 'POSTED' && (
              <p className="mb-1 rounded border border-red-400 px-2 py-0.5 text-xs font-bold text-red-600">
                {r.status === 'DRAFT' ? t('grr.printDraft') : t('grx.status.CANCELLED')}
              </p>
            )}
            <p>
              {t('grf.date')} : <strong>{dateTime(r.receivedAt)}</strong>
            </p>
            {r.postedAt && (
              <p>
                {t('grr.validatedOn')} : {dateTime(r.postedAt)}
              </p>
            )}
          </div>
        </header>

        {/* Supplier + reception */}
        <section className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded border border-slate-300 p-3">
            <p className="mb-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
              {t('grp.supplier')}
            </p>
            <p className="text-sm font-bold">{s.name}</p>
            <p className="font-mono">{s.code}</p>
            {s.address && <p className="mt-1">{s.address}</p>}
            <p className="mt-1">
              {t('grr.sup.taxId')} : <span className="font-mono">{s.taxId ?? '—'}</span>
              {' · '}RNE : <span className="font-mono">{s.rne ?? '—'}</span>
            </p>
            <p>
              {t('grr.sup.phone')} : {s.phone ?? '—'} · {s.email ?? '—'}
            </p>
          </div>
          <div className="rounded border border-slate-300 p-3">
            <p className="mb-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
              {t('grr.sec.receipt')}
            </p>
            <table className="w-full">
              <tbody>
                <Row
                  k={t('grp.order')}
                  v={`${r.purchaseOrder.number} (${date(r.purchaseOrderDate)})`}
                />
                <Row k={t('grf.bl')} v={r.supplierRef ?? '—'} />
                <Row k={t('grp.warehouse')} v={`${r.warehouse.code} · ${r.warehouse.name}`} />
                <Row k={t('grp.by')} v={r.createdBy.fullName} />
              </tbody>
            </table>
          </div>
        </section>

        {/* Lines */}
        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 text-left">
              <Th>{t('grp.col.product')}</Th>
              <Th right>{t('grp.col.qty')}</Th>
              <Th right>{t('grx.col.refused')}</Th>
              <Th>{t('grr.lot')}</Th>
              <Th>{t('grr.expiry')}</Th>
              <Th>{t('grr.quality')}</Th>
              <Th right>{t('grp.col.cost')}</Th>
              <Th right>{t('grp.col.value')}</Th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.id} className="break-inside-avoid">
                <Td>
                  <strong>{l.product.name}</strong>
                  <br />
                  <span className="font-mono text-[10px] text-slate-500">
                    {l.product.sku}
                    {l.product.barcode && ` · ${l.product.barcode}`}
                  </span>
                </Td>
                <Td right>
                  {qty(l.quantity)} {l.unit.code}
                </Td>
                <Td right>{Number(l.rejectedQty) > 0 ? qty(l.rejectedQty) : '—'}</Td>
                <Td mono>{l.lotNumber ?? '—'}</Td>
                <Td>{l.expiryDate ? date(l.expiryDate) : '—'}</Td>
                <Td>
                  {quality(l.quality)}
                  {l.rejectReason && (
                    <div className="text-[10px] text-slate-500">{l.rejectReason}</div>
                  )}
                </Td>
                <Td right>{money(l.unitCost)}</Td>
                <Td right>{money(l.value)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td
                colSpan={7}
                className="border-t-2 border-slate-900 px-2 py-2 text-right font-bold"
              >
                {t('grp.total')}
              </td>
              <td className="border-t-2 border-slate-900 px-2 py-2 text-right font-bold">
                {money(r.value)}
              </td>
            </tr>
          </tfoot>
        </table>

        {r.notes && (
          <p className="mt-3">
            <strong>{t('grp.notes')} :</strong> {r.notes}
          </p>
        )}

        {/* Signatures */}
        <section className="mt-10 grid grid-cols-2 gap-8 break-inside-avoid">
          <div className="h-24 rounded border border-slate-300 p-2">
            <p className="font-semibold">{t('grr.sign.received')}</p>
          </div>
          <div className="h-24 rounded border border-slate-300 p-2">
            <p className="font-semibold">{t('grr.sign.delivered')}</p>
          </div>
        </section>
      </article>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="pr-2 text-slate-500">{k}</td>
      <td className="font-medium">{v}</td>
    </tr>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`border border-slate-300 px-2 py-1.5 text-[10px] font-semibold uppercase ${right ? 'text-right' : ''}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  mono,
}: {
  children: React.ReactNode;
  right?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      className={`border border-slate-300 px-2 py-1.5 align-top ${right ? 'text-right whitespace-nowrap tabular-nums' : ''} ${mono ? 'font-mono' : ''}`}
    >
      {children}
    </td>
  );
}
