'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  ArrowRight,
  Building2,
  CircleDot,
  CornerDownLeft,
  KeyRound,
  Loader2,
  MailCheck,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { DisplayStatus, Page, RoleListItem, UserListItem } from '@erp/shared';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import { Avatar } from '../avatar';
import { UserStatusBadge } from '../badges';
import { inputClass } from '../buttons';
import { Highlight } from '../highlight';
import { roleColor } from '../role-colors';
import type { UserFilterState } from './user-filters';

// ─── Typed filters ──────────────────────────────────────────────────────────

const STATUSES: { value: DisplayStatus; label: string; words: string[] }[] = [
  { value: 'ACTIVE', label: 'Active', words: ['active', 'enabled'] },
  { value: 'PENDING', label: 'Invited', words: ['invited', 'pending', 'waiting'] },
  { value: 'LOCKED', label: 'Locked', words: ['locked', 'blocked'] },
  { value: 'INACTIVE', label: 'Inactive', words: ['inactive', 'deactivated', 'disabled'] },
];

const KEYS = ['role', 'status', 'dept', 'mfa', 'verified'] as const;
type Key = (typeof KEYS)[number];
const KEY_ALIASES: Record<string, Key> = {
  role: 'role',
  roles: 'role',
  status: 'status',
  is: 'status',
  dept: 'dept',
  department: 'dept',
  mfa: 'mfa',
  '2fa': 'mfa',
  verified: 'verified',
  email: 'verified',
};

const norm = (s: string) => s.trim().toLowerCase();
/** Splits on spaces but keeps "quoted values" together: role:"sales clerk". */
const TOKEN = /(\S+?:"[^"]*"?|\S+)/g;
const unquote = (v: string) => v.replace(/^"|"$/g, '');

interface Ctx {
  roles: RoleListItem[];
  departments: string[];
}

/** Turns one `key:value` token into a filter patch, or null when it isn't a valid filter. */
function tokenToPatch(
  token: string,
  ctx: Ctx,
  current: UserFilterState,
): Partial<UserFilterState> | null {
  if (norm(token) === 'never' || norm(token) === 'never-logged-in')
    return { neverLoggedIn: 'true' };
  const m = /^([\w-]+):(.+)$/.exec(token);
  if (!m) return null;
  const key = KEY_ALIASES[norm(m[1])];
  const value = norm(unquote(m[2]));
  if (!key || !value) return null;
  if (key === 'role') {
    const r =
      ctx.roles.find((x) => norm(x.name) === value) ??
      ctx.roles.find((x) => norm(x.name).startsWith(value));
    return r ? { roleIds: [...new Set([...current.roleIds, r.id])] } : null;
  }
  if (key === 'status') {
    const s = STATUSES.find((x) => x.words.some((w) => w.startsWith(value)));
    return s ? { status: [...new Set([...current.status, s.value])] } : null;
  }
  if (key === 'dept') {
    const d =
      ctx.departments.find((x) => norm(x) === value) ??
      ctx.departments.find((x) => norm(x).startsWith(value));
    return d ? { department: d } : null;
  }
  if (key === 'mfa')
    return /^(on|yes|true|enabled)$/.test(value)
      ? { mfa: 'on' }
      : /^(off|no|false|none)$/.test(value)
        ? { mfa: 'off' }
        : null;
  if (key === 'verified')
    return /^(yes|true|on)$/.test(value)
      ? { verified: 'yes' }
      : /^(no|false|off)$/.test(value)
        ? { verified: 'no' }
        : null;
  return null;
}

/** Free text left once typed filters are removed (live search uses only this). */
export function freeText(text: string): string {
  return (text.match(TOKEN) ?? [])
    .filter((t) => !/^[\w-]+:/.test(t) && norm(t) !== 'never')
    .join(' ');
}

// ─── Suggestions ────────────────────────────────────────────────────────────

type Suggestion =
  | { kind: 'person'; user: UserListItem }
  | {
      kind: 'filter';
      group: string;
      icon: LucideIcon;
      label: string;
      hint?: string;
      dot?: string;
      patch: Partial<UserFilterState>;
    }
  | { kind: 'key'; key: Key; label: string };

const GROUP_ORDER = ['People', 'Roles', 'Departments', 'Status', 'Security', 'Filters'];

export function SmartSearch({
  value,
  onChange,
  onFilter,
  filters,
  roles,
  departments,
}: {
  /** Raw text in the box (may include typed filters). */
  value: string;
  onChange: (text: string) => void;
  /** Applies filter chips (merged into the current filters). */
  onFilter: (patch: Partial<UserFilterState>) => void;
  filters: UserFilterState;
  roles: RoleListItem[] | null;
  departments: string[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [people, setPeople] = useState<UserListItem[] | null>(null);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const ctx: Ctx = useMemo(() => ({ roles: roles ?? [], departments }), [roles, departments]);

  // The word being typed (last token) drives suggestions.
  const tokens = value.match(TOKEN) ?? [];
  const endsWithSpace = /\s$/.test(value);
  const current = endsWithSpace ? '' : (tokens[tokens.length - 1] ?? '');
  const keyMatch = /^([\w-]+):(.*)$/.exec(current);
  const typedKey = keyMatch ? KEY_ALIASES[norm(keyMatch[1])] : undefined;
  const q = norm(keyMatch ? unquote(keyMatch[2]) : current);
  const text = freeText(value).trim();
  const debounced = useDebounced(keyMatch ? '' : text, 200);

  // People come from the API (same matching as the list).
  useEffect(() => {
    if (!open || debounced.length < 2) {
      setPeople(null);
      return;
    }
    let live = true;
    setLoadingPeople(true);
    api<Page<UserListItem>>(`/users?search=${encodeURIComponent(debounced)}&pageSize=10`)
      .then((p) => live && setPeople(p.items.slice(0, 5)))
      .catch(() => live && setPeople([]))
      .finally(() => live && setLoadingPeople(false));
    return () => {
      live = false;
    };
  }, [debounced, open]);

  const suggestions: Suggestion[] = useMemo(() => {
    const out: Suggestion[] = [];
    const want = (k: Key) => !typedKey || typedKey === k;
    const matches = (s: string) => !q || norm(s).includes(q);

    if (!typedKey && !keyMatch)
      (people ?? []).forEach((u) => out.push({ kind: 'person', user: u }));

    if (want('role') && (q || typedKey)) {
      ctx.roles
        .filter((r) => matches(r.name) && !filters.roleIds.includes(r.id))
        .slice(0, 5)
        .forEach((r) =>
          out.push({
            kind: 'filter',
            group: 'Roles',
            icon: KeyRound,
            label: r.name,
            hint: `${r.userCount} user${r.userCount === 1 ? '' : 's'}`,
            dot: roleColor(r.color).dot,
            patch: { roleIds: [...filters.roleIds, r.id] },
          }),
        );
    }
    if (want('dept') && (q || typedKey)) {
      ctx.departments
        .filter((d) => matches(d) && d !== filters.department)
        .slice(0, 4)
        .forEach((d) =>
          out.push({
            kind: 'filter',
            group: 'Departments',
            icon: Building2,
            label: d,
            patch: { department: d },
          }),
        );
    }
    if (want('status') && (q || typedKey)) {
      STATUSES.filter(
        (s) =>
          (!q || s.words.some((w) => w.includes(q)) || norm(s.label).includes(q)) &&
          !filters.status.includes(s.value),
      ).forEach((s) =>
        out.push({
          kind: 'filter',
          group: 'Status',
          icon: CircleDot,
          label: s.label,
          patch: { status: [...filters.status, s.value] },
        }),
      );
    }
    if (want('mfa') && (typedKey === 'mfa' || /^(mfa|2fa|two|no mfa|without)/.test(q))) {
      if (filters.mfa !== 'off')
        out.push({
          kind: 'filter',
          group: 'Security',
          icon: ShieldCheck,
          label: 'Without two-step verification',
          patch: { mfa: 'off' },
        });
      if (filters.mfa !== 'on')
        out.push({
          kind: 'filter',
          group: 'Security',
          icon: ShieldCheck,
          label: 'With two-step verification',
          patch: { mfa: 'on' },
        });
    }
    if (want('verified') && (typedKey === 'verified' || /^(verif|unverif)/.test(q))) {
      out.push({
        kind: 'filter',
        group: 'Security',
        icon: MailCheck,
        label: 'Email not verified',
        patch: { verified: 'no' },
      });
      out.push({
        kind: 'filter',
        group: 'Security',
        icon: MailCheck,
        label: 'Email verified',
        patch: { verified: 'yes' },
      });
    }
    if (!typedKey && /^nev/.test(q) && filters.neverLoggedIn !== 'true') {
      out.push({
        kind: 'filter',
        group: 'Security',
        icon: UserRound,
        label: 'Never signed in',
        patch: { neverLoggedIn: 'true' },
      });
    }
    // Typing "ro", "sta"… offers the filter keyword itself.
    if (!keyMatch && q) {
      KEYS.filter((k) => k.startsWith(q) && k !== q).forEach((k) =>
        out.push({ kind: 'key', key: k, label: `${k}:` }),
      );
    }
    return out;
  }, [people, ctx, q, typedKey, keyMatch, filters]);

  useEffect(() => setActive(0), [value, people]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  /** Removes the token being typed from the text. */
  const withoutCurrent = () =>
    (endsWithSpace || !current ? value : value.slice(0, value.length - current.length)).replace(
      /\s+$/,
      '',
    );

  function choose(s: Suggestion) {
    if (s.kind === 'person') {
      setOpen(false);
      router.push(`/admin/users/${s.user.id}`);
      return;
    }
    if (s.kind === 'key') {
      onChange(`${withoutCurrent()}${withoutCurrent() ? ' ' : ''}${s.key}:`);
      inputRef.current?.focus();
      return;
    }
    // A filter replaces the word that produced it.
    onFilter(s.patch);
    const rest = withoutCurrent();
    onChange(rest ? `${rest} ` : '');
    inputRef.current?.focus();
  }

  /** Enter without a highlighted suggestion: apply every typed filter, keep the free text. */
  function applyTyped() {
    let patch: Partial<UserFilterState> = {};
    const kept: string[] = [];
    let merged = { ...filters };
    for (const t of tokens) {
      const p = tokenToPatch(t, ctx, merged);
      if (p) {
        patch = { ...patch, ...p };
        merged = { ...merged, ...p };
      } else kept.push(t);
    }
    if (Object.keys(patch).length) onFilter(patch);
    onChange(kept.join(' '));
    setOpen(false);
  }

  const grouped = useMemo(() => {
    const groups = new Map<string, { s: Suggestion; i: number }[]>();
    suggestions.forEach((s, i) => {
      const g = s.kind === 'person' ? 'People' : s.kind === 'key' ? 'Filters' : s.group;
      groups.set(g, [...(groups.get(g) ?? []), { s, i }]);
    });
    return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => [g, groups.get(g)!] as const);
  }, [suggestions]);

  const showPanel = open;

  return (
    <div ref={boxRef} className="relative flex-1">
      <Sparkles className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-indigo-400" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, Math.max(0, suggestions.length - 1)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const hasTyped = tokens.some((t) => tokenToPatch(t, ctx, filters));
            if (open && suggestions[active] && !hasTyped && (q.length > 0 || typedKey))
              choose(suggestions[active]);
            else applyTyped();
          } else if (e.key === 'Escape') {
            setOpen(false);
          } else if (e.key === 'Tab' && open && suggestions[active]?.kind === 'key') {
            e.preventDefault();
            choose(suggestions[active]);
          }
        }}
        placeholder="Smart search: a name, a role, a department… or role:admin status:locked"
        className={clsx(
          inputClass,
          'py-2.5 pr-9 pl-9 transition-shadow',
          open && 'ring-2 ring-indigo-500/20',
        )}
        aria-label="Smart search users"
        role="combobox"
        aria-expanded={open}
        aria-controls="smart-search-list"
        aria-autocomplete="list"
        autoComplete="off"
      />
      {value && (
        <button
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}

      {showPanel && (
        <div
          id="smart-search-list"
          role="listbox"
          className="animate-scale-in absolute inset-x-0 top-full z-40 mt-2 origin-top overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-slate-900/10"
        >
          <div className="max-h-[22rem] overflow-y-auto p-1.5">
            {grouped.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-500">
                {loadingPeople ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin text-indigo-500" />
                    Looking…
                  </span>
                ) : value.trim() ? (
                  <>
                    Press <Kbd>Enter</Kbd> to search for “{text || value.trim()}”.
                  </>
                ) : (
                  'Type a name, email, role, department or status.'
                )}
              </div>
            ) : (
              grouped.map(([group, items]) => (
                <section key={group} className="py-1">
                  <h3 className="flex items-center gap-2 px-2.5 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                    {group}
                    {group === 'People' && loadingPeople && (
                      <Loader2 className="size-3 animate-spin" />
                    )}
                  </h3>
                  {items.map(({ s, i }) => (
                    <button
                      key={i}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(s)}
                      className={clsx(
                        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                        i === active
                          ? 'bg-indigo-50 text-indigo-900'
                          : 'text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      {s.kind === 'person' ? (
                        <>
                          <Avatar
                            id={s.user.id}
                            name={s.user.fullName}
                            size="sm"
                            muted={s.user.status === 'INACTIVE'}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              <Highlight text={s.user.fullName} query={text} />
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              <Highlight text={s.user.email} query={text} />
                            </span>
                          </span>
                          <UserStatusBadge status={s.user.displayStatus} />
                          <ArrowRight
                            className={clsx(
                              'size-4 shrink-0 transition',
                              i === active ? 'text-indigo-500' : 'text-transparent',
                            )}
                          />
                        </>
                      ) : s.kind === 'key' ? (
                        <>
                          <span className="grid size-8 place-items-center rounded-lg bg-slate-100 font-mono text-xs text-slate-600">
                            {s.key.slice(0, 2)}:
                          </span>
                          <span className="flex-1 font-mono text-sm">{s.label}</span>
                          <span className="text-xs text-slate-400">
                            <Kbd>Tab</Kbd>
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-50 to-violet-100 text-indigo-600">
                            {s.dot ? (
                              <span className={clsx('size-2.5 rounded-full', s.dot)} />
                            ) : (
                              <s.icon className="size-4" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              <Highlight text={s.label} query={q} />
                            </span>
                            {s.hint && (
                              <span className="block text-xs text-slate-500">{s.hint}</span>
                            )}
                          </span>
                          <span
                            className={clsx(
                              'text-xs font-medium transition',
                              i === active ? 'text-indigo-600' : 'text-slate-400',
                            )}
                          >
                            Filter
                          </span>
                        </>
                      )}
                    </button>
                  ))}
                </section>
              ))
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <Search className="size-3" />
              Try
            </span>
            {['role:', 'status:locked', 'dept:', 'mfa:off', 'never'].map((t) => (
              <button
                key={t}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(`${value.replace(/\s+$/, '')}${value.trim() ? ' ' : ''}${t}`);
                  inputRef.current?.focus();
                }}
                className="rounded bg-white px-1.5 py-0.5 font-mono text-slate-600 ring-1 ring-slate-200 hover:text-indigo-700 hover:ring-indigo-300"
              >
                {t}
              </button>
            ))}
            <span className="ml-auto hidden items-center gap-1 sm:flex">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> to move ·{' '}
              <Kbd>
                <CornerDownLeft className="inline size-2.5" />
              </Kbd>{' '}
              to pick · <Kbd>Esc</Kbd> to close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-slate-200 bg-white px-1 py-px font-sans text-[10px] font-medium text-slate-500 shadow-sm">
      {children}
    </kbd>
  );
}
