'use client';

import { useState } from 'react';
import clsx from 'clsx';
import {
  Ban,
  ChevronDown,
  KeyRound,
  LogIn,
  type LucideIcon,
  MailPlus,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react';
import type { AuditEntryDto } from '@erp/shared';
import { formatDateTime, relativeTime } from '@/lib/format';

/** "user.roles_assigned" → "Roles assigned". */
export function actionLabel(action: string): string {
  const [, verb = action] = action.split('.');
  const s = verb.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function iconFor(e: AuditEntryDto): { icon: LucideIcon; tone: string } {
  const a = e.action;
  if (e.result === 'DENIED') return { icon: Ban, tone: 'from-rose-500 to-pink-600' };
  if (e.result === 'FAILURE') return { icon: ShieldAlert, tone: 'from-amber-500 to-orange-600' };
  if (/login/.test(a)) return { icon: LogIn, tone: 'from-sky-500 to-blue-600' };
  if (/created/.test(a)) return { icon: UserPlus, tone: 'from-emerald-500 to-teal-600' };
  if (/invitation/.test(a)) return { icon: MailPlus, tone: 'from-sky-500 to-cyan-600' };
  if (/deactivated|locked|revoked|removed|deleted/.test(a))
    return { icon: UserX, tone: 'from-rose-500 to-red-600' };
  if (/activated|unlocked|accepted|verified/.test(a))
    return { icon: UserCheck, tone: 'from-emerald-500 to-green-600' };
  if (/roles|permission/.test(a)) return { icon: Users, tone: 'from-violet-500 to-purple-600' };
  if (/mfa/.test(a)) return { icon: ShieldCheck, tone: 'from-indigo-500 to-violet-600' };
  if (/password/.test(a)) return { icon: KeyRound, tone: 'from-amber-500 to-yellow-600' };
  return { icon: Pencil, tone: 'from-slate-500 to-slate-700' };
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v
      .map((x) =>
        x && typeof x === 'object' && 'name' in x ? String((x as { name: unknown }).name) : show(x),
      )
      .join(', ');
  }
  return JSON.stringify(v);
}

/** Field-by-field before → after table. */
export function AuditDiff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  if (keys.length === 0) return <p className="text-xs text-slate-400">No details recorded.</p>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-slate-400">
          <th className="py-1 pr-3 font-medium">Field</th>
          <th className="py-1 pr-3 font-medium">Before</th>
          <th className="py-1 font-medium">After</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} className="border-t border-slate-100 align-top">
            <td className="py-1.5 pr-3 font-medium text-slate-600">{k}</td>
            <td className="py-1.5 pr-3 break-all text-rose-700">{k in b ? show(b[k]) : '—'}</td>
            <td className="py-1.5 break-all text-emerald-700">{k in a ? show(a[k]) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Vertical timeline of audit entries with expandable details. */
export function AuditTimeline({ entries }: { entries: AuditEntryDto[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ol className="relative space-y-1">
      <span className="absolute top-2 bottom-2 left-[17px] w-px bg-gradient-to-b from-slate-200 via-slate-200 to-transparent" />
      {entries.map((e, i) => {
        const { icon: Icon, tone } = iconFor(e);
        const isOpen = open === e.id;
        const hasDetail = !!(e.before || e.after || e.reason || e.ip);
        return (
          <li
            key={e.id}
            className="animate-fade-up relative"
            style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
          >
            <button
              type="button"
              disabled={!hasDetail}
              onClick={() => setOpen(isOpen ? null : e.id)}
              className="flex w-full items-start gap-3 rounded-lg p-1.5 text-left transition enabled:hover:bg-slate-50"
            >
              <span
                className={clsx(
                  'relative z-10 grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white shadow-sm ring-4 ring-white',
                  tone,
                )}
              >
                <Icon className="size-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-slate-900">{actionLabel(e.action)}</span>
                  {e.targetLabel && (
                    <span className="truncate text-slate-500">{e.targetLabel}</span>
                  )}
                  {e.result !== 'SUCCESS' && (
                    <span
                      className={clsx(
                        'rounded px-1 text-[11px] font-semibold',
                        e.result === 'DENIED'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-800',
                      )}
                    >
                      {e.result.toLowerCase()}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-slate-500" title={formatDateTime(e.createdAt)}>
                  {e.actorName ?? 'System'} · {relativeTime(e.createdAt)}
                </span>
              </span>
              {hasDetail && (
                <ChevronDown
                  className={clsx('mt-1 size-4 text-slate-400 transition', isOpen && 'rotate-180')}
                />
              )}
            </button>
            {isOpen && (
              <div className="animate-fade-in mt-1 mb-2 ml-10 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                {e.reason && (
                  <p className="text-xs text-slate-600">
                    <span className="font-medium">Reason:</span> {e.reason}
                  </p>
                )}
                {(e.before != null || e.after != null) && <AuditDiff before={e.before} after={e.after} />}
                {e.ip && <p className="text-[11px] text-slate-400">From {e.ip}</p>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
