# Empório: sobras das dívidas 5.23, 5.25, 5.28 e 5.30 que não dependem da Agromax

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fechar o que sobrou da data da baixa (5.30) antes de a Cláudia validar, e as sobras de teste e tela das 5.23, 5.25 e 5.28 que não pedem equipamento real.

**Architecture:** o saldo continua nunca gravado. O "agendado" é sempre a data comparada com `fimDeHojeEmBrasilia(agora)` na leitura, e cada lista que mostra dinheiro ganha um campo `scheduled` calculado no servidor. O resto são recusas novas nas actions, seletores de URL nas telas e passos novos nos roteiros.

**Tech Stack:** Next.js 16, Prisma 7, roteiros Python do browser-harness, suítes `tsx`.

**Spec:** `docs/agents/dividas.md` (5.23, 5.25, 5.28, 5.30) e `docs/superpowers/specs/2026-11-19-emporio-data-da-baixa.md` (Q370 a Q373). Decisão do usuário em 20/11/2026: **o Gestor da loja não agenda boleto para data futura** (só data passada, até 31 dias).

## Fora deste plano (depende da Agromax)

Leitor USB, impressora térmica e folha adesiva reais (5.25, primeiro item).

## Decisões do coordenador, a confirmar pelo usuário

| # | decisão | custo se errada |
|---|---|---|
| D1 | "Agendados" do extrato mostra só os futuros **até o fim do período** escolhido (os de depois ficam na Projeção) | trocar um `lt` |
| D2 | Compensar cheque com data **antes do dia do depósito** é recusado (422) | tirar a recusa |
| D3 | Repetir um recebimento de fiado (mesma `operation_key`) com **outra data** devolve 409, em vez de devolver o gravado calado | voltar ao replay mudo |
| D4 | Cheque compensado com data futura aparece "Compensa em DD/MM" (âmbar), não "Compensado" (verde), na venda e no cliente | um rótulo |
| D5 | A lista de pagamentos das Despesas não ganha marca: conta a pagar já recusa data futura | nenhum |
| D6 | 5.23, teste da migração Q353 que segura linhas: fecha sem código. `test:all` roda uma suíte por vez e a `m121` não está no CI | nenhum |
| D7 | 5.28, padrão de 20 linhas na API e lucro da curva: ficam como estão (decisão já tomada) | nenhum |

## Global Constraints

- Nunca use travessão (U+2014) em código, documento ou commit.
- Regra de negócio só em `src/lib/actions/*`; a rota é fina; ordem action, rota, tela.
- Toda action de escrita do Empório chama `registrarNoHistorico` (`npm run check`, conferência 19).
- Janela da baixa: `JANELA_DA_BAIXA_DIAS = 31` (`src/lib/emporio/data-da-baixa.ts`).
- "Agendado" = instante `>= fimDeHojeEmBrasilia(agora)`. Nunca grave saldo nem flag de agendado no banco.
- Recusa do servidor em português e com o campo (`fail(code, mensagem, status, campo)`).
- Dinheiro na tela: `reaisBr`; data: `dataBr`.
- Suíte nova: `scripts/m128-emporio-sobras-sem-agromax.test.ts` + `"test:m128"` no `package.json`; banco local por URL inline.
- Subagente não commita: deixa no working tree e relata os arquivos.
- Roteiro novo ou passo novo só vale visto falhar com a correção desfeita.

## Review Focus

1. Movimento agendado na **lista de Movimentos do Caixa** ordenada "mais recentes primeiro": aparece no topo e precisa da marca, senão parece dinheiro que já entrou.
2. Virada da meia-noite em Brasília (02:59 e 03:00 UTC): o movimento de "amanhã" entra no saldo exatamente às 03:00 UTC.
3. Cheque depositado hoje e compensado com data de ontem: a recusa D2 diz a data do depósito.
4. Gestor da loja no boleto: o calendário não oferece amanhã, e a dica não fala em Agendados.
5. Extrato de período inteiro no futuro: abertura igual ao saldo de hoje, corpo vazio, Agendados só os do período.

---

### Task 1: Extrato e saldo com `agora` (5.30)

**Arquivos:** `src/lib/actions/emporio-caixa.ts` (`saldosDasContas`), `src/lib/actions/emporio-financeiro.ts` (`lerExtratoAction`), `scripts/m128-emporio-sobras-sem-agromax.test.ts` (novo), `package.json`.
**Agente:** `servidor-acao`.

**Interfaces:**
- Produz: `saldosDasContas(db: TenantPrismaClient, agora: Date = new Date()): Promise<Map<string, number>>`.
- Produz: `lerExtratoAction(db, ator, input, agora: Date = new Date())`: `agora` passa a `fimDeHojeEmBrasilia(agora)` e `hojeEmBrasilia(agora)` (`src/lib/emporio/cartao.ts`).

- [ ] **Step 1: Escrever os testes na `m128`, seção 1**
  - (a) Conta com PIX de R$ 100 hoje e parcela de cartão de R$ 50 com `effective_on` daqui a 5 dias. Extrato de `hoje+3` a `hoje+10`: `opening` = saldo de hoje (100), linhas do corpo vazias, `scheduled` contém o movimento futuro que cai dentro do período.
  - (b) D1: movimento agendado para `hoje+20` não aparece no `scheduled` do extrato de `hoje-5` a `hoje+10`; aparece no de `hoje-5` a `hoje+25`.
  - (c) Virada: movimento com `occurred_at` = `fimDeHojeEmBrasilia(T)` em que T = 2026-11-20T02:59:00Z. `saldosDasContas(db, T)` não o soma; `saldosDasContas(db, 2026-11-20T03:00:00Z)` soma.
- [ ] **Step 2: Rodar e ver falhar** (a abertura soma a parcela futura; o `scheduled` traz o +20; `saldosDasContas` não aceita `agora`).
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m128`
- [ ] **Step 3: Implementar.** `antesCartao` com `effective_on: { lt: min(deDia, amanhã) }`, em que amanhã = `hojeEmBrasilia(agora)` mais um dia. Agendados com `occurred_at: { gte: fimDeHoje, lt: ate }`. `saldosDasContas` repassa `agora` para `fimDeHojeEmBrasilia`; a parcela de cartão usa `hojeEmBrasilia(agora)`.
- [ ] **Step 4: Rodar `test:m128` e `test:m127`, as duas verdes.**
- [ ] **Step 5: Commit** (controlador).

### Task 2: Marca de agendado nas listas (5.30)

**Arquivos:** `src/lib/actions/emporio-caixa.ts` (`viewDoMovimento`, tipo `MovimentoDeCaixaView`), `src/lib/actions/emporio-clientes.ts` (recebimentos do cliente, ~linha 500 a 620), `src/app/(public)/docs/api/endpoints.ts`, `m128`.
**Agente:** `servidor-acao`.

**Interfaces:**
- Produz: `MovimentoDeCaixaView.scheduled: boolean` (`occurred_at >= fimDeHojeEmBrasilia()`).
- Produz: no recebimento do cliente, `scheduled: boolean`: fiado pelo `occurred_at`, boleto pago pelo `paid_at`, cheque compensado pelo `cleared_at`. O total "Recebido" (o `filter` da ~linha 614) deixa de fora os `scheduled`.

- [ ] **Step 1: Testes (`m128`, seção 2):** um PIX de fiado com `received_on` = amanhã sai em `lerCaixaAction(...).movements` com `scheduled: true`, e o de hoje com `false`. No cliente, o mesmo recebimento vem `scheduled: true` e o Recebido não o soma; um boleto pago com `paid_on` = amanhã e um cheque compensado com `cleared_on` = amanhã também vêm `scheduled: true`.
- [ ] **Step 2: Ver falhar** (campo inexistente).
- [ ] **Step 3: Implementar.** Atualizar a descrição da resposta em `endpoints.ts` (extensão aditiva).
- [ ] **Step 4: `test:m128`, `test:m127` e `test:docs-api` verdes.**
- [ ] **Step 5: Commit.**

### Task 3: Recusas novas: cheque, replay do fiado e teto do valor pago (5.30)

**Arquivos:** `src/lib/actions/emporio-caixa.ts` (`compensarChequeAction`, `receberFiadoAction` e `recebimentoGravado`, `pagarBoletoAction`), `m128`.
**Agente:** `servidor-acao`.

- [ ] **Step 1: Testes (`m128`, seção 3):**
  - D2: cheque depositado com `deposited_on` = hoje; compensar com `cleared_on` = ontem dá 422, campo `cleared_on`, mensagem `A compensação não pode ser antes do depósito (DD/MM/AAAA).` com a data do depósito. Com `cleared_on` = hoje, passa.
  - D3: receber fiado com a chave K e `received_on` = ontem; repetir K com `received_on` = hoje dá 409 `CONFLICT`, campo `received_on`, mensagem `Este recebimento já foi gravado com a data DD/MM/AAAA.` Repetir K sem `received_on`, ou com a mesma data, devolve o gravado com `replayed: true`.
  - Teto: `paid_amount` = 999999999999.995 é recusado (422, `paid_amount`); 999999999999.99 é aceito na validação.
- [ ] **Step 2: Ver falhar.**
- [ ] **Step 3: Implementar.** O dia do depósito é o dia em Brasília de `deposited_at`. No replay, a data gravada é o dia em Brasília do `occurred_at` do primeiro movimento. O teto passa a `centavos(digitado) >= 1e14`.
- [ ] **Step 4: `test:m128`, `test:m127`, `test:m122` verdes.**
- [ ] **Step 5: Commit.**

### Task 4: Telas da data da baixa e roteiro (5.30)

**Arquivos:** `src/app/(dashboard)/emporio/caixa/page.tsx` (tabela Movimentos), `src/app/(dashboard)/emporio/clientes/_components/recebimentos-do-cliente.tsx`, `src/app/(dashboard)/emporio/vendas/[id]/page.tsx` (~linha 436, badge do cheque), `src/app/(dashboard)/emporio/_components/cheque-acoes.tsx` (aviso de sucesso), `src/app/(dashboard)/emporio/_components/boletos-lista.tsx` (`BoletoPago`), `scripts/navegador/emporio-data-da-baixa.py`, `scripts/_cenario-emporio-data-da-baixa.ts`.
**Agente:** `tela-pagina`.

**Interfaces:**
- Consome: `scheduled` das Tasks 2 e 3.
- `BoletoPago` ganha `podeAgendar: boolean` (= `ehDinheiro`). Sem ele, o campo de data tem `max={hoje}` e a dica `Para o extrato bater com o do banco. Até 31 dias para trás.` (com `JANELA_DA_BAIXA_DIAS`).

Cópia fixa:
- Movimentos e cliente: `Badge` âmbar `Agendado` ao lado da data; no cliente, o valor agendado sai riscado com `title="Não entra no Recebido"`, como o cheque na carteira.
- D4: cheque `compensado` com `cleared_at` no futuro: badge âmbar `Compensa em DD/MM`.
- Aviso do Compensou com data futura: `Cheque N compensado: o dinheiro cai na conta em DD/MM/AAAA.`

- [ ] **Step 1: Passos novos no roteiro** (o cenário cria um PIX de fiado agendado, um cheque compensado agendado e um Gestor de loja com boleto aberto): a linha agendada nos Movimentos tem `Agendado`; o cliente mostra `Agendado` e o Recebido sem o valor; a venda do cheque mostra `Compensa em`; como Gestor, o campo "Data em que caiu" do boleto tem `max` igual a hoje.
- [ ] **Step 2: Ver o roteiro falhar** (`npm run navegador -- emporio-data-da-baixa`, com `npm run dev` de pé).
- [ ] **Step 3: Implementar as telas.**
- [ ] **Step 4: Roteiro verde; `npm run check` com 0 falhas; `npx tsc --noEmit` limpo.**
- [ ] **Step 5: Commit.**

### Task 5: Ordem dos Movimentos e tamanho das Aprovações (5.28)

**Arquivos:** `src/lib/actions/emporio-caixa.ts` (`lerCaixaAction`), `src/app/api/v1/emporio/cash/route.ts`, `src/app/(public)/docs/api/endpoints.ts`, `src/app/(dashboard)/emporio/caixa/page.tsx`, `src/app/(dashboard)/emporio/financeiro/aprovacoes/page.tsx`, componente cliente novo `src/app/(dashboard)/emporio/_components/paginacao-da-url.tsx`, `scripts/navegador/emporio-paginacao-listas.py`, `m128`.
**Agente:** `servidor-acao` (action e rota), depois `tela-pagina`.

**Interfaces:**
- `lerCaixaAction` aceita `mov_order?: "asc" | "desc"` (padrão `desc`); a rota lê `mov_order` da query.
- `PaginacaoDaUrl({ ordem?, porPagina, chaveOrdem?, chavePorPagina, chavePagina })`: cliente; usa `PaginacaoSeletores` e troca os parâmetros da URL com `router.push`, voltando a página para 1. Sem `ordem`, mostra só "Por página".
- Caixa: `ordem_mov` e `por_pagina_mov` na URL (`TAMANHOS_DE_PAGINA`, padrão 20). Aprovações, aba Esperando: `por_pagina` (padrão 20), repassado ao `per_page` que a action já aceita.

- [ ] **Step 1: Teste (`m128`, seção 5):** `lerCaixaAction` com `mov_order: "asc"` devolve o movimento mais antigo primeiro. Roteiro: trocar a ordem dos Movimentos inverte a primeira linha; 40 por página nas Aprovações mostra mais de 20 pedidos (o cenário de paginação já cria pedidos suficientes; se não criar, acrescentar).
- [ ] **Step 2: Ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: `test:m128`, `test:m125`, `test:docs-api` e o roteiro verdes.**
- [ ] **Step 5: Commit.**

### Task 6: Padrão das etiquetas num lugar só (5.25)

**Arquivos:** `src/lib/emporio/etiqueta-medidas.ts`, `src/lib/actions/emporio-configuracoes.ts` (`PADRAO_ETIQUETA`), `src/app/(dashboard)/emporio/configuracoes/_components/balcao-etiquetas-form.tsx` (`PADRAO`).
**Agente:** `tela-pagina`.

- Produz: `export const PADRAO_ETIQUETA` em `etiqueta-medidas.ts`, com os valores de hoje (A4: 3 x 7, 63,5 x 38,1, margens 15,15 e 7,2, espaços 2,5 e 0; rolo: 40 x 25, 1 coluna, espaço 2). A action importa de lá; o formulário monta o `PADRAO` dele convertendo número para texto com vírgula.

- [ ] **Step 1: Teste (`m128`, seção 6):** o `PADRAO` do formulário, convertido de volta para número, é igual a `PADRAO_ETIQUETA`, e a leitura das Configurações (a action que usa `viewConfiguracoes`) de uma conta sem medida gravada devolve `PADRAO_ETIQUETA`. Para o teste importar o padrão do formulário, extraia a conversão para uma função pura exportada.
- [ ] **Step 2: Ver falhar** (o módulo não exporta).
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: `test:m128`, `test:m123`, roteiro `emporio-balcao-rapido` verdes.**
- [ ] **Step 5: Commit.**

### Task 7: Roteiros e runner (5.23, 5.25, 5.28)

**Arquivos:** `scripts/navegador/_lib.py`, `scripts/navegador/emporio-antecipacao.py`, `scripts/navegador/emporio-conferir-cartao.py`, `scripts/navegador/emporio-balcao-rapido.py`, `scripts/navegador/emporio-paginacao-listas.py` e os cenários deles, `scripts/rodar-todas-as-suites.ts`.
**Agente:** `prova-viva`.

- [ ] **Step 1: Feriados móveis (5.23).** `feriados_nacionais(ano) -> set[str]` em `_lib.py`: os fixos de hoje mais Carnaval (segunda e terça), Sexta-feira Santa e Corpus Christi, com a Páscoa calculada no próprio Python (algoritmo de Meeus), sem ler o código do app. Os dois roteiros do cartão passam a usá-la. Prova: para 2027, o conjunto contém `2027-02-08`, `2027-02-09`, `2027-03-26` e `2027-05-27`.
- [ ] **Step 2: Balcão (5.25)**, no `emporio-balcao-rapido`: desarquivar produto cujo código foi tomado por outro (recusa na tela); editar o código pelo botão Editar; F8 como Caixa, sem Vendedor; o Gestor abre a tela de etiquetas; pedir mais de 2000 etiquetas mostra o aviso do teto (`ETIQUETAS_MAXIMAS`). A corrida de dois cadastros fica só na `m123`.
- [ ] **Step 3: Paginação (5.28)**, no `emporio-paginacao-listas`: as listas de antecipações e de conferências paginam; 80 e 100 por página em Compras e Transferências; o Vendedor não abre o Relatórios (precisa de sessão do Vendedor no cabeçalho do roteiro).
- [ ] **Step 4: Runner (5.25, m123 intermitente).** `rodar-todas-as-suites.ts` grava a saída de toda suíte que falhar ou travar em `<os.tmpdir()>/tibe-test-all/<suite>.log` e imprime o caminho na lista "Falharam".
- [ ] **Step 5: Ver cada passo novo falhar** (desfazer de propósito o que ele confere) e depois passar. Rodar `npm run test:all` uma vez.
- [ ] **Step 6: Commit.**

### Task 8: Dívidas, manual e handoff

**Arquivos:** `docs/agents/dividas.md`, `src/app/(dashboard)/manual/_conteudo/partes-tarefa-2.tsx` (se a cópia do Agendado ou do Compensa em precisar de uma linha), `docs/agents/current-handoff.md`.
**Responsável:** o controlador.

- [ ] Tirar das 5.23, 5.25, 5.28 e 5.30 o que este plano fechou, com as decisões D1 a D7; o que ficar vai para a 5.31.
- [ ] `npm run check` com 0 falhas.
- [ ] Handoff atualizado **antes** do merge, na branch, já dizendo "em produção após o merge, sem migração", para subir no mesmo push do código.
- [ ] Commit.

Depois: juiz (`prova-juiz`) no range inteiro, uma leva de correções, merge só com autorização do usuário. Este plano não tem migração.
