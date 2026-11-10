-- AlterTable
ALTER TABLE "EmporioQuote" ADD COLUMN     "based_on_quote_id" TEXT,
ADD COLUMN     "canceled_at" TIMESTAMP(3),
ADD COLUMN     "canceled_by_user_id" TEXT,
ADD COLUMN     "canceled_reason" TEXT;

-- CreateIndex
CREATE INDEX "EmporioQuote_tenant_id_based_on_quote_id_idx" ON "EmporioQuote"("tenant_id", "based_on_quote_id");

-- AddForeignKey
ALTER TABLE "EmporioQuote" ADD CONSTRAINT "EmporioQuote_based_on_quote_id_fkey" FOREIGN KEY ("based_on_quote_id") REFERENCES "EmporioQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

