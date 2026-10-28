-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('em_transito', 'recebida', 'cancelada');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'transferencia_saida';
ALTER TYPE "StockMovementType" ADD VALUE 'transferencia_entrada';
ALTER TYPE "StockMovementType" ADD VALUE 'producao_entrada';
ALTER TYPE "StockMovementType" ADD VALUE 'producao_consumo';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "production_id" TEXT,
ADD COLUMN     "transfer_id" TEXT;

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "origin_establishment_id" TEXT NOT NULL,
    "destination_establishment_id" TEXT NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'em_transito',
    "operation_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "sent_by_user_id" TEXT,
    "received_at" TIMESTAMP(3),
    "received_by_user_id" TEXT,
    "canceled_at" TIMESTAMP(3),
    "canceled_by_user_id" TEXT,
    "canceled_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferItem" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "emporio_product_id" TEXT NOT NULL,
    "package_state" "PackageState",
    "presentation_id" TEXT,
    "sent_qty" DECIMAL(14,3) NOT NULL,
    "received_qty" DECIMAL(14,3),
    "loss_reason" "EmporioLossReason",
    "unit_cost" DECIMAL(14,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Composition" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "emporio_product_id" TEXT NOT NULL,
    "reference_qty" DECIMAL(14,3) NOT NULL,
    "yield_pct" DECIMAL(7,2),
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Composition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompositionItem" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "composition_id" TEXT NOT NULL,
    "component_emporio_product_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "CompositionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionEntry" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "emporio_product_id" TEXT NOT NULL,
    "operation_key" TEXT NOT NULL,
    "produced_qty" DECIMAL(14,3) NOT NULL,
    "composition_snapshot" JSONB NOT NULL,
    "unit_cost" DECIMAL(14,4),
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" TEXT,
    "canceled_at" TIMESTAMP(3),
    "canceled_by_user_id" TEXT,
    "canceled_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockTransfer_tenant_id_status_idx" ON "StockTransfer"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_tenant_id_operation_key_key" ON "StockTransfer"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "StockTransferItem_tenant_id_idx" ON "StockTransferItem"("tenant_id");

-- CreateIndex
CREATE INDEX "StockTransferItem_transfer_id_idx" ON "StockTransferItem"("transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "Composition_emporio_product_id_key" ON "Composition"("emporio_product_id");

-- CreateIndex
CREATE INDEX "Composition_tenant_id_idx" ON "Composition"("tenant_id");

-- CreateIndex
CREATE INDEX "CompositionItem_tenant_id_idx" ON "CompositionItem"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "CompositionItem_composition_id_component_emporio_product_id_key" ON "CompositionItem"("composition_id", "component_emporio_product_id");

-- CreateIndex
CREATE INDEX "ProductionEntry_tenant_id_idx" ON "ProductionEntry"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionEntry_tenant_id_operation_key_key" ON "ProductionEntry"("tenant_id", "operation_key");

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_origin_establishment_id_fkey" FOREIGN KEY ("origin_establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destination_establishment_id_fkey" FOREIGN KEY ("destination_establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_emporio_product_id_fkey" FOREIGN KEY ("emporio_product_id") REFERENCES "EmporioProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "ProductPresentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Composition" ADD CONSTRAINT "Composition_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Composition" ADD CONSTRAINT "Composition_emporio_product_id_fkey" FOREIGN KEY ("emporio_product_id") REFERENCES "EmporioProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_composition_id_fkey" FOREIGN KEY ("composition_id") REFERENCES "Composition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_component_emporio_product_id_fkey" FOREIGN KEY ("component_emporio_product_id") REFERENCES "EmporioProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_emporio_product_id_fkey" FOREIGN KEY ("emporio_product_id") REFERENCES "EmporioProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "ProductionEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

