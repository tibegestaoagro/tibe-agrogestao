-- Dívida 3.2: a decisão da Plataforma de arquivar, separada da marca que o
-- varredor do cancelamento grava em archived_at. Produção tinha 0 tenants
-- arquivados em 2026-10-07: nada a preencher.

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "arquivado_pela_plataforma_em" TIMESTAMP(3);
