'use client';

/**
 * Small shared UI kit for ERP screens: buttons, fields, badges, animated numbers,
 * empty states, page headers and toasts. Inventory accent = emerald (module colour).
 */
import Link from 'next/link';
import clsx from 'clsx';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useReducedMotion,
  type HTMLMotionProps,
} from 'framer-motion';
import { CheckCircle2, ChevronRight, Loader2, XCircle, type LucideIcon } from 'lucide-react';

// ─────────────────────────────── Buttons ───────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/25 hover:shadow-md hover:shadow-emerald-600/30 hover:brightness-105',
  secondary:
    'bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm hover:ring-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50',
};

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  icon?: LucideIcon;
  loading?: boolean;
  size?: 'sm' | 'md';
  children?: React.ReactNode;
}

export function Button({
  variant = 'secondary',
  icon: Icon,
  loading,
  size = 'md',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <motion.button
      whileHover={disabled || loading ? undefined : { y: -1 }}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[box-shadow,background-color,filter] disabled:cursor-not-allowed disabled:opacity-60',
        size === 'md' ? 'px-3.5 py-2 text-sm' : 'px-2.5 py-1.5 text-xs',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className={clsx('animate-spin', size === 'md' ? 'size-4' : 'size-3.5')} />
      ) : (
        Icon && <Icon className={size === 'md' ? 'size-4' : 'size-3.5'} />
      )}
      {children}
    </motion.button>
  );
}

export function ButtonLink({
  href,
  icon: Icon,
  variant = 'secondary',
  children,
}: {
  href: string;
  icon?: LucideIcon;
  variant?: Variant;
  children: React.ReactNode;
}) {
  return (
    <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} className="inline-flex">
      <Link
        href={href}
        className={clsx(
          'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-[box-shadow,background-color,filter]',
          VARIANTS[variant],
        )}
      >
        {Icon && <Icon className="size-4" />}
        {children}
      </Link>
    </motion.div>
  );
}

// ─────────────────────────────── Fields ───────────────────────────────

export const inputClass =
  'w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500';

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <motion.div
        animate={error ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.35 }}
        className={clsx(error && '[&_input]:ring-red-300 [&_select]:ring-red-300 [&_textarea]:ring-red-300')}
      >
        {children}
      </motion.div>
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.p
            key="err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-1 text-xs text-red-600"
          >
            {error}
          </motion.p>
        ) : hint ? (
          <motion.p key="hint" initial={false} className="mt-1 text-xs text-slate-500">
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 text-left"
    >
      <span
        className={clsx(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-slate-300',
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 600, damping: 32 }}
          className={clsx(
            'absolute top-0.5 size-4 rounded-full bg-white shadow',
            checked ? 'right-0.5' : 'left-0.5',
          )}
        />
      </span>
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </button>
  );
}

// ─────────────────────────────── Display ───────────────────────────────

const BADGE_TONES = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

export function Badge({
  tone = 'slate',
  icon: Icon,
  children,
  pulse,
}: {
  tone?: keyof typeof BADGE_TONES;
  icon?: LucideIcon;
  children: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        BADGE_TONES[tone],
      )}
    >
      {pulse && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {Icon && <Icon className="size-3" />}
      {children}
    </span>
  );
}

/** Counts up from 0 the first time it scrolls into view. */
export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) return setShown(value);
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setShown,
    });
    from.current = value;
    return () => controls.stop();
  }, [inView, value, reduce]);

  return <span ref={ref}>{format(shown)}</span>;
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center px-6 py-14 text-center"
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400/30 to-teal-500/30 blur-xl" />
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 ring-1 ring-emerald-100"
        >
          <Icon className="size-7 text-emerald-600" />
        </motion.div>
      </div>
      <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

export function Card({
  title,
  icon: Icon,
  action,
  children,
  className,
  delay = 0,
}: {
  title?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className={clsx('rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80', className)}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {Icon && <Icon className="size-4 text-emerald-600" />}
            {title}
          </h2>
          {action}
        </header>
      )}
      {children}
    </motion.section>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3" />}
          {it.href ? (
            <Link href={it.href} className="hover:text-slate-800">
              {it.label}
            </Link>
          ) : (
            <span className="text-mod-inventory font-medium">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-slate-200/70', className)} />;
}

// ─────────────────────────────── Toasts ───────────────────────────────

interface Toast {
  id: number;
  tone: 'success' | 'error';
  text: string;
}
const ToastCtx = createContext<(tone: Toast['tone'], text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:right-6 sm:left-auto sm:items-end">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className={clsx(
                'pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 backdrop-blur',
                t.tone === 'success'
                  ? 'bg-white/95 text-slate-800 ring-emerald-200'
                  : 'bg-white/95 text-red-700 ring-red-200',
              )}
            >
              {t.tone === 'success' ? (
                <motion.span
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.05 }}
                >
                  <CheckCircle2 className="size-5 text-emerald-500" />
                </motion.span>
              ) : (
                <XCircle className="size-5 text-red-500" />
              )}
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
