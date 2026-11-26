'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Briefcase, ClipboardCheck, Loader2, Tags, UserRound } from 'lucide-react';
import type { UserDetail } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, relativeTime } from '@/lib/format';
import { btnSecondary } from '../../buttons';
import { Card } from '../../card';
import { useToast } from '../../toast';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-900">
        {value || <span className="text-slate-400">—</span>}
      </dd>
    </div>
  );
}

export function OverviewTab({ user, onChanged }: { user: UserDetail; onChanged: () => void }) {
  const { can, user: me } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const self = me?.id === user.id;
  const meta = Object.entries(user.metadata);
  const reviewAge = user.accessReviewedAt
    ? (Date.now() - new Date(user.accessReviewedAt).getTime()) / 86_400_000
    : Infinity;

  return (
    <div className="stagger grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div style={{ '--i': 0 } as React.CSSProperties}>
        <Card icon={UserRound} title="Profile" className="h-full">
          <dl className="divide-y divide-slate-100">
            <Row label="Full name" value={user.fullName} />
            <Row label="Email" value={user.email} />
            <Row label="Username" value={user.username && `@${user.username}`} />
            <Row label="Phone" value={user.phone} />
            <Row
              label="Created"
              value={
                <span title={formatDateTime(user.createdAt)}>{formatDate(user.createdAt)}</span>
              }
            />
            <Row label="Updated" value={relativeTime(user.updatedAt)} />
          </dl>
        </Card>
      </div>
      <div style={{ '--i': 1 } as React.CSSProperties}>
        <Card icon={Briefcase} tone="sky" title="Work" className="h-full">
          <dl className="divide-y divide-slate-100">
            <Row label="Department" value={user.department} />
            <Row label="Job title" value={user.jobTitle} />
            <Row label="Employee ID" value={user.employeeId} />
          </dl>
        </Card>
      </div>
      <div style={{ '--i': 2 } as React.CSSProperties}>
        <Card icon={Tags} tone="slate" title="Custom fields" className="h-full">
          {meta.length === 0 ? (
            <p className="text-sm text-slate-400">None.</p>
          ) : (
            <dl className="divide-y divide-slate-100">
              {meta.map(([k, v]) => (
                <Row key={k} label={k} value={v} />
              ))}
            </dl>
          )}
        </Card>
      </div>
      <div style={{ '--i': 3 } as React.CSSProperties}>
        <Card
          icon={ClipboardCheck}
          tone={reviewAge > 90 ? 'amber' : 'emerald'}
          title="Access review"
          description="Confirm regularly that this person still needs their access."
          className="h-full"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {user.accessReviewedAt ? (
                <>
                  <p
                    className={clsx(
                      'font-medium',
                      reviewAge > 90 ? 'text-amber-700' : 'text-slate-900',
                    )}
                  >
                    Reviewed {relativeTime(user.accessReviewedAt)}
                  </p>
                  <p className="text-xs text-slate-500">by {user.accessReviewedBy ?? 'someone'}</p>
                </>
              ) : (
                <p className="font-medium text-amber-700">Never reviewed</p>
              )}
            </div>
            {can('admin.user.update') && (
              <button
                className={btnSecondary}
                disabled={busy || self}
                title={self ? "You can't review your own access" : undefined}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/users/${user.id}/access-review`, { method: 'POST' });
                    toast.success('Access review recorded');
                    onChanged();
                  } catch (e) {
                    toast.error('Could not record the review', errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ClipboardCheck className="size-4" />
                )}
                Mark reviewed
              </button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
