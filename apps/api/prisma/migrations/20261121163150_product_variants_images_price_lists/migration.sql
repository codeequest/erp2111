-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "price_list_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "has_variants" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parent_id" UUID,
ADD COLUMN     "variant_options" JSONB,
ADD COLUMN     "variant_values" JSONB;

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_items" (
    "price_list_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_list_items_pkey" PRIMARY KEY ("price_list_id","product_id")
);

-- CreateIndex
CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_code_key" ON "price_lists"("code");

-- CreateIndex
CREATE INDEX "price_list_items_product_id_idx" ON "price_list_items"("product_id");

-- CreateIndex
CREATE INDEX "products_parent_id_idx" ON "products"("parent_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
