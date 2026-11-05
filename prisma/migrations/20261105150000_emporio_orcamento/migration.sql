-- AlterTable
ALTER TABLE "EmporioSale" ADD COLUMN     "quote_id" TEXT;

-- CreateTable
CREATE TABLE "EmporioQuote" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "operation_key" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "contact_id" TEXT NOT NULL,
    "seller_user_id" TEXT,
    "created_by_user_id" TEXT,
    "valid_until" DATE NOT NULL,
    "net_amount" DECIMAL(14,2) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_authorized_by_user_id" TEXT,
    "sale_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmporioQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmporioQuoteItem" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "emporio_product_id" TEXT NOT NULL,
    "presentation_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "suggested_price" DECIMAL(14,2),
    "unit_price" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "EmporioQuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmporioQuote_sale_id_key" ON "EmporioQuote"("sale_id");

-- CreateIndex
CREATE INDEX "EmporioQuote_tenant_id_establishment_id_created_at_idx" ON "EmporioQuote"("tenant_id", "establishment_id", "created_at");

-- CreateIndex
CREATE INDEX "EmporioQuote_tenant_id_contact_id_idx" ON "EmporioQuote"("tenant_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioQuote_tenant_id_operation_key_key" ON "EmporioQuote"("tenant_id", "operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioQuote_tenant_id_number_key" ON "EmporioQuote"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "EmporioQuoteItem_tenant_id_idx" ON "EmporioQuoteItem"("tenant_id");

-- CreateIndex
CREATE INDEX "EmporioQuoteItem_quote_id_idx" ON "EmporioQuoteItem"("quote_id");

-- CreateIndex
CREATE INDEX "EmporioSale_tenant_id_quote_id_idx" ON "EmporioSale"("tenant_id", "quote_id");

-- AddForeignKey
ALTER TABLE "EmporioSale" ADD CONSTRAINT "EmporioSale_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "EmporioQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioQuote" ADD CONSTRAINT "EmporioQuote_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioQuote" ADD CONSTRAINT "EmporioQuote_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioQuote" ADD CONSTRAINT "EmporioQuote_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioQuote" ADD CONSTRAINT "EmporioQuote_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "EmporioSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioQuoteItem" ADD CONSTRAINT "EmporioQuoteItem_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioQuoteItem" ADD CONSTRAINT "EmporioQuoteItem_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "EmporioQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioQuoteItem" ADD CONSTRAINT "EmporioQuoteItem_emporio_product_id_fkey" FOREIGN KEY ("emporio_product_id") REFERENCES "EmporioProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioQuoteItem" ADD CONSTRAINT "EmporioQuoteItem_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "ProductPresentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
