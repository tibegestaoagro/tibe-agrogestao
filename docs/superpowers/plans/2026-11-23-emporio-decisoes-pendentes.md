# Empório: decisões pendentes de 23/11 (Q374 a Q384), plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pôr em código as decisões do usuário de 23/11 (ficha do cliente,
botão da antecipação, franqueado no Caixa e na devolução, pontas da Q187),
arrumar as suítes que quebram em feriado e as sobras pequenas da 5.31.

**Architecture:** regra nas actions (`src/lib/actions/emporio-*.ts`), tela
depois; uma migração aditiva só (coluna do crédito devolvido na devolução).
Suíte nova `test:m129`, escrita da spec, seção por tarefa.

**Tech Stack:** Next.js 16, Prisma 7, Postgres (Docker local), roteiros Python
em `scripts/navegador/`.

**Spec:** [../specs/2026-11-23-emporio-decisoes-pendentes.md](../specs/2026-11-23-emporio-decisoes-pendentes.md)

Branch: `emporio-decisoes-pendentes` (a partir da `main` em `c8821002`).

## Global Constraints

- Nunca travessão (U+2014). Texto de tela em português simples.
- `tenant_id` só pelo client escopado; saldo do franqueado **calculado**, nunca gravado (invariante 2).
- Toda escrita do Empório chama `registrarNoHistorico` na mesma transação (conferência 19).
- Todo `<Field>` cujo id está no `ORDEM` recebe `error=`; recusa de campo que não está na tela vai ao rodapé (conferência 15 e nota do cofre `campo-no-ordem-sem-error-engole-a-recusa`).
- Fixture de leitura nasce pela action de escrita (nota `o-teste-que-monta-o-dado-no-banco-aprova-o-que-a-action-nunca-grava`).
- Roteiro procura dentro de um bloco, nunca o primeiro da página por texto comum.
- Migração: SQL gerado com a URL do Docker inline; aplicar no Docker; Neon só com autorização do usuário, antes do push.
- Subagente não commita; a sessão principal commita uma tarefa por vez.

## Review Focus

1. Devolução parcial em duas vezes do mesmo item: a soma do crédito devolvido não pode passar do crédito rateado nesse item (sem centavo a mais nem a menos quando tudo voltar).
2. Ficha com recebimento agendado E vencido ao mesmo tempo: o "Vencido" não pode contar o agendado duas vezes nem sumir com ele.
3. Venda de orçamento pela API sem `customer_id`: assume o do orçamento ou recusa, mas nunca grava sem cliente.
4. Editar orçamento antigo que já fatura: a recusa de linha repetida não pode bloquear o faturamento de orçamento salvo antes da regra (produção tem zero, o dev pode ter).
5. Caixa abrindo a aba Franqueados: continua sem acesso; só a lista da venda abre para ele.

---

## Ordem de prioridade

| # | tarefa | por que nesta posição |
|---|---|---|
| 1 | suítes `m98` e `m100` em feriado | 15 min; o `test:all` verde é a régua das outras |
| 2 | ficha do cliente (Q375) | a Laiza e a Cláudia estão validando a baixa agora |
| 3 | orçamento faturado (Q382 a Q384) | dinheiro: preço orçado vazando para outro cliente ou para orçamento vencido |
| 4 | franqueado na devolução (Q379) | dinheiro; única migração; nenhuma venda com crédito em produção ainda |
| 5 | franqueado no Caixa (Q378) | pequena, só tela e uma leitura |
| 6 | botão da antecipação (Q377) | pequena, só tela e view |
| 7 | sobras pequenas da 5.31 | sem efeito para o usuário |
| 8 | documentação | fecha 5.31, Q187 e as pendências |
| 9 | juiz, roteiros no navegador, `test:all` | validação antes do merge |

Q374, Q376, Q380 e Q381 não têm código: entram só na documentação (tarefa 8).

---

### Task 1: suítes que supõem dia útil

**Files:**
- Modify: `scripts/m98-emporio-financeiro-casa.test.ts` (fixture de cartão perto da linha 681)
- Modify: `scripts/m100-emporio-financeiro-acordo.test.ts` (parcelas "vencendo hoje", linhas 97, 417, 585)

**Interfaces:**
- Consumes: `ehDiaUtil(dia: Date): boolean` e `proximoDiaUtil(dia: Date): Date` de `src/lib/emporio/dia-util.ts` (Date = meia-noite UTC do dia).

- [ ] **Step 1:** rodar as duas suítes com a data de um feriado forçada (por variável que o próprio teste leia, ex. `TIBE_HOJE=2026-11-20`, se a suíte já tiver algo assim; senão, conferir lendo o código onde "hoje" entra) e ver qual check falha.
- [ ] **Step 2:** onde o teste supõe que a parcela de cartão de hoje vence hoje, usar `proximoDiaUtil` para o dia esperado; onde a leitura "de hoje" não acharia parcela num feriado, o check passa a esperar a lista vazia quando `!ehDiaUtil(hoje)`. O sistema não muda.
- [ ] **Step 3:** rodar `npm run test:m98` e `npm run test:m100` (URLs do Docker inline): verdes.
- [ ] **Step 4:** commit `Suítes m98 e m100 não supõem mais que hoje é dia útil`.

### Task 2: ficha do cliente, agendado continua em aberto (Q375)

**Files:**
- Modify: `src/lib/actions/emporio-clientes.ts` (`leituraFinanceiraDoCliente`, totais por volta das linhas 620 a 640)
- Modify (se o texto da linha precisar): `src/app/(dashboard)/emporio/clientes/_components/recebimentos-do-cliente.tsx`
- Create: `scripts/m129-emporio-decisoes-pendentes.test.ts` (seção 2) e a entrada `test:m129` no `package.json`

**Interfaces:**
- Produces: `resumo.em_aberto` passa a somar os itens `scheduled` de fiado, de cheque compensado com data futura e de boleto pago com data futura. `resumo.recebido` não muda (já tira os agendados). O "Vencido" não muda.

- [ ] **Step 1: teste que falha.** Cliente com fiado de R$ 100 (venda pela action), recebimento de R$ 40 com data de amanhã por `receberFiadoAction` (a action real, com papel que pode mudar a data), cheque de R$ 30 compensado amanhã pela action do cheque, boleto de R$ 20 pago com `paid_on` amanhã por `pagarBoletoAction`. Esperado: `em_aberto` inclui os 40, os 30 e os 20; `recebido` não inclui nenhum; `em_aberto + recebido` igual ao total vendido. Mesmo cenário com a data de hoje: os três saem do em aberto e entram no recebido.
- [ ] **Step 2:** rodar `npm run test:m129`; falha na seção 2.
- [ ] **Step 3:** somar os agendados ao `em_aberto` na leitura (não em `listarFiadoAction`, que é a lista do caixa e fica como está).
- [ ] **Step 4:** `npm run test:m129` e `npm run test:m128` verdes.
- [ ] **Step 5:** commit.

### Task 3: orçamento faturado (Q382, Q383, Q384)

**Files:**
- Modify: `src/lib/actions/emporio-vendas.ts` (`orcamentoAFaturar` ~928, validade ~980, cliente ~1147)
- Modify: `src/lib/actions/emporio-orcamentos.ts` (`salvarOrcamentoAction` ~628, `editarOrcamentoAction` ~772)
- Modify: a tela de venda que nasce do orçamento (campo do cliente travado) e o formulário do orçamento (recusa visível)
- Test: `scripts/m129-emporio-decisoes-pendentes.test.ts` (seção 3)

**Interfaces:**
- Produces: `venderAction` com `quote_id` recusa `customer_id` diferente do orçamento com 422, `field: "customer_id"`, mensagem "Esta venda vem do orçamento de <nome>: o cliente não pode ser trocado." Sem `customer_id`, assume o do orçamento.
- Produces: a validade do preço orçado é `hojeEmBrasilia(new Date()) <= valid_until`, independente do `sold_at`.
- Produces: salvar ou editar orçamento com a mesma `presentation_id` em duas linhas devolve 422, mensagem "<produto> aparece em duas linhas: junte numa só." O `Math.min` de `emporio-vendas.ts` ~996 fica, para orçamento antigo.

- [ ] **Step 1: testes que falham:** (a) faturar orçamento do cliente A com `customer_id` do B: 422 em `customer_id`; (b) orçamento vencido ontem, venda com `sold_at` de anteontem: preço normal, não o orçado; (c) salvar orçamento com a mesma apresentação duas vezes: 422; editar para isso: 422; (d) faturar sem `customer_id`: venda com o cliente do orçamento.
- [ ] **Step 2:** `npm run test:m129` falha nas quatro.
- [ ] **Step 3:** implementar nas actions; na tela, cliente da venda vinda de orçamento só leitura, e a recusa de linha repetida visível (rodapé ou campo, conferência 15).
- [ ] **Step 4:** `npm run test:m129`, `test:m94`, `test:m109`, `test:m117` verdes.
- [ ] **Step 5:** commit.

### Task 4: franqueado na devolução (Q379)

**Files:**
- Modify: `prisma/schema.prisma` (`EmporioSaleReturn`: `franchisee_credit Decimal @default(0) @db.Decimal(14, 2)`)
- Create: `prisma/migrations/20261123120000_emporio_devolucao_credito_franqueado/migration.sql`
- Modify: `src/lib/actions/emporio-vendas.ts` (`validarItensDevolvidos` ~2675, `gravarDevolucao` ~2738)
- Modify: `src/lib/actions/emporio-franqueados.ts` (saldo e extrato, ~105 a 125)
- Modify: telas da venda (devolução mostra o que o cliente recebe) e do extrato do franqueado
- Test: `scripts/m129-emporio-decisoes-pendentes.test.ts` (seção 4)

**Interfaces:**
- Consumes: `ratearCreditoNosItens(totaisCent: number[], creditoCent: number): number[]` de `src/lib/emporio/rateio-impresso.ts` (o mesmo rateio do papel, Q308).
- Produces: `EmporioSaleReturn.amount` continua sendo o valor dos itens (faturamento e relatórios não mudam); `franchisee_credit` é a parte do crédito devolvida; **o cliente recebe `amount + franchisee_credit`** em qualquer forma de devolução.
- Produces: saldo do franqueado = Σ `franchisee_credit` das vendas não canceladas − Σ `franchisee_credit` das devoluções dessas vendas − pagamentos. O extrato ganha a linha "Devolução da venda nº N" negativa.

Regra do centavo: a parte do item é a do rateio; numa devolução parcial, devolvido até agora = `round(parte do item × quantidade devolvida acumulada / quantidade vendida)`, e esta devolução leva esse valor menos o que as anteriores já levaram. Tudo devolvido = o crédito inteiro, exato.

- [ ] **Step 1: testes que falham:** venda de 60 + 40 com crédito 10 (pela action): devolver o item de 60 inteiro: cliente recebe 66, franqueado perde 6, saldo 4; devolver depois o de 40: recebe 44, saldo 0. Devolução parcial em duas vezes (1 de 3 e depois 2 de 3) soma exatamente a parte do item. Venda sem crédito: nada muda. Crédito já pago ao franqueado: saldo fica negativo (como a Q305).
- [ ] **Step 2:** `npm run test:m129` falha.
- [ ] **Step 3:** schema e SQL pelo fluxo do CLAUDE.md (URL do Docker inline no `migrate diff`, sem os dois `DROP INDEX` parciais), `db:deploy` no Docker; depois a action, o saldo, o extrato e as telas.
- [ ] **Step 4:** `npm run test:m129`, `test:m113`, `test:drift` (se rodar local) e as suítes de devolução existentes verdes.
- [ ] **Step 5:** commit. **Neon fica para o merge, com autorização.**

### Task 5: franqueado no Caixa (Q378)

**Files:**
- Modify: `src/lib/actions/emporio-franqueados.ts` (`listarFranqueadosAction` ~243, ou uma leitura nova só para a venda)
- Modify: `src/app/(dashboard)/emporio/vender/page.tsx` (~79) e o orçamento, se o Caixa salvar orçamento
- Test: `scripts/m129-emporio-decisoes-pendentes.test.ts` (seção 5)

**Interfaces:**
- Produces: `listarFranqueadosParaVendaAction(db, ator)` com `vendedor_da_loja`, devolvendo só `{ id, name }` dos ativos. A aba Franqueados e a conta corrente continuam `fora_do_caixa`.

- [ ] **Step 1: teste que falha:** com o papel Caixa, a leitura para a venda devolve os franqueados ativos; a leitura da aba continua recusando.
- [ ] **Step 2:** implementar e trocar a página de venda para a leitura nova.
- [ ] **Step 3:** `npm run test:m129` e `test:m113` verdes. Commit.

### Task 6: botão da antecipação (Q377)

**Files:**
- Modify: `src/lib/actions/emporio-conferencia-cartao.ts` (`viewDoCartao` ~51 a 79)
- Modify: `src/app/(dashboard)/emporio/_components/cartoes-a-receber.tsx` (~241)
- Test: `scripts/m129-emporio-decisoes-pendentes.test.ts` (seção 6)

**Interfaces:**
- Produces: `CartaoAReceberView.conferida_pela_antecipacao: boolean`, verdadeiro com a mesma condição da recusa de `desfazerConferenciaAction` (~369: antecipação pontual, não desfeita, `conferidaPelaAntecipacao`). Extrair a condição numa função usada pelos dois.
- Produces: na tela, com o campo verdadeiro, o lugar do botão mostra "Conferida pela antecipação: para desfazer, desfaça a antecipação."

- [ ] **Step 1: teste que falha:** parcela conferida pela antecipação pontual (pelas actions) tem o campo verdadeiro; conferida à mão, falso; antecipação desfeita, falso.
- [ ] **Step 2:** implementar view e tela. `npm run test:m129` verde. Commit.

### Task 7: sobras pequenas da 5.31

**Files:** `src/lib/actions/emporio-caixa.ts` (`viewDoMovimento`), `src/app/(dashboard)/emporio/caixa/page.tsx` e `financeiro/aprovacoes/page.tsx` (o 20 literal), a action do boleto (teto do valor pago), a action do fiado (papel antes do 409).

- [ ] **Step 1:** `fimDeHojeEmBrasilia` calculado uma vez por leitura e passado às linhas.
- [ ] **Step 2:** o 20 literal vira `POR_PAGINA_CAIXA` (ou a constante da tela).
- [ ] **Step 3:** valor pago do boleto acima de 999.999.999,99 recusado com 422 (o `Decimal(14,2)` estoura antes).
- [ ] **Step 4:** replay do fiado confere o papel antes de devolver 409 (Caixa recebe 403).
- [ ] **Step 5:** checks na `m129` seção 7 para os passos 3 e 4; suíte verde. Commit.

### Task 8: documentação

**Files:** `docs/specs/module-39-meu-emporio.md` (linha da Q187 aponta para Q382 a Q384; Q374 a Q384 na tabela), `docs/agents/dividas.md` (5.31: decisões confirmadas, itens feitos fechados), `docs/agents/pendencias-do-usuario.md` (seções 11 e 11.1), `docs/agents/current-handoff.md`.

- [ ] **Step 1:** atualizar os quatro; `npm run check` limpo. Commit.

### Task 9: validação

- [ ] **Step 1:** `prova-juiz` no range da branch, contra a spec.
- [ ] **Step 2:** roteiros no navegador (dev local): ficha do cliente com agendado; venda de orçamento com cliente travado e orçamento com linha repetida; devolução com franqueado (valor recebido e extrato); Caixa vendo a lista de franqueados; parcela antecipada sem o botão. Passos novos provados nos dois sentidos.
- [ ] **Step 3:** `npm run test:all` (URLs do Docker e do Redis inline).
- [ ] **Step 4:** pedir ao usuário autorização para a migração no Neon, o merge e o push.

---

## Fora do código, em paralelo (a sessão principal escreve)

Textos prontos para o usuário encaminhar:

- Laiza e Cláudia: o que conferir da data da baixa contra o extrato (e, depois do merge, o "Em aberto" com agendados).
- Central do Milho: editar as vendas nº 1, 2 e 4 e estender a taxa de crédito à vista à LOJA MOC.
- Agromax: taxas de Stone, Mercado Pago e Cielo e o extrato da Stone; as 5 parcelas "A conferir"; as contas PIX; o leitor e a impressora para o teste de equipamento.
- GestãoClick: a planilha de produtos e clientes (G1) e um XML de nota de fornecedor (G2).
