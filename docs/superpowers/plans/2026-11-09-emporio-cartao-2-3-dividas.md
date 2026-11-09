# Empório, cartão entregas 2 e 3 (dia útil, taxa por parcela, antecipação) e dívidas técnicas. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a parcela do cartão cai em dia útil, guarda a própria taxa e a data e o líquido efetivos; a antecipação pontual e a automática existem como fato gravado com custo em despesa financeira; o cancelamento segue a regra da Stone; quatro dívidas técnicas saem junto.

**Architecture:** `CardReceivable` ganha `fee_amount`, `effective_on`, `effective_net`, `anticipation_fee`, `anticipation_id`; `CardAcquirer` ganha a configuração (dia útil, devolução da taxa, antecipação automática); nasce `CardAnticipation`. Funções puras novas em `src/lib/emporio/dia-util.ts` (calendário) e em `src/lib/emporio/cartao.ts` (datas com regra, custo e rateio da antecipação), usadas pelo servidor e pelo balcão. Todo leitor de "caiu / a receber" troca `expected_on`/`net_amount` por `effective_on`/`effective_net`.

**Tech Stack:** Next.js 16, Prisma 7, Zod 4, suítes `tsx` no Docker, roteiro Python no Chrome de testes.

**Spec:** `docs/superpowers/specs/2026-11-09-emporio-cartao-entregas-2-e-3-design.md` (Q259 a Q267).

## Global Constraints

- Invariantes do `CLAUDE.md`: `tenant_id` nunca do client; model novo em `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts`); nenhum saldo gravado; action, rota, tela; `FinancialEntry` só por `createLinkedEntry`; `registrarNoHistorico` em toda escrita do Empório; sem travessão; sem heredoc com escape.
- Migração só no Docker (URL inline `postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public`); sem os dois `DROP INDEX` parciais; **preenche** os recebíveis existentes: `fee_amount = gross_amount - net_amount`, `effective_on = expected_on`, `effective_net = net_amount`.
- Feriados (Q259): 1/1, 21/4, 1/5, 7/9, 12/10, 2/11, 15/11, 20/11, 25/12; móveis pela Páscoa: Carnaval segunda e terça (Páscoa menos 48 e menos 47 dias), Sexta-feira Santa (menos 2), Corpus Christi (mais 60). Sábado e domingo não são úteis.
- Enum `CardBusinessDayRule { proximo_dia_util dias_corridos }`, padrão `proximo_dia_util` nas adquirentes novas **e nas existentes**.
- Antecipação automática só no crédito (`credito_vista`, `credito_parcelado`); custo por parcela = `round(liquido_cent × pct / 100 × dias / 30)`, `dias` = corridos entre `effective_on` e `expected_on` (0 se negativo).
- Rateio do custo da pontual: proporcional ao `effective_net`, em centavos, resto na última parcela (pela ordem de `expected_on`, depois `id`).
- Categoria nova reservada: `"Antecipação de recebíveis"` (acrescentar a `CATEGORIAS_RESERVADAS` em `src/lib/emporio/vendeu-pagou.ts`).
- Vendas e parcelas antigas não são recalculadas (só o preenchimento da migração).
- Recusa por campo no campo; nenhuma cor crua; nenhum `<input type="number">`; dinheiro em formato brasileiro.
- Subagente não commita; não recebe autorização de merge, push na `main`, deploy nem Neon. Sonnet implementa e revisa; sem juiz Opus.

## Review Focus

1. **Venda no sábado no débito (`days` 1):** a parcela cai na segunda (domingo não é útil); com `dias_corridos`, no domingo. Teste na Task 1 (puro) e na Task 2 (venda).
2. **Venda em 3x antecipada pontualmente e depois cancelada:** o estorno sai pelo líquido efetivo, a despesa de antecipação fica, a de taxa é cancelada (adquirente com `refunds_mdr_on_cancel` sim). Teste na Task 3.
3. **Saldo da conta no dia da antecipação:** as três parcelas futuras somem do "a receber" e entram no saldo pelo líquido efetivo naquele dia, não nas datas originais. Teste na Task 3.
4. **Antecipar parcela de outra conta, já antecipada ou vencida:** recusa no campo `receivable_ids`. Teste na Task 4.
5. **Duas vendas em fiado simultâneas do mesmo cliente no limite (2.37):** a segunda é recusada `LIMITE_EXCEDIDO`. Teste na Task 2.

---

### Task 1: Schema, migração com preenchimento, calendário e funções puras

**Files:**
- Modify: `prisma/schema.prisma` (`CardAcquirer` l.1488; `CardReceivable` l.1543; enums novos; model novo; relações)
- Create: `prisma/migrations/20261110090000_emporio_cartao_dia_util_antecipacao/migration.sql`
- Create: `src/lib/emporio/dia-util.ts`
- Modify: `src/lib/emporio/cartao.ts` (l.108 `datasDasParcelas` ganha a regra; funções novas)
- Modify: `src/lib/prisma.ts` (`TENANT_SCOPED_MODELS`: `CardAnticipation`)
- Modify: `src/lib/emporio/vendeu-pagou.ts` (`CATEGORIAS_RESERVADAS`)

**Interfaces:**
- Produces (schema):
  - `enum CardBusinessDayRule { proximo_dia_util dias_corridos }` e `enum CardAnticipationKind { pontual automatica }`.
  - `CardAcquirer` ganha `business_day_rule CardBusinessDayRule @default(proximo_dia_util)`, `refunds_mdr_on_cancel Boolean @default(true)`, `auto_anticipation_enabled Boolean @default(false)`, `auto_anticipation_pct_month Decimal? @db.Decimal(5,2)`, `auto_anticipation_business_days Int @default(1)`, `auto_anticipation_since DateTime? @db.Date`, relação `anticipations CardAnticipation[]`.
  - `CardReceivable` ganha `fee_amount Decimal @default(0) @db.Decimal(14,2)`, `effective_on DateTime @db.Date`, `effective_net Decimal @db.Decimal(14,2)`, `anticipation_fee Decimal? @db.Decimal(14,2)`, `anticipation_id String?` (relação `anticipation CardAnticipation?`, `onDelete: SetNull`), `@@index([tenant_id, bank_account_id, effective_on])`.
  - `model CardAnticipation { id, tenant_id, acquirer_id String?, bank_account_id, operated_on DateTime @db.Date, kind CardAnticipationKind, gross_amount, expected_net, received_net, fee_amount (Decimal 14,2), notes String?, undone_at DateTime?, undone_by_user_id String?, created_by_user_id String?, created_at; relações tenant, acquirer (Restrict), bank_account (Restrict), receivables CardReceivable[]; @@index([tenant_id, operated_on]) }`.
- Produces (SQL): colunas novas com `effective_on`/`effective_net` primeiro nuláveis; `UPDATE "CardReceivable" SET fee_amount = gross_amount - net_amount, effective_on = expected_on, effective_net = net_amount`; depois `SET NOT NULL`; `ALTER TABLE "CardFeeRate" ADD CONSTRAINT "CardFeeRate_faixa_check" CHECK (installments_from >= 1 AND installments_to <= 12 AND installments_from <= installments_to)` (2.59).
- Produces (`src/lib/emporio/dia-util.ts`, puro, sem import de servidor):
  ```ts
  export function pascoa(ano: number): Date;                  // meia-noite UTC
  export function feriadosNacionais(ano: number): Set<string>; // "AAAA-MM-DD"
  export function ehDiaUtil(dia: Date): boolean;              // dia = meia-noite UTC (como expected_on)
  export function proximoDiaUtil(dia: Date): Date;            // o próprio dia se útil
  export function somarDiasUteis(dia: Date, n: number): Date; // n >= 0; n = 0 devolve proximoDiaUtil(dia)
  ```
- Produces (`src/lib/emporio/cartao.ts`):
  ```ts
  export type RegraDiaUtil = "proximo_dia_util" | "dias_corridos";
  export function datasDasParcelas(vendidoEm: Date, dias: number, n: number, regra: RegraDiaUtil = "dias_corridos"): Date[];  // o padrão mantém os chamadores antigos
  export function custoAntecipacaoCent(liquidoCent: number, pctMes: number, efetivo: Date, previsto: Date): number;
  export function ratearCustoCent(custoCent: number, liquidosCent: number[]): number[];  // proporcional, resto na última
  export const CATEGORIA_ANTECIPACAO = "Antecipação de recebíveis";
  ```

- [ ] **Step 1: Prova pura** (outro agente escreve a suíte inteira em paralelo; aqui, num `tsx` descartável no scratchpad): `pascoa(2026)` = 2026-04-05; feriados de 2026 incluem 2026-02-16, 2026-02-17, 2026-04-03, 2026-06-04, 2026-11-20; `proximoDiaUtil(sábado 2026-11-14)` = 2026-11-16; `proximoDiaUtil(2026-11-20)` (sexta, feriado) = 2026-11-23; `somarDiasUteis(sexta 2026-11-13, 1)` = 2026-11-16; `datasDasParcelas(sábado 2026-11-14 10h Brasília, 1, 1, "proximo_dia_util")` = [2026-11-16] e com `"dias_corridos"` = [2026-11-15]; `datasDasParcelas(2026-11-09, 30, 3, "proximo_dia_util")` = [2026-12-09, 2027-01-08, 2027-02-10] (2027-02-07 é domingo e 8 e 9 são Carnaval); `custoAntecipacaoCent(10000, 2.5, 2026-11-10, 2026-12-10)` = 250; `ratearCustoCent(100, [5000, 3000, 2000])` = [50, 30, 20]; `ratearCustoCent(10, [3333, 3333, 3334])` soma 10.
- [ ] **Step 2: Schema, migração com preenchimento e CHECK, `TENANT_SCOPED_MODELS`, `dia-util.ts`, `cartao.ts`, `CATEGORIAS_RESERVADAS`.** Antes do `db:deploy`, garanta recebíveis no banco local (uma venda em cartão pela action, ou os que já existem) e, depois, prove que ganharam `fee_amount = gross - net` e efetivos iguais aos previstos. `npx prisma generate`.
- [ ] **Step 3: Verificar** `migrate diff` vazio; prova pura; `test:isolation`; `tsc` (liste o que quebrar por `effective_on` obrigatório no `createMany`: esperado até a Task 2).
- [ ] **Step 4: Commit** (sessão principal).

---

### Task 2: A venda grava dia útil, taxa por parcela, efetivos e a antecipação automática; fiado sem corrida (2.37)

**Files:**
- Modify: `src/lib/actions/emporio-vendas.ts` (`prepararVenda` l.774, bloco do crédito do fiado ~l.1050; `gravarVenda`, recebíveis ~l.1377-1395; despesa da taxa ~l.1487)
- Modify: `src/lib/actions/emporio-credito.ts` (`estadoDeCredito` l.112 passa a aceitar o client da transação)
- Test: m104 seções 2 (venda) e 6 (fiado concorrente)

**Interfaces:**
- Consumes: Task 1.
- Produces: `prepararVenda` carrega da adquirente da linha resolvida `business_day_rule` e a configuração da automática e põe em `PagamentoPreparado.cartao` (`regra_dia_util`, `auto: { pct_mes, dias_uteis } | null`, já filtrado por crédito e `since`); `gravarVenda`: `datas = datasDasParcelas(sold_at, days, n, regra)`; cada parcela com `fee_amount = bruta_i - liquida_i`, `effective_on = datas[i]`, `effective_net = liquida_i`; com `auto`: cria `CardAnticipation` `kind: "automatica"` (`operated_on = somarDiasUteis(dia(sold_at), dias_uteis)`, bruto, líquido previsto, recebido = previsto menos custo, custo) e cada parcela `effective_on = operated_on`, `anticipation_fee = custoAntecipacaoCent(...)`, `effective_net = liquida_i - fee`, `anticipation_id`; despesa `CATEGORIA_ANTECIPACAO` paga, `related_id` = id da antecipação, loja da venda, data da venda. 2.37: dentro da transação de `gravarVenda`, quando há fiado, `estadoDeCredito(tx, customerId, { semAVenda })` de novo e as mesmas recusas (`FIADO_BLOQUEADO`, `LIMITE_EXCEDIDO`) por `AbortarVenda`.

- [ ] **Step 1: Seções 2 e 6 da m104** (a suíte é da Task 5; rode as seções quando existirem, senão prove por `tsx` descartável): venda no débito num sábado → parcela na segunda; adquirente com `dias_corridos` → domingo; venda 3x de 300 a 3,5% → `fee_amount` das parcelas soma 10,50 e cada uma é bruta menos líquida; efetivos iguais aos previstos; adquirente com automática 2,5% a.m. desde ontem, venda 3x no crédito hoje → `CardAnticipation` automática, parcelas com `effective_on` = dia da venda mais 1 dia útil, custos pro rata pelos dias até cada previsto, despesa "Antecipação de recebíveis" paga com o total; venda no débito com automática → não antecipa; automática com `since` amanhã → não antecipa; fiado: cliente com limite 500 devendo 450, duas `venderAction` de 40 em fiado com `Promise.all` → nunca as duas ok (uma ok e a outra `LIMITE_EXCEDIDO`, ou conflito serializável seguido de recusa).
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Rodar** m104 (seções da task), `test:m82`, `test:m99`, `test:m102`, `test:m103`, `tsc`, `lint`.
- [ ] **Step 4: Commit** (sessão principal).

---

### Task 3: Leitores pelos efetivos e cancelamento como a Stone

**Files:**
- Modify: `src/lib/actions/emporio-caixa.ts` l.517-519 e l.1076-1077; `src/lib/actions/emporio-financeiro.ts` l.215, 234-235, 284-285, 404-416, 528; `src/lib/actions/emporio-projecao.ts` l.103-104; `src/lib/actions/emporio-relatorios-financeiro.ts` l.266-268
- Modify: `src/lib/actions/emporio-vendas.ts` (`cancelarNaTransacao` l.1683, bloco das parcelas ~l.1740-1775)
- Test: m104 seções 3 (saldo e a receber) e 4 (cancelamento)

**Interfaces:**
- Produces: toda condição `expected_on` de "caiu até / a receber depois" vira `effective_on`, todo valor `net_amount` somado vira `effective_net` (carimbo de conciliação e extrato inclusive); as views que listam parcelas ganham `effective_on`, `effective_net`, `fee_amount`, `anticipated: boolean` e mantêm `expected_on`/`net_amount`. Cancelamento: parcela com `effective_on <= hoje` é estornada por `effective_net`; futura não antecipada é cancelada; a despesa `CATEGORIA_TAXAS_CARTAO` é cancelada só se a adquirente do pagamento tem `refunds_mdr_on_cancel` (pagamento sem adquirente: cancela, como hoje); a despesa `CATEGORIA_ANTECIPACAO` nunca é cancelada pelo cancelamento da venda.

- [ ] **Step 1: Seções 3 e 4 da m104:** depois de uma antecipação pontual (Task 4; enquanto não existir, crie o estado direto no banco: `effective_on` = hoje, `effective_net` menor, `anticipation_fee`), o saldo da conta soma os líquidos efetivos hoje e o "a receber do cartão" não as lista como futuras; a projeção de 30 dias não as conta; cancelar a venda: estorno = soma dos efetivos, despesa de taxa cancelada, despesa de antecipação fica; com `refunds_mdr_on_cancel` falso, a de taxa fica.
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Rodar** m104, `test:m82`, `test:m98`, `test:m100`, `test:m101`, `test:m103`, `tsc`, `lint`.
- [ ] **Step 4: Commit** (sessão principal).

---

### Task 4: Antecipação pontual e configuração da adquirente; linha no Resultado; 2.59 do servidor

**Files:**
- Create: `src/lib/actions/emporio-antecipacao.ts`
- Create: `src/app/api/v1/emporio/card-anticipations/route.ts` (GET lista, POST antecipar), `card-anticipations/[id]/undo/route.ts` (POST)
- Modify: `src/lib/actions/emporio-cartoes.ts` (criar e editar adquirente com os campos novos; edição e arquivamento numa transação só quando o PATCH traz os dois; sobreposição de taxa dentro de `runSerializableTenantTransaction`)
- Modify: `src/app/api/v1/emporio/card-acquirers/route.ts` e `[id]/route.ts` (Zod dos campos novos)
- Modify: `src/lib/actions/emporio-resultado.ts` (`anticipation_costs`, `result`, visão somada)
- Modify: `src/lib/emporio/historico.ts` (rótulos `cartao.antecipar`, `cartao.antecipacao.desfazer`)
- Modify: `src/app/(public)/docs/api/endpoints.ts`
- Test: m104 seções 5 (pontual) e 7 (Resultado e configuração)

**Interfaces:**
- Produces:
  - `AntecipacaoView = { id, kind, acquirer_name: string | null, bank_account_id, bank_account_name, operated_on, gross_amount, expected_net, received_net, fee_amount, effective_pct_month: number | null, receivables_count, undone_at: string | null, can_undo: boolean }`.
  - `listarAntecipacoesAction(db, ator, { de?, ate?, establishment_id? })`.
  - `anteciparAction(db, ator, { receivable_ids: string[]; operated_on: Date; received_net: number; notes?: string | null })`: permissão `exigirUma(["gestor_da_loja", "dinheiro"])` nas lojas das parcelas; recusas `VALIDATION_ERROR` campo `receivable_ids`: lista vazia, cancelada, já antecipada, `effective_on <= operated_on`, contas bancárias diferentes (parcela inexistente ou de loja não visível: 404); campo `received_net`: maior que zero e no máximo a soma dos líquidos efetivos; campo `operated_on`: não no futuro. Grava a operação, rateia o custo (`ratearCustoCent`), atualiza as parcelas, uma despesa `CATEGORIA_ANTECIPACAO` paga por loja (`related_id` = id da operação), histórico. `effective_pct_month` = custo / previsto × 100 × 30 / (média dos dias antecipados ponderada pelo líquido), 2 casas, nulo se dias = 0.
  - `desfazerAntecipacaoAction(db, ator, id)`: `ANTECIPACAO_CONCILIADA` 409 se alguma parcela tem `reconciled_at`; `ANTECIPACAO_DESFEITA` 409 se já desfeita; recusa a automática (`VALIDATION_ERROR`: "A antecipação automática se desfaz cancelando a venda"); volta as parcelas (`effective_on = expected_on`, `effective_net = net_amount`, `anticipation_fee = null`, `anticipation_id = null`), cancela as despesas, marca `undone_at`.
  - Adquirente: criar e editar aceitam `business_day_rule`, `refunds_mdr_on_cancel`, `auto_anticipation_enabled`, `auto_anticipation_pct_month` (0 a 20), `auto_anticipation_business_days` (0 a 30), `auto_anticipation_since`; ligar a automática exige pct e since (recusa no campo de cada um); `AdquirenteView` traz os seis.
  - Resultado: `anticipation_costs` = soma das despesas `CATEGORIA_ANTECIPACAO` não canceladas da loja no mês (por `occurred_at`); `result` subtrai; `stores[]` idem.

- [ ] **Step 1: Seções 5 e 7 da m104:** três parcelas futuras de líquido 100 cada na mesma conta; antecipar hoje recebendo 291 → custo 9 rateado 3/3/3, efetivos hoje com 97 cada, despesa paga 9, `effective_pct_month` preenchido; as recusas da lista acima; desfazer → parcelas voltam, despesa cancelada; desfazer de novo → `ANTECIPACAO_DESFEITA`; carimbar uma parcela e tentar desfazer → `ANTECIPACAO_CONCILIADA`; tenant B não vê nem antecipa; adquirente ligando a automática sem pct → recusa no campo; Resultado do mês com a antecipação: `anticipation_costs` 9 e `result` 9 menor.
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Rodar** m104, `test:m83`, `test:m84`, `test:m103`, `test:docs-api`, `test:isolation`, `tsc`, `lint`.
- [ ] **Step 4: Commit** (sessão principal).

---

### Task 5: Suíte m104 escrita da spec (onda 1)

**Files:**
- Create: `scripts/m104-emporio-cartao-antecipacao.test.ts`; `package.json` `"test:m104"` depois de `test:m103`

**Interfaces:**
- Consumes: só a spec e os blocos Interfaces e Step 1 das Tasks 1 a 4 e 6. Módulos novos por `import()` com especificador em variável, como a `m103`. Sete seções: 1 calendário e funções puras, 2 venda, 3 saldo e a receber, 4 cancelamento, 5 antecipação pontual, 6 fiado concorrente, 7 Resultado e configuração; mais o isolamento.

- [ ] **Step 1: Escrever** com as asserções copiadas dos briefs; registrar o script; rodar no HEAD: compila e falha por ausência.
- [ ] **Step 2: Commit** (sessão principal).

---

### Task 6: Pedidos decididos paginados no banco (2.43)

**Files:**
- Modify: `src/lib/actions/emporio-aprovacoes.ts` (~l.46 `take: 200` e o filtro posterior)
- Modify: a rota e a tela que listam os decididos só se a assinatura mudar (`?before=`)
- Test: um check numa suíte que já cobre pedidos (`m100`): com 205 pedidos decididos, a lista filtrada por loja traz o mais antigo pela paginação

**Interfaces:**
- Produces: a lista de decididos filtra loja e status no `where` e pagina por `take` mais cursor (`before` = `decided_at` do último); a página continua com 200.

- [ ] **Step 1: Teste, implementação, `test:m100`, `tsc`, `lint`.**
- [ ] **Step 2: Commit** (sessão principal).

---

### Task 7: Telas

**Files:**
- Modify: `src/app/(dashboard)/emporio/configuracoes/_components/adquirente-form.tsx` e `cartoes-secao.tsx` (os seis campos da adquirente; o bloco da automática aparece ao ligar)
- Modify: `src/app/(dashboard)/emporio/_components/financeiro-receber.tsx` (marcar parcelas futuras da mesma conta, "Antecipar" em painel do kit: data, líquido recebido, custo e % efetivo calculados na tela; parcelas antecipadas com data efetiva e selo; lista das operações com "Desfazer")
- Modify: `src/app/(dashboard)/emporio/_components/venda-estado.ts` e `venda-campos.tsx` (a prévia usa `datasDasParcelas` com a regra e, com a automática, mostra "antecipado: cai em DD/MM, líquido estimado R$ Y"; a recusa `acquirer_id` aparece também com uma só adquirente: 2.59)
- Modify: `src/app/(dashboard)/emporio/vendas/[id]/page.tsx` (pagamento com a taxa fixa à parte: 2.59; parcelas com efetivo)
- Modify: `src/app/(dashboard)/emporio/_components/resultado-mes.tsx` (linha "Antecipação de recebíveis")

**Interfaces:**
- Consumes: rotas da Task 4; views das Tasks 3 e 4; `datasDasParcelas`, `custoAntecipacaoCent`, `somarDiasUteis` (puros). A configuração da adquirente vem de `GET /card-acquirers`.

- [ ] **Step 1: Implementar.** `tsc`, `lint`, `npm run check`.
- [ ] **Step 2: Commit** (sessão principal).

---

### Task 8: Roteiro, manual, docs e handoff

**Files:**
- Create: `scripts/_cenario-emporio-antecipacao.ts`, `scripts/navegador/emporio-antecipacao.py` (Configurações: regra de dia útil e automática; balcão: venda 3x com a prévia antecipada; a receber: antecipar três parcelas recebendo menos, conferir custo e saldo, desfazer; Resultado com a linha; sabotagem: `effective_net` ignorado no saldo faz reprovar)
- Modify: manual (`src/app/(dashboard)/manual/_conteudo/`: cartão e financeiro), `docs/agents/dividas.md` (fechar 2.37, 2.43, 2.51, 2.56, 2.57, 2.59; abrir 2.60 feriado estadual e municipal, 2.61 custo efetivo do cartão como indicador), `docs/agents/financeiro-emporio-relatorio.md`; o handoff fica com a sessão principal (inclui corrigir a linha das branches, já apagadas)

- [ ] **Step 1: Cenário e roteiro verdes; sabotagem reprova; desfazer.**
- [ ] **Step 2: Manual, dívidas, relatório.**
- [ ] **Step 3: Gates finais** (sessão principal): `check`, `tsc`, `lint`, `build`, `test:isolation`, `test:m104`, `test:all -- --sem-redis`, `migrate diff` vazio; handoff.

---

## Ondas

| onda | tarefas | agentes (Sonnet) | depende de |
|---|---|---|---|
| 1 | Task 1, Task 5 | `servidor-acao`, `prova-suite` | nada |
| 2 | Task 2, Task 4, Task 6 | `servidor-acao` x3 (arquivos disjuntos: vendas e crédito; antecipação, cartões, resultado, rotas; aprovações) | 1 |
| 3 | Task 3, Task 7 | `servidor-acao`, `tela-pagina` | 2 |
| 4 | Task 8 | `general-purpose` (papel do `prova-viva`) | 3 |

Revisão: um revisor Sonnet depois da onda 3 e um na branch inteira. A sessão principal commita uma tarefa por vez.
