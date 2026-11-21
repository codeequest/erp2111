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
    description: 'View the dashboard and key figures',
  },

  // Inventory
  {
    code: 'inventory.product.read',
    module: 'inventory',
    description: 'View products, categories and units',
  },
  {
    code: 'inventory.product.write',
    module: 'inventory',
    description: 'Create and edit products, categories and units',
  },
  {
    code: 'inventory.warehouse.manage',
    module: 'inventory',
    description: 'Create and edit warehouses',
  },
  {
    code: 'inventory.stock.read',
    module: 'inventory',
    description: 'View stock levels and the stock ledger',
  },
  { code: 'inventory.stock.adjust', module: 'inventory', description: 'Post stock adjustments' },
  {
    code: 'inventory.stock.transfer',
    module: 'inventory',
    description: 'Transfer stock between warehouses',
  },
  {
    code: 'inventory.cost.view',
    module: 'inventory',
    description: 'See purchase cost and margins',
  },

  // Purchasing
  { code: 'purchasing.supplier.read', module: 'purchasing', description: 'View suppliers' },
  {
    code: 'purchasing.supplier.write',
    module: 'purchasing',
    description: 'Create and edit suppliers',
  },
  { code: 'purchasing.order.read', module: 'purchasing', description: 'View purchase orders' },
  {
    code: 'purchasing.order.write',
    module: 'purchasing',
    description: 'Create and edit draft purchase orders',
  },
  {
    code: 'purchasing.order.confirm',
    module: 'purchasing',
    description: 'Confirm or cancel purchase orders',
  },
  {
    code: 'purchasing.receipt.create',
    module: 'purchasing',
    description: 'Receive goods against a purchase order',
  },

  // Sales
  { code: 'sales.customer.read', module: 'sales', description: 'View customers' },
  { code: 'sales.customer.write', module: 'sales', description: 'Create and edit customers' },
  { code: 'sales.order.read', module: 'sales', description: 'View quotations and sales orders' },
  {
    code: 'sales.order.write',
    module: 'sales',
    description: 'Create and edit quotations and draft sales orders',
  },
  { code: 'sales.order.confirm', module: 'sales', description: 'Confirm or cancel sales orders' },
  {
    code: 'sales.delivery.create',
    module: 'sales',
    description: 'Deliver goods against a sales order',
  },
  { code: 'sales.return.create', module: 'sales', description: 'Register customer returns' },
  {
    code: 'sales.credit.override',
    module: 'sales',
    description: 'Confirm orders above the customer credit limit',
  },
  {
    code: 'sales.stats.view',
    module: 'sales',
    description: 'View sales statistics by month, quarter and year',
  },

  // Invoicing
  {
    code: 'invoicing.invoice.read',
    module: 'invoicing',
    description: 'View customer invoices and credit notes',
  },
  {
    code: 'invoicing.invoice.write',
    module: 'invoicing',
    description: 'Create and edit draft customer invoices',
  },
  {
    code: 'invoicing.invoice.post',
    module: 'invoicing',
    description: 'Post (finalize) or cancel invoices and credit notes',
  },
  { code: 'invoicing.bill.read', module: 'invoicing', description: 'View supplier bills' },
  {
    code: 'invoicing.bill.write',
    module: 'invoicing',
    description: 'Create, edit and post supplier bills',
  },
  { code: 'invoicing.payment.read', module: 'invoicing', description: 'View payments' },
  {
    code: 'invoicing.payment.record',
    module: 'invoicing',
    description: 'Record incoming and outgoing payments',
  },

  // Administration
  { code: 'admin.users.manage', module: 'admin', description: 'Create, edit and deactivate users' },
  {
    code: 'admin.roles.manage',
    module: 'admin',
    description: 'Create and edit roles and their permissions',
  },
  {
    code: 'admin.settings.manage',
    module: 'admin',
    description: 'Edit company settings, taxes and numbering',
  },
  { code: 'admin.audit.read', module: 'admin', description: 'Read the audit log' },
] as const satisfies ReadonlyArray<{ code: string; module: ErpModuleKey; description: string }>;

export type PermissionCode = (typeof PERMISSION_DEFINITIONS)[number]['code'];

export const ALL_PERMISSIONS: PermissionCode[] = PERMISSION_DEFINITIONS.map((p) => p.code);

export function isPermissionCode(value: string): value is PermissionCode {
  return (ALL_PERMISSIONS as string[]).includes(value);
}
