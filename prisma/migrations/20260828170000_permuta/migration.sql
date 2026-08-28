-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HerdMovementType" ADD VALUE 'permuta_entrada';
ALTER TYPE "HerdMovementType" ADD VALUE 'permuta_saida';

-- AlterEnum
ALTER TYPE "MachineStatus" ADD VALUE 'negociada';

-- AlterTable
ALTER TABLE "Machine" ADD COLUMN     "acquired_negotiation_id" TEXT,
ADD COLUMN     "disposed_negotiation_id" TEXT;

-- AlterTable
ALTER TABLE "Negotiation" ADD COLUMN     "barter_in_note" TEXT,
ADD COLUMN     "barter_out_note" TEXT;

-- CreateIndex
CREATE INDEX "Machine_acquired_negotiation_id_idx" ON "Machine"("acquired_negotiation_id");

-- CreateIndex
CREATE INDEX "Machine_disposed_negotiation_id_idx" ON "Machine"("disposed_negotiation_id");

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_acquired_negotiation_id_fkey" FOREIGN KEY ("acquired_negotiation_id") REFERENCES "Negotiation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_disposed_negotiation_id_fkey" FOREIGN KEY ("disposed_negotiation_id") REFERENCES "Negotiation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
