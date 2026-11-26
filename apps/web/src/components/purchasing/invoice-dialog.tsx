'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Receipt } from 'lucide-react';
import type { GoodsReceiptDetail, SupplierInvoiceInput } from '@erp/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  ErrorBox,
  Field,
  Modal,
  Spinner,
  btnPrimary,
  btnSecondary,
  errorMessages,
  inputClass,
} from './ui';

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Records the supplier invoice of a delivered order (100 % received), on the
 * receipt that completed it.
 */
export function SupplierInvoiceDialog({
  open,
  onClose,
  receipt,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  receipt: {
    id: string;
    number: string;
    orderNumber: string;
    supplierInvoiceNumber: string | null;
    supplierInvoiceDate: string | null;
  };
  onSaved: (r: GoodsReceiptDetail) => void;
}) {
  const { t } = useI18n();
  const [number, setNumber] = useState('');
  const [day, setDay] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | string[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setNumber(receipt.supplierInvoiceNumber ?? '');
    setDay(receipt.supplierInvoiceDate ?? '');
    setSubmitted(false);
    setError(null);
  }, [open, receipt.supplierInvoiceNumber, receipt.supplierInvoiceDate]);

  const numberError = !number.trim() ? t('grf.invNumberErr') : null;
  const dayError = !day ? t('grf.invDateErr') : day > localToday() ? t('grf.invFutureErr') : null;

  async function save() {
    setSubmitted(true);
    setError(null);
    if (numberError || dayError) return;
    setSaving(true);
    const body: SupplierInvoiceInput = {
      supplierInvoiceNumber: number.trim(),
      supplierInvoiceDate: day,
    };
    try {
      const r = await api<GoodsReceiptDetail>(`/purchasing/receipts/${receipt.id}/invoice`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      onSaved(r);
    } catch (e) {
      setError(errorMessages(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={receipt.supplierInvoiceNumber ? t('inv.editTitle') : t('inv.title')}
      subtitle={t('inv.subtitle', { order: receipt.orderNumber, receipt: receipt.number })}
      footer={
        <>
          <button onClick={onClose} disabled={saving} className={btnSecondary}>
            {t('common.cancel')}
          </button>
          <button onClick={save} disabled={saving} className={btnPrimary}>
            {saving ? <Spinner className="size-4" /> : <Receipt className="size-4" />}
            {t('inv.save')}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-4"
      >
        {error && <ErrorBox message={error} />}
        <div className="flex items-start gap-3 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50/60 px-4 py-3 text-sm text-emerald-800">
          <Receipt className="mt-0.5 size-4 shrink-0" />
          <p>{t('inv.why')}</p>
        </div>
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
          <Field label={t('grf.invNumber')} error={submitted ? numberError : null}>
            <input
              autoFocus
              value={number}
              maxLength={60}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={t('grf.invNumberPh')}
              className={clsx(
                inputClass,
                'font-mono',
                submitted && numberError && 'animate-shake border-red-400!',
              )}
            />
          </Field>
          <Field label={t('grf.invDate')} error={submitted ? dayError : null}>
            <input
              type="date"
              value={day}
              max={localToday()}
              onChange={(e) => setDay(e.target.value)}
              className={clsx(inputClass, submitted && dayError && 'animate-shake border-red-400!')}
            />
          </Field>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
