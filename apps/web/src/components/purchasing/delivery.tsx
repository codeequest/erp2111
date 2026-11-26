'use client';

import clsx from 'clsx';
import { CheckCircle2, Clock3, Truck } from 'lucide-react';
import type { DeliveryStatus, PurchaseOrderStatus } from '@erp/shared';
import { useI18n } from '@/lib/i18n';

/** Delivery status of a confirmed order (null for drafts and cancelled orders). */
export function deliveryStatusOf(status: PurchaseOrderStatus): DeliveryStatus | null {
  if (status === 'CONFIRMED') return 'waiting';
  if (status === 'PARTIALLY_RECEIVED') return 'in_progress';
  if (status === 'RECEIVED') return 'delivered';
  return null;
}

const STYLE: Record<DeliveryStatus, { cls: string; icon: typeof Truck }> = {
  waiting: { cls: 'bg-sky-50 text-sky-700 ring-sky-600/20', icon: Clock3 },
  in_progress: { cls: 'bg-amber-50 text-amber-800 ring-amber-600/25', icon: Truck },
  delivered: { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', icon: CheckCircle2 },
};

/** "En attente" / "En cours" / "Livrée" */
export function DeliveryBadge({ status }: { status: DeliveryStatus }) {
  const { t } = useI18n();
  const { cls, icon: Icon } = STYLE[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1',
        cls,
      )}
    >
      <Icon className={clsx('size-3.5', status === 'in_progress' && 'animate-pulse')} />
      {t(`dl.status.${status}`)}
    </span>
  );
}
