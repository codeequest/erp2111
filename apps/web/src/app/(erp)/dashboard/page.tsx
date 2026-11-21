'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Package,
  Receipt,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { NAVIGATION, type PermissionCode } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { ITEM_ICONS, MODULE_COLORS, MODULE_ICONS } from '@/components/icons';
import { AnimatedNumber } from '@/components/ui';
import { formatQty } from '@/lib/format';
import { productsApi, type LowStockItem } from '@/lib/products';

interface Kpi {
  label: string;
  icon: LucideIcon;
  hint: string;
  permission: PermissionCode;
  /** Live value, when the module behind it is built. */
  live?: 'lowStock';
}

// Values come from GET /api/v1/dashboard/summary once the Dashboard module is built.
const KPIS: Kpi[] = [
  { label: 'Sales today', icon: TrendingUp, hint: 'Sales module', permission: 'sales.order.read' },
  {
    label: 'Sales this month',
    icon: CircleDollarSign,
    hint: 'Sales module',
    permission: 'sales.order.read',
  },
  {
    label: 'Low-stock items',
    icon: AlertTriangle,
    hint: 'Inventory module',
    permission: 'inventory.stock.read',
    live: 'lowStock',
  },
  {
    label: 'Unpaid invoices',
    icon: Receipt,
    hint: 'Invoicing module',
    permission: 'invoicing.invoice.read',
  },
];

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: PermissionCode;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'New quotation',
    href: '/sales/quotations/new',
    icon: FileText,
    permission: 'sales.order.write',
  },
  {
    label: 'New purchase order',
    href: '/purchasing/orders/new',
    icon: ClipboardList,
    permission: 'purchasing.order.write',
  },
  {
    label: 'New product',
    href: '/inventory/products/new',
    icon: Package,
    permission: 'inventory.product.write',
  },
  {
    label: 'Record payment',
    href: '/invoicing/payments/new',
    icon: Wallet,
    permission: 'invoicing.payment.record',
  },
];

export default function DashboardPage() {
  const { user, can } = useAuth();
  const modules = NAVIGATION.filter((m) => m.key !== 'dashboard')
    .map((m) => ({ ...m, items: m.items.filter((i) => can(i.permission)) }))
    .filter((m) => m.items.length > 0);
  const kpis = KPIS.filter((k) => can(k.permission));
  const actions = QUICK_ACTIONS.filter((a) => can(a.permission));
  const firstName = user?.fullName.split(' ')[0];
  const canStock = can('inventory.stock.read');
  const [low, setLow] = useState<{ total: number; items: LowStockItem[] } | null>(null);
  useEffect(() => {
    if (canStock) productsApi.lowStock(6).then(setLow).catch(() => undefined);
  }, [canStock]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Welcome back, {firstName}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      {kpis.length > 0 && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
                <kpi.icon className="size-5 text-slate-400" />
              </div>
              {kpi.live === 'lowStock' && low ? (
                <>
                  <p className={clsx('mt-3 text-3xl font-semibold tabular-nums', low.total ? 'text-amber-600' : 'text-emerald-600')}>
                    <AnimatedNumber value={low.total} format={(n) => String(Math.round(n))} />
                  </p>
                  <Link href="/inventory/products?low=1" className="mt-1 inline-block text-xs font-medium text-emerald-700 hover:underline">
                    {low.total ? 'See products under minimum →' : 'All products above minimum'}
                  </Link>
                </>
              ) : (
                <>
                  <p className="mt-3 text-3xl font-semibold text-slate-300">—</p>
                  <p className="mt-1 text-xs text-slate-400">Available once the {kpi.hint} is built</p>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      {low && low.items.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white"
        >
          <div className="flex items-center justify-between gap-3 border-b border-amber-100 px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle className="size-4 text-amber-500" /> Low stock — {low.total} product{low.total > 1 ? 's' : ''} under minimum
            </h2>
            <Link href="/inventory/products?low=1" className="text-xs font-medium text-amber-800 hover:underline">
              View all
            </Link>
          </div>
          <ul className="grid gap-px bg-amber-100/60 sm:grid-cols-2 lg:grid-cols-3">
            {low.items.map((it, i) => {
              const pct = Math.max(0, Math.min(100, (Number(it.onHand) / Number(it.minStock)) * 100));
              return (
                <motion.li
                  key={it.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.06 }}
                  className="bg-white"
                >
                  <Link href={`/inventory/products/${it.id}`} className="block px-5 py-3 hover:bg-amber-50/60">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium text-slate-800">{it.name}</span>
                      <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                        {formatQty(it.onHand)} / {formatQty(it.minStock)} {it.baseUnit.code}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-100">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: 0.3 + i * 0.06, duration: 0.7 }}
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                      />
                    </div>
                  </Link>
                </motion.li>
              );
            })}
          </ul>
        </motion.section>
      )}

      {actions.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Quick actions
          </h2>
          <div className="flex flex-wrap gap-3">
            {actions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                <a.icon className="size-4" />
                {a.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Modules
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
                    <h3 className="font-semibold text-slate-900">{m.label}</h3>
                    <p className="text-xs text-slate-500">{m.description}</p>
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
                        <span className="truncate">{item.label}</span>
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
