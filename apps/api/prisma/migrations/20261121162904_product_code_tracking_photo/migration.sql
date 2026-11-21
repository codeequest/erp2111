-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('NONE', 'LOT', 'SERIAL');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'PRODUCT';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "photo_path" TEXT,
ADD COLUMN     "tracking" "TrackingMode" NOT NULL DEFAULT 'NONE';
