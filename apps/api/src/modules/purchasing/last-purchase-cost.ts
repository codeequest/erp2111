import { Prisma } from '@prisma/client';

/**
 * "Last purchase price" costing: each product remembers the cost per base unit of its
 * latest purchase document, in the company currency:
 *  - a posted goods receipt (order price after discount, before VAT), or
 *  - a posted supplier bill line in the company currency (what was really invoiced,
 *    after the line discount and its share of the bill discount, before VAT).
 * On the same day the bill wins: it carries the final price.
 *
 * Recomputed from the documents (never incremented), so posting, cancelling or
 * correcting a document always leaves the right value. Call it inside the transaction
 * that changed the documents.
 */
export async function refreshLastPurchaseCost(
  tx: Prisma.TransactionClient,
  productIds: string[],
): Promise<Record<string, { before: string; after: string }>> {
  const changes: Record<string, { before: string; after: string }> = {};
  if (!productIds.length) return changes;
  const settings = await tx.companySettings.findUnique({
    where: { id: 1 },
    select: { currency: true },
  });
  const currency = settings?.currency ?? 'TND';

  for (const productId of [...new Set(productIds)].sort()) {
    const [receipt] = await tx.$queryRaw<{ cost: Prisma.Decimal; at: Date }[]>`
      SELECT l.unit_cost AS cost, r.received_at AS at
      FROM goods_receipt_lines l
      JOIN goods_receipts r ON r.id = l.goods_receipt_id
      WHERE l.product_id = ${productId}::uuid AND r.status = 'POSTED' AND l.quantity > 0
      ORDER BY r.received_at DESC, r.posted_at DESC NULLS LAST
      LIMIT 1`;
    const [bill] = await tx.$queryRaw<{ cost: Prisma.Decimal; at: Date }[]>`
      SELECT ROUND(il.line_subtotal / il.quantity / COALESCE(grl.unit_factor, 1), 4) AS cost,
             i.issue_date AS at
      FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoice_id
      LEFT JOIN goods_receipt_lines grl ON grl.id = il.goods_receipt_line_id
      WHERE il.product_id = ${productId}::uuid
        AND i.type = 'SUPPLIER_BILL'
        AND i.status IN ('POSTED', 'PARTIALLY_PAID', 'PAID')
        AND i.currency = ${currency}
        AND il.quantity > 0
      ORDER BY i.issue_date DESC, i.posted_at DESC NULLS LAST
      LIMIT 1`;

    const day = (d: Date) => d.toISOString().slice(0, 10);
    const latest =
      receipt && bill
        ? day(bill.at) >= day(receipt.at)
          ? bill
          : receipt
        : (bill ?? receipt ?? null);

    const product = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: { sku: true, lastPurchaseCost: true, lastPurchaseAt: true },
    });
    const cost = latest ? new Prisma.Decimal(latest.cost) : new Prisma.Decimal(0);
    const at = latest?.at ?? null;
    if (!cost.eq(product.lastPurchaseCost) || at?.getTime() !== product.lastPurchaseAt?.getTime()) {
      await tx.product.update({
        where: { id: productId },
        data: { lastPurchaseCost: cost, lastPurchaseAt: at },
      });
      changes[product.sku] = {
        before: product.lastPurchaseCost.toFixed(4),
        after: cost.toFixed(4),
      };
    }
  }
  return changes;
}
