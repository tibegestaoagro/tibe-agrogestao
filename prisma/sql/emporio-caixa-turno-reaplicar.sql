-- Para REAPLICAR depois da janela do deploy da migracao 20261105120000_emporio_caixa_turno.
-- Entre a migracao e o codigo novo no ar, o codigo antigo ainda cria lojas e
-- movimentos sem caixa. Este SQL e idempotente: so mexe no que ficou sem caixa.
--
-- CUIDADO: se alguem ja abriu o Caixa 1 de uma loja, a abertura contou o dinheiro
-- da gaveta como sobra ("Diferenca de caixa"), e preencher o caixa dos movimentos
-- dessa loja contaria o mesmo dinheiro duas vezes. Por isso os UPDATEs abaixo so
-- tocam lojas cujo Caixa 1 ainda NAO teve nenhum turno.

-- RODE PRIMEIRO (so leitura): lojas com movimento de gaveta sem caixa E Caixa 1
-- que ja teve turno. Essas ficam de fora dos UPDATEs e precisam de conferencia a mao.
-- (Para ver o resultado depois, o comando de contagem do turno e o Meu Dia mostram o saldo.)
--
-- SELECT m."establishment_id", e."name" AS loja, COUNT(*) AS movimentos,
--        SUM(CASE WHEN m."direction" = 'entrada' THEN m."amount" ELSE -m."amount" END) AS soma_dos_movimentos
-- FROM "CashMovement" m
-- JOIN "Establishment" e ON e."id" = m."establishment_id"
-- WHERE m."cash_register_id" IS NULL
--   AND m."establishment_id" IS NOT NULL
--   AND EXISTS (
--     SELECT 1 FROM "CashSession" s
--     JOIN "CashRegister" r ON r."id" = s."cash_register_id"
--     WHERE r."establishment_id" = m."establishment_id" AND r."number" = 1
--   )
-- GROUP BY m."establishment_id", e."name";

-- Cada loja sem caixa ganha o Caixa 1.
INSERT INTO "CashRegister" ("id", "tenant_id", "establishment_id", "number")
SELECT 'cr_' || md5(random()::text || e."id"), e."tenant_id", e."id", 1
FROM "Establishment" e
WHERE NOT EXISTS (SELECT 1 FROM "CashRegister" r WHERE r."establishment_id" = e."id");

-- Todo movimento e toda conferencia da gaveta ainda sem caixa passam ao Caixa 1 da loja,
-- desde que esse Caixa 1 nunca tenha tido turno.
UPDATE "CashMovement" m
SET "cash_register_id" = r."id"
FROM "CashRegister" r
WHERE m."cash_register_id" IS NULL
  AND m."establishment_id" IS NOT NULL
  AND r."tenant_id" = m."tenant_id"
  AND r."establishment_id" = m."establishment_id"
  AND r."number" = 1
  AND NOT EXISTS (SELECT 1 FROM "CashSession" s WHERE s."cash_register_id" = r."id");

UPDATE "CashCount" c
SET "cash_register_id" = r."id"
FROM "CashRegister" r
WHERE c."cash_register_id" IS NULL
  AND r."tenant_id" = c."tenant_id"
  AND r."establishment_id" = c."establishment_id"
  AND r."number" = 1
  AND NOT EXISTS (SELECT 1 FROM "CashSession" s WHERE s."cash_register_id" = r."id");
