'use client';

import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

export interface TabDef<K extends string> {
  key: K;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

/** Underlined tabs that scroll horizontally on small screens. */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: TabDef<K>[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="-mx-1 overflow-x-auto border-b border-slate-200">
      <div role="tablist" className="flex min-w-max gap-1 px-1">
        {tabs.map((t) => {
          const active = t.key === value;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.key)}
              className={clsx(
                'relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition',
                active ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {Icon && <Icon className="size-4" />}
              {t.label}
              {t.count !== undefined && (
                <span
                  className={clsx(
                    'rounded-full px-1.5 text-xs tabular-nums',
                    active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {t.count}
                </span>
              )}
              <span
                className={clsx(
                  'absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-transform duration-200',
                  active ? 'scale-x-100' : 'scale-x-0',
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
