'use client';

/**
 * SKELETON PAGE — catches every menu URL that has no real page yet
 * (e.g. /sales/orders). To build a screen, create its own route file,
 * e.g. src/app/(erp)/sales/orders/page.tsx; Next.js then uses it instead of this one.
 */
import Link from 'next/link';
import { notFound, usePathname } from 'next/navigation';
import clsx from 'clsx';
import { ChevronRight, Construction, Download, Lock, Plus, Search, Upload } from 'lucide-react';
import { findNavItem } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { ITEM_ICONS, MODULE_COLORS } from '@/components/icons';

import { tr } from '@/lib/i18n';
export default function ModulePlaceholderPage() {
  const pathname = usePathname();
  const { can } = useAuth();
  const match = findNavItem(pathname);
  if (!match) notFound();

  const { module, item } = match;
  const color = MODULE_COLORS[module.key];
  const Icon = ITEM_ICONS[item.key];
  const isSubPage = pathname !== item.href;

  if (!can(item.permission)) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <Lock className="mx-auto size-8 text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">{tr("Access denied")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {tr("You need the")}{' '}<code className="rounded bg-slate-100 px-1">{item.permission}</code>{' '}
          {tr("permission to open")}{' '}{tr(item.label)}{tr(". Ask an administrator.")}</p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          {tr("Back to dashboard")}</Link>
      </div>
    );
  }

  const disabledBtn =
    'inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <nav className="flex items-center gap-1 text-xs text-slate-500">
          <Link href="/dashboard" className="hover:text-slate-700">
            {tr("Home")}</Link>
          <ChevronRight className="rtl:-scale-x-100 size-3" />
          <span className={color.text}>{tr(module.label)}</span>
          <ChevronRight className="rtl:-scale-x-100 size-3" />
          <Link href={item.href} className="hover:text-slate-700">
            {tr(item.label)}
          </Link>
          {isSubPage && (
            <>
              <ChevronRight className="rtl:-scale-x-100 size-3" />
              <span>{pathname.slice(item.href.length + 1)}</span>
            </>
          )}
        </nav>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={clsx('grid size-10 place-items-center rounded-lg', color.soft)}>
              {Icon && <Icon className={clsx('size-5', color.text)} />}
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{tr(item.label)}</h1>
              <p className="text-sm text-slate-500">{tr(item.description)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled className={disabledBtn} title={tr("Not built yet")}>
              <Upload className="size-4" /> {' '}{tr("Import")}</button>
            <button disabled className={disabledBtn} title={tr("Not built yet")}>
              <Download className="size-4" /> {' '}{tr("Export")}</button>
            <button
              disabled
              title={tr("Not built yet")}
              className={clsx(
                'inline-flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white opacity-50',
                color.bg,
              )}
            >
              <Plus className="size-4" /> {' '}{tr("New")}</button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-200 p-3">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              disabled
              placeholder={tr('Search {what}…', { what: tr(item.label) })}
              className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pe-3 ps-9 text-sm"
            />
          </div>
        </div>
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-amber-50">
            <Construction className="size-6 text-amber-500" />
          </div>
          <h2 className="mt-4 font-semibold text-slate-900">{tr("This screen is not built yet")}</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            {tr("It is part of the")}{' '}{tr(module.label)} {' '}{tr("module. The route, menu entry and permission (")}<code className="rounded bg-slate-100 px-1 text-xs">{item.permission}</code>{tr(") are ready; the API endpoints are listed in the API docs.")}</p>
          <a
            href="http://localhost:4000/api/docs"
            target="_blank"
            rel="noreferrer"
            className="mt-4 text-sm font-medium text-blue-600 hover:underline"
          >
            {tr("Open API docs (Swagger)")}</a>
        </div>
      </div>
    </div>
  );
}
