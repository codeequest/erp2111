'use client';

import clsx from 'clsx';
import { CalendarClock, Check, X } from 'lucide-react';
import type { RoleListItem } from '@erp/shared';
import { PrivilegedBadge, RoleTypeBadge } from '../badges';
import { fieldClass } from '../buttons';
import { roleColor } from '../role-colors';
import { Skeleton } from '../skeleton';

export interface RoleSelection {
  roleId: string;
  /** yyyy-mm-dd or '' (permanent). */
  expiresOn: string;
}

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

/** Pick roles as cards; each picked role can be made temporary with an end date. */
export function RoleAssignmentEditor({
  roles,
  value,
  onChange,
  disabled,
}: {
  roles: RoleListItem[] | null;
  value: RoleSelection[];
  onChange: (v: RoleSelection[]) => void;
  disabled?: boolean;
}) {
  if (!roles) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }
  const picked = new Map(value.map((v) => [v.roleId, v]));
  const toggle = (id: string) =>
    onChange(
      picked.has(id)
        ? value.filter((v) => v.roleId !== id)
        : [...value, { roleId: id, expiresOn: '' }],
    );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {roles.map((r) => {
        const sel = picked.get(r.id);
        const c = roleColor(r.color);
        return (
          <div
            key={r.id}
            className={clsx(
              'group relative overflow-hidden rounded-xl border bg-white p-3 transition',
              sel
                ? clsx('border-transparent ring-2', c.ring, c.soft)
                : 'border-slate-200 hover:border-slate-300',
              disabled && 'pointer-events-none opacity-60',
            )}
          >
            <span className={clsx('absolute inset-y-0 left-0 w-1 bg-gradient-to-b', c.stripe)} />
            <button
              type="button"
              onClick={() => toggle(r.id)}
              className="flex w-full items-start gap-3 pl-1 text-left"
              aria-pressed={!!sel}
            >
              <span
                className={clsx(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition',
                  sel
                    ? 'border-transparent bg-gradient-to-br from-indigo-500 to-violet-600 text-white'
                    : 'border-slate-300 bg-white',
                )}
              >
                {sel && <Check className="animate-pop size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-900">{r.name}</span>
                  {r.privileged && <PrivilegedBadge compact />}
                  {(r.isProtected || r.type === 'SYSTEM') && (
                    <RoleTypeBadge type={r.type} isProtected={r.isProtected} />
                  )}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">
                  {r.description || `${r.permissionCount} permissions`}
                </span>
              </span>
            </button>
            {sel && (
              <div className="animate-fade-in mt-2.5 flex items-center gap-2 pl-9">
                <CalendarClock className="size-3.5 shrink-0 text-slate-400" />
                {sel.expiresOn ? (
                  <>
                    <span className="text-xs text-slate-600">Until</span>
                    <input
                      type="date"
                      value={sel.expiresOn}
                      min={tomorrow()}
                      onChange={(e) =>
                        onChange(
                          value.map((v) =>
                            v.roleId === r.id ? { ...v, expiresOn: e.target.value } : v,
                          ),
                        )
                      }
                      className={clsx(fieldClass, 'px-2 py-1 text-xs')}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onChange(
                          value.map((v) => (v.roleId === r.id ? { ...v, expiresOn: '' } : v)),
                        )
                      }
                      className="rounded p-0.5 text-slate-400 hover:text-slate-700"
                      aria-label="Make permanent"
                    >
                      <X className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onChange(
                        value.map((v) => (v.roleId === r.id ? { ...v, expiresOn: tomorrow() } : v)),
                      )
                    }
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Permanent · make temporary
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The API expects an ISO instant; a date means "until the end of that day" (local time). */
export function toExpiresAt(day: string): string | null {
  if (!day) return null;
  return new Date(`${day}T23:59:59`).toISOString();
}

export function fromExpiresAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
