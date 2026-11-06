-- Cenário de ensaio da migração dos clientes e fornecedores do Empório
-- (Frente 1, Task 6). Monta, no FORMATO ANTIGO (o cliente e o fornecedor em
-- Contact, ligados por contact_id), uma conta com cada caso que a migração
-- precisa tratar. Só para a cópia da produção no Docker (banco tibe_ensaio),
-- ANTES das duas migrações da Frente 1:
--
--   docker exec -i tibe-pg psql -U tibe -d tibe_ensaio < scripts/sql/ensaio-clientes-emporio.sql
--
-- Depois, `npx tsx scripts/conferir-clientes-emporio.ts depois --ensaio` confere
-- caso por caso pelos ids fixos (prefixo ensaio_cli_). O que cada contato prova:
--   Consumidor final  contato de sistema com venda em dinheiro: vira o Consumidor
--                     final da tabela nova e sai de Contatos
--   Ensaio Fiado      PF com venda fiada (lançamento pendente com contact_id),
--                     orçamento e cheque: vira cliente, o fiado aponta para ele
--   Ensaio Fornecedor PJ com compra a prazo e conta a pagar com contact_id:
--                     vira fornecedor, a conta aponta para ele
--   Ensaio Ambos      uma venda e uma compra: vira cliente E fornecedor
--   Ensaio Fazenda    uma venda e um lançamento geral com contact_id: vira
--                     cliente e FICA em Contatos
--   Ensaio Balcão     só a linha cliente.cadastrar no Histórico: vira cliente
--   Ensaio Contatos   sem uso nenhum: fica em Contatos, e só lá

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO "Tenant" (id, name, document, plan, status, updated_at, conta_interna)
VALUES ('ensaio_cli_conta', 'Ensaio Clientes Empório', 'ENSAIO-CLI-0001', 'grupo', 'active', now(), true);

INSERT INTO "TenantProfile" (id, tenant_id, profile_type) VALUES
  ('ensaio_cli_perfil_fazenda', 'ensaio_cli_conta', 'fazenda'),
  ('ensaio_cli_perfil_emporio', 'ensaio_cli_conta', 'emporio');

INSERT INTO "TenantFeature" (id, tenant_id, feature_key, enabled, updated_at)
VALUES ('ensaio_cli_recurso_emporio', 'ensaio_cli_conta', 'emporio', true, now());

-- Dono da conta, para a sessão do Step 7 (sem senha: o hash não corresponde a nenhuma).
INSERT INTO "User" (id, tenant_id, name, email, password_hash, role)
VALUES ('ensaio_cli_dono', 'ensaio_cli_conta', 'Dono do Ensaio', 'ensaio.clientes@ensaio.invalid', 'sem-senha-ensaio', 'OWNER');

INSERT INTO "Establishment" (id, tenant_id, name, kind, updated_at)
VALUES ('ensaio_cli_loja', 'ensaio_cli_conta', 'Loja do Ensaio', 'ponto_venda', now());

-- O caixa da loja, para receber o fiado em dinheiro na conferência de tela.
INSERT INTO "CashRegister" (id, tenant_id, establishment_id, number)
VALUES ('ensaio_cli_caixa', 'ensaio_cli_conta', 'ensaio_cli_loja', 1);

INSERT INTO "Contact" (id, tenant_id, name, system_key, person_kind) VALUES
  ('ensaio_cli_cf',         'ensaio_cli_conta', 'Consumidor final',  'consumidor_final', NULL),
  ('ensaio_cli_fiado',      'ensaio_cli_conta', 'Ensaio Fiado',      NULL, 'pf'),
  ('ensaio_cli_fornecedor', 'ensaio_cli_conta', 'Ensaio Fornecedor', NULL, 'pj'),
  ('ensaio_cli_ambos',      'ensaio_cli_conta', 'Ensaio Ambos',      NULL, NULL),
  ('ensaio_cli_fazenda',    'ensaio_cli_conta', 'Ensaio Fazenda',    NULL, NULL),
  ('ensaio_cli_balcao',     'ensaio_cli_conta', 'Ensaio Balcão',     NULL, NULL),
  ('ensaio_cli_contatos',   'ensaio_cli_conta', 'Ensaio Contatos',   NULL, NULL);

-- Vendas
INSERT INTO "EmporioSale" (id, tenant_id, establishment_id, operation_key, number, contact_id, sold_at, sold_by_user_id, net_amount, updated_at) VALUES
  ('ensaio_cli_venda_cf',      'ensaio_cli_conta', 'ensaio_cli_loja', 'ensaio_cli_op_venda_cf',      1, 'ensaio_cli_cf',      now() - interval '3 days', 'ensaio_cli_dono', 10.00, now()),
  ('ensaio_cli_venda_fiado',   'ensaio_cli_conta', 'ensaio_cli_loja', 'ensaio_cli_op_venda_fiado',   2, 'ensaio_cli_fiado',   now() - interval '3 days', 'ensaio_cli_dono', 50.00, now()),
  ('ensaio_cli_venda_cheque',  'ensaio_cli_conta', 'ensaio_cli_loja', 'ensaio_cli_op_venda_cheque',  3, 'ensaio_cli_fiado',   now() - interval '2 days', 'ensaio_cli_dono', 30.00, now()),
  ('ensaio_cli_venda_ambos',   'ensaio_cli_conta', 'ensaio_cli_loja', 'ensaio_cli_op_venda_ambos',   4, 'ensaio_cli_ambos',   now() - interval '2 days', 'ensaio_cli_dono', 15.00, now()),
  ('ensaio_cli_venda_fazenda', 'ensaio_cli_conta', 'ensaio_cli_loja', 'ensaio_cli_op_venda_fazenda', 5, 'ensaio_cli_fazenda', now() - interval '1 day',  'ensaio_cli_dono', 12.00, now());

INSERT INTO "EmporioSalePayment" (id, tenant_id, sale_id, kind, amount) VALUES
  ('ensaio_cli_pag_cf',      'ensaio_cli_conta', 'ensaio_cli_venda_cf',      'dinheiro', 10.00),
  ('ensaio_cli_pag_fiado',   'ensaio_cli_conta', 'ensaio_cli_venda_fiado',   'fiado',    50.00),
  ('ensaio_cli_pag_cheque',  'ensaio_cli_conta', 'ensaio_cli_venda_cheque',  'cheque',   30.00),
  ('ensaio_cli_pag_ambos',   'ensaio_cli_conta', 'ensaio_cli_venda_ambos',   'dinheiro', 15.00),
  ('ensaio_cli_pag_fazenda', 'ensaio_cli_conta', 'ensaio_cli_venda_fazenda', 'dinheiro', 12.00);

INSERT INTO "EmporioCheck" (id, tenant_id, sale_id, sale_payment_id, contact_id, establishment_id, number, bank, good_for, amount, updated_at)
VALUES ('ensaio_cli_cheque', 'ensaio_cli_conta', 'ensaio_cli_venda_cheque', 'ensaio_cli_pag_cheque', 'ensaio_cli_fiado', 'ensaio_cli_loja', '000123', 'Banco do Ensaio', current_date + 20, 30.00, now());

INSERT INTO "EmporioQuote" (id, tenant_id, establishment_id, operation_key, number, contact_id, seller_user_id, created_by_user_id, valid_until, net_amount, updated_at)
VALUES ('ensaio_cli_orcamento', 'ensaio_cli_conta', 'ensaio_cli_loja', 'ensaio_cli_op_orcamento', 1, 'ensaio_cli_fiado', 'ensaio_cli_dono', 'ensaio_cli_dono', current_date + 7, 20.00, now());

-- Compras
INSERT INTO "EmporioPurchase" (id, tenant_id, establishment_id, contact_id, operation_key, purchased_at, payment_kind, created_by_user_id, updated_at) VALUES
  ('ensaio_cli_compra_fornecedor', 'ensaio_cli_conta', 'ensaio_cli_loja', 'ensaio_cli_fornecedor', 'ensaio_cli_op_compra_fornecedor', now() - interval '4 days', 'a_prazo', 'ensaio_cli_dono', now()),
  ('ensaio_cli_compra_ambos',      'ensaio_cli_conta', 'ensaio_cli_loja', 'ensaio_cli_ambos',      'ensaio_cli_op_compra_ambos',      now() - interval '4 days', 'a_vista', 'ensaio_cli_dono', now());

-- Lançamentos: os do Empório com contact_id (formato antigo) e um geral da fazenda.
INSERT INTO "FinancialEntry" (id, tenant_id, entry_type, category, amount, related_module, related_id, due_date, paid_at, status, contact_id, establishment_id, payment_method) VALUES
  ('ensaio_cli_lanc_venda_cf',      'ensaio_cli_conta', 'income',  'Vendas do Empório',        10.00, 'emporio', 'ensaio_cli_venda_cf',          NULL,                      now() - interval '3 days', 'paid',    'ensaio_cli_cf',         'ensaio_cli_loja', NULL),
  ('ensaio_cli_lanc_fiado',         'ensaio_cli_conta', 'income',  'Vendas do Empório',        50.00, 'emporio', 'ensaio_cli_venda_fiado',       now() - interval '2 days',  NULL,                    'pending', 'ensaio_cli_fiado',      'ensaio_cli_loja', NULL),
  ('ensaio_cli_lanc_venda_cheque',  'ensaio_cli_conta', 'income',  'Vendas do Empório',        30.00, 'emporio', 'ensaio_cli_venda_cheque',      NULL,                      now() - interval '2 days', 'paid',    'ensaio_cli_fiado',      'ensaio_cli_loja', NULL),
  ('ensaio_cli_lanc_venda_ambos',   'ensaio_cli_conta', 'income',  'Vendas do Empório',        15.00, 'emporio', 'ensaio_cli_venda_ambos',       NULL,                      now() - interval '2 days', 'paid',    'ensaio_cli_ambos',      'ensaio_cli_loja', NULL),
  ('ensaio_cli_lanc_venda_fazenda', 'ensaio_cli_conta', 'income',  'Vendas do Empório',        12.00, 'emporio', 'ensaio_cli_venda_fazenda',     NULL,                      now() - interval '1 day',  'paid',    'ensaio_cli_fazenda',    'ensaio_cli_loja', NULL),
  ('ensaio_cli_lanc_pagar',         'ensaio_cli_conta', 'expense', 'Mercadorias para revenda', 80.00, 'emporio', 'ensaio_cli_compra_fornecedor', now() + interval '5 days',  NULL,                    'pending', 'ensaio_cli_fornecedor', 'ensaio_cli_loja', NULL),
  ('ensaio_cli_lanc_compra_ambos',  'ensaio_cli_conta', 'expense', 'Mercadorias para revenda', 25.00, 'emporio', 'ensaio_cli_compra_ambos',      NULL,                      now() - interval '4 days', 'paid',    'ensaio_cli_ambos',      'ensaio_cli_loja', NULL),
  ('ensaio_cli_lanc_geral',         'ensaio_cli_conta', 'income',  'Venda de produção',        40.00, 'geral',   NULL,                           NULL,                      now() - interval '5 days', 'paid',    'ensaio_cli_fazenda',    NULL,              NULL);

-- O balcão que só cadastrou (sem venda): a linha do Histórico no formato antigo.
INSERT INTO "EmporioAuditLog" (id, tenant_id, user_id, establishment_id, action, target_type, target_id, summary)
VALUES ('ensaio_cli_hist_balcao', 'ensaio_cli_conta', 'ensaio_cli_dono', 'ensaio_cli_loja', 'cliente.cadastrar', 'contato', 'ensaio_cli_balcao', 'Cadastrou o cliente Ensaio Balcão');

COMMIT;
