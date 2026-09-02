-- Módulo 34, fase 1: o serviço prestado com máquina própria.
--
-- Conferido antes de salvar: o `migrate diff` não gerou NENHUM `DROP`, de
-- nenhum tipo. Em particular, não sugeriu derrubar os dois índices parciais que
-- o `schema.prisma` não representa (`WhatsAppProviderConfig_one_active` e
-- `AnimalBatch_tenant_ear_tag_key`). Se aparecerem numa geração futura, REMOVA
-- as linhas: derrubá-los quebra "no máximo 1 provider ativo" e "brinco único
-- por tenant".
--
-- Aditiva de ponta a ponta: quatro colunas anuláveis em `ServiceJob`, dois
-- índices e uma chave estrangeira. Nenhuma linha existente é tocada, e nenhum
-- serviço já registrado muda de comportamento.

-- AlterTable
ALTER TABLE "ServiceJob" ADD COLUMN     "client_location" TEXT,
ADD COLUMN     "implement" TEXT,
ADD COLUMN     "operator_note" TEXT,
ADD COLUMN     "operator_worker_id" TEXT;

-- CreateIndex
CREATE INDEX "ServiceJob_machine_id_idx" ON "ServiceJob"("machine_id");

-- CreateIndex
CREATE INDEX "ServiceJob_operator_worker_id_idx" ON "ServiceJob"("operator_worker_id");

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_operator_worker_id_fkey" FOREIGN KEY ("operator_worker_id") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

