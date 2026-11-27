'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Search, Truck, X } from 'lucide-react';
import type { Paginated, SupplierListItem } from '@erp/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Spinner, inputClass } from '@/components/purchasing/ui';

/** Search-as-you-type supplier picker (active suppliers). */
export function SupplierSelect({
  value,
  onChange,
  disabled,
}: {
  value: { id: string; name: string } | null;
  onChange: (s: SupplierListItem | null) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SupplierListItem[] | null>(null);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ status: 'active', pageSize: '20' });
      if (term.trim()) qs.set('search', term.trim());
      setItems(null);
      api<Paginated<SupplierListItem>>(`/purchasing/suppliers?${qs}`)
        .then((r) => {
          setItems(r.items);
          setActive(0);
        })
        .catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [term, open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(s: SupplierListItem) {
    onChange(s);
    setOpen(false);
    setTerm('');
  }

  if (value && !open) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm">
        <Truck className="size-4 text-indigo-500" />
        <span className="flex-1 truncate font-medium text-slate-800">{value.name}</span>
        {!disabled && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(true);
            }}
            aria-label={t('bill.f.changeSupplier')}
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        value={term}
        disabled={disabled}
        autoFocus={open}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!items?.length) return;
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, items.length - 1));
          if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          if (e.key === 'Enter') {
            e.preventDefault();
            pick(items[active]);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={t('bill.f.supplierPh')}
        className={clsx(inputClass, 'pl-9')}
      />
      {open && (
        <div className="animate-pop absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {items === null ? (
            <div className="grid place-items-center py-4">
              <Spinner className="text-indigo-500" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-400">{t('bill.f.noSupplier')}</p>
          ) : (
            items.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
                className={clsx(
                  'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
                  i === active ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700',
                )}
              >
                <span className="truncate font-medium">{s.name}</span>
                <span className="font-mono text-xs text-slate-400">{s.code}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
