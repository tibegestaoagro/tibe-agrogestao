-- Janela de arquivamento pós-cancelamento (spec 2026-08-04).
--
-- Âncora da contagem dos 60 dias. `next_due_date` sozinho não resolve: quem
-- cancela já vencido não tem período pago a honrar, e nesse caso a janela
-- começa no próprio cancelamento.
--
-- Aditiva e nullable de propósito: assinaturas existentes ficam com NULL, e
-- `getBillingAccess()` já trata esse caso caindo em `next_due_date` (e, na
-- falta dele, em `created_at`). Nenhum backfill é necessário: quando esta
-- migração foi escrita havia 0 assinaturas e 0 cancelamentos registrados.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "canceled_at" TIMESTAMP(3);
