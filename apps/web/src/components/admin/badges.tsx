import clsx from 'clsx';
import {
  BadgeCheck,
  Clock,
  Crown,
  Lock,
  MailWarning,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import type { DisplayStatus, RoleRef, RoleType } from '@erp/shared';
import { roleColor } from './role-colors';

const STATUS: Record<DisplayStatus, { label: string; cls: string; dot: string }> = {
  ACTIVE: {
    label: 'Active',
    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  PENDING: { label: 'Invited', cls: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  INACTIVE: {
    label: 'Inactive',
    cls: 'bg-slate-100 text-slate-600 ring-slate-200',
    dot: 'bg-slate-400',
  },
  LOCKED: {
    label: 'Locked',
    cls: 'bg-amber-50 text-amber-800 ring-amber-200',
    dot: 'bg-amber-500',
  },
};

const pill =
  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset';

export function UserStatusBadge({ status }: { status: DisplayStatus }) {
  const s = STATUS[status];
  return (
    <span className={clsx(pill, s.cls)}>
      {status === 'LOCKED' ? (
        <Lock className="size-3" />
      ) : (
        <span
          className={clsx('size-1.5 rounded-full', s.dot, status === 'ACTIVE' && 'animate-pulse')}
        />
      )}
      {s.label}
    </span>
  );
}

export function RoleChip({ role, size = 'sm' }: { role: RoleRef; size?: 'sm' | 'md' }) {
  const c = roleColor(role.color);
  return (
    <span
      className={clsx(
        'inline-flex max-w-full items-center gap-1.5 rounded-md font-medium ring-1 ring-inset',
        c.chip,
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
      )}
      title={role.name}
    >
      <span className={clsx('size-1.5 shrink-0 rounded-full', c.dot)} />
      <span className="truncate">{role.name}</span>
    </span>
  );
}

/** Shows up to `max` chips and a "+n" counter. */
export function RoleChips({ roles, max = 3 }: { roles: RoleRef[]; max?: number }) {
  if (roles.length === 0) return <span className="text-xs text-slate-400">No role</span>;
  const shown = roles.slice(0, max);
  const rest = roles.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((r) => (
        <RoleChip key={r.id} role={r} />
      ))}
      {rest > 0 && (
        <span
          className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600"
          title={roles
            .slice(max)
            .map((r) => r.name)
            .join(', ')}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

export function PrivilegedBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={clsx(
        pill,
        'bg-gradient-to-r from-amber-50 to-orange-50 text-amber-800 ring-amber-200',
      )}
      title="Holds sensitive administration permissions"
    >
      <ShieldAlert className="size-3" />
      {!compact && 'Privileged'}
    </span>
  );
}

export function MfaBadge({ enabled, required }: { enabled: boolean; required?: boolean }) {
  if (enabled) {
    return (
      <span
        className={clsx(pill, 'bg-emerald-50 text-emerald-700 ring-emerald-200')}
        title="Two-step verification on"
      >
        <ShieldCheck className="size-3" />
        MFA
      </span>
    );
  }
  return (
    <span
      className={clsx(
        pill,
        required
          ? 'bg-rose-50 text-rose-700 ring-rose-200'
          : 'bg-slate-50 text-slate-500 ring-slate-200',
      )}
      title={required ? 'Required but not set up yet' : 'Two-step verification off'}
    >
      <ShieldOff className="size-3" />
      {required ? 'MFA needed' : 'No MFA'}
    </span>
  );
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span
      className="inline-flex items-center gap-1 text-xs text-emerald-700"
      title="Email verified"
    >
      <BadgeCheck className="size-3.5" />
      Verified
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 text-xs text-amber-700"
      title="Email not verified"
    >
      <MailWarning className="size-3.5" />
      Unverified
    </span>
  );
}

export function RoleTypeBadge({ type, isProtected }: { type: RoleType; isProtected: boolean }) {
  if (isProtected) {
    return (
      <span
        className={clsx(
          pill,
          'bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 ring-indigo-200',
        )}
      >
        <Crown className="size-3" />
        Protected
      </span>
    );
  }
  return type === 'SYSTEM' ? (
    <span className={clsx(pill, 'bg-slate-100 text-slate-700 ring-slate-200')}>
      <Lock className="size-3" />
      System
    </span>
  ) : (
    <span className={clsx(pill, 'bg-white text-slate-600 ring-slate-200')}>Custom</span>
  );
}

export function TemporaryChip({ expiresAt }: { expiresAt: string }) {
  return (
    <span
      className={clsx(pill, 'bg-violet-50 text-violet-700 ring-violet-200')}
      title={`Ends ${new Date(expiresAt).toLocaleString()}`}
    >
      <Clock className="size-3" />
      Temporary
    </span>
  );
}
