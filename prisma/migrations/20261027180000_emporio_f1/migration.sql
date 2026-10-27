-- CreateTable
CREATE TABLE "UserEstablishment" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEstablishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmporioProduct" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "base_unit" TEXT NOT NULL,
    "created_in_emporio" BOOLEAN NOT NULL DEFAULT false,
    "reference_cost" DECIMAL(14,4),
    "track_sealed" BOOLEAN,
    "track_lot" BOOLEAN NOT NULL DEFAULT false,
    "track_expiry" BOOLEAN NOT NULL DEFAULT false,
    "expense_pct" DECIMAL(7,2),
    "profit_pct" DECIMAL(7,2),
    "archived_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmporioProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPresentation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "emporio_product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_qty" DECIMAL(14,3) NOT NULL,
    "is_sealed_package" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPresentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationPrice" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "presentation_id" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "expense_pct" DECIMAL(7,2),
    "profit_pct" DECIMAL(7,2),
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresentationPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserEstablishment_tenant_id_idx" ON "UserEstablishment"("tenant_id");

-- CreateIndex
CREATE INDEX "UserEstablishment_establishment_id_idx" ON "UserEstablishment"("establishment_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserEstablishment_user_id_establishment_id_key" ON "UserEstablishment"("user_id", "establishment_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioProduct_product_id_key" ON "EmporioProduct"("product_id");

-- CreateIndex
CREATE INDEX "EmporioProduct_tenant_id_idx" ON "EmporioProduct"("tenant_id");

-- CreateIndex
CREATE INDEX "ProductPresentation_tenant_id_idx" ON "ProductPresentation"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPresentation_emporio_product_id_name_key" ON "ProductPresentation"("emporio_product_id", "name");

-- CreateIndex
CREATE INDEX "PresentationPrice_tenant_id_idx" ON "PresentationPrice"("tenant_id");

-- CreateIndex
CREATE INDEX "PresentationPrice_presentation_id_idx" ON "PresentationPrice"("presentation_id");

-- CreateIndex
CREATE UNIQUE INDEX "PresentationPrice_establishment_id_presentation_id_key" ON "PresentationPrice"("establishment_id", "presentation_id");

-- AddForeignKey
ALTER TABLE "UserEstablishment" ADD CONSTRAINT "UserEstablishment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEstablishment" ADD CONSTRAINT "UserEstablishment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEstablishment" ADD CONSTRAINT "UserEstablishment_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioProduct" ADD CONSTRAINT "EmporioProduct_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioProduct" ADD CONSTRAINT "EmporioProduct_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPresentation" ADD CONSTRAINT "ProductPresentation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPresentation" ADD CONSTRAINT "ProductPresentation_emporio_product_id_fkey" FOREIGN KEY ("emporio_product_id") REFERENCES "EmporioProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationPrice" ADD CONSTRAINT "PresentationPrice_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationPrice" ADD CONSTRAINT "PresentationPrice_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationPrice" ADD CONSTRAINT "PresentationPrice_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "ProductPresentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

