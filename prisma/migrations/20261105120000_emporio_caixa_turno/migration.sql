
-- CreateEnum
CREATE TYPE "CashCountKind" AS ENUM ('abertura', 'livre', 'encerramento');

-- CreateEnum
CREATE TYPE "CashHandoverKind" AS ENUM ('sangria', 'malote');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CashMovementOrigin" ADD VALUE 'sangria';
ALTER TYPE "CashMovementOrigin" ADD VALUE 'malote';
ALTER TYPE "CashMovementOrigin" ADD VALUE 'reforco';
ALTER TYPE "CashMovementOrigin" ADD VALUE 'entrega_gerencia';

-- AlterEnum
ALTER TYPE "EmporioRole" ADD VALUE 'caixa';

-- AlterTable
ALTER TABLE "CashCount" ADD COLUMN     "cash_register_id" TEXT,
ADD COLUMN     "cash_session_id" TEXT,
ADD COLUMN     "kind" "CashCountKind" NOT NULL DEFAULT 'livre';

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "cash_handover_id" TEXT,
ADD COLUMN     "cash_register_id" TEXT,
ADD COLUMN     "cash_session_id" TEXT,
ADD COLUMN     "manager_establishment_id" TEXT;

-- AlterTable
ALTER TABLE "EmporioSale" ADD COLUMN     "cash_session_id" TEXT;

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "cash_register_id" TEXT NOT NULL,
    "open_register_id" TEXT,
    "operation_key" TEXT NOT NULL,
    "opened_by_user_id" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "opening_expected" DECIMAL(14,2) NOT NULL,
    "opening_counted" DECIMAL(14,2) NOT NULL,
    "reinforcement" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMP(3),
    "closed_by_user_id" TEXT,
    "close_operation_key" TEXT,
    "closing_expected" DECIMAL(14,2),
    "closing_counted" DECIMAL(14,2),
    "malote_amount" DECIMAL(14,2),

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashHandover" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "cash_register_id" TEXT NOT NULL,
    "cash_session_id" TEXT NOT NULL,
    "kind" "CashHandoverKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "operation_key" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_user_id" TEXT,
    "confirm_operation_key" TEXT,
    "received_amount" DECIMAL(14,2),
    "difference" DECIMAL(14,2),
    "confirm_notes" TEXT,

    CONSTRAINT "CashHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashRegister_tenant_id_establishment_id_number_key" ON "CashRegister"("tenant_id", "establishment_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_open_register_id_key" ON "CashSession"("open_register_id");

-- CreateIndex
CREATE INDEX "CashSession_tenant_id_establishment_id_closed_at_idx" ON "CashSession"("tenant_id", "establishment_id", "closed_at");

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_tenant_id_operation_key_key" ON "CashSession"("tenant_id", "operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_tenant_id_close_operation_key_key" ON "CashSession"("tenant_id", "close_operation_key");

-- CreateIndex
CREATE INDEX "CashHandover_tenant_id_establishment_id_confirmed_at_idx" ON "CashHandover"("tenant_id", "establishment_id", "confirmed_at");

-- CreateIndex
CREATE UNIQUE INDEX "CashHandover_tenant_id_operation_key_key" ON "CashHandover"("tenant_id", "operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "CashHandover_tenant_id_confirm_operation_key_key" ON "CashHandover"("tenant_id", "confirm_operation_key");

-- CreateIndex
CREATE INDEX "CashMovement_tenant_id_cash_register_id_idx" ON "CashMovement"("tenant_id", "cash_register_id");

-- CreateIndex
CREATE INDEX "CashMovement_tenant_id_cash_session_id_idx" ON "CashMovement"("tenant_id", "cash_session_id");

-- CreateIndex
CREATE INDEX "CashMovement_tenant_id_manager_establishment_id_idx" ON "CashMovement"("tenant_id", "manager_establishment_id");

-- CreateIndex
CREATE INDEX "EmporioSale_tenant_id_cash_session_id_idx" ON "EmporioSale"("tenant_id", "cash_session_id");

-- AddForeignKey
ALTER TABLE "EmporioSale" ADD CONSTRAINT "EmporioSale_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_manager_establishment_id_fkey" FOREIGN KEY ("manager_establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cash_handover_id_fkey" FOREIGN KEY ("cash_handover_id") REFERENCES "CashHandover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- O dinheiro esta na gaveta da loja, numa conta ou com a gerencia: exatamente um dos tres.
ALTER TABLE "CashMovement" DROP CONSTRAINT "CashMovement_exactly_one_place";
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_exactly_one_place" CHECK (
    (("establishment_id" IS NOT NULL)::int + ("bank_account_id" IS NOT NULL)::int + ("manager_establishment_id" IS NOT NULL)::int) = 1
);

-- Backfill: cada loja existente ganha o Caixa 1.
INSERT INTO "CashRegister" ("id", "tenant_id", "establishment_id", "number")
SELECT 'cr_' || md5(random()::text || e."id"), e."tenant_id", e."id", 1
FROM "Establishment" e;

-- Todo movimento e toda conferencia da gaveta passam a pertencer ao Caixa 1 da loja.
UPDATE "CashMovement" m
SET "cash_register_id" = r."id"
FROM "CashRegister" r
WHERE m."establishment_id" IS NOT NULL
  AND r."tenant_id" = m."tenant_id"
  AND r."establishment_id" = m."establishment_id"
  AND r."number" = 1;

UPDATE "CashCount" c
SET "cash_register_id" = r."id"
FROM "CashRegister" r
WHERE r."tenant_id" = c."tenant_id"
  AND r."establishment_id" = c."establishment_id"
  AND r."number" = 1;

-- A transferencia entre lojas deixa de ser permissao propria (o caixa nao a usa mais).
UPDATE "User" SET "emporio_keys" = array_remove("emporio_keys", 'transferir_caixa');

