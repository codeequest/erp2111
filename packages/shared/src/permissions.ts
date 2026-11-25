/**
 * Every permission in the system. Format: `module.resource.action`.
 *
 * This list is the single source of truth:
 *  - the API seeds it into the `Permission` table and checks it with @RequirePermissions()
 *  - the web app uses it to show / hide menus and buttons
 *
 * To add a permission: add it here, add it to the roles that need it in roles.ts,
 * then run `pnpm db:seed`.
 */
export const ERP_MODULE_KEYS = [
  'dashboard',
  'inventory',
  'purchasing',
  'sales',
  'invoicing',
  'admin',
] as const;

export type ErpModuleKey = (typeof ERP_MODULE_KEYS)[number];

export const PERMISSION_DEFINITIONS = [
  // Dashboard
  {
    code: 'dashboard.summary.view',
    module: 'dashboard',
    resource: 'summary',
    action: 'view',
    label: 'View dashboard',
    description: 'View the dashboard and key figures',
    sensitive: false,
  },

  // Inventory
  {
    code: 'inventory.product.read',
    module: 'inventory',
    resource: 'product',
    action: 'read',
    label: 'View products',
    description: 'View products, categories and units',
    sensitive: false,
  },
  {
    code: 'inventory.product.write',
    module: 'inventory',
    resource: 'product',
    action: 'write',
    label: 'Edit products',
    description: 'Create and edit products, categories and units',
    sensitive: false,
  },
  {
    code: 'inventory.warehouse.manage',
    module: 'inventory',
    resource: 'warehouse',
    action: 'manage',
    label: 'Manage warehouses',
    description: 'Create and edit warehouses',
    sensitive: false,
  },
  {
    code: 'inventory.stock.read',
    module: 'inventory',
    resource: 'stock',
    action: 'read',
    label: 'View stock',
    description: 'View stock levels and the stock ledger',
    sensitive: false,
  },
  {
    code: 'inventory.stock.adjust',
    module: 'inventory',
    resource: 'stock',
    action: 'adjust',
    label: 'Adjust stock',
    description: 'Post stock adjustments',
    sensitive: false,
  },
  {
    code: 'inventory.stock.transfer',
    module: 'inventory',
    resource: 'stock',
    action: 'transfer',
    label: 'Transfer stock',
    description: 'Transfer stock between warehouses',
    sensitive: false,
  },
  {
    code: 'inventory.cost.view',
    module: 'inventory',
    resource: 'cost',
    action: 'view',
    label: 'View purchase costs',
    description: 'See purchase cost and margins',
    sensitive: false,
  },

  // Purchasing
  {
    code: 'purchasing.supplier.read',
    module: 'purchasing',
    resource: 'supplier',
    action: 'read',
    label: 'View suppliers',
    description: 'View suppliers',
    sensitive: false,
  },
  {
    code: 'purchasing.supplier.write',
    module: 'purchasing',
    resource: 'supplier',
    action: 'write',
    label: 'Edit suppliers',
    description: 'Create and edit suppliers',
    sensitive: false,
  },
  {
    code: 'purchasing.order.read',
    module: 'purchasing',
    resource: 'order',
    action: 'read',
    label: 'View purchase orders',
    description: 'View purchase orders',
    sensitive: false,
  },
  {
    code: 'purchasing.order.write',
    module: 'purchasing',
    resource: 'order',
    action: 'write',
    label: 'Edit purchase orders',
    description: 'Create and edit draft purchase orders',
    sensitive: false,
  },
  {
    code: 'purchasing.order.confirm',
    module: 'purchasing',
    resource: 'order',
    action: 'confirm',
    label: 'Confirm purchase orders',
    description: 'Confirm or cancel purchase orders',
    sensitive: false,
  },
  {
    code: 'purchasing.receipt.create',
    module: 'purchasing',
    resource: 'receipt',
    action: 'create',
    label: 'Receive goods',
    description: 'Receive goods against a purchase order',
    sensitive: false,
  },

  // Sales
  {
    code: 'sales.customer.read',
    module: 'sales',
    resource: 'customer',
    action: 'read',
    label: 'View customers',
    description: 'View customers',
    sensitive: false,
  },
  {
    code: 'sales.customer.write',
    module: 'sales',
    resource: 'customer',
    action: 'write',
    label: 'Edit customers',
    description: 'Create and edit customers',
    sensitive: false,
  },
  {
    code: 'sales.order.read',
    module: 'sales',
    resource: 'order',
    action: 'read',
    label: 'View sales orders',
    description: 'View quotations and sales orders',
    sensitive: false,
  },
  {
    code: 'sales.order.write',
    module: 'sales',
    resource: 'order',
    action: 'write',
    label: 'Edit sales orders',
    description: 'Create and edit quotations and draft sales orders',
    sensitive: false,
  },
  {
    code: 'sales.order.confirm',
    module: 'sales',
    resource: 'order',
    action: 'confirm',
    label: 'Confirm sales orders',
    description: 'Confirm or cancel sales orders',
    sensitive: false,
  },
  {
    code: 'sales.delivery.create',
    module: 'sales',
    resource: 'delivery',
    action: 'create',
    label: 'Deliver goods',
    description: 'Deliver goods against a sales order',
    sensitive: false,
  },
  {
    code: 'sales.return.create',
    module: 'sales',
    resource: 'return',
    action: 'create',
    label: 'Register returns',
    description: 'Register customer returns',
    sensitive: false,
  },
  {
    code: 'sales.credit.override',
    module: 'sales',
    resource: 'credit',
    action: 'override',
    label: 'Override credit limit',
    description: 'Confirm orders above the customer credit limit',
    sensitive: false,
  },

  // Invoicing
  {
    code: 'invoicing.invoice.read',
    module: 'invoicing',
    resource: 'invoice',
    action: 'read',
    label: 'View invoices',
    description: 'View customer invoices and credit notes',
    sensitive: false,
  },
  {
    code: 'invoicing.invoice.write',
    module: 'invoicing',
    resource: 'invoice',
    action: 'write',
    label: 'Edit invoices',
    description: 'Create and edit draft customer invoices',
    sensitive: false,
  },
  {
    code: 'invoicing.invoice.post',
    module: 'invoicing',
    resource: 'invoice',
    action: 'post',
    label: 'Post invoices',
    description: 'Post (finalize) or cancel invoices and credit notes',
    sensitive: false,
  },
  {
    code: 'invoicing.bill.read',
    module: 'invoicing',
    resource: 'bill',
    action: 'read',
    label: 'View supplier bills',
    description: 'View supplier bills',
    sensitive: false,
  },
  {
    code: 'invoicing.bill.write',
    module: 'invoicing',
    resource: 'bill',
    action: 'write',
    label: 'Edit supplier bills',
    description: 'Create, edit and post supplier bills',
    sensitive: false,
  },
  {
    code: 'invoicing.payment.read',
    module: 'invoicing',
    resource: 'payment',
    action: 'read',
    label: 'View payments',
    description: 'View payments',
    sensitive: false,
  },
  {
    code: 'invoicing.payment.record',
    module: 'invoicing',
    resource: 'payment',
    action: 'record',
    label: 'Record payments',
    description: 'Record incoming and outgoing payments',
    sensitive: false,
  },

  // Administration
  {
    code: 'admin.user.view',
    module: 'admin',
    resource: 'user',
    action: 'view',
    label: 'View users',
    description: 'View user accounts and their access',
    sensitive: false,
  },
  {
    code: 'admin.user.create',
    module: 'admin',
    resource: 'user',
    action: 'create',
    label: 'Create users',
    description: 'Create user accounts and send invitations',
    sensitive: false,
  },
  {
    code: 'admin.user.update',
    module: 'admin',
    resource: 'user',
    action: 'update',
    label: 'Edit users',
    description: 'Edit user profile details',
    sensitive: false,
  },
  {
    code: 'admin.user.activate',
    module: 'admin',
    resource: 'user',
    action: 'activate',
    label: 'Activate users',
    description: 'Reactivate deactivated users',
    sensitive: true,
  },
  {
    code: 'admin.user.deactivate',
    module: 'admin',
    resource: 'user',
    action: 'deactivate',
    label: 'Deactivate users',
    description: 'Deactivate users and end their sessions',
    sensitive: true,
  },
  {
    code: 'admin.user.reset_password',
    module: 'admin',
    resource: 'user',
    action: 'reset_password',
    label: 'Reset passwords',
    description: 'Send a password reset or force a password change',
    sensitive: true,
  },
  {
    code: 'admin.user.assign_roles',
    module: 'admin',
    resource: 'user',
    action: 'assign_roles',
    label: 'Assign roles',
    description: 'Assign and remove roles on users',
    sensitive: true,
  },
  {
    code: 'admin.user.manage_mfa',
    module: 'admin',
    resource: 'user',
    action: 'manage_mfa',
    label: 'Manage MFA and lockouts',
    description: 'Reset MFA for a user and unlock accounts',
    sensitive: true,
  },
  {
    code: 'admin.user.export',
    module: 'admin',
    resource: 'user',
    action: 'export',
    label: 'Export users',
    description: 'Export the user list to CSV',
    sensitive: false,
  },
  {
    code: 'admin.session.revoke',
    module: 'admin',
    resource: 'session',
    action: 'revoke',
    label: 'Revoke sessions',
    description: 'End sessions of other users',
    sensitive: true,
  },
  {
    code: 'admin.role.view',
    module: 'admin',
    resource: 'role',
    action: 'view',
    label: 'View roles',
    description: 'View roles and their permissions',
    sensitive: false,
  },
  {
    code: 'admin.role.create',
    module: 'admin',
    resource: 'role',
    action: 'create',
    label: 'Create roles',
    description: 'Create custom roles',
    sensitive: true,
  },
  {
    code: 'admin.role.update',
    module: 'admin',
    resource: 'role',
    action: 'update',
    label: 'Edit roles',
    description: 'Rename and edit roles',
    sensitive: true,
  },
  {
    code: 'admin.role.delete',
    module: 'admin',
    resource: 'role',
    action: 'delete',
    label: 'Delete roles',
    description: 'Delete custom roles',
    sensitive: true,
  },
  {
    code: 'admin.permission.manage',
    module: 'admin',
    resource: 'permission',
    action: 'manage',
    label: 'Manage role permissions',
    description: 'Change which permissions a role holds',
    sensitive: true,
  },
  {
    code: 'admin.audit.read',
    module: 'admin',
    resource: 'audit',
    action: 'read',
    label: 'Read audit log',
    description: 'Read the audit log',
    sensitive: false,
  },
  {
    code: 'admin.security.view',
    module: 'admin',
    resource: 'security',
    action: 'view',
    label: 'View security overview',
    description: 'View the security overview dashboard',
    sensitive: false,
  },
  {
    code: 'admin.security.manage',
    module: 'admin',
    resource: 'security',
    action: 'manage',
    label: 'Manage security policy',
    description: 'Edit password, lockout and MFA policy',
    sensitive: true,
  },
  {
    code: 'admin.settings.manage',
    module: 'admin',
    resource: 'settings',
    action: 'manage',
    label: 'Manage settings',
    description: 'Edit company settings, taxes and numbering',
    sensitive: false,
  },
] as const satisfies ReadonlyArray<{
  code: string;
  module: ErpModuleKey;
  resource: string;
  action: string;
  label: string;
  description: string;
  sensitive: boolean;
}>;

export type PermissionCode = (typeof PERMISSION_DEFINITIONS)[number]['code'];

export interface PermissionDefinition {
  code: PermissionCode;
  module: ErpModuleKey;
  resource: string;
  action: string;
  label: string;
  description: string;
  sensitive: boolean;
}

export const ALL_PERMISSIONS: PermissionCode[] = PERMISSION_DEFINITIONS.map((p) => p.code);

export function isPermissionCode(value: string): value is PermissionCode {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

/**
 * Permissions that grant power over other people's access or over money.
 * A role holding any of them is "privileged" (it triggers the MFA requirement).
 */
export const SENSITIVE_PERMISSIONS: ReadonlySet<PermissionCode> = new Set(
  PERMISSION_DEFINITIONS.filter((p) => p.sensitive).map((p) => p.code),
);

/** True when any of the given permission codes is sensitive. */
export function isPrivileged(perms: Iterable<string>): boolean {
  for (const p of perms) if (SENSITIVE_PERMISSIONS.has(p as PermissionCode)) return true;
  return false;
}

/**
 * Old coarse admin codes and the granular codes that replace them. The seed uses
 * it to migrate existing role assignments: a role holding an old code receives
 * every code it maps to, then the old code is removed.
 */
export const LEGACY_PERMISSION_MAP: Record<string, PermissionCode[]> = {
  'admin.users.manage': [
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
  'admin.roles.manage': [
    'admin.role.view',
    'admin.role.create',
    'admin.role.update',
    'admin.role.delete',
    'admin.permission.manage',
  ],
  'admin.audit.read': ['admin.audit.read', 'admin.security.view'],
};
