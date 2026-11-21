'use client';

import { forwardRef } from 'react';
import clsx from 'clsx';
import { Loader2, type LucideIcon } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-600',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-red-600',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
};

const SIZES: Record<Size, string> = {
  sm: 'gap-1.5 px-2.5 py-1.5 text-xs',
  md: 'gap-2 px-3.5 py-2 text-sm',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
}

/**
 * Icon and label each sit in their own element, so browser translation (which
 * rewrites bare text nodes) cannot break React updates.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon: Icon, loading, disabled, className, children, ...rest },
  ref,
) {
  const iconClass = size === 'sm' ? 'size-3.5' : 'size-4';
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      <span className="contents">
        {loading ? (
          <Loader2 key="loading" className={clsx(iconClass, 'animate-spin')} />
        ) : Icon ? (
          <Icon key="icon" className={iconClass} />
        ) : null}
      </span>
      {children !== undefined && <span>{children}</span>}
    </button>
  );
});

/** Square icon-only button with an accessible label. */
export function IconButton({
  icon: Icon,
  label,
  className,
  tone = 'default',
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: LucideIcon;
  label: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'danger'
          ? 'text-slate-400 hover:bg-red-50 hover:text-red-600'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
        className,
      )}
      {...rest}
    >
      <Icon className="size-4" />
    </button>
  );
}
