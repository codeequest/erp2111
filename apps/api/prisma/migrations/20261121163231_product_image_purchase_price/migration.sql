-- AlterTable
ALTER TABLE "products" ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "purchase_price" DECIMAL(18,4) NOT NULL DEFAULT 0;
