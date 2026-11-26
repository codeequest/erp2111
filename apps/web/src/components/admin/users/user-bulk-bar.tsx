'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Download, Loader2, ShieldMinus, ShieldPlus, UserCheck, UserX, X } from 'lucide-react';
import type { BulkUserAction, BulkUserResult, RoleListItem } from '@erp/shared';
import { api, apiDownload, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ConfirmDialog } from '../confirm-dialog';
import { useToast } from '../toast';
import { RolePickerDialog } from './role-picker-dialog';

/** Floating bar shown while users are selected. */
export function UserBulkBar({
  selected,
  names,
  roles,
  onClear,
  onDone,
}: {
  selected: string[];
  /** id → name, to explain failures. */
  names: Map<string, string>;
  roles: RoleListItem[] | null;
  onClear: () => void;
  onDone: () => void;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const [dialog, setDialog] = useState<BulkUserAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const n = selected.length;

  async function run(action: BulkUserAction, extra: { roleIds?: string[]; reason?: string } = {}) {
    setBusy(true);
    try {
      const { results } = await api<BulkUserResult>('/users/bulk', {
        method: 'POST',
        body: JSON.stringify({ action, userIds: selected, ...extra }),
      });
      const updated = results.filter((r) => r.result === 'updated').length;
      const skipped = results.filter((r) => r.result === 'skipped');
      const failed = results.filter((r) => r.result === 'failed');
      const problems = [...failed, ...skipped];
      toast.show({
        tone: failed.length && !updated ? 'error' : failed.length ? 'info' : 'success',
        title: `${updated} updated${skipped.length ? ` · ${skipped.length} skipped` : ''}${failed.length ? ` · ${failed.length} failed` : ''}`,
        details: problems.length ? (
          <ul className="space-y-1">
            {problems.map((p) => (
              <li key={p.userId} className="flex gap-2">
                <span
                  className={clsx(
                    'font-medium',
                    p.result === 'failed' ? 'text-rose-700' : 'text-slate-700',
                  )}
                >
                  {names.get(p.userId) ?? 'User'}
                </span>
                <span className="text-slate-500">{p.reason}</span>
              </li>
            ))}
          </ul>
        ) : undefined,
      });
      setDialog(null);
      onClear();
      onDone();
    } catch (e) {
      toast.error('Bulk action failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white disabled:opacity-40';

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <div className="animate-toast-in pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-slate-900/95 p-1.5 pl-4 text-white shadow-2xl ring-1 shadow-slate-900/30 ring-white/10 backdrop-blur">
          <span className="mr-2 text-sm font-medium whitespace-nowrap tabular-nums">
            <span className="mr-1 inline-grid size-6 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs">
              {n}
            </span>
            selected
          </span>
          {can('admin.user.activate') && (
            <button className={btn} onClick={() => setDialog('activate')}>
              <UserCheck className="size-4" />
              <span className="hidden sm:inline">Activate</span>
            </button>
          )}
          {can('admin.user.deactivate') && (
            <button className={btn} onClick={() => setDialog('deactivate')}>
              <UserX className="size-4" />
              <span className="hidden sm:inline">Deactivate</span>
            </button>
          )}
          {can('admin.user.assign_roles') && (
            <>
              <button className={btn} onClick={() => setDialog('assignRoles')}>
                <ShieldPlus className="size-4" />
                <span className="hidden sm:inline">Assign roles</span>
              </button>
              <button className={btn} onClick={() => setDialog('removeRoles')}>
                <ShieldMinus className="size-4" />
                <span className="hidden sm:inline">Remove roles</span>
              </button>
            </>
          )}
          {can('admin.user.export') && (
            <button
              className={btn}
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  await apiDownload(`/users/export?ids=${selected.join(',')}`, 'users.csv');
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
              <span className="hidden sm:inline">Export</span>
            </button>
          )}
          <button className={clsx(btn, 'ml-1')} onClick={onClear} aria-label="Clear selection">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'activate'}
        title={`Activate ${n} user${n === 1 ? '' : 's'}?`}
        description="Users who are already active are skipped. Invited users stay invited until they accept."
        confirmLabel="Activate"
        busy={busy}
        onConfirm={() => run('activate')}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'deactivate'}
        tone="danger"
        title={`Deactivate ${n} user${n === 1 ? '' : 's'}?`}
        description="They are signed out everywhere. You and the last administrator are always skipped."
        reason={{ label: 'Reason', placeholder: 'e.g. Seasonal contracts ended' }}
        confirmLabel="Deactivate"
        busy={busy}
        onConfirm={(reason) => run('deactivate', { reason })}
        onClose={() => setDialog(null)}
      />
      <RolePickerDialog
        open={dialog === 'assignRoles' || dialog === 'removeRoles'}
        mode={dialog === 'removeRoles' ? 'remove' : 'assign'}
        count={n}
        roles={roles}
        busy={busy}
        onConfirm={(roleIds) => run(dialog!, { roleIds })}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
