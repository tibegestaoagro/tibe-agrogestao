-- CreateEnum
CREATE TYPE "EmporioPaymentKind" AS ENUM ('dinheiro', 'pix', 'debito', 'credito_vista', 'credito_parcelado', 'cheque', 'fiado', 'troca');

-- CreateEnum
CREATE TYPE "EmporioSaleStatus" AS ENUM ('concluida', 'cancelada');

-- CreateEnum
CREATE TYPE "CashDirection" AS ENUM ('entrada', 'saida');

-- CreateEnum
CREATE TYPE "CashMovementOrigin" AS ENUM ('venda', 'recebimento_fiado', 'cancelamento_venda', 'devolucao', 'implantacao');

-- CreateEnum
CREATE TYPE "EmporioRefundKind" AS ENUM ('dinheiro', 'abater_fiado', 'troca');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'abertura_lacrado';
ALTER TYPE "StockMovementType" ADD VALUE 'abertura_avulso';
ALTER TYPE "StockMovementType" ADD VALUE 'devolucao';

-- AlterTable
ALTER TABLE "Establishment" ADD COLUMN     "pix_bank_account_id" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "sale_id" TEXT,
ADD COLUMN     "sale_return_id" TEXT;

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bank" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmporioSale" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "operation_key" TEXT NOT NULL,
    "contact_id" TEXT,
    "sold_at" TIMESTAMP(3) NOT NULL,
    "sold_by_user_id" TEXT,
    "net_amount" DECIMAL(14,2) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_authorized_by_user_id" TEXT,
    "status" "EmporioSaleStatus" NOT NULL DEFAULT 'concluida',
    "canceled_at" TIMESTAMP(3),
    "canceled_by_user_id" TEXT,
    "canceled_reason" TEXT,
    "exchange_return_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmporioSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmporioSaleItem" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "emporio_product_id" TEXT NOT NULL,
    "presentation_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "base_qty" DECIMAL(14,3) NOT NULL,
    "suggested_price" DECIMAL(14,2),
    "unit_price" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "unit_cost" DECIMAL(14,4),
    "cost_estimated" BOOLEAN NOT NULL DEFAULT false,
    "cost_provisional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EmporioSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmporioSalePayment" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "kind" "EmporioPaymentKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "bank_account_id" TEXT,
    "financial_payment_id" TEXT,
    "due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmporioSalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmporioSaleReturn" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "operation_key" TEXT NOT NULL,
    "refund_kind" "EmporioRefundKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "returned_at" TIMESTAMP(3) NOT NULL,
    "returned_by_user_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmporioSaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmporioSaleReturnItem" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "sale_item_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "base_qty" DECIMAL(14,3) NOT NULL,
    "loss_reason" "EmporioLossReason",

    CONSTRAINT "EmporioSaleReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT,
    "bank_account_id" TEXT,
    "direction" "CashDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "origin" "CashMovementOrigin" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "sale_id" TEXT,
    "sale_return_id" TEXT,
    "financial_payment_id" TEXT,
    "operation_key" TEXT,
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankAccount_tenant_id_idx" ON "BankAccount"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_tenant_id_name_key" ON "BankAccount"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioSale_exchange_return_id_key" ON "EmporioSale"("exchange_return_id");

-- CreateIndex
CREATE INDEX "EmporioSale_tenant_id_establishment_id_sold_at_idx" ON "EmporioSale"("tenant_id", "establishment_id", "sold_at");

-- CreateIndex
CREATE INDEX "EmporioSale_tenant_id_contact_id_idx" ON "EmporioSale"("tenant_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioSale_tenant_id_operation_key_key" ON "EmporioSale"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "EmporioSaleItem_tenant_id_idx" ON "EmporioSaleItem"("tenant_id");

-- CreateIndex
CREATE INDEX "EmporioSaleItem_sale_id_idx" ON "EmporioSaleItem"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioSalePayment_financial_payment_id_key" ON "EmporioSalePayment"("financial_payment_id");

-- CreateIndex
CREATE INDEX "EmporioSalePayment_tenant_id_idx" ON "EmporioSalePayment"("tenant_id");

-- CreateIndex
CREATE INDEX "EmporioSalePayment_sale_id_idx" ON "EmporioSalePayment"("sale_id");

-- CreateIndex
CREATE INDEX "EmporioSaleReturn_tenant_id_idx" ON "EmporioSaleReturn"("tenant_id");

-- CreateIndex
CREATE INDEX "EmporioSaleReturn_sale_id_idx" ON "EmporioSaleReturn"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioSaleReturn_tenant_id_operation_key_key" ON "EmporioSaleReturn"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "EmporioSaleReturnItem_tenant_id_idx" ON "EmporioSaleReturnItem"("tenant_id");

-- CreateIndex
CREATE INDEX "EmporioSaleReturnItem_return_id_idx" ON "EmporioSaleReturnItem"("return_id");

-- CreateIndex
CREATE INDEX "CashMovement_tenant_id_operation_key_idx" ON "CashMovement"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "CashMovement_tenant_id_establishment_id_idx" ON "CashMovement"("tenant_id", "establishment_id");

-- CreateIndex
CREATE INDEX "CashMovement_tenant_id_bank_account_id_idx" ON "CashMovement"("tenant_id", "bank_account_id");

-- AddForeignKey
ALTER TABLE "Establishment" ADD CONSTRAINT "Establishment_pix_bank_account_id_fkey" FOREIGN KEY ("pix_bank_account_id") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSale" ADD CONSTRAINT "EmporioSale_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSale" ADD CONSTRAINT "EmporioSale_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSale" ADD CONSTRAINT "EmporioSale_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSale" ADD CONSTRAINT "EmporioSale_exchange_return_id_fkey" FOREIGN KEY ("exchange_return_id") REFERENCES "EmporioSaleReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSaleItem" ADD CONSTRAINT "EmporioSaleItem_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSaleItem" ADD CONSTRAINT "EmporioSaleItem_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "EmporioSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSaleItem" ADD CONSTRAINT "EmporioSaleItem_emporio_product_id_fkey" FOREIGN KEY ("emporio_product_id") REFERENCES "EmporioProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSaleItem" ADD CONSTRAINT "EmporioSaleItem_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "ProductPresentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSalePayment" ADD CONSTRAINT "EmporioSalePayment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSalePayment" ADD CONSTRAINT "EmporioSalePayment_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "EmporioSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSalePayment" ADD CONSTRAINT "EmporioSalePayment_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSalePayment" ADD CONSTRAINT "EmporioSalePayment_financial_payment_id_fkey" FOREIGN KEY ("financial_payment_id") REFERENCES "FinancialPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSaleReturn" ADD CONSTRAINT "EmporioSaleReturn_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSaleReturn" ADD CONSTRAINT "EmporioSaleReturn_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "EmporioSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSaleReturnItem" ADD CONSTRAINT "EmporioSaleReturnItem_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSaleReturnItem" ADD CONSTRAINT "EmporioSaleReturnItem_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "EmporioSaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSaleReturnItem" ADD CONSTRAINT "EmporioSaleReturnItem_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "EmporioSaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "EmporioSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "EmporioSaleReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_financial_payment_id_fkey" FOREIGN KEY ("financial_payment_id") REFERENCES "FinancialPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "EmporioSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "EmporioSaleReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Q82: o dinheiro esta na gaveta da loja OU numa conta, exatamente um dos dois.
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_exactly_one_place" CHECK (("establishment_id" IS NULL) <> ("bank_account_id" IS NULL));

-- O sinal vem de direction; o valor e sempre positivo.
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_amount_positive" CHECK ("amount" > 0);
