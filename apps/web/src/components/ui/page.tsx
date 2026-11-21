'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { ChevronRight, Lock } from 'lucide-react';
import { findNavItem, type PermissionCode } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { ITEM_ICONS, MODULE_COLORS } from '@/components/icons';

interface PageHeaderProps {
  /** Menu path of the page (e.g. /admin/users) — gives breadcrumb, icon and colour. */
  href: string;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  /** Extra breadcrumb level, e.g. the name of the record being edited. */
  crumb?: string;
}

export function PageHeader({ href, title, description, actions, crumb }: PageHeaderProps) {
  const { t, tx } = useI18n();
  const match = findNavItem(href);
  const color = match ? MODULE_COLORS[match.module.key] : MODULE_COLORS.admin;
  const Icon = match ? ITEM_ICONS[match.item.key] : undefined;
  const itemLabel = match ? tx(`nav.${match.item.key}`, match.item.label) : '';

  return (
    <div>
      <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <Link href="/dashboard" className="hover:text-slate-700">
          {t('common.home')}
        </Link>
        {match && (
          <>
            <ChevronRight className="size-3" />
            <span className={color.text}>
              {tx(`module.${match.module.key}`, match.module.label)}
            </span>
            <ChevronRight className="size-3" />
            <Link href={match.item.href} className="hover:text-slate-700">
              {itemLabel}
            </Link>
          </>
        )}
        {crumb && (
          <>
            <ChevronRight className="size-3" />
            <span className="truncate">{crumb}</span>
          </>
        )}
      </nav>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <div
              className={clsx('grid size-10 shrink-0 place-items-center rounded-lg', color.soft)}
            >
              <Icon className={clsx('size-5', color.text)} />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-slate-900">{title ?? itemLabel}</h1>
            {(description ?? match) && (
              <p className="text-sm text-slate-500">
                {description ??
                  (match ? tx(`navDesc.${match.item.key}`, match.item.description) : '')}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Renders children only if the user has the permission; otherwise an "access denied" card. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionCode;
  children: React.ReactNode;
}) {
  const { can } = useAuth();
  const { t } = useI18n();
  if (can(permission)) return <>{children}</>;
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <Lock className="mx-auto size-8 text-slate-400" />
      <h1 className="mt-3 text-lg font-semibold text-slate-900">{t('access.title')}</h1>
      <p className="mt-1 text-sm text-slate-500">{t('access.message')}</p>
      <code className="mt-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs">
        {permission}
      </code>
      <div>
        <Link
          href="/dashboard"
          className="mt-5 inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          {t('access.back')}
        </Link>
      </div>
    </div>
  );
}

const BADGE_TONES = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

export function Badge({
  tone = 'gray',
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-transparent ring-inset',
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** White card with an optional title, for forms and detail pages. */
export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('rounded-xl border border-slate-200 bg-white', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            {title && <h2 className="font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
