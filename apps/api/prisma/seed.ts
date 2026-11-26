/**
 * Seeds reference data. Safe to run several times (idempotent upserts).
 *
 *  - all permissions from @erp/shared
 *  - default roles and their permissions (Admin always gets every permission)
 *  - the first admin user (SEED_ADMIN_* env vars)
 *  - company settings, a base unit, a main warehouse, document numbering
 *  - the Tunisian VAT rates
 */
import { DocumentType, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_ROLES, PERMISSION_DEFINITIONS } from '@erp/shared';

const prisma = new PrismaClient();

const SEQUENCE_PREFIXES: Record<DocumentType, string> = {
  PURCHASE_ORDER: 'PO',
  GOODS_RECEIPT: 'GR',
  QUOTATION: 'QUO',
  SALES_ORDER: 'SO',
  DELIVERY: 'DN',
  CUSTOMER_RETURN: 'RET',
  CUSTOMER_INVOICE: 'INV',
  CUSTOMER_CREDIT_NOTE: 'CN',
  SUPPLIER_BILL: 'BILL',
  SUPPLIER_CREDIT_NOTE: 'SCN',
  PAYMENT_IN: 'RCPT',
  PAYMENT_OUT: 'PAY',
  STOCK_ADJUSTMENT: 'ADJ',
  STOCK_TRANSFER: 'TRF',
};

async function seedPermissions() {
  for (const p of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, description: p.description },
      create: { code: p.code, module: p.module, description: p.description },
    });
  }
  console.log(`✔ ${PERMISSION_DEFINITIONS.length} permissions`);
}

async function seedRoles() {
  const permissions = await prisma.permission.findMany();
  const idByCode = new Map(permissions.map((p) => [p.code, p.id]));

  for (const role of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { name: role.name } });
    // Only the Admin role is re-synced on every seed; other roles keep
    // whatever the admin changed in the UI once they exist.
    if (existing && !role.isSystem) continue;

    const saved = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, isSystem: role.isSystem },
      create: { name: role.name, description: role.description, isSystem: role.isSystem },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: saved.id } });
    await prisma.rolePermission.createMany({
      data: role.permissions.map((code) => ({
        roleId: saved.id,
        permissionId: idByCode.get(code)!,
      })),
    });
  }
  console.log(`✔ ${DEFAULT_ROLES.length} default roles`);
}

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@erp.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const fullName = process.env.SEED_ADMIN_NAME ?? 'System Administrator';

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'Admin' } });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✔ admin user already exists (${email})`);
    return;
  }
  await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash: await argon2.hash(password),
      roles: { create: { roleId: adminRole.id } },
    },
  });
  console.log(`✔ admin user created: ${email}`);
}

async function seedReferenceData() {
  await prisma.companySettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: 'My Company', currency: 'USD' },
  });

  await prisma.unit.upsert({
    where: { code: 'PCS' },
    update: {},
    create: { code: 'PCS', name: 'Piece' },
  });

  await prisma.warehouse.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: { code: 'MAIN', name: 'Main warehouse' },
  });

  const year = new Date().getFullYear();
  for (const [docType, prefix] of Object.entries(SEQUENCE_PREFIXES) as [DocumentType, string][]) {
    await prisma.documentSequence.upsert({
      where: { docType_year: { docType, year } },
      update: {},
      create: { docType, year, prefix },
    });
  }
  console.log('✔ company settings, unit PCS, warehouse MAIN, document sequences');
}

/**
 * Tunisian VAT (TVA) rates. Created once and never overwritten, so an admin can
 * rename or deactivate them in Settings (e.g. when a finance law changes a rate).
 *  - 19 %: standard rate
 *  - 13 %: intermediate rate
 *  -  7 %: reduced rate
 *  -  0 %: exempt operations (exonéré), and sales under VAT suspension (suspension,
 *          e.g. totally exporting companies) — two entries so documents say which.
 */
const TUNISIA_VAT_RATES = [
  { name: 'TVA 19 %', rate: '19' },
  { name: 'TVA 13 %', rate: '13' },
  { name: 'TVA 7 %', rate: '7' },
  { name: 'Exonéré (0 %)', rate: '0' },
  { name: 'Suspension de TVA (0 %)', rate: '0' },
];

async function seedTaxRates() {
  for (const t of TUNISIA_VAT_RATES) {
    await prisma.taxRate.upsert({ where: { name: t.name }, update: {}, create: t });
  }
  console.log(`✔ ${TUNISIA_VAT_RATES.length} Tunisian VAT rates`);
}

async function main() {
  await seedPermissions();
  await seedRoles();
  await seedAdmin();
  await seedReferenceData();
  await seedTaxRates();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
