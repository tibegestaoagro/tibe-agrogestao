SET lock_timeout = '5s';
-- A regra é a MESMA de telefoneLocal (src/lib/emporio/telefone.ts), passo a passo.
CREATE OR REPLACE FUNCTION telefone_local(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$
    SELECT NULLIF(CASE WHEN length(d2) IN (10, 11) THEN substr(d2, 3) ELSE d2 END, '')
    FROM (
      SELECT CASE WHEN length(d) IN (12, 13) AND left(d, 2) = '55' THEN substr(d, 3) ELSE d END AS d2
      FROM (SELECT ltrim(regexp_replace(texto, '[^0-9]', '', 'g'), '0') AS d) a
    ) b
  $$;
ALTER TABLE "EmporioCustomer" ADD COLUMN "phone_busca" TEXT GENERATED ALWAYS AS (telefone_local("phone")) STORED;
ALTER TABLE "EmporioSupplier" ADD COLUMN "phone_busca" TEXT GENERATED ALWAYS AS (telefone_local("phone")) STORED;
