import { Prisma, StockMoveType } from '@prisma/client';

/**
 * Low-level stock ledger writes. Every module that moves stock (adjustments,
 * transfers, receipts, deliveries, returns) goes through these two functions so
 * that the ledger and the cached balance can never drift apart.
 *
 * Always call them inside a Prisma transaction.
 */

/**
 * Locks the balance row of (product, warehouse) until the transaction ends and
 * returns the current quantity. Creates the row at 0 if it does not exist yet.
 *
 * Lock rows in a stable order (e.g. sorted by productId) when a document touches
 * several products, to avoid deadlocks between concurrent documents.
 */
export async function lockBalance(
  tx: Prisma.TransactionClient,
  productId: string,
  warehouseId: string,
): Promise<Prisma.Decimal> {
  await tx.$executeRaw`
    INSERT INTO stock_balances (product_id, warehouse_id, quantity, updated_at)
    VALUES (${productId}::uuid, ${warehouseId}::uuid, 0, now())
    ON CONFLICT (product_id, warehouse_id) DO NOTHING`;
  const rows = await tx.$queryRaw<{ quantity: Prisma.Decimal | string }[]>`
    SELECT quantity FROM stock_balances
    WHERE product_id = ${productId}::uuid AND warehouse_id = ${warehouseId}::uuid
    FOR UPDATE`;
  return new Prisma.Decimal(rows[0].quantity);
}

export interface MoveInput {
  productId: string;
  warehouseId: string;
  type: StockMoveType;
  /** Signed, in the base unit. */
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  createdById: string;
  sourceType?: string;
  sourceId?: string;
  reference?: string;
  reason?: string;
  transferId?: string;
}

/**
 * Appends one ledger row and sets the cached balance to `newBalance`.
 * The caller must have locked the balance with lockBalance() and computed
 * `newBalance = locked + move.quantity` (and checked it is allowed).
 */
export async function postMove(
  tx: Prisma.TransactionClient,
  move: MoveInput,
  newBalance: Prisma.Decimal,
): Promise<void> {
  await tx.stockMove.create({ data: move });
  await tx.stockBalance.update({
    where: {
      productId_warehouseId: { productId: move.productId, warehouseId: move.warehouseId },
    },
    data: { quantity: newBalance },
  });
}
