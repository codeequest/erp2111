import { ALL_PERMISSIONS, PermissionCode } from './permissions';

export interface DefaultRole {
  name: string;
  description: string;
  /** System roles cannot be deleted from the admin UI. */
  isSystem: boolean;
  permissions: PermissionCode[];
}

/**
 * Roles created by the database seed. The admin can edit them (except Admin)
 * and create new ones from the UI.
 */
export const DEFAULT_ROLES: DefaultRole[] = [
  {
    name: 'Admin',
    description: 'Full access to every module and to administration',
    isSystem: true,
    permissions: ALL_PERMISSIONS,
  },
  {
    name: 'Sales clerk',
    description: 'Customers, quotations, sales orders and returns',
    isSystem: false,
    permissions: [
      'dashboard.summary.view',
      'inventory.product.read',
      'inventory.stock.read',
      'sales.customer.read',
      'sales.customer.write',
      'sales.order.read',
      'sales.order.write',
      'sales.order.confirm',
      'sales.return.create',
      'invoicing.invoice.read',
    ],
  },
  {
    name: 'Purchaser',
    description: 'Suppliers and purchase orders',
    isSystem: false,
    permissions: [
      'dashboard.summary.view',
      'inventory.product.read',
      'inventory.stock.read',
      'inventory.cost.view',
      'purchasing.supplier.read',
      'purchasing.supplier.write',
      'purchasing.order.read',
      'purchasing.order.write',
      'purchasing.order.confirm',
      'purchasing.receipt.cancel',
      'invoicing.bill.read',
    ],
  },
  {
    name: 'Storekeeper',
    description: 'Stock movements, goods receipts and deliveries',
    isSystem: false,
    permissions: [
      'dashboard.summary.view',
      'inventory.product.read',
      'inventory.stock.read',
      'inventory.stock.adjust',
      'inventory.stock.transfer',
      'purchasing.order.read',
      'purchasing.receipt.create',
      'sales.order.read',
      'sales.delivery.create',
    ],
  },
  {
    name: 'Accountant',
    description: 'Invoices, supplier bills, payments and credit notes',
    isSystem: false,
    permissions: [
      'dashboard.summary.view',
      'inventory.product.read',
      'inventory.stock.read',
      'inventory.cost.view',
      'purchasing.supplier.read',
      'purchasing.order.read',
      'sales.customer.read',
      'sales.order.read',
      'invoicing.invoice.read',
      'invoicing.invoice.write',
      'invoicing.invoice.post',
      'invoicing.bill.read',
      'invoicing.bill.write',
      'invoicing.payment.read',
      'invoicing.payment.record',
    ],
  },
  {
    name: 'Viewer',
    description: 'Read-only access (no purchase costs)',
    isSystem: false,
    permissions: [
      'dashboard.summary.view',
      'inventory.product.read',
      'inventory.stock.read',
      'purchasing.supplier.read',
      'purchasing.order.read',
      'sales.customer.read',
      'sales.order.read',
      'invoicing.invoice.read',
      'invoicing.bill.read',
      'invoicing.payment.read',
    ],
  },
];
