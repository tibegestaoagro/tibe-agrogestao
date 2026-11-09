-- Taxas de cartão (Q250 a Q254): adquirente, tabela de taxas com vigência e o
-- congelamento na venda. A regra antiga (CardFeeRule) é carregada para a nova
-- tabela antes de ser descartada.

-- CreateEnum
CREATE TYPE "CardBrand" AS ENUM ('visa_master', 'elo', 'hipercard', 'amex', 'outra', 'qualquer');

-- AlterTable
ALTER TABLE "CardReceivable" ADD COLUMN     "acquirer_id" TEXT,
ADD COLUMN     "brand" "CardBrand";

-- AlterTable
ALTER TABLE "EmporioSalePayment" ADD COLUMN     "acquirer_id" TEXT,
ADD COLUMN     "brand" "CardBrand",
ADD COLUMN     "fee_fixed_amount" DECIMAL(14,2),
ADD COLUMN     "fee_rate_id" TEXT;

-- CreateTable
CREATE TABLE "CardAcquirer" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardAcquirer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardFeeRate" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "acquirer_id" TEXT NOT NULL,
    "brand" "CardBrand" NOT NULL,
    "kind" "CardKind" NOT NULL,
    "installments_from" INTEGER NOT NULL,
    "installments_to" INTEGER NOT NULL,
    "fee_pct" DECIMAL(5,2) NOT NULL,
    "fee_fixed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "days" INTEGER NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardFeeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardAcquirer_tenant_id_idx" ON "CardAcquirer"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "CardAcquirer_tenant_id_name_key" ON "CardAcquirer"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "CardFeeRate_tenant_id_establishment_id_acquirer_id_kind_idx" ON "CardFeeRate"("tenant_id", "establishment_id", "acquirer_id", "kind");

-- AddForeignKey
ALTER TABLE "EmporioSalePayment" ADD CONSTRAINT "EmporioSalePayment_acquirer_id_fkey" FOREIGN KEY ("acquirer_id") REFERENCES "CardAcquirer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSalePayment" ADD CONSTRAINT "EmporioSalePayment_fee_rate_id_fkey" FOREIGN KEY ("fee_rate_id") REFERENCES "CardFeeRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAcquirer" ADD CONSTRAINT "CardAcquirer_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardFeeRate" ADD CONSTRAINT "CardFeeRate_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardFeeRate" ADD CONSTRAINT "CardFeeRate_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardFeeRate" ADD CONSTRAINT "CardFeeRate_acquirer_id_fkey" FOREIGN KEY ("acquirer_id") REFERENCES "CardAcquirer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardFeeRate" ADD CONSTRAINT "CardFeeRate_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReceivable" ADD CONSTRAINT "CardReceivable_acquirer_id_fkey" FOREIGN KEY ("acquirer_id") REFERENCES "CardAcquirer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Carga (decisoes 1 e 10): cada tenant com regra antiga ganha a adquirente
-- "Maquininha"; cada regra vira uma linha `qualquer`, valida desde sempre.
INSERT INTO "CardAcquirer" ("id", "tenant_id", "name", "updated_at")
SELECT gen_random_uuid()::text, t."tenant_id", 'Maquininha', CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "tenant_id" FROM "CardFeeRule") t;

INSERT INTO "CardFeeRate" ("id", "tenant_id", "establishment_id", "acquirer_id", "brand", "kind",
    "installments_from", "installments_to", "fee_pct", "fee_fixed", "days", "bank_account_id",
    "valid_from", "valid_to", "updated_by_user_id", "created_at", "updated_at")
SELECT gen_random_uuid()::text, r."tenant_id", r."establishment_id", a."id", 'qualquer', r."kind",
    CASE WHEN r."kind" = 'credito_parcelado' THEN 2 ELSE 1 END,
    CASE WHEN r."kind" = 'credito_parcelado' THEN 12 ELSE 1 END,
    r."fee_pct", 0, r."days", r."bank_account_id",
    DATE '2020-01-01', NULL, r."updated_by_user_id", r."created_at", r."updated_at"
FROM "CardFeeRule" r
JOIN "CardAcquirer" a ON a."tenant_id" = r."tenant_id" AND a."name" = 'Maquininha';

-- DropTable (as chaves estrangeiras caem junto)
DROP TABLE "CardFeeRule";
