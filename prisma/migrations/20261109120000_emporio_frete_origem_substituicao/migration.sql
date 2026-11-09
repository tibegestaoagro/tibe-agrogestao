-- CreateEnum
CREATE TYPE "EmporioSaleOrigin" AS ENUM ('balcao', 'ecommerce');

-- AlterTable
ALTER TABLE "EmporioSale" ADD COLUMN     "freight_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "origin" "EmporioSaleOrigin" NOT NULL DEFAULT 'balcao',
ADD COLUMN     "replaces_sale_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EmporioSale_replaces_sale_id_key" ON "EmporioSale"("replaces_sale_id");

-- AddForeignKey
ALTER TABLE "EmporioSale" ADD CONSTRAINT "EmporioSale_replaces_sale_id_fkey" FOREIGN KEY ("replaces_sale_id") REFERENCES "EmporioSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
