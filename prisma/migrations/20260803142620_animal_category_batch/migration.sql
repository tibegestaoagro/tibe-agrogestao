-- CreateTable
CREATE TABLE "AnimalCategory" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalBatch" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "average_weight" DECIMAL(10,3),
    "acquisition_cost" DECIMAL(14,2),
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnimalBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnimalCategory_tenant_id_idx" ON "AnimalCategory"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalCategory_tenant_id_name_key" ON "AnimalCategory"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "AnimalBatch_tenant_id_idx" ON "AnimalBatch"("tenant_id");

-- CreateIndex
CREATE INDEX "AnimalBatch_property_id_idx" ON "AnimalBatch"("property_id");

-- CreateIndex
CREATE INDEX "AnimalBatch_category_id_idx" ON "AnimalBatch"("category_id");

-- AddForeignKey
ALTER TABLE "AnimalCategory" ADD CONSTRAINT "AnimalCategory_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalBatch" ADD CONSTRAINT "AnimalBatch_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalBatch" ADD CONSTRAINT "AnimalBatch_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalBatch" ADD CONSTRAINT "AnimalBatch_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "AnimalCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
