-- AlterEnum
ALTER TYPE "CashMovementOrigin" ADD VALUE 'pagamento_franqueado';

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "franchisee_payment_id" TEXT;

-- AlterTable
ALTER TABLE "EmporioQuote" ADD COLUMN     "franchisee_credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "franchisee_id" TEXT;

-- AlterTable
ALTER TABLE "EmporioSale" ADD COLUMN     "franchisee_credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "franchisee_id" TEXT;

-- CreateTable
CREATE TABLE "EmporioFranchisee" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "document" TEXT,
    "notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmporioFranchisee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmporioFranchiseePayment" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "franchisee_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "establishment_id" TEXT,
    "bank_account_id" TEXT,
    "cash_register_id" TEXT,
    "cash_session_id" TEXT,
    "notes" TEXT,
    "operation_key" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmporioFranchiseePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmporioFranchisee_tenant_id_idx" ON "EmporioFranchisee"("tenant_id");

-- CreateIndex
CREATE INDEX "EmporioFranchiseePayment_tenant_id_idx" ON "EmporioFranchiseePayment"("tenant_id");

-- CreateIndex
CREATE INDEX "EmporioFranchiseePayment_tenant_id_franchisee_id_idx" ON "EmporioFranchiseePayment"("tenant_id", "franchisee_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioFranchiseePayment_tenant_id_operation_key_key" ON "EmporioFranchiseePayment"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "CashMovement_tenant_id_franchisee_payment_id_idx" ON "CashMovement"("tenant_id", "franchisee_payment_id");

-- CreateIndex
CREATE INDEX "EmporioQuote_tenant_id_franchisee_id_idx" ON "EmporioQuote"("tenant_id", "franchisee_id");

-- CreateIndex
CREATE INDEX "EmporioSale_tenant_id_franchisee_id_idx" ON "EmporioSale"("tenant_id", "franchisee_id");

-- AddForeignKey
ALTER TABLE "EmporioSale" ADD CONSTRAINT "EmporioSale_franchisee_id_fkey" FOREIGN KEY ("franchisee_id") REFERENCES "EmporioFranchisee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioQuote" ADD CONSTRAINT "EmporioQuote_franchisee_id_fkey" FOREIGN KEY ("franchisee_id") REFERENCES "EmporioFranchisee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_franchisee_payment_id_fkey" FOREIGN KEY ("franchisee_payment_id") REFERENCES "EmporioFranchiseePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioFranchisee" ADD CONSTRAINT "EmporioFranchisee_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioFranchiseePayment" ADD CONSTRAINT "EmporioFranchiseePayment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioFranchiseePayment" ADD CONSTRAINT "EmporioFranchiseePayment_franchisee_id_fkey" FOREIGN KEY ("franchisee_id") REFERENCES "EmporioFranchisee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioFranchiseePayment" ADD CONSTRAINT "EmporioFranchiseePayment_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioFranchiseePayment" ADD CONSTRAINT "EmporioFranchiseePayment_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

