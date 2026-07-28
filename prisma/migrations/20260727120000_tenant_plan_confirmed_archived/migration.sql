-- Plano confirmado (fluxo pós-troca-de-senha, tenants criados manualmente
-- pelo painel) e arquivamento de tenant (spec 2026-07-27).
ALTER TABLE "Tenant" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "plan_confirmed" BOOLEAN NOT NULL DEFAULT true;
