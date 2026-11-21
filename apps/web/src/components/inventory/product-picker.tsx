'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Loader2, Package, Search, X } from 'lucide-react';
import type { Paginated, ProductListItem } from '@erp/shared';
import { api } from '@/lib/api';
import { inputClass } from '@/components/ui';

export type PickedProduct = Pick<ProductListItem, 'id' | 'sku' | 'name' | 'baseUnit'>;

/**
 * Type-ahead product search (name, SKU or barcode). A scanner that "types" a
 * barcode and presses Enter picks the single exact match directly.
 */
export function ProductPicker({
  value,
  onChange,
  exclude = [],
  invalid,
  autoFocus,
}: {
  value: PickedProduct | null;
  onChange: (p: PickedProduct | null) => void;
  /** Product ids already used on other lines. */
  exclude?: string[];
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ pageSize: '8', status: 'active' });
        if (q) params.set('q', q);
        const res = await api<Paginated<ProductListItem>>(`/inventory/products?${params}`);
        setResults(res.items.filter((p) => !exclude.includes(p.id)));
        setActive(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
    // exclude is a fresh array each render; its content only matters when searching
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function pick(p: ProductListItem) {
    onChange({ id: p.id, sku: p.sku, name: p.name, baseUnit: p.baseUnit });
    setQuery('');
    setOpen(false);
  }

  if (value) {
    return (
      <div className="animate-fade-in flex min-w-0 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-1.5">
        <Package className="size-4 shrink-0 text-mod-inventory" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium text-slate-900">{value.name}</p>
          <p className="font-mono text-[11px] text-slate-500">{value.sku}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Change product"
          className="rounded p-0.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[active]) pick(results[active]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Search or scan a product…"
        aria-label="Product"
        className={inputClass(invalid) + ' pl-9'}
      />
      {open && (
        <div className="animate-pop absolute z-30 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10">
          {loading && !results.length ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">No active product found.</p>
          ) : (
            results.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                onMouseEnter={() => setActive(i)}
                className={clsx(
                  'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                  i === active ? 'bg-emerald-50' : 'hover:bg-slate-50',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {p.name}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">{p.sku}</span>
                </span>
                {p.onHand !== undefined && (
                  <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                    {p.onHand} {p.baseUnit.code}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
