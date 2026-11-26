import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { PurchaseOrdersService } from './purchase-orders.service';

const D = (v: string | number) => new Prisma.Decimal(v);

const user: RequestUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'buyer@test',
  fullName: 'Buyer',
  roles: [],
  permissions: new Set(),
};

const IDS = {
  order: '10000000-0000-0000-0000-000000000001',
  supplier: '20000000-0000-0000-0000-000000000001',
  warehouse: '30000000-0000-0000-0000-000000000001',
  product: '40000000-0000-0000-0000-000000000001',
  pcs: '50000000-0000-0000-0000-000000000001',
  carton: '50000000-0000-0000-0000-000000000002',
  box: '50000000-0000-0000-0000-000000000003',
};

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.order,
    number: 'PO-2026-00001',
    status: 'DRAFT',
    supplierId: IDS.supplier,
    warehouseId: IDS.warehouse,
    orderDate: new Date('2026-11-26T00:00:00Z'),
    expectedDate: null,
    lines: [
      {
        lineNo: 1,
        productId: IDS.product,
        unitId: IDS.pcs,
        quantity: D(10),
        unitPrice: D(2),
        discountPct: D(0),
        receivedQty: D(0),
      },
    ],
    ...overrides,
  };
}

/** A fake Prisma whose $transaction runs the callback against the same fake. */
function setup(state: { order?: ReturnType<typeof order>; productActive?: boolean } = {}) {
  const current = state.order ?? order();
  const fake = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: current.id }]),
    purchaseOrder: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockResolvedValue({ ...current, lines: [] }),
      create: jest.fn().mockResolvedValue({ ...current, lines: [] }),
      // get() at the end of each call: fail loudly if reached without a stub
      findUnique: jest.fn().mockResolvedValue(null),
    },
    purchaseOrderLine: { deleteMany: jest.fn(), createMany: jest.fn() },
    supplier: {
      findUnique: jest.fn().mockResolvedValue({ code: 'SUP-00001', isActive: true, taxRate: null }),
    },
    warehouse: { findUnique: jest.fn().mockResolvedValue({ code: 'MAIN', isActive: true }) },
    product: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { isActive?: boolean } }) =>
        // confirm() asks for inactive products only; prepareLines() asks for all
        where.isActive === false
          ? Promise.resolve(state.productActive === false ? [{ sku: 'COLA' }] : [])
          : Promise.resolve([
              {
                id: IDS.product,
                sku: 'COLA',
                isActive: state.productActive ?? true,
                baseUnitId: IDS.pcs,
                taxRate: { rate: D(19) },
                units: [
                  { unitId: IDS.carton, factor: D(24), forPurchase: true },
                  { unitId: IDS.box, factor: D(6), forPurchase: false },
                ],
              },
            ]),
      ),
    },
    documentSequence: {
      findUnique: jest.fn().mockResolvedValue({ id: 'seq' }),
      update: jest.fn().mockResolvedValue({ prefix: 'PO', padding: 5, nextNumber: 2 }),
    },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  fake.$transaction.mockImplementation((cb: (tx: typeof fake) => unknown) => cb(fake));
  const service = new PurchaseOrdersService(fake as unknown as PrismaService);
  // Skip the final re-read: these tests check what was written.
  jest.spyOn(service, 'get').mockResolvedValue({} as never);
  return { fake, service };
}

const line = (unitId: string, quantity = '2', unitPrice = '10', discountPct = '0') => ({
  productId: IDS.product,
  unitId,
  quantity,
  unitPrice,
  discountPct,
});

describe('PurchaseOrdersService.create', () => {
  it('numbers the draft, copies factor and tax, and stores the totals', async () => {
    const { fake, service } = setup();
    await service.create(
      {
        supplierId: IDS.supplier,
        warehouseId: IDS.warehouse,
        orderDate: '2026-11-26',
        lines: [line(IDS.carton, '2', '50', '10')],
      },
      user,
    );
    const data = fake.purchaseOrder.create.mock.calls[0][0].data;
    expect(data.number).toBe('PO-2026-00001');
    expect(data.subtotal.toFixed(3)).toBe('100.000');
    expect(data.discountTotal.toFixed(3)).toBe('10.000');
    expect(data.taxTotal.toFixed(3)).toBe('17.100');
    expect(data.total.toFixed(3)).toBe('107.100');
    const [l] = data.lines.createMany.data;
    expect(l.unitFactor.toString()).toBe('24');
    expect(l.taxRate.toString()).toBe('19');
    expect(l.lineTotal.toFixed(3)).toBe('90.000');
    expect(fake.auditLog.create).toHaveBeenCalled();
  });

  it('refuses a pack unit that is not for purchase', async () => {
    const { service } = setup();
    await expect(
      service.create(
        { supplierId: IDS.supplier, warehouseId: IDS.warehouse, lines: [line(IDS.box)] },
        user,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a zero quantity', async () => {
    const { service } = setup();
    const err = await service
      .create(
        { supplierId: IDS.supplier, warehouseId: IDS.warehouse, lines: [line(IDS.pcs, '0')] },
        user,
      )
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    // Every line error is returned, so the form can show them all at once.
    expect((err as BadRequestException).getResponse()).toMatchObject({
      message: ['Line 1: the quantity must be more than 0'],
    });
  });

  it('refuses an expected date before the order date', async () => {
    const { service } = setup();
    await expect(
      service.create(
        {
          supplierId: IDS.supplier,
          warehouseId: IDS.warehouse,
          orderDate: '2026-11-26',
          expectedDate: '2026-11-20',
        },
        user,
      ),
    ).rejects.toThrow('expected date');
  });

  it('refuses an inactive supplier', async () => {
    const { fake, service } = setup();
    fake.supplier.findUnique.mockResolvedValue({ code: 'SUP-00009', isActive: false });
    await expect(
      service.create({ supplierId: IDS.supplier, warehouseId: IDS.warehouse }, user),
    ).rejects.toThrow('Supplier SUP-00009 is inactive');
  });
});

describe('supplier VAT rate', () => {
  it('applies the supplier rate instead of the product rate (exempt supplier)', async () => {
    const { fake, service } = setup();
    fake.supplier.findUnique.mockResolvedValue({
      code: 'SUP-00007',
      isActive: true,
      taxRate: { rate: D(0) },
    });
    await service.create(
      {
        supplierId: IDS.supplier,
        warehouseId: IDS.warehouse,
        lines: [line(IDS.pcs, '10', '10')],
      },
      user,
    );
    const data = fake.purchaseOrder.create.mock.calls[0][0].data;
    expect(data.lines.createMany.data[0].taxRate.toString()).toBe('0');
    expect(data.taxTotal.toFixed(3)).toBe('0.000');
    expect(data.total.toFixed(3)).toBe('100.000');
  });

  it('uses the product rate when the supplier has none', async () => {
    const { fake, service } = setup();
    await service.create(
      {
        supplierId: IDS.supplier,
        warehouseId: IDS.warehouse,
        lines: [line(IDS.pcs, '10', '10')],
      },
      user,
    );
    const data = fake.purchaseOrder.create.mock.calls[0][0].data;
    expect(data.taxTotal.toFixed(3)).toBe('19.000');
  });

  it('recomputes the existing lines when the supplier of a draft changes', async () => {
    const { fake, service } = setup();
    const other = '20000000-0000-0000-0000-000000000002';
    fake.supplier.findUnique.mockResolvedValue({
      code: 'SUP-00008',
      isActive: true,
      taxRate: { rate: D(7) },
    });
    await service.update(IDS.order, { supplierId: other }, user);
    const [l] = fake.purchaseOrderLine.createMany.mock.calls[0][0].data;
    expect(l.taxRate.toString()).toBe('7');
    expect(l.quantity.toString()).toBe('10');
    const data = fake.purchaseOrder.update.mock.calls[0][0].data;
    expect(data.supplierId).toBe(other);
    expect(data.taxTotal.toFixed(3)).toBe('1.400'); // 10 x 2 = 20, 7 %
  });
});

describe('PurchaseOrdersService.update', () => {
  it('replaces every line of a draft', async () => {
    const { fake, service } = setup();
    await service.update(IDS.order, { lines: [line(IDS.pcs), line(IDS.carton)] }, user);
    expect(fake.purchaseOrderLine.deleteMany).toHaveBeenCalledWith({
      where: { purchaseOrderId: IDS.order },
    });
    expect(fake.purchaseOrderLine.createMany.mock.calls[0][0].data).toHaveLength(2);
  });

  it('refuses to edit a confirmed order', async () => {
    const { fake, service } = setup({ order: order({ status: 'CONFIRMED' }) });
    await expect(service.update(IDS.order, { notes: 'x' }, user)).rejects.toThrow(
      ConflictException,
    );
    expect(fake.purchaseOrder.update).not.toHaveBeenCalled();
  });
});

describe('PurchaseOrdersService.confirm', () => {
  it('confirms a draft with lines', async () => {
    const { fake, service } = setup();
    await service.confirm(IDS.order, user);
    expect(fake.purchaseOrder.update.mock.calls[0][0].data.status).toBe('CONFIRMED');
  });

  it('refuses an order without lines', async () => {
    const { service } = setup({ order: order({ lines: [] }) });
    await expect(service.confirm(IDS.order, user)).rejects.toThrow('at least one line');
  });

  it('refuses when a product was deactivated since', async () => {
    const { service } = setup({ productActive: false });
    await expect(service.confirm(IDS.order, user)).rejects.toThrow('Inactive product(s)');
  });

  it('refuses to confirm twice', async () => {
    const { service } = setup({ order: order({ status: 'CONFIRMED' }) });
    await expect(service.confirm(IDS.order, user)).rejects.toThrow(ConflictException);
  });
});

describe('PurchaseOrdersService.cancel', () => {
  it('cancels a confirmed order with nothing received', async () => {
    const { fake, service } = setup({ order: order({ status: 'CONFIRMED' }) });
    await service.cancel(IDS.order, user);
    expect(fake.purchaseOrder.update.mock.calls[0][0].data.status).toBe('CANCELLED');
  });

  it('refuses once goods were received', async () => {
    const { service } = setup({
      order: order({
        status: 'PARTIALLY_RECEIVED',
        lines: [{ productId: IDS.product, receivedQty: D(3) }],
      }),
    });
    await expect(service.cancel(IDS.order, user)).rejects.toThrow('already received');
  });
});
