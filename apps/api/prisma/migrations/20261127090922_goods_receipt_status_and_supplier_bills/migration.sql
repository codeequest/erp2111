-- Goods receipts get a status (draft / posted / cancelled); supplier bills and payments
-- are kept to the millime (3 decimals, widening only: no data is lost) and in TND, EUR or USD.
-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- DropIndex
DROP INDEX "invoices_supplier_id_idx";

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "receipt_tolerance_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ALTER COLUMN "currency" SET DEFAULT 'TND';

-- AlterTable
ALTER TABLE "goods_receipt_lines" ADD COLUMN     "billed_qty" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "reject_reason" TEXT,
ADD COLUMN     "rejected_qty" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "goods_receipts" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "posted_at" TIMESTAMP(3),
ADD COLUMN     "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Receipts created before this migration moved the stock at once: they are posted.
UPDATE "goods_receipts" SET "status" = 'POSTED', "posted_at" = "created_at";

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "goods_receipt_line_id" UUID,
ALTER COLUMN "line_subtotal" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "line_tax" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "line_total" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "discount_total" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "tax_total" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "amount_paid" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "payment_allocations" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'TND',
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "last_purchase_at" TIMESTAMP(3),
ADD COLUMN     "last_purchase_cost" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "goods_receipts_status_idx" ON "goods_receipts"("status");

-- CreateIndex
CREATE INDEX "invoice_lines_goods_receipt_line_id_idx" ON "invoice_lines"("goods_receipt_line_id");

-- CreateIndex
CREATE INDEX "invoices_supplier_id_supplier_ref_idx" ON "invoices"("supplier_id", "supplier_ref");

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_goods_receipt_line_id_fkey" FOREIGN KEY ("goods_receipt_line_id") REFERENCES "goods_receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Last purchase cost = cost of each product's latest receipt so far.
UPDATE "products" p
SET "last_purchase_cost" = x."unit_cost", "last_purchase_at" = x."received_at"
FROM (
  SELECT DISTINCT ON (l."product_id") l."product_id", l."unit_cost", r."received_at"
  FROM "goods_receipt_lines" l
  JOIN "goods_receipts" r ON r."id" = l."goods_receipt_id"
  ORDER BY l."product_id", r."received_at" DESC, r."number" DESC
) x
WHERE p."id" = x."product_id";

-- The company currency was "USD" only as the old default; the ERP works in dinars.
UPDATE "company_settings" SET "currency" = 'TND' WHERE "currency" = 'USD';
