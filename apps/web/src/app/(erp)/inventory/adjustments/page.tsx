'use client';

import type { AdjustmentListItem } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { ErrorBox } from '@/components/products/ui';
import { StockDocList } from '@/components/stock/doc-list';

import { tr } from '@/lib/i18n';
export default function AdjustmentsPage() {
  const { can } = useAuth();
  if (!can('inventory.stock.read')) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBox message={tr("You need the inventory.stock.read permission to see adjustments.")} />
      </div>
    );
  }
  return (
    <StockDocList<AdjustmentListItem>
      title={tr("Adjustments")}
      subtitle={tr("Corrections of stock: damaged, lost or found goods")}
      apiPath="/inventory/adjustments"
      basePath="/inventory/adjustments"
      newLabel={tr("New adjustment")}
      canCreate={can('inventory.stock.adjust')}
      emptyText={tr("No adjustment yet.")}
      columns={[
        {
          header: tr("Warehouse"),
          cell: (a) => <span className="font-mono text-xs">{a.warehouse.code}</span>,
        },
        {
          header: tr("Reason"),
          cell: (a) => <span className="line-clamp-1 max-w-[18rem]">{a.reason}</span>,
        },
      ]}
    />
  );
}
