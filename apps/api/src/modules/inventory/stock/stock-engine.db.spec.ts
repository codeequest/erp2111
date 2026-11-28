/**
 * StockEngine against a REAL PostgreSQL database (locks, triggers, concurrency).
 *
 * Runs only when TEST_DATABASE_URL is set, and must point to a separate test
 * database — never the real one. Setup once:
 *   echo "CREATE DATABASE erp_test;" | npx prisma db execute --stdin --url <main DATABASE_URL>
 *   DATABASE_URL=<test url> npx prisma migrate deploy
 * Run:
 *   TEST_DATABASE_URL="postgresql://erp:erp@localhost:5432/erp_test?schema=public" pnpm test stock-engine
 *
 * Each test uses its own new product, so tests never see each other's stock.
 */
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestUser } from '../../../common/types/request-user';
import { StockEngine } from './stock-engine.service';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('StockEngine (database)', () => {
  if (url && /\/erp(\?|$)/.test(url)) throw new Error('TEST_DATABASE_URL must not be the main "erp" database');

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const engine = new StockEngine(prisma as unknown as PrismaService);
  const run = Math.random().toString(36).slice(2, 8);
  let user: RequestUser;
  let unitId: string;
  let w1: string;
  let w2: string;

  const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn);
  const doc = () => ({ sourceType: 'Test', sourceId: randomUUID(), reference: `T-${run}` });

  async function newProduct() {
    const p = await prisma.product.create({
      data: { sku: `T-${run}-${randomUUID().slice(0, 8)}`, name: 'Test product', baseUnitId: unitId },
    });
    return p.id;
  }

  async function balance(productId: string, warehouseId: string) {
    const b = await prisma.stockBalance.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    return { quantity: b?.quantity.toString() ?? '0', reserved: b?.reserved.toString() ?? '0' };
  }

  async function avgCost(productId: string) {
    return (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).averageCost.toString();
  }

  async function receive(productId: string, warehouseId: string, qty: string, cost: string) {
    return tx((t) =>
      engine.post(t, { ...doc(), lines: [{ productId, warehouseId, type: 'RECEIPT', quantity: qty, unitCost: cost }] }, user),
    );
  }

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `stock-${run}@test.local`, passwordHash: 'x', fullName: 'Stock test' },
    });
    user = { id: u.id, email: u.email, fullName: u.fullName, roles: [], permissions: new Set() };
    unitId = (await prisma.unit.create({ data: { code: `U${run}`, name: 'Test unit' } })).id;
    w1 = (await prisma.warehouse.create({ data: { code: `A${run}`, name: 'Test A' } })).id;
    w2 = (await prisma.warehouse.create({ data: { code: `B${run}`, name: 'Test B' } })).id;
    await prisma.companySettings.upsert({
      where: { id: 1 },
      update: { allowNegativeStock: false },
      create: { name: 'Test company', allowNegativeStock: false },
    });
  });

  afterAll(() => prisma.$disconnect());

  it('posts receipts: ledger, balance, weighted average cost and audit', async () => {
    const p = await newProduct();
    await receive(p, w1, '10', '5');
    await receive(p, w2, '30', '7');

    expect(await balance(p, w1)).toEqual({ quantity: '10', reserved: '0' });
    expect(await balance(p, w2)).toEqual({ quantity: '30', reserved: '0' });
    expect(await avgCost(p)).toBe('6.5'); // average is company-wide
    expect(await prisma.stockMove.count({ where: { productId: p } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'stock.post', userId: user.id } })).toBeGreaterThan(0);
  });

  it('sends deliveries out at average cost', async () => {
    const p = await newProduct();
    await receive(p, w1, '10', '4');
    const [move] = await tx((t) =>
      engine.post(t, { ...doc(), lines: [{ productId: p, warehouseId: w1, type: 'DELIVERY', quantity: '-3' }] }, user),
    );
    expect(move.unitCost.toString()).toBe('4');
    expect((await balance(p, w1)).quantity).toBe('7');
  });

  it('blocks negative stock and writes nothing', async () => {
    const p = await newProduct();
    await receive(p, w1, '2', '1');
    await expect(
      tx((t) =>
        engine.post(t, { ...doc(), lines: [{ productId: p, warehouseId: w1, type: 'DELIVERY', quantity: '-3' }] }, user),
      ),
    ).rejects.toThrow(/Not enough stock .* on hand 2, requested 3/);
    expect((await balance(p, w1)).quantity).toBe('2');
    expect(await prisma.stockMove.count({ where: { productId: p } })).toBe(1);
  });

  it('allows negative stock when asked', async () => {
    const p = await newProduct();
    await tx((t) =>
      engine.post(
        t,
        { ...doc(), allowNegative: true, lines: [{ productId: p, warehouseId: w1, type: 'DELIVERY', quantity: '-3' }] },
        user,
      ),
    );
    expect((await balance(p, w1)).quantity).toBe('-3');
  });

  it('refuses to post the same document line twice', async () => {
    const p = await newProduct();
    const d = doc();
    const line = { productId: p, warehouseId: w1, type: 'RECEIPT' as const, quantity: '1', unitCost: '1', sourceLineId: randomUUID() };
    await tx((t) => engine.post(t, { ...d, lines: [line] }, user));
    await expect(tx((t) => engine.post(t, { ...d, lines: [line] }, user))).rejects.toBeInstanceOf(ConflictException);
    expect((await balance(p, w1)).quantity).toBe('1');
  });

  it('refuses invalid lines with a clear message', async () => {
    const p = await newProduct();
    await expect(
      tx((t) => engine.post(t, { ...doc(), lines: [{ productId: p, warehouseId: w1, type: 'ADJUSTMENT', quantity: '1' }] }, user)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transfers stock between warehouses without changing the average cost', async () => {
    const p = await newProduct();
    await receive(p, w1, '10', '3');
    const moves = await tx((t) =>
      engine.transfer(t, { ...doc(), fromWarehouseId: w1, toWarehouseId: w2, lines: [{ productId: p, quantity: '4' }] }, user),
    );
    expect(moves).toHaveLength(2);
    expect(moves[0].transferId).toBe(moves[1].transferId);
    expect((await balance(p, w1)).quantity).toBe('6');
    expect((await balance(p, w2)).quantity).toBe('4');
    expect(await avgCost(p)).toBe('3');
  });

  it('reverses a move once, and both legs of a transfer together', async () => {
    const p = await newProduct();
    const [receipt] = await receive(p, w1, '10', '3');
    const transfer = await tx((t) =>
      engine.transfer(t, { ...doc(), fromWarehouseId: w1, toWarehouseId: w2, lines: [{ productId: p, quantity: '4' }] }, user),
    );

    const reversed = await tx((t) => engine.reverse(t, { ...doc(), reason: 'Wrong warehouse', moveIds: [transfer[0].id] }, user));
    expect(reversed).toHaveLength(2);
    expect((await balance(p, w1)).quantity).toBe('10');
    expect((await balance(p, w2)).quantity).toBe('0');

    await tx((t) => engine.reverse(t, { ...doc(), reason: 'Wrong supplier', moveIds: [receipt.id] }, user));
    expect((await balance(p, w1)).quantity).toBe('0');
    await expect(
      tx((t) => engine.reverse(t, { ...doc(), reason: 'Again', moveIds: [receipt.id] }, user)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reserves only available stock and releases without going below zero', async () => {
    const p = await newProduct();
    await receive(p, w1, '5', '1');
    await tx((t) => engine.reserve(t, [{ productId: p, warehouseId: w1, quantity: '3' }]));
    expect(await balance(p, w1)).toEqual({ quantity: '5', reserved: '3' });

    await expect(
      tx((t) => engine.reserve(t, [{ productId: p, warehouseId: w1, quantity: '3' }])),
    ).rejects.toThrow(/available 2, requested 3/);

    await tx((t) => engine.release(t, [{ productId: p, warehouseId: w1, quantity: '10' }]));
    expect((await balance(p, w1)).reserved).toBe('0');
  });

  it('lets only one of two simultaneous deliveries take the last unit', async () => {
    const p = await newProduct();
    await receive(p, w1, '1', '1');
    const deliver = () =>
      tx((t) =>
        engine.post(t, { ...doc(), lines: [{ productId: p, warehouseId: w1, type: 'DELIVERY', quantity: '-1' }] }, user),
      );

    const results = await Promise.allSettled([deliver(), deliver()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await balance(p, w1)).quantity).toBe('0');
  });

  it('keeps the ledger append-only (database trigger)', async () => {
    const p = await newProduct();
    const [move] = await receive(p, w1, '1', '1');
    await expect(prisma.stockMove.update({ where: { id: move.id }, data: { reason: 'edited' } })).rejects.toThrow(
      /append-only/,
    );
    await expect(prisma.stockMove.delete({ where: { id: move.id } })).rejects.toThrow(/append-only/);
  });

  it('finds no drift between balances and the ledger', async () => {
    expect(await engine.findDrift(prisma as unknown as PrismaService)).toEqual([]);
  });
});
