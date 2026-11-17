# Empório: informação amarrada (frente A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** amarrar cliente, fornecedor e venda por link em todo o Empório, e dar ao A receber, ao A pagar e à ficha do cliente os cartões de resumo das Q345 a Q347.

**Architecture:** a regra fica nas actions (`emporio-financeiro.ts`, `emporio-despesas.ts`, `emporio-clientes.ts`) e num helper puro de período (`src/lib/emporio/periodo.ts`); as rotas são finas; as telas leem as actions direto (Server Components) e filtram por `?ver=` e `?de=&ate=`. Sem migração.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7 (client escopado), Zod 4, suítes `tsx` em `scripts/`, roteiro Python em `scripts/navegador/`.

**Spec:** `docs/superpowers/specs/2026-11-17-emporio-informacao-amarrada-design.md`

## Global Constraints

- Nunca travessão (U+2014) em código, texto ou commit.
- `tenant_id` só pelo client escopado; as somas respeitam `lojasDoAtor` (quem vê uma loja só soma a loja dele).
- "Hoje" é `hojeEmBrasilia()`; dia de calendário como meia-noite UTC, como o resto do financeiro.
- Período na URL: `de` e `ate` em `AAAA-MM-DD`; padrão **Este mês** (dia 1 ao último dia do mês de Brasília). Esta semana é domingo a sábado.
- `?ver=` no A receber: `vencido | hoje | a_vencer | recebido`. No A pagar: `vencida | hoje | a_vencer | pago`.
- `expected_pct` = arredondamento inteiro de `realizado ÷ (realizado + aberto que vencia no período) × 100`; `null` quando o denominador é zero.
- Campos novos de API em snake_case, extensão aditiva, documentados em `/docs/api` (`npm run test:docs-api` verde).
- Cliente padrão ("Consumidor final", `EmporioCustomer` padrão da conta) não vira link.
- Dinheiro na tela por `reaisBr`; recusa de rota por `apiErroDeZod` / `fail(..., field)`.
- Suíte nova: `test:m120` (`scripts/m120-emporio-informacao-amarrada.test.ts`), com `exigirBancoLocal()` e `process.exit` no fim.

## Review Focus

1. **Loja do ator:** o Gestor de uma loja não soma fiado, cheque, boleto, cartão nem conta da outra loja em nenhum cartão. Teste na Task 4.
2. **Fuso no limite do período:** recebimento às 22h de Brasília do último dia do mês conta no mês, não no seguinte. Teste na Task 4.
3. **Cancelados:** venda cancelada, parcela de cartão cancelada (`canceled_at`), boleto cancelado e conta cancelada ficam fora de todos os cartões e listas. Teste na Task 4.
4. **Fiado pago em parte:** o recorte usa o aberto de cada lançamento, não o valor original. Teste na Task 4.
5. **Venda sem cliente ou com o padrão:** a parcela de cartão de venda sem cliente traz `customer_id` nulo e a tela não quebra; o padrão não vira link. Teste na Task 4 (API) e na Task 7 (roteiro).

---

### Task 1: período e resumo do A receber (servidor)

**Files:**
- Create: `src/lib/emporio/periodo.ts`
- Modify: `src/lib/actions/emporio-financeiro.ts` (`listarContasAReceberAction`, `CartaoAReceberView`, `AReceberView`, `ExtratoLinhaView` e o montador do extrato)
- Modify: `src/lib/actions/emporio-caixa.ts` (`FiadoClienteView` ganha os recortes; a lista de cartões do Caixa, se ela tiver view própria, ganha os mesmos campos de link)
- Modify: `src/app/api/v1/emporio/finance/receivables/route.ts`, `src/app/api/v1/emporio/finance/statement/route.ts` (só documentação dos campos novos, se a rota repassa a view)

**Interfaces:**
- Produces:
  - `type Periodo = { de: string; ate: string }` e `periodoDaUrl(sp: { de?: string; ate?: string }, hoje: Date): Periodo` (inválido ou ausente vira Este mês; `de > ate` vira Este mês)
  - `atalhosDePeriodo(hoje: Date): { id: "hoje" | "semana" | "mes" | "mes_passado"; rotulo: string; de: string; ate: string }[]`
  - `type Faixa = { total: number; count: number }`
  - `type ResumoAReceber = { overdue: Faixa; due_today: Faixa; upcoming: Faixa; received: Faixa & { expected_pct: number | null } }`
  - `type RecebimentoView = { id: string; kind: "dinheiro" | "pix" | "cartao" | "fiado" | "cheque" | "boleto"; occurred_on: string; customer_id: string | null; customer_name: string | null; sale_id: string | null; sale_number: number | null; establishment_id: string | null; establishment_name: string | null; amount: number; check_status?: string }`
  - `listarContasAReceberAction(db, ator, opts: { establishment_id?: string; de?: string; ate?: string })` devolve `AReceberView & { summary: ResumoAReceber; received_items: RecebimentoView[]; period: Periodo }`
  - `CartaoAReceberView` ganha `sale_number: number`, `customer_id: string | null`, `customer_name: string | null`
  - `FiadoClienteView` ganha `due_today_amount: number` e `upcoming_amount: number` (o `overdue_amount` já existe)
  - `ExtratoLinhaView` ganha `sale_id: string | null` e `customer_id: string | null`

- [ ] **Step 1:** implementar `periodo.ts` (puro, sem Prisma) e os campos de link das views.
- [ ] **Step 2:** implementar o `summary` pelas regras da seção 2 da spec: Vencido = fiado aberto com `effective_due_date` antes de hoje + cheques `recebido|depositado` com `good_for` antes de hoje + boletos `aberto` com `due_on` antes de hoje; Vence hoje e A vencer pela mesma regra com a data igual e depois, mais as parcelas de cartão não canceladas com `effective_on` hoje e depois. Recebido no período = recebimentos de fiado + cheques com `cleared_at` no período + boletos com `paid_on` no período + parcelas de cartão com `effective_on` no período e até hoje. O dinheiro e o PIX do ato da venda ficam fora (seção 2).
- [ ] **Step 3:** a rota aceita `de` e `ate` (Zod, `AAAA-MM-DD`, recusa com `field`), repassa à action e devolve os campos novos.
- [ ] **Step 4:** `npx tsc --noEmit` limpo e `npm run test:isolation` verde.
- [ ] **Step 5:** commit pela sessão principal (`Empório: resumo do A receber e campos de link`).

### Task 2: resumo do A pagar (servidor)

**Files:**
- Modify: `src/lib/actions/emporio-despesas.ts` (`ContaAPagarView` ganha `supplier_id`; nova `resumoDoAPagarAction`)
- Modify: a action e a view das aprovações (`financeiro-aprovacoes` lê de `src/lib/actions/emporio-*`): o lançamento ganha `supplier_id`
- Create: `src/app/api/v1/emporio/payables/summary/route.ts`

**Interfaces:**
- Consumes: `Periodo`, `periodoDaUrl`, `Faixa` (Task 1)
- Produces:
  - `type ResumoAPagar = { overdue: Faixa; due_today: Faixa; upcoming: Faixa & { undated_count: number }; paid: Faixa & { expected_pct: number | null } }`
  - `type PagamentoView = { id: string; paid_on: string; entry_id: string; name: string; supplier_id: string | null; supplier_name: string | null; origin: "vendeu_pagou" | "despesa_fixa" | "compra" | "frete" | "avulsa"; source_label: string; establishment_name: string | null; amount: number }`
  - `resumoDoAPagarAction(db, ator, opts: { establishment_id?: string; de?: string; ate?: string }): Promise<ActionResult<{ summary: ResumoAPagar; paid_items: PagamentoView[]; period: Periodo }>>`, com a mesma permissão de `listarContasAPagarAction`
  - `ContaAPagarView.supplier_id: string | null`

- [ ] **Step 1:** implementar a action pela seção 3 da spec (A vencer inclui as sem vencimento e conta `undated_count`; Pago = pagamentos de contas do Empório no período; conta cancelada fora).
- [ ] **Step 2:** rota GET fina (`guard` do Empório, Zod em `establishment_id`, `de`, `ate`).
- [ ] **Step 3:** `npx tsc --noEmit` e `npm run test:isolation`.
- [ ] **Step 4:** commit (`Empório: resumo do A pagar`).

### Task 3: ficha do cliente (servidor)

**Files:**
- Modify: `src/lib/actions/emporio-clientes.ts` (o `resumo` ganha `em_aberto`, `vencido`, `recebido`; nova `listarRecebimentosDoClienteAction`)
- Create: `src/app/api/v1/emporio/customers/[id]/receipts/route.ts`

**Interfaces:**
- Consumes: `RecebimentoView` (Task 1)
- Produces:
  - `resumo: { total_comprado: number; ultima_compra_em: string | null; vendas_ativas: number; em_aberto: number; vencido: number; recebido: number }`
  - `listarRecebimentosDoClienteAction(db, ator, customerId: string, opts: { before?: string; limit?: number }): Promise<ActionResult<{ items: RecebimentoView[]; next_before: string | null }>>`, limite padrão 20, nas lojas que o ator vê

- [ ] **Step 1:** implementar pelas regras da seção 5 da spec. Recebido = pagamentos da venda em dinheiro, PIX e cartão (na data da venda), recebimentos de fiado, boletos pagos e cheques compensados; cheque em carteira e devolvido fora; venda cancelada fora; devolução em dinheiro abate. A lista traz o cheque com `check_status` em qualquer situação, mas só o compensado soma.
- [ ] **Step 2:** rota GET fina com `before` e `limit` validados.
- [ ] **Step 3:** `npx tsc --noEmit` e `npm run test:isolation`.
- [ ] **Step 4:** commit (`Empório: Em aberto, Vencido e Recebido na ficha do cliente`).

### Task 4: suíte `test:m120` (escrita da spec, em paralelo às Tasks 1 a 3)

**Files:**
- Create: `scripts/m120-emporio-informacao-amarrada.test.ts`
- Modify: `package.json` (`"test:m120"`)

**Interfaces:**
- Consumes: as rotas da seção 6 da spec, chamadas pelo handler com `Request` construído, como as suítes vizinhas (ver `scripts/m119-cep.test.ts` e `scripts/m105-*.test.ts` para o padrão de sessão e de cenário).

- [ ] **Step 1:** escrever as seções, cada uma com as asserções numéricas: (a) A receber com fiado, cheque, boleto e cartão de ontem, hoje e amanhã: `summary.overdue`, `due_today`, `upcoming` com total e count exatos; (b) fiado pago em parte: o recorte usa o aberto; (c) Recebido dentro e fora do período, e o recebimento às 22h de Brasília do último dia do mês dentro do mês; (d) `expected_pct` com e sem previsto (`null`); (e) A pagar: vencida, hoje, a vencer, sem vencimento (`undated_count`), pago no período, conta cancelada fora; (f) ficha: `em_aberto`, `vencido` e `recebido` com cheque em carteira, compensado e devolvido, venda cancelada e devolução em dinheiro; (g) campos de link: `CartaoAReceberView.sale_number` e `customer_id` (nulo em venda sem cliente), `ExtratoLinhaView.sale_id`, `ContaAPagarView.supplier_id`; (h) Gestor de uma loja não soma a outra; (i) isolamento entre duas contas nas três rotas novas ou alteradas; (j) `de` inválido devolve 422 com `field`.
- [ ] **Step 2:** rodar contra o HEAD antes das Tasks 1 a 3 e registrar quantas falham (esperado: as das seções novas).
- [ ] **Step 3:** depois das Tasks 1 a 3: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m120` verde.
- [ ] **Step 4:** commit (`Empório: suíte m120 da informação amarrada`).

### Task 5: faixa de resumo, período e filtros (tela)

**Files:**
- Create: `src/app/(dashboard)/emporio/_components/periodo-filtro.tsx` (`PeriodoFiltro`)
- Create: `src/app/(dashboard)/emporio/_components/resumo-faixa.tsx` (`ResumoFaixa`, cartões que são links `?ver=`, o ativo destacado, "Ver tudo")
- Create: `src/app/(dashboard)/emporio/_components/recebidos-lista.tsx` e `pagos-lista.tsx`
- Modify: `financeiro/receber/page.tsx`, `_components/financeiro-receber.tsx`, `_components/cartoes-a-receber.tsx`, `financeiro/pagar/page.tsx`, `_components/contas-a-pagar.tsx`
- Modify: `_components/financeiro-extrato.tsx`, `_components/financeiro-relatorios.tsx` / `relatorios-filtro.tsx`, `historico/page.tsx` (trocar os campos de data soltos pelo `PeriodoFiltro`, sem mudar o sentido do período de cada tela)

**Interfaces:**
- Consumes: Tasks 1 e 2 (`summary`, `received_items`, `paid_items`, `period`, `atalhosDePeriodo`)
- Produces: `PeriodoFiltro({ caminho, de, ate, extras })` e `ResumoFaixa({ cartoes, ativo, caminho, params })`, reusados na Task 6

- [ ] **Step 1:** A receber: a faixa com Vencido, Vence hoje, A vencer e Recebido (total, quantidade e, no Recebido, o %); `?ver=` filtra as quatro seções pela regra da spec (no fiado, a linha mostra o valor do recorte ao lado do total); `?ver=recebido` mostra a `RecebidosLista`; o filtro Vencido na seção de cartões mostra a frase da spec.
- [ ] **Step 2:** A pagar: a mesma faixa (Vencida, Vence hoje, A vencer, Pago) e a `PagosLista`.
- [ ] **Step 3:** Extrato, Relatórios e Histórico com o `PeriodoFiltro`.
- [ ] **Step 4:** `npm run check`, `npx tsc --noEmit`, `npm run lint` limpos; abrir as telas no `next dev` (390 px e computador).
- [ ] **Step 5:** commit (`Empório: cartões que filtram no A receber e no A pagar, e o seletor de período`).

### Task 6: links e ficha do cliente (tela)

**Files:**
- Modify: as telas da tabela da seção 1 da spec (o levantamento de 17/11 com arquivo e linha está no relato do explorador; resumo: `financeiro-receber.tsx`, `boletos-lista.tsx`, `cartoes-a-receber.tsx`, `caixa/page.tsx`, `financeiro-extrato.tsx`, `contas-a-pagar.tsx`, `financeiro-aprovacoes.tsx`, `vendas/page.tsx`, `vendas/[id]/page.tsx`, `orcamentos/page.tsx`, `orcamentos/[id]/page.tsx`, `fiado/page.tsx`, `balcao.tsx`, `financeiro-relatorios.tsx`, `resultado-margem-negativa.tsx`)
- Modify: `clientes/[id]/page.tsx` (cartões da seção 5) e Create `clientes/_components/recebimentos-do-cliente.tsx` (lista com "Ver mais")

**Interfaces:**
- Consumes: Tasks 1 a 3

- [ ] **Step 1:** os links da tabela da seção 1, com "Venda nº X (i/n)" na linha do cartão a receber; o cliente padrão sem link.
- [ ] **Step 2:** a ficha com Total comprado, Última compra, Em aberto, Vencido, Recebido e a lista de recebimentos.
- [ ] **Step 3:** `npm run check`, `tsc`, `lint`; abrir no `next dev`.
- [ ] **Step 4:** commit (`Empório: cliente, fornecedor e venda amarrados por link; ficha do cliente com o que recebeu`).

### Task 7: roteiro de navegador `emporio-informacao-amarrada`

**Files:**
- Create: `scripts/navegador/emporio-informacao-amarrada.py` (cenário próprio, prefixo de nome para `--limpar`, sessões do Dono e de um Gestor de uma loja)

- [ ] **Step 1:** passos: clicar em cada cartão do A receber e do A pagar e conferir o filtro; trocar o período e ver o Recebido mudar; da linha do cartão a receber à venda, da venda ao cliente, do cliente à venda; a ficha com os cinco cartões e a lista; o Gestor não vê a loja alheia; 390 px.
- [ ] **Step 2:** íntegro: 0 falhas. Sabotado (o Recebido soma o dinheiro do ato da venda, ou o filtro `?ver=vencido` ignorado): falha nos passos certos. Restaurado: 0 falhas.
- [ ] **Step 3:** commit (`Empório: roteiro da informação amarrada`).

### Task 8: fechamento (sessão principal)

- [ ] `/docs/api` com as duas rotas novas e os campos novos; `npm run test:docs-api` verde.
- [ ] Manual: as figuras do A receber, do A pagar e da ficha (`npm run navegador -- manual-emporio`), regravando só as que mudaram.
- [ ] `npm run test:all -- --sem-redis` verde; juiz independente sobre o range da branch.
- [ ] Q345 a Q348 na spec do módulo 39; handoff; pedir ao usuário o merge (sem migração).
