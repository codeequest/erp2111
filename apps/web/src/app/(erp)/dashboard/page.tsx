'use client';

import Link from 'next/link';
import clsx from 'clsx';
import {
  ArrowRight,
  Barcode,
  FolderTree,
  Package,
  PackageX,
  Plus,
  Tag,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { VISIBLE_NAVIGATION, type ProductStats } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { formatNumber, intlLocale } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';
import { ITEM_ICONS, MODULE_COLORS, MODULE_ICONS } from '@/components/icons';

export default function DashboardPage() {
  const { user, can } = useAuth();
  const { t, tx, locale } = useI18n();
  const canRead = can('inventory.product.read');
  const canWrite = can('inventory.product.write');
  const stats = useApiQuery<ProductStats>(canRead ? '/products/stats' : null);
  const firstName = user?.fullName.split(' ')[0];

  const modules = VISIBLE_NAVIGATION.filter((m) => m.key !== 'dashboard')
    .map((m) => ({ ...m, items: m.items.filter((i) => can(i.permission)) }))
    .filter((m) => m.items.length > 0);

  const kpis: { label: string; value?: number; icon: LucideIcon; href: string; tone?: 'warn' }[] = [
    {
      label: t('dashboard.kpi.active'),
      value: stats.data?.active,
      icon: Package,
      href: '/inventory/products',
    },
    {
      label: t('dashboard.kpi.categories'),
      value: stats.data?.categories,
      icon: FolderTree,
      href: '/inventory/categories',
    },
    {
      label: t('dashboard.kpi.noBarcode'),
      value: stats.data?.withoutBarcode,
      icon: Barcode,
      href: '/inventory/products',
      tone: 'warn',
    },
    {
      label: t('dashboard.kpi.noCategory'),
      value: stats.data?.withoutCategory,
      icon: Tag,
      href: '/inventory/products?category=none',
      tone: 'warn',
    },
    {
      label: t('dashboard.kpi.inactive'),
      value: stats.data?.inactive,
      icon: PackageX,
      href: '/inventory/products',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {t('dashboard.welcome', { name: firstName ?? '' })}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {new Date().toLocaleDateString(intlLocale(locale), {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      {canRead && (
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {kpis.map((k) => (
            <Link
              key={k.label}
              href={k.href}
              className="rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-500">{k.label}</p>
                <k.icon className="size-5 shrink-0 text-slate-400" />
              </div>
              <p
                className={clsx(
                  'mt-3 text-3xl font-semibold',
                  k.value === undefined
                    ? 'text-slate-300'
                    : k.tone === 'warn' && k.value > 0
                      ? 'text-amber-600'
                      : 'text-slate-900',
                )}
              >
                {k.value === undefined ? '—' : formatNumber(k.value, locale)}
              </p>
            </Link>
          ))}
        </section>
      )}

      {canWrite && (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            {t('dashboard.quickActions')}
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/inventory/products/new"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="size-4" />
              <span>{t('products.new')}</span>
            </Link>
            <Link
              href="/inventory/products"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Upload className="size-4" />
              <span>{t('dashboard.importProducts')}</span>
            </Link>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          {t('dashboard.modules')}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => {
            const Icon = MODULE_ICONS[m.key];
            const color = MODULE_COLORS[m.key];
            return (
              <div
                key={m.key}
                className={clsx(
                  'rounded-xl border border-t-4 border-slate-200 bg-white p-5',
                  color.border,
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={clsx('grid size-10 place-items-center rounded-lg', color.soft)}>
                    <Icon className={clsx('size-5', color.text)} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      {tx(`module.${m.key}`, m.label)}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {tx(`moduleDesc.${m.key}`, m.description)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {m.items.map((item) => {
                    const ItemIcon = ITEM_ICONS[item.key];
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className="group flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      >
                        {ItemIcon && (
                          <ItemIcon className="size-4 text-slate-400 group-hover:text-slate-600" />
                        )}
                        <span className="truncate">{tx(`nav.${item.key}`, item.label)}</span>
                        <ArrowRight className="ml-auto size-3.5 text-slate-300 opacity-0 transition group-hover:opacity-100" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
