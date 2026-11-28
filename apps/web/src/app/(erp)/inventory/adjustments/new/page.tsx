'use client';

import { useAuth } from '@/lib/auth';
import { ErrorBox } from '@/components/products/ui';
import { AdjustmentEditor } from '@/components/stock/adjustment-editor';

import { tr } from '@/lib/i18n';
export default function NewAdjustmentPage() {
  const { can } = useAuth();
  if (!can('inventory.stock.adjust')) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBox message={tr("You need the inventory.stock.adjust permission to create adjustments.")} />
      </div>
    );
  }
  return <AdjustmentEditor />;
}
