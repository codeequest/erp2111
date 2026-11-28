'use client';

import { useAuth } from '@/lib/auth';
import { ErrorBox } from '@/components/products/ui';
import { TransferEditor } from '@/components/stock/transfer-editor';

import { tr } from '@/lib/i18n';
export default function NewTransferPage() {
  const { can } = useAuth();
  if (!can('inventory.stock.transfer')) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBox message={tr("You need the inventory.stock.transfer permission to create transfers.")} />
      </div>
    );
  }
  return <TransferEditor />;
}
