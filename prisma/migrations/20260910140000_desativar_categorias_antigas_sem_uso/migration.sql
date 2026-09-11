-- Fase 35.1, T06. As categorias padrao passaram de 11 para as 26 do §21, e as
-- antigas que nao tem equivalente novo ficariam lado a lado com elas: "Racao" e
-- "Alimentacao animal", "Combustivel" e "Combustiveis", "Outros" e "Outras
-- despesas". Esta migracao DESATIVA apenas as antigas que nenhum lancamento do
-- proprio tenant usa. Nada e apagado, e nenhuma que o produtor ja usou some da
-- lista: quem lancou "Racao" todo mes continua com ela.
--
-- Nao roda no provisionamento de propósito. La ela desfaria, a cada leitura, a
-- reativacao que o produtor tivesse feito na tela de Configuracoes.
--
-- "Mao de obra" nao entra: ela existe igual nas duas listas.
-- O LIKE cobre "Venda de lote - Nelore", que animal-batches.ts monta com o
-- nome da categoria como prefixo.

UPDATE "FinancialCategory" c
SET active = false
WHERE c.active = true
  AND (
    (c.entry_type = 'expense'
      AND c.name IN ('Ração', 'Combustível', 'Manutenção', 'Insumos', 'Veterinário', 'Outros'))
    OR (c.entry_type = 'income'
      AND c.name IN ('Venda de animal', 'Venda de lote', 'Faturamento de serviço', 'Outros'))
  )
  AND NOT EXISTS (
    SELECT 1 FROM "FinancialEntry" e
    WHERE e.tenant_id = c.tenant_id
      AND (e.category = c.name OR e.category LIKE c.name || ' - %')
  );
