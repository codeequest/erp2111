'use client';

import clsx from 'clsx';
import { X } from 'lucide-react';
import type { DisplayStatus, RoleListItem } from '@erp/shared';
import { fieldClass, inputClass } from '../buttons';
import { roleColor } from '../role-colors';

export interface UserFilterState {
  status: string[];
  roleIds: string[];
  mfa: string;
  verified: string;
  department: string;
  createdFrom: string;
  createdTo: string;
  lastLoginFrom: string;
  lastLoginTo: string;
  neverLoggedIn: string;
}

export const EMPTY_FILTERS: UserFilterState = {
  status: [],
  roleIds: [],
  mfa: '',
  verified: '',
  department: '',
  createdFrom: '',
  createdTo: '',
  lastLoginFrom: '',
  lastLoginTo: '',
  neverLoggedIn: '',
};

const STATUSES: { value: DisplayStatus; label: string; dot: string }[] = [
  { value: 'ACTIVE', label: 'Active', dot: 'bg-emerald-500' },
  { value: 'PENDING', label: 'Invited', dot: 'bg-sky-500' },
  { value: 'LOCKED', label: 'Locked', dot: 'bg-amber-500' },
  { value: 'INACTIVE', label: 'Inactive', dot: 'bg-slate-400' },
];

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="grid grid-flow-col gap-1 rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md px-2 py-1 text-xs font-medium transition',
            value === o.value
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Filter controls (used in the side panel on desktop and in a drawer on small screens). */
export function UserFilters({
  value,
  onChange,
  roles,
  departments,
}: {
  value: UserFilterState;
  onChange: (patch: Partial<UserFilterState>) => void;
  roles: RoleListItem[] | null;
  departments: string[];
}) {
  return (
    <div className="space-y-6">
      <Section title="Status">
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => {
            const on = value.status.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => onChange({ status: toggle(value.status, s.value) })}
                aria-pressed={on}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition',
                  on
                    ? 'bg-indigo-50 text-indigo-700 ring-indigo-300'
                    : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300',
                )}
              >
                <span className={clsx('size-1.5 rounded-full', s.dot)} />
                {s.label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Hidden when roles can't be listed (no admin.role.view). */}
      {(roles === null || roles.length > 0) && (
        <Section title="Roles">
          {roles === null ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : (
            <div className="max-h-48 space-y-0.5 overflow-y-auto pr-1">
              {roles.map((r) => {
                const on = value.roleIds.includes(r.id);
                return (
                  <label
                    key={r.id}
                    className={clsx(
                      'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition',
                      on ? 'bg-indigo-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onChange({ roleIds: toggle(value.roleIds, r.id) })}
                      className="size-4 accent-indigo-600"
                    />
                    <span className={clsx('size-2 rounded-full', roleColor(r.color).dot)} />
                    <span className="min-w-0 flex-1 truncate text-slate-700">{r.name}</span>
                    <span className="text-xs text-slate-400 tabular-nums">{r.userCount}</span>
                  </label>
                );
              })}
            </div>
          )}
        </Section>
      )}

      <Section title="Two-step verification">
        <Segmented
          value={value.mfa}
          onChange={(mfa) => onChange({ mfa })}
          options={[
            { value: '', label: 'Any' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </Section>

      <Section title="Email">
        <Segmented
          value={value.verified}
          onChange={(verified) => onChange({ verified })}
          options={[
            { value: '', label: 'Any' },
            { value: 'yes', label: 'Verified' },
            { value: 'no', label: 'Unverified' },
          ]}
        />
      </Section>

      <Section title="Department">
        <select
          value={value.department}
          onChange={(e) => onChange({ department: e.target.value })}
          className={clsx(fieldClass, 'w-full')}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Last login">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={value.neverLoggedIn === 'true'}
            onChange={(e) =>
              onChange({
                neverLoggedIn: e.target.checked ? 'true' : '',
                lastLoginFrom: '',
                lastLoginTo: '',
              })
            }
            className="size-4 accent-indigo-600"
          />
          Never logged in
        </label>
        {value.neverLoggedIn !== 'true' && (
          <DateRange
            from={value.lastLoginFrom}
            to={value.lastLoginTo}
            onChange={(lastLoginFrom, lastLoginTo) => onChange({ lastLoginFrom, lastLoginTo })}
          />
        )}
      </Section>

      <Section title="Created">
        <DateRange
          from={value.createdFrom}
          to={value.createdTo}
          onChange={(createdFrom, createdTo) => onChange({ createdFrom, createdTo })}
        />
      </Section>
    </div>
  );
}

function DateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input
        type="date"
        aria-label="From"
        value={from}
        max={to || undefined}
        onChange={(e) => onChange(e.target.value, to)}
        className={clsx(inputClass, 'px-2 text-xs')}
      />
      <input
        type="date"
        aria-label="To"
        value={to}
        min={from || undefined}
        onChange={(e) => onChange(from, e.target.value)}
        className={clsx(inputClass, 'px-2 text-xs')}
      />
    </div>
  );
}

/** Removable chips for every active filter. */
export function ActiveFilterChips({
  value,
  onChange,
  onClear,
  roles,
}: {
  value: UserFilterState;
  onChange: (patch: Partial<UserFilterState>) => void;
  onClear: () => void;
  roles: RoleListItem[] | null;
}) {
  const chips: { key: string; label: string; remove: () => void }[] = [];
  for (const s of value.status) {
    chips.push({
      key: `s-${s}`,
      label: STATUSES.find((x) => x.value === s)?.label ?? s,
      remove: () => onChange({ status: value.status.filter((x) => x !== s) }),
    });
  }
  for (const id of value.roleIds) {
    chips.push({
      key: `r-${id}`,
      label: `Role: ${roles?.find((r) => r.id === id)?.name ?? '…'}`,
      remove: () => onChange({ roleIds: value.roleIds.filter((x) => x !== id) }),
    });
  }
  if (value.mfa)
    chips.push({ key: 'mfa', label: `MFA ${value.mfa}`, remove: () => onChange({ mfa: '' }) });
  if (value.verified)
    chips.push({
      key: 'ver',
      label: value.verified === 'yes' ? 'Email verified' : 'Email unverified',
      remove: () => onChange({ verified: '' }),
    });
  if (value.department)
    chips.push({ key: 'dep', label: value.department, remove: () => onChange({ department: '' }) });
  if (value.neverLoggedIn === 'true')
    chips.push({
      key: 'never',
      label: 'Never logged in',
      remove: () => onChange({ neverLoggedIn: '' }),
    });
  if (value.lastLoginFrom || value.lastLoginTo)
    chips.push({
      key: 'll',
      label: `Last login ${value.lastLoginFrom || '…'} → ${value.lastLoginTo || '…'}`,
      remove: () => onChange({ lastLoginFrom: '', lastLoginTo: '' }),
    });
  if (value.createdFrom || value.createdTo)
    chips.push({
      key: 'cr',
      label: `Created ${value.createdFrom || '…'} → ${value.createdTo || '…'}`,
      remove: () => onChange({ createdFrom: '', createdTo: '' }),
    });

  if (chips.length === 0) return null;
  return (
    <div className="animate-fade-in flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span
          key={c.key}
          className="animate-scale-in inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200"
        >
          {c.label}
          <button
            onClick={c.remove}
            className="rounded-full p-0.5 hover:bg-indigo-100"
            aria-label={`Remove filter ${c.label}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <button
        onClick={onClear}
        className="ml-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        Clear all
      </button>
    </div>
  );
}

export function countFilters(v: UserFilterState): number {
  return (
    v.status.length +
    v.roleIds.length +
    (v.mfa ? 1 : 0) +
    (v.verified ? 1 : 0) +
    (v.department ? 1 : 0) +
    (v.neverLoggedIn ? 1 : 0) +
    (v.lastLoginFrom || v.lastLoginTo ? 1 : 0) +
    (v.createdFrom || v.createdTo ? 1 : 0)
  );
}
