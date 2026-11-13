-- Q318: conta que não recebe PIX (cartão, caixa interno) fica fora da lista do PIX no balcão.
ALTER TABLE "BankAccount" ADD COLUMN     "receives_pix" BOOLEAN NOT NULL DEFAULT true;

-- Quem já recebe PIX continua recebendo: a conta PIX padrão de alguma loja, ou a que já
-- recebeu PIX numa venda ou num fiado. As demais nascem como "não recebe PIX"; a conta
-- muda isso em Caixa > Contas.
UPDATE "BankAccount" b
SET "receives_pix" = false
WHERE NOT EXISTS (SELECT 1 FROM "Establishment" e WHERE e."pix_bank_account_id" = b."id")
  AND NOT EXISTS (SELECT 1 FROM "EmporioSalePayment" p WHERE p."bank_account_id" = b."id" AND p."kind" = 'pix')
  AND NOT EXISTS (
    SELECT 1 FROM "CashMovement" m
    WHERE m."bank_account_id" = b."id" AND m."origin" = 'recebimento_fiado'
  );
