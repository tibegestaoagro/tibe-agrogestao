-- Area Negociacoes, missao 1 (docs/moduloNegociacao).
--
-- Puramente aditiva: dois models novos (Contact, Negotiation), tres enums e
-- as colunas de vinculo nos filhos. Nenhum DROP, nenhuma coluna existente
-- alterada: o que ja rodava continua rodando sem tocar em nada.
--
-- A Negociacao e ENVELOPE, nao dona: por isso o vinculo mora nos filhos
-- (negotiation_id anulavel), e nao o contrario. Movimento de rebanho sem
-- negocio (nascimento, morte, transferencia) continua com o campo nulo.


-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('particular', 'fazendeiro', 'comerciante_gado', 'frigorifico', 'leilao', 'feira_evento', 'cooperativa', 'loja_fornecedor', 'prestador_servico', 'outro');

-- CreateEnum
CREATE TYPE "NegotiationType" AS ENUM ('compra_gado', 'venda_gado', 'compra_produto', 'venda_produto', 'permuta', 'evento');

-- CreateEnum
CREATE TYPE "NegotiationEntryRole" AS ENUM ('principal', 'custo_adicional');

-- AlterTable
ALTER TABLE "FinancialEntry" ADD COLUMN     "negotiation_id" TEXT,
ADD COLUMN     "negotiation_role" "NegotiationEntryRole";

-- AlterTable
ALTER TABLE "HerdMovement" ADD COLUMN     "negotiation_id" TEXT;

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ContactType",
    "phone" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Negotiation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "NegotiationType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "property_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "amount" DECIMAL(14,2),
    "notes" TEXT,
    "recorded_by_user_id" TEXT,
    "canceled_at" TIMESTAMP(3),
    "canceled_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Negotiation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_tenant_id_idx" ON "Contact"("tenant_id");

-- CreateIndex
CREATE INDEX "Negotiation_tenant_id_idx" ON "Negotiation"("tenant_id");

-- CreateIndex
CREATE INDEX "Negotiation_tenant_id_occurred_at_idx" ON "Negotiation"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "Negotiation_contact_id_idx" ON "Negotiation"("contact_id");

-- CreateIndex
CREATE INDEX "FinancialEntry_negotiation_id_idx" ON "FinancialEntry"("negotiation_id");

-- CreateIndex
CREATE INDEX "HerdMovement_negotiation_id_idx" ON "HerdMovement"("negotiation_id");

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_negotiation_id_fkey" FOREIGN KEY ("negotiation_id") REFERENCES "Negotiation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HerdMovement" ADD CONSTRAINT "HerdMovement_negotiation_id_fkey" FOREIGN KEY ("negotiation_id") REFERENCES "Negotiation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
