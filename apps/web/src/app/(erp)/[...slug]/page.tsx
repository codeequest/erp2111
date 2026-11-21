'use client';

/**
 * Catches every menu URL that has no page yet (e.g. /sales/orders).
 * Those modules are hidden from the menu (see ENABLED_NAV_ITEMS in @erp/shared);
 * this page only shows if someone types the address.
 */
import Link from 'next/link';
import { notFound, usePathname } from 'next/navigation';
import { Construction } from 'lucide-react';
import { findNavItem } from '@erp/shared';
import { useI18n } from '@/lib/i18n';
import { RequirePermission } from '@/components/ui/page';

export default function NotBuiltPage() {
  const pathname = usePathname();
  const { t, tx } = useI18n();
  const match = findNavItem(pathname);
  if (!match) notFound();

  return (
    <RequirePermission permission={match.item.permission}>
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-amber-50">
          <Construction className="size-6 text-amber-500" />
        </div>
        <h1 className="mt-4 font-semibold text-slate-900">
          {tx(`nav.${match.item.key}`, match.item.label)}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t('notBuilt.message')}</p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          {t('access.back')}
        </Link>
      </div>
    </RequirePermission>
  );
}
