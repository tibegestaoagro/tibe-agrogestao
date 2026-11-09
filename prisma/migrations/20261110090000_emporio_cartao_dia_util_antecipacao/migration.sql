-- CreateEnum
CREATE TYPE "CardBusinessDayRule" AS ENUM ('proximo_dia_util', 'dias_corridos');

-- CreateEnum
CREATE TYPE "CardAnticipationKind" AS ENUM ('pontual', 'automatica');

-- AlterTable
ALTER TABLE "CardAcquirer" ADD COLUMN     "auto_anticipation_business_days" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "auto_anticipation_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "auto_anticipation_pct_month" DECIMAL(5,2),
ADD COLUMN     "auto_anticipation_since" DATE,
ADD COLUMN     "business_day_rule" "CardBusinessDayRule" NOT NULL DEFAULT 'proximo_dia_util',
ADD COLUMN     "refunds_mdr_on_cancel" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: effective_on e effective_net nascem nulos, são preenchidos e só então ficam obrigatórios
ALTER TABLE "CardReceivable" ADD COLUMN     "anticipation_fee" DECIMAL(14,2),
ADD COLUMN     "anticipation_id" TEXT,
ADD COLUMN     "effective_net" DECIMAL(14,2),
ADD COLUMN     "effective_on" DATE,
ADD COLUMN     "fee_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Preenchimento: a taxa da parcela é bruto menos líquido, e o efetivo começa igual ao previsto
UPDATE "CardReceivable" SET
  "fee_amount" = "gross_amount" - "net_amount",
  "effective_on" = "expected_on",
  "effective_net" = "net_amount";

ALTER TABLE "CardReceivable" ALTER COLUMN "effective_net" SET NOT NULL,
ALTER COLUMN "effective_on" SET NOT NULL;

-- CreateTable
CREATE TABLE "CardAnticipation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "acquirer_id" TEXT,
    "bank_account_id" TEXT NOT NULL,
    "operated_on" DATE NOT NULL,
    "kind" "CardAnticipationKind" NOT NULL,
    "gross_amount" DECIMAL(14,2) NOT NULL,
    "expected_net" DECIMAL(14,2) NOT NULL,
    "received_net" DECIMAL(14,2) NOT NULL,
    "fee_amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "undone_at" TIMESTAMP(3),
    "undone_by_user_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardAnticipation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardAnticipation_tenant_id_operated_on_idx" ON "CardAnticipation"("tenant_id", "operated_on");

-- CreateIndex
CREATE INDEX "CardReceivable_tenant_id_bank_account_id_effective_on_idx" ON "CardReceivable"("tenant_id", "bank_account_id", "effective_on");

-- AddForeignKey
ALTER TABLE "CardReceivable" ADD CONSTRAINT "CardReceivable_anticipation_id_fkey" FOREIGN KEY ("anticipation_id") REFERENCES "CardAnticipation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAnticipation" ADD CONSTRAINT "CardAnticipation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAnticipation" ADD CONSTRAINT "CardAnticipation_acquirer_id_fkey" FOREIGN KEY ("acquirer_id") REFERENCES "CardAcquirer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAnticipation" ADD CONSTRAINT "CardAnticipation_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Dívida 2.59: a faixa de parcelas da tabela de taxas fica dentro de 1 a 12, também no banco
ALTER TABLE "CardFeeRate" ADD CONSTRAINT "CardFeeRate_faixa_check" CHECK ("installments_from" >= 1 AND "installments_to" <= 12 AND "installments_from" <= "installments_to");
