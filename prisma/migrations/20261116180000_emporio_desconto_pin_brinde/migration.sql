-- AlterTable
ALTER TABLE "EmporioQuote" ADD COLUMN     "order_discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EmporioSale" ADD COLUMN     "order_discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emporio_auth_pin_hash" TEXT;
