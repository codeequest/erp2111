'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Loader2, Search, ShieldAlert } from 'lucide-react';
import type { RoleListItem } from '@erp/shared';
import { Modal } from '../modal';
import { btnPrimary, btnSecondary, inputClass } from '../buttons';
import { PrivilegedBadge } from '../badges';
import { roleColor } from '../role-colors';

/** Pick one or more roles (bulk assign / remove). Warns when a privileged role is chosen. */
export function RolePickerDialog({
  open,
  mode,
  count,
  roles,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  mode: 'assign' | 'remove';
  count: number;
  roles: RoleListItem[] | null;
  busy: boolean;
  onConfirm: (roleIds: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open) {
      setPicked([]);
      setQ('');
    }
  }, [open]);

  const list = useMemo(
    () => (roles ?? []).filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase())),
    [roles, q],
  );
  const privileged = (roles ?? []).filter((r) => picked.includes(r.id) && r.privileged);

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={mode === 'assign' ? 'Assign roles' : 'Remove roles'}
      description={`${mode === 'assign' ? 'Add to' : 'Remove from'} ${count} selected user${count === 1 ? '' : 's'}.`}
      footer={
        <>
          <button className={btnSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={btnPrimary}
            disabled={busy || picked.length === 0}
            onClick={() => onConfirm(picked)}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === 'assign' ? 'Assign' : 'Remove'} {picked.length || ''} role
            {picked.length === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a role"
            className={clsx(inputClass, 'pl-9')}
          />
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {list.map((r) => {
            const on = picked.includes(r.id);
            return (
              <li key={r.id}>
                <label
                  className={clsx(
                    'flex cursor-pointer items-start gap-3 rounded-lg p-2.5 ring-1 transition',
                    on ? 'bg-indigo-50/60 ring-indigo-300' : 'ring-transparent hover:bg-slate-50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setPicked((p) => (on ? p.filter((x) => x !== r.id) : [...p, r.id]))
                    }
                    className="mt-0.5 size-4 accent-indigo-600"
                  />
                  <span
                    className={clsx('mt-1.5 size-2 shrink-0 rounded-full', roleColor(r.color).dot)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      {r.name}
                      {r.privileged && <PrivilegedBadge compact />}
                    </span>
                    {r.description && (
                      <span className="block truncate text-xs text-slate-500">{r.description}</span>
                    )}
                  </span>
                  <span className="text-xs text-slate-400">{r.permissionCount} perms</span>
                </label>
              </li>
            );
          })}
        </ul>
        {mode === 'assign' && privileged.length > 0 && (
          <div className="animate-fade-in flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <ShieldAlert className="size-4 shrink-0" />
            <span>
              {privileged.map((r) => r.name).join(', ')} grant{privileged.length === 1 ? 's' : ''}{' '}
              administration rights. These users will be required to use two-step verification.
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
