/**
 * Seeds reference data. Safe to run several times (idempotent upserts).
 *
 *  - all permissions from @erp/shared (legacy codes remapped, obsolete ones removed)
 *  - default roles and their permissions (Admin always gets every permission)
 *  - the first admin user (SEED_ADMIN_* env vars)
 *  - the security policy row
 *  - company settings, a base unit, a main warehouse, document numbering
 */
import { DocumentType, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_ROLES, LEGACY_PERMISSION_MAP, PERMISSION_DEFINITIONS } from '@erp/shared';

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

/**
 * Upserts the permission catalogue, migrates grants of legacy codes
 * (LEGACY_PERMISSION_MAP) and removes permissions no longer in the catalogue.
 */
async function seedPermissions() {
  const catalogue = new Set<string>(PERMISSION_DEFINITIONS.map((p) => p.code));
  const before = new Set((await prisma.permission.findMany({ select: { code: true } })).map((p) => p.code));
  /** Codes that did not exist before this run: legacy holders receive them once. */
  const created = new Set([...catalogue].filter((code) => !before.has(code)));

  for (const p of PERMISSION_DEFINITIONS) {
    const data = {
      module: p.module,
      resource: p.resource,
      action: p.action,
      label: p.label,
      description: p.description,
      sensitive: p.sensitive,
    };
    await prisma.permission.upsert({
      where: { code: p.code },
      update: data,
      create: { code: p.code, ...data },
    });
  }

  await prisma.$transaction(async (tx) => {
    const idByCode = new Map(
      (await tx.permission.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]),
    );

    // A role holding a legacy code receives every code it was split into.
    // A legacy code that is still in the catalogue (admin.audit.read) only
    // hands out the codes that are new in this run, so the remap happens once
    // and later edits made in the UI are not undone by re-seeding.
    let remapped = 0;
    for (const [legacy, targets] of Object.entries(LEGACY_PERMISSION_MAP)) {
      const legacyId = idByCode.get(legacy);
      if (!legacyId) continue;
      const grant = catalogue.has(legacy) ? targets.filter((code) => created.has(code)) : targets;
      if (grant.length === 0) continue;

      const holders = await tx.rolePermission.findMany({
        where: { permissionId: legacyId },
        select: { roleId: true },
      });
      for (const { roleId } of holders) {
        const result = await tx.rolePermission.createMany({
          data: grant.map((code) => ({ roleId, permissionId: idByCode.get(code)! })),
          skipDuplicates: true,
        });
        remapped += result.count;
      }
    }

    // Obsolete codes (cascade removes their role grants).
    const removed = await tx.permission.deleteMany({ where: { code: { notIn: [...catalogue] } } });
    if (remapped || removed.count) {
      console.log(`✔ legacy permissions: ${remapped} grants remapped, ${removed.count} obsolete codes removed`);
    }
  });

  console.log(`✔ ${PERMISSION_DEFINITIONS.length} permissions`);
}

async function seedRoles() {
  const permissions = await prisma.permission.findMany();
  const idByCode = new Map(permissions.map((p) => [p.code, p.id]));

  for (const role of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { name: role.name } });
    const attributes = { type: role.type, isProtected: role.isProtected, color: role.color };

    const saved = await prisma.role.upsert({
      where: { name: role.name },
      update: role.isProtected ? { description: role.description, ...attributes } : attributes,
      create: { name: role.name, description: role.description, ...attributes },
    });

    // Only the protected Admin role is re-synced on every seed (always the
    // full catalogue); other roles keep whatever the admin changed in the UI
    // once they exist.
    if (existing && !role.isProtected) continue;

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
  const fullName = (process.env.SEED_ADMIN_NAME ?? 'System Administrator').trim();
  const [firstName, ...rest] = fullName.split(/\s+/);
  const lastName = rest.join(' ');

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'Admin' } });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✔ admin user already exists (${email})`);
    return;
  }
  const now = new Date();
  await prisma.user.create({
    data: {
      email,
      firstName,
      lastName,
      fullName: lastName ? `${firstName} ${lastName}` : firstName,
      status: 'ACTIVE',
      emailVerifiedAt: now,
      passwordChangedAt: now,
      passwordHash: await argon2.hash(password),
      roles: { create: { roleId: adminRole.id } },
    },
  });
  console.log(`✔ admin user created: ${email}`);
}

/** Single security policy row (id = 1); the column defaults are the policy defaults. */
async function seedSecurityPolicy() {
  await prisma.securityPolicy.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  console.log('✔ security policy');
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

async function main() {
  await seedPermissions();
  await seedRoles();
  await seedAdmin();
  await seedSecurityPolicy();
  await seedReferenceData();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
