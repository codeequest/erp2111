import { Prisma } from '@prisma/client';
import { PermissionCode } from '@erp/shared';
import { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { StockLevelsQueryDto, StockMovesQueryDto } from './dto/stock.dto';
import { StockService, matchesFilter } from './stock.service';

const D = (v: number | string) => new Prisma.Decimal(v);

const MAIN = { id: 'w-main', code: 'MAIN', name: 'Main', isActive: true };
const SFAX = { id: 'w-sfax', code: 'SFX', name: 'Sfax', isActive: true };

function product(
  id: string,
  minStock: number,
  avgCost: number,
  balances: [string, number][],
  isActive = true,
) {
  return {
    id,
    sku: id.toUpperCase(),
    name: `Product ${id}`,
    isActive,
    minStock: D(minStock),
    averageCost: D(avgCost),
    baseUnit: { id: 'u', code: 'PCS' },
    category: null,
    stockBalances: balances.map(([warehouseId, q]) => ({ warehouseId, quantity: D(q) })),
  };
}

// coffee: 23 + 12 = 35, min 10  -> ok
// oil:    5,            min 12  -> low
// tea:    nothing,      min 0   -> out, not low (no minimum set)
const PRODUCTS = [
  product('coffee', 10, 8.2, [
    ['w-main', 23],
    ['w-sfax', 12],
  ]),
  product('oil', 12, 17.5, [['w-main', 5]]),
  product('tea', 0, 3, []),
];

const user = (...perms: PermissionCode[]): RequestUser => ({
  id: 'u1',
  email: 'a@b.c',
  fullName: 'A',
  roles: [],
  permissions: new Set(perms),
});

function service(findMany = jest.fn().mockResolvedValue(PRODUCTS)) {
  const prisma = {
    warehouse: { findMany: jest.fn().mockResolvedValue([MAIN, SFAX]) },
    product: { findMany },
  } as unknown as PrismaService;
  return new StockService(prisma);
}

const levelsQuery = (q: Partial<StockLevelsQueryDto> = {}) =>
  Object.assign(new StockLevelsQueryDto(), q);

describe('StockService.levels', () => {
  it('sums each product over all warehouses and flags low stock', async () => {
    const res = await service().levels(levelsQuery(), user());
    const byId = Object.fromEntries(res.items.map((r) => [r.product.id, r]));
    expect(byId.coffee.total).toBe('35.0000');
    expect(byId.coffee.byWarehouse).toEqual({ 'w-main': '23.0000', 'w-sfax': '12.0000' });
    expect(byId.coffee.isLow).toBe(false);
    expect(byId.oil.isLow).toBe(true);
    expect(byId.tea.isLow).toBe(false);
    expect(res.warehouses.map((w) => w.code)).toEqual(['MAIN', 'SFX']);
  });

  it('applies the stock filters', async () => {
    const ids = async (stock: StockLevelsQueryDto['stock']) =>
      (await service().levels(levelsQuery({ stock }), user())).items.map((r) => r.product.id);
    expect(await ids('low')).toEqual(['oil']);
    expect(await ids('out')).toEqual(['tea']);
    expect(await ids('inStock')).toEqual(['coffee', 'oil']);
  });

  it('limits quantities to one warehouse but keeps "low" on the overall total', async () => {
    const res = await service().levels(levelsQuery({ warehouseId: 'w-sfax' }), user());
    const coffee = res.items.find((r) => r.product.id === 'coffee')!;
    expect(coffee.total).toBe('12.0000');
    expect(coffee.byWarehouse).toEqual({ 'w-sfax': '12.0000' });
    expect(coffee.isLow).toBe(false); // judged on the overall 35, not the 12 in Sfax
    expect(res.warehouses).toEqual([SFAX]);
  });

  it('returns stock value only with inventory.cost.view', async () => {
    const without = await service().levels(levelsQuery(), user());
    expect(without.totalValue).toBeUndefined();
    expect(without.items[0]).not.toHaveProperty('value');

    const withCost = await service().levels(levelsQuery(), user('inventory.cost.view'));
    // 35 × 8.2 + 5 × 17.5 + 0 × 3
    expect(withCost.totalValue).toBe('374.50');
  });

  it('paginates after filtering and reports the filtered total', async () => {
    const res = await service().levels(levelsQuery({ page: 2, pageSize: 2 }), user());
    expect(res.total).toBe(3);
    expect(res.items.map((r) => r.product.id)).toEqual(['tea']);
  });
});

describe('StockService.moves', () => {
  it('hides unit cost without inventory.cost.view and filters by date range', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'm1',
        createdAt: new Date('2026-11-20T10:00:00Z'),
        type: 'ADJUSTMENT',
        quantity: D(-2),
        unitCost: D('8.2'),
        reference: null,
        reason: 'Damaged',
        product: { id: 'p', sku: 'P', name: 'P', baseUnit: { code: 'PCS' } },
        warehouse: { id: 'w', code: 'MAIN', name: 'Main' },
        createdBy: { id: 'u1', fullName: 'A' },
      },
    ]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      stockMove: { findMany, count },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    } as unknown as PrismaService;

    const from = new Date('2026-11-19T23:00:00Z');
    const to = new Date('2026-11-20T23:00:00Z');
    const query = Object.assign(new StockMovesQueryDto(), { from, to, type: 'ADJUSTMENT' });
    const res = await new StockService(prisma).moves(query, user());

    expect(res.items[0]).not.toHaveProperty('unitCost');
    expect(res.items[0].quantity).toBe('-2.0000');
    expect(findMany.mock.calls[0][0].where).toEqual({
      type: 'ADJUSTMENT',
      createdAt: { gte: from, lt: to },
    });
  });
});

describe('matchesFilter', () => {
  it('treats zero and negative stock as out of stock', () => {
    expect(matchesFilter('out', D(0), false)).toBe(true);
    expect(matchesFilter('out', D(-1), false)).toBe(true);
    expect(matchesFilter('inStock', D(0), false)).toBe(false);
  });
});
