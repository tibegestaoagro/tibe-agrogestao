-- Módulo 39, F6a: conteúdo e dados do produto (Q123, Q124) e o tipo do
-- estabelecimento anulável (Q121; a coluna sai na entrega seguinte).

-- AlterTable
ALTER TABLE "EmporioProduct" ADD COLUMN     "content_qty" DECIMAL(14,3),
ADD COLUMN     "content_unit" TEXT,
ADD COLUMN     "internal_code" TEXT,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "species" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Establishment" ALTER COLUMN "kind" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EmporioProduct_tenant_id_internal_code_key" ON "EmporioProduct"("tenant_id", "internal_code");
