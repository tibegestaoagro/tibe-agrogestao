-- Divida 2.11: o historico financeiro sem fazenda some do filtro por fazenda.
--
-- `FinancialEntry.property_id` nasceu na fase 35.1 (10/09/2026) sem backfill.
-- Esta migracao preenche SO onde a origem do lancamento sabe a fazenda com
-- certeza, seguindo o `related_id` (ou o `negotiation_id`) ate o registro de
-- origem. Onde a origem nao sabe, fica NULO: adivinhacao em dinheiro de
-- cliente e a pior classe de migracao.
--
-- Medido antes de escrever, em 14/09/2026:
--   producao: 7 lancamentos sem fazenda. 3 de negociacao (preenchidos aqui)
--             e 4 de ordem de servico de prestador (ficam nulos: a ordem do
--             prestador nao tem fazenda nenhuma).
--   dev:      274, de lote de animal, ciclo de lavoura, maquina, estadia e
--             ordem de servico.
--
-- Todo UPDATE:
--   * so toca `property_id IS NULL`, entao rodar de novo nao muda nada;
--   * casa pelo id da origem E pelo mesmo tenant, entao um lancamento nunca
--     recebe fazenda de outro tenant;
--   * exige o `related_module` da origem, para um id nao ser lido como se
--     fosse de outra tabela.
--
-- FICAM NULOS, de proposito:
--   * `servico` apontando para `ServiceOrder`: ordem do prestador, sem fazenda;
--   * `geral`: lancamento avulso, cuja origem e o proprio produtor;
--   * movimentacao de rebanho sem negociacao: tem fazenda de origem E de
--     destino, e escolher uma seria chute.

-- 1. Negociacao: a fazenda da negociacao e obrigatoria, a fonte mais segura.
UPDATE "FinancialEntry" fe
   SET property_id = n.property_id
  FROM "Negotiation" n
 WHERE fe.property_id IS NULL
   AND fe.negotiation_id = n.id
   AND fe.tenant_id = n.tenant_id;

-- 2. Rebanho, modelo antigo: o lote do animal.
UPDATE "FinancialEntry" fe
   SET property_id = b.property_id
  FROM "AnimalBatch" b
 WHERE fe.property_id IS NULL
   AND fe.related_module = 'rebanho'
   AND fe.related_id = b.id
   AND fe.tenant_id = b.tenant_id;

-- 3. Lavoura: o ciclo aponta para o talhao, e o talhao para a fazenda.
UPDATE "FinancialEntry" fe
   SET property_id = p.property_id
  FROM "CropCycle" c
  JOIN "Plot" p ON p.id = c.plot_id
 WHERE fe.property_id IS NULL
   AND fe.related_module = 'lavoura'
   AND fe.related_id = c.id
   AND fe.tenant_id = c.tenant_id;

-- 4a. Maquinas: a compra da maquina aponta para a propria maquina.
UPDATE "FinancialEntry" fe
   SET property_id = m.property_id
  FROM "Machine" m
 WHERE fe.property_id IS NULL
   AND fe.related_module = 'maquinas'
   AND fe.related_id = m.id
   AND fe.tenant_id = m.tenant_id;

-- 4b. Maquinas: a manutencao aponta para a manutencao, e ela para a maquina.
UPDATE "FinancialEntry" fe
   SET property_id = m.property_id
  FROM "MachineMaintenance" mm
  JOIN "Machine" m ON m.id = mm.machine_id
 WHERE fe.property_id IS NULL
   AND fe.related_module = 'maquinas'
   AND fe.related_id = mm.id
   AND fe.tenant_id = mm.tenant_id;

-- 5. Confinamento: a estadia do lote.
UPDATE "FinancialEntry" fe
   SET property_id = s.property_id
  FROM "HerdStay" s
 WHERE fe.property_id IS NULL
   AND fe.related_module = 'confinamento'
   AND fe.related_id = s.id
   AND fe.tenant_id = s.tenant_id;

-- 6. Servico com maquina: o ServiceJob tem fazenda. A ordem do prestador
--    (ServiceOrder) nao casa aqui e continua nula.
UPDATE "FinancialEntry" fe
   SET property_id = j.property_id
  FROM "ServiceJob" j
 WHERE fe.property_id IS NULL
   AND fe.related_module = 'servico'
   AND fe.related_id = j.id
   AND fe.tenant_id = j.tenant_id;

-- 7. Mao de obra: o trabalhador, SO quando ele tem fazenda cadastrada.
UPDATE "FinancialEntry" fe
   SET property_id = w.property_id
  FROM "Worker" w
 WHERE fe.property_id IS NULL
   AND fe.related_module = 'mao_de_obra'
   AND fe.related_id = w.id
   AND fe.tenant_id = w.tenant_id
   AND w.property_id IS NOT NULL;
