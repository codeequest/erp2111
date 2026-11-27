-- Goods receipts no longer need a purchase order: a receipt belongs to a supplier and
-- carries its own unit and price per line. Posted receipts can be attached to an order
-- from the order page; the order's received quantities come from the attached receipts.

-- DropForeignKey
ALTER TABLE "goods_receipt_lines" DROP CONSTRAINT "goods_receipt_lines_purchase_order_line_id_fkey";
ALTER TABLE "goods_receipts" DROP CONSTRAINT "goods_receipts_purchase_order_id_fkey";

-- New columns, filled from the orders of the existing receipts, then required
ALTER TABLE "goods_receipts" ADD COLUMN "supplier_id" UUID,
ALTER COLUMN "purchase_order_id" DROP NOT NULL;

ALTER TABLE "goods_receipt_lines" ADD COLUMN "matched_qty" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN "unit_factor" DECIMAL(18,4) NOT NULL DEFAULT 1,
ADD COLUMN "unit_id" UUID,
ADD COLUMN "unit_price" DECIMAL(18,4) NOT NULL DEFAULT 0,
ALTER COLUMN "purchase_order_line_id" DROP NOT NULL;

UPDATE "goods_receipts" r SET "supplier_id" = po."supplier_id"
FROM "purchase_orders" po WHERE po."id" = r."purchase_order_id";

UPDATE "goods_receipt_lines" l
SET "unit_id" = pol."unit_id",
    "unit_factor" = pol."unit_factor",
    "unit_price" = ROUND(pol."unit_price" * (100 - pol."discount_pct") / 100, 4)
FROM "purchase_order_lines" pol WHERE pol."id" = l."purchase_order_line_id";

-- Posted receipts stay attached to their order: what they received is what the order counts.
UPDATE "goods_receipt_lines" l SET "matched_qty" = l."quantity"
FROM "goods_receipts" r WHERE r."id" = l."goods_receipt_id" AND r."status" = 'POSTED';

-- Drafts and cancelled receipts are not counted on any order any more.
UPDATE "goods_receipt_lines" l SET "purchase_order_line_id" = NULL
FROM "goods_receipts" r WHERE r."id" = l."goods_receipt_id" AND r."status" <> 'POSTED';
UPDATE "goods_receipts" SET "purchase_order_id" = NULL WHERE "status" <> 'POSTED';

ALTER TABLE "goods_receipts" ALTER COLUMN "supplier_id" SET NOT NULL;
ALTER TABLE "goods_receipt_lines" ALTER COLUMN "unit_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "goods_receipts_supplier_id_idx" ON "goods_receipts"("supplier_id");

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Position of each line on its receipt (entry order)
ALTER TABLE "goods_receipt_lines" ADD COLUMN "line_no" INTEGER NOT NULL DEFAULT 0;
UPDATE "goods_receipt_lines" l SET "line_no" = x.n
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY goods_receipt_id ORDER BY id) AS n
  FROM "goods_receipt_lines"
) x WHERE x.id = l.id;
