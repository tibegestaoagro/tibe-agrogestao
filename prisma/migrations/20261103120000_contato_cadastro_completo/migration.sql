-- CreateEnum
CREATE TYPE "ContactPersonKind" AS ENUM ('pf', 'pj');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "address_complement" TEXT,
ADD COLUMN     "address_district" TEXT,
ADD COLUMN     "address_number" TEXT,
ADD COLUMN     "address_state" TEXT,
ADD COLUMN     "address_street" TEXT,
ADD COLUMN     "address_zip" TEXT,
ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "delivery_city" TEXT,
ADD COLUMN     "delivery_complement" TEXT,
ADD COLUMN     "delivery_district" TEXT,
ADD COLUMN     "delivery_number" TEXT,
ADD COLUMN     "delivery_state" TEXT,
ADD COLUMN     "delivery_street" TEXT,
ADD COLUMN     "delivery_zip" TEXT,
ADD COLUMN     "document" TEXT,
ADD COLUMN     "person_kind" "ContactPersonKind",
ADD COLUMN     "responsible_name" TEXT,
ADD COLUMN     "state_registration" TEXT,
ADD COLUMN     "system_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Contact_tenant_id_document_key" ON "Contact"("tenant_id", "document");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_tenant_id_system_key_key" ON "Contact"("tenant_id", "system_key");

-- Consumidor final: o contato fixo de cada conta que ja tem o Emporio ligado.
-- Contas que ganharem o Emporio depois o recebem por garantirConsumidorFinal.
INSERT INTO "Contact" ("id", "tenant_id", "name", "system_key")
SELECT gen_random_uuid()::text, tf."tenant_id", 'Consumidor final', 'consumidor_final'
FROM "TenantFeature" tf
WHERE tf."feature_key" = 'emporio' AND tf."enabled" = true
ON CONFLICT DO NOTHING;
