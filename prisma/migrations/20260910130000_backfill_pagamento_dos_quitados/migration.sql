-- Backfill do pagamento parcial (Modulo 35, fase 1, T02).
--
-- A partir da fase 1, o valor pago de um lancamento e a SOMA dos
-- FinancialPayment dele. Sem esta migracao, todo lancamento quitado antes de
-- hoje passaria a ter pago zero, e o "Entrou" e o "Saiu" de todo mes anterior
-- mudariam de valor na tela.
--
-- O predicado e DETERMINISTICO, nao adivinha nada: quem esta 'paid' foi pago
-- inteiro, que e a unica coisa que o sistema sabia registrar ate aqui.
--
-- `paid_at IS NOT NULL` e guarda, nao filtro esperado: lancamento 'paid' sem
-- data de pagamento nao tem quando gravar, e chutar `created_at` seria
-- inventar a data em que o dinheiro do cliente saiu. Conferido em 2026-09-10
-- nos DOIS bancos antes de escrever isto: zero ocorrencias no local (260
-- pagos) e zero em producao (7 lancamentos). Se algum dia aparecer, a linha
-- fica de fora e a situacao derivada acusa "em aberto" num lancamento pago,
-- que e visivel e corrigivel; o contrario, uma data inventada, nao seria.
--
-- O id e derivado do lancamento ('bkf' || id), o que torna a migracao
-- idempotente por construcao e marca a origem da linha para sempre.
--
-- `method` fica nulo de proposito: a coluna nasceu vazia nesta mesma fase, e
-- nao existe registro de COMO cada conta antiga foi paga.
INSERT INTO "FinancialPayment" (id, tenant_id, entry_id, amount, paid_at, method, notes, created_at)
SELECT
  'bkf' || e.id,
  e.tenant_id,
  e.id,
  e.amount,
  e.paid_at,
  NULL,
  'Quitacao registrada antes do controle de pagamento parcial',
  NOW()
FROM "FinancialEntry" e
WHERE e.status = 'paid'
  AND e.paid_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "FinancialPayment" p WHERE p.entry_id = e.id
  );
