-- CreateEnum
CREATE TYPE "ReceiptQuality" AS ENUM ('CONFORM', 'NON_CONFORM');

-- AlterTable
ALTER TABLE "goods_receipt_lines" ADD COLUMN     "expiry_date" DATE,
ADD COLUMN     "lot_number" TEXT,
ADD COLUMN     "quality" "ReceiptQuality" NOT NULL DEFAULT 'CONFORM';
