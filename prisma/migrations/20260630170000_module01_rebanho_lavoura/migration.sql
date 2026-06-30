-- CreateEnum
CREATE TYPE "AnimalSex" AS ENUM ('male', 'female');

-- AlterTable
ALTER TABLE "Animal" DROP COLUMN "sex",
ADD COLUMN     "sex" "AnimalSex" NOT NULL;

-- AlterTable
ALTER TABLE "AnimalMovement" ADD COLUMN     "tenant_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "AnimalVaccination" ADD COLUMN     "cost" DECIMAL(14,2),
ADD COLUMN     "tenant_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "AnimalWeightLog" ADD COLUMN     "tenant_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CropCycle" ADD COLUMN     "tenant_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PlotInput" ADD COLUMN     "tenant_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Animal_tenant_id_ear_tag_key" ON "Animal"("tenant_id", "ear_tag");

-- CreateIndex
CREATE INDEX "AnimalMovement_tenant_id_idx" ON "AnimalMovement"("tenant_id");

-- CreateIndex
CREATE INDEX "AnimalVaccination_tenant_id_idx" ON "AnimalVaccination"("tenant_id");

-- CreateIndex
CREATE INDEX "AnimalWeightLog_tenant_id_idx" ON "AnimalWeightLog"("tenant_id");

-- CreateIndex
CREATE INDEX "CropCycle_tenant_id_idx" ON "CropCycle"("tenant_id");

-- CreateIndex
CREATE INDEX "PlotInput_tenant_id_idx" ON "PlotInput"("tenant_id");
