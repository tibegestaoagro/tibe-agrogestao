-- Módulo 39, F6b: função no Empório (Q118 a Q120, Q129), transferência com
-- diferença (Q131) e o Histórico (Q134).

-- CreateEnum
CREATE TYPE "EmporioRole" AS ENUM ('gerente_geral', 'gestor', 'vendedor');

-- CreateEnum
CREATE TYPE "TransferResolution" AS ENUM ('perda_no_caminho', 'nao_enviada');

-- AlterEnum
ALTER TYPE "StockTransferStatus" ADD VALUE 'aguardando_gestor';

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "resolution" "TransferResolution",
ADD COLUMN     "resolution_reason" TEXT,
ADD COLUMN     "resolved_at" TIMESTAMP(3),
ADD COLUMN     "resolved_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emporio_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "emporio_only" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emporio_role" "EmporioRole";

-- CreateTable
CREATE TABLE "EmporioAuditLog" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,
    "establishment_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "summary" TEXT NOT NULL,
    "changes" JSONB,

    CONSTRAINT "EmporioAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmporioAuditLog_tenant_id_created_at_idx" ON "EmporioAuditLog"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "EmporioAuditLog_tenant_id_establishment_id_created_at_idx" ON "EmporioAuditLog"("tenant_id", "establishment_id", "created_at");

-- CreateIndex
CREATE INDEX "EmporioAuditLog_tenant_id_user_id_created_at_idx" ON "EmporioAuditLog"("tenant_id", "user_id", "created_at");

-- AddForeignKey
ALTER TABLE "EmporioAuditLog" ADD CONSTRAINT "EmporioAuditLog_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migração de dados (contrato da F6b): a visibilidade do Empório passa a sair
-- da função. Quem já via (estava na lista do recurso, ou a lista estava
-- vazia) e não é o Dono ganha a função equivalente: ADMIN vira Gerente geral,
-- OPERADOR vira Vendedor, VISUALIZADOR fica sem função. Em produção só a Da
-- Mata tem o recurso, com a lista só do Owner: nada muda lá.
WITH recurso AS (
  SELECT f."id", f."tenant_id",
         EXISTS (SELECT 1 FROM "TenantFeatureUser" fu WHERE fu."tenant_feature_id" = f."id") AS tem_lista
  FROM "TenantFeature" f
  WHERE f."feature_key" = 'emporio' AND f."enabled" = true
)
UPDATE "User" u
SET "emporio_role" = CASE u."role"
      WHEN 'ADMIN' THEN 'gerente_geral'::"EmporioRole"
      WHEN 'OPERADOR' THEN 'vendedor'::"EmporioRole"
    END
FROM recurso r
WHERE u."tenant_id" = r."tenant_id"
  AND u."active" = true
  AND u."role" IN ('ADMIN', 'OPERADOR')
  AND (NOT r.tem_lista OR EXISTS (
        SELECT 1 FROM "TenantFeatureUser" fu
        WHERE fu."tenant_feature_id" = r."id" AND fu."user_id" = u."id"));

-- O Gerente geral não tem lojas: vê todas.
DELETE FROM "UserEstablishment" ue
USING "User" u
WHERE ue."user_id" = u."id" AND u."emporio_role" = 'gerente_geral';

-- O Vendedor precisa de pelo menos uma loja: quem não tinha vínculo via todas,
-- então fica ligado a todas as lojas não arquivadas.
INSERT INTO "UserEstablishment" ("id", "tenant_id", "user_id", "establishment_id")
SELECT gen_random_uuid()::text, u."tenant_id", u."id", e."id"
FROM "User" u
JOIN "Establishment" e ON e."tenant_id" = u."tenant_id" AND e."archived_at" IS NULL
WHERE u."emporio_role" = 'vendedor'
  AND NOT EXISTS (SELECT 1 FROM "UserEstablishment" x WHERE x."user_id" = u."id");
