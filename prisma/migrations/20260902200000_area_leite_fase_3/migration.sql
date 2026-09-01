-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContactType" ADD VALUE 'laticinio';
ALTER TYPE "ContactType" ADD VALUE 'queijaria';
ALTER TYPE "ContactType" ADD VALUE 'mercado';

-- AlterEnum
ALTER TYPE "MilkDestination" ADD VALUE 'doacao';

-- AlterEnum
ALTER TYPE "NegotiationType" ADD VALUE 'venda_leite';

-- AlterTable
ALTER TABLE "MilkMovement" ADD COLUMN     "buyer_id" TEXT,
ADD COLUMN     "created_by_sale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "negotiation_id" TEXT;

-- AddForeignKey
ALTER TABLE "MilkMovement" ADD CONSTRAINT "MilkMovement_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkMovement" ADD CONSTRAINT "MilkMovement_negotiation_id_fkey" FOREIGN KEY ("negotiation_id") REFERENCES "Negotiation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

