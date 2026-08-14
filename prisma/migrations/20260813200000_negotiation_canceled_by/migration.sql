-- §17.10 pede "usuário responsável" no histórico da negociação.
--
-- Sem esta coluna, o evento que mais importa auditar (desfazer um negócio, que
-- mexe em rebanho E dinheiro de uma vez) era o único sem autor: a criação já
-- gravava `recorded_by_user_id`, o cancelamento não gravava nada.
ALTER TABLE "Negotiation" ADD COLUMN "canceled_by_user_id" TEXT;
