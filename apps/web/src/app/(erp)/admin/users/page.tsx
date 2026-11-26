'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  AlertCircle,
  Download,
  Filter,
  Loader2,
  Lock,
  MailPlus,
  RefreshCw,
  SearchX,
  ShieldOff,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react';
import type { Page, UserListItem, UserStats } from '@erp/shared';
import { api, apiDownload, ApiRequestError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toQuery, useRoles } from '@/lib/admin-data';
import { useDebounced } from '@/lib/use-debounced';
import { useUrlState } from '@/lib/use-url-state';
import { btnPrimary, btnSecondary, cardClass } from '@/components/admin/buttons';
import { EmptyState } from '@/components/admin/empty-state';
import { ForbiddenState } from '@/components/admin/forbidden-state';
import { Drawer } from '@/components/admin/modal';
import { PageHeader } from '@/components/admin/page-header';
import { Pagination } from '@/components/admin/pagination';
import { StatCard } from '@/components/admin/stat-card';
import { useToast } from '@/components/admin/toast';
import { UserBulkBar } from '@/components/admin/users/user-bulk-bar';
import {
  ActiveFilterChips,
  countFilters,
  EMPTY_FILTERS,
  UserFilters,
  type UserFilterState,
} from '@/components/admin/users/user-filters';
import { UsersTable, type UserSort } from '@/components/admin/users/users-table';
import { freeText, SmartSearch } from '@/components/admin/users/smart-search';
import { useUserActions } from '@/components/admin/users/use-user-actions';

const DEFAULTS = {
  search: '',
  ...EMPTY_FILTERS,
  sort: 'name',
  order: 'asc',
  page: '1',
  pageSize: '25',
};

function UsersPageInner() {
  const { can } = useAuth();
  const toast = useToast();
  const [state, patch, reset] = useUrlState(DEFAULTS);
  const [searchText, setSearchText] = useState(state.search);
  // Live search uses only the free text; typed filters (role:…) become chips on Enter.
  const debounced = useDebounced(freeText(searchText).trim(), 300);
  const [page, setPage] = useState<Page<UserListItem> | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const names = useRef(new Map<string, string>());
  const { roles } = useRoles(can('admin.user.view'));

  // Search box → URL (debounced), and back when the URL changes (Back button).
  useEffect(() => {
    if (debounced !== state.search) patch({ search: debounced, page: '1' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  // Only when the URL really differs (Back button) — never wipe a filter being typed.
  useEffect(() => {
    setSearchText((t) => (freeText(t).trim() === state.search ? t : state.search));
  }, [state.search]);

  const filters: UserFilterState = {
    status: state.status,
    roleIds: state.roleIds,
    mfa: state.mfa,
    verified: state.verified,
    department: state.department,
    createdFrom: state.createdFrom,
    createdTo: state.createdTo,
    lastLoginFrom: state.lastLoginFrom,
    lastLoginTo: state.lastLoginTo,
    neverLoggedIn: state.neverLoggedIn,
  };
  const filterQuery = toQuery({ search: state.search, ...filters });
  const listQuery = toQuery({
    search: state.search,
    ...filters,
    sort: state.sort,
    order: state.order,
    page: state.page,
    pageSize: state.pageSize,
  });

  const seq = useRef(0);
  const load = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    api<Page<UserListItem>>(`/users${listQuery}`)
      .then((p) => {
        if (id !== seq.current) return; // a newer request is on its way
        p.items.forEach((u) => names.current.set(u.id, u.fullName));
        setPage(p);
      })
      .catch((e) => {
        if (id !== seq.current) return;
        if (e instanceof ApiRequestError && e.status === 403) setForbidden(true);
        else setError(errorMessage(e));
      })
      .finally(() => id === seq.current && setLoading(false));
  }, [listQuery]);

  const loadStats = useCallback(() => {
    api<UserStats>('/users/stats')
      .then(setStats)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (can('admin.user.view')) load();
  }, [load, can]);
  useEffect(() => {
    if (!can('admin.user.view')) return;
    loadStats();
    api<string[]>('/users/departments')
      .then(setDepartments)
      .catch(() => undefined);
  }, [loadStats, can]);

  const refresh = () => {
    load();
    loadStats();
  };
  const actions = useUserActions(refresh);

  const setFilters = (p: Partial<UserFilterState>) =>
    patch({ ...p, page: '1' } as Partial<typeof DEFAULTS>);
  const nFilters = countFilters(filters);
  const quick = (s: Partial<UserFilterState>) => setFilters({ ...EMPTY_FILTERS, ...s });
  const isQuick = (status: string[], mfa = '') =>
    nFilters === status.length + (mfa ? 1 : 0) &&
    JSON.stringify(filters.status) === JSON.stringify(status) &&
    filters.mfa === mfa;

  const canBulk =
    can('admin.user.activate') ||
    can('admin.user.deactivate') ||
    can('admin.user.assign_roles') ||
    can('admin.user.export');

  const selectedIds = useMemo(() => [...selected], [selected]);

  if (!can('admin.user.view') || forbidden) return <ForbiddenState permission="admin.user.view" />;

  const filterPanel = (
    <UserFilters value={filters} onChange={setFilters} roles={roles} departments={departments} />
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-24">
      <PageHeader
        icon={UserCog}
        title="Users"
        description="Invite staff, manage their access and keep accounts secure."
        trail={[{ label: 'Users' }]}
        actions={
          <>
            {can('admin.user.export') && (
              <button
                className={btnSecondary}
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    await apiDownload(`/users/export${filterQuery}`, 'users.csv');
                  } catch (e) {
                    toast.error('Export failed', errorMessage(e));
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Export
              </button>
            )}
            {can('admin.user.create') && (
              <Link href="/admin/users/new" className={btnPrimary}>
                <MailPlus className="size-4" />
                Invite user
              </Link>
            )}
          </>
        }
      />

      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {(
          [
            {
              label: 'Total',
              value: stats?.total,
              icon: Users,
              tone: 'indigo',
              active: nFilters === 0,
              on: () => quick({}),
            },
            {
              label: 'Active',
              value: stats?.active,
              icon: UserCheck,
              tone: 'emerald',
              active: isQuick(['ACTIVE']),
              on: () => quick({ status: ['ACTIVE'] }),
            },
            {
              label: 'Invited',
              value: stats?.pending,
              icon: MailPlus,
              tone: 'sky',
              active: isQuick(['PENDING']),
              on: () => quick({ status: ['PENDING'] }),
            },
            {
              label: 'Locked',
              value: stats?.locked,
              icon: Lock,
              tone: 'amber',
              active: isQuick(['LOCKED']),
              on: () => quick({ status: ['LOCKED'] }),
            },
            {
              label: 'Without MFA',
              value: stats?.withoutMfa,
              icon: ShieldOff,
              tone: 'rose',
              active: isQuick(['ACTIVE'], 'off'),
              on: () => quick({ status: ['ACTIVE'], mfa: 'off' }),
              hint: 'Active accounts',
            },
          ] as const
        ).map((c, i) => (
          <div
            key={c.label}
            style={{ '--i': i } as React.CSSProperties}
            className={clsx(i === 4 && 'col-span-2 sm:col-span-1')}
          >
            <StatCard
              label={c.label}
              value={c.value ?? 0}
              loading={!stats}
              icon={c.icon}
              tone={c.tone}
              active={c.active}
              hint={'hint' in c ? c.hint : undefined}
              onClick={c.on}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SmartSearch
          value={searchText}
          onChange={setSearchText}
          onFilter={setFilters}
          filters={filters}
          roles={roles}
          departments={departments}
        />
        <button
          className={clsx(btnSecondary, 'relative')}
          onClick={() =>
            window.matchMedia('(min-width: 1024px)').matches
              ? setPanelOpen((o) => !o)
              : setDrawerOpen(true)
          }
          aria-expanded={panelOpen}
        >
          <Filter className="size-4" />
          Filters
          {nFilters > 0 && (
            <span className="animate-pop grid size-5 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] text-white">
              {nFilters}
            </span>
          )}
        </button>
      </div>

      <ActiveFilterChips
        value={filters}
        onChange={setFilters}
        onClear={() => reset()}
        roles={roles}
      />

      <div className="flex gap-6">
        {panelOpen && (
          <aside
            className={clsx(cardClass, 'animate-fade-up hidden h-fit w-64 shrink-0 p-4 lg:block')}
          >
            {filterPanel}
          </aside>
        )}

        <div className={clsx(cardClass, 'min-w-0 flex-1 overflow-hidden')}>
          {error ? (
            <EmptyState
              icon={AlertCircle}
              tone="rose"
              title="Couldn't load users"
              description={error}
              action={
                <button className={btnSecondary} onClick={load}>
                  <RefreshCw className="size-4" />
                  Try again
                </button>
              }
            />
          ) : page && page.total === 0 && !loading ? (
            nFilters === 0 && !state.search ? (
              <EmptyState
                icon={Users}
                title="No users yet"
                description="Invite your colleagues — they'll get an email to choose their own password."
                action={
                  can('admin.user.create') && (
                    <Link href="/admin/users/new" className={btnPrimary}>
                      <MailPlus className="size-4" />
                      Invite the first user
                    </Link>
                  )
                }
              />
            ) : (
              <EmptyState
                icon={SearchX}
                tone="slate"
                title="No users match"
                description="Try another spelling or remove some filters."
                action={
                  <button
                    className={btnSecondary}
                    onClick={() => {
                      setSearchText('');
                      reset();
                    }}
                  >
                    Clear search and filters
                  </button>
                }
              />
            )
          ) : (
            <>
              <UsersTable
                rows={page?.items ?? null}
                loading={loading}
                query={state.search}
                sort={state.sort as UserSort}
                order={state.order as 'asc' | 'desc'}
                onSort={(sort, order) => patch({ sort, order, page: '1' })}
                selectable={canBulk}
                selected={selected}
                onSelect={(ids, on) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
                    return next;
                  })
                }
                actions={actions}
              />
              {page && (
                <Pagination
                  page={page.page}
                  pageSize={page.pageSize}
                  total={page.total}
                  noun="users"
                  onPage={(p) => patch({ page: String(p) })}
                  onPageSize={(s) => patch({ pageSize: String(s), page: '1' })}
                />
              )}
            </>
          )}
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filters"
        footer={
          <>
            <button className={clsx(btnSecondary, 'flex-1')} onClick={() => reset()}>
              Clear all
            </button>
            <button className={clsx(btnPrimary, 'flex-1')} onClick={() => setDrawerOpen(false)}>
              Show {page?.total ?? ''} users
            </button>
          </>
        }
      >
        {filterPanel}
      </Drawer>

      {selected.size > 0 && (
        <UserBulkBar
          selected={selectedIds}
          names={names.current}
          roles={roles}
          onClear={() => setSelected(new Set())}
          onDone={refresh}
        />
      )}
      {actions.dialogs}
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense>
      <UsersPageInner />
    </Suspense>
  );
}
