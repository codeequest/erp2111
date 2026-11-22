import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestUser } from '../../common/types/request-user';
import { nextDocumentNumber } from '../../common/document-number';
import { PrismaService } from '../../prisma/prisma.service';
import { AdjustmentsService } from './adjustments.service';
import { CreateAdjustmentDto } from './dto/stock.dto';

const D = (v: number | string) => new Prisma.Decimal(v);
const user = { id: 'u1', permissions: new Set() } as unknown as RequestUser;

const WAREHOUSE = { id: 'w1', code: 'MAIN', name: 'Main', isActive: true };
const product = (id: string, cost = 5) => ({
  id,
  sku: id.toUpperCase(),
  name: id,
  averageCost: D(cost),
  baseUnit: { code: 'PCS' },
});

/** Fake transaction: `balances` is the on-hand quantity per product in w1. */
function fakeTx(balances: Record<string, number>, warehouse = WAREHOUSE) {
  const tx = {
    warehouse: { findUnique: jest.fn().mockResolvedValue(warehouse) },
    product: {
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          where.id.in.filter((id: string) => id in balances).map((id: string) => product(id)),
        ),
      ),
    },
    documentSequence: {
      findUnique: jest.fn().mockResolvedValue({ id: 's' }),
      update: jest.fn().mockResolvedValue({ prefix: 'ADJ', padding: 5, nextNumber: 8 }),
    },
    $executeRaw: jest.fn(),
    // lockBalance: the product id is the first interpolated value of the SELECT
    $queryRaw: jest.fn((_strings: TemplateStringsArray, productId: string) =>
      Promise.resolve([{ quantity: D(balances[productId]) }]),
    ),
    stockMove: { create: jest.fn() },
    stockBalance: { update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
  } as unknown as PrismaService;
  return { tx, service: new AdjustmentsService(prisma) };
}

const dto = (mode: 'count' | 'delta', lines: [string, number][]): CreateAdjustmentDto =>
  Object.assign(new CreateAdjustmentDto(), {
    warehouseId: 'w1',
    mode,
    reason: 'Inventory count',
    lines: lines.map(([productId, quantity]) => ({ productId, quantity })),
  });

describe('AdjustmentsService.create', () => {
  it('count mode posts only the difference and skips matching lines', async () => {
    const { tx, service } = fakeTx({ a: 23, b: 5 });
    const res = await service.create(
      dto('count', [
        ['a', 20],
        ['b', 5],
      ]),
      user,
    );

    expect(res.reference).toBe(`ADJ-${new Date().getFullYear()}-00007`);
    expect(res.unchanged).toBe(1);
    expect(res.lines).toEqual([
      expect.objectContaining({ before: '23.0000', change: '-3.0000', after: '20.0000' }),
    ]);
    const move = tx.stockMove.create.mock.calls[0][0].data;
    expect(move).toMatchObject({ type: 'ADJUSTMENT', reason: 'Inventory count' });
    expect(move.quantity.toString()).toBe('-3');
    expect(move.unitCost.toString()).toBe('5'); // valued at average cost
    expect(tx.stockBalance.update.mock.calls[0][0].data.quantity.toString()).toBe('20');
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('delta mode adds the change to the locked balance', async () => {
    const { service } = fakeTx({ a: 2 });
    const res = await service.create(dto('delta', [['a', 4.5]]), user);
    expect(res.lines[0]).toMatchObject({ change: '4.5000', after: '6.5000' });
  });

  it('refuses to make stock negative and reports every failing line', async () => {
    const { tx, service } = fakeTx({ a: 2, b: 1 });
    const err = await service
      .create(
        dto('delta', [
          ['a', -3],
          ['b', -5],
        ]),
        user,
      )
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse().message).toHaveLength(2);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('refuses an adjustment where nothing changes', async () => {
    const { service } = fakeTx({ a: 5 });
    await expect(service.create(dto('count', [['a', 5]]), user)).rejects.toThrow(
      /Nothing to adjust/,
    );
  });

  it('refuses an inactive warehouse', async () => {
    const { service } = fakeTx({ a: 5 }, { ...WAREHOUSE, isActive: false });
    await expect(service.create(dto('delta', [['a', 1]]), user)).rejects.toThrow(/inactive/);
  });

  it('refuses unknown products, duplicates and negative counts before touching the database', async () => {
    const { tx, service } = fakeTx({ a: 5 });
    await expect(service.create(dto('delta', [['zzz', 1]]), user)).rejects.toThrow(/Unknown/);
    await expect(
      service.create(
        dto('count', [
          ['a', 1],
          ['a', 2],
        ]),
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(dto('count', [['a', -1]]), user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.stockMove.create).not.toHaveBeenCalled();
  });
});

describe('nextDocumentNumber', () => {
  it('formats prefix-year-padded number from the incremented sequence', async () => {
    const tx = {
      documentSequence: {
        findUnique: jest.fn().mockResolvedValue({ id: 's' }),
        update: jest.fn().mockResolvedValue({ prefix: 'ADJ', padding: 5, nextNumber: 13 }),
      },
    } as unknown as Prisma.TransactionClient;
    await expect(nextDocumentNumber(tx, 'STOCK_ADJUSTMENT', new Date('2026-06-01'))).resolves.toBe(
      'ADJ-2026-00012',
    );
  });

  it('starts a new year with last year prefix and padding', async () => {
    const createMany = jest.fn();
    const tx = {
      documentSequence: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ prefix: 'ADJ', padding: 4 }),
        createMany,
        update: jest.fn().mockResolvedValue({ prefix: 'ADJ', padding: 4, nextNumber: 2 }),
      },
    } as unknown as Prisma.TransactionClient;
    await expect(nextDocumentNumber(tx, 'STOCK_ADJUSTMENT', new Date('2027-01-02'))).resolves.toBe(
      'ADJ-2027-0001',
    );
    expect(createMany.mock.calls[0][0]).toEqual({
      data: [{ docType: 'STOCK_ADJUSTMENT', year: 2027, prefix: 'ADJ', padding: 4 }],
      skipDuplicates: true,
    });
  });
});
