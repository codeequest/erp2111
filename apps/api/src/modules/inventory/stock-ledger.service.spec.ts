import { Prisma, StockMoveType } from '@prisma/client';
import { Decimal } from '../../common/decimal';
import { StockLedgerService } from './stock-ledger.service';

/**
 * In-memory stand-in for the transaction client: just enough of Prisma for the
 * ledger (products, balances, settings, moves).
 */
function fakeTx(opts: {
  products: { id: string; sku: string; averageCost: string }[];
  balances?: { productId: string; warehouseId: string; quantity: string }[];
  allowNegative?: boolean;
}) {
  const products = new Map(
    opts.products.map((p) => [p.id, { ...p, averageCost: new Decimal(p.averageCost) }]),
  );
  const balances = new Map(
    (opts.balances ?? []).map((b) => [`${b.productId}|${b.warehouseId}`, new Decimal(b.quantity)]),
  );
  const moves: Prisma.StockMoveCreateManyInput[] = [];
  const lockedIds: string[][] = [];

  const tx = {
    $queryRaw: jest.fn(async (sql: Prisma.Sql) => {
      const ids = sql.values.filter((v): v is string => typeof v === 'string');
      lockedIds.push(ids);
      return ids
        .filter((id) => products.has(id))
        .map((id) => ({
          id,
          sku: products.get(id)!.sku,
          average_cost: products.get(id)!.averageCost,
        }));
    }),
    companySettings: {
      findUnique: async () => ({ allowNegativeStock: opts.allowNegative ?? false }),
    },
    stockBalance: {
      groupBy: async ({ where }: { where: { productId: { in: string[] } } }) =>
        where.productId.in.map((productId) => ({
          productId,
          _sum: {
            quantity: [...balances.entries()]
              .filter(([k]) => k.startsWith(productId + '|'))
              .reduce((s, [, q]) => s.plus(q), new Decimal(0)),
          },
        })),
      upsert: async ({ where, create, update }: any) => {
        const key = `${where.productId_warehouseId.productId}|${where.productId_warehouseId.warehouseId}`;
        const next = balances.has(key)
          ? balances.get(key)!.plus(update.quantity.increment)
          : new Decimal(create.quantity);
        balances.set(key, next);
        return { quantity: next };
      },
    },
    warehouse: {
      findUnique: async ({ where }: any) => ({ id: where.id, code: where.id.toUpperCase() }),
    },
    product: {
      update: async ({ where, data }: any) => {
        products.get(where.id)!.averageCost = data.averageCost;
      },
    },
    stockMove: { createMany: async ({ data }: any) => moves.push(...data) },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, products, balances, moves, lockedIds };
}

const d = (v: string) => new Decimal(v);
const ledger = new StockLedgerService();

describe('StockLedgerService.post', () => {
  it('writes a move and updates the balance', async () => {
    const f = fakeTx({ products: [{ id: 'p1', sku: 'COLA', averageCost: '1' }] });
    await ledger.post(f.tx, {
      userId: 'u',
      lines: [
        { productId: 'p1', warehouseId: 'main', type: StockMoveType.ADJUSTMENT, quantity: d('5') },
      ],
    });
    expect(f.balances.get('p1|main')?.toString()).toBe('5');
    expect(f.moves).toHaveLength(1);
    // valued at the current average cost
    expect(f.moves[0].unitCost?.toString()).toBe('1');
  });

  it('updates the weighted average cost for incoming stock with a cost', async () => {
    const f = fakeTx({
      products: [{ id: 'p1', sku: 'COLA', averageCost: '2' }],
      balances: [{ productId: 'p1', warehouseId: 'main', quantity: '10' }],
    });
    await ledger.post(f.tx, {
      userId: 'u',
      lines: [
        {
          productId: 'p1',
          warehouseId: 'shop',
          type: StockMoveType.OPENING,
          quantity: d('30'),
          unitCost: d('3'),
        },
      ],
    });
    // (10 × 2 + 30 × 3) / 40 = 2.75, stock in ANOTHER warehouse counts too
    expect(f.products.get('p1')!.averageCost.toString()).toBe('2.75');
  });

  it('refuses negative stock by default, naming the product and warehouse', async () => {
    const f = fakeTx({
      products: [{ id: 'p1', sku: 'COLA', averageCost: '1' }],
      balances: [{ productId: 'p1', warehouseId: 'main', quantity: '2' }],
    });
    await expect(
      ledger.post(f.tx, {
        userId: 'u',
        lines: [
          {
            productId: 'p1',
            warehouseId: 'main',
            type: StockMoveType.ADJUSTMENT,
            quantity: d('-5'),
          },
        ],
      }),
    ).rejects.toThrow('Not enough stock of COLA in MAIN: 3 missing');
    expect(f.moves).toHaveLength(0);
  });

  it('allows negative stock when the company setting is on', async () => {
    const f = fakeTx({
      products: [{ id: 'p1', sku: 'COLA', averageCost: '1' }],
      allowNegative: true,
    });
    await ledger.post(f.tx, {
      userId: 'u',
      lines: [
        { productId: 'p1', warehouseId: 'main', type: StockMoveType.ADJUSTMENT, quantity: d('-1') },
      ],
    });
    expect(f.balances.get('p1|main')?.toString()).toBe('-1');
  });

  it('locks products in id order to avoid deadlocks', async () => {
    const f = fakeTx({
      products: [
        { id: 'b', sku: 'B', averageCost: '1' },
        { id: 'a', sku: 'A', averageCost: '1' },
      ],
    });
    await ledger.post(f.tx, {
      userId: 'u',
      lines: [
        { productId: 'b', warehouseId: 'main', type: StockMoveType.ADJUSTMENT, quantity: d('1') },
        { productId: 'a', warehouseId: 'main', type: StockMoveType.ADJUSTMENT, quantity: d('1') },
      ],
    });
    expect(f.lockedIds[0]).toEqual(['a', 'b']);
  });

  it('rejects zero quantities and costs on outgoing stock', async () => {
    const f = fakeTx({ products: [{ id: 'p1', sku: 'COLA', averageCost: '1' }] });
    await expect(
      ledger.post(f.tx, {
        userId: 'u',
        lines: [
          {
            productId: 'p1',
            warehouseId: 'main',
            type: StockMoveType.ADJUSTMENT,
            quantity: d('0'),
          },
        ],
      }),
    ).rejects.toThrow('cannot be zero');
    await expect(
      ledger.post(f.tx, {
        userId: 'u',
        lines: [
          {
            productId: 'p1',
            warehouseId: 'main',
            type: StockMoveType.OPENING,
            quantity: d('-1'),
            unitCost: d('1'),
          },
        ],
      }),
    ).rejects.toThrow('Only incoming stock can carry a cost');
  });

  it('fails when a product does not exist', async () => {
    const f = fakeTx({ products: [] });
    await expect(
      ledger.post(f.tx, {
        userId: 'u',
        lines: [
          {
            productId: 'ghost',
            warehouseId: 'main',
            type: StockMoveType.ADJUSTMENT,
            quantity: d('1'),
          },
        ],
      }),
    ).rejects.toThrow('Product ghost not found');
  });
});
