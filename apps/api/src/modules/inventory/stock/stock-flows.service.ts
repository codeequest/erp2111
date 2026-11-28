import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SalesOrderStatus, StockMove } from '@prisma/client';
import { RequestUser } from '../../../common/types/request-user';
import { ReservationLine, StockEngine } from './stock-engine.service';
import { D, Num, SCALE } from './stock-rules';

type Tx = Prisma.TransactionClient;
type Dec = Prisma.Decimal;

/** Orders whose lines hold reservations. */
export const OPEN_ORDER_STATUSES: readonly SalesOrderStatus[] = ['CONFIRMED', 'PARTIALLY_DELIVERED'];

/** Line units → base units (e.g. 2 boxes x 12 = 24 pieces). */
export function toBaseQty(qty: Num, unitFactor: Num): Dec {
  return D(qty).mul(D(unitFactor)).toDecimalPlaces(SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/** Cost per line unit → cost per base unit. */
export function costPerBase(cost: Num, unitFactor: Num): Dec {
  return D(cost).div(D(unitFactor)).toDecimalPlaces(SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

export interface ReservationResult {
  lines: {
    salesOrderLineId: string;
    productId: string;
    /** Base units still to deliver */
    needed: string;
    /** Base units reserved now */
    reserved: string;
    /** needed - reserved (only with `partial`) */
    short: string;
  }[];
  fullyReserved: boolean;
}

/**
 * The stock side of Purchasing and Sales. Purchasing and Sales never write
 * stock themselves: inside THEIR transaction they save their document, then
 * call one of these functions with the same `tx`.
 *
 * | Business event                     | Call                                   |
 * |------------------------------------|----------------------------------------|
 * | Goods receipt saved                | receive(tx, receiptId)                 |
 * | Goods receipt cancelled            | cancelReceipt(tx, receiptId, reason)   |
 * | Sales order confirmed / edited     | reserveOrder(tx, orderId)              |
 * | Sales order cancelled / closed     | releaseOrder(tx, orderId)              |
 * | Delivery saved                     | deliver(tx, deliveryId)                |
 * | Delivery cancelled                 | cancelDelivery(tx, deliveryId, reason) |
 * | Customer return saved              | customerReturn(tx, returnId)           |
 *
 * Everything is read from the documents in the database (quantities, units,
 * prices), not from the caller, and what was delivered or returned is read from
 * the stock ledger, so these functions stay right even if a counter on a
 * sales document is wrong. Posting the same document twice is refused.
 */
@Injectable()
export class StockFlowsService {
  constructor(private readonly engine: StockEngine) {}

  // ── Purchasing ─────────────────────────────────────────────────────────────

  /**
   * Stock IN for a goods receipt, at the purchase price of the order line
   * (after the line discount), converted to the base unit. Updates the average cost.
   */
  async receive(tx: Tx, receiptId: string, user: RequestUser): Promise<StockMove[]> {
    const receipt = await tx.goodsReceipt.findUnique({
      where: { id: receiptId },
      include: { lines: { include: { purchaseOrderLine: true } } },
    });
    if (!receipt) throw new NotFoundException('Goods receipt not found');
    const lines = receipt.lines.filter((l) => !l.quantity.isZero());
    if (!lines.length) throw new BadRequestException('The goods receipt has no quantity to receive');

    return this.engine.post(
      tx,
      {
        sourceType: 'GoodsReceipt',
        sourceId: receipt.id,
        reference: receipt.number,
        lines: lines.map((l) => {
          const po = l.purchaseOrderLine;
          if (po.purchaseOrderId !== receipt.purchaseOrderId || po.productId !== l.productId) {
            throw new BadRequestException(`Receipt line ${l.id} does not match its purchase order line`);
          }
          const netPrice = po.unitPrice.mul(D(100).sub(po.discountPct)).div(100);
          return {
            productId: l.productId,
            warehouseId: receipt.warehouseId,
            type: 'RECEIPT' as const,
            quantity: toBaseQty(l.quantity, po.unitFactor),
            unitCost: costPerBase(netPrice, po.unitFactor),
            sourceLineId: l.id,
          };
        }),
      },
      user,
    );
  }

  /** Cancels the stock of a goods receipt (refused if those goods are already sold). */
  async cancelReceipt(tx: Tx, receiptId: string, reason: string, user: RequestUser): Promise<StockMove[]> {
    const receipt = await tx.goodsReceipt.findUnique({ where: { id: receiptId }, select: { number: true } });
    if (!receipt) throw new NotFoundException('Goods receipt not found');
    return this.reverseDocument(tx, 'GoodsReceipt', receiptId, receipt.number, reason, user);
  }

  // ── Sales: reservations ────────────────────────────────────────────────────

  /**
   * Makes the reservations of an open order match what is still to deliver:
   * reserves more, or releases, line by line. Call it on confirmation and after
   * every change of a confirmed order (lines, quantities). Calling it twice
   * changes nothing.
   *
   * Without `partial`, it is refused when available stock is too low (unless
   * negative stock is allowed). With `partial`, it reserves what is available
   * and reports the shortage (back order).
   */
  async reserveOrder(tx: Tx, orderId: string, opts: { partial?: boolean } = {}): Promise<ReservationResult> {
    const order = await this.lockOrder(tx, orderId);
    if (!OPEN_ORDER_STATUSES.includes(order.status)) {
      throw new BadRequestException('Only a confirmed sales order reserves stock');
    }
    const lines = await tx.salesOrderLine.findMany({ where: { salesOrderId: orderId }, orderBy: { lineNo: 'asc' } });
    const delivered = await this.deliveredBase(tx, lines.map((l) => l.id));

    const plan = lines.map((l) => {
      const needed = Prisma.Decimal.max(toBaseQty(l.quantity, l.unitFactor).sub(delivered.get(l.id) ?? 0), 0);
      return { line: l, needed, target: needed };
    });

    const allowNegative = await this.engine.negativeStockAllowed(tx);
    if (opts.partial && !allowNegative) {
      // Lock first, then read what is available, then share it out line by line.
      const productIds = [...new Set(lines.map((l) => l.productId))].sort();
      await tx.$queryRaw`SELECT id FROM products WHERE id = ANY(${productIds}::uuid[]) ORDER BY id FOR UPDATE`;
      const balances = await tx.stockBalance.findMany({
        where: { warehouseId: order.warehouseId, productId: { in: productIds } },
      });
      // Available to THIS order = on hand - reserved by everyone + what this order already holds.
      const free = new Map(balances.map((b) => [b.productId, b.quantity.sub(b.reserved)]));
      for (const l of lines) free.set(l.productId, (free.get(l.productId) ?? D(0)).add(l.reservedQty));
      for (const p of plan) {
        const left = Prisma.Decimal.max(free.get(p.line.productId) ?? 0, 0);
        p.target = Prisma.Decimal.min(p.needed, left);
        free.set(p.line.productId, left.sub(p.target));
      }
    }

    const toRelease: ReservationLine[] = [];
    const toReserve: ReservationLine[] = [];
    for (const p of plan) {
      const delta = p.target.sub(p.line.reservedQty);
      const r = { productId: p.line.productId, warehouseId: order.warehouseId, quantity: delta.abs() };
      if (delta.isNegative()) toRelease.push(r);
      else if (delta.isPositive()) toReserve.push(r);
    }
    // Release first so that stock moving between lines of the same order is available.
    if (toRelease.length) await this.engine.release(tx, toRelease);
    if (toReserve.length) await this.engine.reserve(tx, toReserve, { allowNegative });
    for (const p of plan) {
      if (!p.target.equals(p.line.reservedQty)) {
        await tx.salesOrderLine.update({ where: { id: p.line.id }, data: { reservedQty: p.target } });
      }
    }

    return {
      lines: plan.map((p) => ({
        salesOrderLineId: p.line.id,
        productId: p.line.productId,
        needed: p.needed.toString(),
        reserved: p.target.toString(),
        short: p.needed.sub(p.target).toString(),
      })),
      fullyReserved: plan.every((p) => p.target.equals(p.needed)),
    };
  }

  /** Frees every reservation of an order (cancelled, or closed with goods left undelivered). */
  async releaseOrder(tx: Tx, orderId: string): Promise<void> {
    const order = await this.lockOrder(tx, orderId);
    const lines = await tx.salesOrderLine.findMany({
      where: { salesOrderId: orderId, reservedQty: { gt: 0 } },
    });
    if (!lines.length) return;
    await this.engine.release(
      tx,
      lines.map((l) => ({ productId: l.productId, warehouseId: order.warehouseId, quantity: l.reservedQty })),
    );
    await tx.salesOrderLine.updateMany({ where: { id: { in: lines.map((l) => l.id) } }, data: { reservedQty: 0 } });
  }

  // ── Sales: deliveries and returns ──────────────────────────────────────────

  /**
   * Stock OUT for a delivery, at the current average cost (= cost of goods sold).
   * Uses the order's own reservation first, and refuses to take stock reserved
   * for OTHER orders (unless negative stock is allowed). Refuses delivering more
   * than ordered.
   */
  async deliver(tx: Tx, deliveryId: string, user: RequestUser): Promise<StockMove[]> {
    const delivery = await tx.delivery.findUnique({
      where: { id: deliveryId },
      include: { lines: true },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    const order = await this.lockOrder(tx, delivery.salesOrderId);
    if (!OPEN_ORDER_STATUSES.includes(order.status)) {
      throw new BadRequestException('Goods can only be delivered for a confirmed sales order');
    }
    const lines = delivery.lines.filter((l) => !l.quantity.isZero());
    if (!lines.length) throw new BadRequestException('The delivery has no quantity to deliver');
    if (await tx.stockMove.count({ where: { sourceType: 'Delivery', sourceId: delivery.id, reversesMoveId: null } })) {
      throw new ConflictException(`${delivery.number} has already been posted to stock`);
    }

    const orderLines = new Map(
      (await tx.salesOrderLine.findMany({ where: { salesOrderId: order.id } })).map((l) => [l.id, l]),
    );
    const delivered = await this.deliveredBase(tx, [...orderLines.keys()]);

    const outs: { line: (typeof lines)[number]; base: Dec }[] = [];
    const releases = new Map<string, Dec>(); // order line id → base qty to release
    for (const l of lines) {
      const ol = orderLines.get(l.salesOrderLineId);
      if (!ol || ol.productId !== l.productId) {
        throw new BadRequestException(`Delivery line ${l.id} does not match a line of the sales order`);
      }
      const base = toBaseQty(l.quantity, ol.unitFactor);
      // Already delivered = earlier deliveries + earlier lines of this same delivery.
      const already = (delivered.get(ol.id) ?? D(0)).add(releases.get(ol.id) ?? 0);
      const ordered = toBaseQty(ol.quantity, ol.unitFactor);
      if (already.add(base).greaterThan(ordered)) {
        throw new BadRequestException(
          `Line ${ol.lineNo}: delivering ${base.toString()} would exceed the ordered quantity ` +
            `(ordered ${ordered.toString()}, already delivered ${already.toString()})`,
        );
      }
      outs.push({ line: l, base });
      releases.set(ol.id, (releases.get(ol.id) ?? D(0)).add(base));
    }

    // 1. Free this order's own reservation for what leaves now.
    const toRelease: ReservationLine[] = [];
    for (const [lineId, qty] of releases) {
      const ol = orderLines.get(lineId)!;
      const free = Prisma.Decimal.min(qty, ol.reservedQty);
      if (free.isPositive()) {
        toRelease.push({ productId: ol.productId, warehouseId: order.warehouseId, quantity: free });
        await tx.salesOrderLine.update({ where: { id: lineId }, data: { reservedQty: ol.reservedQty.sub(free) } });
      }
    }
    if (toRelease.length) await this.engine.release(tx, toRelease);

    // 2. Take the goods out (the engine refuses going below zero).
    const moves = await this.engine.post(
      tx,
      {
        sourceType: 'Delivery',
        sourceId: delivery.id,
        reference: delivery.number,
        lines: outs.map((o) => ({
          productId: o.line.productId,
          warehouseId: delivery.warehouseId,
          type: 'DELIVERY' as const,
          quantity: o.base.neg(),
          sourceLineId: o.line.id,
        })),
      },
      user,
    );

    // 3. What is left must still cover the other orders' reservations.
    if (!(await this.engine.negativeStockAllowed(tx))) {
      const productIds = [...new Set(outs.map((o) => o.line.productId))];
      const short = await tx.$queryRaw<{ sku: string; quantity: Dec; reserved: Dec }[]>`
        SELECT p.sku, b.quantity, b.reserved
        FROM stock_balances b JOIN products p ON p.id = b.product_id
        WHERE b.warehouse_id = ${delivery.warehouseId}::uuid
          AND b.product_id = ANY(${productIds}::uuid[])
          AND b.quantity < b.reserved
        ORDER BY p.sku`;
      if (short.length) {
        throw new BadRequestException(
          'This delivery would use stock reserved for other orders: ' +
            short.map((s) => `${s.sku} (on hand after delivery ${D(s.quantity).toString()}, reserved ${D(s.reserved).toString()})`).join(', '),
        );
      }
    }
    return moves;
  }

  /**
   * Puts the goods of a delivery back into stock at the cost they left with,
   * then reserves them again for the order if it is still open.
   */
  async cancelDelivery(
    tx: Tx,
    deliveryId: string,
    reason: string,
    user: RequestUser,
  ): Promise<{ moves: StockMove[]; reservation: ReservationResult | null }> {
    const delivery = await tx.delivery.findUnique({
      where: { id: deliveryId },
      select: { number: true, salesOrderId: true },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    // Same lock order as deliver(): the order first, then the products.
    const order = await this.lockOrder(tx, delivery.salesOrderId);
    const moves = await this.reverseDocument(tx, 'Delivery', deliveryId, delivery.number, reason, user);
    const reservation = OPEN_ORDER_STATUSES.includes(order.status)
      ? await this.reserveOrder(tx, order.id, { partial: true })
      : null;
    return { moves, reservation };
  }

  /**
   * Stock IN for a customer return. A line linked to a delivery line comes back
   * at the cost of that delivery (so the margin of the sale is undone exactly),
   * and cannot return more than was delivered minus earlier returns. A line
   * without a delivery comes back at the current average cost.
   */
  async customerReturn(tx: Tx, returnId: string, user: RequestUser): Promise<StockMove[]> {
    const ret = await tx.customerReturn.findUnique({ where: { id: returnId }, include: { lines: true } });
    if (!ret) throw new NotFoundException('Customer return not found');
    const lines = ret.lines.filter((l) => !l.quantity.isZero());
    if (!lines.length) throw new BadRequestException('The return has no quantity');
    if (lines.some((l) => l.quantity.isNegative())) throw new BadRequestException('A returned quantity cannot be negative');

    // Lock the products first: two returns of the same delivery then run one after the other.
    const productIds = [...new Set(lines.map((l) => l.productId))].sort();
    const products = await tx.$queryRaw<{ id: string; average_cost: Dec }[]>`
      SELECT id::text AS id, average_cost FROM products WHERE id = ANY(${productIds}::uuid[]) ORDER BY id FOR UPDATE`;
    const avgCost = new Map(products.map((p) => [p.id, D(p.average_cost)]));

    const deliveryLineIds = [...new Set(lines.map((l) => l.deliveryLineId).filter((x): x is string => !!x))];
    const originals = new Map<string, StockMove>();
    if (deliveryLineIds.length) {
      const found = await tx.stockMove.findMany({
        where: {
          sourceType: 'Delivery',
          type: 'DELIVERY',
          sourceLineId: { in: deliveryLineIds },
          reversesMoveId: null,
          reversedBy: null,
        },
      });
      for (const m of found) originals.set(m.sourceLineId!, m);
    }
    const returned = await this.returnedBase(tx, deliveryLineIds);

    const plan = lines.map((l) => {
      if (!l.deliveryLineId) return { line: l, cost: avgCost.get(l.productId)! };
      const original = originals.get(l.deliveryLineId);
      if (!original) {
        throw new BadRequestException(`Return line ${l.id}: the delivery line was never delivered (or was cancelled)`);
      }
      if (original.productId !== l.productId) {
        throw new BadRequestException(`Return line ${l.id}: product differs from the delivered product`);
      }
      const left = original.quantity.neg().sub(returned.get(l.deliveryLineId) ?? 0);
      if (l.quantity.greaterThan(left)) {
        throw new BadRequestException(
          `Return line ${l.id}: returning ${l.quantity.toString()} but only ${left.toString()} can still be returned for this delivery`,
        );
      }
      returned.set(l.deliveryLineId, (returned.get(l.deliveryLineId) ?? D(0)).add(l.quantity));
      return { line: l, cost: original.unitCost };
    });

    return this.engine.post(
      tx,
      {
        sourceType: 'CustomerReturn',
        sourceId: ret.id,
        reference: ret.number,
        reason: ret.reason,
        lines: plan.map((p) => ({
          productId: p.line.productId,
          warehouseId: ret.warehouseId,
          type: 'CUSTOMER_RETURN' as const,
          quantity: p.line.quantity,
          unitCost: p.cost,
          sourceLineId: p.line.id,
        })),
      },
      user,
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async lockOrder(tx: Tx, orderId: string) {
    const [order] = await tx.$queryRaw<{ id: string; status: SalesOrderStatus; warehouseId: string }[]>`
      SELECT id::text AS id, status, warehouse_id::text AS "warehouseId"
      FROM sales_orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    if (!order) throw new NotFoundException('Sales order not found');
    return order;
  }

  /** Base units delivered per sales order line, from the ledger (cancelled deliveries excluded). */
  private async deliveredBase(tx: Tx, orderLineIds: string[]): Promise<Map<string, Dec>> {
    if (!orderLineIds.length) return new Map();
    const rows = await tx.$queryRaw<{ id: string; qty: Dec }[]>`
      SELECT d.sales_order_line_id::text AS id, SUM(-m.quantity) AS qty
      FROM stock_moves m JOIN delivery_lines d ON d.id = m.source_line_id
      WHERE m.source_type = 'Delivery' AND m.type = 'DELIVERY' AND m.reverses_move_id IS NULL
        AND d.sales_order_line_id = ANY(${orderLineIds}::uuid[])
        AND NOT EXISTS (SELECT 1 FROM stock_moves r WHERE r.reverses_move_id = m.id)
      GROUP BY d.sales_order_line_id`;
    return new Map(rows.map((r) => [r.id, D(r.qty)]));
  }

  /** Base units already returned per delivery line, from the ledger. */
  private async returnedBase(tx: Tx, deliveryLineIds: string[]): Promise<Map<string, Dec>> {
    if (!deliveryLineIds.length) return new Map();
    const rows = await tx.$queryRaw<{ id: string; qty: Dec }[]>`
      SELECT r.delivery_line_id::text AS id, SUM(m.quantity) AS qty
      FROM stock_moves m JOIN customer_return_lines r ON r.id = m.source_line_id
      WHERE m.source_type = 'CustomerReturn' AND m.type = 'CUSTOMER_RETURN' AND m.reverses_move_id IS NULL
        AND r.delivery_line_id = ANY(${deliveryLineIds}::uuid[])
        AND NOT EXISTS (SELECT 1 FROM stock_moves x WHERE x.reverses_move_id = m.id)
      GROUP BY r.delivery_line_id`;
    return new Map(rows.map((r) => [r.id, D(r.qty)]));
  }

  private async reverseDocument(
    tx: Tx,
    sourceType: 'GoodsReceipt' | 'Delivery',
    sourceId: string,
    reference: string,
    reason: string,
    user: RequestUser,
  ): Promise<StockMove[]> {
    const moves = await tx.stockMove.findMany({
      where: { sourceType, sourceId, reversesMoveId: null },
      select: { id: true },
    });
    if (!moves.length) throw new BadRequestException(`${reference} has no stock to cancel`);
    try {
      return await this.engine.reverse(
        tx,
        { sourceType: `${sourceType}Cancel`, sourceId, reference, reason, moveIds: moves.map((m) => m.id) },
        user,
      );
    } catch (e) {
      if (e instanceof ConflictException) throw new ConflictException(`${reference} is already cancelled`);
      throw e;
    }
  }
}
