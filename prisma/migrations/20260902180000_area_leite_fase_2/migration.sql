-- CreateEnum
CREATE TYPE "MilkSiteType" AS ENUM ('proprio', 'terceiro');

-- CreateEnum
CREATE TYPE "MilkMovementType" AS ENUM ('entrada_producao', 'entrada_terceiro', 'transferencia', 'saida', 'ajuste');

-- CreateEnum
CREATE TYPE "MilkDestination" AS ENUM ('venda', 'laticinio', 'cooperativa', 'ponto_coleta', 'fabricacao_propria', 'alimentacao_bezerros', 'consumo', 'descarte', 'outro');

-- CreateEnum
CREATE TYPE "MilkChargeType" AS ENUM ('por_litro', 'por_produtor', 'por_coleta', 'mensal', 'fixo', 'outro');

-- AlterEnum
ALTER TYPE "RelatedModule" ADD VALUE 'leite';

-- CreateTable
CREATE TABLE "MilkSite" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MilkSiteType" NOT NULL,
    "property_id" TEXT,
    "counterparty_name" TEXT,
    "city" TEXT,
    "capacity" INTEGER,
    "notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilkSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilkMovement" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "movement_type" "MilkMovementType" NOT NULL,
    "liters" DECIMAL(12,2) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "from_site_id" TEXT,
    "from_owner_id" TEXT,
    "to_site_id" TEXT,
    "to_owner_id" TEXT,
    "destination" "MilkDestination",
    "production_id" TEXT,
    "notes" TEXT,
    "canceled_at" TIMESTAMP(3),
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilkMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilkCharge" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "site_id" TEXT,
    "type" "MilkChargeType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "period_label" TEXT,
    "notes" TEXT,
    "financial_entry_id" TEXT,
    "canceled_at" TIMESTAMP(3),
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilkCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MilkSite_tenant_id_idx" ON "MilkSite"("tenant_id");

-- CreateIndex
CREATE INDEX "MilkSite_property_id_idx" ON "MilkSite"("property_id");

-- CreateIndex
CREATE INDEX "MilkMovement_tenant_id_idx" ON "MilkMovement"("tenant_id");

-- CreateIndex
CREATE INDEX "MilkMovement_from_site_id_idx" ON "MilkMovement"("from_site_id");

-- CreateIndex
CREATE INDEX "MilkMovement_to_site_id_idx" ON "MilkMovement"("to_site_id");

-- CreateIndex
CREATE INDEX "MilkMovement_occurred_at_idx" ON "MilkMovement"("occurred_at");

-- CreateIndex
CREATE INDEX "MilkMovement_production_id_idx" ON "MilkMovement"("production_id");

-- CreateIndex
CREATE INDEX "MilkCharge_tenant_id_idx" ON "MilkCharge"("tenant_id");

-- CreateIndex
CREATE INDEX "MilkCharge_owner_id_idx" ON "MilkCharge"("owner_id");

-- AddForeignKey
ALTER TABLE "MilkSite" ADD CONSTRAINT "MilkSite_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkSite" ADD CONSTRAINT "MilkSite_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkMovement" ADD CONSTRAINT "MilkMovement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkMovement" ADD CONSTRAINT "MilkMovement_from_site_id_fkey" FOREIGN KEY ("from_site_id") REFERENCES "MilkSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkMovement" ADD CONSTRAINT "MilkMovement_to_site_id_fkey" FOREIGN KEY ("to_site_id") REFERENCES "MilkSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkMovement" ADD CONSTRAINT "MilkMovement_from_owner_id_fkey" FOREIGN KEY ("from_owner_id") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkMovement" ADD CONSTRAINT "MilkMovement_to_owner_id_fkey" FOREIGN KEY ("to_owner_id") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkMovement" ADD CONSTRAINT "MilkMovement_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "MilkProduction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkCharge" ADD CONSTRAINT "MilkCharge_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkCharge" ADD CONSTRAINT "MilkCharge_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkCharge" ADD CONSTRAINT "MilkCharge_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "MilkSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

