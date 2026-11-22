'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import type { PermissionCode } from '@erp/shared';
import { useAuth } from '@/lib/auth';

/** Shows "Access denied" instead of the page when the user lacks the permission. */
export function PermissionGate({
  permission,
  children,
}: {
  permission: PermissionCode;
  children: React.ReactNode;
}) {
  const { can } = useAuth();
  if (can(permission)) return <>{children}</>;
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <Lock className="mx-auto size-8 text-slate-400" />
      <h1 className="mt-3 text-lg font-semibold text-slate-900">Access denied</h1>
      <p className="mt-1 text-sm text-slate-500">
        You need the <code className="rounded bg-slate-100 px-1">{permission}</code> permission to
        open this page. Ask an administrator.
      </p>
      <Link
        href="/dashboard"
        className="mt-5 inline-block text-sm font-medium text-blue-600 hover:underline"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
