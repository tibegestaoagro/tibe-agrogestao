# Agente do WhatsApp, Fase 5: as intenções novas do dinheiro que entra

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o produtor passa a poder dar baixa no que recebeu ("o João me pagou", inclusive em parte), perguntar quem ainda deve ("o João já pagou?") e marcar um pagamento futuro da equipe ("vou pagar o Pedro dia 10"), pelo WhatsApp.

**Architecture:** três intenções novas no registro (`src/lib/agente/intencoes/`), três handlers que chamam actions que **já existem**, e nenhuma tabela nova. A baixa usa `registrarPagamentoAction`/`markEntryPaidAction` (que já fazem pagamento parcial e são o que a tela usa); a consulta lê `FinancialEntry` pendente pelo vínculo com ordem de serviço ou negociação; o pagamento futuro reaproveita a previsão de mão de obra que o Módulo 33 já cria (`related_module: mao_de_obra`, `related_id` = id do trabalhador, `status: pending`), mexendo na data em vez de criar linha nova.

**Tech Stack:** TypeScript, Prisma 7 (Postgres local para teste), Zod 4, o registro de intenções e a classificação em duas etapas da Fase 2.

**Spec:** `docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md` (lacuna 10 da tabela de decisões, e a linha 5 da tabela de fases).

## O que a auditoria de 16/09 achou, e por que a fase encolheu

Antes de escrever tarefa, medi o que já existe. **Metade do que a spec pede já está no ar:**

| o que a spec pede | estado real |
|---|---|
| "recebi 1.500 de aluguel" (receita avulsa) | **JÁ FUNCIONA.** `registrar_lancamento_financeiro` tem o campo `tipo` ("receita quando o dinheiro ENTROU"), e essa frase é literalmente um dos exemplos do registro de intenções. Nada a fazer: só medir |
| "o João me pagou" (dar baixa) | **NÃO existe intenção.** As actions existem e são as da tela: `markEntryPaidAction` e `registrarPagamentoAction`, com pagamento parcial resolvido desde a fase 35.1 |
| "o João já pagou?" (consulta) | **NÃO existe.** O `resumo` mostra contas a receber do tenant inteiro, nunca de um cliente |
| "vou pagar o Pedro dia 10" | **80% existe.** O Módulo 33 já cria a previsão de pagamento com vencimento (`criarPrevisaoDePagamento`, `worker_entry_kind: "pagamento"`), e `confirmWorkerPayment` já concilia contra ela em vez de duplicar. Falta a intenção que MUDA a data dessa previsão, e o caso de quem não tem previsão nenhuma |

⚠️ **O `FinancialEntry` não guarda a contraparte.** Não há FK para cliente nem contato: o nome só existe estruturado quando o lançamento veio de ordem de serviço (`related_module: prestador`, `related_id` = ordem, que tem `service_client_id`) ou de negociação (`negotiation_id`, que tem `contact_id`). É isso que limita a busca do "me pagou", e foi a origem da decisão abaixo.

## Decisões de 16/09/2026

Tomadas com o usuário depois da auditoria, as três na opção recomendada:

| tema | decisão |
|---|---|
| como achar a conta do "o João me pagou" | **só serviço e negócio**, que têm o nome de verdade no banco. Mais de uma conta em aberto: lista e pergunta qual. Lançamento manual fica FORA, porque ali o nome só existe em texto livre e casar por substring já gravou coisa errada neste projeto |
| pagamento parcial | **entra nesta fase.** A action já faz; para o agente é um campo a mais |
| "vou pagar o Pedro dia 10" | **cria ou remarca a previsão, e a conciliação continua sendo a do Módulo 33**: quando o pagamento real chegar, ele quita a previsão em vez de criar uma segunda despesa |

## Global Constraints

- **Nenhuma action nova de dinheiro.** As três intenções chamam o que já existe (`registrarPagamentoAction`, `markEntryPaidAction`, `criarPrevisaoDePagamento`, `confirmWorkerPayment`). Lançamento financeiro nasce sempre por `createLinkedEntry`, nunca à mão (regra do `CLAUDE.md`).
- **Dar baixa CONFIRMA sempre**, qualquer valor. É dinheiro saindo do painel de contas a receber, e baixa errada some da lista de cobrança. A intenção NÃO entra em `INTENCOES_QUE_GRAVAM_SEM_CONFIRMAR`, e a catraca da seção 1c da `m68` reprova se alguém esquecer o portão.
- **Nunca adivinhar a conta.** Zero conta em aberto para o contato: diz isso. Mais de uma: lista com valor e vencimento e pergunta qual. Uma só: mostra e confirma.
- Consulta nunca grava. `consultar_recebimento` é `action: "read"`.
- `tenant_id` nunca vem do client; toda query usa o client escopado. Model novo nenhum, então `TENANT_SCOPED_MODELS` não muda.
- Nenhuma suíte chama a OpenAI: o transporte do modelo é substituído, como já se faz na `m68`.
- Execução de teste sempre com as URLs inline: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379"`.
- Ao fim de cada task: `test:m68`, `test:m69`, `test:m57` (mão de obra) e `test:m29` (ajustes financeiros) e `npm run check` verdes.
- Nunca travessão (U+2014). Nunca heredoc para escrever conteúdo. Commits em português, `git add` só dos arquivos tocados.

---

### Task 1: as três intenções no registro

**Files:**
- Modify: `src/lib/whatsapp-intents.ts` (a lista e `INTENT_ACCESS`)
- Modify: `src/lib/agente/intencoes/financeiro.ts`
- Modify: `src/lib/agente/intencoes/mao_de_obra.ts`
- Modify: `scripts/m68-agente-turno.test.ts` (a seção 1 confere campo por campo contra o handler)

**Interfaces:**
- Produces: as intenções `registrar_recebimento`, `consultar_recebimento` e `agendar_pagamento_trabalhador`, com estes campos exatos:

```ts
// financeiro.ts
{
  intent: "registrar_recebimento",
  dominio: "financeiro",
  descricao: "o produtor conta que um cliente PAGOU algo que devia a ele, no todo ou em parte",
  campos: [
    { nome: "contato", tipo: "texto", descricao: "quem pagou, o nome como o produtor falou (João, Fazenda Boa Vista)" },
    { nome: "valor", tipo: "numero", descricao: "quanto recebeu, só o número; vazio quando ele não disse (aí é a conta inteira)" },
    { nome: "data", tipo: "data", descricao: "quando recebeu, como ele falou (hoje, ontem, dia 10); vazio é hoje" },
  ],
  exemplos: ["o João me pagou", "a Fazenda Boa Vista pagou 500 dos 1500", "recebi do Ze Carlos ontem"],
  vizinhas: "registrar_lancamento_financeiro quando é dinheiro avulso que entrou e não quita uma conta de alguém (aluguel, venda de sucata); consultar_recebimento quando ele PERGUNTA se alguém pagou",
}
{
  intent: "consultar_recebimento",
  dominio: "financeiro",
  descricao: "o produtor PERGUNTA se um cliente já pagou, ou quanto ele ainda deve",
  campos: [
    { nome: "contato", tipo: "texto", descricao: "de quem ele quer saber, o nome como falou" },
  ],
  exemplos: ["o João já pagou?", "quanto o Ze Carlos ainda me deve"],
  vizinhas: "registrar_recebimento quando ele AFIRMA que recebeu; consultar_saldo quando pergunta o saldo do mês; resumo quando pergunta as contas a receber em geral, sem nome",
}

// mao_de_obra.ts
{
  intent: "agendar_pagamento_trabalhador",
  dominio: "mao_de_obra",
  descricao: "o produtor diz que VAI pagar alguém da equipe numa data futura, sem ter pago ainda",
  campos: [
    NOME_DA_EQUIPE,
    { nome: "data", tipo: "data", descricao: "quando vai pagar, como ele falou (dia 10, sexta, 20/10)" },
    { nome: "valor", tipo: "numero", descricao: "quanto vai pagar, só o número; vazio usa o valor previsto do trabalhador" },
  ],
  exemplos: ["vou pagar o Pedro dia 10", "o pagamento do João fica pra sexta"],
  vizinhas: "registrar_pagamento_trabalhador quando ele JÁ pagou; registrar_adiantamento quando é vale ou adiantado",
}
```

- `INTENT_ACCESS`: `registrar_recebimento` = `{ module: "financeiro", action: "write" }`; `consultar_recebimento` = `{ module: "financeiro", action: "read" }`; `agendar_pagamento_trabalhador` = `{ module: "mao_de_obra", action: "write", profile: "fazenda" }`.

- [ ] **Step 1: declarar as três intenções**

Nos três arquivos acima, com os campos literais do bloco anterior.

- [ ] **Step 2: rodar a suíte e ver FALHAR**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m68
```
Expected: FAIL na seção 1, com `registrar_recebimento: handler localizado` reprovado (o handler ainda não existe). É o sinal certo: a suíte cobra o handler antes de ele existir.

- [ ] **Step 3: commit**

```bash
git add src/lib/whatsapp-intents.ts src/lib/agente/intencoes/financeiro.ts src/lib/agente/intencoes/mao_de_obra.ts
git commit -m "Agente: as tres intencoes novas do dinheiro que entra"
```

---

### Task 2: achar a conta do contato

**Files:**
- Create: `src/lib/actions/contas-do-contato.ts`
- Create: nada de schema
- Test: `scripts/m70-recebimento.test.ts` (suíte nova; `m70` é o próximo número livre, conferido no `package.json` em 16/09)
- Modify: `package.json` (`test:m70`)

**Interfaces:**
- Produces:

```ts
export type ContaEmAberto = {
  id: string;
  amount: number;        // valor cheio do lançamento
  saldo: number;         // o que falta, já descontando pagamentos parciais
  due_date: Date | null;
  origem: "servico" | "negocio";
  descricao: string;     // "Ordem de 12/09, roçada" ou "Venda de 20 bezerros"
};

/**
 * Contas a receber EM ABERTO de um contato, pelo vínculo estruturado.
 * Nunca casa por texto livre: ver a decisão de 16/09 no cabeçalho do plano.
 */
export async function contasEmAbertoDoContato(
  db: TenantPrismaClient,
  nome: string,
): Promise<{ contato: string; contas: ContaEmAberto[] } | null>;
```

`null` quando nenhum cliente nem contato casa com o nome. Lista vazia quando o contato existe e não tem conta em aberto: são respostas diferentes, e o handler fala diferente nos dois casos.

**Como achar:** ordens de serviço do `ServiceClient` cujo nome casa (mesma função de casamento de nome que o prestador já usa), e negociações cujo `contact_id` casa. De cada uma, os `FinancialEntry` com `entry_type: "income"` e `status: "pending"`. O saldo sai de `resumoDePagamento`, que já existe e já desconta pagamento parcial.

- [ ] **Step 1: escrever a suíte cega, a partir deste contrato**

`scripts/m70-recebimento.test.ts`, com no mínimo estes casos, cada um montando o cenário no banco local:

1. contato inexistente devolve `null`;
2. cliente de serviço sem conta pendente devolve lista vazia, não `null`;
3. uma ordem de serviço faturada e não paga aparece com `saldo` igual ao valor;
4. a mesma com um pagamento parcial de 40% aparece com `saldo` de 60%;
5. conta já paga NÃO aparece;
6. despesa (`entry_type: "expense"`) do mesmo contato NÃO aparece: isto é contas a RECEBER;
7. duas contas em aberto vêm as duas, ordenadas por vencimento.

- [ ] **Step 2: rodar e ver falhar**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m70
```
Expected: FAIL, "Cannot find module contas-do-contato".

- [ ] **Step 3: implementar**

- [ ] **Step 4: rodar até passar, e conferir o isolamento**

```
DATABASE_URL="..." npm run test:m70 && DATABASE_URL="..." npm run test:isolation
```

- [ ] **Step 5: commit**

---

### Task 3: o handler da baixa e o da consulta

**Files:**
- Modify: `src/lib/actions/whatsapp-handlers/financeiro.ts`
- Modify: `src/lib/actions/whatsapp-router.ts` (as duas entradas na tabela)
- Modify: `scripts/m70-recebimento.test.ts`

**Interfaces:**
- Consumes: `contasEmAbertoDoContato` da Task 2; `registrarPagamentoAction` e `markEntryPaidAction` de `financial-entries.ts`.

**O roteiro de conversa, que é o contrato de verdade:**

| situação | o que o agente responde |
|---|---|
| nome não casa com ninguém | "Não achei nenhum cliente com esse nome. Como ele está cadastrado?" |
| contato sem conta em aberto | "O João não tem nenhuma conta em aberto comigo." |
| uma conta, valor não dito | mostra a conta e o saldo, e PERGUNTA se quita tudo |
| uma conta, valor dito menor que o saldo | mostra os dois e pergunta se registra o pagamento parcial |
| uma conta, valor dito MAIOR que o saldo | recusa e pergunta: nunca aceitar pagamento acima do saldo |
| duas ou mais contas | lista numerada com valor e vencimento, e pergunta qual |
| consulta | responde saldo e vencimento de cada conta em aberto, sem gravar nada |

- [ ] **Step 1: escrever os casos de conversa na `m70`, e vê-los falhar**

Um caso por linha da tabela acima, passando pelo turno inteiro (`executarTurno`), com o transporte do modelo substituído, no mesmo molde da seção 7 da `m68`. Inclua um caso que o defeito clássico deste projeto pegaria: **"não, deixa pra lá" depois da pergunta de confirmação não pode dar baixa em nada.**

- [ ] **Step 2: implementar os dois handlers**

Guardando o pendente pelo mesmo mecanismo dos outros domínios, e confirmando SEMPRE antes de baixar.

- [ ] **Step 3: rodar `m70`, `m68` e a catraca**

Expected: verdes, e a seção 1c da `m68` continua passando (as duas intenções novas têm portão de confirmação, ou a de leitura nem entra na conta).

- [ ] **Step 4: commit**

---

### Task 4: o pagamento futuro da equipe

**Files:**
- Modify: `src/lib/actions/whatsapp-handlers/mao-de-obra.ts`
- Modify: `src/lib/actions/workers.ts` (só se a remarcação pedir função nova)
- Modify: `src/lib/actions/whatsapp-router.ts`
- Modify: `scripts/m70-recebimento.test.ts`

**Interfaces:**
- Consumes: `criarPrevisaoDePagamento` e a previsão pendente que `confirmWorkerPayment` já concilia.

**A regra:** "vou pagar o Pedro dia 10" **não cria despesa nova quando já existe previsão pendente**: muda o vencimento dela (e o valor, se ele disse). Sem previsão nenhuma, cria uma. É o mesmo desenho do `upsertVaccinationForecastAction`, e é o que impede o mês de fechar com o valor dobrado.

- [ ] **Step 1: os casos que discriminam, escritos antes**

1. trabalhador com previsão pendente: a data muda, e **continua existindo UMA** linha pendente (contar `financialEntry`);
2. trabalhador sem previsão: nasce uma, com o vencimento dito;
3. valor dito muda o valor da previsão; valor não dito preserva o previsto;
4. depois de agendar, "paguei o Pedro" quita a MESMA previsão, e não cria uma segunda (é a conciliação do Módulo 33 (mão de obra, suíte `m57`), e o caso prova que ela continua valendo);
5. data no passado: recusa e pergunta, porque "vou pagar" é futuro.

- [ ] **Step 2: rodar e ver falhar**

- [ ] **Step 3: implementar**

- [ ] **Step 4: rodar `m70`, `m57` e `m68`**

- [ ] **Step 5: commit**

---

### Task 5: medir as três contra o modelo de verdade

**Files:**
- Create: `scripts/avaliacao/casos/fase-5.json`
- Create: `docs/agents/agente-whatsapp/avaliacao-fase-5.md`

**Por que:** as três intenções novas competem com vizinhas parecidas (`registrar_lancamento_financeiro`, `consultar_saldo`, `registrar_pagamento_trabalhador`), e a Fase 3 mostrou que o erro caro do classificador é escolher a vizinha errada. Suíte verde não mede isso.

- [ ] **Step 1: encomendar os casos a um autor sem contexto**

Um subagente, com o briefing de `scripts/avaliacao/briefing/` e NADA do código, escreve 40 casos: mensagens e conversas cobrindo as três intenções novas **e as três vizinhas**, para medir a confusão nos dois sentidos.

- [ ] **Step 2: rodar contra o `gpt-5.6-luna`**

```
DATABASE_URL="..." REDIS_URL="..." npm run avaliacao:rodar -- --rodada fase-5 --modelos gpt-5.6-luna --arquivo fase-5.json --particao todas
```
Teto: US$ 2 nesta fase. O acumulado do programa está em US$ 5,12 de US$ 30.

- [ ] **Step 3: ler caso a caso e corrigir o prompt, se for o caso**

Toda gravação indevida é eliminatória. Confusão de intenção vira ajuste no campo `vizinhas` do registro, que é onde a Fase 3 provou que o ganho mora.

- [ ] **Step 4: relatório e commit**

---

### Task 6: fechar a fase

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md` (seção "Fase 5: decisões de 16/09/2026", com a tabela da auditoria)
- Modify: `docs/agents/current-handoff.md`
- Modify: `docs/agents/dividas.md` (se algo ficou de fora)

- [ ] **Step 1: registrar as decisões e o que a auditoria achou**
- [ ] **Step 2: `npm run check`**
- [ ] **Step 3: commit**

---

## Critério de pronto da fase

1. As três intenções emitidas e executadas de ponta a ponta, com suíte própria (`m70`).
2. Zero gravação indevida na rodada de avaliação, e nenhuma baixa dada sem confirmação.
3. Agendar pagamento e depois pagar **não** cria duas despesas: uma linha, provada por contagem.
4. Pagamento acima do saldo é recusado, não aceito com saldo negativo.
5. O que ficou de fora está no `dividas.md` com o motivo.

**Não é escopo:** leite (tanque e venda) e permuta com máquina, que a spec já deixou fora da lacuna 10; e casar contraparte por texto livre em lançamento manual, que foi decisão explícita do usuário em 16/09.
