'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Loader2, Search } from 'lucide-react';
import type {
  Paginated,
  ProductDetail,
  ProductListItem,
  StockDocProduct,
  StockDocumentStatus,
  WarehouseRow,
} from '@erp/shared';
import { api } from '@/lib/api';
import { formatQty } from '@/lib/format';
import { inputClass } from '@/components/products/ui';

import { tr } from '@/lib/i18n';
/** Building blocks shared by the adjustment and transfer screens. */

const STATUS_STYLE: Record<StockDocumentStatus, { label: string; className: string }> = {
  DRAFT: { label: tr("Draft"), className: 'bg-amber-50 text-amber-700' },
  POSTED: { label: tr("Validated"), className: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: tr("Cancelled"), className: 'bg-slate-100 text-slate-500' },
};

export function DocStatusBadge({ status }: { status: StockDocumentStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', s.className)}>
      {s.label}
    </span>
  );
}

export const STATUS_FILTERS: { value: '' | StockDocumentStatus; label: string }[] = [
  { value: '', label: tr("All statuses") },
  { value: 'DRAFT', label: tr("Draft") },
  { value: 'POSTED', label: tr("Validated") },
  { value: 'CANCELLED', label: tr("Cancelled") },
];

/** Active warehouses, for the selects. */
export function useWarehouses() {
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<WarehouseRow[]>('/inventory/warehouses')
      .then(setWarehouses)
      .catch((e: Error) => setError(e.message));
  }, []);
  return { warehouses, error };
}

/** On-hand quantity of a product per warehouse id. */
export async function fetchStockByWarehouse(productId: string): Promise<Record<string, string>> {
  const p = await api<ProductDetail>(`/inventory/products/${productId}`);
  return Object.fromEntries(p.stockByWarehouse.map((s) => [s.warehouse.id, s.quantity]));
}

export function toDocProduct(p: ProductListItem): StockDocProduct {
  return { id: p.id, sku: p.sku, name: p.name, unit: p.baseUnit.code };
}

/**
 * Search box that finds active products by name, SKU or barcode.
 * Pressing Enter on an exact barcode/SKU match adds it straight away (scanner friendly).
 */
export function ProductPicker({
  onPick,
  excludeIds,
  disabled,
}: {
  onPick: (p: ProductListItem) => void;
  excludeIds: Set<string>;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api<Paginated<ProductListItem>>(
        `/inventory/products?status=active&pageSize=8&search=${encodeURIComponent(q)}`,
      )
        .then((r) => {
          setResults(r.items);
          setActive(0);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function pick(p: ProductListItem) {
    if (excludeIds.has(p.id)) return;
    onPick(p);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const q = query.trim().toLowerCase();
      const exact = results.find((r) => r.sku.toLowerCase() === q || r.barcode === query.trim());
      const chosen = exact ?? results[active];
      if (chosen) pick(chosen);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className={clsx(inputClass, 'ps-9')}
        placeholder={tr("Add a product: type a name, SKU or scan a barcode")}
        aria-label={tr("Search product to add")}
      />
      {loading && (
        <Loader2 className="absolute top-1/2 end-3 size-4 -translate-y-1/2 animate-spin text-slate-400" />
      )}
      {open && query.trim() && !loading && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{tr("No product found")}</li>}
          {results.map((p, i) => {
            const taken = excludeIds.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  onMouseEnter={() => setActive(i)}
                  disabled={taken}
                  className={clsx(
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm',
                    i === active && !taken && 'bg-slate-50',
                    taken && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{p.name}</span>
                    <span className="font-mono text-xs text-slate-500">{p.sku}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {taken ? tr("Already added") : tr('{qty} {unit} in stock', { qty: formatQty(p.stockOnHand), unit: p.baseUnit.code })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
