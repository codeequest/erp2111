-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "price_list_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "track_lots" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stock_moves" ADD COLUMN     "lot_id" UUID;

-- CreateTable
CREATE TABLE "price_lists" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adjustment_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_prices" (
    "product_id" UUID NOT NULL,
    "price_list_id" UUID NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("product_id","price_list_id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lot_number" TEXT NOT NULL,
    "expiry_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_balances" (
    "lot_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lot_balances_pkey" PRIMARY KEY ("lot_id","warehouse_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_code_key" ON "price_lists"("code");

-- CreateIndex
CREATE INDEX "product_prices_price_list_id_idx" ON "product_prices"("price_list_id");

-- CreateIndex
CREATE INDEX "lots_expiry_date_idx" ON "lots"("expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "lots_product_id_lot_number_key" ON "lots"("product_id", "lot_number");

-- CreateIndex
CREATE INDEX "stock_moves_lot_id_idx" ON "stock_moves"("lot_id");

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_balances" ADD CONSTRAINT "lot_balances_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_balances" ADD CONSTRAINT "lot_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
