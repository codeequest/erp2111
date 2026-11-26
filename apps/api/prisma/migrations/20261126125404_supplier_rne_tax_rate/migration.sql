-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "rne" TEXT,
ADD COLUMN     "tax_rate_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_rne_key" ON "suppliers"("rne");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

