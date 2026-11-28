/**
 * Physical stock counts against a REAL test database.
 * Runs only when TEST_DATABASE_URL is set (see stock-engine.db.spec.ts).
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { PermissionCode } from '@erp/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestUser } from '../../../common/types/request-user';
import { CatalogService } from '../catalog.service';
import { StockCountsService } from './stock-counts.service';
import { StockEngine } from './stock-engine.service';
import { readTable } from '../../../common/spreadsheet';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('Stock counts (database)', () => {
  if (url && /\/erp(\?|$)/.test(url)) throw new Error('TEST_DATABASE_URL must not be the main "erp" database');

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const db = prisma as unknown as PrismaService;
  const engine = new StockEngine(db);
  const counts = new StockCountsService(db, engine, new CatalogService(db));
  const run = Math.random().toString(36).slice(2, 8).toUpperCase();
  let userId: string;
  let unitId: string;
  let categoryId: string;

  const userWith = (...perms: PermissionCode[]): RequestUser => ({
    id: userId,
    email: 'c@test',
    fullName: 'Count test',
    roles: [],
    permissions: new Set(perms),
  });
  const counter = () => userWith('inventory.stock.adjust', 'inventory.stock.read');
  const manager = () => userWith('inventory.stock.adjust', 'inventory.stock.read', 'inventory.cost.view');

  const newWarehouse = async () =>
    (await prisma.warehouse.create({ data: { code: `C${run}${randomUUID().slice(0, 4)}`, name: 'Count test' } })).id;
  async function newProduct(opts: { category?: boolean; active?: boolean } = {}) {
    return (
      await prisma.product.create({
        data: {
          sku: `C-${run}-${randomUUID().slice(0, 6)}`,
          name: `Count ${randomUUID().slice(0, 4)}`,
          baseUnitId: unitId,
          categoryId: opts.category ? categoryId : null,
          isActive: opts.active ?? true,
        },
      })
    ).id;
  }
  async function stock(productId: string, warehouseId: string, quantity: string, type: 'OPENING' | 'DELIVERY' = 'OPENING') {
    await prisma.$transaction((tx) =>
      engine.post(
        tx,
        {
          sourceType: 'Test',
          sourceId: randomUUID(),
          lines: [{ productId, warehouseId, type, quantity, unitCost: type === 'OPENING' ? '2' : undefined }],
        },
        manager(),
      ),
    );
  }
  async function onHand(productId: string, warehouseId: string) {
    const b = await prisma.stockBalance.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } });
    return b?.quantity.toString() ?? '0';
  }

  beforeAll(async () => {
    userId = (
      await prisma.user.create({ data: { email: `cnt-${run}@test.local`, passwordHash: 'x', fullName: 'Count test' } })
    ).id;
    unitId = (await prisma.unit.create({ data: { code: `K${run}`, name: 'Test unit' } })).id;
    categoryId = (await prisma.category.create({ data: { name: `Count cat ${run}` } })).id;
  });
  afterAll(() => prisma.$disconnect());

  it('lists the products that hold stock, with their expected quantity', async () => {
    const w = await newWarehouse();
    const a = await newProduct();
    const b = await newProduct();
    await newProduct(); // no stock: not listed
    await stock(a, w, '10');
    await stock(b, w, '3');

    const c = await counts.create({ warehouseId: w, includeZero: false }, counter());
    expect(c.status).toBe('DRAFT');
    expect(c.number).toMatch(/^CNT-/);
    expect(c.lines.map((l) => [l.product.id, l.expectedQty]).sort()).toEqual([[a, '10'], [b, '3']].sort());
    expect(c.summary).toMatchObject({ lines: 2, counted: 0, withDifference: 0, movedSinceStart: 0 });
  });

  it('can include products with no stock, and limit to a category', async () => {
    const w = await newWarehouse();
    const inCat = await newProduct({ category: true });
    await newProduct(); // other category
    const c = await counts.create({ warehouseId: w, categoryId, includeZero: true }, counter());
    expect(c.lines.map((l) => l.product.id)).toContain(inCat);
    expect(c.lines.every((l) => l.expectedQty === '0')).toBe(true);
    expect(c.category?.id).toBe(categoryId);
  });

  it('refuses an empty count', async () => {
    const w = await newWarehouse();
    await expect(counts.create({ warehouseId: w, includeZero: false }, counter())).rejects.toThrow(/No product to count/);
  });

  it('saves counts in several sessions, adds found products, and adjusts stock when validated', async () => {
    const w = await newWarehouse();
    const a = await newProduct();
    const b = await newProduct();
    const c = await newProduct();
    const found = await newProduct();
    await stock(a, w, '10');
    await stock(b, w, '5');
    await stock(c, w, '7');

    const count = await counts.create({ warehouseId: w, includeZero: false }, counter());
    await counts.saveLines(count.id, { lines: [{ productId: a, countedQty: '8' }] }, counter()); // 2 missing
    const second = await counts.saveLines(
      count.id,
      { lines: [{ productId: b, countedQty: '5' }, { productId: found, countedQty: '4' }] }, // b ok, found +4
      counter(),
    );
    expect(second.summary).toMatchObject({ lines: 4, counted: 3, withDifference: 2 });
    expect(second.lines.find((l) => l.product.id === a)!.difference).toBe('-2');

    const posted = await counts.post(count.id, manager());
    expect(posted.status).toBe('POSTED');
    expect(await onHand(a, w)).toBe('8');
    expect(await onHand(b, w)).toBe('5');
    expect(await onHand(c, w)).toBe('7'); // not counted: untouched
    expect(await onHand(found, w)).toBe('4');
    expect(await prisma.stockMove.count({ where: { sourceType: 'StockCount', sourceId: count.id } })).toBe(2);

    const lineA = posted.lines.find((l) => l.product.id === a)!;
    expect(lineA).toMatchObject({ difference: '-2', differenceValue: '-4.00' }); // -2 x cost 2
    expect(posted.summary.differenceValue).toBe('-4.00'); // found goods have no cost yet: 4 x 0
  });

  it('adjusts against the stock at validation, so a sale during the count is not lost', async () => {
    const w = await newWarehouse();
    const p = await newProduct();
    await stock(p, w, '10');
    const count = await counts.create({ warehouseId: w, includeZero: false }, counter());
    // Staff count 10 on the shelf, then a customer buys 1 before validation.
    await counts.saveLines(count.id, { lines: [{ productId: p, countedQty: '10' }] }, counter());
    await stock(p, w, '-1', 'DELIVERY');

    const before = await counts.get(count.id, counter());
    expect(before.summary.movedSinceStart).toBe(1);
    expect(before.lines[0]).toMatchObject({ expectedQty: '10', currentQty: '9', difference: '1' });

    await counts.post(count.id, counter());
    expect(await onHand(p, w)).toBe('10'); // = what was counted
  });

  it('refuses to validate with nothing counted, or twice', async () => {
    const w = await newWarehouse();
    const p = await newProduct();
    await stock(p, w, '1');
    const count = await counts.create({ warehouseId: w, includeZero: false }, counter());
    await expect(counts.post(count.id, counter())).rejects.toThrow(/Nothing is counted/);
    await counts.saveLines(count.id, { lines: [{ productId: p, countedQty: '1' }] }, counter());
    await counts.post(count.id, counter());
    await expect(counts.post(count.id, counter())).rejects.toThrow(/only a draft/);
    await expect(
      counts.saveLines(count.id, { lines: [{ productId: p, countedQty: '2' }] }, counter()),
    ).rejects.toThrow(/only a draft/);
  });

  it('imports counted quantities from CSV, skipping empty cells', async () => {
    const w = await newWarehouse();
    const a = await newProduct();
    const b = await newProduct();
    await stock(a, w, '10');
    await stock(b, w, '10');
    const count = await counts.create({ warehouseId: w, includeZero: false }, counter());
    await counts.saveLines(count.id, { lines: [{ productId: b, countedQty: '6' }] }, counter());

    const skuA = (await prisma.product.findUniqueOrThrow({ where: { id: a } })).sku;
    const skuB = (await prisma.product.findUniqueOrThrow({ where: { id: b } })).sku;
    const report = await counts.importTable(
      count.id,
      await readTable({ buffer: Buffer.from(
      `sku;name;counted_qty\n${skuA};x;9,5\n${skuB};x;\nNOPE-${run};x;3\n${skuA};x;1\n`), originalname: 'c.csv' }),
      counter(),
    );
    expect(report).toMatchObject({ updated: 1, added: 0, skipped: 1 });
    expect(report.errors.map((e) => e.line)).toEqual([4, 5]);

    const after = await counts.get(count.id, counter());
    const byId = new Map(after.lines.map((l) => [l.product.id, l.countedQty]));
    expect(byId.get(a)).toBe('9.5');
    expect(byId.get(b)).toBe('6'); // empty cell did not erase it
  });

  it('exports a blind count sheet without expected quantities', async () => {
    // (the sheet is written as .xlsx by the controller: see spreadsheet.spec.ts)
    const w = await newWarehouse();
    const p = await newProduct();
    await stock(p, w, '3');
    const count = await counts.create({ warehouseId: w, includeZero: false }, counter());
    const blind = await counts.sheetRows(count.id, true);
    expect(blind.name).toBe(`${count.number}.xlsx`);
    expect(blind.columns.map((c) => c.header)).toEqual(['sku', 'name', 'unit', 'counted_qty']);
    expect(blind.rows).toHaveLength(1);
    const full = await counts.sheetRows(count.id, false);
    expect(full.columns.map((c) => c.header)).toContain('expected_qty');
    expect(full.rows[0][3]).toBe('3');
  });

  it('cancels a draft without touching stock', async () => {
    const w = await newWarehouse();
    const p = await newProduct();
    await stock(p, w, '3');
    const count = await counts.create({ warehouseId: w, includeZero: false }, counter());
    await counts.saveLines(count.id, { lines: [{ productId: p, countedQty: '0' }] }, counter());
    expect((await counts.cancel(count.id, counter())).status).toBe('CANCELLED');
    expect(await onHand(p, w)).toBe('3');
  });

  it('leaves no drift between balances and the ledger', async () => {
    expect(await engine.findDrift(db)).toEqual([]);
  });
});
