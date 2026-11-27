import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionCode } from '@erp/shared';
import { ProductsService, toListItem } from './products.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from './catalog.service';
import { RequestUser } from '../../common/types/request-user';

const D = (v: string | number) => new Prisma.Decimal(v);

const userWith = (...perms: PermissionCode[]): RequestUser => ({
  id: '00000000-0000-0000-0000-000000000001',
  email: 'u@test',
  fullName: 'Test User',
  roles: [],
  permissions: new Set(perms),
});

const product = {
  id: '11111111-1111-1111-1111-111111111111',
  sku: 'SKU-1',
  barcode: null,
  name: 'Olive oil',
  description: null,
  categoryId: null,
  baseUnitId: '22222222-2222-2222-2222-222222222222',
  taxRateId: null,
  salePrice: D('12.5'),
  averageCost: D('7.25'),
  lastPurchaseCost: D('7.25'),
  lastPurchaseAt: null,
  minStock: D(0),
  imageFile: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  category: null,
  baseUnit: { id: '22222222-2222-2222-2222-222222222222', code: 'PCS', name: 'Piece' },
};

function serviceWith(prisma: Record<string, unknown>) {
  return new ProductsService(prisma as unknown as PrismaService, {} as unknown as CatalogService);
}

describe('toListItem', () => {
  it('hides average cost without inventory.cost.view', () => {
    const item = toListItem(product, D(4), false);
    expect(item).not.toHaveProperty('averageCost');
    expect(item.stockOnHand).toBe('4');
    expect(item.salePrice).toBe('12.5');
  });

  it('shows average cost with inventory.cost.view', () => {
    expect(toListItem(product, undefined, true).averageCost).toBe('7.25');
  });

  it('reports zero stock when there is no balance', () => {
    expect(toListItem(product, undefined, false).stockOnHand).toBe('0');
  });
});

describe('ProductsService', () => {
  it('rejects a duplicate SKU with 409', async () => {
    const service = serviceWith({
      product: { findFirst: jest.fn().mockResolvedValue({ name: 'Existing' }) },
    });
    await expect(
      service.create(
        { sku: 'SKU-1', name: 'X', baseUnitId: product.baseUnitId, salePrice: '1' },
        userWith('inventory.product.write'),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('returns 404 when updating a missing product', async () => {
    const service = serviceWith({ product: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(
      service.update(product.id, { name: 'New' }, userWith('inventory.product.write')),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses to change the base unit once stock has moved', async () => {
    const service = serviceWith({
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      stockMove: { count: jest.fn().mockResolvedValue(3) },
    });
    await expect(
      service.update(
        product.id,
        { baseUnitId: '33333333-3333-3333-3333-333333333333' },
        userWith('inventory.product.write'),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to clear a required field', async () => {
    const service = serviceWith({ product: { findUnique: jest.fn().mockResolvedValue(product) } });
    await expect(
      service.update(product.id, { name: null as unknown as string }, userWith()),
    ).rejects.toThrow(BadRequestException);
  });
});
