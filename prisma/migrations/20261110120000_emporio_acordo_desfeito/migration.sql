-- AlterTable
ALTER TABLE "EmporioCreditAgreement" ADD COLUMN     "undone_at" TIMESTAMP(3),
ADD COLUMN     "undone_by_user_id" TEXT,
ADD COLUMN     "undone_reason" TEXT;
