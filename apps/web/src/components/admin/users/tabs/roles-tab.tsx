'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { KeyRound, Pencil, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { NAVIGATION, type EffectivePermission, type UserDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { relativeTime } from '@/lib/format';
import { RoleChip, TemporaryChip } from '../../badges';
import { btnSecondary, inputClass } from '../../buttons';
import { Card } from '../../card';
import { EmptyState } from '../../empty-state';
import { Skeleton } from '../../skeleton';

const MODULE_LABEL = new Map<string, string>(NAVIGATION.map((m) => [m.key, m.label]));

export function RolesTab({ user }: { user: UserDetail }) {
  const { can, user: me } = useAuth();
  const [perms, setPerms] = useState<EffectivePermission[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api<EffectivePermission[]>(`/users/${user.id}/effective-permissions`)
      .then(setPerms)
      .catch(() => setPerms([]));
  }, [user.id, user.updatedAt]);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (perms ?? []).filter(
      (p) => !term || p.label.toLowerCase().includes(term) || p.code.includes(term),
    );
    const by = new Map<string, EffectivePermission[]>();
    list.forEach((p) => by.set(p.module, [...(by.get(p.module) ?? []), p]));
    return [...by.entries()];
  }, [perms, q]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card
        icon={KeyRound}
        title="Assigned roles"
        className="animate-fade-up h-fit"
        actions={
          can('admin.user.assign_roles') &&
          me?.id !== user.id && (
            <Link href={`/admin/users/${user.id}/edit`} className={btnSecondary}>
              <Pencil className="size-4" />
              Change
            </Link>
          )
        }
      >
        {user.assignments.length === 0 ? (
          <p className="text-sm text-slate-500">
            No role — this person can sign in but do nothing.
          </p>
        ) : (
          <ul className="stagger space-y-2">
            {user.assignments.map((a, i) => {
              const days = a.expiresAt
                ? Math.ceil((new Date(a.expiresAt).getTime() - Date.now()) / 86_400_000)
                : null;
              return (
                <li
                  key={a.role.id}
                  style={{ '--i': i } as React.CSSProperties}
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <RoleChip role={a.role} size="md" />
                    {a.expiresAt && <TemporaryChip expiresAt={a.expiresAt} />}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Assigned {relativeTime(a.assignedAt)}
                    {a.assignedBy && ` by ${a.assignedBy}`}
                  </p>
                  {days !== null && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs">
                        <span
                          className={days <= 3 ? 'font-medium text-rose-600' : 'text-violet-700'}
                        >
                          {days <= 0 ? 'Expired' : `Ends in ${days} day${days === 1 ? '' : 's'}`}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-700"
                          style={{ width: `${Math.max(4, Math.min(100, (days / 30) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        icon={ShieldCheck}
        tone="emerald"
        title="Effective permissions"
        description="Everything this person can do right now, and the role that allows it."
        className="animate-fade-up [animation-delay:80ms]"
      >
        {perms === null ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : perms.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            tone="slate"
            title="No permissions"
            description="Assign a role to grant access."
            className="py-8"
          />
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${perms.length} permissions`}
                className={`${inputClass} pl-9`}
              />
            </div>
            {groups.map(([module, list]) => (
              <section key={module}>
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {MODULE_LABEL.get(module) ?? module}{' '}
                  <span className="text-slate-400">· {list.length}</span>
                </h3>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {list.map((p) => (
                    <li
                      key={p.code}
                      className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                    >
                      {p.sensitive && (
                        <ShieldAlert className="size-4 text-amber-600" aria-label="Sensitive" />
                      )}
                      <span
                        className={p.sensitive ? 'font-medium text-amber-900' : 'text-slate-800'}
                      >
                        {p.label}
                      </span>
                      <code className="hidden text-[11px] text-slate-400 md:inline">{p.code}</code>
                      <span className="ml-auto flex flex-wrap gap-1">
                        {p.sources.map((s) => (
                          <RoleChip key={s.id} role={s} />
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
