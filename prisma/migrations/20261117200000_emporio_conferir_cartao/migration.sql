-- Frente B do Empório (spec de 17/11/2026): conferir o cartão (Q349 a Q353).

-- AlterEnum
ALTER TYPE "CashMovementOrigin" ADD VALUE 'ajuste_cartao';

-- AlterTable
ALTER TABLE "CardReceivable" ADD COLUMN     "confirmed_net" DECIMAL(14,2);

-- Q353: a parcela já carimbada fica conferida pelo previsto.
UPDATE "CardReceivable"
SET "confirmed_net" = "effective_net"
WHERE "reconciled_at" IS NOT NULL
  AND "confirmed_net" IS NULL;

-- Q353: as parcelas sem carimbo com data mais de 7 dias antes do dia em que esta
-- migração roda (dia de Brasília) nascem conferidas pelo previsto, sem ajuste e
-- sem autor. As dos últimos 7 dias ficam para o Financeiro conferir.
UPDATE "CardReceivable"
SET "reconciled_at" = now(),
    "confirmed_net" = "effective_net"
WHERE "reconciled_at" IS NULL
  AND "canceled_at" IS NULL
  AND "effective_on" < ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 7);
