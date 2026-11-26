'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Check, ChevronDown, Lock, Minus, MoreVertical, ShieldAlert } from 'lucide-react';
import type { PermissionMatrix } from '@erp/shared';
import { Highlight } from '../highlight';
import { Menu } from '../menu';
import { roleColor } from '../role-colors';

type Role = PermissionMatrix['roles'][number];

function Cell({
  on,
  partial = false,
  changed,
  locked,
  label,
  onToggle,
}: {
  on: boolean;
  partial?: boolean;
  changed: boolean;
  locked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={partial ? 'mixed' : on}
      aria-label={label}
      disabled={locked}
      onClick={onToggle}
      className={clsx(
        'mx-auto grid size-6 place-items-center rounded-md transition-all duration-150',
        locked
          ? 'cursor-not-allowed bg-indigo-100 text-indigo-400'
          : on
            ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm hover:scale-110'
            : partial
              ? 'bg-indigo-100 text-indigo-600 hover:scale-110'
              : 'border border-slate-300 bg-white hover:scale-110 hover:border-indigo-400',
        changed && 'ring-2 ring-amber-400 ring-offset-1',
      )}
    >
      {on ? (
        <Check className={clsx('size-3.5', changed && 'animate-pop')} />
      ) : partial ? (
        <Minus className="size-3.5" />
      ) : null}
    </button>
  );
}

/** Role × permission grid with sticky header row and first column. */
export function PermissionMatrixTable({
  modules,
  roles,
  value,
  server,
  editable,
  query,
  onChange,
}: {
  modules: PermissionMatrix['modules'];
  roles: Role[];
  value: Map<string, Set<string>>;
  server: Map<string, Set<string>>;
  editable: boolean;
  query: string;
  onChange: (roleId: string, codes: string[], on: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const all = modules.flatMap((m) => m.permissions.map((p) => p.code));
  const lockedRole = (r: Role) => r.isProtected || !editable;

  return (
    <div className="max-h-[calc(100vh-17rem)] overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-30 min-w-[16rem] border-r border-b border-slate-200 bg-white px-4 py-3 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Permission
            </th>
            {roles.map((r) => {
              const c = roleColor(r.color);
              const set = value.get(r.id)!;
              return (
                <th
                  key={r.id}
                  className="sticky top-0 z-20 min-w-[7.5rem] border-b border-slate-200 bg-white/95 px-2 pt-2 pb-2.5 backdrop-blur"
                >
                  <div
                    className={clsx(
                      'mx-auto mb-1.5 h-1 w-10 rounded-full bg-gradient-to-r',
                      c.stripe,
                    )}
                  />
                  <div className="flex items-center justify-center gap-1">
                    <Link
                      href={`/admin/roles/${r.id}`}
                      className="max-w-[7rem] truncate text-xs font-semibold text-slate-800 hover:text-indigo-700"
                      title={r.name}
                    >
                      {r.name}
                    </Link>
                    {r.isProtected ? (
                      <Lock className="size-3 text-indigo-400" aria-label="Locked" />
                    ) : (
                      editable && (
                        <Menu
                          label={`Bulk actions for ${r.name}`}
                          triggerClassName="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          trigger={<MoreVertical className="size-3.5" />}
                          items={[
                            {
                              label: 'Grant all permissions',
                              icon: Check,
                              onSelect: () => onChange(r.id, all, true),
                            },
                            {
                              label: 'Remove all permissions',
                              icon: Minus,
                              onSelect: () => onChange(r.id, all, false),
                            },
                          ]}
                        />
                      )
                    )}
                  </div>
                  <div className="mt-0.5 text-center text-[11px] font-normal text-slate-400 tabular-nums">
                    {set.size}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const codes = m.permissions.map((p) => p.code);
            const isCollapsed = collapsed.has(m.key) && !query;
            return (
              <Fragment key={m.key}>
                <tr className="group">
                  <th className="sticky left-0 z-10 border-r border-b border-slate-200 bg-slate-50 px-3 py-2 text-left">
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
                      className="flex w-full items-center gap-2 text-xs font-semibold tracking-wide text-indigo-700 uppercase"
                    >
                      <ChevronDown
                        className={clsx('size-3.5 transition', isCollapsed && '-rotate-90')}
                      />
                      {m.label}
                      <span className="font-normal text-slate-400">{codes.length}</span>
                    </button>
                  </th>
                  {roles.map((r) => {
                    const set = value.get(r.id)!;
                    const held = codes.filter((c) => set.has(c)).length;
                    const was = server.get(r.id)!;
                    const changed = codes.some((c) => set.has(c) !== was.has(c));
                    return (
                      <td
                        key={r.id}
                        className="border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-center"
                      >
                        <Cell
                          on={held === codes.length}
                          partial={held > 0 && held < codes.length}
                          changed={changed}
                          locked={lockedRole(r)}
                          label={`${m.label} for ${r.name}`}
                          onToggle={() => onChange(r.id, codes, held !== codes.length)}
                        />
                      </td>
                    );
                  })}
                </tr>
                {!isCollapsed &&
                  m.permissions.map((p) => (
                    <tr key={p.code} className="group/row">
                      <td className="sticky left-0 z-10 border-r border-b border-slate-100 bg-white px-4 py-2 group-hover/row:bg-indigo-50/40">
                        <div className="flex items-center gap-1.5">
                          {p.sensitive && (
                            <ShieldAlert
                              className="size-3.5 shrink-0 text-amber-600"
                              aria-label="Sensitive"
                            />
                          )}
                          <span
                            className={clsx(
                              'truncate',
                              p.sensitive ? 'font-medium text-amber-900' : 'text-slate-800',
                            )}
                            title={p.description}
                          >
                            <Highlight text={p.label} query={query} />
                          </span>
                        </div>
                        <code className="block text-[11px] text-slate-400">
                          <Highlight text={p.code} query={query} />
                        </code>
                      </td>
                      {roles.map((r) => {
                        const on = value.get(r.id)!.has(p.code);
                        const changed = server.get(r.id)!.has(p.code) !== on;
                        return (
                          <td
                            key={r.id}
                            className={clsx(
                              'border-b border-slate-100 px-2 py-2 text-center transition-colors group-hover/row:bg-indigo-50/40',
                              changed && 'bg-amber-50/60',
                            )}
                          >
                            <Cell
                              on={on}
                              changed={changed}
                              locked={lockedRole(r)}
                              label={`${p.label} for ${r.name}`}
                              onToggle={() => onChange(r.id, [p.code], !on)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
