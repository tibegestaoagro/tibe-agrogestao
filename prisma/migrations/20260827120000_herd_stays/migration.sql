-- CreateEnum
CREATE TYPE "HerdStayType" AS ENUM ('pasto_terceiro', 'boitel', 'evento', 'terceiro_na_fazenda', 'desaparecimento');

-- CreateEnum
CREATE TYPE "HerdChargeType" AS ENUM ('por_cabeca', 'por_mes', 'por_periodo', 'fechado');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HerdMovementType" ADD VALUE 'envio_pasto_terceiro';
ALTER TYPE "HerdMovementType" ADD VALUE 'envio_boitel';
ALTER TYPE "HerdMovementType" ADD VALUE 'retorno_estadia';
ALTER TYPE "HerdMovementType" ADD VALUE 'entrada_terceiro';
ALTER TYPE "HerdMovementType" ADD VALUE 'saida_terceiro';
ALTER TYPE "HerdMovementType" ADD VALUE 'desaparecimento';
ALTER TYPE "HerdMovementType" ADD VALUE 'perda_confirmada';

-- AlterTable
ALTER TABLE "HerdMovement" ADD COLUMN     "stay_id" TEXT;

-- CreateTable
CREATE TABLE "HerdStay" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "HerdStayType" NOT NULL,
    "property_id" TEXT NOT NULL,
    "counterparty_name" TEXT,
    "location_name" TEXT,
    "city" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "expected_end_at" TIMESTAMP(3),
    "charge_type" "HerdChargeType",
    "charge_value" DECIMAL(14,2),
    "reason" TEXT,
    "notes" TEXT,
    "recorded_by_user_id" TEXT,
    "canceled_at" TIMESTAMP(3),
    "canceled_reason" TEXT,
    "canceled_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HerdStay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HerdStay_tenant_id_type_idx" ON "HerdStay"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "HerdStay_tenant_id_started_at_idx" ON "HerdStay"("tenant_id", "started_at");

-- CreateIndex
CREATE INDEX "HerdMovement_stay_id_idx" ON "HerdMovement"("stay_id");

-- AddForeignKey
ALTER TABLE "HerdMovement" ADD CONSTRAINT "HerdMovement_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "HerdStay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HerdStay" ADD CONSTRAINT "HerdStay_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HerdStay" ADD CONSTRAINT "HerdStay_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HerdStay" ADD CONSTRAINT "HerdStay_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

