-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('active', 'maintenance', 'sold', 'inactive');

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'maintenance_due';

-- AlterEnum
ALTER TYPE "RelatedModule" ADD VALUE 'maquinas';

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "acquired_at" TIMESTAMP(3),
    "acquisition_cost" DECIMAL(14,2),
    "hour_meter" DECIMAL(10,1),
    "status" "MachineStatus" NOT NULL DEFAULT 'active',
    "next_maintenance_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineMaintenance" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DECIMAL(14,2),
    "next_due_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Machine_tenant_id_idx" ON "Machine"("tenant_id");

-- CreateIndex
CREATE INDEX "Machine_property_id_idx" ON "Machine"("property_id");

-- CreateIndex
CREATE INDEX "MachineMaintenance_tenant_id_idx" ON "MachineMaintenance"("tenant_id");

-- CreateIndex
CREATE INDEX "MachineMaintenance_machine_id_idx" ON "MachineMaintenance"("machine_id");

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineMaintenance" ADD CONSTRAINT "MachineMaintenance_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
