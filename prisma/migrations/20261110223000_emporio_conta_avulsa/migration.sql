-- AlterTable
ALTER TABLE "FinancialEntry" ADD COLUMN     "emporio_manual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emporio_manual_description" TEXT,
ADD COLUMN     "emporio_other_name" TEXT;
