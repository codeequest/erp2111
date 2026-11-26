'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ShieldAlert, Sparkles } from 'lucide-react';
import type { PermissionMatrix } from '@erp/shared';
import { Skeleton } from '../skeleton';

/** What the selected roles add up to, grouped by module; sensitive permissions highlighted. */
export function EffectivePermissionsPreview({
  matrix,
  roleIds,
}: {
  matrix: PermissionMatrix | null;
  roleIds: string[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!matrix) return <Skeleton className="h-40 w-full" />;

  const granted = new Set(
    matrix.roles.filter((r) => roleIds.includes(r.id)).flatMap((r) => r.permissions),
  );
  const modules = matrix.modules
    .map((m) => ({ ...m, held: m.permissions.filter((p) => granted.has(p.code)) }))
    .filter((m) => m.held.length > 0);
  const sensitive = [...granted].filter((c) =>
    matrix.modules.some((m) => m.permissions.some((p) => p.code === c && p.sensitive)),
  ).length;

  if (granted.size === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
        <Sparkles className="mx-auto size-5 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">
          Pick a role to see what this person will be able to do.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-medium text-indigo-700 tabular-nums ring-1 ring-indigo-200">
          {granted.size} permissions
        </span>
        {sensitive > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200">
            <ShieldAlert className="size-3.5" />
            {sensitive} sensitive
          </span>
        )}
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {modules.map((m) => {
          const isOpen = open === m.key;
          const pct = Math.round((m.held.length / m.permissions.length) * 100);
          return (
            <li key={m.key}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : m.key)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
              >
                <span className="flex-1 font-medium text-slate-800">{m.label}</span>
                <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 sm:block">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="w-12 text-right text-xs text-slate-500 tabular-nums">
                  {m.held.length}/{m.permissions.length}
                </span>
                <ChevronDown
                  className={clsx('size-4 text-slate-400 transition', isOpen && 'rotate-180')}
                />
              </button>
              {isOpen && (
                <ul className="animate-fade-in space-y-1 px-3 pb-3">
                  {m.held.map((p) => (
                    <li key={p.code} className="flex items-center gap-2 text-xs">
                      {p.sensitive ? (
                        <ShieldAlert className="size-3.5 shrink-0 text-amber-600" />
                      ) : (
                        <span className="size-1.5 shrink-0 rounded-full bg-indigo-400" />
                      )}
                      <span
                        className={clsx(
                          p.sensitive ? 'font-medium text-amber-800' : 'text-slate-700',
                        )}
                      >
                        {p.label}
                      </span>
                      <code className="ml-auto hidden text-[11px] text-slate-400 sm:block">
                        {p.code}
                      </code>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
