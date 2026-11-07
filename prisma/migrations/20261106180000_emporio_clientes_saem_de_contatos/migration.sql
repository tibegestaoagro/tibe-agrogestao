-- Empório, Frente 1 (Task 6): os clientes e fornecedores saem de Contatos.
--
-- Copia para EmporioCustomer e EmporioSupplier os contatos que o Empório usa,
-- COM O MESMO ID (repontar vira customer_id = contact_id, e o link antigo do
-- Histórico, target_type "contato", abre a ficha certa), reponta vendas,
-- orçamentos, cheques, compras e lançamentos, apaga as colunas contact_id das
-- quatro tabelas e tira de Contatos o que era só do Empório.
--
-- Todo passo de dados é idempotente: o banco de dev já tem linhas no formato
-- novo. O script roda numa transação só (o Prisma o manda inteiro): qualquer
-- RAISE ou chave estrangeira violada desfaz tudo.
--
-- Conferência: scripts/conferir-clientes-emporio.ts (antes e depois).
-- Ensaio na cópia da produção: scripts/sql/ensaio-clientes-emporio.sql.

-- Trava de escrita até o fim da transação. SHARE ROW EXCLUSIVE deixa ler e
-- impede INSERT, UPDATE e DELETE de outra sessão (e outra migração). Travar só
-- "Contact" não basta: quem grava uma Negociação apontando para um contato só
-- pega ROW SHARE em "Contact" (a checagem da FK), que esse modo não bloqueia, e
-- a linha nova escaparia da conferência do passo 7. Por isso entram as tabelas
-- que apontam para "Contact" e as do Empório que a migração lê e reponta.
-- Se a trava esperar mais de 5 segundos (alguém gravando numa dessas tabelas),
-- a migração falha em vez de parar loja, fazenda, WhatsApp e worker na fila.
-- Nesse caso: migrate resolve --rolled-back com esta migração e repetir. É SET
-- de sessão, e não LOCAL, porque o Prisma manda o script num bloco implícito.
SET lock_timeout = '5s';

LOCK TABLE
  "Contact", "Negotiation", "MilkMovement", "MilkCharge", "ServiceJob", "MachineMaintenance", "FinancialEntry",
  "EmporioSale", "EmporioQuote", "EmporioCheck", "EmporioPurchase", "EmporioAuditLog",
  "EmporioCustomer", "EmporioSupplier"
IN SHARE ROW EXCLUSIVE MODE;

-- 0. Trava: um contato de outra conta numa linha do Empório viraria um
-- cliente cruzando contas. Nunca deveria existir; se existir, parar.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM (
    SELECT 1 FROM "EmporioSale" x JOIN "Contact" c ON c."id" = x."contact_id" WHERE c."tenant_id" <> x."tenant_id"
    UNION ALL SELECT 1 FROM "EmporioQuote" x JOIN "Contact" c ON c."id" = x."contact_id" WHERE c."tenant_id" <> x."tenant_id"
    UNION ALL SELECT 1 FROM "EmporioCheck" x JOIN "Contact" c ON c."id" = x."contact_id" WHERE c."tenant_id" <> x."tenant_id"
    UNION ALL SELECT 1 FROM "EmporioPurchase" x JOIN "Contact" c ON c."id" = x."contact_id" WHERE c."tenant_id" <> x."tenant_id"
    UNION ALL SELECT 1 FROM "FinancialEntry" x JOIN "Contact" c ON c."id" = x."contact_id"
      WHERE x."related_module" = 'emporio' AND c."tenant_id" <> x."tenant_id"
  ) t;
  IF n > 0 THEN
    RAISE EXCEPTION 'Migracao abortada: % linha(s) do Emporio apontam para contato de outra conta.', n;
  END IF;
END $$;

-- 1. Consumidor final: o contato de sistema vira o Consumidor final da conta
-- na tabela nova. A conta que já tem o seu lá fica com ele.
INSERT INTO "EmporioCustomer" ("id", "tenant_id", "name", "system_key", "created_at", "updated_at")
SELECT c."id", c."tenant_id", c."name", c."system_key", c."created_at", CURRENT_TIMESTAMP
FROM "Contact" c
WHERE c."system_key" = 'consumidor_final'
  AND NOT EXISTS (
    SELECT 1 FROM "EmporioCustomer" e WHERE e."tenant_id" = c."tenant_id" AND e."system_key" = 'consumidor_final'
  );

-- 2. Clientes: os contatos citados em venda, orçamento ou cheque, e os
-- cadastrados ou completados pelo balcão (Histórico, target_type "contato").
INSERT INTO "EmporioCustomer" (
  "id", "tenant_id", "name", "person_kind", "document", "phone", "state_registration", "birth_date",
  "responsible_name", "address_zip", "address_street", "address_number", "address_complement",
  "address_district", "city", "address_state", "delivery_zip", "delivery_street", "delivery_number",
  "delivery_complement", "delivery_district", "delivery_city", "delivery_state", "notes", "archived_at",
  "created_at", "updated_at"
)
SELECT
  c."id", c."tenant_id", c."name", c."person_kind", c."document", c."phone", c."state_registration", c."birth_date",
  c."responsible_name", c."address_zip", c."address_street", c."address_number", c."address_complement",
  c."address_district", c."city", c."address_state", c."delivery_zip", c."delivery_street", c."delivery_number",
  c."delivery_complement", c."delivery_district", c."delivery_city", c."delivery_state", c."notes", c."archived_at",
  c."created_at", CURRENT_TIMESTAMP
FROM "Contact" c
WHERE c."system_key" IS NULL
  AND (
    EXISTS (SELECT 1 FROM "EmporioSale" s WHERE s."contact_id" = c."id")
    OR EXISTS (SELECT 1 FROM "EmporioQuote" q WHERE q."contact_id" = c."id")
    OR EXISTS (SELECT 1 FROM "EmporioCheck" k WHERE k."contact_id" = c."id")
    OR EXISTS (
      SELECT 1 FROM "EmporioAuditLog" a
      WHERE a."target_type" = 'contato' AND a."target_id" = c."id"
        AND a."action" IN ('cliente.cadastrar', 'cliente.completar')
    )
  )
ON CONFLICT ("id") DO NOTHING;

-- 3. Fornecedores: os contatos citados em compra, como fornecedor de fora.
INSERT INTO "EmporioSupplier" (
  "id", "tenant_id", "kind", "name", "person_kind", "document", "phone", "state_registration",
  "address_zip", "address_street", "address_number", "address_complement", "address_district", "city",
  "address_state", "notes", "archived_at", "created_at", "updated_at"
)
SELECT
  c."id", c."tenant_id", 'externo', c."name", c."person_kind", c."document", c."phone", c."state_registration",
  c."address_zip", c."address_street", c."address_number", c."address_complement", c."address_district", c."city",
  c."address_state", c."notes", c."archived_at", c."created_at", CURRENT_TIMESTAMP
FROM "Contact" c
WHERE EXISTS (SELECT 1 FROM "EmporioPurchase" p WHERE p."contact_id" = c."id")
ON CONFLICT ("id") DO NOTHING;

-- 4. Repontar onde o campo novo está nulo. O contato de sistema vai para o
-- Consumidor final da conta na tabela nova (pelo system_key, não pelo id).
UPDATE "EmporioSale" s
SET "customer_id" = CASE WHEN c."system_key" = 'consumidor_final' THEN (
    SELECT e."id" FROM "EmporioCustomer" e WHERE e."tenant_id" = s."tenant_id" AND e."system_key" = 'consumidor_final'
  ) ELSE c."id" END
FROM "Contact" c
WHERE c."id" = s."contact_id" AND s."customer_id" IS NULL;

UPDATE "EmporioQuote" q
SET "customer_id" = CASE WHEN c."system_key" = 'consumidor_final' THEN (
    SELECT e."id" FROM "EmporioCustomer" e WHERE e."tenant_id" = q."tenant_id" AND e."system_key" = 'consumidor_final'
  ) ELSE c."id" END
FROM "Contact" c
WHERE c."id" = q."contact_id" AND q."customer_id" IS NULL;

UPDATE "EmporioCheck" k
SET "customer_id" = CASE WHEN c."system_key" = 'consumidor_final' THEN (
    SELECT e."id" FROM "EmporioCustomer" e WHERE e."tenant_id" = k."tenant_id" AND e."system_key" = 'consumidor_final'
  ) ELSE c."id" END
FROM "Contact" c
WHERE c."id" = k."contact_id" AND k."customer_id" IS NULL;

UPDATE "EmporioPurchase"
SET "supplier_id" = "contact_id"
WHERE "contact_id" IS NOT NULL AND "supplier_id" IS NULL;

-- 5. Ponte com o financeiro: o lançamento do Empório com contact_id passa a
-- apontar para o fornecedor (conta da compra) ou para o cliente (o resto), e
-- perde o contact_id, que fica só para a fazenda.
UPDATE "FinancialEntry" f
SET "emporio_supplier_id" = f."contact_id"
WHERE f."related_module" = 'emporio' AND f."contact_id" IS NOT NULL AND f."emporio_supplier_id" IS NULL
  AND EXISTS (SELECT 1 FROM "EmporioPurchase" p WHERE p."id" = f."related_id");

UPDATE "FinancialEntry" f
SET "emporio_customer_id" = CASE WHEN c."system_key" = 'consumidor_final' THEN (
    SELECT e."id" FROM "EmporioCustomer" e WHERE e."tenant_id" = f."tenant_id" AND e."system_key" = 'consumidor_final'
  ) ELSE c."id" END
FROM "Contact" c
WHERE c."id" = f."contact_id" AND f."related_module" = 'emporio'
  AND f."emporio_customer_id" IS NULL AND f."emporio_supplier_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "EmporioPurchase" p WHERE p."id" = f."related_id");

-- Trava: anular o contact_id de um lançamento que não ganhou cliente nem
-- fornecedor apagaria em silêncio a parte dele.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM "FinancialEntry"
  WHERE "related_module" = 'emporio' AND "contact_id" IS NOT NULL
    AND "emporio_customer_id" IS NULL AND "emporio_supplier_id" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Migracao abortada: % lancamento(s) do Emporio com contato ficariam sem cliente e sem fornecedor.', n;
  END IF;
END $$;

UPDATE "FinancialEntry"
SET "contact_id" = NULL
WHERE "related_module" = 'emporio' AND "contact_id" IS NOT NULL;

-- Trava: nenhuma venda ou compra pode perder o cliente ou o fornecedor que tinha.
DO $$
DECLARE vendas INTEGER; compras INTEGER;
BEGIN
  SELECT COUNT(*) INTO vendas FROM "EmporioSale" WHERE "contact_id" IS NOT NULL AND "customer_id" IS NULL;
  SELECT COUNT(*) INTO compras FROM "EmporioPurchase" WHERE "contact_id" IS NOT NULL AND "supplier_id" IS NULL;
  IF vendas > 0 OR compras > 0 THEN
    RAISE EXCEPTION 'Migracao abortada: % venda(s) sem cliente e % compra(s) sem fornecedor depois de repontar.', vendas, compras;
  END IF;
END $$;

-- 6. O cliente passa a ser obrigatório no orçamento e no cheque, e as colunas
-- contact_id saem das quatro tabelas (DDL do migrate diff).
-- DropForeignKey
ALTER TABLE "EmporioCheck" DROP CONSTRAINT "EmporioCheck_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "EmporioPurchase" DROP CONSTRAINT "EmporioPurchase_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "EmporioQuote" DROP CONSTRAINT "EmporioQuote_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "EmporioSale" DROP CONSTRAINT "EmporioSale_contact_id_fkey";

-- DropIndex
DROP INDEX "EmporioQuote_tenant_id_contact_id_idx";

-- DropIndex
DROP INDEX "EmporioSale_tenant_id_contact_id_idx";

-- AlterTable
ALTER TABLE "EmporioCheck" DROP COLUMN "contact_id",
ALTER COLUMN "customer_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "EmporioPurchase" DROP COLUMN "contact_id";

-- AlterTable
ALTER TABLE "EmporioQuote" DROP COLUMN "contact_id",
ALTER COLUMN "customer_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "EmporioSale" DROP COLUMN "contact_id";

-- 7. Saem de Contatos o contato de sistema e todo contato copiado nos passos
-- 2 e 3 (o id ficou o mesmo) que nada fora do Empório usa. Quem aponta para
-- Contact, conferido no schema.prisma: Negotiation, MilkMovement (buyer_id,
-- from_owner_id, to_owner_id), MilkCharge.owner_id, ServiceJob,
-- MachineMaintenance e FinancialEntry.contact_id (as quatro tabelas do Empório
-- já não apontam). Apagar um contato usado ali anularia o vínculo em silêncio
-- (SetNull) ou pararia a migração (Restrict).
--
-- O contato de sistema que a fazenda usou fica em Contatos como contato comum:
-- perde só o system_key, e o vínculo da fazenda continua de pé.
UPDATE "Contact" c
SET "system_key" = NULL
WHERE c."system_key" = 'consumidor_final'
  AND (
    EXISTS (SELECT 1 FROM "Negotiation" x WHERE x."contact_id" = c."id")
    OR EXISTS (
      SELECT 1 FROM "MilkMovement" x
      WHERE x."buyer_id" = c."id" OR x."from_owner_id" = c."id" OR x."to_owner_id" = c."id"
    )
    OR EXISTS (SELECT 1 FROM "MilkCharge" x WHERE x."owner_id" = c."id")
    OR EXISTS (SELECT 1 FROM "ServiceJob" x WHERE x."contact_id" = c."id")
    OR EXISTS (SELECT 1 FROM "MachineMaintenance" x WHERE x."contact_id" = c."id")
    OR EXISTS (SELECT 1 FROM "FinancialEntry" x WHERE x."contact_id" = c."id")
  );

DELETE FROM "Contact" c
WHERE (
    c."system_key" = 'consumidor_final'
    OR EXISTS (SELECT 1 FROM "EmporioCustomer" e WHERE e."id" = c."id")
    OR EXISTS (SELECT 1 FROM "EmporioSupplier" e WHERE e."id" = c."id")
  )
  AND NOT EXISTS (SELECT 1 FROM "Negotiation" x WHERE x."contact_id" = c."id")
  AND NOT EXISTS (
    SELECT 1 FROM "MilkMovement" x
    WHERE x."buyer_id" = c."id" OR x."from_owner_id" = c."id" OR x."to_owner_id" = c."id"
  )
  AND NOT EXISTS (SELECT 1 FROM "MilkCharge" x WHERE x."owner_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "ServiceJob" x WHERE x."contact_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "MachineMaintenance" x WHERE x."contact_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "FinancialEntry" x WHERE x."contact_id" = c."id");

-- Volta o limite de espera ao padrão da sessão.
RESET lock_timeout;
