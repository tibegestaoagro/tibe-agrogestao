-- CreateEnum
CREATE TYPE "EmporioBoletoStatus" AS ENUM ('aberto', 'pago', 'no_fiado', 'cancelado');

-- AlterEnum
ALTER TYPE "CashMovementOrigin" ADD VALUE 'boleto_pago';

-- AlterEnum
ALTER TYPE "EmporioPaymentKind" ADD VALUE 'boleto';

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "boleto_id" TEXT;

-- AlterTable
-- Q284: o titular do cheque. Os antigos recebem o nome do cliente da venda.
ALTER TABLE "EmporioCheck" ADD COLUMN "holder_name" TEXT;
UPDATE "EmporioCheck" c SET "holder_name" = cu."name" FROM "EmporioCustomer" cu WHERE cu."id" = c."customer_id";
ALTER TABLE "EmporioCheck" ALTER COLUMN "holder_name" SET NOT NULL;

-- CreateTable
CREATE TABLE "EmporioBoleto" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "sale_payment_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "number" TEXT,
    "due_on" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "EmporioBoletoStatus" NOT NULL DEFAULT 'aberto',
    "financial_payment_id" TEXT,
    "bank_account_id" TEXT,
    "paid_on" DATE,
    "paid_at" TIMESTAMP(3),
    "sent_to_fiado_at" TIMESTAMP(3),
    "fiado_reason" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmporioBoleto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmporioBoleto_sale_payment_id_key" ON "EmporioBoleto"("sale_payment_id");

-- CreateIndex
CREATE INDEX "EmporioBoleto_tenant_id_status_due_on_idx" ON "EmporioBoleto"("tenant_id", "status", "due_on");

-- CreateIndex
CREATE INDEX "EmporioBoleto_sale_id_idx" ON "EmporioBoleto"("sale_id");

-- CreateIndex
CREATE INDEX "EmporioBoleto_tenant_id_customer_id_idx" ON "EmporioBoleto"("tenant_id", "customer_id");

-- AddForeignKey
ALTER TABLE "EmporioBoleto" ADD CONSTRAINT "EmporioBoleto_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioBoleto" ADD CONSTRAINT "EmporioBoleto_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "EmporioSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioBoleto" ADD CONSTRAINT "EmporioBoleto_sale_payment_id_fkey" FOREIGN KEY ("sale_payment_id") REFERENCES "EmporioSalePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioBoleto" ADD CONSTRAINT "EmporioBoleto_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "EmporioCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioBoleto" ADD CONSTRAINT "EmporioBoleto_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioBoleto" ADD CONSTRAINT "EmporioBoleto_financial_payment_id_fkey" FOREIGN KEY ("financial_payment_id") REFERENCES "FinancialPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioBoleto" ADD CONSTRAINT "EmporioBoleto_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_boleto_id_fkey" FOREIGN KEY ("boleto_id") REFERENCES "EmporioBoleto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

