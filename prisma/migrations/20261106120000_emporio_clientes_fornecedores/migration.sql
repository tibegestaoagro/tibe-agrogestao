-- Empório, Frente 1: clientes e fornecedores em tabelas próprias. Só acréscimo:
-- as colunas contact_id continuam, e a migração seguinte copia os dados, reponta
-- e apaga o que ficou velho.

-- CreateEnum
CREATE TYPE "EmporioSupplierKind" AS ENUM ('propriedade', 'externo');

-- AlterTable
ALTER TABLE "EmporioCheck" ADD COLUMN     "customer_id" TEXT,
ALTER COLUMN "contact_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EmporioPurchase" ADD COLUMN     "supplier_id" TEXT,
ALTER COLUMN "payment_kind" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EmporioQuote" ADD COLUMN     "customer_id" TEXT,
ALTER COLUMN "contact_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EmporioSale" ADD COLUMN     "customer_id" TEXT;

-- AlterTable
ALTER TABLE "FinancialEntry" ADD COLUMN     "emporio_customer_id" TEXT,
ADD COLUMN     "emporio_supplier_id" TEXT;

-- CreateTable
-- name_busca é coluna GERADA (ver 20261008120000_busca_sem_acento): o diff não sabe escrevê-la.
CREATE TABLE "EmporioCustomer" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_busca" TEXT GENERATED ALWAYS AS (nome_de_busca("name")) STORED,
    "person_kind" "ContactPersonKind",
    "document" TEXT,
    "phone" TEXT,
    "state_registration" TEXT,
    "birth_date" DATE,
    "responsible_name" TEXT,
    "address_zip" TEXT,
    "address_street" TEXT,
    "address_number" TEXT,
    "address_complement" TEXT,
    "address_district" TEXT,
    "city" TEXT,
    "address_state" TEXT,
    "delivery_zip" TEXT,
    "delivery_street" TEXT,
    "delivery_number" TEXT,
    "delivery_complement" TEXT,
    "delivery_district" TEXT,
    "delivery_city" TEXT,
    "delivery_state" TEXT,
    "notes" TEXT,
    "system_key" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmporioCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmporioSupplier" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" "EmporioSupplierKind" NOT NULL,
    "property_id" TEXT,
    "name" TEXT NOT NULL,
    "name_busca" TEXT GENERATED ALWAYS AS (nome_de_busca("name")) STORED,
    "person_kind" "ContactPersonKind",
    "document" TEXT,
    "phone" TEXT,
    "state_registration" TEXT,
    "address_zip" TEXT,
    "address_street" TEXT,
    "address_number" TEXT,
    "address_complement" TEXT,
    "address_district" TEXT,
    "city" TEXT,
    "address_state" TEXT,
    "notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmporioSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmporioCustomer_tenant_id_idx" ON "EmporioCustomer"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioCustomer_tenant_id_document_key" ON "EmporioCustomer"("tenant_id", "document");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioCustomer_tenant_id_system_key_key" ON "EmporioCustomer"("tenant_id", "system_key");

-- CreateIndex
CREATE INDEX "EmporioSupplier_tenant_id_idx" ON "EmporioSupplier"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioSupplier_tenant_id_document_key" ON "EmporioSupplier"("tenant_id", "document");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioSupplier_tenant_id_property_id_key" ON "EmporioSupplier"("tenant_id", "property_id");

-- CreateIndex
CREATE INDEX "EmporioCheck_tenant_id_customer_id_idx" ON "EmporioCheck"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "EmporioPurchase_tenant_id_supplier_id_idx" ON "EmporioPurchase"("tenant_id", "supplier_id");

-- CreateIndex
CREATE INDEX "EmporioQuote_tenant_id_customer_id_idx" ON "EmporioQuote"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "EmporioSale_tenant_id_customer_id_idx" ON "EmporioSale"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "FinancialEntry_emporio_customer_id_idx" ON "FinancialEntry"("emporio_customer_id");

-- CreateIndex
CREATE INDEX "FinancialEntry_emporio_supplier_id_idx" ON "FinancialEntry"("emporio_supplier_id");

-- AddForeignKey
ALTER TABLE "EmporioPurchase" ADD CONSTRAINT "EmporioPurchase_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "EmporioSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSale" ADD CONSTRAINT "EmporioSale_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "EmporioCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioQuote" ADD CONSTRAINT "EmporioQuote_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "EmporioCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCheck" ADD CONSTRAINT "EmporioCheck_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "EmporioCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_emporio_customer_id_fkey" FOREIGN KEY ("emporio_customer_id") REFERENCES "EmporioCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_emporio_supplier_id_fkey" FOREIGN KEY ("emporio_supplier_id") REFERENCES "EmporioSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCustomer" ADD CONSTRAINT "EmporioCustomer_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSupplier" ADD CONSTRAINT "EmporioSupplier_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioSupplier" ADD CONSTRAINT "EmporioSupplier_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
