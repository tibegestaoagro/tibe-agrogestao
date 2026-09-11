
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('dinheiro', 'pix', 'transferencia', 'boleto', 'cheque', 'cartao', 'outro');

-- AlterTable
ALTER TABLE "FinancialEntry" ADD COLUMN     "contact_id" TEXT,
ADD COLUMN     "payment_method" "PaymentMethod",
ADD COLUMN     "property_id" TEXT;

-- CreateTable
CREATE TABLE "FinancialPayment" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,

    CONSTRAINT "FinancialPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialPayment_tenant_id_idx" ON "FinancialPayment"("tenant_id");

-- CreateIndex
CREATE INDEX "FinancialPayment_entry_id_idx" ON "FinancialPayment"("entry_id");

-- CreateIndex
CREATE INDEX "FinancialPayment_tenant_id_paid_at_idx" ON "FinancialPayment"("tenant_id", "paid_at");

-- CreateIndex
CREATE INDEX "FinancialEntry_tenant_id_property_id_idx" ON "FinancialEntry"("tenant_id", "property_id");

-- CreateIndex
CREATE INDEX "FinancialEntry_contact_id_idx" ON "FinancialEntry"("contact_id");

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPayment" ADD CONSTRAINT "FinancialPayment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPayment" ADD CONSTRAINT "FinancialPayment_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "FinancialEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPayment" ADD CONSTRAINT "FinancialPayment_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

