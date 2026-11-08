-- AlterTable
ALTER TABLE "EmporioCustomer" ADD COLUMN     "fiado_due_day" INTEGER,
ADD COLUMN     "fiado_due_days" INTEGER,
ADD COLUMN     "fiado_limit" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "EmporioSettings" ADD COLUMN     "fiado_block_after_days" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "fiado_collection_message" TEXT,
ADD COLUMN     "fiado_default_limit" DECIMAL(14,2),
ADD COLUMN     "fiado_due_days" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "EmporioCreditRelease" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "released_by_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "consumed_sale_id" TEXT,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmporioCreditRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmporioCreditRelease_consumed_sale_id_key" ON "EmporioCreditRelease"("consumed_sale_id");

-- CreateIndex
CREATE INDEX "EmporioCreditRelease_tenant_id_customer_id_valid_until_idx" ON "EmporioCreditRelease"("tenant_id", "customer_id", "valid_until");

-- AddForeignKey
ALTER TABLE "EmporioCreditRelease" ADD CONSTRAINT "EmporioCreditRelease_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCreditRelease" ADD CONSTRAINT "EmporioCreditRelease_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "EmporioCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCreditRelease" ADD CONSTRAINT "EmporioCreditRelease_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCreditRelease" ADD CONSTRAINT "EmporioCreditRelease_released_by_user_id_fkey" FOREIGN KEY ("released_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCreditRelease" ADD CONSTRAINT "EmporioCreditRelease_consumed_sale_id_fkey" FOREIGN KEY ("consumed_sale_id") REFERENCES "EmporioSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

