-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('STOCKABLE', 'CONSUMABLE', 'SERVICE');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "purchase_price" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "type" "ProductType" NOT NULL DEFAULT 'STOCKABLE';

-- CreateTable
CREATE TABLE "product_images" (
    "product_id" UUID NOT NULL,
    "mime_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("product_id")
);

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
