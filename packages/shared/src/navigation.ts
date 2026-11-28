import { ErpModuleKey, PermissionCode } from './permissions';

export interface NavItem {
  /** Stable key, also used by the web app to pick an icon. */
  key: string;
  label: string;
  href: string;
  /** The user needs this permission to see the item. */
  permission: PermissionCode;
  description: string;
}

export interface NavModule {
  key: ErpModuleKey;
  label: string;
  description: string;
  items: NavItem[];
}

/**
 * The ERP menu. The web app builds the sidebar and the dashboard tiles from it,
 * hiding everything the current user has no permission for.
 */
export const NAVIGATION: NavModule[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Key figures at a glance',
    items: [
      {
        key: 'dashboard',
        label: 'Overview',
        href: '/dashboard',
        permission: 'dashboard.summary.view',
        description: 'Sales, stock and receivables at a glance',
      },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    description: 'Products, warehouses and stock',
    items: [
      {
        key: 'products',
        label: 'Products',
        href: '/inventory/products',
        permission: 'inventory.product.read',
        description: 'Product catalogue, categories and units',
      },
      {
        key: 'stock',
        label: 'Stock levels',
        href: '/inventory/stock',
        permission: 'inventory.stock.read',
        description: 'On-hand quantity per warehouse and stock ledger',
      },
      {
        key: 'adjustments',
        label: 'Adjustments',
        href: '/inventory/adjustments',
        permission: 'inventory.stock.adjust',
        description: 'Correct stock after a count, with a reason',
      },
      {
        key: 'transfers',
        label: 'Transfers',
        href: '/inventory/transfers',
        permission: 'inventory.stock.transfer',
        description: 'Move stock between warehouses',
      },
      {
        key: 'counts',
        label: 'Stock counts',
        href: '/inventory/counts',
        permission: 'inventory.stock.adjust',
        description: 'Count the goods on the shelves and fix the differences',
      },
      {
        key: 'warehouses',
        label: 'Warehouses',
        href: '/inventory/warehouses',
        permission: 'inventory.warehouse.manage',
        description: 'Shops, depots and storage locations',
      },
    ],
  },
  {
    key: 'purchasing',
    label: 'Purchasing',
    description: 'Suppliers, purchase orders and receipts',
    items: [
      {
        key: 'suppliers',
        label: 'Suppliers',
        href: '/purchasing/suppliers',
        permission: 'purchasing.supplier.read',
        description: 'Supplier directory and balances',
      },
      {
        key: 'purchase-orders',
        label: 'Purchase orders',
        href: '/purchasing/orders',
        permission: 'purchasing.order.read',
        description: 'Order goods from suppliers',
      },
      {
        key: 'receipts',
        label: 'Goods receipts',
        href: '/purchasing/receipts',
        permission: 'purchasing.order.read',
        description: 'Receive ordered goods into stock',
      },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    description: 'Customers, quotations, orders and deliveries',
    items: [
      {
        key: 'customers',
        label: 'Customers',
        href: '/sales/customers',
        permission: 'sales.customer.read',
        description: 'Customer directory and balances',
      },
      {
        key: 'quotations',
        label: 'Quotations',
        href: '/sales/quotations',
        permission: 'sales.order.read',
        description: 'Price offers sent to customers',
      },
      {
        key: 'sales-orders',
        label: 'Sales orders',
        href: '/sales/orders',
        permission: 'sales.order.read',
        description: 'Confirmed customer orders',
      },
      {
        key: 'deliveries',
        label: 'Deliveries',
        href: '/sales/deliveries',
        permission: 'sales.order.read',
        description: 'Ship goods out of stock',
      },
      {
        key: 'returns',
        label: 'Returns',
        href: '/sales/returns',
        permission: 'sales.return.create',
        description: 'Goods returned by customers',
      },
    ],
  },
  {
    key: 'invoicing',
    label: 'Invoicing',
    description: 'Invoices, bills and payments',
    items: [
      {
        key: 'invoices',
        label: 'Customer invoices',
        href: '/invoicing/invoices',
        permission: 'invoicing.invoice.read',
        description: 'Invoices and credit notes sent to customers',
      },
      {
        key: 'bills',
        label: 'Supplier bills',
        href: '/invoicing/bills',
        permission: 'invoicing.bill.read',
        description: 'Bills received from suppliers',
      },
      {
        key: 'payments',
        label: 'Payments',
        href: '/invoicing/payments',
        permission: 'invoicing.payment.read',
        description: 'Money in and money out',
      },
    ],
  },
  {
    key: 'admin',
    label: 'Administration',
    description: 'Users, roles and settings',
    items: [
      {
        key: 'users',
        label: 'Users',
        href: '/admin/users',
        permission: 'admin.users.manage',
        description: 'Staff accounts',
      },
      {
        key: 'roles',
        label: 'Roles & permissions',
        href: '/admin/roles',
        permission: 'admin.roles.manage',
        description: 'Who can do what, per module',
      },
      {
        key: 'settings',
        label: 'Settings',
        href: '/admin/settings',
        permission: 'admin.settings.manage',
        description: 'Company details, taxes, numbering',
      },
      {
        key: 'audit',
        label: 'Audit log',
        href: '/admin/audit',
        permission: 'admin.audit.read',
        description: 'History of every change',
      },
    ],
  },
];

/** Find the menu entry for a URL path (exact match or a sub-path of it). */
export function findNavItem(pathname: string): { module: NavModule; item: NavItem } | undefined {
  for (const module of NAVIGATION) {
    for (const item of module.items) {
      if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        return { module, item };
      }
    }
  }
  return undefined;
}
