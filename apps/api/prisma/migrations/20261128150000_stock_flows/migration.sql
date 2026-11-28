-- AlterTable
ALTER TABLE "customer_return_lines" ADD COLUMN     "delivery_line_id" UUID;

-- AlterTable
ALTER TABLE "sales_order_lines" ADD COLUMN     "reserved_qty" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "customer_return_lines" ADD CONSTRAINT "customer_return_lines_delivery_line_id_fkey" FOREIGN KEY ("delivery_line_id") REFERENCES "delivery_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-written: a line can never reserve a negative quantity
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_reserved_qty_check" CHECK ("reserved_qty" >= 0);
CREATE INDEX "customer_return_lines_delivery_line_id_idx" ON "customer_return_lines"("delivery_line_id");
