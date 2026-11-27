'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { BillDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AccessDenied } from '@/components/page-header';
import { BillForm } from '@/components/invoicing/bill-form';
import { ErrorBox, Spinner, errorMessages } from '@/components/purchasing/ui';

export default function EditBillPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const { t } = useI18n();
  const allowed = can('invoicing.bill.write');
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState<string | string[] | null>(null);

  useEffect(() => {
    if (!allowed) return;
    api<BillDetail>(`/invoicing/bills/${id}`)
      .then(setBill)
      .catch((e) => setError(errorMessages(e)));
  }, [allowed, id]);

  if (!allowed)
    return <AccessDenied permission="invoicing.bill.write" what={t('nav.item.bills')} />;
  if (error) return <ErrorBox message={error} />;
  if (!bill) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="size-7 text-indigo-500" />
      </div>
    );
  }
  if (bill.status !== 'DRAFT') {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <ErrorBox message={t('bill.notDraft', { number: bill.number })} />
        <Link
          href={`/invoicing/bills/${bill.id}`}
          className="text-sm font-medium text-indigo-700 hover:underline"
        >
          {bill.number}
        </Link>
      </div>
    );
  }
  return <BillForm bill={bill} />;
}
