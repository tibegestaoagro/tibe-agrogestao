-- CreateEnum
CREATE TYPE "CardKind" AS ENUM ('debito', 'credito_vista', 'credito_parcelado');

-- CreateEnum
CREATE TYPE "EmporioCheckStatus" AS ENUM ('recebido', 'depositado', 'compensado', 'devolvido', 'devolvido_ao_cliente');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CashMovementOrigin" ADD VALUE 'transferencia';
ALTER TYPE "CashMovementOrigin" ADD VALUE 'conferencia';
ALTER TYPE "CashMovementOrigin" ADD VALUE 'cheque_compensado';
ALTER TYPE "CashMovementOrigin" ADD VALUE 'estorno_cartao';

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "card_receivable_id" TEXT,
ADD COLUMN     "cash_count_id" TEXT,
ADD COLUMN     "cash_transfer_id" TEXT,
ADD COLUMN     "check_id" TEXT;

-- AlterTable
ALTER TABLE "EmporioSalePayment" ADD COLUMN     "fee_amount" DECIMAL(14,2),
ADD COLUMN     "fee_pct" DECIMAL(5,2),
ADD COLUMN     "installments" INTEGER;

-- CreateTable
CREATE TABLE "CardFeeRule" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "kind" "CardKind" NOT NULL,
    "fee_pct" DECIMAL(5,2) NOT NULL,
    "days" INTEGER NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardFeeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardReceivable" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "sale_payment_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "installment" INTEGER NOT NULL,
    "installments" INTEGER NOT NULL,
    "gross_amount" DECIMAL(14,2) NOT NULL,
    "net_amount" DECIMAL(14,2) NOT NULL,
    "expected_on" DATE NOT NULL,
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmporioCheck" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "sale_payment_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "good_for" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "EmporioCheckStatus" NOT NULL DEFAULT 'recebido',
    "financial_payment_id" TEXT,
    "bank_account_id" TEXT,
    "deposited_at" TIMESTAMP(3),
    "cleared_at" TIMESTAMP(3),
    "returned_at" TIMESTAMP(3),
    "return_reason" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmporioCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashTransfer" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "operation_key" TEXT NOT NULL,
    "from_establishment_id" TEXT,
    "from_bank_account_id" TEXT,
    "to_establishment_id" TEXT,
    "to_bank_account_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashCount" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "expected" DECIMAL(14,2) NOT NULL,
    "counted" DECIMAL(14,2) NOT NULL,
    "difference" DECIMAL(14,2) NOT NULL,
    "justification" TEXT,
    "counted_at" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardFeeRule_tenant_id_idx" ON "CardFeeRule"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "CardFeeRule_establishment_id_kind_key" ON "CardFeeRule"("establishment_id", "kind");

-- CreateIndex
CREATE INDEX "CardReceivable_tenant_id_bank_account_id_expected_on_idx" ON "CardReceivable"("tenant_id", "bank_account_id", "expected_on");

-- CreateIndex
CREATE INDEX "CardReceivable_sale_id_idx" ON "CardReceivable"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioCheck_sale_payment_id_key" ON "EmporioCheck"("sale_payment_id");

-- CreateIndex
CREATE INDEX "EmporioCheck_tenant_id_status_idx" ON "EmporioCheck"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "EmporioCheck_sale_id_idx" ON "EmporioCheck"("sale_id");

-- CreateIndex
CREATE INDEX "CashTransfer_tenant_id_idx" ON "CashTransfer"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransfer_tenant_id_operation_key_key" ON "CashTransfer"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "CashCount_tenant_id_establishment_id_counted_at_idx" ON "CashCount"("tenant_id", "establishment_id", "counted_at");

-- AddForeignKey
ALTER TABLE "CardFeeRule" ADD CONSTRAINT "CardFeeRule_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardFeeRule" ADD CONSTRAINT "CardFeeRule_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardFeeRule" ADD CONSTRAINT "CardFeeRule_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReceivable" ADD CONSTRAINT "CardReceivable_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReceivable" ADD CONSTRAINT "CardReceivable_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "EmporioSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReceivable" ADD CONSTRAINT "CardReceivable_sale_payment_id_fkey" FOREIGN KEY ("sale_payment_id") REFERENCES "EmporioSalePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReceivable" ADD CONSTRAINT "CardReceivable_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReceivable" ADD CONSTRAINT "CardReceivable_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCheck" ADD CONSTRAINT "EmporioCheck_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCheck" ADD CONSTRAINT "EmporioCheck_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "EmporioSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCheck" ADD CONSTRAINT "EmporioCheck_sale_payment_id_fkey" FOREIGN KEY ("sale_payment_id") REFERENCES "EmporioSalePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCheck" ADD CONSTRAINT "EmporioCheck_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCheck" ADD CONSTRAINT "EmporioCheck_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCheck" ADD CONSTRAINT "EmporioCheck_financial_payment_id_fkey" FOREIGN KEY ("financial_payment_id") REFERENCES "FinancialPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCheck" ADD CONSTRAINT "EmporioCheck_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cash_transfer_id_fkey" FOREIGN KEY ("cash_transfer_id") REFERENCES "CashTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cash_count_id_fkey" FOREIGN KEY ("cash_count_id") REFERENCES "CashCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "EmporioCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_card_receivable_id_fkey" FOREIGN KEY ("card_receivable_id") REFERENCES "CardReceivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Q92: a transferencia sai de exatamente um lugar e entra em exatamente um.
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_exactly_one_from" CHECK (("from_establishment_id" IS NULL) <> ("from_bank_account_id" IS NULL));
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_exactly_one_to" CHECK (("to_establishment_id" IS NULL) <> ("to_bank_account_id" IS NULL));
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_amount_positive" CHECK ("amount" > 0);

-- Q89: taxa de 0 a 100% e prazo de 0 a 120 dias.
ALTER TABLE "CardFeeRule" ADD CONSTRAINT "CardFeeRule_fee_range" CHECK ("fee_pct" >= 0 AND "fee_pct" <= 100);
ALTER TABLE "CardFeeRule" ADD CONSTRAINT "CardFeeRule_days_range" CHECK ("days" >= 0 AND "days" <= 120);

