'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
import {
  getDashboardSummary,
  getLowStock,
  type DashboardSummary,
  type LowStockItem,
} from '@/lib/dashboard';
import { fmtQty, listExpiringLots, type ExpiringLot } from '@/lib/inventory';
import { ExpiryBadge } from '@/components/inventory/expiry-badge';

interface Kpi {
  /** Field of the summary that holds the value, when the module is built */
  key?: keyof DashboardSummary;
  /** Where clicking the tile goes */
  href?: string;
  label: string;
  icon: LucideIcon;
  hint: string;
  permission: PermissionCode;
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
    key: 'lowStockCount',
    href: '/inventory/products?lowStock=1',
    label: 'Low-stock items',
    icon: AlertTriangle,
    hint: 'Inventory module',
    permission: 'inventory.stock.read',
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
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [lowStock, setLowStock] = useState<LowStockItem[] | null>(null);
  const [expiring, setExpiring] = useState<ExpiringLot[] | null>(null);
  const canSummary = can('dashboard.summary.view');
  const canStock = can('inventory.stock.read');

  useEffect(() => {
    if (!canSummary) return;
    getDashboardSummary()
      .then(setSummary)
      .catch(() => undefined);
    if (canStock) {
      getLowStock()
        .then(setLowStock)
        .catch(() => undefined);
      listExpiringLots(30)
        .then((l) => setExpiring(l.slice(0, 10)))
        .catch(() => undefined);
    }
  }, [canSummary, canStock]);

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
          {kpis.map((kpi) => {
            const value = kpi.key && summary ? summary[kpi.key] : null;
            const live = value !== null && value !== undefined;
            const alert = kpi.key === 'lowStockCount' && Number(value) > 0;
            const body = (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
                  <kpi.icon
                    className={clsx('size-5', alert ? 'text-amber-500' : 'text-slate-400')}
                  />
                </div>
                <p
                  className={clsx(
                    'mt-3 text-3xl font-semibold',
                    !live ? 'text-slate-300' : alert ? 'text-amber-600' : 'text-slate-900',
                  )}
                >
                  {live ? value : '—'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {live
                    ? alert
                      ? 'At or below their minimum — click to see them'
                      : 'All products above their minimum'
                    : kpi.key && !summary
                      ? 'Loading…'
                      : `Available once the ${kpi.hint} is built`}
                </p>
              </>
            );
            return live && kpi.href ? (
              <Link
                key={kpi.label}
                href={kpi.href}
                className={clsx(
                  'rounded-xl border bg-white p-5 transition hover:shadow-sm',
                  alert
                    ? 'border-amber-300 hover:border-amber-400'
                    : 'border-slate-200 hover:border-slate-300',
                )}
              >
                {body}
              </Link>
            ) : (
              <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white p-5">
                {body}
              </div>
            );
          })}
        </section>
      )}

      {expiring && expiring.length > 0 && (
        <section className="rounded-xl border border-red-200 bg-white">
          <div className="flex items-center justify-between border-b border-red-100 px-5 py-3">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <AlertTriangle className="size-4 text-red-500" /> Expiring lots
              {summary?.expiredLotsCount ? (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                  {summary.expiredLotsCount} expired
                </span>
              ) : null}
              {summary?.expiringLotsCount ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {summary.expiringLotsCount} within 30 days
                </span>
              ) : null}
            </h2>
            <Link
              href="/inventory/products?expiring=1"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              See products
            </Link>
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {expiring.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/inventory/products/${l.product.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-2.5 hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-800">{l.product.name}</span>
                  <span className="font-mono text-xs text-slate-400">lot {l.lotNumber}</span>
                  <span className="ml-auto flex items-center gap-4">
                    <span className="text-slate-600 tabular-nums">
                      {fmtQty(l.quantity)} {l.product.baseUnit.code}
                    </span>
                    <ExpiryBadge date={l.expiryDate} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lowStock && lowStock.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-white">
          <div className="flex items-center justify-between border-b border-amber-100 px-5 py-3">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <AlertTriangle className="size-4 text-amber-500" /> Low stock
            </h2>
            <Link
              href="/inventory/products?lowStock=1"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              See all
            </Link>
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {lowStock.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/inventory/products/${p.id}`}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50"
                >
                  <span className="font-mono text-xs text-slate-400">{p.sku}</span>
                  <span className="font-medium text-slate-800">{p.name}</span>
                  <span className="ml-auto text-amber-600 tabular-nums">
                    {fmtQty(p.onHand)} / {fmtQty(p.minStock)} {p.unit}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
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
