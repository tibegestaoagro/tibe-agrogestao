-- AlterEnum
ALTER TYPE "FinancialEntryStatus" ADD VALUE 'cancelled';

-- CreateTable
CREATE TABLE "FinancialCategory" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entry_type" "EntryType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertPreference" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "alert_type" "AlertType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialCategory_tenant_id_idx" ON "FinancialCategory"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialCategory_tenant_id_entry_type_name_key" ON "FinancialCategory"("tenant_id", "entry_type", "name");

-- CreateIndex
CREATE INDEX "AlertPreference_tenant_id_idx" ON "AlertPreference"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "AlertPreference_tenant_id_alert_type_key" ON "AlertPreference"("tenant_id", "alert_type");

-- AddForeignKey
ALTER TABLE "FinancialCategory" ADD CONSTRAINT "FinancialCategory_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertPreference" ADD CONSTRAINT "AlertPreference_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
