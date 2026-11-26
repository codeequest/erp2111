'use client';

import Link from 'next/link';
import type { AuditEntryDto } from '@erp/shared';
import { describeDevice, formatDateTime } from '@/lib/format';
import { Drawer } from '../modal';
import { AuditDiff, actionLabel } from './audit-timeline';
import { AuditResultBadge } from './audit-result-badge';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-900">{children ?? '—'}</dd>
    </div>
  );
}

export function targetHref(e: AuditEntryDto): string | null {
  if (!e.entityId) return null;
  if (e.entity === 'User') return `/admin/users/${e.entityId}`;
  if (e.entity === 'Role') return `/admin/roles/${e.entityId}`;
  return null;
}

export function AuditDetailDrawer({
  entry,
  onClose,
}: {
  entry: AuditEntryDto | null;
  onClose: () => void;
}) {
  const href = entry && targetHref(entry);
  return (
    <Drawer
      open={!!entry}
      onClose={onClose}
      title={entry ? actionLabel(entry.action) : ''}
      width="sm:max-w-lg"
    >
      {entry && (
        <div className="space-y-5">
          <dl className="divide-y divide-slate-100">
            <Row label="When">{formatDateTime(entry.createdAt)}</Row>
            <Row label="Result">
              <AuditResultBadge result={entry.result} />
            </Row>
            <Row label="Action">
              <code className="text-xs">{entry.action}</code>
            </Row>
            <Row label="By">
              {entry.actorId ? (
                <Link
                  href={`/admin/users/${entry.actorId}`}
                  className="font-medium text-indigo-600 hover:text-indigo-700"
                >
                  {entry.actorName ?? 'Unknown user'}
                </Link>
              ) : (
                'System / not signed in'
              )}
            </Row>
            <Row label="Target">
              {href ? (
                <Link href={href} className="font-medium text-indigo-600 hover:text-indigo-700">
                  {entry.targetLabel ?? entry.entityId}
                </Link>
              ) : (
                (entry.targetLabel ??
                `${entry.entity}${entry.entityId ? ` ${entry.entityId}` : ''}`)
              )}
            </Row>
            {entry.reason && <Row label="Reason">{entry.reason}</Row>}
            <Row label="From">
              {entry.ip ?? '—'}
              {entry.userAgent && (
                <span className="block text-xs text-slate-500">
                  {describeDevice(entry.userAgent)}
                </span>
              )}
            </Row>
          </dl>
          {(entry.before != null || entry.after != null) && (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Changes
              </h3>
              <div className="rounded-xl border border-slate-200 p-3">
                <AuditDiff before={entry.before} after={entry.after} />
              </div>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
