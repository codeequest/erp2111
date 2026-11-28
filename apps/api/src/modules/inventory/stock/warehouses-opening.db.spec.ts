/**
 * Warehouses and opening stock import against a REAL test database.
 * Runs only when TEST_DATABASE_URL is set (see stock-engine.db.spec.ts).
 */
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { PermissionCode } from '@erp/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestUser } from '../../../common/types/request-user';
import { WarehousesService } from '../warehouses.service';
import { OpeningBalanceService } from './opening-balance.service';
import { StockEngine } from './stock-engine.service';
import { readTable } from '../../../common/spreadsheet';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('Warehouses and opening stock (database)', () => {
  if (url && /\/erp(\?|$)/.test(url)) throw new Error('TEST_DATABASE_URL must not be the main "erp" database');

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const db = prisma as unknown as PrismaService;
  const engine = new StockEngine(db);
  const warehouses = new WarehousesService(db);
  const opening = new OpeningBalanceService(db, engine);
  /** Imports a CSV text the way the controller does (readTable, then importTable). */
  const importCsv = async (text: string, ...rest: [boolean, string | undefined, RequestUser]) =>
    opening.importTable(await readTable({ buffer: Buffer.from(text), originalname: 'f.csv' }), ...rest);
  const run = Math.random().toString(36).slice(2, 8).toUpperCase();
  let userId: string;
  let unitId: string;

  const userWith = (...perms: PermissionCode[]): RequestUser => ({
    id: userId,
    email: 'w@test',
    fullName: 'Warehouse test',
    roles: [],
    permissions: new Set(perms),
  });
  const manager = () => userWith('inventory.warehouse.manage', 'inventory.stock.adjust', 'inventory.cost.view');

  async function newProduct(sku = `O-${run}-${randomUUID().slice(0, 6)}`) {
    await prisma.product.create({ data: { sku, name: 'Opening test', baseUnitId: unitId, averageCost: '2' } });
    return sku;
  }
  const newWarehouse = (suffix: string) =>
    warehouses.create({ code: `${suffix}${run}`, name: `Test ${suffix}` }, manager());

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `wh-${run}@test.local`, passwordHash: 'x', fullName: 'Warehouse test' },
    });
    userId = u.id;
    unitId = (await prisma.unit.create({ data: { code: `W${run}`, name: 'Test unit' } })).id;
  });
  afterAll(() => prisma.$disconnect());

  describe('warehouses', () => {
    it('creates, renames and audits a warehouse', async () => {
      const w = await newWarehouse('C');
      expect(w).toMatchObject({ isActive: true, productsInStock: 0, address: null });
      const updated = await warehouses.update(w.id, { name: 'Renamed', address: 'Tunis' }, manager());
      expect(updated).toMatchObject({ name: 'Renamed', address: 'Tunis', code: w.code });
      expect(await prisma.auditLog.count({ where: { entity: 'Warehouse', entityId: w.id } })).toBe(2);
    });

    it('refuses a duplicate code, whatever the case', async () => {
      const w = await newWarehouse('D');
      await expect(warehouses.create({ code: w.code.toLowerCase(), name: 'Again' }, manager())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses to deactivate a warehouse that holds stock, then allows it once empty', async () => {
      const w = await newWarehouse('S');
      const sku = await newProduct();
      await importCsv(`sku,warehouse,quantity\n${sku},${w.code},5\n`, false, undefined, manager());

      await expect(warehouses.update(w.id, { isActive: false }, manager())).rejects.toThrow(/still holds stock/);

      const product = await prisma.product.findUniqueOrThrow({ where: { sku } });
      await prisma.$transaction((tx) =>
        engine.post(
          tx,
          {
            sourceType: 'Test',
            sourceId: randomUUID(),
            reason: 'Empty it',
            lines: [{ productId: product.id, warehouseId: w.id, type: 'ADJUSTMENT', quantity: '-5' }],
          },
          manager(),
        ),
      );
      const closed = await warehouses.update(w.id, { isActive: false }, manager());
      expect(closed.isActive).toBe(false);
      expect((await warehouses.list(false)).some((x) => x.id === w.id)).toBe(false);
      expect((await warehouses.list(true)).some((x) => x.id === w.id)).toBe(true);
    });
  });

  describe('opening stock import', () => {
    it('previews without writing, then imports at the given cost or the average cost', async () => {
      const w = await newWarehouse('O');
      const a = await newProduct();
      const b = await newProduct();
      const csv = `sku;warehouse;quantity;unit_cost\n${a};;10;3,50\n${b};${w.code};4;\n`;

      const preview = await importCsv(csv, true, w.id, manager());
      expect(preview.totals).toEqual({ ok: 2, error: 0 });
      expect(preview.rows.map((r) => r.unitCost)).toEqual(['3.5', '2']);
      expect(preview.totalValue).toBe('43.00'); // 10 x 3.50 + 4 x 2
      expect(await prisma.stockMove.count({ where: { warehouseId: w.id } })).toBe(0);

      const done = await importCsv(csv, false, w.id, manager());
      expect(done.dryRun).toBe(false);
      const moves = await prisma.stockMove.findMany({ where: { warehouseId: w.id } });
      expect(moves).toHaveLength(2);
      expect(moves.every((m) => m.type === 'OPENING')).toBe(true);
      expect((await prisma.product.findUniqueOrThrow({ where: { sku: a } })).averageCost.toString()).toBe('3.5');
    });

    it('refuses a second opening for the same product and warehouse', async () => {
      const w = await newWarehouse('T');
      const sku = await newProduct();
      const csv = `sku,warehouse,quantity\n${sku},${w.code},1\n`;
      await importCsv(csv, false, undefined, manager());
      const again = await importCsv(csv, true, undefined, manager());
      expect(again.totals).toEqual({ ok: 0, error: 1 });
      expect(again.rows[0].errors[0]).toMatch(/already has stock history/);
    });

    it('reports every problem on its row', async () => {
      const w = await newWarehouse('E');
      const sku = await newProduct();
      const csv = [
        'sku,warehouse,quantity,unit_cost',
        `NOPE-${run},${w.code},1,`,
        `${sku},UNKNOWN${run},1,`,
        `${sku},${w.code},0,`,
        `${sku},${w.code},-2,`,
        `${sku},${w.code},1,abc`,
        `${sku},${w.code},1,`,
        `${sku},${w.code},2,`,
        `${sku},,1,`,
      ].join('\n');
      const r = await importCsv(csv, true, undefined, manager());
      const errorsOf = (line: number) => r.rows.find((x) => x.line === line)!.errors.join(' | ');
      expect(errorsOf(2)).toMatch(/does not exist/);
      expect(errorsOf(3)).toMatch(/warehouse .* does not exist/);
      expect(errorsOf(4)).toMatch(/more than zero/);
      expect(errorsOf(5)).toMatch(/not a positive number/);
      expect(errorsOf(6)).toMatch(/not a valid cost/);
      expect(errorsOf(7)).toBe('');
      expect(errorsOf(8)).toMatch(/same product and warehouse as line 7/);
      expect(errorsOf(9)).toMatch(/choose a default warehouse/);
    });

    it('hides costs and refuses to set them without inventory.cost.view', async () => {
      const w = await newWarehouse('P');
      const sku = await newProduct();
      const clerk = userWith('inventory.stock.adjust');
      const r = await importCsv(`sku,warehouse,quantity,unit_cost\n${sku},${w.code},1,9\n`, true, undefined, clerk);
      expect(r.totalValue).toBeUndefined();
      expect(r.rows[0].unitCost).toBeUndefined();
      expect(r.rows[0].errors[0]).toMatch(/inventory.cost.view/);
    });

    it('refuses a file without the required columns', async () => {
      await expect(importCsv('code,qty\nA,1\n', true, undefined, manager())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
