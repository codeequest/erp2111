'use client';

import { Suspense, use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  AlertCircle,
  History,
  KeyRound,
  Mail,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  UserCheck,
  UserRound,
  UserX,
} from 'lucide-react';
import { isPrivileged, type UserDetail } from '@erp/shared';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { relativeTime } from '@/lib/format';
import { useUrlState } from '@/lib/use-url-state';
import { Avatar } from '@/components/admin/avatar';
import { MfaBadge, PrivilegedBadge, RoleChips, UserStatusBadge } from '@/components/admin/badges';
import { btnPrimary, btnSecondary, iconBtn } from '@/components/admin/buttons';
import { EmptyState } from '@/components/admin/empty-state';
import { ForbiddenState } from '@/components/admin/forbidden-state';
import { Menu } from '@/components/admin/menu';
import { Breadcrumbs } from '@/components/admin/page-header';
import { Skeleton } from '@/components/admin/skeleton';
import { Tabs } from '@/components/admin/tabs';
import { ActivityTab } from '@/components/admin/users/tabs/activity-tab';
import { OverviewTab } from '@/components/admin/users/tabs/overview-tab';
import { RolesTab } from '@/components/admin/users/tabs/roles-tab';
import { SecurityTab } from '@/components/admin/users/tabs/security-tab';
import { useUserActions } from '@/components/admin/users/use-user-actions';

type TabKey = 'overview' | 'roles' | 'security' | 'activity';
const DEFAULTS = { tab: 'overview' };

function UserDetailInner({ id }: { id: string }) {
  const { can, user: me } = useAuth();
  const [{ tab }, patch] = useUrlState(DEFAULTS);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [privileged, setPrivileged] = useState(false);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);

  const load = useCallback(() => {
    api<UserDetail>(`/users/${id}`)
      .then(setUser)
      .catch((e) =>
        setError({
          status: e instanceof ApiRequestError ? e.status : undefined,
          message: errorMessage(e),
        }),
      );
    api<{ code: string }[]>(`/users/${id}/effective-permissions`)
      .then((p) => setPrivileged(isPrivileged(p.map((x) => x.code))))
      .catch(() => undefined);
  }, [id]);
  useEffect(load, [load]);
  const actions = useUserActions(load);

  if (!can('admin.user.view') || error?.status === 403)
    return <ForbiddenState permission="admin.user.view" />;
  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        tone="rose"
        title={error.status === 404 ? 'User not found' : "Couldn't load this user"}
        description={error.message}
        action={
          <Link href="/admin/users" className={btnSecondary}>
            Back to users
          </Link>
        }
      />
    );
  }

  const self = me?.id === user?.id;
  const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: UserRound },
    {
      key: 'roles' as const,
      label: 'Roles & access',
      icon: KeyRound,
      count: user?.assignments.length,
    },
    { key: 'security' as const, label: 'Security', icon: ShieldCheck },
    ...(can('admin.audit.read')
      ? [{ key: 'activity' as const, label: 'Activity', icon: History }]
      : []),
  ];
  const current = (tabs.some((t) => t.key === tab) ? tab : 'overview') as TabKey;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs
        trail={[{ label: 'Users', href: '/admin/users' }, { label: user?.fullName ?? '…' }]}
      />

      <section className="animate-fade-up overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="relative h-24 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 sm:h-28">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.15)_1px,transparent_0)] [background-size:18px_18px]" />
        </div>
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:px-6">
          <div className="-mt-10 sm:-mt-12">
            {user ? (
              <div className="animate-pop rounded-full">
                <Avatar
                  id={user.id}
                  name={user.fullName}
                  size="xl"
                  muted={user.status === 'INACTIVE'}
                />
              </div>
            ) : (
              <Skeleton className="size-20 rounded-full ring-4 ring-white" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            {user ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">
                    {user.fullName}
                  </h1>
                  <UserStatusBadge status={user.displayStatus} />
                  {privileged && <PrivilegedBadge />}
                  {self && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">
                      You
                    </span>
                  )}
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="size-3.5" />
                    {user.email}
                  </span>
                  {user.jobTitle && <span>{user.jobTitle}</span>}
                  {user.department && <span>· {user.department}</span>}
                  <span>
                    · Last sign-in {user.lastLoginAt ? relativeTime(user.lastLoginAt) : 'never'}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <RoleChips roles={user.roles} max={5} />
                  <MfaBadge enabled={user.mfaEnabled} required={user.mfaRequired} />
                </div>
              </>
            ) : (
              <>
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-80" />
              </>
            )}
          </div>
          {user && (
            <div className="flex items-center gap-2">
              {can('admin.user.update') && (
                <Link href={`/admin/users/${user.id}/edit`} className={btnPrimary}>
                  <Pencil className="size-4" />
                  Edit
                </Link>
              )}
              <Menu
                label="More actions"
                triggerClassName={clsx(iconBtn, 'size-9 border border-slate-200 bg-white')}
                trigger={<MoreHorizontal className="size-4" />}
                items={[
                  ...(can('admin.user.reset_password') && user.status === 'ACTIVE'
                    ? [
                        {
                          label: 'Send password reset',
                          icon: KeyRound,
                          onSelect: () => actions.resetPassword(user),
                        },
                      ]
                    : []),
                  'separator' as const,
                  ...(user.status === 'INACTIVE'
                    ? can('admin.user.activate')
                      ? [
                          {
                            label: 'Reactivate',
                            icon: UserCheck,
                            onSelect: () => actions.activate(user),
                          },
                        ]
                      : []
                    : can('admin.user.deactivate')
                      ? [
                          {
                            label: 'Deactivate',
                            icon: UserX,
                            tone: 'danger' as const,
                            disabled: self,
                            hint: self ? "You can't deactivate yourself" : undefined,
                            onSelect: () => actions.deactivate(user),
                          },
                        ]
                      : []),
                ]}
              />
            </div>
          )}
        </div>
      </section>

      <Tabs tabs={tabs} value={current} onChange={(t) => patch({ tab: t })} />

      {!user ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : (
        <div key={current}>
          {current === 'overview' && <OverviewTab user={user} onChanged={load} />}
          {current === 'roles' && <RolesTab user={user} />}
          {current === 'security' && <SecurityTab user={user} onChanged={load} />}
          {current === 'activity' && <ActivityTab userId={user.id} />}
        </div>
      )}
      {actions.dialogs}
    </div>
  );
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <UserDetailInner id={id} />
    </Suspense>
  );
}
