'use client';

import { ArrowRight } from 'lucide-react';
import type { TransferListItem } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { ErrorBox } from '@/components/products/ui';
import { StockDocList } from '@/components/stock/doc-list';

import { tr } from '@/lib/i18n';
export default function TransfersPage() {
  const { can } = useAuth();
  if (!can('inventory.stock.read')) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBox message={tr("You need the inventory.stock.read permission to see transfers.")} />
      </div>
    );
  }
  return (
    <StockDocList<TransferListItem>
      title={tr("Transfers")}
      subtitle={tr("Goods moved from one warehouse to another")}
      apiPath="/inventory/transfers"
      basePath="/inventory/transfers"
      newLabel={tr("New transfer")}
      canCreate={can('inventory.stock.transfer')}
      emptyText={tr("No transfer yet.")}
      columns={[
        {
          header: tr("From → To"),
          cell: (t) => (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs">
              {t.fromWarehouse.code} <ArrowRight className="rtl:-scale-x-100 size-3 text-slate-400" /> {t.toWarehouse.code}
            </span>
          ),
        },
      ]}
    />
  );
}
