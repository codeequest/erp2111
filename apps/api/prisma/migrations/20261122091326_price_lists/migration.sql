-- CreateTable
CREATE TABLE "price_lists" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "adjust_percent" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_items" (
    "id" UUID NOT NULL,
    "price_list_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_name_key" ON "price_lists"("name");

-- CreateIndex
CREATE INDEX "price_list_items_product_id_idx" ON "price_list_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_items_price_list_id_product_id_unit_id_key" ON "price_list_items"("price_list_id", "product_id", "unit_id");

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
