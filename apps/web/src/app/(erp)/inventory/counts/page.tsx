'use client';

import type { StockCountListItem } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { ErrorBox } from '@/components/products/ui';
import { StockDocList } from '@/components/stock/doc-list';

import { tr } from '@/lib/i18n';
export default function StockCountsPage() {
  const { can } = useAuth();
  if (!can('inventory.stock.read')) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBox message={tr("You need the inventory.stock.read permission to see stock counts.")} />
      </div>
    );
  }
  return (
    <StockDocList<StockCountListItem>
      title={tr("Stock counts")}
      subtitle={tr("Count the goods on the shelves; validating fixes the stock to what was counted")}
      apiPath="/inventory/counts"
      basePath="/inventory/counts"
      newLabel={tr("New count")}
      canCreate={can('inventory.stock.adjust')}
      emptyText={tr("No stock count yet.")}
      columns={[
        {
          header: tr("Warehouse"),
          cell: (c) => <span className="font-mono text-xs">{c.warehouse.code}</span>,
        },
        {
          header: tr("Category"),
          cell: (c) => <span className="text-slate-600">{c.category?.name ?? tr('All products')}</span>,
        },
        {
          header: tr("Counted"),
          cell: (c) => {
            const pct = c.lineCount ? Math.round((c.countedCount / c.lineCount) * 100) : 0;
            return (
              <span className="flex min-w-[7rem] items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full bg-mod-inventory" style={{ width: `${pct}%` }} />
                </span>
                <span className="text-xs text-slate-500 tabular-nums">{pct}%</span>
              </span>
            );
          },
        },
      ]}
    />
  );
}
