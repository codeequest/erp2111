/**
 * Stock side of Purchasing and Sales against a REAL test database.
 * Runs only when TEST_DATABASE_URL is set (see stock-engine.db.spec.ts).
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient, SalesOrderStatus } from '@prisma/client';
import type { PermissionCode } from '@erp/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestUser } from '../../../common/types/request-user';
import { StockEngine } from './stock-engine.service';
import { costPerBase, StockFlowsService, toBaseQty } from './stock-flows.service';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describe('unit conversion helpers', () => {
  it('converts line units and costs to the base unit', () => {
    expect(toBaseQty('2', '12').toString()).toBe('24');
    expect(toBaseQty('1.5', '0.5').toString()).toBe('0.75');
    expect(costPerBase('120', '12').toString()).toBe('10');
    expect(costPerBase('10', '3').toString()).toBe('3.3333');
  });
});

describeDb('Stock flows for purchasing and sales (database)', () => {
  if (url && /\/erp(\?|$)/.test(url)) throw new Error('TEST_DATABASE_URL must not be the main "erp" database');

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const db = prisma as unknown as PrismaService;
  const engine = new StockEngine(db);
  const flows = new StockFlowsService(engine);
  const run = Math.random().toString(36).slice(2, 8).toUpperCase();
  let userId: string;
  let unitId: string;
  let supplierId: string;
  let customerId: string;
  let warehouseId: string;
  let otherWarehouseId: string;

  const user = (): RequestUser => ({
    id: userId,
    email: 'f@test',
    fullName: 'Flow test',
    roles: [],
    permissions: new Set<PermissionCode>(['inventory.stock.read']),
  });
  const no = (prefix: string) => `${prefix}-${run}-${randomUUID().slice(0, 8)}`;
  const tx = <T>(fn: (t: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) =>
    prisma.$transaction(fn);

  async function newProduct() {
    return (
      await prisma.product.create({
        data: { sku: no('F'), name: 'Flow product', baseUnitId: unitId },
      })
    ).id;
  }
  async function balance(productId: string, wh = warehouseId) {
    const b = await prisma.stockBalance.findUnique({ where: { productId_warehouseId: { productId, warehouseId: wh } } });
    return { onHand: b?.quantity.toString() ?? '0', reserved: b?.reserved.toString() ?? '0' };
  }
  /** Reservation drift in this file's warehouses (other test files reserve directly through the engine). */
  async function reservationDrift() {
    return (await engine.findReservationDrift(db)).filter((d) => [warehouseId, otherWarehouseId].includes(d.warehouseId));
  }
  async function avgCost(productId: string) {
    return (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).averageCost.toString();
  }

  /** Creates a purchase order line and a receipt of `received` line units; returns the receipt id. */
  async function receipt(productId: string, opts: { qty: string; factor?: string; price: string; discount?: string }) {
    const po = await prisma.purchaseOrder.create({
      data: {
        number: no('PO'),
        supplierId,
        warehouseId,
        status: 'CONFIRMED',
        createdById: userId,
        lines: {
          create: {
            lineNo: 1,
            productId,
            unitId,
            unitFactor: opts.factor ?? '1',
            quantity: opts.qty,
            unitPrice: opts.price,
            discountPct: opts.discount ?? '0',
          },
        },
      },
      include: { lines: true },
    });
    const gr = await prisma.goodsReceipt.create({
      data: {
        number: no('GR'),
        purchaseOrderId: po.id,
        warehouseId,
        createdById: userId,
        lines: { create: { purchaseOrderLineId: po.lines[0].id, productId, quantity: opts.qty } },
      },
    });
    return gr.id;
  }
  async function stockUp(productId: string, qty: string, price = '10') {
    const id = await receipt(productId, { qty, price });
    await tx((t) => flows.receive(t, id, user()));
  }

  async function order(lines: { productId: string; qty: string; factor?: string }[], status: SalesOrderStatus = 'CONFIRMED') {
    return prisma.salesOrder.create({
      data: {
        number: no('SO'),
        customerId,
        warehouseId,
        status,
        createdById: userId,
        lines: {
          create: lines.map((l, i) => ({
            lineNo: i + 1,
            productId: l.productId,
            unitId,
            unitFactor: l.factor ?? '1',
            quantity: l.qty,
            unitPrice: '20',
          })),
        },
      },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
  }
  async function delivery(orderId: string, lines: { salesOrderLineId: string; productId: string; qty: string }[], wh = warehouseId) {
    return prisma.delivery.create({
      data: {
        number: no('DN'),
        salesOrderId: orderId,
        warehouseId: wh,
        createdById: userId,
        lines: { create: lines.map((l) => ({ salesOrderLineId: l.salesOrderLineId, productId: l.productId, quantity: l.qty })) },
      },
      include: { lines: true },
    });
  }
  async function customerReturn(lines: { productId: string; qty: string; deliveryLineId?: string }[]) {
    return prisma.customerReturn.create({
      data: {
        number: no('RET'),
        customerId,
        warehouseId,
        createdById: userId,
        reason: 'Damaged box',
        lines: {
          create: lines.map((l) => ({
            productId: l.productId,
            quantity: l.qty,
            unitPrice: '20',
            deliveryLineId: l.deliveryLineId ?? null,
          })),
        },
      },
    });
  }

  beforeAll(async () => {
    userId = (
      await prisma.user.create({ data: { email: `flow-${run}@test.local`, passwordHash: 'x', fullName: 'Flow test' } })
    ).id;
    unitId = (await prisma.unit.create({ data: { code: `F${run}`, name: 'Flow unit' } })).id;
    supplierId = (await prisma.supplier.create({ data: { code: no('S'), name: 'Flow supplier' } })).id;
    customerId = (await prisma.customer.create({ data: { code: no('C'), name: 'Flow customer' } })).id;
    warehouseId = (await prisma.warehouse.create({ data: { code: `F${run}A`, name: 'Flow A' } })).id;
    otherWarehouseId = (await prisma.warehouse.create({ data: { code: `F${run}B`, name: 'Flow B' } })).id;
  });
  afterAll(() => prisma.$disconnect());

  // ── Purchasing ─────────────────────────────────────────────────────────────

  it('receives goods in base units at the net purchase price, once only', async () => {
    const p = await newProduct();
    // 2 boxes of 12 at 120 per box, 10% discount → 24 pieces at 9.
    const gr = await receipt(p, { qty: '2', factor: '12', price: '120', discount: '10' });
    const moves = await tx((t) => flows.receive(t, gr, user()));
    expect(moves.map((m) => [m.type, m.quantity.toString(), m.unitCost.toString()])).toEqual([['RECEIPT', '24', '9']]);
    expect(await balance(p)).toEqual({ onHand: '24', reserved: '0' });
    expect(await avgCost(p)).toBe('9');
    await expect(tx((t) => flows.receive(t, gr, user()))).rejects.toThrow(/already been posted/);
  });

  it('cancels a receipt, once only', async () => {
    const p = await newProduct();
    const gr = await receipt(p, { qty: '5', price: '4' });
    await tx((t) => flows.receive(t, gr, user()));
    await tx((t) => flows.cancelReceipt(t, gr, 'Wrong supplier', user()));
    expect((await balance(p)).onHand).toBe('0');
    await expect(tx((t) => flows.cancelReceipt(t, gr, 'again', user()))).rejects.toThrow(/already cancelled/);
  });

  // ── Reservations ───────────────────────────────────────────────────────────

  it('reserves on confirmation, follows order changes, and never reserves twice', async () => {
    const p = await newProduct();
    await stockUp(p, '10');
    const so = await order([{ productId: p, qty: '3', factor: '2' }]); // 3 packs of 2 = 6

    const r = await tx((t) => flows.reserveOrder(t, so.id));
    expect(r).toMatchObject({ fullyReserved: true, lines: [{ needed: '6', reserved: '6', short: '0' }] });
    await tx((t) => flows.reserveOrder(t, so.id)); // again: no change
    expect(await balance(p)).toEqual({ onHand: '10', reserved: '6' });

    await prisma.salesOrderLine.update({ where: { id: so.lines[0].id }, data: { quantity: '2' } });
    await tx((t) => flows.reserveOrder(t, so.id));
    expect((await balance(p)).reserved).toBe('4');

    await tx((t) => flows.releaseOrder(t, so.id));
    expect((await balance(p)).reserved).toBe('0');
    expect((await prisma.salesOrderLine.findUniqueOrThrow({ where: { id: so.lines[0].id } })).reservedQty.toString()).toBe('0');
  });

  it('refuses to promise the same stock twice, or reserves what is left with partial', async () => {
    const p = await newProduct();
    await stockUp(p, '10');
    const first = await order([{ productId: p, qty: '6' }]);
    await tx((t) => flows.reserveOrder(t, first.id));

    const second = await order([{ productId: p, qty: '8' }]);
    await expect(tx((t) => flows.reserveOrder(t, second.id))).rejects.toThrow(/Not enough available stock/);
    expect((await balance(p)).reserved).toBe('6');

    const partial = await tx((t) => flows.reserveOrder(t, second.id, { partial: true }));
    expect(partial).toMatchObject({ fullyReserved: false, lines: [{ needed: '8', reserved: '4', short: '4' }] });
    expect((await balance(p)).reserved).toBe('10');
  });

  it('does not reserve for a quotation', async () => {
    const p = await newProduct();
    const quote = await order([{ productId: p, qty: '1' }], 'QUOTATION');
    await expect(tx((t) => flows.reserveOrder(t, quote.id))).rejects.toThrow(/Only a confirmed sales order/);
  });

  // ── Deliveries ─────────────────────────────────────────────────────────────

  it('delivers at average cost and frees the order reservation', async () => {
    const p = await newProduct();
    await stockUp(p, '10', '7');
    const so = await order([{ productId: p, qty: '5' }]);
    await tx((t) => flows.reserveOrder(t, so.id));

    const dn = await delivery(so.id, [{ salesOrderLineId: so.lines[0].id, productId: p, qty: '3' }]);
    const moves = await tx((t) => flows.deliver(t, dn.id, user()));
    expect(moves.map((m) => [m.type, m.quantity.toString(), m.unitCost.toString()])).toEqual([['DELIVERY', '-3', '7']]);
    expect(await balance(p)).toEqual({ onHand: '7', reserved: '2' });

    // Re-syncing after a partial delivery keeps the remaining 2 reserved.
    await tx((t) => flows.reserveOrder(t, so.id));
    expect((await balance(p)).reserved).toBe('2');

    const tooMuch = await delivery(so.id, [{ salesOrderLineId: so.lines[0].id, productId: p, qty: '3' }]);
    await expect(tx((t) => flows.deliver(t, tooMuch.id, user()))).rejects.toThrow(/exceed the ordered quantity/);
    await expect(tx((t) => flows.deliver(t, dn.id, user()))).rejects.toThrow(/already been posted/);
  });

  it("refuses a delivery that would take another order's reserved stock", async () => {
    const p = await newProduct();
    await stockUp(p, '5');
    const reservedOrder = await order([{ productId: p, qty: '4' }]);
    await tx((t) => flows.reserveOrder(t, reservedOrder.id));

    // This order was confirmed without a reservation (e.g. before stock arrived).
    const other = await order([{ productId: p, qty: '3' }]);
    const dn = await delivery(other.id, [{ salesOrderLineId: other.lines[0].id, productId: p, qty: '3' }]);
    await expect(tx((t) => flows.deliver(t, dn.id, user()))).rejects.toThrow(/reserved for other orders/);
    expect(await balance(p)).toEqual({ onHand: '5', reserved: '4' }); // rolled back
  });

  it('cancels a delivery: goods come back at their cost and are reserved again', async () => {
    const p = await newProduct();
    await stockUp(p, '10', '6');
    const so = await order([{ productId: p, qty: '4' }]);
    await tx((t) => flows.reserveOrder(t, so.id));
    const dn = await delivery(so.id, [{ salesOrderLineId: so.lines[0].id, productId: p, qty: '4' }]);
    await tx((t) => flows.deliver(t, dn.id, user()));
    expect(await balance(p)).toEqual({ onHand: '6', reserved: '0' });

    const { reservation } = await tx((t) => flows.cancelDelivery(t, dn.id, 'Customer refused', user()));
    expect(reservation?.fullyReserved).toBe(true);
    expect(await balance(p)).toEqual({ onHand: '10', reserved: '4' });
    expect(await avgCost(p)).toBe('6');
  });

  // ── Customer returns ───────────────────────────────────────────────────────

  it('returns goods at the cost of the delivery, never more than delivered', async () => {
    const p = await newProduct();
    await stockUp(p, '10', '5');
    const so = await order([{ productId: p, qty: '4' }]);
    await tx((t) => flows.reserveOrder(t, so.id));
    const dn = await delivery(so.id, [{ salesOrderLineId: so.lines[0].id, productId: p, qty: '4' }]);
    await tx((t) => flows.deliver(t, dn.id, user()));
    await stockUp(p, '6', '15'); // average cost changes: (6x5 + 6x15) / 12 = 10

    const ret = await customerReturn([{ productId: p, qty: '3', deliveryLineId: dn.lines[0].id }]);
    const moves = await tx((t) => flows.customerReturn(t, ret.id, user()));
    expect(moves.map((m) => [m.type, m.quantity.toString(), m.unitCost.toString()])).toEqual([['CUSTOMER_RETURN', '3', '5']]);

    const again = await customerReturn([{ productId: p, qty: '2', deliveryLineId: dn.lines[0].id }]);
    await expect(tx((t) => flows.customerReturn(t, again.id, user()))).rejects.toThrow(/only 1 can still be returned/);
  });

  it('returns goods without a delivery at the current average cost', async () => {
    const p = await newProduct();
    await stockUp(p, '2', '8');
    const ret = await customerReturn([{ productId: p, qty: '1' }]);
    const [move] = await tx((t) => flows.customerReturn(t, ret.id, user()));
    expect(move.unitCost.toString()).toBe('8');
    expect((await balance(p)).onHand).toBe('3');
  });

  it('leaves no drift in balances or reservations', async () => {
    expect(await engine.findDrift(db)).toEqual([]);
    expect(await reservationDrift()).toEqual([]);
  });

  it('moves the reservation with the order lines, not the delivery warehouse', async () => {
    const p = await newProduct();
    await stockUp(p, '5');
    await prisma.$transaction((t) =>
      engine.transfer(t, { sourceType: 'Test', sourceId: randomUUID(), fromWarehouseId: warehouseId, toWarehouseId: otherWarehouseId, lines: [{ productId: p, quantity: '2' }] }, user()),
    );
    const so = await order([{ productId: p, qty: '2' }]);
    await tx((t) => flows.reserveOrder(t, so.id));
    // Shipped from the other warehouse: the reservation in the order warehouse is freed.
    const dn = await delivery(so.id, [{ salesOrderLineId: so.lines[0].id, productId: p, qty: '2' }], otherWarehouseId);
    await tx((t) => flows.deliver(t, dn.id, user()));
    expect(await balance(p)).toEqual({ onHand: '3', reserved: '0' });
    expect((await balance(p, otherWarehouseId)).onHand).toBe('0');
    expect(await reservationDrift()).toEqual([]);
  });
});
