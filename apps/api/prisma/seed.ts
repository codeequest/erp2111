/**
 * Seeds reference data. Safe to run several times (idempotent upserts).
 *
 *  - all permissions from @erp/shared
 *  - default roles and their permissions (Admin always gets every permission)
 *  - the first admin user (SEED_ADMIN_* env vars)
 *  - company settings, a base unit, a main warehouse, document numbering
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

/** EAN-13 with a valid check digit, built from a 12-digit body. */
function ean13(body: string): string {
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}

// [sku, name, category, unit, tax, salePrice, cost, minStock, stock MAIN, stock SHOP, description]
type DemoProduct = [string, string, string, string, string, number, number, number, number, number, string];
const DEMO_PRODUCTS: DemoProduct[] = [
  ['BEV-001', 'Coca-Cola 1.5L', 'Soft drinks', 'PCS', 'VAT 19%', 2.2, 1.45, 24, 180, 36, 'Carbonated soft drink, PET bottle'],
  ['BEV-002', 'Coca-Cola Zero 1.5L', 'Soft drinks', 'PCS', 'VAT 19%', 2.2, 1.45, 24, 12, 6, 'Sugar-free carbonated soft drink'],
  ['BEV-003', 'Orange juice 1L', 'Juices', 'PCS', 'VAT 7%', 3.5, 2.3, 20, 64, 10, '100% pure squeezed orange juice'],
  ['BEV-004', 'Apple juice 1L', 'Juices', 'PCS', 'VAT 7%', 3.2, 2.1, 20, 0, 0, 'Apple juice from concentrate'],
  ['BEV-005', 'Mineral water 1.5L', 'Water', 'PCS', 'VAT 7%', 0.85, 0.5, 60, 720, 120, 'Natural still mineral water'],
  ['BEV-006', 'Sparkling water 1L', 'Water', 'PCS', 'VAT 7%', 1.1, 0.7, 40, 30, 8, 'Naturally sparkling mineral water'],
  ['BEV-007', 'Ground coffee 250g', 'Coffee & tea', 'PCS', 'VAT 19%', 7.9, 5.2, 15, 85, 20, 'Arabica blend, medium roast'],
  ['BEV-008', 'Green tea 100 bags', 'Coffee & tea', 'PCS', 'VAT 19%', 5.4, 3.1, 10, 42, 12, 'Mint green tea, individually wrapped bags'],
  ['FOO-001', 'Spaghetti 500g', 'Pasta & rice', 'PCS', 'VAT 7%', 1.35, 0.8, 50, 400, 60, 'Durum wheat semolina pasta'],
  ['FOO-002', 'Basmati rice 1kg', 'Pasta & rice', 'PCS', 'VAT 7%', 4.2, 2.9, 30, 150, 25, 'Long-grain aromatic rice'],
  ['FOO-003', 'Extra virgin olive oil 1L', 'Oils & condiments', 'PCS', 'VAT 7%', 14.5, 10.2, 20, 95, 18, 'Cold-pressed extra virgin olive oil'],
  ['FOO-004', 'Tomato paste 400g', 'Oils & condiments', 'PCS', 'VAT 7%', 2.1, 1.3, 40, 18, 4, 'Double concentrated tomato paste'],
  ['FOO-005', 'Harissa 380g', 'Oils & condiments', 'PCS', 'VAT 7%', 2.6, 1.6, 25, 110, 22, 'Traditional hot chili paste'],
  ['FOO-006', 'Chocolate biscuits 300g', 'Snacks', 'PCS', 'VAT 19%', 3.9, 2.4, 30, 75, 15, 'Biscuits filled with chocolate cream'],
  ['FOO-007', 'Salted crisps 150g', 'Snacks', 'PCS', 'VAT 19%', 2.4, 1.4, 30, 26, 5, 'Classic salted potato crisps'],
  ['FOO-008', 'Dates Deglet Nour 500g', 'Snacks', 'PCS', 'VAT 7%', 8.5, 5.6, 20, 60, 14, 'Premium dates on the branch'],
  ['DAI-001', 'Whole milk 1L', 'Dairy', 'PCS', 'VAT 7%', 1.45, 1.05, 80, 240, 48, 'UHT whole milk'],
  ['DAI-002', 'Plain yogurt x4', 'Dairy', 'PCS', 'VAT 7%', 2.3, 1.5, 30, 0, 3, 'Pack of four plain yogurts'],
  ['DAI-003', 'Butter 200g', 'Dairy', 'PCS', 'VAT 7%', 4.6, 3.3, 20, 44, 9, 'Unsalted butter'],
  ['DAI-004', 'Edam cheese 1kg', 'Dairy', 'KG', 'VAT 7%', 24.0, 17.5, 5, 14.5, 2.2, 'Edam cheese, sold by weight'],
  ['CLE-001', 'Dishwashing liquid 750ml', 'Cleaning', 'PCS', 'VAT 19%', 3.3, 2.0, 25, 130, 20, 'Lemon dishwashing liquid'],
  ['CLE-002', 'Laundry powder 3kg', 'Cleaning', 'PCS', 'VAT 19%', 18.9, 13.1, 10, 36, 6, 'Washing powder for 40 loads'],
  ['CLE-003', 'Bleach 2L', 'Cleaning', 'PCS', 'VAT 19%', 2.8, 1.7, 20, 9, 2, 'Household bleach'],
  ['CLE-004', 'Paper towels x6', 'Cleaning', 'PCS', 'VAT 19%', 6.7, 4.4, 15, 58, 12, 'Six rolls of absorbent paper towels'],
  ['PER-001', 'Shampoo 400ml', 'Personal care', 'PCS', 'VAT 19%', 7.5, 4.8, 15, 70, 15, 'Shampoo for normal hair'],
  ['PER-002', 'Toothpaste 75ml', 'Personal care', 'PCS', 'VAT 19%', 3.6, 2.2, 25, 95, 30, 'Fluoride toothpaste, fresh mint'],
  ['PER-003', 'Shower gel 500ml', 'Personal care', 'PCS', 'VAT 19%', 6.2, 3.9, 15, 0, 0, 'Moisturising shower gel'],
  ['ELE-001', 'USB-C charger 25W', 'Electronics', 'PCS', 'VAT 19%', 39.0, 24.0, 5, 22, 4, 'Fast wall charger with USB-C port'],
  ['ELE-002', 'Wireless earbuds', 'Electronics', 'PCS', 'VAT 19%', 89.0, 55.0, 3, 3, 1, 'Bluetooth 5.3 earbuds with charging case'],
  ['ELE-003', 'AA batteries x4', 'Electronics', 'PCS', 'VAT 19%', 5.9, 3.4, 20, 140, 35, 'Alkaline AA batteries'],
  ['ELE-004', 'LED bulb E27 10W', 'Electronics', 'PCS', 'VAT 19%', 4.5, 2.6, 20, 88, 16, 'Warm white LED bulb, 1000 lm'],
  ['STA-001', 'A4 copy paper 500 sheets', 'Stationery', 'PCS', 'VAT 19%', 12.5, 8.9, 10, 48, 6, '80 g/m² white paper'],
  ['STA-002', 'Blue ballpoint pens x10', 'Stationery', 'PCS', 'VAT 19%', 4.2, 2.3, 15, 66, 18, 'Medium point ballpoint pens'],
  ['STA-003', 'Spiral notebook A5', 'Stationery', 'PCS', 'VAT 19%', 3.1, 1.7, 20, 7, 3, '100 ruled pages'],
];

// Parent category of each leaf category used above
const CATEGORY_TREE: Record<string, string[]> = {
  Beverages: ['Soft drinks', 'Juices', 'Water', 'Coffee & tea'],
  Grocery: ['Pasta & rice', 'Oils & condiments', 'Snacks'],
  'Fresh products': ['Dairy'],
  Household: ['Cleaning', 'Personal care'],
  'Electronics & office': ['Electronics', 'Stationery'],
};

/** Demo catalogue so the screens have something to show. Skip with SEED_DEMO_DATA=false. */
async function seedDemoProducts() {
  if (process.env.SEED_DEMO_DATA === 'false') return;

  const taxIds = new Map<string, string>();
  for (const [name, rate] of [['VAT 19%', 19], ['VAT 7%', 7], ['VAT 0%', 0]] as const) {
    const t = await prisma.taxRate.upsert({ where: { name }, update: {}, create: { name, rate } });
    taxIds.set(name, t.id);
  }

  const unitIds = new Map<string, string>();
  for (const [code, name] of [['PCS', 'Piece'], ['KG', 'Kilogram'], ['CTN', 'Carton']]) {
    const u = await prisma.unit.upsert({ where: { code }, update: {}, create: { code, name } });
    unitIds.set(code, u.id);
  }

  const categoryIds = new Map<string, string>();
  async function category(name: string, parentId: string | null) {
    const existing = await prisma.category.findFirst({ where: { name, parentId } });
    const c = existing ?? (await prisma.category.create({ data: { name, parentId } }));
    categoryIds.set(name, c.id);
    return c.id;
  }
  for (const [parent, children] of Object.entries(CATEGORY_TREE)) {
    const parentId = await category(parent, null);
    for (const child of children) await category(child, parentId);
  }

  const main = await prisma.warehouse.findUniqueOrThrow({ where: { code: 'MAIN' } });
  const shop = await prisma.warehouse.upsert({
    where: { code: 'SHOP' },
    update: {},
    create: { code: 'SHOP', name: 'Shop floor' },
  });
  const admin = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  let created = 0;
  for (const [i, row] of DEMO_PRODUCTS.entries()) {
    const [sku, name, cat, unit, tax, salePrice, cost, minStock, qtyMain, qtyShop, description] = row;
    if (await prisma.product.findUnique({ where: { sku } })) continue;

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku,
          barcode: ean13(`619${String(100000000 + i * 7919).slice(0, 9)}`),
          name,
          description,
          categoryId: categoryIds.get(cat),
          baseUnitId: unitIds.get(unit)!,
          taxRateId: taxIds.get(tax),
          salePrice,
          averageCost: cost,
          minStock,
        },
      });
      // Opening stock goes through stock moves, like any other stock change.
      for (const [warehouseId, quantity] of [[main.id, qtyMain], [shop.id, qtyShop]] as const) {
        if (quantity <= 0) continue;
        await tx.stockMove.create({
          data: {
            productId: product.id,
            warehouseId,
            type: 'OPENING',
            quantity,
            unitCost: cost,
            reference: 'Demo opening stock',
            createdById: admin.id,
          },
        });
        await tx.stockBalance.create({ data: { productId: product.id, warehouseId, quantity } });
      }
    });
    created++;
  }
  console.log(`✔ demo catalogue: ${created} new products (${DEMO_PRODUCTS.length} in total)`);
}

async function main() {
  await seedPermissions();
  await seedRoles();
  await seedAdmin();
  await seedReferenceData();
  await seedDemoProducts();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
