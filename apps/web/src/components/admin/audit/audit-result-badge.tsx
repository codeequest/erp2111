import clsx from 'clsx';
import { Ban, CheckCircle2, XCircle } from 'lucide-react';
import type { AuditResult } from '@erp/shared';

const MAP = {
  SUCCESS: {
    label: 'Success',
    icon: CheckCircle2,
    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  FAILURE: { label: 'Failure', icon: XCircle, cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  DENIED: { label: 'Denied', icon: Ban, cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
} as const;

export function AuditResultBadge({ result }: { result: AuditResult }) {
  const r = MAP[result];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        r.cls,
      )}
    >
      <r.icon className="size-3" />
      {r.label}
    </span>
  );
}
