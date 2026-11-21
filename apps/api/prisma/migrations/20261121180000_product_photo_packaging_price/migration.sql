-- Product photo (file name) and optional sale price per packaging
ALTER TABLE "products" ADD COLUMN "photo_file" TEXT;
ALTER TABLE "product_units" ADD COLUMN "sale_price" DECIMAL(18,4);
