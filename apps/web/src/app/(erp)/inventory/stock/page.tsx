'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { History, Layers } from 'lucide-react';
import type { StockDocProduct } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { Breadcrumbs, ErrorBox } from '@/components/products/ui';
import { StockLevels } from '@/components/stock/stock-levels';
import { StockMoves } from '@/components/stock/stock-moves';

import { tr } from '@/lib/i18n';
type Tab = 'levels' | 'moves';

/**
 * Stock levels and movement history.
 * Links: /inventory/stock?low=1 opens the low-stock list, ?tab=moves the history.
 */
export default function StockPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('levels');
  const [initialLow, setInitialLow] = useState<boolean | null>(null);
  const [product, setProduct] = useState<StockDocProduct | null>(null);
  const [historyWarehouse, setHistoryWarehouse] = useState('');

  // Read the link options once (window, not useSearchParams, so the page needs no Suspense).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'moves') setTab('moves');
    setInitialLow(params.get('low') === '1');
  }, []);

  function openHistory(p: StockDocProduct, warehouseId: string) {
    setProduct(p);
    setHistoryWarehouse(warehouseId);
    setTab('moves');
  }

  if (!can('inventory.stock.read')) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBox message={tr("You need the inventory.stock.read permission to see stock.")} />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof Layers }[] = [
    { key: 'levels', label: tr("Stock levels"), icon: Layers },
    { key: 'moves', label: tr("Movements"), icon: History },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Breadcrumbs trail={[{ label: tr("Stock") }]} />
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{tr("Stock")}</h1>
        <p className="text-sm text-slate-500">{tr("What is in stock, where, and every movement that changed it")}</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition',
              tab === t.key
                ? 'border-mod-inventory text-mod-inventory'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Both tabs stay mounted so their filters survive switching. */}
      <div hidden={tab !== 'levels'}>
        {initialLow !== null && <StockLevels initialLow={initialLow} onHistory={openHistory} />}
      </div>
      <div hidden={tab !== 'moves'}>
        <StockMoves product={product} onProduct={setProduct} initialWarehouseId={historyWarehouse} />
      </div>
    </div>
  );
}
