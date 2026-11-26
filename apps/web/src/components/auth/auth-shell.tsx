import clsx from 'clsx';
import { KeyRound, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';

const POINTS: { icon: LucideIcon; text: string }[] = [
  { icon: ShieldCheck, text: 'Two-step verification for every privileged account' },
  { icon: KeyRound, text: 'Access granted per module and role, reviewed regularly' },
  { icon: Sparkles, text: 'Every administrative change recorded in the audit log' },
];

/** Split screen used by every public auth page: animated gradient brand panel + form card. */
export function AuthShell({
  title,
  subtitle,
  icon: Icon,
  children,
  wide = false,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        {/* Soft moving light blobs */}
        <div className="pointer-events-none absolute -top-24 -left-24 size-96 animate-pulse rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 -bottom-32 size-[28rem] animate-pulse rounded-full bg-fuchsia-500/20 blur-3xl [animation-delay:1.5s]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.06)_1px,transparent_0)] [background-size:24px_24px]" />

        <div className="relative flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 text-lg font-bold shadow-lg shadow-indigo-500/40">
            E
          </div>
          <span className="text-xl font-semibold tracking-tight">ERP</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            Run the whole trading cycle{' '}
            <span className="bg-gradient-to-r from-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">
              securely
            </span>
            , in one place.
          </h1>
          <ul className="stagger mt-8 space-y-4">
            {POINTS.map((p, i) => (
              <li
                key={p.text}
                style={{ '--i': i } as React.CSSProperties}
                className="flex items-center gap-3 text-indigo-100/90"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15 backdrop-blur">
                  <p.icon className="size-4" />
                </span>
                <span className="text-sm">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-indigo-200/60">v0.2.0 · Identity &amp; access</p>
      </aside>

      <main className="flex items-center justify-center p-5 sm:p-8">
        <div className={clsx('animate-fade-up w-full', wide ? 'max-w-lg' : 'max-w-sm')}>
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 font-bold text-white shadow-md shadow-indigo-500/30">
              E
            </div>
            <span className="text-lg font-semibold text-slate-900">ERP</span>
          </div>
          {Icon && (
            <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
              <Icon className="size-6" />
            </div>
          )}
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
          {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}

/** Small error banner for auth forms. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="animate-shake rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
    >
      {message}
    </p>
  );
}
