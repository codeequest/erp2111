import {
  ArrowLeftRight,
  Boxes,
  Building2,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  type LucideIcon,
  Package,
  PackageCheck,
  Receipt,
  ReceiptText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  Undo2,
  UserCog,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react';
import type { ErpModuleKey } from '@erp/shared';

/** Icon per navigation item key (see packages/shared/src/navigation.ts). */
export const ITEM_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  products: Package,
  stock: Boxes,
  adjustments: SlidersHorizontal,
  transfers: ArrowLeftRight,
  warehouses: Warehouse,
  suppliers: Building2,
  'purchase-orders': ClipboardList,
  receipts: PackageCheck,
  customers: Users,
  quotations: FileText,
  'sales-orders': ShoppingCart,
  deliveries: Truck,
  returns: Undo2,
  invoices: Receipt,
  bills: ReceiptText,
  payments: Wallet,
  users: UserCog,
  roles: ShieldCheck,
  settings: Settings,
  audit: History,
  security: ShieldAlert,
};

export const MODULE_ICONS: Record<ErpModuleKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  inventory: Boxes,
  purchasing: ClipboardList,
  sales: ShoppingCart,
  invoicing: Receipt,
  admin: ShieldCheck,
};

/** Tailwind classes per module, using the colours defined in globals.css. */
export const MODULE_COLORS: Record<
  ErpModuleKey,
  { text: string; bg: string; soft: string; border: string }
> = {
  dashboard: {
    text: 'text-mod-dashboard',
    bg: 'bg-mod-dashboard',
    soft: 'bg-mod-dashboard/10',
    border: 'border-mod-dashboard',
  },
  inventory: {
    text: 'text-mod-inventory',
    bg: 'bg-mod-inventory',
    soft: 'bg-mod-inventory/10',
    border: 'border-mod-inventory',
  },
  purchasing: {
    text: 'text-mod-purchasing',
    bg: 'bg-mod-purchasing',
    soft: 'bg-mod-purchasing/10',
    border: 'border-mod-purchasing',
  },
  sales: {
    text: 'text-mod-sales',
    bg: 'bg-mod-sales',
    soft: 'bg-mod-sales/10',
    border: 'border-mod-sales',
  },
  invoicing: {
    text: 'text-mod-invoicing',
    bg: 'bg-mod-invoicing',
    soft: 'bg-mod-invoicing/10',
    border: 'border-mod-invoicing',
  },
  admin: {
    text: 'text-mod-admin',
    bg: 'bg-mod-admin',
    soft: 'bg-mod-admin/10',
    border: 'border-mod-admin',
  },
};
