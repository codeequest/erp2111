import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionCode } from '@erp/shared';
import { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService, toDetail, toListItem } from './products.service';
import { rethrowPrismaError } from './prisma-errors';

const D = (v: number | string) => new Prisma.Decimal(v);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    sku: 'SKU-1',
    barcode: null,
    name: 'Coffee',
    description: null,
    categoryId: null,
    baseUnitId: 'u1',
    taxRateId: null,
    salePrice: D('12.5'),
    averageCost: D('7.25'),
    minStock: D(10),
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    category: null,
    baseUnit: { id: 'u1', code: 'PCS', name: 'Piece' },
    taxRate: { id: 't1', name: 'VAT 19%', rate: D(19) },
    stockBalances: [{ quantity: D('3.5') }, { quantity: D(2) }],
    ...overrides,
  } as unknown as Parameters<typeof toListItem>[0];
}

const user = (...perms: PermissionCode[]): RequestUser => ({
  id: 'user-1',
  email: 'a@b.c',
  fullName: 'A',
  roles: [],
  permissions: new Set(perms),
});

describe('product mapping', () => {
  it('hides the average cost without inventory.cost.view', () => {
    const item = toListItem(row(), false);
    expect(item).not.toHaveProperty('averageCost');
  });

  it('shows the average cost with inventory.cost.view', () => {
    expect(toListItem(row(), true).averageCost).toBe('7.2500');
  });

  it('sums on-hand stock over all warehouses and formats decimals as strings', () => {
    const item = toListItem(row(), false);
    expect(item.onHand).toBe('5.5000');
    expect(item.salePrice).toBe('12.5000');
    expect(item.minStock).toBe('10.0000');
  });

  it('formats the tax rate with 2 decimals and dates as ISO strings', () => {
    const detail = toDetail(row(), false);
    expect(detail.taxRate).toEqual({ id: 't1', name: 'VAT 19%', rate: '19.00' });
    expect(detail.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('rethrowPrismaError', () => {
  const known = (code: string, meta: Record<string, unknown>) =>
    new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test', meta });

  it('maps a duplicate SKU to 409 with a readable message', () => {
    expect(() => rethrowPrismaError(known('P2002', { target: ['sku'] }), 'Product')).toThrow(
      new ConflictException('A product with this SKU already exists'),
    );
  });

  it('maps an unknown category to 400', () => {
    expect(() =>
      rethrowPrismaError(known('P2003', { field_name: 'products_category_id_fkey' }), 'Product'),
    ).toThrow(new BadRequestException('Unknown category'));
  });

  it('re-throws unrelated errors unchanged', () => {
    const err = new Error('boom');
    expect(() => rethrowPrismaError(err, 'Product')).toThrow(err);
  });
});

describe('ProductsService', () => {
  function serviceWith(tx: Record<string, unknown>) {
    const prisma = {
      $transaction: (fn: (t: unknown) => unknown) => fn(tx),
    } as unknown as PrismaService;
    return new ProductsService(prisma);
  }

  it('refuses to change the base unit once stock has moved', async () => {
    const update = jest.fn();
    const service = serviceWith({
      product: { findUnique: jest.fn().mockResolvedValue(row()), update },
      stockMove: { count: jest.fn().mockResolvedValue(4) },
      auditLog: { create: jest.fn() },
    });
    await expect(
      service.update('p1', { baseUnitId: 'u2' }, user('inventory.product.write')),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('writes an audit row with before and after on update', async () => {
    const auditCreate = jest.fn();
    const service = serviceWith({
      product: {
        findUnique: jest.fn().mockResolvedValue(row()),
        update: jest.fn().mockResolvedValue(row({ salePrice: D(15) })),
      },
      stockMove: { count: jest.fn() },
      auditLog: { create: auditCreate },
    });
    const result = await service.update('p1', { salePrice: 15 }, user());
    expect(result.salePrice).toBe('15.0000');
    const audit = auditCreate.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: 'update', entity: 'Product', entityId: 'p1' });
    expect(audit.before.salePrice).toBe('12.5');
    expect(audit.after.salePrice).toBe('15');
  });

  it('returns 404 when deactivating an unknown product', async () => {
    const service = serviceWith({
      product: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.setActive('nope', false, user())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not write an audit row when the status does not change', async () => {
    const auditCreate = jest.fn();
    const service = serviceWith({
      product: { findUnique: jest.fn().mockResolvedValue(row({ isActive: false })) },
      auditLog: { create: auditCreate },
    });
    await service.setActive('p1', false, user());
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
