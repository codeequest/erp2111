import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import { PERMISSION_DEFINITIONS, type PermissionCode } from '@erp/shared';
import { EmptyState } from './empty-state';
import { btnSecondary } from './buttons';

/** Shown when the user lacks the permission for a page (or the API answered 403). */
export function ForbiddenState({ permission }: { permission?: PermissionCode }) {
  const label = permission && PERMISSION_DEFINITIONS.find((p) => p.code === permission)?.label;
  return (
    <div className="mx-auto max-w-xl">
      <EmptyState
        icon={LockKeyhole}
        tone="slate"
        title="You don't have access to this page"
        description={
          label ? (
            <>
              It needs the <span className="font-medium text-slate-700">“{label}”</span> permission.
              Ask an administrator if you need it.
            </>
          ) : (
            'Ask an administrator if you need access.'
          )
        }
        action={
          <Link href="/dashboard" className={btnSecondary}>
            Back to the dashboard
          </Link>
        }
      />
    </div>
  );
}
