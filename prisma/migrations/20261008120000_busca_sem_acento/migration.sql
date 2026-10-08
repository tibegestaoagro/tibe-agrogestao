-- Dívida 5.0: casar "Ze Carlos" com "Zé Carlos" no banco, sem ler a tabela
-- inteira para a memória. `unaccent()` é STABLE (o dicionário pode mudar), e
-- coluna gerada exige função IMMUTABLE: o envoltório fixa o dicionário pelo
-- nome qualificado, que é o contorno documentado do próprio Postgres.
-- A regra é a mesma de `normalizarTermo` (whatsapp-handlers/shared.ts):
-- minúscula, sem acento, espaço repetido vira um só, sem espaço nas pontas.
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION nome_de_busca(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT btrim(regexp_replace(lower(public.unaccent('public.unaccent'::regdictionary, texto)), '\s+', ' ', 'g')) $$;

-- Colunas GERADAS: o Prisma não as representa, e o `schema.prisma` declara
-- as duas como `String?` comum. Ninguém escreve nelas; o banco recusaria.
ALTER TABLE "Contact" ADD COLUMN "name_busca" TEXT GENERATED ALWAYS AS (nome_de_busca("name")) STORED;
ALTER TABLE "ServiceClient" ADD COLUMN "name_busca" TEXT GENERATED ALWAYS AS (nome_de_busca("name")) STORED;
