/**
 * Adjustments, transfers and document numbering against a REAL test database.
 * Runs only when TEST_DATABASE_URL is set (see stock-engine.db.spec.ts).
 */
import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { PermissionCode } from '@erp/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestUser } from '../../../common/types/request-user';
import { formatDocumentNumber, nextDocumentNumber } from '../../../common/numbering';
import { AdjustmentsService } from './adjustments.service';
import { StockEngine } from './stock-engine.service';
import { TransfersService } from './transfers.service';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describe('formatDocumentNumber', () => {
  it('pads the number', () => {
    expect(formatDocumentNumber('ADJ', 2026, 12, 5)).toBe('ADJ-2026-00012');
  });
});

describeDb('Stock documents (database)', () => {
  if (url && /\/erp(\?|$)/.test(url)) throw new Error('TEST_DATABASE_URL must not be the main "erp" database');

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const db = prisma as unknown as PrismaService;
  const engine = new StockEngine(db);
  const adjustments = new AdjustmentsService(db, engine);
  const transfers = new TransfersService(db, engine);
  const run = Math.random().toString(36).slice(2, 8).toUpperCase();
  let userId: string;
  let unitId: string;
  let w1: string;
  let w2: string;

  const userWith = (...perms: PermissionCode[]): RequestUser => ({
    id: userId,
    email: 'd@test',
    fullName: 'Docs test',
    roles: [],
    permissions: new Set(perms),
  });
  const manager = () => userWith('inventory.stock.adjust', 'inventory.stock.transfer', 'inventory.cost.view');
  const clerk = () => userWith('inventory.stock.adjust', 'inventory.stock.transfer');

  async function newProduct() {
    const p = await prisma.product.create({
      data: { sku: `D-${run}-${randomUUID().slice(0, 6)}`, name: 'Doc test', baseUnitId: unitId, averageCost: '4' },
    });
    return p.id;
  }
  async function onHand(productId: string, warehouseId: string) {
    const b = await prisma.stockBalance.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } });
    return b?.quantity.toString() ?? '0';
  }
  const stockIn = async (productId: string, qty: string) => {
    const a = await adjustments.create(
      { warehouseId: w1, reason: 'Found', lines: [{ productId, quantity: qty, unitCost: '4' }] },
      manager(),
    );
    await adjustments.post(a.id, manager());
  };

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `docs-${run}@test.local`, passwordHash: 'x', fullName: 'Docs test' },
    });
    userId = u.id;
    unitId = (await prisma.unit.create({ data: { code: `D${run}`, name: 'Test unit' } })).id;
    w1 = (await prisma.warehouse.create({ data: { code: `DA${run}`, name: 'Docs A' } })).id;
    w2 = (await prisma.warehouse.create({ data: { code: `DB${run}`, name: 'Docs B' } })).id;
  });
  afterAll(() => prisma.$disconnect());

  it('gives gap-free, unique numbers even when many documents start at once', async () => {
    const numbers = await Promise.all(
      Array.from({ length: 10 }, () => prisma.$transaction((tx) => nextDocumentNumber(tx, 'STOCK_COUNT'))),
    );
    expect(new Set(numbers).size).toBe(10);
    const n = numbers.map((x) => Number(x.split('-')[2])).sort((a, b) => a - b);
    expect(n[9] - n[0]).toBe(9); // consecutive
    expect(numbers[0]).toMatch(/^CNT-\d{4}-\d{5}$/);
  });

  describe('adjustments', () => {
    it('saves a draft without moving stock, then posts it', async () => {
      const p = await newProduct();
      const draft = await adjustments.create(
        { warehouseId: w1, reason: 'Found in back room', lines: [{ productId: p, quantity: '6', unitCost: '5' }] },
        manager(),
      );
      expect(draft.status).toBe('DRAFT');
      expect(draft.number).toMatch(/^ADJ-/);
      expect(draft.lines[0]).toMatchObject({ quantity: '6', unitCost: '5', onHand: '0' });
      expect(await onHand(p, w1)).toBe('0');

      const posted = await adjustments.post(draft.id, manager());
      expect(posted.status).toBe('POSTED');
      expect(posted.postedAt).not.toBeNull();
      expect(posted.lines[0].onHand).toBeUndefined();
      expect(await onHand(p, w1)).toBe('6');
      const move = await prisma.stockMove.findFirstOrThrow({ where: { sourceId: draft.id } });
      expect(move).toMatchObject({ type: 'ADJUSTMENT', reference: draft.number, reason: 'Found in back room' });
    });

    it('refuses to post twice, to change or cancel a posted adjustment', async () => {
      const p = await newProduct();
      await stockIn(p, '3');
      const a = await adjustments.create({ warehouseId: w1, reason: 'Broken', lines: [{ productId: p, quantity: '-1' }] }, clerk());
      await adjustments.post(a.id, clerk());
      await expect(adjustments.post(a.id, clerk())).rejects.toThrow(/only a draft can be validated/);
      await expect(adjustments.cancel(a.id, clerk())).rejects.toThrow(/only a draft can be cancelled/);
      await expect(
        adjustments.update(a.id, { warehouseId: w1, reason: 'x', lines: [{ productId: p, quantity: '-2' }] }, clerk()),
      ).rejects.toThrow(/only a draft can be changed/);
      expect(await onHand(p, w1)).toBe('2');
    });

    it('lets only one of two simultaneous validations go through', async () => {
      const p = await newProduct();
      const a = await adjustments.create({ warehouseId: w1, reason: 'Found', lines: [{ productId: p, quantity: '1' }] }, clerk());
      const results = await Promise.allSettled([adjustments.post(a.id, clerk()), adjustments.post(a.id, clerk())]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await onHand(p, w1)).toBe('1');
    });

    it('refuses to validate when stock would go negative, and stays a draft', async () => {
      const p = await newProduct();
      const a = await adjustments.create({ warehouseId: w1, reason: 'Lost', lines: [{ productId: p, quantity: '-5' }] }, clerk());
      await expect(adjustments.post(a.id, clerk())).rejects.toThrow(/Not enough stock/);
      expect((await adjustments.get(a.id, clerk())).status).toBe('DRAFT');
    });

    it('cancels a draft', async () => {
      const p = await newProduct();
      const a = await adjustments.create({ warehouseId: w1, reason: 'Oops', lines: [{ productId: p, quantity: '1' }] }, clerk());
      expect((await adjustments.cancel(a.id, clerk())).status).toBe('CANCELLED');
      expect(await prisma.stockMove.count({ where: { sourceId: a.id } })).toBe(0);
    });

    it('protects costs: hidden and not settable without inventory.cost.view, kept on edit', async () => {
      const p = await newProduct();
      await expect(
        adjustments.create({ warehouseId: w1, reason: 'x', lines: [{ productId: p, quantity: '1', unitCost: '9' }] }, clerk()),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const a = await adjustments.create(
        { warehouseId: w1, reason: 'x', lines: [{ productId: p, quantity: '2', unitCost: '9' }] },
        manager(),
      );
      const seenByClerk = await adjustments.get(a.id, clerk());
      expect(seenByClerk.lines[0]).not.toHaveProperty('unitCost');

      await adjustments.update(a.id, { warehouseId: w1, reason: 'edited', lines: [{ productId: p, quantity: '3' }] }, clerk());
      const after = await adjustments.get(a.id, manager());
      expect(after.lines[0]).toMatchObject({ quantity: '3', unitCost: '9' });
      expect(after.reason).toBe('edited');
    });

    it('refuses bad lines', async () => {
      const p = await newProduct();
      await expect(
        adjustments.create({ warehouseId: w1, reason: 'x', lines: [{ productId: p, quantity: '0' }] }, clerk()),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        adjustments.create(
          { warehouseId: w1, reason: 'x', lines: [{ productId: p, quantity: '1' }, { productId: p, quantity: '2' }] },
          clerk(),
        ),
      ).rejects.toThrow(/already on another line/);
      await expect(
        adjustments.create({ warehouseId: w1, reason: 'x', lines: [{ productId: p, quantity: '-1', unitCost: '2' }] }, manager()),
      ).rejects.toThrow(/only allowed when adding stock/);
    });
  });

  describe('transfers', () => {
    it('moves stock from one warehouse to another when validated', async () => {
      const p = await newProduct();
      await stockIn(p, '10');
      const t = await transfers.create({ fromWarehouseId: w1, toWarehouseId: w2, lines: [{ productId: p, quantity: '4' }] }, clerk());
      expect(t.status).toBe('DRAFT');
      expect(t.number).toMatch(/^TRF-/);
      expect(t.lines[0].onHand).toBe('10');
      expect(await onHand(p, w2)).toBe('0');

      await transfers.post(t.id, clerk());
      expect(await onHand(p, w1)).toBe('6');
      expect(await onHand(p, w2)).toBe('4');
      expect(await prisma.stockMove.count({ where: { sourceId: t.id } })).toBe(2);
    });

    it('refuses the same warehouse twice and a short source', async () => {
      const p = await newProduct();
      await expect(
        transfers.create({ fromWarehouseId: w1, toWarehouseId: w1, lines: [{ productId: p, quantity: '1' }] }, clerk()),
      ).rejects.toThrow(/two different warehouses/);
      const t = await transfers.create({ fromWarehouseId: w1, toWarehouseId: w2, lines: [{ productId: p, quantity: '1' }] }, clerk());
      await expect(transfers.post(t.id, clerk())).rejects.toThrow(/Not enough stock/);
      expect((await transfers.get(t.id)).status).toBe('DRAFT');
    });

    it('edits a draft and lists it with filters', async () => {
      const p = await newProduct();
      const t = await transfers.create({ fromWarehouseId: w1, toWarehouseId: w2, lines: [{ productId: p, quantity: '1' }] }, clerk());
      const edited = await transfers.update(
        t.id,
        { fromWarehouseId: w2, toWarehouseId: w1, notes: 'reversed', lines: [{ productId: p, quantity: '2' }] },
        clerk(),
      );
      expect(edited).toMatchObject({ notes: 'reversed', fromWarehouse: { id: w2 }, toWarehouse: { id: w1 } });
      const list = await transfers.list({ search: t.number, status: 'DRAFT', page: 1, pageSize: 25 });
      expect(list.items.map((x) => x.id)).toEqual([t.id]);
      expect(list.items[0].lineCount).toBe(1);
    });
  });

  it('leaves no drift between balances and the ledger', async () => {
    expect(await engine.findDrift(db)).toEqual([]);
  });
});
