'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertCircle,
  Copy,
  GitCompareArrows,
  Grid3x3,
  KeyRound,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { Page, RoleListItem } from '@erp/shared';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { invalidateRoles, toQuery } from '@/lib/admin-data';
import { relativeTime } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';
import { useUrlState } from '@/lib/use-url-state';
import { PrivilegedBadge, RoleTypeBadge } from '@/components/admin/badges';
import {
  btnPrimary,
  btnSecondary,
  fieldClass,
  iconBtn,
  inputClass,
} from '@/components/admin/buttons';
import { EmptyState } from '@/components/admin/empty-state';
import { ForbiddenState } from '@/components/admin/forbidden-state';
import { Menu } from '@/components/admin/menu';
import { PageHeader } from '@/components/admin/page-header';
import { Pagination } from '@/components/admin/pagination';
import { roleColor } from '@/components/admin/role-colors';
import { Skeleton } from '@/components/admin/skeleton';
import { useToast } from '@/components/admin/toast';
import { DeleteRoleDialog } from '@/components/admin/roles/delete-role-dialog';

const DEFAULTS = { search: '', type: '', sort: 'name', page: '1', pageSize: '25' };

function RolesPageInner() {
  const { can } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [state, patch] = useUrlState(DEFAULTS);
  const [text, setText] = useState(state.search);
  const debounced = useDebounced(text);
  const [data, setData] = useState<Page<RoleListItem> | null>(null);
  const [all, setAll] = useState<RoleListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<RoleListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (debounced !== state.search) patch({ search: debounced, page: '1' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const query = toQuery({
    search: state.search,
    type: state.type,
    sort: state.sort,
    page: state.page,
    pageSize: state.pageSize,
  });
  const load = useCallback(() => {
    setError(null);
    api<Page<RoleListItem>>(`/roles${query}`)
      .then(setData)
      .catch((e) => {
        if (e instanceof ApiRequestError && e.status === 403) setForbidden(true);
        else setError(errorMessage(e));
      });
  }, [query]);
  useEffect(() => {
    if (can('admin.role.view')) load();
  }, [load, can]);
  useEffect(() => {
    if (can('admin.role.view'))
      api<Page<RoleListItem>>('/roles?pageSize=100')
        .then((p) => setAll(p.items))
        .catch(() => undefined);
  }, [can, data]);

  if (!can('admin.role.view') || forbidden) return <ForbiddenState permission="admin.role.view" />;

  const toggleCompare = (id: string) =>
    setCompare((c) =>
      c.includes(id) ? c.filter((x) => x !== id) : c.length >= 4 ? c : [...c, id],
    );

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-24">
      <PageHeader
        icon={ShieldCheck}
        title="Roles & permissions"
        description="Bundle permissions into roles, then give people the roles they need."
        trail={[{ label: 'Roles' }]}
        actions={
          <>
            <Link href="/admin/roles/matrix" className={btnSecondary}>
              <Grid3x3 className="size-4" />
              Permission matrix
            </Link>
            {can('admin.role.create') && (
              <Link href="/admin/roles/new" className={btnPrimary}>
                <Plus className="size-4" />
                New role
              </Link>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search roles"
            className={clsx(inputClass, 'py-2.5 pl-9')}
            aria-label="Search roles"
          />
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 sm:w-72">
          {[
            ['', 'All'],
            ['SYSTEM', 'System'],
            ['CUSTOM', 'Custom'],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => patch({ type: v, page: '1' })}
              className={clsx(
                'rounded-md text-sm font-medium transition',
                state.type === v
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <select
          value={state.sort}
          onChange={(e) => patch({ sort: e.target.value })}
          className={fieldClass}
          aria-label="Sort roles"
        >
          <option value="name">Name</option>
          <option value="userCount">Most users</option>
          <option value="permissionCount">Most permissions</option>
          <option value="updatedAt">Recently changed</option>
        </select>
      </div>

      {error ? (
        <EmptyState
          icon={AlertCircle}
          tone="rose"
          title="Couldn't load roles"
          description={error}
          action={
            <button className={btnSecondary} onClick={load}>
              <RefreshCw className="size-4" />
              Try again
            </button>
          }
        />
      ) : !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : data.total === 0 ? (
        <EmptyState
          icon={SearchX}
          tone="slate"
          title="No roles match"
          description="Try another search or type."
          action={
            <button
              className={btnSecondary}
              onClick={() => {
                setText('');
                patch({ search: '', type: '' });
              }}
            >
              Clear
            </button>
          }
        />
      ) : (
        <>
          <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((r, i) => {
              const c = roleColor(r.color);
              const picked = compare.includes(r.id);
              return (
                <article
                  key={r.id}
                  style={{ '--i': Math.min(i, 12) } as React.CSSProperties}
                  onClick={() => router.push(`/admin/roles/${r.id}`)}
                  className={clsx(
                    'lift group relative cursor-pointer overflow-hidden rounded-xl border bg-white shadow-sm',
                    picked ? 'border-indigo-300 ring-2 ring-indigo-400' : 'border-slate-200/80',
                  )}
                >
                  <div className={clsx('h-1.5 bg-gradient-to-r', c.stripe)} />
                  <div className="space-y-3 p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={clsx(
                          'grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm',
                          c.stripe,
                        )}
                      >
                        <KeyRound className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate font-semibold text-slate-900 group-hover:text-indigo-700">
                          {r.name}
                        </h2>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <RoleTypeBadge type={r.type} isProtected={r.isProtected} />
                          {r.privileged && <PrivilegedBadge />}
                        </div>
                      </div>
                      <Menu
                        label={`Actions for ${r.name}`}
                        triggerClassName={iconBtn}
                        trigger={<MoreHorizontal className="size-4" />}
                        items={[
                          {
                            label: picked ? 'Remove from compare' : 'Add to compare',
                            icon: GitCompareArrows,
                            onSelect: () => toggleCompare(r.id),
                            disabled: !picked && compare.length >= 4,
                          },
                          ...(can('admin.role.create')
                            ? [
                                {
                                  label: 'Duplicate',
                                  icon: Copy,
                                  onSelect: () => router.push(`/admin/roles/new?cloneFrom=${r.id}`),
                                },
                              ]
                            : []),
                          ...(can('admin.role.delete') && r.type === 'CUSTOM'
                            ? [
                                'separator' as const,
                                {
                                  label: 'Delete',
                                  icon: Trash2,
                                  tone: 'danger' as const,
                                  onSelect: () => setToDelete(r),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </div>
                    <p className="line-clamp-2 min-h-10 text-sm text-slate-500">
                      {r.description || 'No description.'}
                    </p>
                    <div className="flex items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Users className="size-3.5" />
                        <span className="font-medium text-slate-800 tabular-nums">
                          {r.userCount}
                        </span>{' '}
                        {r.userCount === 1 ? 'user' : 'users'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="size-3.5" />
                        <span className="font-medium text-slate-800 tabular-nums">
                          {r.permissionCount}
                        </span>{' '}
                        permissions
                      </span>
                      <span className="ml-auto">{relativeTime(r.updatedAt)}</span>
                    </div>
                  </div>
                  <label
                    onClick={(e) => e.stopPropagation()}
                    className={clsx(
                      'absolute top-4 right-12 flex cursor-pointer items-center transition',
                      picked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                    title="Compare"
                  >
                    <input
                      type="checkbox"
                      checked={picked}
                      onChange={() => toggleCompare(r.id)}
                      className="size-4 accent-indigo-600"
                      aria-label={`Compare ${r.name}`}
                    />
                  </label>
                </article>
              );
            })}
          </div>
          {data.total > data.pageSize && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                noun="roles"
                onPage={(p) => patch({ page: String(p) })}
                onPageSize={(s) => patch({ pageSize: String(s), page: '1' })}
              />
            </div>
          )}
        </>
      )}

      {compare.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="animate-toast-in pointer-events-auto flex items-center gap-2 rounded-2xl bg-slate-900/95 p-1.5 pl-4 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur">
            <span className="text-sm">
              <span className="font-semibold tabular-nums">{compare.length}</span>/4 selected to
              compare
            </span>
            <button
              disabled={compare.length < 2}
              onClick={() => router.push(`/admin/roles/compare?ids=${compare.join(',')}`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              <GitCompareArrows className="size-4" />
              Compare
            </button>
            <button
              onClick={() => setCompare([])}
              className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10"
              aria-label="Clear"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <DeleteRoleDialog
        open={toDelete !== null}
        role={toDelete}
        roles={all}
        busy={deleting}
        onClose={() => setToDelete(null)}
        onConfirm={async (reassign) => {
          setDeleting(true);
          try {
            await api(`/roles/${toDelete!.id}${toQuery({ reassignToRoleId: reassign })}`, {
              method: 'DELETE',
            });
            invalidateRoles();
            toast.success(`${toDelete!.name} deleted`);
            setToDelete(null);
            load();
          } catch (e) {
            toast.error('Could not delete the role', errorMessage(e));
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
}

export default function RolesPage() {
  return (
    <Suspense>
      <RolesPageInner />
    </Suspense>
  );
}
