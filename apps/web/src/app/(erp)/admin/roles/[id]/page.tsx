'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { AlertCircle, Copy, KeyRound, Trash2, Users } from 'lucide-react';
import type { RoleDetail, RoleListItem } from '@erp/shared';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { invalidateRoles, toQuery } from '@/lib/admin-data';
import { formatDate } from '@/lib/format';
import { Avatar } from '@/components/admin/avatar';
import {
  PrivilegedBadge,
  RoleTypeBadge,
  TemporaryChip,
  UserStatusBadge,
} from '@/components/admin/badges';
import { btnDangerSoft, btnSecondary } from '@/components/admin/buttons';
import { Card } from '@/components/admin/card';
import { EmptyState } from '@/components/admin/empty-state';
import { ForbiddenState } from '@/components/admin/forbidden-state';
import { Breadcrumbs } from '@/components/admin/page-header';
import { roleColor } from '@/components/admin/role-colors';
import { Skeleton } from '@/components/admin/skeleton';
import { useToast } from '@/components/admin/toast';
import { DeleteRoleDialog } from '@/components/admin/roles/delete-role-dialog';
import { RoleForm } from '@/components/admin/roles/role-form';

export default function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [role, setRole] = useState<RoleDetail | null>(null);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);
  const [roles, setRoles] = useState<RoleListItem[] | null>(null);
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rev, setRev] = useState(0);

  const load = useCallback(() => {
    api<RoleDetail>(`/roles/${id}`)
      .then((r) => {
        setRole(r);
        setRev((x) => x + 1);
      })
      .catch((e) =>
        setError({
          status: e instanceof ApiRequestError ? e.status : undefined,
          message: errorMessage(e),
        }),
      );
  }, [id]);
  useEffect(load, [load]);

  if (!can('admin.role.view') || error?.status === 403)
    return <ForbiddenState permission="admin.role.view" />;
  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        tone="rose"
        title={error.status === 404 ? 'Role not found' : "Couldn't load this role"}
        description={error.message}
        action={
          <Link href="/admin/roles" className={btnSecondary}>
            Back to roles
          </Link>
        }
      />
    );
  }

  const c = roleColor(role?.color);
  const editable = can('admin.role.update') && !role?.isProtected;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs
        trail={[{ label: 'Roles', href: '/admin/roles' }, { label: role?.name ?? '…' }]}
      />

      <section className="animate-fade-up overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className={clsx('h-2 bg-gradient-to-r', c.stripe)} />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div
            className={clsx(
              'grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg',
              c.stripe,
            )}
          >
            <KeyRound className="size-7" />
          </div>
          <div className="min-w-0 flex-1">
            {role ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                    {role.name}
                  </h1>
                  <RoleTypeBadge type={role.type} isProtected={role.isProtected} />
                  {role.privileged && <PrivilegedBadge />}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {role.userCount} user{role.userCount === 1 ? '' : 's'} · {role.permissionCount}{' '}
                  permissions · version {role.version} · created {formatDate(role.createdAt)}
                </p>
              </>
            ) : (
              <>
                <Skeleton className="h-7 w-48" />
                <Skeleton className="mt-2 h-4 w-72" />
              </>
            )}
          </div>
          {role && (
            <div className="flex gap-2">
              {can('admin.role.create') && (
                <button
                  className={btnSecondary}
                  onClick={() => router.push(`/admin/roles/new?cloneFrom=${role.id}`)}
                >
                  <Copy className="size-4" />
                  Duplicate
                </button>
              )}
              {can('admin.role.delete') && role.type === 'CUSTOM' && (
                <button
                  className={btnDangerSoft}
                  onClick={() => {
                    setDel(true);
                    if (!roles)
                      api<{ items: RoleListItem[] }>('/roles?pageSize=100')
                        .then((p) => setRoles(p.items))
                        .catch(() => undefined);
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {!role ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <>
          <RoleForm
            key={rev}
            role={role}
            onSaved={load}
            readOnly={!editable && !role.isProtected}
          />

          <Card
            icon={Users}
            tone="sky"
            title={`People with this role · ${role.users.length}`}
            className="animate-fade-up"
          >
            {role.users.length === 0 ? (
              <p className="text-sm text-slate-500">Nobody has this role yet.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {role.users.map((u) => (
                  <li key={u.id}>
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="lift flex items-center gap-3 rounded-xl border border-slate-200 p-3"
                    >
                      <Avatar
                        id={u.id}
                        name={u.fullName}
                        size="sm"
                        muted={u.status === 'INACTIVE'}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {u.fullName}
                        </span>
                        <span className="block truncate text-xs text-slate-500">{u.email}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <UserStatusBadge status={u.status} />
                        {u.expiresAt && <TemporaryChip expiresAt={u.expiresAt} />}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <DeleteRoleDialog
        open={del}
        role={role}
        roles={roles}
        busy={busy}
        onClose={() => setDel(false)}
        onConfirm={async (reassign) => {
          setBusy(true);
          try {
            await api(`/roles/${id}${toQuery({ reassignToRoleId: reassign })}`, {
              method: 'DELETE',
            });
            invalidateRoles();
            toast.success(`${role?.name} deleted`);
            router.push('/admin/roles');
          } catch (e) {
            toast.error('Could not delete the role', errorMessage(e));
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
