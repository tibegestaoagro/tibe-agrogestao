-- Livro-razao do rebanho (Modulo 30, fase 1).
-- Spec: docs/specs/module-30-rebanho-livro-razao.md
--
-- Escrita a mao porque o `migrate diff` so cria a tabela vazia: sem a
-- conversao dos lotes existentes em movimentacoes de saldo inicial, todo
-- rebanho ja cadastrado apareceria como zero depois do deploy.
--
-- A conversao e determinista e ABORTA se encontrar um lote que nao consegue
-- classificar, em vez de chutar uma categoria. Medido antes de escrever:
-- em producao ha 2 lotes (sexo conhecido, nascimento nao) e no banco de dev
-- 263 (260 com sexo E nascimento, 3 so com o nome antigo). Nenhum cai no
-- caso de aborto, mas a guarda fica para dado que eu nao vi.

-- CreateEnum
CREATE TYPE "HerdSituation" AS ENUM ('presente', 'evento', 'pasto_terceiro', 'boitel', 'confinamento', 'desaparecido');

-- CreateEnum
CREATE TYPE "HerdOwner" AS ENUM ('proprio', 'terceiro');

-- CreateEnum
CREATE TYPE "HerdMovementType" AS ENUM ('saldo_inicial', 'nascimento', 'compra', 'venda', 'morte', 'transferencia_pasto', 'transferencia_fazenda', 'mudanca_categoria', 'ajuste');

-- CreateTable
CREATE TABLE "HerdMovement" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "movement_type" "HerdMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "from_category_id" TEXT,
    "from_property_id" TEXT,
    "from_pasture_id" TEXT,
    "from_situation" "HerdSituation",
    "from_owner" "HerdOwner",
    "to_category_id" TEXT,
    "to_property_id" TEXT,
    "to_pasture_id" TEXT,
    "to_situation" "HerdSituation",
    "to_owner" "HerdOwner",
    "value" DECIMAL(14,2),
    "financial_entry_id" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "recorded_by_user_id" TEXT,
    "batch_id" TEXT,
    "canceled_at" TIMESTAMP(3),
    "canceled_reason" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HerdMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HerdMovement_tenant_id_idx" ON "HerdMovement"("tenant_id");

-- CreateIndex
CREATE INDEX "HerdMovement_tenant_id_occurred_at_idx" ON "HerdMovement"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "HerdMovement_batch_id_idx" ON "HerdMovement"("batch_id");

-- AddForeignKey
ALTER TABLE "HerdMovement" ADD CONSTRAINT "HerdMovement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HerdMovement" ADD CONSTRAINT "HerdMovement_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "AnimalBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HerdMovement" ADD CONSTRAINT "HerdMovement_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- Conversao do rebanho existente
--
-- Cada lote com saldo vira UMA movimentacao de saldo inicial, entrando na
-- posicao (categoria, fazenda, sem pasto, presente, proprio).
--
-- A categoria e resolvida em tres degraus, do mais confiavel para o menos:
--   1. sexo + nascimento: a idade em meses da a faixa exata;
--   2. o nome antigo da categoria, pela mesma tabela de apelidos do §14;
--   3. so o sexo: cai na categoria adulta daquele sexo, porque a idade e
--      desconhecida e supor "jovem" mudaria o valor do rebanho para menos.
--
-- O degrau 2 usa 'femea_13_24' para "Novilha" e 'macho_13_24' para "Garrote":
-- os dois termos servem a mais de uma faixa, e a do meio e a menos errada
-- quando nao ha nada para desempatar. Fica registrado em `notes` para o
-- produtor corrigir com uma mudanca de categoria.

INSERT INTO "HerdMovement" (
  "id", "tenant_id", "movement_type", "quantity",
  "to_category_id", "to_property_id", "to_situation", "to_owner",
  "batch_id", "notes", "occurred_at", "created_at"
)
SELECT
  'mig_' || b."id",
  b."tenant_id",
  'saldo_inicial'::"HerdMovementType",
  b."quantity",
  CASE
    -- 1. sexo + nascimento: faixa exata pela idade em meses
    WHEN b."sex" IS NOT NULL AND b."birth_date" IS NOT NULL THEN
      CASE
        WHEN b."sex" = 'male' THEN
          CASE
            WHEN (EXTRACT(YEAR FROM AGE(b."birth_date")) * 12 + EXTRACT(MONTH FROM AGE(b."birth_date"))) <= 7 THEN 'bezerro_0_7'
            WHEN (EXTRACT(YEAR FROM AGE(b."birth_date")) * 12 + EXTRACT(MONTH FROM AGE(b."birth_date"))) <= 12 THEN 'macho_8_12'
            WHEN (EXTRACT(YEAR FROM AGE(b."birth_date")) * 12 + EXTRACT(MONTH FROM AGE(b."birth_date"))) <= 24 THEN 'macho_13_24'
            WHEN (EXTRACT(YEAR FROM AGE(b."birth_date")) * 12 + EXTRACT(MONTH FROM AGE(b."birth_date"))) <= 36 THEN 'macho_25_36'
            ELSE 'macho_36_mais'
          END
        ELSE
          CASE
            WHEN (EXTRACT(YEAR FROM AGE(b."birth_date")) * 12 + EXTRACT(MONTH FROM AGE(b."birth_date"))) <= 7 THEN 'bezerra_0_7'
            WHEN (EXTRACT(YEAR FROM AGE(b."birth_date")) * 12 + EXTRACT(MONTH FROM AGE(b."birth_date"))) <= 12 THEN 'femea_8_12'
            WHEN (EXTRACT(YEAR FROM AGE(b."birth_date")) * 12 + EXTRACT(MONTH FROM AGE(b."birth_date"))) <= 24 THEN 'femea_13_24'
            WHEN (EXTRACT(YEAR FROM AGE(b."birth_date")) * 12 + EXTRACT(MONTH FROM AGE(b."birth_date"))) <= 36 THEN 'femea_25_36'
            ELSE 'femea_36_mais'
          END
      END
    -- 2. nome antigo da categoria
    WHEN lower(c."name") = 'bezerro' THEN 'bezerro_0_7'
    WHEN lower(c."name") = 'bezerra' THEN 'bezerra_0_7'
    WHEN lower(c."name") = 'novilha' THEN 'femea_13_24'
    WHEN lower(c."name") = 'garrote' THEN 'macho_13_24'
    WHEN lower(c."name") = 'vaca'    THEN 'femea_36_mais'
    WHEN lower(c."name") = 'boi'     THEN 'macho_36_mais'
    WHEN lower(c."name") = 'touro'   THEN 'tourinho_reprodutor'
    -- 3. so o sexo
    WHEN b."sex" = 'male'   THEN 'macho_36_mais'
    WHEN b."sex" = 'female' THEN 'femea_36_mais'
    ELSE NULL
  END,
  b."property_id",
  'presente'::"HerdSituation",
  'proprio'::"HerdOwner",
  b."id",
  'Saldo convertido do cadastro anterior (categoria "' || c."name" || '").'
    || CASE
         WHEN b."sex" IS NOT NULL AND b."birth_date" IS NOT NULL THEN ' Faixa calculada pela idade.'
         WHEN lower(c."name") IN ('novilha', 'garrote') THEN ' O termo serve a mais de uma faixa: confira e ajuste se precisar.'
         WHEN b."sex" IS NOT NULL THEN ' Idade nao informada: classificado como adulto, confira e ajuste se precisar.'
         ELSE ''
       END,
  COALESCE(b."acquired_at", b."created_at"),
  CURRENT_TIMESTAMP
FROM "AnimalBatch" b
JOIN "AnimalCategory" c ON c."id" = b."category_id"
WHERE b."quantity" > 0;

-- Guarda: se algum lote com saldo nao recebeu categoria, a migracao inteira
-- volta atras. Melhor falhar aqui do que deixar rebanho invisivel no saldo.
DO $$
DECLARE
  sem_categoria INTEGER;
  convertidos INTEGER;
  cabecas_antes INTEGER;
  cabecas_depois INTEGER;
BEGIN
  SELECT COUNT(*) INTO sem_categoria FROM "HerdMovement" WHERE "to_category_id" IS NULL;
  IF sem_categoria > 0 THEN
    RAISE EXCEPTION 'Migracao abortada: % lote(s) sem categoria correspondente. Classifique antes de migrar.', sem_categoria;
  END IF;

  SELECT COUNT(*) INTO convertidos FROM "HerdMovement" WHERE "movement_type" = 'saldo_inicial';
  SELECT COALESCE(SUM("quantity"), 0) INTO cabecas_antes FROM "AnimalBatch" WHERE "quantity" > 0;
  SELECT COALESCE(SUM("quantity"), 0) INTO cabecas_depois FROM "HerdMovement" WHERE "movement_type" = 'saldo_inicial';

  IF cabecas_antes <> cabecas_depois THEN
    RAISE EXCEPTION 'Migracao abortada: % cabecas antes, % depois. Nenhuma pode se perder.', cabecas_antes, cabecas_depois;
  END IF;

  RAISE NOTICE 'Livro-razao: % lote(s) convertidos, % cabecas preservadas.', convertidos, cabecas_depois;
END $$;
