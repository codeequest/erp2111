'use client';

import { useEffect, useState } from 'react';
import { Loader2, Minus, Plus, ShieldAlert, Users } from 'lucide-react';
import { PERMISSION_DEFINITIONS, type RoleImpact, type RoleRef } from '@erp/shared';
import { api } from '@/lib/api';
import { RoleChip } from '../badges';
import { btnPrimary, btnSecondary } from '../buttons';
import { Modal } from '../modal';

const LABEL = new Map<string, string>(PERMISSION_DEFINITIONS.map((p) => [p.code, p.label]));

export interface MatrixChange {
  role: RoleRef;
  permissions: string[];
}

/** Per-role summary of a matrix save, with who is affected (from the impact endpoint). */
export function MatrixReviewDialog({
  open,
  changes,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  changes: MatrixChange[];
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [impacts, setImpacts] = useState<Map<string, RoleImpact> | null>(null);
  const [ack, setAck] = useState(false);

  useEffect(() => {
    if (!open) return;
    setImpacts(null);
    setAck(false);
    Promise.all(
      changes.map((c) =>
        api<RoleImpact>(`/roles/${c.role.id}/impact`, {
          method: 'POST',
          body: JSON.stringify({ permissions: c.permissions }),
        }).then((i) => [c.role.id, i] as const),
      ),
    )
      .then((pairs) => setImpacts(new Map(pairs)))
      .catch(() => setImpacts(new Map()));
  }, [open, changes]);

  const sensitive = [...(impacts?.values() ?? [])].some(
    (i) => i.sensitiveAdded.length + i.sensitiveRemoved.length > 0,
  );
  const users = new Set(
    [...(impacts?.values() ?? [])].flatMap((i) => i.affectedUsers.map((u) => u.id)),
  ).size;

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={`Save changes to ${changes.length} role${changes.length === 1 ? '' : 's'}?`}
      description={
        impacts
          ? `${users} user${users === 1 ? '' : 's'} affected. Everything is saved together, or nothing is.`
          : 'Working out the impact…'
      }
      size="lg"
      footer={
        <>
          <button className={btnSecondary} onClick={onClose} disabled={busy}>
            Back
          </button>
          <button
            className={btnPrimary}
            onClick={onConfirm}
            disabled={busy || !impacts || (sensitive && !ack)}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Save all changes
          </button>
        </>
      }
    >
      {!impacts ? (
        <Loader2 className="mx-auto size-6 animate-spin text-indigo-500" />
      ) : (
        <div className="space-y-3">
          <ul className="stagger space-y-3">
            {changes.map((c, idx) => {
              const i = impacts.get(c.role.id);
              return (
                <li
                  key={c.role.id}
                  style={{ '--i': idx } as React.CSSProperties}
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <RoleChip role={c.role} size="md" />
                    {i && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Users className="size-3.5" />
                        {i.affectedUsers.length} user{i.affectedUsers.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  {i && (
                    <ul className="mt-2 space-y-0.5 text-xs">
                      {i.added.map((code) => (
                        <li key={code} className="flex items-center gap-1.5 text-emerald-700">
                          <Plus className="size-3" />
                          {LABEL.get(code) ?? code}
                          {i.sensitiveAdded.includes(code) && (
                            <ShieldAlert className="size-3 text-amber-600" />
                          )}
                        </li>
                      ))}
                      {i.removed.map((code) => (
                        <li key={code} className="flex items-center gap-1.5 text-rose-700">
                          <Minus className="size-3" />
                          {LABEL.get(code) ?? code}
                          {i.sensitiveRemoved.includes(code) && (
                            <ShieldAlert className="size-3 text-amber-600" />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {sensitive && (
            <label className="animate-fade-in flex cursor-pointer gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5 size-4 accent-amber-600"
              />
              <span>
                Some changes grant or remove administration rights. I&apos;ve checked who is
                affected.
              </span>
            </label>
          )}
        </div>
      )}
    </Modal>
  );
}
