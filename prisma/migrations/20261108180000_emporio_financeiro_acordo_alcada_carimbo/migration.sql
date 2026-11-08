-- AlterTable
ALTER TABLE "CardReceivable" ADD COLUMN     "reconciled_at" TIMESTAMP(3),
ADD COLUMN     "reconciled_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "reconciled_at" TIMESTAMP(3),
ADD COLUMN     "reconciled_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "EmporioSettings" ADD COLUMN     "payment_approval_limit" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "FinancialEntry" ADD COLUMN     "agreement_id" TEXT;

-- CreateTable
CREATE TABLE "EmporioCreditAgreement" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "installments" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmporioCreditAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmporioPaymentRequest" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "entry_ids" TEXT[],
    "establishment_id" TEXT,
    "cash_register_id" TEXT,
    "bank_account_id" TEXT,
    "total" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "last_failure" TEXT,
    "decided_by_user_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmporioPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmporioCreditAgreement_tenant_id_customer_id_idx" ON "EmporioCreditAgreement"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "EmporioPaymentRequest_tenant_id_status_idx" ON "EmporioPaymentRequest"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "FinancialEntry_agreement_id_idx" ON "FinancialEntry"("agreement_id");

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "EmporioCreditAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCreditAgreement" ADD CONSTRAINT "EmporioCreditAgreement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCreditAgreement" ADD CONSTRAINT "EmporioCreditAgreement_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "EmporioCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCreditAgreement" ADD CONSTRAINT "EmporioCreditAgreement_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioPaymentRequest" ADD CONSTRAINT "EmporioPaymentRequest_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioPaymentRequest" ADD CONSTRAINT "EmporioPaymentRequest_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
