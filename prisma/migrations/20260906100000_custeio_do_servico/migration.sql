-- Módulo 34, fase 2: o custeio do serviço com máquinas.
--
-- Conferido antes de salvar: o `migrate diff` não gerou NENHUM `DROP`, de
-- nenhum tipo. Em particular, não sugeriu derrubar os dois índices parciais que
-- o `schema.prisma` não representa (`WhatsAppProviderConfig_one_active` e
-- `AnimalBatch_tenant_ear_tag_key`). Se aparecerem numa geração futura, REMOVA
-- as linhas: derrubá-los quebra "no máximo 1 provider ativo" e "brinco único
-- por tenant".
--
-- Aditiva de ponta a ponta: a tabela nova `ServiceJobCost`, duas colunas
-- anuláveis em `ServiceJob` (o horímetro do §33) e uma coluna anulável em
-- `StockMovement` (§21 e §35). Nenhuma linha existente é tocada.

-- CreateEnum
CREATE TYPE "ServiceCostKind" AS ENUM ('combustivel', 'mao_de_obra', 'pedagio', 'alimentacao', 'transporte', 'manutencao', 'pecas', 'lubrificantes', 'comissao', 'outro');

-- AlterTable
ALTER TABLE "ServiceJob" ADD COLUMN     "hour_meter_end" DECIMAL(10,1),
ADD COLUMN     "hour_meter_start" DECIMAL(10,1);

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "service_job_id" TEXT;

-- CreateTable
CREATE TABLE "ServiceJobCost" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_job_id" TEXT NOT NULL,
    "kind" "ServiceCostKind" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "quantity" DECIMAL(14,3),
    "unit" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "stock_movement_id" TEXT,
    "financial_entry_id" TEXT,
    "notes" TEXT,
    "recorded_by_user_id" TEXT,
    "canceled_at" TIMESTAMP(3),
    "canceled_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceJobCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceJobCost_stock_movement_id_key" ON "ServiceJobCost"("stock_movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceJobCost_financial_entry_id_key" ON "ServiceJobCost"("financial_entry_id");

-- CreateIndex
CREATE INDEX "ServiceJobCost_tenant_id_idx" ON "ServiceJobCost"("tenant_id");

-- CreateIndex
CREATE INDEX "ServiceJobCost_service_job_id_idx" ON "ServiceJobCost"("service_job_id");

-- CreateIndex
CREATE INDEX "ServiceJobCost_tenant_id_canceled_at_idx" ON "ServiceJobCost"("tenant_id", "canceled_at");

-- CreateIndex
CREATE INDEX "StockMovement_service_job_id_idx" ON "StockMovement"("service_job_id");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_service_job_id_fkey" FOREIGN KEY ("service_job_id") REFERENCES "ServiceJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobCost" ADD CONSTRAINT "ServiceJobCost_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobCost" ADD CONSTRAINT "ServiceJobCost_service_job_id_fkey" FOREIGN KEY ("service_job_id") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobCost" ADD CONSTRAINT "ServiceJobCost_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
