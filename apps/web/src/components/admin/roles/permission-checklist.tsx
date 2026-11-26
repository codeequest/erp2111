'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, Search, ShieldAlert } from 'lucide-react';
import type { PermissionMatrix } from '@erp/shared';
import { inputClass } from '../buttons';
import { Checkbox } from '../data-table';
import { Skeleton } from '../skeleton';

type Modules = PermissionMatrix['modules'];

/** Permissions grouped by module with tri-state module toggles and search. */
export function PermissionChecklist({
  modules,
  value,
  onChange,
  disabled = false,
  baseline,
}: {
  modules: Modules | null;
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
  /** Saved permissions: changed rows get a highlight. */
  baseline?: Set<string>;
}) {
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (modules ?? [])
      .map((m) => ({
        ...m,
        permissions: m.permissions.filter(
          (p) =>
            !term ||
            p.label.toLowerCase().includes(term) ||
            p.code.includes(term) ||
            p.description.toLowerCase().includes(term),
        ),
      }))
      .filter((m) => m.permissions.length > 0);
  }, [modules, q]);

  if (!modules) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  const setMany = (codes: string[], on: boolean) => {
    const next = new Set(value);
    codes.forEach((c) => (on ? next.add(c) : next.delete(c)));
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search permissions"
          className={clsx(inputClass, 'pl-9')}
        />
      </div>
      {filtered.map((m) => {
        const codes = m.permissions.map((p) => p.code);
        const held = codes.filter((c) => value.has(c)).length;
        const isCollapsed = collapsed.has(m.key) && !q;
        return (
          <section key={m.key} className="overflow-hidden rounded-xl border border-slate-200">
            <header className="flex items-center gap-3 bg-slate-50/80 px-3 py-2.5">
              <Checkbox
                label={`All of ${m.label}`}
                checked={held === codes.length}
                indeterminate={held > 0}
                disabled={disabled}
                onChange={(on) => setMany(codes, on)}
              />
              <button
                type="button"
                onClick={() =>
                  setCollapsed((s) => {
                    const n = new Set(s);
                    if (n.has(m.key)) n.delete(m.key);
                    else n.add(m.key);
                    return n;
                  })
                }
                className="flex flex-1 items-center gap-2 text-left"
              >
                <span className="text-sm font-semibold text-slate-800">{m.label}</span>
                <span className="text-xs text-slate-500 tabular-nums">
                  {held}/{codes.length}
                </span>
                <ChevronDown
                  className={clsx(
                    'ml-auto size-4 text-slate-400 transition',
                    isCollapsed && '-rotate-90',
                  )}
                />
              </button>
            </header>
            {!isCollapsed && (
              <ul className="divide-y divide-slate-100">
                {m.permissions.map((p) => {
                  const on = value.has(p.code);
                  const changed = baseline && baseline.has(p.code) !== on;
                  return (
                    <li key={p.code}>
                      <label
                        className={clsx(
                          'flex items-start gap-3 px-3 py-2 transition',
                          disabled ? 'cursor-default' : 'cursor-pointer hover:bg-slate-50',
                          changed && (on ? 'bg-emerald-50/70' : 'bg-rose-50/70'),
                        )}
                      >
                        <span className="pt-0.5">
                          <Checkbox
                            label={p.label}
                            checked={on}
                            disabled={disabled}
                            onChange={(v) => setMany([p.code], v)}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-sm">
                            <span
                              className={clsx(
                                p.sensitive ? 'font-medium text-amber-900' : 'text-slate-800',
                              )}
                            >
                              {p.label}
                            </span>
                            {p.sensitive && (
                              <span
                                className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200"
                                title="Sensitive: grants administration power"
                              >
                                <ShieldAlert className="size-3" />
                                Sensitive
                              </span>
                            )}
                            {changed && (
                              <span
                                className={clsx(
                                  'text-[11px] font-semibold',
                                  on ? 'text-emerald-700' : 'text-rose-700',
                                )}
                              >
                                {on ? '+ added' : '− removed'}
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-slate-500">{p.description}</span>
                        </span>
                        <code className="hidden shrink-0 pt-0.5 text-[11px] text-slate-400 lg:block">
                          {p.code}
                        </code>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
