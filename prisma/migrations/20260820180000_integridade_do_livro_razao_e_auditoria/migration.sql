-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "dedup_key" TEXT;

-- AlterTable
ALTER TABLE "FinancialEntry" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3),
ADD COLUMN     "updated_by_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Alert_tenant_id_dedup_key_key" ON "Alert"("tenant_id", "dedup_key");

-- CreateIndex
CREATE INDEX "FinancialEntry_tenant_id_status_paid_at_idx" ON "FinancialEntry"("tenant_id", "status", "paid_at");

-- CreateIndex
CREATE INDEX "FinancialEntry_tenant_id_due_date_status_idx" ON "FinancialEntry"("tenant_id", "due_date", "status");

-- CreateIndex
CREATE INDEX "HerdMovement_tenant_id_canceled_at_idx" ON "HerdMovement"("tenant_id", "canceled_at");

-- CreateIndex
CREATE INDEX "StockMovement_tenant_id_canceled_at_idx" ON "StockMovement"("tenant_id", "canceled_at");

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HerdMovement" ADD CONSTRAINT "HerdMovement_from_property_id_fkey" FOREIGN KEY ("from_property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HerdMovement" ADD CONSTRAINT "HerdMovement_to_property_id_fkey" FOREIGN KEY ("to_property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HerdMovement" ADD CONSTRAINT "HerdMovement_from_pasture_id_fkey" FOREIGN KEY ("from_pasture_id") REFERENCES "Pasture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HerdMovement" ADD CONSTRAINT "HerdMovement_to_pasture_id_fkey" FOREIGN KEY ("to_pasture_id") REFERENCES "Pasture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HerdMovement" ADD CONSTRAINT "HerdMovement_financial_entry_id_fkey" FOREIGN KEY ("financial_entry_id") REFERENCES "FinancialEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

