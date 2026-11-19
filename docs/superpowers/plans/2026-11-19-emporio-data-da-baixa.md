# Empório: data da baixa que espelha o extrato do banco (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o Financeiro escolhe a data em que o dinheiro caiu (até 31 dias para trás ou para a frente), corrige a data do PIX da venda no extrato e registra o valor pago do boleto, e o saldo da conta só conta o que já caiu.

**Architecture:** um helper puro decide e valida a data da baixa; o saldo da conta passa a filtrar por data (nunca gravado, invariante 2), e o movimento futuro vira "Agendado"; as actions de receber ganham o campo de data; uma action nova corrige a data da linha de venda no extrato; o boleto ganha `paid_amount` (migração) e o Resultado mostra juros e descontos.

**Tech Stack:** Next.js 16, Prisma 7, suítes `tsx` (`scripts/m127-*.test.ts`, nova), roteiros Python em `scripts/navegador/`.

**Spec:** [../specs/2026-11-19-emporio-data-da-baixa.md](../specs/2026-11-19-emporio-data-da-baixa.md) (Q370 a Q373).

**Branch:** `emporio-data-da-baixa` (já criada, com a spec).

## Global Constraints

- Janela da data: de hoje menos 31 a hoje mais 31 dias, em dia de calendário de Brasília (`hojeEmBrasilia()`); 31 dias para a frente é leitura do coordenador, registrada na spec.
- Mudam a data só os papéis que passam em `exigir(db, ator, "dinheiro", ...)` (Financeiro, Gerente geral, Dono), o mesmo de `conferirParcelaAction`; para os outros, data diferente de hoje é recusada pelo servidor (403, `field` da data, "Só o Financeiro, o Gerente geral e o Dono mudam a data.").
- Dinheiro em espécie (gaveta, gerência) é sempre de hoje: data diferente é 422 com "Dinheiro na gaveta é sempre de hoje.".
- Instante gravado: agora, se a data é hoje; senão meio-dia de Brasília do dia (`dia + 15 h` UTC), o padrão que `pagarBoletoAction` já usa.
- Nunca travessão (U+2014). Regra só em `src/lib/actions/*` e helpers puros em `src/lib/emporio/`. Toda escrita do Empório chama `registrarNoHistorico`; ação nova ganha rótulo em `ACOES_DO_HISTORICO`.
- Rota que muda de corpo ou nasce: `src/app/(public)/docs/api/endpoints.ts` atualizado e `npm run test:docs-api` verde.
- Suítes só no Docker local, com `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379"` inline.
- Migração (Task 5) pelo fluxo do CLAUDE.md: `migrate diff` com a URL do Docker inline, SQL em `prisma/migrations/<timestamp>_emporio_boleto_valor_pago/migration.sql`, `db:deploy` local; no Neon só no merge, com autorização.
- Roteiro só vale visto falhar; subagente não commita.

## Review Focus

1. **Bordas da janela em Brasília:** hoje menos 31 e hoje mais 31 aceitos, 32 recusado, também perto da meia-noite UTC. Teste na Task 1 (puro).
2. **O agendado vira saldo sozinho:** movimento com data de amanhã fora do saldo hoje; com data de hoje, dentro. Teste na Task 1.
3. **Pagar com saldo só agendado:** conta cujo único dinheiro é futuro recusa o pagamento de despesa por saldo insuficiente. Teste na Task 1.
4. **Corrigir a data do que não pode:** linha carimbada, transferência ou gaveta recusadas. Teste na Task 4.
5. **Valor pago menor que o boleto com centavos:** R$ 100,10 pago por R$ 99,90 vira desconto de R$ 0,20, nunca movimento negativo nem soma flutuante. Teste na Task 5.

---

### Task 1: o saldo da conta respeita a data, e o helper da data da baixa

**Files:**
- Create: `src/lib/emporio/data-da-baixa.ts`
- Modify: `src/lib/actions/emporio-caixa.ts` (`saldosDasContas`, ~583)
- Modify: `src/lib/actions/emporio-financeiro.ts` (extrato da conta, ~600-720: linhas e abertura)
- Modify: `src/lib/actions/emporio-relatorios-financeiro.ts` (~366, dinheiro por lugar)
- Modify: `src/lib/actions/emporio-projecao.ts` (balde novo `scheduled`)
- Create: `scripts/m127-emporio-data-da-baixa.test.ts` e a entrada `"test:m127"` no `package.json`

**Interfaces:**
- Produces: `export const JANELA_DA_BAIXA_DIAS = 31`; `export function lerDataDaBaixa(valor: unknown, hoje: Date): { ok: true; dia: Date } | { ok: false; mensagem: string }` (aceita `null`/`undefined` como hoje, string `AAAA-MM-DD` ou `Date`; recusa fora da janela com a mensagem "A data precisa estar entre DD/MM/AAAA e DD/MM/AAAA."); `export function instanteDaBaixa(dia: Date, hoje: Date, agora: Date): Date`; `export function fimDeHojeEmBrasilia(agora?: Date): Date` (início de amanhã em Brasília, o limite exclusivo do saldo).
- Produces: o extrato (`GET emporio/finance/statement`) devolve `scheduled: LinhaDoExtrato[]` (movimentos da conta com data depois de hoje, em ordem de data), fora de `lines` e fora do saldo corrido; a projeção ganha `scheduled` por semana.

- [ ] **Passo 1: testes (seções 1 e 2 da `m127`)**

Seção 1 (pura): `lerDataDaBaixa(null, hoje)` dá hoje; `hoje - 31` e `hoje + 31` aceitos; `hoje - 32` e `hoje + 32` recusados com a mensagem da janela; `"2026-02-30"` e `"abc"` recusados; `instanteDaBaixa(hoje, hoje, agora) === agora`; `instanteDaBaixa(amanha, hoje, agora)` é `amanha + 15 h`. Seção 2 (banco): numa conta com R$ 100 de hoje e R$ 50 gravados direto com `occurred_at` de amanhã meio-dia: `saldosDasContas` dá 100; o extrato traz o de 50 em `scheduled` e não em `lines`, e o saldo final das linhas é 100; a projeção soma 50 em `scheduled` da semana de amanhã; pagar uma despesa de R$ 120 por essa conta é recusado por saldo insuficiente; o mesmo movimento regravado com `occurred_at` de hoje entra no saldo (150).

- [ ] **Passo 2: rodar e ver falhar** (`npm run test:m127` com as URLs inline; FAIL no módulo ausente e no saldo 150 em vez de 100)

- [ ] **Passo 3: implementar**

`saldosDasContas` soma só `occurred_at < fimDeHojeEmBrasilia()`. O extrato da conta separa as linhas futuras em `scheduled` (a gaveta e a gerência não têm futuro). O relatório de dinheiro por lugar limita o fim do período a hoje, como já faz com o cartão. A projeção põe cada agendado na semana dele (balde `scheduled`, somado às entradas ou saídas pela direção). As checagens de saldo de compras, despesas, franqueados e transferências usam `saldosDasContas` e herdam a regra sem mudança.

- [ ] **Passo 4: rodar** `m127`, `m125` e as suítes que leem extrato ou projeção (`grep -ln "finance/statement\|projection" scripts/m*.test.ts`), `npx tsc --noEmit`, `npm run check`. Expected: PASS.

- [ ] **Passo 5: commit** (controlador)

### Task 2: a data da baixa nas actions e rotas de receber

**Files:**
- Modify: `src/lib/actions/emporio-caixa.ts` (`receberFiadoAction` e `ReceberFiadoInput` ~279-480; `depositarChequeAction` ~1920; `compensarChequeAction` ~2073; `pagarBoletoAction` ~2340)
- Modify: `src/app/api/v1/emporio/receivables/receive/route.ts`, `boletos/[id]/pay/route.ts`, `checks/[id]/deposit/route.ts`, `checks/[id]/clear/route.ts`
- Modify: `src/app/(public)/docs/api/endpoints.ts`
- Test: `scripts/m127-emporio-data-da-baixa.test.ts` (seção 3)

**Interfaces:**
- Consumes: `lerDataDaBaixa`, `instanteDaBaixa` (Task 1).
- Produces: `ReceberFiadoInput.received_on?: string | Date | null`; `depositarChequeAction(..., input: { bank_account_id: string; deposited_on?: string | Date | null })`; `compensarChequeAction(db, ator, id, input?: { cleared_on?: string | Date | null })`; `pagarBoletoAction` aceita `paid_on` futuro dentro da janela. Corpo das rotas com os mesmos nomes.

- [ ] **Passo 1: testes (seção 3 da `m127`), pelas rotas**

Financeiro: fiado PIX com `received_on` de ontem grava o movimento, o `FinancialPayment.paid_at` e o `paid_at` do lançamento em ontem meio-dia; fiado em dinheiro com data de ontem é 422 (`received_on`, "Dinheiro na gaveta é sempre de hoje."); boleto com `paid_on` de amanhã é aceito e o movimento vai para `scheduled`; boleto com hoje mais 32 é 422 com a mensagem da janela; cheque depositado com `deposited_on` de ontem grava `deposited_at`; compensado com `cleared_on` de anteontem grava `cleared_at` e o movimento nessa data. Vendedor: fiado PIX com data de ontem é 403 com a mensagem da Global Constraints; sem data, grava agora. Histórico: o resumo cita a data quando ela não é hoje.

- [ ] **Passo 2: rodar e ver falhar**
- [ ] **Passo 3: implementar** (data lida antes de qualquer escrita; permissão da data com o mesmo `exigir` de "dinheiro"; instante pelo `instanteDaBaixa`; `endpoints.ts` com os campos novos e as recusas)
- [ ] **Passo 4: rodar** `m127`, `m122` (cheque), a suíte do boleto (`grep -ln "boletos/" scripts/m*.test.ts`), a do fiado (`grep -ln "receivables/receive" scripts/m*.test.ts`), `npm run test:docs-api`, `tsc`, `check`.
- [ ] **Passo 5: commit**

### Task 3: o campo "Data em que caiu" nas telas de receber

**Files:**
- Modify: `src/app/(dashboard)/emporio/_components/receber-fiado-form.tsx`, `boletos-lista.tsx`, `cheque-acoes.tsx` (e quem as renderiza, para passar `podeMudarData`)
- Modify: `src/app/(dashboard)/manual/_conteudo/` (a parte do financeiro que explica receber fiado, boleto e cheque)
- Create: `scripts/navegador/emporio-data-da-baixa.py` e `scripts/_cenario-emporio-data-da-baixa.ts`

**Interfaces:**
- Consumes: os campos da Task 2; `JANELA_DA_BAIXA_DIAS`.
- Produces: prop `podeMudarData: boolean` nos três componentes (vem da página, pelo papel; o servidor confere de novo).

- [ ] **Passo 1: roteiro** (sessões do Financeiro e de um Vendedor): o Financeiro recebe um fiado por PIX com "Data em que caiu" de ontem e o extrato mostra a linha em ontem; paga um boleto com data de amanhã e ela aparece em "Agendados", fora do saldo; compensa um cheque com data de anteontem; digita hoje mais 40 e lê a recusa embaixo do campo; o Vendedor não vê o campo. Celular 390 px sem rolagem horizontal.
- [ ] **Passo 2: rodar e ver falhar**
- [ ] **Passo 3: implementar** (campo de data do kit, padrão hoje, só com `podeMudarData` e, no fiado, só com PIX; recusa do servidor embaixo do campo pelo `ORDEM`; seção "Agendados" no extrato da conta, abaixo da tabela, com data e valor; frase no manual)
- [ ] **Passo 4: rodar o roteiro (PASS), desfazer o campo do boleto uma vez e ver falhar; `npm run check`, `tsc`, `eslint`**
- [ ] **Passo 5: commit**

### Task 4: corrigir a data da linha de venda no extrato

**Files:**
- Modify: `src/lib/actions/emporio-financeiro.ts` (action nova)
- Create: `src/app/api/v1/emporio/finance/statement/movements/[id]/route.ts` (PATCH)
- Modify: `src/lib/emporio/historico.ts` (`ACOES_DO_HISTORICO`)
- Modify: `src/app/(dashboard)/emporio/_components/financeiro-extrato.tsx` (botão e painel)
- Modify: `endpoints.ts`, manual, roteiro `emporio-data-da-baixa.py`
- Test: `m127` seção 4

**Interfaces:**
- Produces: `corrigirDataDoMovimentoAction(db: TenantPrismaClient, ator: Ator, id: string, input: { occurred_on: string | Date }): Promise<ActionResult<LinhaDoExtrato>>`; Histórico `"financeiro.data_corrigida"` com rótulo `"Data do lançamento corrigida"` e resumo `Corrigiu a data do PIX da venda nº N de DD/MM/AAAA para DD/MM/AAAA`.

Só a linha de conta com `origin: "venda"` (o PIX e a transferência da venda, Q372). Fiado, boleto e cheque já escolhem a data na baixa (Task 2); despesa, compra e transferência guardam a data em outro registro e ficam de fora.

- [ ] **Passo 1: testes (seção 4)**: Financeiro corrige a linha de venda para ontem (2xx, `occurred_at` ontem meio-dia, Histórico com as duas datas); para amanhã (vai a `scheduled`); recusas: linha carimbada 409 `JA_CARIMBADA` ("Tire o carimbo antes de corrigir a data."), linha de transferência ou de fiado 422 ("Só a data do PIX ou da transferência da venda se corrige aqui."), movimento da gaveta 422, data fora da janela 422, Vendedor 403, outro tenant 404.
- [ ] **Passo 2: rodar e ver falhar**
- [ ] **Passo 3: implementar** (action em transação com `updateMany` condicionado a `reconciled_at: null`; rota fina; botão "Corrigir a data" só na linha de venda sem carimbo e para quem pode; painel com campo de data e a recusa embaixo dele)
- [ ] **Passo 4: roteiro** (corrigir o PIX de uma venda para ontem; a linha muda de dia; carimbada não mostra o botão), visto falhar; `m127`, `test:docs-api`, `check`, `tsc`, `eslint`.
- [ ] **Passo 5: commit**

### Task 5: valor pago do boleto (migração e servidor)

**Files:**
- Modify: `prisma/schema.prisma` (`EmporioBoleto.paid_amount Decimal? @db.Decimal(14, 2)`)
- Create: `prisma/migrations/<timestamp>_emporio_boleto_valor_pago/migration.sql`
- Modify: `src/lib/actions/emporio-caixa.ts` (`pagarBoletoAction`, `BoletoView`), `src/lib/actions/emporio-resultado.ts`, `boletos/[id]/pay/route.ts`, `endpoints.ts`
- Test: `m127` seção 5

**Interfaces:**
- Produces: `pagarBoletoAction` input `paid_amount?: number` (maior que zero; ausente vale o do boleto); `BoletoView.paid_amount: number | null` e `BoletoView.difference: number | null` (pago menos original); o Resultado da loja ganha `boleto_interest` e `boleto_discount` no mês (pelo `paid_on`, loja da venda do boleto).

- [ ] **Passo 1: testes (seção 5)**: boleto de R$ 99,90 pago por R$ 100,10: movimento de 100,10, `paid_amount` 100,10, `difference` 0,20, Resultado com juros 0,20; pago por R$ 95,00: movimento de 95,00, desconto 4,90; sem `paid_amount`: igual ao de hoje (movimento do valor do boleto, `difference` 0); `paid_amount` 0 ou negativo: 422 `paid_amount`; o boleto de outra loja não entra no Resultado desta.
- [ ] **Passo 2: rodar e ver falhar**
- [ ] **Passo 3: migração e implementação** (fluxo do CLAUDE.md, URL do Docker inline, tirar do SQL os dois `DROP INDEX` dos índices parciais; contas em centavos; Histórico com "pago R$ X (juros R$ Y)" ou "(desconto R$ Y)")
- [ ] **Passo 4: rodar** `m127`, a suíte do boleto e a do Resultado (`grep -ln "resultado\|result" scripts/m*.test.ts`), `npm run test:drift` se houver localmente, `test:docs-api`, `check`, `tsc`.
- [ ] **Passo 5: commit**

### Task 6: valor pago do boleto na tela e no Resultado

**Files:**
- Modify: `src/app/(dashboard)/emporio/_components/boletos-lista.tsx` (campo "Valor pago" no pagar, e a linha do pago), o componente do Resultado da loja (o que mostra antecipação e ajuste do cartão), manual
- Modify: roteiro `emporio-data-da-baixa.py` (e o cenário, se faltar boleto)

- [ ] **Passo 1: roteiro**: pagar um boleto de R$ 99,90 digitando R$ 100,10; a lista mostra "pago R$ 100,10 (juros R$ 0,20)"; o Resultado mostra "Juros de boleto R$ 0,20"; valor 0 recusado embaixo do campo.
- [ ] **Passo 2: rodar e ver falhar**
- [ ] **Passo 3: implementar** (campo de dinheiro do kit com o valor do boleto preenchido; frase no manual)
- [ ] **Passo 4: roteiro PASS, visto falhar; `check`, `tsc`, `eslint`**
- [ ] **Passo 5: commit**

### Task 7: fechar a frente

- [ ] `npm run check`, `npx tsc --noEmit`, `npm run lint` e `npm run test:all -- --sem-redis` (URLs inline). Expected: tudo verde.
- [ ] Juiz (`prova-juiz`) sobre o range da branch, com a spec e este plano.
- [ ] `docs/agents/dividas.md`: o que sobrar vira item novo; `current-handoff.md` atualizado (teto de 200 linhas).
- [ ] No merge, com autorização: migração no Neon (URL Direct inline) e `npx prisma migrate status` antes do push.
