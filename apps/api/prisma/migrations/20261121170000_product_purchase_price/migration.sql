-- Usual purchase price (HT) of a product, entered by hand in the catalog
ALTER TABLE "products" ADD COLUMN "purchase_price" DECIMAL(18,4) NOT NULL DEFAULT 0;
