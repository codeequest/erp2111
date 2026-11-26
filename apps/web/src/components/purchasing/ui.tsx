'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { CheckCircle2, FileSpreadsheet, Loader2, X, type LucideIcon } from 'lucide-react';
import type { PurchaseOrderStatus } from '@erp/shared';
import { apiDownload } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { Breadcrumbs } from '@/components/page-header';

/** Building blocks shared by the purchasing screens (amber identity). */

// ── Buttons and fields ───────────────────────────────────────────────────────

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm shadow-orange-600/20 transition hover:-translate-y-px hover:shadow-md hover:shadow-orange-600/25 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 shadow-sm transition hover:bg-red-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

export const fieldClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 disabled:bg-slate-50 disabled:text-slate-500';

export const inputClass = `w-full ${fieldClass}`;

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-4 animate-spin', className)} aria-hidden />;
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {error ? (
        <span className="animate-fade mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

/** Error banner that shakes when it (re)appears. */
export function ErrorBox({ message }: { message: string | string[] }) {
  const lines = Array.isArray(message) ? message : [message];
  return (
    <div
      role="alert"
      key={lines.join('|')}
      className="animate-shake rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {lines.length === 1 ? (
        lines[0]
      ) : (
        <ul className="list-disc space-y-0.5 pl-4">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Page header ──────────────────────────────────────────────────────────────

export function PurchasingHero({
  icon: Icon,
  title,
  subtitle,
  crumb,
  actions,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  crumb: { label: string; href?: string }[];
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="animate-rise space-y-3">
      <Breadcrumbs
        items={[
          { label: t('common.home'), href: '/dashboard' },
          { label: t('common.purchasing') },
          ...crumb,
        ]}
      />
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-orange-600 p-5 text-white shadow-lg shadow-orange-600/15 sm:p-6">
        {/* soft light blobs */}
        <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 size-56 rounded-full bg-yellow-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-white/30 backdrop-blur">
              <Icon className="size-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                  {title}
                </h1>
                {badge}
              </div>
              {subtitle && <p className="mt-0.5 text-sm text-white/85">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

/** White CTA that sits on the amber hero. */
export const heroButton =
  'inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-orange-700 shadow-sm transition hover:-translate-y-px hover:shadow-md active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60';

export const heroGhostButton =
  'inline-flex items-center gap-2 rounded-lg bg-white/15 px-3.5 py-2 text-sm font-medium text-white ring-1 ring-white/30 backdrop-blur transition hover:bg-white/25 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60';

// ── Stats ────────────────────────────────────────────────────────────────────

/** Animates a number from 0 to `value` (ease-out, ~0.8 s). */
export function useCountUp(value: number | null, decimals = 0): string {
  const { number } = useI18n();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (value === null) return;
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 800);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = origin + (value - origin) * eased;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (value === null) return '—';
  return number(shown, decimals);
}

const TONES = {
  amber: 'from-amber-400 to-orange-500 shadow-orange-500/25',
  sky: 'from-sky-400 to-blue-500 shadow-blue-500/25',
  slate: 'from-slate-400 to-slate-600 shadow-slate-500/25',
  emerald: 'from-emerald-400 to-teal-500 shadow-emerald-500/25',
} as const;

export function StatTile({
  icon: Icon,
  label,
  value,
  decimals = 0,
  tone = 'amber',
  delay = 0,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null;
  decimals?: number;
  tone?: keyof typeof TONES;
  delay?: number;
  onClick?: () => void;
}) {
  const shown = useCountUp(value, decimals);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className={clsx(
        'animate-rise flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition',
        onClick &&
          'cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-amber-500/20 active:scale-[0.99]',
      )}
    >
      <div
        className={clsx(
          'grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md',
          TONES[tone],
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-900 tabular-nums">{shown}</p>
      </div>
    </Tag>
  );
}

// ── Status ───────────────────────────────────────────────────────────────────

export const PO_STATUS_CLASS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  CONFIRMED: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  PARTIALLY_RECEIVED: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  RECEIVED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  CANCELLED: 'bg-red-50 text-red-700 ring-red-600/15',
};

export function PoStatusBadge({
  status,
  onHero,
}: {
  status: PurchaseOrderStatus;
  onHero?: boolean;
}) {
  const { t } = useI18n();
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1',
        onHero ? 'bg-white/20 text-white ring-white/40 backdrop-blur' : PO_STATUS_CLASS[status],
      )}
    >
      <span
        className={clsx(
          'size-1.5 rounded-full bg-current',
          status === 'CONFIRMED' && !onHero && 'animate-pulse',
        )}
      />
      {t(`po.status.${status}`)}
    </span>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="animate-fade flex flex-col items-center px-6 py-16 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-amber-400/20 [animation-duration:2.5s]" />
        <div className="relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100 ring-8 ring-amber-50">
          <Icon className="size-7 text-orange-600" />
        </div>
      </div>
      <h2 className="mt-5 font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="animate-fade absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'animate-pop relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        )}
      >
        <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-orange-600" />
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Celebratory confirmation shown for a moment after a successful save. */
export function SuccessBurst({ message }: { message: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center">
      <div className="animate-pop flex flex-col items-center gap-3 rounded-2xl bg-white/95 px-8 py-6 shadow-2xl ring-1 ring-emerald-500/20 backdrop-blur">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
          <CheckCircle2 className="relative size-12 text-emerald-500" />
        </div>
        <p className="text-sm font-semibold text-slate-800">{message}</p>
      </div>
    </div>
  );
}

/** Shows `SuccessBurst` for ~1.1 s, then runs `then`. */
export function useSuccess() {
  const [message, setMessage] = useState<string | null>(null);
  const celebrate = (msg: string, then?: () => void) => {
    setMessage(msg);
    setTimeout(() => {
      setMessage(null);
      then?.();
    }, 1100);
  };
  return { burst: message ? <SuccessBurst message={message} /> : null, celebrate };
}

/** Pagination footer used by the purchasing lists. */
export function Pager({
  page,
  pageSize,
  total,
  rangeKey,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  /** e.g. 'pager.suppliers' = "{from}–{to} of {total} suppliers" */
  rangeKey: MessageKey;
  onPage: (page: number) => void;
}) {
  const { t, number } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>{t(rangeKey, { from: number(from), to: number(to), total: number(total) })}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="rounded-lg px-2.5 py-1 transition hover:bg-slate-100 disabled:opacity-40"
        >
          {t('common.previous')}
        </button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="rounded-lg px-2.5 py-1 transition hover:bg-slate-100 disabled:opacity-40"
        >
          {t('common.next')}
        </button>
      </div>
    </div>
  );
}

/** Turns an API error into one message or a list of messages. */
export function errorMessages(e: unknown): string | string[] {
  const body = (e as { body?: { message?: string | string[] } })?.body;
  if (body?.message) return body.message;
  return e instanceof Error ? e.message : 'Something went wrong';
}

/**
 * "Export to Excel": downloads `path` (an API export endpoint) with the current
 * language added, so the sheet headers match the screen.
 */
export function ExportButton({
  path,
  fileName,
  className,
  onHero,
}: {
  path: string;
  fileName: string;
  className?: string;
  onHero?: boolean;
}) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const sep = path.includes('?') ? '&' : '?';
      await apiDownload(`${path}${sep}lang=${lang}`, fileName);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        title={error ?? undefined}
        className={clsx(onHero ? heroGhostButton : btnSecondary, className)}
      >
        {busy ? (
          <Spinner />
        ) : done ? (
          <CheckCircle2
            className={clsx('animate-pop size-4', onHero ? 'text-white' : 'text-emerald-600')}
          />
        ) : (
          <FileSpreadsheet className={clsx('size-4', !onHero && 'text-emerald-600')} />
        )}
        {busy ? t('common.exporting') : done ? t('common.exported') : t('common.exportExcel')}
      </button>
      {error && (
        <span className="animate-fade absolute top-full right-0 z-10 mt-1 w-max max-w-64 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 ring-1 ring-red-200">
          {error}
        </span>
      )}
    </span>
  );
}
