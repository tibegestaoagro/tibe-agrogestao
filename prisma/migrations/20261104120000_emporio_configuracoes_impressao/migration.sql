-- AlterTable
-- `number` entra anulável, recebe o backfill e só depois vira NOT NULL.
ALTER TABLE "EmporioSale" ADD COLUMN     "number" INTEGER;

-- AlterTable
ALTER TABLE "Establishment" ADD COLUMN     "document" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "whatsapp" TEXT,
ADD COLUMN     "zip" TEXT;

-- CreateTable
CREATE TABLE "EmporioSettings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "quote_validity_days" INTEGER NOT NULL DEFAULT 7,
    "quote_footer" TEXT,
    "sale_footer" TEXT,
    "receipt_width" INTEGER NOT NULL DEFAULT 80,
    "logo" BYTEA,
    "logo_mime" TEXT,
    "logo_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmporioSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmporioCounter" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "EmporioCounter_pkey" PRIMARY KEY ("id")
);

-- Backfill: numera as vendas existentes por conta, na ordem em que aconteceram.
UPDATE "EmporioSale" AS s
SET "number" = n.rn
FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "sold_at", "created_at", "id") AS rn
    FROM "EmporioSale"
) AS n
WHERE s."id" = n."id";

ALTER TABLE "EmporioSale" ALTER COLUMN "number" SET NOT NULL;

-- Semeia o contador de cada conta que já vendeu, para a próxima venda continuar a sequência.
INSERT INTO "EmporioCounter" ("id", "tenant_id", "key", "value")
SELECT gen_random_uuid()::text, "tenant_id", 'venda', MAX("number")
FROM "EmporioSale"
GROUP BY "tenant_id";

-- CreateIndex
CREATE UNIQUE INDEX "EmporioSettings_tenant_id_key" ON "EmporioSettings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioCounter_tenant_id_key_key" ON "EmporioCounter"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "EmporioSale_tenant_id_number_key" ON "EmporioSale"("tenant_id", "number");

-- AddForeignKey
ALTER TABLE "EmporioSettings" ADD CONSTRAINT "EmporioSettings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmporioCounter" ADD CONSTRAINT "EmporioCounter_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
