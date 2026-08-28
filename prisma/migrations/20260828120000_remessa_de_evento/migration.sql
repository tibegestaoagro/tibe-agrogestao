-- AlterTable
ALTER TABLE "HerdStay" ADD COLUMN     "event_type" TEXT,
ADD COLUMN     "negotiation_id" TEXT;

-- CreateIndex
CREATE INDEX "HerdStay_negotiation_id_idx" ON "HerdStay"("negotiation_id");

-- AddForeignKey
ALTER TABLE "HerdStay" ADD CONSTRAINT "HerdStay_negotiation_id_fkey" FOREIGN KEY ("negotiation_id") REFERENCES "Negotiation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
