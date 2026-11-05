-- Empório, entrega 3: reaplicação do vendedor das vendas antigas.
--
-- Rodar no Neon (URL Direct) DEPOIS que o build da entrega 3 estiver no ar.
-- Entre a migração 20261105140000 e o push, o código antigo grava venda com
-- seller_user_id nulo; este comando dá a elas o vendedor igual a quem
-- registrou, como o backfill da migração fez com as anteriores. É idempotente:
-- o código novo nunca grava venda sem vendedor.
--
-- Rode primeiro, só leitura:
-- SELECT count(*) AS sem_vendedor FROM "EmporioSale" WHERE "seller_user_id" IS NULL AND "sold_by_user_id" IS NOT NULL;

UPDATE "EmporioSale"
SET "seller_user_id" = "sold_by_user_id"
WHERE "seller_user_id" IS NULL
  AND "sold_by_user_id" IS NOT NULL;
