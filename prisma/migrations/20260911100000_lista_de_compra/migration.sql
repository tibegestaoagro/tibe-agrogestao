-- CreateEnum
CREATE TYPE "ShoppingItemStatus" AS ENUM ('pendente', 'comprado', 'removido');

-- CreateEnum
CREATE TYPE "ShoppingPriority" AS ENUM ('normal', 'urgente');

-- CreateEnum
CREATE TYPE "ShoppingPurpose" AS ENUM ('rebanho', 'pasto', 'confinamento', 'leite', 'maquina', 'cerca', 'fazenda_geral', 'outro');

-- CreateTable
CREATE TABLE "ShoppingItem" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "product_id" TEXT,
    "quantity" DECIMAL(14,3),
    "unit" TEXT,
    "property_id" TEXT,
    "category_id" TEXT,
    "purpose" "ShoppingPurpose",
    "priority" "ShoppingPriority" NOT NULL DEFAULT 'normal',
    "place" TEXT,
    "notes" TEXT,
    "status" "ShoppingItemStatus" NOT NULL DEFAULT 'pendente',
    "negotiation_id" TEXT,
    "created_by_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "ShoppingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShoppingItem_tenant_id_idx" ON "ShoppingItem"("tenant_id");

-- CreateIndex
CREATE INDEX "ShoppingItem_tenant_id_status_idx" ON "ShoppingItem"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ShoppingItem_product_id_idx" ON "ShoppingItem"("product_id");

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_negotiation_id_fkey" FOREIGN KEY ("negotiation_id") REFERENCES "Negotiation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

