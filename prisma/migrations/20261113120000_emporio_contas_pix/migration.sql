-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN     "beneficiary" TEXT,
ADD COLUMN     "document" TEXT,
ADD COLUMN     "pix_all_establishments" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "BankAccountPixEstablishment" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccountPixEstablishment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankAccountPixEstablishment_tenant_id_idx" ON "BankAccountPixEstablishment"("tenant_id");

-- CreateIndex
CREATE INDEX "BankAccountPixEstablishment_establishment_id_idx" ON "BankAccountPixEstablishment"("establishment_id");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccountPixEstablishment_bank_account_id_establishment_i_key" ON "BankAccountPixEstablishment"("bank_account_id", "establishment_id");

-- AddForeignKey
ALTER TABLE "BankAccountPixEstablishment" ADD CONSTRAINT "BankAccountPixEstablishment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccountPixEstablishment" ADD CONSTRAINT "BankAccountPixEstablishment_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccountPixEstablishment" ADD CONSTRAINT "BankAccountPixEstablishment_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
