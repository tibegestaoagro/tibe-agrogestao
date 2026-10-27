-- CreateEnum
CREATE TYPE "EstablishmentKind" AS ENUM ('central', 'ponto_venda');

-- AlterEnum
ALTER TYPE "ProfileType" ADD VALUE 'emporio';

-- AlterEnum
ALTER TYPE "RelatedModule" ADD VALUE 'emporio';

-- AlterTable
ALTER TABLE "FinancialEntry" ADD COLUMN     "establishment_id" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "establishment_id" TEXT,
ALTER COLUMN "property_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TenantFeature" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_platform_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantFeatureUser" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tenant_feature_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantFeatureUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Establishment" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EstablishmentKind" NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "responsible_user_id" TEXT,
    "allow_negative_stock" BOOLEAN NOT NULL DEFAULT false,
    "max_discount_pct" DECIMAL(5,2),
    "default_expense_pct" DECIMAL(7,2),
    "default_profit_pct" DECIMAL(7,2),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Establishment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantFeature_tenant_id_idx" ON "TenantFeature"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "TenantFeature_tenant_id_feature_key_key" ON "TenantFeature"("tenant_id", "feature_key");

-- CreateIndex
CREATE INDEX "TenantFeatureUser_tenant_id_idx" ON "TenantFeatureUser"("tenant_id");

-- CreateIndex
CREATE INDEX "TenantFeatureUser_user_id_idx" ON "TenantFeatureUser"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "TenantFeatureUser_tenant_feature_id_user_id_key" ON "TenantFeatureUser"("tenant_feature_id", "user_id");

-- CreateIndex
CREATE INDEX "Establishment_tenant_id_idx" ON "Establishment"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "Establishment_tenant_id_name_key" ON "Establishment"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "FinancialEntry_establishment_id_idx" ON "FinancialEntry"("establishment_id");

-- CreateIndex
CREATE INDEX "StockMovement_tenant_id_product_id_establishment_id_idx" ON "StockMovement"("tenant_id", "product_id", "establishment_id");

-- AddForeignKey
ALTER TABLE "TenantFeature" ADD CONSTRAINT "TenantFeature_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFeature" ADD CONSTRAINT "TenantFeature_changed_by_platform_user_id_fkey" FOREIGN KEY ("changed_by_platform_user_id") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFeatureUser" ADD CONSTRAINT "TenantFeatureUser_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFeatureUser" ADD CONSTRAINT "TenantFeatureUser_tenant_feature_id_fkey" FOREIGN KEY ("tenant_feature_id") REFERENCES "TenantFeature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFeatureUser" ADD CONSTRAINT "TenantFeatureUser_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Establishment" ADD CONSTRAINT "Establishment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Establishment" ADD CONSTRAINT "Establishment_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Toda movimentacao de estoque pertence a exatamente um local: uma fazenda
-- OU um estabelecimento do Emporio. Sem isso, uma linha com os dois nulos
-- (ou os dois preenchidos) entraria em saldo nenhum, ou em dois. As linhas
-- existentes todas tem property_id preenchido e establishment_id nulo.
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_exactly_one_location" CHECK (("property_id" IS NULL) <> ("establishment_id" IS NULL));
