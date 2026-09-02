-- Módulo 33, fase 1: o trabalhador fixo.
--
-- Conferido antes de salvar: o `migrate diff` NÃO sugeriu os dois DROP INDEX
-- de `WhatsAppProviderConfig_one_active` e `AnimalBatch_tenant_ear_tag_key`
-- desta vez, porque o banco local estava em sincronia. Se aparecerem numa
-- geração futura, REMOVA as linhas: são índices parciais que o schema.prisma
-- não representa, e derrubá-los quebra "no máximo 1 provider ativo" e "brinco
-- único por tenant".

-- CreateEnum
CREATE TYPE "WorkerType" AS ENUM ('fixo', 'eventual');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('mensal', 'quinzenal', 'semanal', 'diaria', 'outra');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ativo', 'inativo');

-- CreateEnum
CREATE TYPE "WorkerEntryKind" AS ENUM ('pagamento', 'adiantamento', 'gratificacao', 'beneficio', 'outro');

-- AlterEnum
ALTER TYPE "RelatedModule" ADD VALUE 'mao_de_obra';

-- AlterTable
ALTER TABLE "FinancialEntry" ADD COLUMN     "worker_entry_kind" "WorkerEntryKind";

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" "WorkerType" NOT NULL,
    "status" "WorkerStatus" NOT NULL DEFAULT 'ativo',
    "pay_frequency" "PayFrequency",
    "pay_amount" DECIMAL(14,2),
    "pay_day" INTEGER,
    "phone" TEXT,
    "started_at" TIMESTAMP(3),
    "notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Worker_tenant_id_idx" ON "Worker"("tenant_id");

-- CreateIndex
CREATE INDEX "Worker_tenant_id_status_idx" ON "Worker"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "Worker_property_id_idx" ON "Worker"("property_id");

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
