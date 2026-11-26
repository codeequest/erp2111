-- AlterTable
ALTER TABLE "goods_receipt_lines" ADD COLUMN     "base_quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "value" DECIMAL(18,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "goods_receipts" ADD COLUMN     "supplier_ref" TEXT;

-- CreateIndex
CREATE INDEX "goods_receipts_received_at_idx" ON "goods_receipts"("received_at");

