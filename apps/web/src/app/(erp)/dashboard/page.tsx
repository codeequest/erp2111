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
import { NAVIGATION, type LowStockSummary, type PermissionCode } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ITEM_ICONS, MODULE_COLORS, MODULE_ICONS } from '@/components/icons';

import { tr } from '@/lib/i18n';
interface Kpi {
  key?: 'lowStock';
  label: string;
  icon: LucideIcon;
  hint: string;
  permission: PermissionCode;
}

// Values come from GET /api/v1/dashboard/summary once the Dashboard module is built.
const KPIS: Kpi[] = [
  { label: tr("Sales today"), icon: TrendingUp, hint: tr("Sales module"), permission: 'sales.order.read' },
  {
    label: tr("Sales this month"),
    icon: CircleDollarSign,
    hint: tr("Sales module"),
    permission: 'sales.order.read',
  },
  {
    key: 'lowStock',
    label: tr("Low-stock items"),
    icon: AlertTriangle,
    hint: tr("Inventory module"),
    permission: 'inventory.stock.read',
  },
  {
    label: tr("Unpaid invoices"),
    icon: Receipt,
    hint: tr("Invoicing module"),
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
    label: tr("New quotation"),
    href: '/sales/quotations/new',
    icon: FileText,
    permission: 'sales.order.write',
  },
  {
    label: tr("New purchase order"),
    href: '/purchasing/orders/new',
    icon: ClipboardList,
    permission: 'purchasing.order.write',
  },
  {
    label: tr("New product"),
    href: '/inventory/products/new',
    icon: Package,
    permission: 'inventory.product.write',
  },
  {
    label: tr("Record payment"),
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

  const showLowStock = can('inventory.stock.read') && can('dashboard.summary.view');
  const [lowStock, setLowStock] = useState<LowStockSummary | null>(null);
  useEffect(() => {
    if (!showLowStock) return;
    api<LowStockSummary>('/dashboard/low-stock')
      .then(setLowStock)
      .catch(() => setLowStock(null));
  }, [showLowStock]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{tr("Welcome back,")}{' '}{firstName}</h1>
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
          {kpis.map((kpi) =>
            kpi.key === 'lowStock' && lowStock ? (
              <LowStockCard key={kpi.label} kpi={kpi} data={lowStock} />
            ) : (
              <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
                  <kpi.icon className="size-5 text-slate-400" />
                </div>
                <p className="mt-3 text-3xl font-semibold text-slate-300">—</p>
                <p className="mt-1 text-xs text-slate-400">
                  {tr("Available once the")}{' '}{kpi.hint} {' '}{tr("is built")}</p>
              </div>
            ),
          )}
        </section>
      )}

      {actions.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            {tr("Quick actions")}</h2>
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
          {tr("Modules")}</h2>
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
                    <h3 className="font-semibold text-slate-900">{tr(m.label)}</h3>
                    <p className="text-xs text-slate-500">{tr(m.description)}</p>
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
                        <span className="truncate">{tr(item.label)}</span>
                        <ArrowRight className="rtl:-scale-x-100 ms-auto size-3.5 text-slate-300 opacity-0 transition group-hover:opacity-100" />
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

function LowStockCard({ kpi, data }: { kpi: Kpi; data: LowStockSummary }) {
  const alert = data.count > 0;
  return (
    <Link
      href="/inventory/products?lowStock=1"
      className={clsx(
        'group rounded-xl border bg-white p-5 transition hover:shadow-sm',
        alert
          ? 'border-amber-200 hover:border-amber-300'
          : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
        <kpi.icon className={clsx('size-5', alert ? 'text-amber-500' : 'text-slate-400')} />
      </div>
      <p
        className={clsx('mt-3 text-3xl font-semibold', alert ? 'text-amber-600' : 'text-slate-900')}
      >
        {data.count}
      </p>
      <p className="mt-1 truncate text-xs text-slate-500">
        {alert
          ? data.items
              .slice(0, 2)
              .map((i) => i.name)
              .join(', ') + (data.count > 2 ? ` and ${data.count - 2} more` : '')
          : tr("Every product is above its minimum")}
      </p>
    </Link>
  );
}
