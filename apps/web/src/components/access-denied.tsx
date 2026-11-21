import Link from 'next/link';
import { Lock } from 'lucide-react';

export function AccessDenied({ permission, what }: { permission: string; what: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-slate-100">
        <Lock className="size-6 text-slate-400" />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">Access denied</h1>
      <p className="mt-1 text-sm text-slate-500">
        You need the <code className="rounded bg-slate-100 px-1">{permission}</code> permission to{' '}
        {what}. Ask an administrator.
      </p>
      <Link
        href="/dashboard"
        className="mt-5 inline-block text-sm font-medium text-emerald-700 hover:underline"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
