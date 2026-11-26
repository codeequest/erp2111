-- Tunisian dinar: amounts are kept to the millime (3 decimals). Widening the
-- scale from 2 to 3 keeps every existing value exactly.
ALTER TABLE "purchase_orders"
  ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,3),
  ALTER COLUMN "discount_total" SET DATA TYPE DECIMAL(18,3),
  ALTER COLUMN "tax_total" SET DATA TYPE DECIMAL(18,3),
  ALTER COLUMN "total" SET DATA TYPE DECIMAL(18,3);

ALTER TABLE "purchase_order_lines"
  ALTER COLUMN "line_total" SET DATA TYPE DECIMAL(18,3);
