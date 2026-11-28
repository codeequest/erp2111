/**
 * Stock levels, ledger and consistency check against a REAL test database.
 * Runs only when TEST_DATABASE_URL is set (see stock-engine.db.spec.ts).
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { PermissionCode } from '@erp/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestUser } from '../../../common/types/request-user';
import { CatalogService } from '../catalog.service';
import { StockLevelsQueryDto, StockMovesQueryDto } from '../dto/stock-query.dto';
import { StockEngine } from './stock-engine.service';
import { StockReportsService } from './stock-reports.service';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('Stock reports (database)', () => {
  if (url && /\/erp(\?|$)/.test(url)) throw new Error('TEST_DATABASE_URL must not be the main "erp" database');

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const db = prisma as unknown as PrismaService;
  const engine = new StockEngine(db);
  const reports = new StockReportsService(db, new CatalogService(db), engine);
  const run = Math.random().toString(36).slice(2, 8).toUpperCase();
  let userId: string;
  let w1: string;
  let w2: string;
  let a: string; // 10 in W1 + 5 in W2, min 20 -> low; 3 reserved in W1
  let b: string; // 4 in W1, min 2 -> fine
  let c: string; // no stock, min 0

  const userWith = (...perms: PermissionCode[]): RequestUser => ({
    id: userId,
    email: 'r@test',
    fullName: 'Reports test',
    roles: [],
    permissions: new Set(perms),
  });
  const viewer = () => userWith('inventory.stock.read');
  const costViewer = () => userWith('inventory.stock.read', 'inventory.cost.view');

  const levelsQuery = (extra: Partial<StockLevelsQueryDto> = {}) =>
    Object.assign(new StockLevelsQueryDto(), { search: `R-${run}`, ...extra });
  const movesQuery = (extra: Partial<StockMovesQueryDto> = {}) => Object.assign(new StockMovesQueryDto(), extra);

  async function post(productId: string, warehouseId: string, type: 'OPENING' | 'DELIVERY', quantity: string, unitCost?: string) {
    await prisma.$transaction((tx) =>
      engine.post(
        tx,
        { sourceType: 'Test', sourceId: randomUUID(), reference: `REF-${run}`, lines: [{ productId, warehouseId, type, quantity, unitCost }] },
        costViewer(),
      ),
    );
  }

  beforeAll(async () => {
    userId = (
      await prisma.user.create({ data: { email: `rep-${run}@test.local`, passwordHash: 'x', fullName: 'Reports test' } })
    ).id;
    const unitId = (await prisma.unit.create({ data: { code: `R${run}`, name: 'Test unit' } })).id;
    w1 = (await prisma.warehouse.create({ data: { code: `RA${run}`, name: 'Reports A' } })).id;
    w2 = (await prisma.warehouse.create({ data: { code: `RB${run}`, name: 'Reports B' } })).id;
    const product = async (suffix: string, minStock: string) =>
      (await prisma.product.create({ data: { sku: `R-${run}-${suffix}`, name: `Report ${suffix}`, baseUnitId: unitId, minStock } })).id;
    a = await product('A', '20');
    b = await product('B', '2');
    c = await product('C', '0');

    await post(a, w1, 'OPENING', '10', '2');
    await post(a, w2, 'OPENING', '5', '2');
    await post(b, w1, 'OPENING', '6', '3');
    await post(b, w1, 'DELIVERY', '-2');
    await prisma.$transaction((tx) => engine.reserve(tx, [{ productId: a, warehouseId: w1, quantity: '3' }]));
  });
  afterAll(() => prisma.$disconnect());

  describe('levels', () => {
    it('totals all warehouses, with reserved, available and low stock', async () => {
      const page = await reports.levels(levelsQuery(), viewer());
      const byId = new Map(page.items.map((r) => [r.product.id, r]));
      expect(byId.get(a)).toMatchObject({ onHand: '15', reserved: '3', available: '12', low: true, minStock: '20' });
      expect(byId.get(b)).toMatchObject({ onHand: '4', low: false });
      expect(byId.get(c)).toMatchObject({ onHand: '0', low: false });
      expect(page.summary).toEqual({ products: 3, low: 1 });
      expect(byId.get(a)).not.toHaveProperty('value');
    });

    it('shows one warehouse, but judges low stock on the total', async () => {
      const page = await reports.levels(levelsQuery({ warehouseId: w2 }), viewer());
      const rowA = page.items.find((r) => r.product.id === a)!;
      expect(rowA).toMatchObject({ onHand: '5', reserved: '0', totalOnHand: '15', low: true });
    });

    it('filters in-stock and low-stock products', async () => {
      const inStock = await reports.levels(levelsQuery({ inStock: true }), viewer());
      expect(inStock.items.map((r) => r.product.id).sort()).toEqual([a, b].sort());
      const low = await reports.levels(levelsQuery({ lowStock: true }), viewer());
      expect(low.items.map((r) => r.product.id)).toEqual([a]);
    });

    it('shows value only with inventory.cost.view, and sorts by it', async () => {
      const page = await reports.levels(levelsQuery({ sort: 'value', order: 'desc' }), costViewer());
      expect(page.items.map((r) => r.value)).toEqual(['30.00', '12.00', '0.00']); // 15 x 2, 4 x 3, 0
      expect(page.summary.value).toBe('42.00');
      // Without the permission, sorting by value falls back to name (no hidden information leaks).
      const blind = await reports.levels(levelsQuery({ sort: 'value', order: 'desc' }), viewer());
      expect(blind.items.map((r) => r.product.sku)).toEqual([`R-${run}-C`, `R-${run}-B`, `R-${run}-A`]);
    });

    it('pages the results', async () => {
      const page = await reports.levels(levelsQuery({ pageSize: 2, page: 2, sort: 'sku' }), viewer());
      expect(page.total).toBe(3);
      expect(page.items.map((r) => r.product.sku)).toEqual([`R-${run}-C`]);
    });

    it('exports rows with or without costs', async () => {
      const sheet = await reports.levelsRows(levelsQuery({ sort: 'sku' }), viewer());
      expect(sheet.columns.map((c) => c.header)).toEqual(
        ['sku', 'name', 'unit', 'warehouse', 'on_hand', 'reserved', 'available', 'min_stock', 'low_stock'],
      );
      expect(sheet.rows[0]).toEqual([`R-${run}-A`, 'Report A', `R${run}`, 'ALL', '15', '3', '12', '20', 'yes']);
      const withCost = await reports.levelsRows(levelsQuery({ sort: 'sku' }), costViewer());
      expect(withCost.columns.map((c) => c.header)).toEqual(expect.arrayContaining(['average_cost', 'value']));
    });
  });

  describe('moves', () => {
    it('lists newest first with the running balance per warehouse', async () => {
      const page = await reports.moves(movesQuery({ productId: b }), viewer());
      expect(page.total).toBe(2);
      expect(page.items.map((m) => [m.type, m.quantity, m.balanceAfter])).toEqual([
        ['DELIVERY', '-2', '4'],
        ['OPENING', '6', '6'],
      ]);
      expect(page.items[0]).toMatchObject({ reference: `REF-${run}`, createdBy: 'Reports test', isReversal: false });
      expect(page.items[0]).not.toHaveProperty('unitCost');
    });

    it('keeps the running balance right when filtering by type', async () => {
      const page = await reports.moves(movesQuery({ productId: b, type: 'DELIVERY' }), costViewer());
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({ balanceAfter: '4', unitCost: '3' });
    });

    it('filters by warehouse and by date', async () => {
      const inW2 = await reports.moves(movesQuery({ productId: a, warehouseId: w2 }), viewer());
      expect(inW2.items.map((m) => m.warehouse.id)).toEqual([w2]);

      const future = new Date(Date.now() + 86_400_000).toISOString();
      const past = new Date(Date.now() - 86_400_000).toISOString();
      expect((await reports.moves(movesQuery({ productId: a, from: future }), viewer())).total).toBe(0);
      expect((await reports.moves(movesQuery({ productId: a, from: past, to: future }), viewer())).total).toBe(2);
    });

    it('finds moves by document reference', async () => {
      const page = await reports.moves(movesQuery({ search: `ref-${run}` }), viewer());
      expect(page.total).toBe(4);
    });
  });

  it('reports a consistent ledger', async () => {
    // Only the ledger part: other test files reserve stock directly through the
    // engine (no sales order) while this one runs in parallel.
    expect((await reports.consistency()).differences).toEqual([]);
  });
});
