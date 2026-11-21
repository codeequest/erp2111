import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, StockMoveType } from '@prisma/client';
import { Decimal } from '../../common/decimal';
import { weightedAverageCost } from './stock-rules';

type Tx = Prisma.TransactionClient;

export interface LedgerLine {
  productId: string;
  warehouseId: string;
  type: StockMoveType;
  /** Signed quantity in the product's base unit: + in, − out. Never zero. */
  quantity: Decimal;
  /**
   * Cost per base unit of INCOMING stock that carries its own cost (opening
   * balance, goods receipt). It updates the weighted average cost. Leave it
   * undefined for everything else: the move is valued at the current average.
   */
  unitCost?: Decimal;
}

export interface LedgerPosting {
  lines: LedgerLine[];
  userId: string;
  /** Human-readable document number, e.g. "ADJ-2026-00003". */
  reference?: string;
  reason?: string;
  /** Source document for traceability, e.g. ("GoodsReceipt", id). */
  sourceType?: string;
  sourceId?: string;
  /** Groups the OUT and IN rows of one transfer. */
  transferId?: string;
}

interface LockedProduct {
  id: string;
  sku: string;
  average_cost: Prisma.Decimal;
}

/**
 * THE ONLY WAY TO CHANGE STOCK (CONTRIBUTING: "Stock is never edited directly").
 *
 * `post(tx, …)` must run inside the caller's transaction. For every line it:
 *  1. locks the product rows (in id order, so concurrent postings never deadlock),
 *  2. updates the weighted average cost for incoming stock that carries a cost,
 *  3. writes a StockMove row valued at the cost in force,
 *  4. updates StockBalance in the same transaction,
 *  5. refuses the whole posting if a balance would go negative, unless the
 *     company setting allowNegativeStock is on.
 */
@Injectable()
export class StockLedgerService {
  async post(tx: Tx, posting: LedgerPosting): Promise<number> {
    const { lines } = posting;
    if (!lines.length) throw new BadRequestException('Nothing to post');
    for (const l of lines) {
      if (l.quantity.isZero()) throw new BadRequestException('A stock move cannot be zero');
      if (l.unitCost && (l.quantity.isNegative() || l.unitCost.isNegative())) {
        throw new BadRequestException(
          'Only incoming stock can carry a cost, and it cannot be negative',
        );
      }
    }

    // 1. Lock the products. Every stock posting goes through here, so all
    //    writers for a product are serialised on its row.
    const productIds = [...new Set(lines.map((l) => l.productId))].sort();
    const locked = await this.lockProducts(tx, productIds);
    const products = new Map(locked.map((p) => [p.id, p]));

    const settings = await tx.companySettings.findUnique({ where: { id: 1 } });
    const allowNegative = settings?.allowNegativeStock ?? false;

    // Running totals across all warehouses (for the average cost) while lines are applied.
    const totals = await tx.stockBalance.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { quantity: true },
    });
    const onHand = new Map<string, Decimal>(
      productIds.map((id) => [
        id,
        new Decimal(totals.find((t) => t.productId === id)?._sum.quantity ?? 0),
      ]),
    );
    const average = new Map<string, Decimal>(
      locked.map((p) => [p.id, new Decimal(p.average_cost)]),
    );
    const costChanged = new Set<string>();

    const moves: Prisma.StockMoveCreateManyInput[] = [];
    const resulting = new Map<string, { productId: string; warehouseId: string; qty: Decimal }>();

    for (const line of lines) {
      // 2. Weighted average cost for incoming stock with its own cost.
      if (line.unitCost) {
        average.set(
          line.productId,
          weightedAverageCost(
            onHand.get(line.productId)!,
            average.get(line.productId)!,
            line.quantity,
            line.unitCost,
          ),
        );
        costChanged.add(line.productId);
      }

      // 3. Ledger row.
      moves.push({
        productId: line.productId,
        warehouseId: line.warehouseId,
        type: line.type,
        quantity: line.quantity,
        unitCost: line.unitCost ?? average.get(line.productId)!,
        reference: posting.reference,
        reason: posting.reason,
        sourceType: posting.sourceType,
        sourceId: posting.sourceId,
        transferId: posting.transferId,
        createdById: posting.userId,
      });

      // 4. Balance, in the same transaction.
      const balance = await tx.stockBalance.upsert({
        where: {
          productId_warehouseId: { productId: line.productId, warehouseId: line.warehouseId },
        },
        create: {
          productId: line.productId,
          warehouseId: line.warehouseId,
          quantity: line.quantity,
        },
        update: { quantity: { increment: line.quantity } },
      });
      onHand.set(line.productId, onHand.get(line.productId)!.plus(line.quantity));
      resulting.set(`${line.productId}|${line.warehouseId}`, {
        productId: line.productId,
        warehouseId: line.warehouseId,
        qty: new Decimal(balance.quantity),
      });
    }

    // 5. Negative stock policy (checked on the final balances of this posting).
    if (!allowNegative) {
      const negative = [...resulting.values()].find((r) => r.qty.isNegative());
      if (negative) {
        const warehouse = await tx.warehouse.findUnique({ where: { id: negative.warehouseId } });
        const short = negative.qty.negated().toString();
        throw new BadRequestException(
          `Not enough stock of ${products.get(negative.productId)!.sku} in ${
            warehouse?.code ?? 'the warehouse'
          }: ${short} missing. Negative stock is not allowed.`,
        );
      }
    }

    for (const id of costChanged) {
      await tx.product.update({ where: { id }, data: { averageCost: average.get(id)! } });
    }
    await tx.stockMove.createMany({ data: moves });
    return moves.length;
  }

  /**
   * Locks product rows until the transaction ends (SELECT … FOR UPDATE, in id
   * order). Call it before READING balances you will act on, e.g. a stock count
   * that computes "counted − on hand". Locking again in `post` is harmless.
   */
  async lockProducts(tx: Tx, productIds: string[]): Promise<LockedProduct[]> {
    const ids = [...new Set(productIds)].sort();
    if (!ids.length) return [];
    const locked = await tx.$queryRaw<LockedProduct[]>(Prisma.sql`
      SELECT id, sku, average_cost FROM products
      WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY id
      FOR UPDATE`);
    const found = new Set(locked.map((p) => p.id));
    const missing = ids.find((id) => !found.has(id));
    if (missing) throw new BadRequestException(`Product ${missing} not found`);
    return locked;
  }
}
