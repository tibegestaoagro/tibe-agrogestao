-- CreateEnum
CREATE TYPE "ConfinementSiteType" AS ENUM ('proprio', 'boitel');

-- AlterEnum
ALTER TYPE "HerdMovementType" ADD VALUE 'envio_confinamento';

-- AlterEnum
ALTER TYPE "HerdStayType" ADD VALUE 'confinamento';

-- AlterEnum
ALTER TYPE "RelatedModule" ADD VALUE 'confinamento';

-- AlterTable
ALTER TABLE "HerdStay" ADD COLUMN     "confinement_site_id" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "stay_id" TEXT;

-- CreateTable
CREATE TABLE "ConfinementSite" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ConfinementSiteType" NOT NULL,
    "property_id" TEXT,
    "counterparty_name" TEXT,
    "city" TEXT,
    "capacity" INTEGER,
    "notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfinementSite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfinementSite_tenant_id_idx" ON "ConfinementSite"("tenant_id");

-- CreateIndex
CREATE INDEX "ConfinementSite_property_id_idx" ON "ConfinementSite"("property_id");

-- CreateIndex
CREATE INDEX "HerdStay_confinement_site_id_idx" ON "HerdStay"("confinement_site_id");

-- CreateIndex
CREATE INDEX "StockMovement_stay_id_idx" ON "StockMovement"("stay_id");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "HerdStay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfinementSite" ADD CONSTRAINT "ConfinementSite_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfinementSite" ADD CONSTRAINT "ConfinementSite_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HerdStay" ADD CONSTRAINT "HerdStay_confinement_site_id_fkey" FOREIGN KEY ("confinement_site_id") REFERENCES "ConfinementSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
