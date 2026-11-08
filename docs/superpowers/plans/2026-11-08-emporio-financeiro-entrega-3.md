# Financeiro do Empório, entrega 3: acordo, alçada e carimbo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o Financeiro e o Dono fecham acordo de fiado em parcelas sem juros (as origens saem da cobrança, o total a receber não muda, a parcela vence e bloqueia); o pagamento acima de um teto vira pedido que o Dono ou o Gerente geral aprova na tela, com aviso pelo WhatsApp do Tibé; as linhas do extrato da conta bancária ganham o carimbo de conciliação.

**Architecture:** três frentes independentes nas actions, uma migração só. O acordo vive em `src/lib/actions/emporio-acordos.ts`: as parcelas são `FinancialEntry` income pendentes com categoria própria, que entram em `entradasAbertas` (e por isso no devido, no vencido, no bloqueio, na cobrança e no recebimento sem código novo); as origens são fechadas com `status: cancelled` e a coluna `agreement_id`. A alçada vive em `src/lib/actions/emporio-aprovacoes.ts` e numa bifurcação dentro de `pagarDespesasAction`: o pagamento que passa do teto grava um `EmporioPaymentRequest` em vez de pagar, e aprovar reexecuta o mesmo pagamento. O carimbo são duas colunas em `CashMovement` e `CardReceivable`, duas actions em `emporio-financeiro.ts` e a linha do extrato com o carimbo.

**Tech Stack:** Next.js 16, Prisma 7 (Postgres), Zod 4, kit de UI próprio (`FormSheet`, `Field`, `MoneyInput`, `useErrosDeFormulario`, `Badge`, `Table`), `notify` (`src/lib/notify`), suíte `tsx` em `scripts/`, roteiro de navegador em Python.

**Spec:** `docs/superpowers/specs/2026-11-07-emporio-financeiro-design.md`, seção "Entrega 3: acordo, alçada e carimbo" (Q226, Q227, Q230, Q233, Q234; Q218 para o "sem juros"), mais "Como entregar" (casos da entrega 3) e "O que fica com o builder" (o mecanismo das entries de origem). A entrega 2 está na branch `emporio-financeiro-2`; esta nasce em `emporio-financeiro-3`, sobre ela.

## Global Constraints

- Sem travessão (U+2014) em código, doc, commit ou texto de tela.
- `tenant_id` nunca vem do client; toda query pelo client escopado; model novo com `tenant_id` entra em `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts`).
- Saldo nunca gravado: o devido do cliente, o andamento do acordo e o total sem carimbo são somas calculadas na leitura. O acordo guarda só o que foi combinado (as parcelas e o total combinado), nunca "quanto falta".
- Regra de negócio em `src/lib/actions/*`; rota é wrapper fino com Zod via `apiErroDeZod` e `respostaDaAction`.
- Toda recusa com `fail(code, mensagem em português, status, field)`, e o `field` é o nome do campo da API que a tela usa no `ORDEM`.
- Toda action de escrita do Empório chama `registrarNoHistorico` com chave de `ACOES_DO_HISTORICO` (conferência 19).
- Dinheiro em centavos inteiros no servidor (`Math.round(x * 100)`), em reais no contrato, no formato brasileiro na tela; nunca `<input type="number">`.
- "Hoje" é o dia de São Paulo (`hojeEmBrasilia()`); datas de vencimento se comparam por dia.
- Suítes e cenários só com `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public"` inline. Subagente não commita.
- Nomes fixados por este plano: models `EmporioCreditAgreement` e `EmporioPaymentRequest`; colunas `FinancialEntry.agreement_id`, `EmporioSettings.payment_approval_limit`, `CashMovement.reconciled_at` / `reconciled_by_user_id`, `CardReceivable.reconciled_at` / `reconciled_by_user_id`; categoria `CATEGORIA_ACORDO = "Acordo de fiado"`; ação de papel `acordo` (dono e financeiro); códigos `ACORDO_SEM_ORIGEM`, `PARCELAS_NAO_BATEM`, `VENDA_EM_ACORDO`, `CONTA_EM_APROVACAO`, `PEDIDO_NAO_PENDENTE`, `LINHA_NAO_E_DE_CONTA`, `JA_CARIMBADO`, `SEM_CARIMBO`; chaves do Histórico `fiado.acordo`, `pagamento.pedir`, `pagamento.aprovar`, `pagamento.recusar`, `conciliacao.carimbar`, `conciliacao.descarimbar`; suíte `test:m100`; roteiro `emporio-financeiro-acordo`; migração `20261108180000_emporio_financeiro_acordo_alcada_carimbo`.

## Review Focus

1. Acordo sobre um fiado parcialmente recebido: a origem com `amount` 100 e 30 recebidos entra no acordo por 70, e a soma das parcelas tem de ser 70, não 100. Teste na Task 3 ("origem com recebimento parcial entra pelo aberto").
2. Devolução com abatimento no fiado de uma venda cuja entry está em acordo: abate na parcela mais antiga em aberto, e o excedente que passa do que resta no acordo cai na regra de "devolva em dinheiro". Teste na Task 3.
3. Aprovação quando o saldo do lugar não cobre: o pedido continua `pendente`, guarda o motivo da falha, nada é pago, nenhum `CashMovement` nasce. Teste na Task 4 ("aprovar sem saldo falha e mantém o pedido").
4. Pedido pendente trava a conta nos quatro caminhos: pagar (com ou sem alçada), cancelar, adiar e corrigir recusam com `CONTA_EM_APROVACAO`. Teste na Task 4 (um check por caminho).
5. Carimbo em movimento de gaveta ou de gerência (sem `bank_account_id`) é recusado com `LINHA_NAO_E_DE_CONTA`, e o carimbo de uma conta não aparece na outra. Teste na Task 5.

---

## Mapa de arquivos

| arquivo | responsabilidade | tarefa |
|---|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261108180000_emporio_financeiro_acordo_alcada_carimbo/migration.sql` | models e colunas novas | T1 |
| `src/lib/prisma.ts` | `TENANT_SCOPED_MODELS` ganha os dois models | T1 |
| `src/lib/emporio/papel.ts` | ação `acordo` (dono e financeiro) | T1 |
| `src/lib/emporio/historico.ts` | seis chaves novas; `linkDoAlvo` para `conta` (extrato) e `pedido_pagamento` | T1 |
| `src/lib/emporio/acordo.ts` (novo) | funções puras: dividir um total em parcelas iguais (centavo na primeira), validar a lista | T1 |
| `scripts/m100-emporio-financeiro-acordo.test.ts`, `package.json` | suíte da entrega, escrita da spec | T2 |
| `src/lib/actions/emporio-acordos.ts` (novo) | `fazerAcordoAction`, `listarAcordosDoClienteAction` | T3 |
| `src/lib/actions/emporio-caixa.ts` | `entradasAbertas` aceita as parcelas; `receberFiadoAction` recebe parcela | T3 |
| `src/lib/actions/emporio-vendas.ts` | `devolverAction` abate na parcela; `cancelarVendaAction` recusa venda em acordo | T3 |
| `src/app/api/v1/emporio/customers/[id]/agreements/route.ts` (novo) | GET lista, POST faz | T3 |
| `src/lib/actions/emporio-aprovacoes.ts` (novo) | `listarPedidosDePagamentoAction`, `aprovarPedidoDePagamentoAction`, `recusarPedidoDePagamentoAction`, `salvarAlcadaAction`, `avisarAprovadores` | T4 |
| `src/lib/actions/emporio-despesas.ts` | `pagarDespesasAction` bifurca pelo teto; `executarPagamentoDeContas` extraído; travas de `CONTA_EM_APROVACAO` | T4 |
| `src/lib/actions/emporio-configuracoes.ts` | o teto na leitura das configurações | T4 |
| `src/app/api/v1/emporio/finance/payment-requests/route.ts`, `payment-requests/[id]/approve/route.ts`, `payment-requests/[id]/reject/route.ts`, `settings/approval/route.ts` (novos) | rotas da alçada | T4 |
| `src/lib/actions/emporio-financeiro.ts` | `carimbarLinhaAction`, `descarimbarLinhaAction`; extrato com carimbo e filtro; `HojeView.unreconciled` e `pending_approvals` | T4 (bloco Hoje), T5 |
| `src/app/api/v1/emporio/finance/statement/route.ts`, `statement/reconcile/route.ts` (novo) | filtro e carimbo | T5 |
| `src/app/(dashboard)/emporio/clientes/_components/acordos-do-cliente.tsx`, `acordo-form.tsx` (novos), `clientes/[id]/page.tsx` | o acordo na ficha | T6 |
| `src/app/(dashboard)/emporio/financeiro/aprovacoes/page.tsx` (novo), `_components/financeiro-aprovacoes.tsx` (novo), `financeiro-abas.tsx`, `financeiro-hoje.tsx`, `pagar-contas-form.tsx`, `configuracoes/_components/alcada-form.tsx` (novo), `configuracoes/page.tsx` | a alçada nas telas | T6 |
| `src/app/(dashboard)/emporio/_components/financeiro-extrato.tsx`, `carimbo-botao.tsx` (novo), `financeiro/caixa/page.tsx` | o carimbo no extrato e no Hoje | T7 |
| `scripts/_cenario-emporio-financeiro-acordo.ts`, `scripts/navegador/emporio-financeiro-acordo.py`, `scripts/navegador/manual-emporio.py`, manual (`_conteudo/*`), `public/manual/emporio/*.png` | prova viva e manual | T8 |
| `src/app/(public)/docs/api/endpoints.ts`, `docs/agents/dividas.md`, `docs/specs/module-39-meu-emporio.md`, `scripts/cenario-demonstracao-emporio.ts` | docs, dívidas e demonstração | T9 |

---

### Task 1: schema, migração, papel, Histórico e as funções puras do acordo

**Files:**
- Modify: `prisma/schema.prisma` (`FinancialEntry`, `EmporioSettings`, `CashMovement`, `CardReceivable`, models novos)
- Create: `prisma/migrations/20261108180000_emporio_financeiro_acordo_alcada_carimbo/migration.sql`
- Modify: `src/lib/prisma.ts`, `src/lib/emporio/papel.ts`, `src/lib/emporio/historico.ts`
- Create: `src/lib/emporio/acordo.ts`

**Interfaces:**
- Produces (schema):
  - `model EmporioCreditAgreement { id, tenant_id, customer_id (FK EmporioCustomer), created_by_user_id (FK User), total Decimal(14,2), installments Int, notes String?, created_at }`, índice `(tenant_id, customer_id)`.
  - `FinancialEntry.agreement_id String?` (FK `EmporioCreditAgreement`, índice): nas origens absorvidas (que ficam `cancelled`) e nas parcelas (que ficam `pending` com `related_id` = id do acordo).
  - `model EmporioPaymentRequest { id, tenant_id, requested_by_user_id (FK User), entry_ids String[], establishment_id String? (gaveta), cash_register_id String?, bank_account_id String? (conta), total Decimal(14,2), status String ("pendente" | "aprovado" | "recusado"), reason String? (da recusa), last_failure String? (a última aprovação que falhou), decided_by_user_id String?, decided_at DateTime?, created_at }`, índice `(tenant_id, status)`.
  - `EmporioSettings.payment_approval_limit Decimal(14,2)?` (nulo = sem alçada).
  - `CashMovement.reconciled_at DateTime?`, `CashMovement.reconciled_by_user_id String?`; o mesmo em `CardReceivable`.
- Produces (`src/lib/emporio/acordo.ts`):
  - `export function dividirEmParcelas(totalCent: number, quantidade: number, primeira: Date, aCadaDias: number): { due_date: Date; amount_cent: number }[]` (parcelas iguais, o resto dos centavos na primeira, datas em meia-noite UTC somando `aCadaDias` a cada parcela).
  - `export function validarParcelas(parcelas: { due_date: Date; amount_cent: number }[], totalCent: number, hoje: Date): { ok: true } | { ok: false; field: "installments"; message: string }` (de 1 a 48 parcelas; todo valor > 0; datas crescentes e nenhuma antes de hoje; soma igual ao total).
  - `export const CATEGORIA_ACORDO = "Acordo de fiado"`.
- Produces (`papel.ts`): `AcaoEmporio` ganha `"acordo"`; `pode(c, "acordo")` é verdadeiro só para `dono` e `financeiro` (o `gerente_geral` NÃO passa; a checagem é explícita, com comentário citando a Q233).
- Produces (`historico.ts`): `ACOES_DO_HISTORICO` ganha `fiado.acordo` ("Acordo de fiado"), `pagamento.pedir` ("Pedido de aprovação de pagamento"), `pagamento.aprovar` ("Pagamento aprovado"), `pagamento.recusar` ("Pagamento recusado"), `conciliacao.carimbar` ("Carimbo de conciliação"), `conciliacao.descarimbar` ("Carimbo retirado"); `linkDoAlvo` liga `pedido_pagamento` a `/emporio/financeiro/aprovacoes` e `conta` (bancária) a `/emporio/financeiro/caixa?lugar=conta:<id>`.

- [ ] **Step 1: Escrever os testes das funções puras** (no topo da futura m100 ou, até a T2 existir, num bloco `if (require.main === module)` temporário que a T2 absorve): `dividirEmParcelas(10001, 3, 2026-12-10, 30)` dá `[3335, 3333, 3333]` com datas 10/12, 09/01, 08/02; `validarParcelas` reprova soma diferente, valor zero, data antes de hoje, 49 parcelas, datas fora de ordem; aprova a lista boa.
- [ ] **Step 2: Rodar e ver falhar** (`npx tsx` do arquivo): falha por módulo inexistente.
- [ ] **Step 3: Implementar `src/lib/emporio/acordo.ts`** com as assinaturas acima.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Schema e migração.** Editar o `schema.prisma`; gerar o SQL com `migrate diff` (URL do Docker inline), conferir que não tem o `DROP INDEX` dos dois índices parciais, salvar em `prisma/migrations/20261108180000_emporio_financeiro_acordo_alcada_carimbo/migration.sql`; `npm run db:deploy` (URL inline); `npx prisma generate`; `migrate diff` de novo tem de devolver `-- This is an empty migration.`.
- [ ] **Step 6: `TENANT_SCOPED_MODELS`, `papel.ts`, `historico.ts`** como em Interfaces. `npm run test:isolation` (URL inline) verde.
- [ ] **Step 7: Gates.** `npm run check`, `npx tsc --noEmit`, `npm run lint`.
- [ ] **Step 8: Commit.**

### Task 2: a suíte m100, escrita da spec

**Files:**
- Create: `scripts/m100-emporio-financeiro-acordo.test.ts`
- Modify: `package.json` (`"test:m100": "tsx scripts/m100-emporio-financeiro-acordo.test.ts"`)

**Interfaces:**
- Consumes: o cabeçalho e os auxiliares da m99 (`montar`, `chamar`, `R`, `check`, `limpar`, `comBanco`, `abrirTurnoDeTeste`, `papelFinanceiro`), `Cx.criarContaAction`, `Cx.saldoInicialCaixaAction`, `V.venderAction`, `Cx.receberFiadoAction`, e os contratos de API desta entrega (abaixo). A suíte é escrita da spec e deste plano, sem ler a implementação; rotas que ainda não existem fazem a suíte ficar vermelha até a T5, e isso é esperado.
- Produces: `npm run test:m100` com as seções: (1) funções puras do acordo; (2) acordo: total a receber igual antes e depois; origens somem da cobrança; parcela vencida bloqueia; acordo em dia desbloqueia dentro do limite; o devido para o limite inclui as parcelas; receber parcela (mais antiga primeiro) com `fiado.receber`; Gerente geral recusado (403); Financeiro e Dono aceitos; origem com recebimento parcial entra pelo aberto; parcelas que não batem (422 `installments`); devolução abate na parcela; cancelar venda em acordo recusado (409 `VENDA_EM_ACORDO`); Histórico `fiado.acordo`; (3) alçada: sem teto paga direto; Financeiro acima do teto vira pedido (nenhum `FinancialPayment` nem `CashMovement`; entry continua `pending`); Dono acima do teto paga direto; aprovar paga (pagamentos e movimento nascem, Histórico `pagamento.aprovar` e `despesa.pagar`); aprovar sem saldo falha com 409, o pedido fica `pendente` com `last_failure`; recusar exige motivo e deixa a conta pendente; as quatro travas de `CONTA_EM_APROVACAO`; aprovar pedido já decidido (409 `PEDIDO_NAO_PENDENTE`); Financeiro não aprova (403); teto salvo só por `conta` (Financeiro 403); (4) carimbo: carimbar movimento de conta e parcela de cartão; linha de gaveta recusada; já carimbado (409); descarimbar; o extrato mostra `reconciled_at`, o filtro `apenas_sem_carimbo` e `unreconciled_total`; o Hoje traz `unreconciled`; Gestor da loja não carimba (403); (5) isolamento: acordo, pedido e carimbo de uma conta não aparecem na outra.

- [ ] **Step 1: Escrever a suíte** com os contratos de API deste plano (seção "Contratos" abaixo).
- [ ] **Step 2: Rodar** (URL inline): as seções 1 e 5 (partes puras) verdes; o resto vermelho por rota inexistente. Registrar no relatório quais checks ficaram vermelhos.
- [ ] **Step 3: `npm run check`** (reprova suíte sem `package.json`): verde.
- [ ] **Step 4: Commit.**

### Task 3: acordo (actions e rotas)

**Files:**
- Create: `src/lib/actions/emporio-acordos.ts`, `src/app/api/v1/emporio/customers/[id]/agreements/route.ts`
- Modify: `src/lib/actions/emporio-caixa.ts` (`entradasAbertas`, `receberFiadoAction`), `src/lib/actions/emporio-vendas.ts` (`devolverAction`, `cancelarVendaAction`), `src/lib/actions/emporio-credito.ts` (só se o `CreditoView` precisar expor as parcelas)

**Interfaces:**
- Consumes: `entradasAbertas(db, where, { prazoPadraoDias })` (caixa:78), `receberFiadoAction` (caixa:254), `devolverAction` (vendas:1951, o bloco `abater_fiado` em 1833-1865), `cancelarVendaAction` (vendas:1395), `estadoDeCredito` (credito:112), `runSerializableTenantTransaction`, `createLinkedEntry` (financial.ts:80).
- Produces:
  - `entradasAbertas` passa a filtrar `category in [CATEGORIA_VENDAS, CATEGORIA_ACORDO]`; para a parcela (sem venda), `sold_at` é o `created_at` da entry, `effective_due_date` é o `due_date` da entry, e `EntradaAberta` ganha `agreement_id: string | null` e `installment_label: string | null` ("Parcela 2/3 do acordo de 10/12/2026").
  - `fazerAcordoAction(db, ator, customerId, input: { entry_ids: string[]; installments: { due_date: string; amount: number }[]; notes?: string }): Promise<ActionResult<AcordoView>>`: exige `acordo`; carrega as origens pelo `entradasAbertas` do cliente (toda origem tem de estar aberta e sem `agreement_id`, senão `ACORDO_SEM_ORIGEM` 422 `entry_ids`); o total é a soma dos `open_cent`; `validarParcelas` (422 `installments`, mensagem da função, código `PARCELAS_NAO_BATEM` quando a soma difere); na transação serializável: cria o acordo (`total`, `installments`, `notes`), cria uma `FinancialEntry` por parcela (`entry_type income`, `category CATEGORIA_ACORDO`, `description "Acordo de fiado, parcela i/n"`, `amount`, `due_date`, `status pending`, `related_module "emporio"`, `related_id` = id do acordo, `agreement_id`, `emporio_customer_id`, `establishment_id` da origem mais antiga), marca as origens `status: "cancelled"` com `agreement_id`, grava `fiado.acordo` (alvo `cliente`, summary "Acordo com <cliente>: R$ X em N parcelas, de dd/mm a dd/mm", `changes` com uma linha por origem e uma por parcela).
  - `AcordoView = { id, customer_id, created_at, created_by, total, notes, installments: { entry_id; number; due_date; amount; paid; open; status: "paga" | "em_dia" | "vencida" }[], origins: { entry_id; sale_id; sold_at; amount }[], open_total, status: "ativo" | "quitado" }` (tudo calculado na leitura).
  - `listarAcordosDoClienteAction(db, ator, customerId): Promise<ActionResult<AcordoView[]>>`: `dinheiro` ou `caixa`/`vendedor` da loja (os mesmos que leem a ficha de crédito).
  - `receberFiadoAction`: nada muda na assinatura; a parcela entra na fila "mais antiga primeiro" pelo `effective_due_date`; o `CashMovement` do recebimento de parcela fica sem `sale_id` (o campo é opcional).
  - `devolverAction` com `abater_fiado` numa venda cuja entry tem `agreement_id`: abate na parcela mais antiga em aberto do acordo (reduz `amount` da parcela; zerada vira `paid`); se o abatimento passa do aberto do acordo, a recusa que já existe ("Devolva em dinheiro.") vale; Histórico da devolução cita o acordo.
  - `cancelarVendaAction` com entry em acordo: `fail("VENDA_EM_ACORDO", "Esta venda entrou no acordo de dd/mm/aaaa com o cliente. Desfaça o acordo antes de cancelar a venda.", 409, "sale_id")`. Não existe "desfazer acordo" nesta entrega (vira dívida na T9).
  - Rota: `GET /api/v1/emporio/customers/:id/agreements` (200, `data: AcordoView[]`), `POST` (201, `data: AcordoView`; Zod: `entry_ids: z.array(z.string()).min(1)`, `installments: z.array(z.object({ due_date: z.string(), amount: z.number() })).min(1).max(48)`, `notes: z.string().max(500).optional()`).

- [ ] **Step 1: Rodar a m100 e anotar os vermelhos da seção 2.**
- [ ] **Step 2: `entradasAbertas` com as parcelas** (m99 continua verde: `DATABASE_URL=... npm run test:m99`).
- [ ] **Step 3: `fazerAcordoAction` e `listarAcordosDoClienteAction`.**
- [ ] **Step 4: `devolverAction` e `cancelarVendaAction`.**
- [ ] **Step 5: A rota.**
- [ ] **Step 6: m100 seção 2 verde; m99, m98 e a suíte das vendas (`test:m83`? confira no `package.json` qual cobre `devolverAction` e `cancelarVendaAction`) verdes.** Gates: check, tsc, lint.
- [ ] **Step 7: Commit.**

### Task 4: alçada (actions e rotas)

**Files:**
- Create: `src/lib/actions/emporio-aprovacoes.ts`, rotas `finance/payment-requests/route.ts`, `finance/payment-requests/[id]/approve/route.ts`, `finance/payment-requests/[id]/reject/route.ts`, `settings/approval/route.ts`
- Modify: `src/lib/actions/emporio-despesas.ts`, `src/lib/actions/emporio-configuracoes.ts`, `src/lib/actions/emporio-financeiro.ts` (`HojeView.pending_approvals`)

**Interfaces:**
- Consumes: `pagarDespesasAction` (despesas:1239, `PagarDespesasInput`, `PagamentoDeContasView`), `acharContaDoEmporio`, `saldoDoCaixa`, `saldosDasContas`, `resolverTurno`, `notify(recipient, content, "conversa")` (`src/lib/notify/index.ts:75`), `pode(c, "conta")`.
- Produces:
  - `executarPagamentoDeContas(tx, ator, input: PagarDespesasInput, opts: { pagoPor: Ator })` extraído de `pagarDespesasAction`: tudo o que hoje acontece dentro da transação (saldo, `FinancialPayment`, entry `paid`, `CashMovement`, Histórico `despesa.pagar`), chamado pelos dois caminhos.
  - `pagarDespesasAction`: antes de pagar, lê `EmporioSettings.payment_approval_limit`; se não é nulo, `totalCent > limiteCent` e `!pode(papel, "conta")`, então, na mesma transação: recusa conta com pedido pendente (`CONTA_EM_APROVACAO` 409 `entry_ids`), cria `EmporioPaymentRequest` (`status "pendente"`, `entry_ids`, o lugar, `total`), grava `pagamento.pedir` (alvo `pedido_pagamento`, summary "Pediu aprovação para pagar N conta(s), R$ X, pela conta <nome>"), e devolve `ok({ waiting_approval: true, request: PedidoDePagamentoView })`; depois do commit, `avisarAprovadores(db, request)`. `PagamentoDeContasView` vira união: `{ waiting_approval: false; ... o que já devolve }` ou `{ waiting_approval: true; request }`.
  - `avisarAprovadores(db, pedido)`: para cada `User` ativo com `role OWNER` ou `emporio_role gerente_geral` e `phone`, `notify({ tenant_id, user_id, phone, email }, { pushTitle: "Pagamento esperando aprovação", pushBody, pushUrl: "/emporio/financeiro/aprovacoes", whatsappText: "<quem> pediu aprovação para pagar R$ X a <fornecedor ou categoria>, vencimento dd/mm. Aprove em <URL absoluta>/emporio/financeiro/aprovacoes" }, "conversa")`; sem telefone, pula; nunca lança (erro vai para `console.warn`).
  - Travas: `cancelarContaAction`, `adiarVencimentoContaAction`, `corrigirDespesaAction` e `pagarDespesasAction` recusam entry com pedido `pendente` (`EmporioPaymentRequest.findFirst({ status: "pendente", entry_ids: { has: id } })`) com `fail("CONTA_EM_APROVACAO", "Esta conta está esperando aprovação de pagamento.", 409, "<field da action>")`.
  - `listarPedidosDePagamentoAction(db, ator, { status?: "pendente" | "aprovado" | "recusado" }): Promise<ActionResult<PedidoDePagamentoView[]>>`: `dinheiro`; `PedidoDePagamentoView = { id, status, total, created_at, requested_by: { id, name }, from: { kind: "gaveta" | "conta"; id; name }, entries: { entry_id; description; supplier_or_category; due_date; amount }[], reason, last_failure, decided_by: { name } | null, decided_at }`.
  - `aprovarPedidoDePagamentoAction(db, ator, id): Promise<ActionResult<PedidoDePagamentoView>>`: exige `conta`; pedido inexistente 404; não pendente `PEDIDO_NAO_PENDENTE` 409; na transação serializável chama `executarPagamentoDeContas` com o pedido como input e o aprovador como quem paga; se o pagamento recusar (saldo, conta já paga fora etc.), grava `last_failure` com a mensagem, mantém `pendente` e devolve a recusa (409 `INSUFFICIENT_CASH` no campo `from` quando é saldo); no sucesso, `status "aprovado"`, `decided_by_user_id`, `decided_at`, Histórico `pagamento.aprovar` (alvo `pedido_pagamento`), além das linhas `despesa.pagar` que `executarPagamentoDeContas` já grava.
  - `recusarPedidoDePagamentoAction(db, ator, id, { reason }): ...`: exige `conta`; `reason` de 3 a 300 (422 `reason`); não pendente 409; `status "recusado"`, `reason`, decisor e data; Histórico `pagamento.recusar`.
  - `salvarAlcadaAction(db, ator, { payment_approval_limit: number | null })`: exige `conta` (o teto limita quem não é da conta, então só a conta o define); valor de 0,01 a `LIMITE_MAXIMO_DE_FIADO` ou nulo; grava em `EmporioSettings` (upsert, como o fiado); Histórico `configuracoes.editar` ou a chave que `salvarConfiguracoesDoFiadoAction` já usa (confira e reuse), `changes` [{ campo: "Teto sem aprovação", antes, depois }]. `lerConfiguracoesAction` devolve `payment_approval_limit`.
  - `HojeView.pending_approvals: { count: number; total: number }`: pedidos pendentes nas lojas e contas do alcance (todos para `conta` e `financeiro`).
  - Rotas: `GET /api/v1/emporio/finance/payment-requests?status=` (200), `POST .../payment-requests/:id/approve` (200; a recusa da action vira o status dela), `POST .../payment-requests/:id/reject` `{ reason }` (200), `PATCH /api/v1/emporio/settings/approval` `{ payment_approval_limit: number | null }` (200, devolve as configurações).

- [ ] **Step 1: Rodar a m100 e anotar os vermelhos da seção 3.**
- [ ] **Step 2: Extrair `executarPagamentoDeContas`** sem mudar comportamento (m98 e m83 verdes).
- [ ] **Step 3: A bifurcação pelo teto, o pedido e o aviso.**
- [ ] **Step 4: As travas nos quatro caminhos.**
- [ ] **Step 5: Aprovar, recusar, listar, salvar o teto, o bloco do Hoje.**
- [ ] **Step 6: As rotas.**
- [ ] **Step 7: m100 seção 3 verde; m98, m83, m99 verdes.** Gates.
- [ ] **Step 8: Commit.**

### Task 5: carimbo (actions e rotas)

**Files:**
- Modify: `src/lib/actions/emporio-financeiro.ts`, `src/app/api/v1/emporio/finance/statement/route.ts`
- Create: `src/app/api/v1/emporio/finance/statement/reconcile/route.ts`

**Interfaces:**
- Consumes: `lerExtratoAction` (financeiro:277), `ExtratoLinhaView` (:80), `HojeView` (:47), `lerResumoHojeAction` (:123).
- Produces:
  - `ExtratoLinhaView` ganha `reconciled_at: string | null` (ISO) e `reconciled_by: string | null` (nome).
  - `lerExtratoAction` input ganha `apenas_sem_carimbo?: boolean`; `ExtratoView` ganha `unreconciled_count` e `unreconciled_total` (soma dos valores absolutos das linhas de conta sem carimbo no período, calculada ANTES do filtro); para gaveta e gerência os dois são 0 e as linhas vêm com `reconciled_at: null`.
  - `carimbarLinhaAction(db, ator, { kind: "movimento" | "cartao"; id: string }): Promise<ActionResult<{ kind; id; reconciled_at: string; reconciled_by: string }>>`: exige `dinheiro`; linha inexistente 404 `id`; movimento sem `bank_account_id` → `LINHA_NAO_E_DE_CONTA` 422 `id`; já carimbada → `JA_CARIMBADO` 409 `id`; grava `reconciled_at = now`, `reconciled_by_user_id`; Histórico `conciliacao.carimbar` (alvo `conta`, `target_id` = `bank_account_id`, summary "Carimbou <descrição da linha>, R$ X de dd/mm").
  - `descarimbarLinhaAction(db, ator, { kind; id })`: `dinheiro`; sem carimbo → `SEM_CARIMBO` 409; limpa os dois campos; Histórico `conciliacao.descarimbar`.
  - `HojeView.unreconciled: { count: number; total: number }`: linhas de conta (movimentos e parcelas de cartão com `expected_on` até hoje) sem carimbo nos últimos 30 dias, nas contas do alcance.
  - Rotas: `GET .../statement` aceita `apenas_sem_carimbo=1`; `POST /api/v1/emporio/finance/statement/reconcile` `{ kind, id }` (200) carimba; `DELETE` com o mesmo corpo descarimba.

- [ ] **Step 1: Rodar a m100 e anotar os vermelhos da seção 4.**
- [ ] **Step 2: Implementar** as actions, o extrato e o Hoje.
- [ ] **Step 3: As rotas.**
- [ ] **Step 4: m100 inteira verde (todas as seções); m98 verde.** Gates.
- [ ] **Step 5: Commit.**

### Task 6: as telas do acordo e da alçada

**Files:**
- Create: `src/app/(dashboard)/emporio/clientes/_components/acordos-do-cliente.tsx`, `acordo-form.tsx`; `src/app/(dashboard)/emporio/financeiro/aprovacoes/page.tsx`; `src/app/(dashboard)/emporio/_components/financeiro-aprovacoes.tsx`; `src/app/(dashboard)/emporio/configuracoes/_components/alcada-form.tsx`
- Modify: `clientes/[id]/page.tsx`, `_components/financeiro-abas.tsx`, `_components/financeiro-hoje.tsx`, `_components/pagar-contas-form.tsx`, `configuracoes/page.tsx`

**Interfaces:**
- Consumes: `listarAcordosDoClienteAction`, a rota `POST .../agreements`, `listarPedidosDePagamentoAction`, as rotas de aprovar e recusar, `PATCH settings/approval`, `HojeView.pending_approvals`, `PagamentoDeContasView.waiting_approval`, `dividirEmParcelas` (função pura, pode ser importada no client).
- Produces:
  - Ficha do cliente: seção "Acordos" logo abaixo de "Fiado e crédito", com a lista de acordos (data, total, parcelas pagas/abertas, próxima parcela, selo Ativo/Quitado) e, para quem `pode(papel, "acordo")` e o cliente tem fiado aberto, o botão "Fazer acordo" (`acordo-form.tsx`, `FormSheet`): checkboxes das origens (venda, data, aberto; "todas" marcada por padrão), total marcado em destaque, campos "Parcelas" (quantidade, 1 a 48), "Primeira parcela em" (data, padrão hoje + 30), "A cada (dias)" (padrão 30), botão "Montar parcelas" que chama `dividirEmParcelas` e mostra a tabela editável (data e valor por parcela, `MoneyInput`), soma das parcelas x total (vermelho quando difere), observação. `ORDEM = ["entry_ids", "installments", "notes"]`. A recusa do servidor aparece no campo.
  - Aba "Aprovações" em `financeiro-abas.tsx` (sexta aba, depois de "Cobrança"); página `/emporio/financeiro/aprovacoes?status=pendente|decididos`: lista de pedidos (quem pediu, quando, total, lugar, contas com fornecedor e vencimento; selo do status; `last_failure` em `role="alert"` quando houver; motivo da recusa). Para quem `pode(papel, "conta")`: botão "Aprovar" (confirma e chama a rota; recusa do servidor no `useAviso`) e "Recusar" (`FormSheet` com `reason`, `ORDEM = ["reason"]`). O Financeiro vê a lista sem botões.
  - Hoje: cartão "Esperando aprovação" (quantidade e total, link para a aba) quando `pending_approvals.count > 0`.
  - `pagar-contas-form.tsx`: quando a resposta vem com `waiting_approval: true`, `aviso.sucesso("Ficou esperando aprovação do Dono ou do Gerente geral.")` e fecha o painel.
  - Configurações: seção "Alçada de pagamento" (`alcada-form.tsx`) com o campo "Teto sem aprovação" (`MoneyInput`, vazio = sem alçada), só para quem `pode(papel, "conta")`; os outros veem o valor em texto.

- [ ] **Step 1: Ficha do cliente: lista e formulário do acordo.**
- [ ] **Step 2: Aba Aprovações, página e componente; cartão do Hoje; o aviso no pagar; a seção de configurações.**
- [ ] **Step 3: Gates** (check pega `<input type="number">`, cor crua, dinheiro fora do formato, `Field` sem `error`), tsc, lint.
- [ ] **Step 4: Commit.**

### Task 7: a tela do carimbo

**Files:**
- Create: `src/app/(dashboard)/emporio/_components/carimbo-botao.tsx`
- Modify: `src/app/(dashboard)/emporio/_components/financeiro-extrato.tsx`, `financeiro/caixa/page.tsx`, `_components/financeiro-hoje.tsx`

**Interfaces:**
- Consumes: `ExtratoLinhaView.reconciled_at`, `ExtratoView.unreconciled_*`, as rotas de carimbo, `HojeView.unreconciled`.
- Produces: no extrato da conta, cada linha ganha a coluna "Carimbo" com o botão "Carimbar" (ou "Carimbado em dd/mm" com o botão "Retirar") para quem `pode(papel, "dinheiro")` (`carimbo-botao.tsx`, client, `useAviso` para a recusa, `router.refresh()` no sucesso); gaveta e gerência não mostram a coluna; o filtro "Só sem carimbo" (checkbox no `<form method=get>` de período, query `carimbo=sem`) e a linha "Sem carimbo no período: R$ X em N linhas" acima da tabela. Hoje: cartão "Sem carimbo" (30 dias, total e quantidade, link para o extrato da conta com o filtro).

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Gates.**
- [ ] **Step 3: Commit.**

### Task 8: prova viva: cenário, roteiro nos dois sentidos e manual

**Files:**
- Create: `scripts/_cenario-emporio-financeiro-acordo.ts` (prefixo "Aco "), `scripts/navegador/emporio-financeiro-acordo.py`
- Modify: `scripts/navegador/manual-emporio.py`, `src/app/(dashboard)/manual/_conteudo/figuras.ts`, `partes-tarefa-2.tsx` (fiado) ou `partes-tarefa-3.tsx` (casa do financeiro), `indice.ts`, `partes-funcao.tsx`
- Create: `public/manual/emporio/fiado-acordo*.png`, `financeiro-aprovacoes*.png`, `financeiro-extrato*.png`

**Interfaces:**
- Consumes: `_lib.py`, o cenário e o roteiro da entrega 2 como modelo, `figura(...)` do `manual-emporio.py`, o dev server (porta 3002 do worktree, ver o ledger da entrega 2).
- Produces: cenário com a conta do seed: usuários "Aco Financeiro", "Aco Gestor", "Aco Caixa", lojas "Aco Loja 1" e "Aco Loja 2", conta bancária "Aco Banco" com saldo, cliente "Aco Devedor" com dois fiados vencidos (R$ 80,00 há 20 dias e R$ 50,00 há 5 dias) na Loja 1, um fornecedor com duas contas a pagar (R$ 300,00 e R$ 900,00), teto de aprovação R$ 500,00, e uma venda no cartão com parcela em conta. Roteiro: (1) Financeiro faz acordo de R$ 130,00 em 2 parcelas na ficha; a Cobrança deixa de listar o Aco Devedor; a ficha mostra o acordo; (2) o Caixa vende fiado ao Aco Devedor dentro do limite (desbloqueado) e é recusado quando a parcela vence (ajuste pela API ou pelo cenário com `due_date` ontem numa segunda rodada do passo); (3) Financeiro paga a conta de R$ 300,00 (direto) e a de R$ 900,00 (vira pedido; aviso "esperando aprovação"); a aba Aprovações lista; o Dono aprova e a conta some de A pagar; o Dono recusa um segundo pedido com motivo; (4) o extrato da conta mostra as linhas, o Financeiro carimba o movimento do pagamento, o filtro "Só sem carimbo" esconde a linha, o Hoje mostra "Sem carimbo"; (5) a 390 px: a ficha com o acordo, a aba Aprovações e o extrato sem rolagem horizontal. Prova nos dois sentidos: com `pode(c, "acordo")` deixando o Gerente geral passar (sabotagem em `papel.ts`), o roteiro tem de reprovar no passo 1 (um `confere` que o Gerente geral recebe 403 pela API); restaurar nos dois clones. Manual: tarefas "Fazer acordo de fiado" (parte do Fiado), "Aprovar um pagamento" e "Conferir o extrato com o carimbo" (parte da casa do financeiro), figuras `fiado-acordo`, `financeiro-aprovacoes`, `financeiro-extrato`.

- [ ] **Step 1: Cenário e roteiro; rodar até 0 falhas.**
- [ ] **Step 2: Sabotar `papel.ts`, rodar, ver reprovar; restaurar; rodar, 0 falhas.**
- [ ] **Step 3: Manual: texto, figuras, `FIGURAS=fiado-acordo,financeiro-aprovacoes,financeiro-extrato npm run navegador -- manual-emporio`.**
- [ ] **Step 4: Commit.**

### Task 9: docs, dívidas, spec do módulo e demonstração

**Files:**
- Modify: `src/app/(public)/docs/api/endpoints.ts`, `docs/agents/dividas.md`, `docs/specs/module-39-meu-emporio.md`, `scripts/cenario-demonstracao-emporio.ts`

- [ ] **Step 1: `/docs/api`:** as rotas de acordo, aprovações, alçada e carimbo, com exemplos reais; `npm run test:docs-api` verde.
- [ ] **Step 2: Dívidas:** fechar a 2.26-like que a entrega 3 cobrir (conferir a lista); novas: desfazer acordo (hoje só o cancelamento da venda é recusado), conciliação por OFX e NSU (Q226, já na spec), aviso de aprovação só pelo WhatsApp do Tibé (sem email), pedido de pagamento pela gaveta sem turno aberto na aprovação (o aprovador precisa de turno?), acordo com parcelas em lojas diferentes (a parcela herda a loja da origem mais antiga).
- [ ] **Step 3: Spec do módulo:** parágrafo da entrega 3 na seção do financeiro.
- [ ] **Step 4: Demonstração:** um acordo ativo com uma parcela paga e uma a vencer para o Haras Santa Clara, um pedido de pagamento pendente, teto R$ 2.000,00, três linhas carimbadas no extrato da conta.
- [ ] **Step 5: Gates e commit.**

---

## Contratos de API desta entrega (a T2 escreve a suíte daqui)

| método e rota | quem | corpo | resposta |
|---|---|---|---|
| `GET /api/v1/emporio/customers/:id/agreements` | dinheiro, caixa e vendedor da loja | | 200 `data: AcordoView[]` |
| `POST /api/v1/emporio/customers/:id/agreements` | dono, financeiro (`acordo`; gerente_geral 403) | `{ entry_ids, installments: [{ due_date, amount }], notes? }` | 201 `data: AcordoView`; 422 `entry_ids` (`ACORDO_SEM_ORIGEM`), 422 `installments` (`PARCELAS_NAO_BATEM` ou `VALIDATION_ERROR`) |
| `POST /api/v1/emporio/sales/:id/cancel` | (existente) | | 409 `VENDA_EM_ACORDO` quando a entry está em acordo |
| `POST /api/v1/emporio/payables/pay` | (existente) | | 200 `data: { waiting_approval: true, request }` acima do teto para quem não é `conta`; 409 `CONTA_EM_APROVACAO` em conta travada |
| `GET /api/v1/emporio/finance/payment-requests?status=` | dinheiro | | 200 `data: PedidoDePagamentoView[]` |
| `POST /api/v1/emporio/finance/payment-requests/:id/approve` | conta | | 200 `data: PedidoDePagamentoView` (aprovado); 409 `INSUFFICIENT_CASH` (campo `from`, pedido continua pendente com `last_failure`); 409 `PEDIDO_NAO_PENDENTE` |
| `POST /api/v1/emporio/finance/payment-requests/:id/reject` | conta | `{ reason }` | 200; 422 `reason`; 409 `PEDIDO_NAO_PENDENTE` |
| `PATCH /api/v1/emporio/settings/approval` | conta | `{ payment_approval_limit: number \| null }` | 200 configurações; 403 para financeiro |
| `GET /api/v1/emporio/finance/statement?kind=&id=&de=&ate=&apenas_sem_carimbo=1` | (existente) | | linhas com `reconciled_at`, `reconciled_by`; `unreconciled_count`, `unreconciled_total` |
| `POST /api/v1/emporio/finance/statement/reconcile` | dinheiro | `{ kind: "movimento" \| "cartao", id }` | 200; 422 `LINHA_NAO_E_DE_CONTA`; 409 `JA_CARIMBADO`; 404 |
| `DELETE /api/v1/emporio/finance/statement/reconcile` | dinheiro | `{ kind, id }` | 200; 409 `SEM_CARIMBO` |
| `GET /api/v1/emporio/finance/today` | (existente) | | `pending_approvals: { count, total }`, `unreconciled: { count, total }` |

## Gates da entrega (depois da Task 9)

`npm run check`; `npx tsc --noEmit`; `npm run lint`; `npm run build`; `test:m100`; `test:isolation`; `test:all -- --sem-redis` (nenhuma suíte a menos que antes: 100); `migrate diff` vazio; roteiro `emporio-financeiro-acordo` nos dois sentidos; juiz Opus com os seis critérios; `manual-emporio`; relatório de evidências; handoff.

## Autoavaliação do plano (writing-plans)

1. **Cobertura da spec.** Acordo: quem faz (T1 papel, T3), origens escolhidas e parcelas sem juros (T1, T3), o que acontece com as origens e os quatro requisitos (T3: total igual, venda ligada ao acordo por `agreement_id`, `listarFiadoAction` e o recebimento via `entradasAbertas`, Resultado não lê entry), bloqueio por parcela vencida e desbloqueio em dia (T3 via `estadoDeCredito`, provado na T2), receber parcela (T3), devolução e cancelamento (T3), Histórico e ficha (T3, T6). Alçada: teto (T4, T6), pedido em vez de pagar (T4), aviso `conversa` ao Dono e Gerente geral com telefone (T4), fila no Hoje e na casa (T4, T6), aprovar com saldo e a falha que mantém o pedido (T4), recusar com motivo (T4), trava da conta (T4), Histórico (T4). Carimbo: colunas (T1), extrato com botão, filtro e total (T5, T7), `dinheiro` e Histórico (T5), bloco Sem carimbo no Hoje (T5, T7), OFX e NSU como dívida (T9). Consequências: migração (T1), rotas (T3 a T5), manual (T8).
2. **Passos.** Cada passo decide uma coisa; os corpos ficam com o implementador. As assinaturas e os códigos estão em Interfaces.
3. **Tipos.** `AcordoView`, `PedidoDePagamentoView`, `PagamentoDeContasView` (união), `ExtratoLinhaView` e `HojeView` são usados com os mesmos nomes nas T2 a T7.
4. **Review Focus.** Os cinco têm teste na tarefa dona (T3, T3, T4, T4, T5), listados na T2.
5. **Proporção.** O plano é menor que a seção da spec mais o código que descreve; sem transcrição de corpo.

Decisões minhas, registradas aqui e no ledger quando a execução começar: a parcela é `FinancialEntry` com categoria própria (não uma tabela nova), para a cobrança, o recebimento e o bloqueio virem de graça; a origem vira `cancelled` com `agreement_id` (a venda continua ligada pelo `agreement_id`); o teto é definido só por `conta`; o pedido guarda `entry_ids` em array (uma conta tem no máximo um pedido pendente, garantido pela trava na action); o aprovador paga como ele mesmo (o Histórico diz quem pediu e quem aprovou); não existe desfazer acordo nesta entrega.
