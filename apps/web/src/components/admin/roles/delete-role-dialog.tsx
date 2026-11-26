'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { RoleListItem } from '@erp/shared';
import { fieldClass } from '../buttons';
import { ConfirmDialog } from '../confirm-dialog';

/** Delete a custom role: users must be moved to another role first; typed confirmation. */
export function DeleteRoleDialog({
  open,
  role,
  roles,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  role: Pick<RoleListItem, 'id' | 'name' | 'userCount'> | null;
  roles: RoleListItem[] | null;
  busy: boolean;
  onConfirm: (reassignToRoleId?: string) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState('');
  useEffect(() => setTarget(''), [open]);
  const users = role?.userCount ?? 0;
  const options = (roles ?? []).filter((r) => r.id !== role?.id && !r.isProtected);

  return (
    <ConfirmDialog
      open={open && !!role}
      tone="danger"
      title={`Delete ${role?.name ?? ''}?`}
      description={
        users > 0
          ? `${users} user${users === 1 ? ' holds' : 's hold'} this role. Choose a role to move them to — nobody is left without access by accident.`
          : 'Nobody holds this role. This cannot be undone.'
      }
      confirmLabel={users > 0 ? 'Move users and delete' : 'Delete role'}
      typeToConfirm={role?.name}
      busy={busy}
      confirmDisabled={users > 0 && !target}
      onClose={onClose}
      onConfirm={() => onConfirm(users > 0 ? target : undefined)}
    >
      {users > 0 && (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Move users to</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={clsx(fieldClass, 'w-full')}
          >
            <option value="">Choose a role…</option>
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.privileged ? ' (privileged)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
    </ConfirmDialog>
  );
}
