-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FixedSplitKind" ADD VALUE 'faturamento';
ALTER TYPE "FixedSplitKind" ADD VALUE 'area';
ALTER TYPE "FixedSplitKind" ADD VALUE 'funcionarios';

-- AlterTable
ALTER TABLE "Establishment" ADD COLUMN     "area_m2" DECIMAL(10,2),
ADD COLUMN     "employees_count" INTEGER;
