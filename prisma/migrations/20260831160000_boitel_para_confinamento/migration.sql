-- Reclassifica os lancamentos de BOITEL ja gravados: "rebanho" -> "confinamento".
--
-- O §15 do documento do cliente e explicito de que a cobranca do boitel e custo
-- da area Confinamento, e boitel E confinamento em instalacao de terceiro. Ate
-- 31/08 o `COBRANCA.boitel` gravava `related_module: "rebanho"`, entao dois
-- lotes lado a lado na mesma tela caiam em buckets diferentes da DRE e o filtro
-- "Confinamento" mostrava metade das despesas.
--
-- O commit T20 corrigiu isso para lancamento NOVO e deixou a divisao historica
-- registrada como conhecida. Esta migracao fecha a divisao, por decisao do
-- usuario em 31/08.
--
-- O alvo: todo lancamento em "rebanho" cujo `related_id` e o id de uma estadia
-- de tipo `boitel`. Isso pega a cobranca da abertura E os estornos de
-- cancelamento, que carregam o mesmo `related_id`. `related_id` guarda um cuid,
-- e a unica coisa que nasce com o id de uma estadia e o dinheiro dela: nao ha
-- outro registro que possa casar por acidente.
--
-- SEM filtro de tenant, de proposito: migracao de dado corrige o banco inteiro.
-- O invariante 1 (tenant_id nunca vem do client) e sobre query de negocio pelo
-- client escopado, e nao sobre DDL/DML de migracao.
--
-- ⚠️ Depende de `20260831140000_confinamento`, que e quem cria o valor
-- `confinamento` no enum `RelatedModule`. A ordem por timestamp ja garante isso.

UPDATE "FinancialEntry"
SET related_module = 'confinamento'
WHERE related_module = 'rebanho'
  AND related_id IN (SELECT id FROM "HerdStay" WHERE type = 'boitel');
