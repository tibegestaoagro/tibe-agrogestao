-- AlterTable
ALTER TABLE "EmporioSale" ADD COLUMN     "seller_user_id" TEXT;

-- CreateIndex
CREATE INDEX "EmporioSale_tenant_id_seller_user_id_sold_at_idx" ON "EmporioSale"("tenant_id", "seller_user_id", "sold_at");

-- Backfill: antes desta entrega quem registrava era quem vendia.
UPDATE "EmporioSale" SET "seller_user_id" = "sold_by_user_id" WHERE "seller_user_id" IS NULL AND "sold_by_user_id" IS NOT NULL;
