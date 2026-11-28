-- AlterTable
ALTER TABLE "stock_moves" ADD COLUMN     "seq" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "stock_moves_seq_key" ON "stock_moves"("seq");

-- CreateIndex
CREATE INDEX "stock_moves_product_id_warehouse_id_seq_idx" ON "stock_moves"("product_id", "warehouse_id", "seq");

