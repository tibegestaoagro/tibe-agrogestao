-- Módulo 33, fase 2: o serviço contratado de terceiro.
--
-- Conferido antes de salvar: o `migrate diff` não gerou NENHUM `DROP`, de
-- nenhum tipo. Em particular, não sugeriu derrubar os dois índices parciais
-- que o `schema.prisma` não representa (`WhatsAppProviderConfig_one_active` e
-- `AnimalBatch_tenant_ear_tag_key`). Se aparecerem numa geração futura, REMOVA
-- as linhas: derrubá-los quebra "no máximo 1 provider ativo" e "brinco único
-- por tenant".
--
-- Aditiva de ponta a ponta: quatro tipos novos, uma coluna anulável em
-- `MachineMaintenance`, e três tabelas novas. Nenhuma linha existente é tocada.

-- CreateEnum
CREATE TYPE "ServiceDirection" AS ENUM ('contratado', 'prestado');

-- CreateEnum
CREATE TYPE "ServicePricing" AS ENUM ('hora', 'hectare', 'dia', 'viagem', 'tonelada', 'metro', 'quilometro', 'cabeca', 'fechado');

-- CreateEnum
CREATE TYPE "ServiceJobStatus" AS ENUM ('agendado', 'em_andamento', 'concluido', 'cancelado');

-- CreateEnum
CREATE TYPE "WorkerLogKind" AS ENUM ('atividade', 'falta', 'folga', 'ferias', 'afastamento');

-- AlterTable
ALTER TABLE "MachineMaintenance" ADD COLUMN     "contact_id" TEXT;

-- CreateTable
CREATE TABLE "ServiceJob" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "direction" "ServiceDirection" NOT NULL DEFAULT 'contratado',
    "status" "ServiceJobStatus" NOT NULL DEFAULT 'agendado',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "pricing" "ServicePricing" NOT NULL,
    "unit_price" DECIMAL(14,2),
    "agreed_amount" DECIMAL(14,2),
    "worker_count" INTEGER NOT NULL DEFAULT 1,
    "contact_id" TEXT,
    "worker_id" TEXT,
    "pasture_id" TEXT,
    "confinement_stay_id" TEXT,
    "milk_site_id" TEXT,
    "machine_id" TEXT,
    "notes" TEXT,
    "canceled_at" TIMESTAMP(3),
    "canceled_reason" TEXT,
    "canceled_by_user_id" TEXT,
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceJobLog" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_job_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "notes" TEXT,
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceJobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerLog" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "kind" "WorkerLogKind" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "property_id" TEXT,
    "pasture_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceJob_tenant_id_idx" ON "ServiceJob"("tenant_id");

-- CreateIndex
CREATE INDEX "ServiceJob_tenant_id_status_idx" ON "ServiceJob"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ServiceJob_tenant_id_occurred_at_idx" ON "ServiceJob"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "ServiceJob_confinement_stay_id_idx" ON "ServiceJob"("confinement_stay_id");

-- CreateIndex
CREATE INDEX "ServiceJob_contact_id_idx" ON "ServiceJob"("contact_id");

-- CreateIndex
CREATE INDEX "ServiceJob_worker_id_idx" ON "ServiceJob"("worker_id");

-- CreateIndex
CREATE INDEX "ServiceJobLog_tenant_id_idx" ON "ServiceJobLog"("tenant_id");

-- CreateIndex
CREATE INDEX "ServiceJobLog_service_job_id_idx" ON "ServiceJobLog"("service_job_id");

-- CreateIndex
CREATE INDEX "WorkerLog_tenant_id_idx" ON "WorkerLog"("tenant_id");

-- CreateIndex
CREATE INDEX "WorkerLog_worker_id_idx" ON "WorkerLog"("worker_id");

-- CreateIndex
CREATE INDEX "MachineMaintenance_contact_id_idx" ON "MachineMaintenance"("contact_id");

-- AddForeignKey
ALTER TABLE "MachineMaintenance" ADD CONSTRAINT "MachineMaintenance_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_pasture_id_fkey" FOREIGN KEY ("pasture_id") REFERENCES "Pasture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_confinement_stay_id_fkey" FOREIGN KEY ("confinement_stay_id") REFERENCES "HerdStay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_milk_site_id_fkey" FOREIGN KEY ("milk_site_id") REFERENCES "MilkSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_canceled_by_user_id_fkey" FOREIGN KEY ("canceled_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobLog" ADD CONSTRAINT "ServiceJobLog_service_job_id_fkey" FOREIGN KEY ("service_job_id") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerLog" ADD CONSTRAINT "WorkerLog_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerLog" ADD CONSTRAINT "WorkerLog_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerLog" ADD CONSTRAINT "WorkerLog_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerLog" ADD CONSTRAINT "WorkerLog_pasture_id_fkey" FOREIGN KEY ("pasture_id") REFERENCES "Pasture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

