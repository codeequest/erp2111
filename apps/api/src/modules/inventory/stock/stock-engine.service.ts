import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMove, StockMoveType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestUser } from '../../../common/types/request-user';
import { audit } from '../../../common/audit';
import { applyMove, CostState, D, lockOrder, moveLineError, Num } from './stock-rules';

type Tx = Prisma.TransactionClient;

export interface StockLineInput {
  productId: string;
  warehouseId: string;
  type: StockMoveType;
  /** Signed quantity in base unit: + in, - out */
  quantity: Num;
  /** Cost per base unit for stock coming in. Omit to use the current average cost. */
  unitCost?: Num | null;
  /** Line of the source document: posting the same line twice is refused. */
  sourceLineId?: string | null;
  /** Overrides the document reason for this line */
  reason?: string | null;
  transferId?: string | null;
  reversesMoveId?: string | null;
}

export interface PostStockInput {
  /** Source document, e.g. "GoodsReceipt", "StockAdjustment" */
  sourceType: string;
  sourceId: string;
  /** Human-readable number, e.g. "GR-2026-00012" */
  reference?: string | null;
  /** Default reason for every line (required for adjustments) */
  reason?: string | null;
  lines: StockLineInput[];
  /** Overrides CompanySettings.allowNegativeStock */
  allowNegative?: boolean;
}

export interface TransferInput {
  sourceType: string;
  sourceId: string;
  reference?: string | null;
  reason?: string | null;
  fromWarehouseId: string;
  toWarehouseId: string;
  lines: { productId: string; quantity: Num; sourceLineId?: string | null }[];
  allowNegative?: boolean;
}

export interface ReverseInput {
  /** The correcting document, e.g. a cancelled receipt */
  sourceType: string;
  sourceId: string;
  reference?: string | null;
  reason: string;
  /** Moves to cancel. The other leg of a transfer is reversed with it automatically. */
  moveIds: string[];
  allowNegative?: boolean;
}

export interface ReservationLine {
  productId: string;
  warehouseId: string;
  /** Positive quantity in base unit */
  quantity: Num;
}

export interface DriftRow {
  productId: string;
  warehouseId: string;
  balance: string;
  ledger: string;
}

interface LockedProduct {
  id: string;
  sku: string;
  average_cost: Prisma.Decimal;
}

/**
 * The ONLY code allowed to write `stock_moves` and `stock_balances`.
 *
 * Every method takes the caller's transaction (`tx`), so the stock change commits or
 * rolls back together with the document that causes it (receipt, delivery...).
 *
 * Concurrency: the product rows are locked (SELECT ... FOR UPDATE, in id order) before
 * anything is read. Two operations on the same product therefore run one after the
 * other, which keeps the negative-stock check and the average cost correct, and the
 * fixed lock order prevents deadlocks.
 */
@Injectable()
export class StockEngine {
  constructor(private readonly prisma: PrismaService) {}

  /** Posts stock moves: validates, locks, writes the ledger, balances and average cost. */
  async post(tx: Tx, input: PostStockInput, user: RequestUser): Promise<StockMove[]> {
    if (!input.lines.length) throw new BadRequestException('Nothing to post: the document has no lines');

    const errors = input.lines
      .map((line, i) => ({ i, error: moveLineError(line, input.reason) }))
      .filter((e) => e.error);
    if (errors.length) {
      throw new BadRequestException(errors.map((e) => `Line ${e.i + 1}: ${e.error}`));
    }

    const lines = lockOrder(input.lines);
    const products = await this.lockProducts(tx, lines.map((l) => l.productId));
    const warehouses = await this.activeWarehouses(tx, lines.map((l) => l.warehouseId));
    const allowNegative = input.allowNegative ?? (await this.negativeStockAllowed(tx));
    const states = await this.costStates(tx, products);

    const created: StockMove[] = [];
    for (const line of lines) {
      const product = products.get(line.productId)!;
      const state = states.get(line.productId)!;
      const qty = D(line.quantity);
      const result = applyMove(state, qty, line.unitCost);

      const balance = await this.addToBalance(tx, line.productId, line.warehouseId, qty);
      if (qty.isNegative() && !allowNegative && balance.isNegative()) {
        throw new BadRequestException(
          `Not enough stock for ${product.sku} in ${warehouses.get(line.warehouseId)}: ` +
            `on hand ${balance.sub(qty).toString()}, requested ${qty.abs().toString()}`,
        );
      }

      try {
        created.push(
          await tx.stockMove.create({
            data: {
              productId: line.productId,
              warehouseId: line.warehouseId,
              type: line.type,
              quantity: qty,
              unitCost: result.unitCost,
              sourceType: input.sourceType,
              sourceId: input.sourceId,
              sourceLineId: line.sourceLineId ?? null,
              reference: input.reference ?? null,
              reason: line.reason ?? input.reason ?? null,
              transferId: line.transferId ?? null,
              reversesMoveId: line.reversesMoveId ?? null,
              createdById: user.id,
            },
          }),
        );
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(
            line.reversesMoveId
              ? 'This stock move has already been reversed'
              : `${input.reference ?? input.sourceType} has already been posted to stock`,
          );
        }
        throw e;
      }

      state.onHand = result.onHand;
      state.avgCost = result.avgCost;
    }

    for (const [id, state] of states) {
      if (!state.avgCost.equals(products.get(id)!.average_cost)) {
        await tx.product.update({ where: { id }, data: { averageCost: state.avgCost } });
      }
    }

    await audit(tx, user, 'stock.post', input.sourceType, input.sourceId, null, {
      reference: input.reference ?? null,
      moves: created.length,
    });
    return created;
  }

  /** Moves stock between two warehouses at average cost (one OUT and one IN move per line). */
  async transfer(tx: Tx, input: TransferInput, user: RequestUser): Promise<StockMove[]> {
    if (input.fromWarehouseId === input.toWarehouseId) {
      throw new BadRequestException('A transfer needs two different warehouses');
    }
    const bad = input.lines.findIndex((l) => !D(l.quantity).isPositive());
    if (bad >= 0) throw new BadRequestException(`Line ${bad + 1}: transfer quantity must be more than zero`);

    const transferId = randomUUID();
    return this.post(
      tx,
      {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        reference: input.reference,
        reason: input.reason,
        allowNegative: input.allowNegative,
        lines: input.lines.flatMap((l) => [
          {
            productId: l.productId,
            warehouseId: input.fromWarehouseId,
            type: 'TRANSFER_OUT' as const,
            quantity: D(l.quantity).neg(),
            sourceLineId: l.sourceLineId,
            transferId,
          },
          {
            productId: l.productId,
            warehouseId: input.toWarehouseId,
            type: 'TRANSFER_IN' as const,
            quantity: D(l.quantity),
            sourceLineId: l.sourceLineId,
            transferId,
          },
        ]),
      },
      user,
    );
  }

  /**
   * Cancels moves by posting opposite moves (the ledger is never edited).
   * Stock that went out comes back at its original cost; stock that came in
   * leaves at the current average cost.
   */
  async reverse(tx: Tx, input: ReverseInput, user: RequestUser): Promise<StockMove[]> {
    if (!input.reason?.trim()) throw new BadRequestException('A reversal needs a reason');
    const ids = [...new Set(input.moveIds)];
    const found = await tx.stockMove.findMany({ where: { id: { in: ids } } });
    if (found.length !== ids.length) throw new NotFoundException('Stock move not found');

    const transferIds = [...new Set(found.map((m) => m.transferId).filter((t): t is string => !!t))];
    const legs = transferIds.length
      ? await tx.stockMove.findMany({ where: { transferId: { in: transferIds }, id: { notIn: ids } } })
      : [];
    const moves = [...found, ...legs];
    if (moves.some((m) => m.reversesMoveId)) {
      throw new BadRequestException('A reversal move cannot be reversed: post a new document instead');
    }
    const alreadyReversed = await tx.stockMove.count({
      where: { reversesMoveId: { in: moves.map((m) => m.id) } },
    });
    if (alreadyReversed) throw new ConflictException('This stock move has already been reversed');

    const newTransferIds = new Map(transferIds.map((t) => [t, randomUUID()]));
    return this.post(
      tx,
      {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        reference: input.reference,
        reason: input.reason,
        allowNegative: input.allowNegative,
        lines: moves.map((m) => ({
          productId: m.productId,
          warehouseId: m.warehouseId,
          type: m.type,
          quantity: m.quantity.neg(),
          // Transfer legs move back at average cost so the average does not change.
          unitCost: m.quantity.isNegative() && !m.transferId ? m.unitCost : null,
          sourceLineId: m.id,
          transferId: m.transferId ? newTransferIds.get(m.transferId) : null,
          reversesMoveId: m.id,
        })),
      },
      user,
    );
  }

  /**
   * Reserves stock for confirmed sales orders. Refused when available stock
   * (on hand - reserved) is too low, unless negative stock is allowed.
   */
  async reserve(tx: Tx, lines: ReservationLine[], opts: { allowNegative?: boolean } = {}): Promise<void> {
    this.checkReservationLines(lines);
    const sorted = lockOrder(lines);
    const products = await this.lockProducts(tx, sorted.map((l) => l.productId));
    const warehouses = await this.activeWarehouses(tx, sorted.map((l) => l.warehouseId));
    const allowNegative = opts.allowNegative ?? (await this.negativeStockAllowed(tx));

    for (const line of sorted) {
      const qty = D(line.quantity);
      const [row] = await tx.$queryRaw<{ quantity: Prisma.Decimal; reserved: Prisma.Decimal }[]>`
        INSERT INTO stock_balances (product_id, warehouse_id, quantity, reserved, updated_at)
        VALUES (${line.productId}::uuid, ${line.warehouseId}::uuid, 0, ${qty.toString()}::numeric, now())
        ON CONFLICT (product_id, warehouse_id)
        DO UPDATE SET reserved = stock_balances.reserved + EXCLUDED.reserved, updated_at = now()
        RETURNING quantity, reserved`;
      const available = D(row.quantity).sub(D(row.reserved));
      if (!allowNegative && available.isNegative()) {
        throw new BadRequestException(
          `Not enough available stock for ${products.get(line.productId)!.sku} in ` +
            `${warehouses.get(line.warehouseId)}: available ${available.add(qty).toString()}, ` +
            `requested ${qty.toString()}`,
        );
      }
    }
  }

  /** Releases reserved stock (delivery done or order cancelled). Never goes below zero. */
  async release(tx: Tx, lines: ReservationLine[]): Promise<void> {
    this.checkReservationLines(lines);
    const sorted = lockOrder(lines);
    await this.lockProducts(tx, sorted.map((l) => l.productId));
    for (const line of sorted) {
      await tx.$executeRaw`
        UPDATE stock_balances
        SET reserved = GREATEST(reserved - ${D(line.quantity).toString()}::numeric, 0), updated_at = now()
        WHERE product_id = ${line.productId}::uuid AND warehouse_id = ${line.warehouseId}::uuid`;
    }
  }

  /**
   * Consistency check: rows where the cached balance differs from the sum of the ledger.
   * Must always be empty; anything else means stock was written outside the engine.
   */
  async findDrift(db: Tx | PrismaService = this.prisma): Promise<DriftRow[]> {
    const rows = await db.$queryRaw<
      { product_id: string; warehouse_id: string; balance: Prisma.Decimal; ledger: Prisma.Decimal }[]
    >`
      SELECT product_id, warehouse_id,
             COALESCE(b.quantity, 0) AS balance,
             COALESCE(m.total, 0)    AS ledger
      FROM stock_balances b
      FULL OUTER JOIN (
        SELECT product_id, warehouse_id, SUM(quantity) AS total
        FROM stock_moves GROUP BY product_id, warehouse_id
      ) m USING (product_id, warehouse_id)
      WHERE COALESCE(b.quantity, 0) <> COALESCE(m.total, 0)
      ORDER BY product_id, warehouse_id`;
    return rows.map((r) => ({
      productId: r.product_id,
      warehouseId: r.warehouse_id,
      balance: D(r.balance).toString(),
      ledger: D(r.ledger).toString(),
    }));
  }

  /**
   * Rows where stock_balances.reserved differs from the sum of the sales order
   * lines' reserved quantities (should never happen). Same shape as findDrift:
   * `balance` = reserved on the balance, `ledger` = reserved by the order lines.
   */
  async findReservationDrift(db: Tx | PrismaService = this.prisma): Promise<DriftRow[]> {
    const rows = await db.$queryRaw<
      { product_id: string; warehouse_id: string; balance: Prisma.Decimal; ledger: Prisma.Decimal }[]
    >`
      SELECT product_id, warehouse_id,
             COALESCE(b.reserved, 0) AS balance,
             COALESCE(o.total, 0)    AS ledger
      FROM stock_balances b
      FULL OUTER JOIN (
        SELECT l.product_id, so.warehouse_id, SUM(l.reserved_qty) AS total
        FROM sales_order_lines l JOIN sales_orders so ON so.id = l.sales_order_id
        WHERE l.reserved_qty <> 0
        GROUP BY l.product_id, so.warehouse_id
      ) o USING (product_id, warehouse_id)
      WHERE COALESCE(b.reserved, 0) <> COALESCE(o.total, 0)
      ORDER BY product_id, warehouse_id`;
    return rows.map((r) => ({
      productId: r.product_id,
      warehouseId: r.warehouse_id,
      balance: D(r.balance).toString(),
      ledger: D(r.ledger).toString(),
    }));
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private checkReservationLines(lines: ReservationLine[]) {
    if (!lines.length) throw new BadRequestException('Nothing to reserve');
    const bad = lines.findIndex((l) => !D(l.quantity).isPositive());
    if (bad >= 0) throw new BadRequestException(`Line ${bad + 1}: quantity must be more than zero`);
  }

  /** Locks the product rows in id order (the one lock order used everywhere). */
  private async lockProducts(tx: Tx, ids: string[]): Promise<Map<string, LockedProduct>> {
    const unique = [...new Set(ids)].sort();
    const rows = await tx.$queryRaw<LockedProduct[]>`
      SELECT id::text AS id, sku, average_cost FROM products
      WHERE id = ANY(${unique}::uuid[])
      ORDER BY id
      FOR UPDATE`;
    if (rows.length !== unique.length) throw new NotFoundException('Product not found');
    return new Map(rows.map((r) => [r.id, { ...r, average_cost: D(r.average_cost) }]));
  }

  /** Warehouse id -> code. Refuses unknown or inactive warehouses. */
  private async activeWarehouses(tx: Tx, ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    const rows = await tx.warehouse.findMany({
      where: { id: { in: unique } },
      select: { id: true, code: true, isActive: true },
    });
    if (rows.length !== unique.length) throw new NotFoundException('Warehouse not found');
    const inactive = rows.filter((w) => !w.isActive);
    if (inactive.length) {
      throw new BadRequestException(`Warehouse ${inactive.map((w) => w.code).join(', ')} is not active`);
    }
    return new Map(rows.map((w) => [w.id, w.code]));
  }

  /** CompanySettings.allowNegativeStock */
  async negativeStockAllowed(tx: Tx | PrismaService = this.prisma): Promise<boolean> {
    const settings = await tx.companySettings.findUnique({
      where: { id: 1 },
      select: { allowNegativeStock: true },
    });
    return settings?.allowNegativeStock ?? false;
  }

  /** Company-wide on-hand and average cost per product (read after the lock). */
  private async costStates(tx: Tx, products: Map<string, LockedProduct>): Promise<Map<string, CostState>> {
    const ids = [...products.keys()];
    const totals = await tx.stockBalance.groupBy({
      by: ['productId'],
      where: { productId: { in: ids } },
      _sum: { quantity: true },
    });
    const onHand = new Map(totals.map((t) => [t.productId, t._sum.quantity ?? D(0)]));
    return new Map(
      ids.map((id) => [id, { onHand: D(onHand.get(id) ?? 0), avgCost: products.get(id)!.average_cost }]),
    );
  }

  /** Adds a signed quantity to the cached balance and returns the new on-hand quantity. */
  private async addToBalance(tx: Tx, productId: string, warehouseId: string, qty: Prisma.Decimal) {
    const [row] = await tx.$queryRaw<{ quantity: Prisma.Decimal }[]>`
      INSERT INTO stock_balances (product_id, warehouse_id, quantity, reserved, updated_at)
      VALUES (${productId}::uuid, ${warehouseId}::uuid, ${qty.toString()}::numeric, 0, now())
      ON CONFLICT (product_id, warehouse_id)
      DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = now()
      RETURNING quantity`;
    return D(row.quantity);
  }
}
