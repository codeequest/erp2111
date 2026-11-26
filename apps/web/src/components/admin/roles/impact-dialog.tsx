'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Loader2, Minus, Plus, ShieldAlert, Users } from 'lucide-react';
import { PERMISSION_DEFINITIONS, type RoleImpact } from '@erp/shared';
import { Avatar } from '../avatar';
import { btnPrimary, btnSecondary } from '../buttons';
import { Modal } from '../modal';

const LABEL = new Map<string, string>(PERMISSION_DEFINITIONS.map((p) => [p.code, p.label]));
const label = (c: string) => LABEL.get(c) ?? c;

/** "What will this change do?" — shown before saving a role's permissions. */
export function ImpactDialog({
  open,
  roleName,
  impact,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  roleName: string;
  impact: RoleImpact | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [ack, setAck] = useState(false);
  useEffect(() => setAck(false), [open]);
  const sensitive =
    (impact?.sensitiveAdded.length ?? 0) + (impact?.sensitiveRemoved.length ?? 0) > 0;

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={`Save changes to ${roleName}?`}
      description="Review what changes and who is affected. It applies to them on their next action."
      size="lg"
      footer={
        <>
          <button className={btnSecondary} onClick={onClose} disabled={busy}>
            Back
          </button>
          <button
            className={btnPrimary}
            onClick={onConfirm}
            disabled={busy || !impact || (sensitive && !ack)}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Save role
          </button>
        </>
      }
    >
      {!impact ? (
        <Loader2 className="mx-auto size-6 animate-spin text-indigo-500" />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <List
              title="Added"
              icon={Plus}
              tone="emerald"
              codes={impact.added}
              sensitive={impact.sensitiveAdded}
            />
            <List
              title="Removed"
              icon={Minus}
              tone="rose"
              codes={impact.removed}
              sensitive={impact.sensitiveRemoved}
            />
          </div>
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Users className="size-4 text-slate-400" />
              {impact.affectedUsers.length} affected user
              {impact.affectedUsers.length === 1 ? '' : 's'}
            </h3>
            {impact.affectedUsers.length === 0 ? (
              <p className="text-sm text-slate-500">Nobody holds this role yet.</p>
            ) : (
              <ul className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                {impact.affectedUsers.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center gap-2 rounded-full bg-slate-50 py-1 pr-3 pl-1 text-sm ring-1 ring-slate-200"
                  >
                    <Avatar id={u.id} name={u.fullName} size="sm" />
                    {u.fullName}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {sensitive && (
            <label className="animate-fade-in flex cursor-pointer gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5 size-4 accent-amber-600"
              />
              <span>
                <span className="flex items-center gap-1.5 font-medium">
                  <ShieldAlert className="size-4" />
                  This changes administration rights.
                </span>
                I understand who gains or loses sensitive access.
              </span>
            </label>
          )}
        </div>
      )}
    </Modal>
  );
}

function List({
  title,
  icon: Icon,
  tone,
  codes,
  sensitive,
}: {
  title: string;
  icon: typeof Plus;
  tone: 'emerald' | 'rose';
  codes: string[];
  sensitive: string[];
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border p-3',
        tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50/50'
          : 'border-rose-200 bg-rose-50/50',
      )}
    >
      <h3
        className={clsx(
          'mb-2 flex items-center gap-1.5 text-sm font-semibold',
          tone === 'emerald' ? 'text-emerald-800' : 'text-rose-800',
        )}
      >
        <Icon className="size-4" />
        {title} · {codes.length}
      </h3>
      {codes.length === 0 ? (
        <p className="text-xs text-slate-500">Nothing.</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
          {codes.map((c) => (
            <li key={c} className="flex items-center gap-1.5 text-slate-700">
              {sensitive.includes(c) ? (
                <ShieldAlert className="size-3 text-amber-600" />
              ) : (
                <span className="size-1 rounded-full bg-slate-400" />
              )}
              {label(c)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
