-- CreateEnum
CREATE TYPE "LactationEntryType" AS ENUM ('definir', 'entrada', 'saida');

-- CreateEnum
CREATE TYPE "MilkShift" AS ENUM ('dia', 'manha', 'tarde', 'noite');

-- CreateTable
CREATE TABLE "MilkGroup" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilkGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LactationEntry" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "type" "LactationEntryType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "pasture_id" TEXT,
    "group_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LactationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilkProduction" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "liters" DECIMAL(12,2) NOT NULL,
    "shift" "MilkShift" NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "group_id" TEXT,
    "notes" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilkProduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MilkGroup_tenant_id_idx" ON "MilkGroup"("tenant_id");

-- CreateIndex
CREATE INDEX "MilkGroup_property_id_idx" ON "MilkGroup"("property_id");

-- CreateIndex
CREATE INDEX "LactationEntry_tenant_id_idx" ON "LactationEntry"("tenant_id");

-- CreateIndex
CREATE INDEX "LactationEntry_property_id_recorded_at_idx" ON "LactationEntry"("property_id", "recorded_at");

-- CreateIndex
CREATE INDEX "LactationEntry_group_id_idx" ON "LactationEntry"("group_id");

-- CreateIndex
CREATE INDEX "MilkProduction_tenant_id_idx" ON "MilkProduction"("tenant_id");

-- CreateIndex
CREATE INDEX "MilkProduction_property_id_recorded_at_idx" ON "MilkProduction"("property_id", "recorded_at");

-- CreateIndex
CREATE INDEX "MilkProduction_group_id_idx" ON "MilkProduction"("group_id");

-- AddForeignKey
ALTER TABLE "MilkGroup" ADD CONSTRAINT "MilkGroup_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkGroup" ADD CONSTRAINT "MilkGroup_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LactationEntry" ADD CONSTRAINT "LactationEntry_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LactationEntry" ADD CONSTRAINT "LactationEntry_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LactationEntry" ADD CONSTRAINT "LactationEntry_pasture_id_fkey" FOREIGN KEY ("pasture_id") REFERENCES "Pasture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LactationEntry" ADD CONSTRAINT "LactationEntry_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "MilkGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkProduction" ADD CONSTRAINT "MilkProduction_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkProduction" ADD CONSTRAINT "MilkProduction_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkProduction" ADD CONSTRAINT "MilkProduction_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "MilkGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

