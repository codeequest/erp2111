import { ALL_PERMISSIONS, PermissionCode } from './permissions';

export type RoleType = 'SYSTEM' | 'CUSTOM';

/** Fixed colour palette for roles; the web app maps each key to Tailwind classes. */
export const ROLE_COLORS = [
  'slate',
  'blue',
  'emerald',
  'amber',
  'rose',
  'violet',
  'cyan',
  'orange',
] as const;

export type RoleColor = (typeof ROLE_COLORS)[number];

export interface DefaultRole {
  name: string;
  description: string;
  /** SYSTEM roles cannot be deleted or renamed from the admin UI. */
  type: RoleType;
  /** Protected roles (Admin) cannot be edited at all. */
  isProtected: boolean;
  color: RoleColor;
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
    type: 'SYSTEM',
    isProtected: true,
    color: 'slate',
    permissions: ALL_PERMISSIONS,
  },
  {
    name: 'Sales clerk',
    description: 'Customers, quotations, sales orders and returns',
    type: 'SYSTEM',
    isProtected: false,
    color: 'blue',
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
    type: 'SYSTEM',
    isProtected: false,
    color: 'emerald',
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
      'invoicing.bill.read',
    ],
  },
  {
    name: 'Storekeeper',
    description: 'Stock movements, goods receipts and deliveries',
    type: 'SYSTEM',
    isProtected: false,
    color: 'amber',
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
    type: 'SYSTEM',
    isProtected: false,
    color: 'violet',
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
    type: 'SYSTEM',
    isProtected: false,
    color: 'cyan',
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

export interface RoleTemplate {
  key: string;
  name: string;
  description: string;
  permissions: PermissionCode[];
}

/** Starting points offered when creating a role. */
export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: 'read-only',
    name: 'Read-only',
    description: 'View everything except purchase costs and administration',
    permissions: ALL_PERMISSIONS.filter(
      (p) => !p.startsWith('admin.') && p !== 'inventory.cost.view' && /\.(read|view)$/.test(p),
    ),
  },
  {
    key: 'helpdesk',
    name: 'Helpdesk',
    description: 'Help users who are locked out or lost their second factor',
    permissions: [
      'admin.user.view',
      'admin.user.reset_password',
      'admin.user.manage_mfa',
      'admin.session.revoke',
      'admin.audit.read',
    ],
  },
  {
    key: 'user-manager',
    name: 'User manager',
    description: 'Manage user accounts without touching roles or permissions',
    permissions: [
      'admin.user.view',
      'admin.user.create',
      'admin.user.update',
      'admin.user.activate',
      'admin.user.deactivate',
      'admin.user.reset_password',
      'admin.user.assign_roles',
      'admin.user.manage_mfa',
      'admin.user.export',
      'admin.session.revoke',
    ],
  },
  {
    key: 'auditor',
    name: 'Auditor',
    description: 'Read-only view of the audit trail, users and roles',
    permissions: ['admin.audit.read', 'admin.security.view', 'admin.user.view', 'admin.role.view'],
  },
];
