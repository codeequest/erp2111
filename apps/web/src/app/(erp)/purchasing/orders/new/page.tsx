'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilePlus2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AccessDenied } from '@/components/page-header';
import { OrderForm } from '@/components/purchasing/order-form';
import { setFlash } from '@/components/purchasing/flash';
import { PurchasingHero, useSuccess } from '@/components/purchasing/ui';

export default function NewPurchaseOrderPage() {
  return (
    <Suspense>
      <NewOrder />
    </Suspense>
  );
}

function NewOrder() {
  const { can } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const presetSupplierId = useSearchParams().get('supplierId');
  const { burst, celebrate } = useSuccess();

  if (!can('purchasing.order.write')) {
    return <AccessDenied permission="purchasing.order.write" what={t('pof.newTitle')} />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-4">
      <PurchasingHero
        icon={FilePlus2}
        title={t('pof.newTitle')}
        subtitle={t('pof.newSubtitle')}
        crumb={[{ label: t('po.title'), href: '/purchasing/orders' }, { label: t('pof.newCrumb') }]}
      />
      <OrderForm
        presetSupplierId={presetSupplierId}
        canConfirm={can('purchasing.order.confirm')}
        onCancel={() => router.push('/purchasing/orders')}
        onSaved={(order, confirmed, warning) => {
          if (warning) {
            setFlash({ kind: 'warning', message: warning });
            router.push(`/purchasing/orders/${order.id}`);
            return;
          }
          celebrate(
            confirmed
              ? t('pof.confirmed', { number: order.number })
              : t('pof.savedDraft', { number: order.number }),
            () => router.push(`/purchasing/orders/${order.id}`),
          );
        }}
      />
      {burst}
    </div>
  );
}
