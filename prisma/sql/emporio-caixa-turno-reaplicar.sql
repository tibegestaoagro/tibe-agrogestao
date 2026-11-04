-- Para REAPLICAR depois da janela do deploy da migracao 20261105120000_emporio_caixa_turno.
-- Entre a migracao e o codigo novo no ar, o codigo antigo ainda cria lojas e
-- movimentos sem caixa. Este SQL e idempotente: so mexe no que ficou sem caixa.

-- Cada loja sem caixa ganha o Caixa 1.
INSERT INTO "CashRegister" ("id", "tenant_id", "establishment_id", "number")
SELECT 'cr_' || md5(random()::text || e."id"), e."tenant_id", e."id", 1
FROM "Establishment" e
WHERE NOT EXISTS (SELECT 1 FROM "CashRegister" r WHERE r."establishment_id" = e."id");

-- Todo movimento e toda conferencia da gaveta ainda sem caixa passam ao Caixa 1 da loja.
UPDATE "CashMovement" m
SET "cash_register_id" = r."id"
FROM "CashRegister" r
WHERE m."cash_register_id" IS NULL
  AND m."establishment_id" IS NOT NULL
  AND r."tenant_id" = m."tenant_id"
  AND r."establishment_id" = m."establishment_id"
  AND r."number" = 1;

UPDATE "CashCount" c
SET "cash_register_id" = r."id"
FROM "CashRegister" r
WHERE c."cash_register_id" IS NULL
  AND r."tenant_id" = c."tenant_id"
  AND r."establishment_id" = c."establishment_id"
  AND r."number" = 1;
