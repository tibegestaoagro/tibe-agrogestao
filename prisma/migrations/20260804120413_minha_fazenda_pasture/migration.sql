-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "city" TEXT,
ADD COLUMN     "district" TEXT;

-- CreateTable
CREATE TABLE "Pasture" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area_hectares" DECIMAL(12,2) NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pasture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pasture_tenant_id_idx" ON "Pasture"("tenant_id");

-- CreateIndex
CREATE INDEX "Pasture_property_id_idx" ON "Pasture"("property_id");

-- AddForeignKey
ALTER TABLE "Pasture" ADD CONSTRAINT "Pasture_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pasture" ADD CONSTRAINT "Pasture_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
