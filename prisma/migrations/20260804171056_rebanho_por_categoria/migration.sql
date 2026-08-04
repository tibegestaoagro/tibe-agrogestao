-- Rebanho por categoria: consolida `Animal` e `AnimalBatch` num modelo único.
--
-- ESCRITA À MÃO de propósito. O SQL que `prisma migrate diff` gera para esta
-- mudança faz `DROP COLUMN animal_id` e `ADD COLUMN batch_id NOT NULL` nas 3
-- tabelas de histórico, o que apagaria todo o histórico e falharia em tabela
-- não vazia. A ordem abaixo preserva o dado: cria o destino, move, e só
-- então aperta as restrições.

-- 1. AnimalBatch ganha os campos que só existiam no animal individual.
ALTER TABLE "AnimalBatch" ADD COLUMN "ear_tag" TEXT;
ALTER TABLE "AnimalBatch" ADD COLUMN "breed" TEXT;
ALTER TABLE "AnimalBatch" ADD COLUMN "sex" "AnimalSex";
ALTER TABLE "AnimalBatch" ADD COLUMN "birth_date" TIMESTAMP(3);

-- Coluna temporária que guarda de qual Animal cada lote veio: é o que permite
-- reapontar o histórico depois. Removida no fim desta mesma migração.
ALTER TABLE "AnimalBatch" ADD COLUMN "_migration_animal_id" TEXT;

-- 2. Categoria "Não classificado", uma por tenant que tenha animais.
--    Não há como adivinhar a categoria de um animal já cadastrado; o produtor
--    reclassifica depois.
INSERT INTO "AnimalCategory" ("id", "tenant_id", "name", "active", "created_at")
SELECT
  'mig_uncat_' || t."id",
  t."id",
  'Não classificado',
  true,
  NOW()
FROM (SELECT DISTINCT "tenant_id" AS "id" FROM "Animal") t
WHERE NOT EXISTS (
  SELECT 1 FROM "AnimalCategory" c
  WHERE c."tenant_id" = t."id" AND c."name" = 'Não classificado'
);

-- 3. Cada Animal vira um lote de 1 cabeça, preservando brinco, raça, sexo,
--    nascimento e peso. Animal vendido ou morto vira quantidade 0: no modelo
--    novo é `quantity` que diz o que resta, e o motivo da baixa continua em
--    AnimalMovement.
INSERT INTO "AnimalBatch" (
  "id", "tenant_id", "property_id", "category_id", "quantity",
  "ear_tag", "breed", "sex", "birth_date", "average_weight",
  "acquisition_cost", "acquired_at", "created_at", "updated_at",
  "_migration_animal_id"
)
SELECT
  'mig_batch_' || a."id",
  a."tenant_id",
  a."property_id",
  COALESCE(
    (SELECT c."id" FROM "AnimalCategory" c
      WHERE c."tenant_id" = a."tenant_id" AND c."name" = 'Não classificado'
      LIMIT 1),
    'mig_uncat_' || a."tenant_id"
  ),
  CASE WHEN a."status" = 'active' THEN 1 ELSE 0 END,
  a."ear_tag",
  a."breed",
  a."sex",
  a."birth_date",
  a."current_weight",
  NULL,
  a."created_at",
  a."created_at",
  a."updated_at",
  a."id"
FROM "Animal" a;

-- 4. Histórico: coluna nova nulável, preenchida a partir do mapeamento, e só
--    depois marcada NOT NULL. Fazer o contrário quebraria em tabela não vazia.
ALTER TABLE "AnimalWeightLog" ADD COLUMN "batch_id" TEXT;
ALTER TABLE "AnimalVaccination" ADD COLUMN "batch_id" TEXT;
ALTER TABLE "AnimalMovement" ADD COLUMN "batch_id" TEXT;

UPDATE "AnimalWeightLog" w
SET "batch_id" = b."id"
FROM "AnimalBatch" b
WHERE b."_migration_animal_id" = w."animal_id";

UPDATE "AnimalVaccination" v
SET "batch_id" = b."id"
FROM "AnimalBatch" b
WHERE b."_migration_animal_id" = v."animal_id";

UPDATE "AnimalMovement" m
SET "batch_id" = b."id"
FROM "AnimalBatch" b
WHERE b."_migration_animal_id" = m."animal_id";

-- Rede de segurança: se alguma linha de histórico ficou órfã, a migração para
-- aqui em vez de apagar dado silenciosamente ao aplicar o NOT NULL.
DO $$
DECLARE orfas INTEGER;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM "AnimalWeightLog" WHERE "batch_id" IS NULL)
  + (SELECT COUNT(*) FROM "AnimalVaccination" WHERE "batch_id" IS NULL)
  + (SELECT COUNT(*) FROM "AnimalMovement" WHERE "batch_id" IS NULL)
  INTO orfas;
  IF orfas > 0 THEN
    RAISE EXCEPTION 'Migração abortada: % linha(s) de histórico sem lote correspondente', orfas;
  END IF;
END $$;

ALTER TABLE "AnimalWeightLog" ALTER COLUMN "batch_id" SET NOT NULL;
ALTER TABLE "AnimalVaccination" ALTER COLUMN "batch_id" SET NOT NULL;
ALTER TABLE "AnimalMovement" ALTER COLUMN "batch_id" SET NOT NULL;

-- 5. Troca as chaves estrangeiras e os índices para o lote.
ALTER TABLE "AnimalWeightLog" DROP CONSTRAINT "AnimalWeightLog_animal_id_fkey";
ALTER TABLE "AnimalVaccination" DROP CONSTRAINT "AnimalVaccination_animal_id_fkey";
ALTER TABLE "AnimalMovement" DROP CONSTRAINT "AnimalMovement_animal_id_fkey";

DROP INDEX "AnimalWeightLog_animal_id_idx";
DROP INDEX "AnimalVaccination_animal_id_idx";
DROP INDEX "AnimalMovement_animal_id_idx";

ALTER TABLE "AnimalWeightLog" DROP COLUMN "animal_id";
ALTER TABLE "AnimalVaccination" DROP COLUMN "animal_id";
ALTER TABLE "AnimalMovement" DROP COLUMN "animal_id";

CREATE INDEX "AnimalWeightLog_batch_id_idx" ON "AnimalWeightLog"("batch_id");
CREATE INDEX "AnimalVaccination_batch_id_idx" ON "AnimalVaccination"("batch_id");
CREATE INDEX "AnimalMovement_batch_id_idx" ON "AnimalMovement"("batch_id");

ALTER TABLE "AnimalWeightLog" ADD CONSTRAINT "AnimalWeightLog_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "AnimalBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnimalVaccination" ADD CONSTRAINT "AnimalVaccination_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "AnimalBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnimalMovement" ADD CONSTRAINT "AnimalMovement_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "AnimalBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Brinco único por tenant APENAS quando preenchido.
--    ⚠️ Índice parcial não é representável no schema.prisma: todo
--    `migrate diff` futuro vai sugerir apagá-lo como se fosse drift. NÃO
--    aceite esse DROP: ele derruba a garantia de brinco único em silêncio.
--    Mesma armadilha já documentada para WhatsAppProviderConfig_one_active.
CREATE UNIQUE INDEX "AnimalBatch_tenant_ear_tag_key"
  ON "AnimalBatch"("tenant_id", "ear_tag")
  WHERE "ear_tag" IS NOT NULL;

-- 7. Fim do modelo antigo.
ALTER TABLE "AnimalBatch" DROP COLUMN "_migration_animal_id";
DROP TABLE "Animal";
DROP TYPE "AnimalStatus";
