-- Dívida 5.0: casar "Ze Carlos" com "Zé Carlos" no banco, sem ler a tabela
-- inteira para a memória.
--
-- A regra é a MESMA de `normalizarTermo` (whatsapp-handlers/shared.ts) e de
-- `semAcento` (service-orders.ts), passo a passo: minúscula, decomposição NFD,
-- remoção dos caracteres combinantes U+0300 a U+036F, espaço repetido vira um
-- só, sem espaço nas pontas. Não usa a extensão `unaccent` de propósito: ela
-- translitera mais do que o JS ("Ł" vira "l", "Æ" vira "ae"), e a busca deixaria
-- de casar o nome escrito igualzinho ao cadastro. Tudo aqui é IMMUTABLE, o que
-- a coluna gerada exige.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION nome_de_busca(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT btrim(regexp_replace(regexp_replace(normalize(lower(texto), NFD), '[̀-ͯ]', '', 'g'), '\s+', ' ', 'g')) $$;

-- Colunas GERADAS: o Prisma não as representa, e o `schema.prisma` declara
-- as duas com `@default(dbgenerated(...))` para o `migrate diff` não pedir um
-- DROP DEFAULT. Ninguém escreve nelas; o banco recusaria.
-- Em 08/10 o Neon tinha 6 contatos e 1 cliente de serviço: a reescrita da
-- tabela que o ADD COLUMN ... STORED faz é instantânea.
ALTER TABLE "Contact" ADD COLUMN "name_busca" TEXT GENERATED ALWAYS AS (nome_de_busca("name")) STORED;
ALTER TABLE "ServiceClient" ADD COLUMN "name_busca" TEXT GENERATED ALWAYS AS (nome_de_busca("name")) STORED;
