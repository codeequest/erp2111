'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  AlertCircle,
  ArrowRight,
  Clock,
  Gauge,
  History,
  Lock,
  MailWarning,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserMinus,
  UserX,
} from 'lucide-react';
import type { SecurityOverview, SecurityPolicyDto } from '@erp/shared';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCountUp } from '@/lib/use-count-up';
import { AuditTimeline } from '@/components/admin/audit/audit-timeline';
import { btnSecondary } from '@/components/admin/buttons';
import { Card } from '@/components/admin/card';
import { EmptyState } from '@/components/admin/empty-state';
import { ForbiddenState } from '@/components/admin/forbidden-state';
import { Breadcrumbs } from '@/components/admin/page-header';
import { Skeleton } from '@/components/admin/skeleton';
import { PolicyForm } from '@/components/admin/security/policy-form';
import { RiskList } from '@/components/admin/security/risk-list';

function HeroStat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  const n = useCountUp(value, 900);
  return (
    <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur">
      <p className="text-xs text-indigo-100/80">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{n}</p>
      {sub && <p className="text-[11px] text-indigo-100/60">{sub}</p>}
    </div>
  );
}

/** 0–100: share of active users with MFA, minus penalties for privileged without MFA and locked accounts. */
function score(o: SecurityOverview): number {
  if (o.activeUsers === 0) return 100;
  const mfa = (o.activeUsers - o.withoutMfa) / o.activeUsers;
  const penalty =
    o.lists.withoutMfaPrivileged.count * 15 + o.lockedAccounts * 3 + o.overdueAccessReviews * 2;
  return Math.max(
    0,
    Math.min(100, Math.round(mfa * 100 - penalty + (o.withoutMfa === 0 ? 0 : 10))),
  );
}

export default function SecurityPage() {
  const { can } = useAuth();
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [policy, setPolicy] = useState<SecurityPolicyDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<SecurityOverview>('/security/overview')
      .then(setData)
      .catch((e) =>
        setError(e instanceof ApiRequestError && e.status === 403 ? 'forbidden' : errorMessage(e)),
      );
    api<SecurityPolicyDto>('/security/policy')
      .then(setPolicy)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (can('admin.security.view')) load();
  }, [load, can]);

  const s = data ? score(data) : 0;
  const ring = useCountUp(s, 1100);

  if (!can('admin.security.view') || error === 'forbidden')
    return <ForbiddenState permission="admin.security.view" />;
  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        tone="rose"
        title="Couldn't load the security overview"
        description={error}
        action={
          <button className={btnSecondary} onClick={load}>
            <RefreshCw className="size-4" />
            Try again
          </button>
        }
      />
    );
  }

  const L = data?.lists;
  const dormantSince = policy
    ? new Date(Date.now() - policy.dormantDays * 86_400_000).toISOString().slice(0, 10)
    : '';

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <Breadcrumbs trail={[{ label: 'Security overview' }]} />

      <section className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute -top-24 -right-24 size-80 animate-pulse rounded-full bg-fuchsia-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 size-72 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-5">
            <div className="relative size-28 shrink-0">
              <svg viewBox="0 0 36 36" className="size-28 -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="rgb(255 255 255 / 0.12)"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="url(#g)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${(ring / 100) * 97.4} 97.4`}
                />
                <defs>
                  <linearGradient id="g" x1="0" x2="1">
                    <stop offset="0%" stopColor="#a5b4fc" />
                    <stop offset="100%" stopColor="#f0abfc" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{data ? ring : '–'}</p>
                  <p className="text-[10px] tracking-wide text-indigo-200 uppercase">score</p>
                </div>
              </div>
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <Gauge className="size-6 text-indigo-300" />
                Security overview
              </h1>
              <p className="mt-1 max-w-md text-sm text-indigo-100/80">
                Who needs attention right now: missing two-step verification, locked or dormant
                accounts and overdue access reviews.
              </p>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
            {data ? (
              <>
                <HeroStat
                  label="Active users"
                  value={data.activeUsers}
                  sub={`of ${data.totalUsers}`}
                />
                <HeroStat label="Privileged" value={data.privilegedUsers} />
                <HeroStat label="Without MFA" value={data.withoutMfa} />
                <HeroStat label="Pending invites" value={data.pendingInvitations} />
              </>
            ) : (
              Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-white/10" />
              ))
            )}
          </div>
        </div>
      </section>

      {!data || !L ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            <RiskList
              key="a"
              title="Privileged without MFA"
              hint="Highest risk: admin rights protected only by a password."
              icon={ShieldAlert}
              tone="rose"
              count={L.withoutMfaPrivileged.count}
              users={L.withoutMfaPrivileged.users}
              href="/admin/users?status=ACTIVE&mfa=off"
            />,
            <RiskList
              key="b"
              title="Locked accounts"
              hint="Too many wrong passwords."
              icon={Lock}
              tone="amber"
              count={L.locked.count}
              users={L.locked.users}
              href="/admin/users?status=LOCKED"
            />,
            <RiskList
              key="c"
              title="Pending invitations"
              hint="Invited but not joined yet."
              icon={MailWarning}
              tone="sky"
              count={L.pendingInvitations.count}
              users={L.pendingInvitations.users}
              href="/admin/users?status=PENDING"
            />,
            <RiskList
              key="d"
              title="Never signed in"
              hint="Active accounts nobody has used."
              icon={UserMinus}
              tone="slate"
              count={L.neverLoggedIn.count}
              users={L.neverLoggedIn.users}
              href="/admin/users?status=ACTIVE&neverLoggedIn=true"
            />,
            <RiskList
              key="e"
              title="Dormant"
              hint={`No sign-in for ${policy?.dormantDays ?? '…'} days.`}
              icon={Clock}
              tone="violet"
              count={L.dormant.count}
              users={L.dormant.users}
              href={
                dormantSince ? `/admin/users?status=ACTIVE&lastLoginTo=${dormantSince}` : undefined
              }
            />,
            <RiskList
              key="f"
              title="Access review overdue"
              hint={`Not reviewed for ${policy?.accessReviewDays ?? '…'} days.`}
              icon={ShieldCheck}
              tone="amber"
              count={L.reviewOverdue.count}
              users={L.reviewOverdue.users}
            />,
            <RiskList
              key="g"
              title="Excessive privileges"
              hint="Many sensitive permissions, or privileged and dormant."
              icon={UserX}
              tone="rose"
              count={L.excessive.count}
              users={L.excessive.users}
            />,
          ]
            // Lists that need attention first; "all clear" ones gather at the end.
            .sort((a, b) => Number(b.props.count > 0) - Number(a.props.count > 0))
            .map((el, i) => (
              <div key={i} style={{ '--i': i } as React.CSSProperties}>
                {el}
              </div>
            ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {policy ? (
          <PolicyForm
            key={JSON.stringify(policy)}
            policy={policy}
            editable={can('admin.security.manage')}
            onSaved={(p) => {
              setPolicy(p);
              load();
            }}
          />
        ) : (
          <Skeleton className="h-80 rounded-xl" />
        )}
        <Card
          icon={History}
          tone="slate"
          title="Recent admin activity"
          className={clsx('animate-fade-up')}
          actions={
            can('admin.audit.read') && (
              <Link
                href="/admin/audit"
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                Audit log
                <ArrowRight className="size-3.5" />
              </Link>
            )
          }
        >
          {!data ? (
            <Skeleton className="h-60" />
          ) : data.recentActivity.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing yet.</p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto pr-1">
              <AuditTimeline entries={data.recentActivity} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
