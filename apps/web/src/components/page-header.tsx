import Link from 'next/link';
import { ChevronRight, Lock } from 'lucide-react';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-slate-500">
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3" />}
          {c.href ? (
            <Link href={c.href} className="hover:text-slate-700">
              {c.label}
            </Link>
          ) : (
            <span className="text-slate-700">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function AccessDenied({ permission, what }: { permission: string; what: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <Lock className="mx-auto size-8 text-slate-400" />
      <h1 className="mt-3 text-lg font-semibold text-slate-900">Access denied</h1>
      <p className="mt-1 text-sm text-slate-500">
        You need the <code className="rounded bg-slate-100 px-1">{permission}</code> permission to
        open {what}. Ask an administrator.
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

export function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-500/20">
      Inactive
    </span>
  );
}
