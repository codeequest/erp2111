'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AccessDenied } from '@/components/page-header';
import { BillForm } from '@/components/invoicing/bill-form';

export default function NewBillPage() {
  return (
    <Suspense>
      <NewBill />
    </Suspense>
  );
}

function NewBill() {
  const { can } = useAuth();
  const { t } = useI18n();
  const params = useSearchParams();
  if (!can('invoicing.bill.write')) {
    return <AccessDenied permission="invoicing.bill.write" what={t('bill.newTitle')} />;
  }
  return (
    <BillForm
      presetSupplierId={params.get('supplierId') ?? undefined}
      presetReceiptId={params.get('receiptId') ?? undefined}
    />
  );
}
