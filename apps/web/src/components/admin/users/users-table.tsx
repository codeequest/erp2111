'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Eye, KeyRound, MoreHorizontal, Pencil, UserCheck, UserX } from 'lucide-react';
import type { UserListItem } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, relativeTime } from '@/lib/format';
import { Avatar } from '../avatar';
import { MfaBadge, RoleChips, UserStatusBadge, VerifiedBadge } from '../badges';
import { iconBtn } from '../buttons';
import { Checkbox, SortTh, TableShell, Th } from '../data-table';
import { Highlight } from '../highlight';
import { Menu, type MenuItem } from '../menu';
import { SkeletonRows, Skeleton } from '../skeleton';

export type UserSort = 'name' | 'email' | 'status' | 'lastLoginAt' | 'createdAt';

interface Actions {
  deactivate: (u: UserListItem) => void;
  activate: (u: UserListItem) => void;
  resetPassword: (u: UserListItem) => void;
}

function useRowMenu(actions: Actions) {
  const { can, user: me } = useAuth();
  const router = useRouter();
  return (u: UserListItem): (MenuItem | 'separator')[] => [
    { label: 'View', icon: Eye, onSelect: () => router.push(`/admin/users/${u.id}`) },
    ...(can('admin.user.update')
      ? [{ label: 'Edit', icon: Pencil, onSelect: () => router.push(`/admin/users/${u.id}/edit`) }]
      : []),
    ...(can('admin.user.reset_password') && u.status === 'ACTIVE'
      ? [{ label: 'Send password reset', icon: KeyRound, onSelect: () => actions.resetPassword(u) }]
      : []),
    'separator' as const,
    ...(u.status === 'INACTIVE'
      ? can('admin.user.activate')
        ? [{ label: 'Reactivate', icon: UserCheck, onSelect: () => actions.activate(u) }]
        : []
      : can('admin.user.deactivate')
        ? [
            {
              label: 'Deactivate',
              icon: UserX,
              tone: 'danger' as const,
              disabled: u.id === me?.id,
              hint: u.id === me?.id ? "You can't deactivate yourself" : undefined,
              onSelect: () => actions.deactivate(u),
            },
          ]
        : []),
  ];
}

/** Desktop table (md and up) and stacked cards (phones). */
export function UsersTable({
  rows,
  loading,
  query,
  sort,
  order,
  onSort,
  selectable,
  selected,
  onSelect,
  actions,
}: {
  rows: UserListItem[] | null;
  loading: boolean;
  query: string;
  sort: UserSort;
  order: 'asc' | 'desc';
  onSort: (s: UserSort, o: 'asc' | 'desc') => void;
  selectable: boolean;
  selected: Set<string>;
  onSelect: (ids: string[], on: boolean) => void;
  actions: Actions;
}) {
  const router = useRouter();
  const menu = useRowMenu(actions);
  const items = rows ?? [];
  const allOn = items.length > 0 && items.every((u) => selected.has(u.id));
  const someOn = items.some((u) => selected.has(u.id));
  const showSkeleton = loading && rows === null;

  return (
    <>
      {/* Desktop */}
      <TableShell className="hidden md:block" minWidth="min-w-[680px]">
        <thead>
          <tr>
            {selectable && (
              <Th className="w-10">
                <Checkbox
                  label="Select all on this page"
                  checked={allOn}
                  indeterminate={someOn}
                  onChange={(on) =>
                    onSelect(
                      items.map((u) => u.id),
                      on,
                    )
                  }
                />
              </Th>
            )}
            <SortTh label="Name" field="name" sort={sort} order={order} onSort={onSort} />
            <Th>Roles</Th>
            <SortTh label="Status" field="status" sort={sort} order={order} onSort={onSort} />
            <Th className="hidden lg:table-cell">Security</Th>
            <SortTh
              label="Last login"
              field="lastLoginAt"
              sort={sort}
              order={order}
              onSort={onSort}
            />
            <SortTh
              label="Created"
              field="createdAt"
              sort={sort}
              order={order}
              onSort={onSort}
              className="hidden 2xl:table-cell"
            />
            <Th className="w-12" />
          </tr>
        </thead>
        <tbody className={clsx('transition-opacity', loading && rows && 'opacity-60')}>
          {showSkeleton ? (
            <SkeletonRows cols={selectable ? 7 : 6} />
          ) : (
            items.map((u, i) => {
              const on = selected.has(u.id);
              return (
                <tr
                  key={u.id}
                  onClick={() => router.push(`/admin/users/${u.id}`)}
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                  className={clsx(
                    'animate-fade-up group cursor-pointer transition-colors',
                    on ? 'bg-indigo-50/60' : 'hover:bg-slate-50/80',
                  )}
                >
                  {selectable && (
                    <td className="border-b border-slate-100 px-4 py-3">
                      <Checkbox
                        label={`Select ${u.fullName}`}
                        checked={on}
                        onChange={(v) => onSelect([u.id], v)}
                      />
                    </td>
                  )}
                  <td className="border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        id={u.id}
                        name={u.fullName}
                        size="sm"
                        muted={u.status === 'INACTIVE'}
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/admin/users/${u.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate font-medium text-slate-900 group-hover:text-indigo-700"
                        >
                          <Highlight text={u.fullName} query={query} />
                        </Link>
                        <p
                          className="truncate text-xs text-slate-500"
                          title={u.jobTitle ?? undefined}
                        >
                          <Highlight text={u.email} query={query} />
                          {u.username && (
                            <span className="text-slate-400">
                              {' · @'}
                              <Highlight text={u.username} query={query} />
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="border-b border-slate-100 px-4 py-3">
                    <RoleChips roles={u.roles} />
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <UserStatusBadge status={u.displayStatus} />
                  </td>
                  <td className="hidden border-b border-slate-100 px-4 py-3 lg:table-cell">
                    <div className="flex flex-col items-start gap-1">
                      <MfaBadge enabled={u.mfaEnabled} />
                      <VerifiedBadge verified={u.emailVerified} />
                    </div>
                  </td>
                  <td
                    className="border-b border-slate-100 px-4 py-3 whitespace-nowrap text-slate-600"
                    title={u.lastLoginAt ? formatDateTime(u.lastLoginAt) : undefined}
                  >
                    {u.lastLoginAt ? (
                      relativeTime(u.lastLoginAt)
                    ) : (
                      <span className="text-slate-400">Never</span>
                    )}
                  </td>
                  <td className="hidden border-b border-slate-100 px-4 py-3 whitespace-nowrap text-slate-500 2xl:table-cell">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-3 text-right">
                    <Menu
                      label={`Actions for ${u.fullName}`}
                      triggerClassName={iconBtn}
                      trigger={<MoreHorizontal className="size-4" />}
                      items={menu(u)}
                    />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableShell>

      {/* Phones */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {showSkeleton
          ? Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex gap-3 p-4">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </li>
            ))
          : items.map((u, i) => {
              const on = selected.has(u.id);
              return (
                <li
                  key={u.id}
                  style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                  className={clsx(
                    'animate-fade-up flex gap-3 p-4 transition',
                    on && 'bg-indigo-50/60',
                  )}
                  onClick={() => router.push(`/admin/users/${u.id}`)}
                >
                  {selectable && (
                    <div className="pt-2.5">
                      <Checkbox
                        label={`Select ${u.fullName}`}
                        checked={on}
                        onChange={(v) => onSelect([u.id], v)}
                      />
                    </div>
                  )}
                  <Avatar id={u.id} name={u.fullName} muted={u.status === 'INACTIVE'} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          <Highlight text={u.fullName} query={query} />
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          <Highlight text={u.email} query={query} />
                        </p>
                      </div>
                      <Menu
                        label={`Actions for ${u.fullName}`}
                        triggerClassName={iconBtn}
                        trigger={<MoreHorizontal className="size-4" />}
                        items={menu(u)}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <UserStatusBadge status={u.displayStatus} />
                      <MfaBadge enabled={u.mfaEnabled} />
                    </div>
                    <RoleChips roles={u.roles} max={2} />
                    <p className="text-xs text-slate-400">
                      Last login {u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'never'}
                    </p>
                  </div>
                </li>
              );
            })}
      </ul>
    </>
  );
}
