-- CreateEnum
CREATE TYPE "PackageState" AS ENUM ('lacrado', 'avulso');

-- CreateEnum
CREATE TYPE "EmporioLossReason" AS ENUM ('vencido', 'avaria', 'furto', 'consumo_proprio', 'outro');

-- CreateEnum
CREATE TYPE "EmporioPurchasePaymentKind" AS ENUM ('a_vista', 'a_prazo', 'parcelada');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'implantacao';
ALTER TYPE "StockMovementType" ADD VALUE 'perda';

-- AlterTable
ALTER TABLE "ShoppingItem" ADD COLUMN     "establishment_id" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "loss_reason" "EmporioLossReason",
ADD COLUMN     "package_state" "PackageState",
ADD COLUMN     "presentation_id" TEXT,
ADD COLUMN     "purchase_id" TEXT,
ADD COLUMN     "unit_cost" DECIMAL(14,4);

-- CreateTable
CREATE TABLE "EmporioPurchase" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "operation_key" TEXT NOT NULL,
    "purchased_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3),
    "freight" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_kind" "EmporioPurchasePaymentKind" NOT NULL,
    "notes" TEXT,
    "canceled_at" TIMESTAMP(3),
    "canceled_reason" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmporioPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmporioPurchaseItem" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "emporio_product_id" TEXT NOT NULL,
    "presentation_id" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "base_quantity" DECIMAL(14,3) NOT NULL,
    "item_total" DECIMAL(12,2) NOT NULL,
    "freight_share" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmporioPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLimit" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "emporio_product_id" TEXT NOT NULL,
    "min_qty" DECIMAL(14,3),
    "max_qty" DECIMAL(14,3),
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmporioPurchase_tenant_id_idx" ON "EmporioPurchase"("tenant_id");

-- CreateIndex
CREATE INDEX "EmporioPurchase_establishment_id_idx" ON "EmporioPurchase"("establishment_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioPurchase_tenant_id_operation_key_key" ON "EmporioPurchase"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "EmporioPurchaseItem_tenant_id_idx" ON "EmporioPurchaseItem"("tenant_id");

-- CreateIndex
CREATE INDEX "EmporioPurchaseItem_purchase_id_idx" ON "EmporioPurchaseItem"("purchase_id");

-- CreateIndex
CREATE INDEX "StockLimit_tenant_id_idx" ON "StockLimit"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "StockLimit_establishment_id_emporio_product_id_key" ON "StockLimit"("establishment_id", "emporio_product_id");

-- AddForeignKey
ALTER TABLE "EmporioPurchase" ADD CONSTRAINT "EmporioPurchase_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioPurchase" ADD CONSTRAINT "EmporioPurchase_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioPurchase" ADD CONSTRAINT "EmporioPurchase_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioPurchaseItem" ADD CONSTRAINT "EmporioPurchaseItem_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioPurchaseItem" ADD CONSTRAINT "EmporioPurchaseItem_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "EmporioPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioPurchaseItem" ADD CONSTRAINT "EmporioPurchaseItem_emporio_product_id_fkey" FOREIGN KEY ("emporio_product_id") REFERENCES "EmporioProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioPurchaseItem" ADD CONSTRAINT "EmporioPurchaseItem_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "ProductPresentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLimit" ADD CONSTRAINT "StockLimit_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLimit" ADD CONSTRAINT "StockLimit_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLimit" ADD CONSTRAINT "StockLimit_emporio_product_id_fkey" FOREIGN KEY ("emporio_product_id") REFERENCES "EmporioProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "ProductPresentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "EmporioPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

