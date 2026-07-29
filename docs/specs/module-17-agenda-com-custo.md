# Módulo 17: Agenda com custo (agente WhatsApp)

**Status:** especificado, decisões fechadas com o usuário em 2026-07-29. **Nenhuma
linha de código escrita ainda.** Este documento é a fonte de verdade para
implementar: todas as ambiguidades já foram resolvidas em entrevista com o
usuário (Dilton), então **não é necessário perguntar de novo** o que está
decidido aqui.

> **Handoff:** esta spec foi escrita pelo Claude Code no fim de uma sessão, para
> que outro agente (Codex) implemente sem perder contexto. Leia
> [AGENTS.md](../../AGENTS.md) primeiro (base técnica do projeto), depois esta
> spec inteira, e só então comece pela Task 1.

---

## 1. Objetivo

Hoje o agente WhatsApp responde consultas de agenda com **contagens**
("você tem 3 ordens agendadas"), não com os itens reais. O usuário quer a
relação de fato, com **data e valor**, nos três módulos (prestador, rebanho,
lavoura), e quer poder pedir "me dê a relação de contas a pagar deste mês".

Motivação declarada pelo usuário, que deve guiar qualquer dúvida de
implementação:

> "é um assistente financeiro e de tarefas para quem trabalha no agro. ser
> persistido para que tenha uma previsibilidade futura é importantíssimo. o que
> não pode acontecer é quando perguntar sobre pagamentos pendentes e não existir
> esse dado lá calculado e quando a data vencer o usuário que confiava no
> assistente perceber que não houve lembrete de pagamento."

Ou seja: **previsão de gasto é dado persistido, e a promessa de lembrete tem
que ser literalmente verdadeira.**

---

## 2. Estado atual do código (levantado, não suponha diferente)

Fatos verificados antes de especificar. Eles são o motivo de esta spec exigir
**zero mudança de schema**.

- **`ServiceOrder` já tem agenda com valor real.** `createServiceOrderAction`
  (`src/lib/actions/service-orders.ts`) recebe `performed_at` obrigatório; data
  futura nasce com `status: "scheduled"`, e `total_value` já é calculado e
  persistido na criação. Todo item `scheduled` já tem data futura + valor real.
  O que falta é só listar em vez de contar.
- **`AnimalVaccination` não tem conceito de "planejada".** `applied_at` é
  obrigatório e sempre representa uma aplicação que já aconteceu. O que existe
  é `next_due_at`, um **lembrete calculado** (`applied_at + interval_days`),
  sem custo associado. `listUpcomingVaccinations(db, dias)`
  (`src/lib/actions/animals.ts`) já consulta isso.
- **`FinancialEntry` pendente com `due_date` futuro já é uma "conta a pagar"
  completa**, e já ganha lembrete automático: o alerta `bill_due`
  (`src/lib/actions/alerts.ts`, item 3 da geração diária) varre **qualquer**
  `FinancialEntry` com `status: "pending"` e `due_date` nos próximos 3 dias,
  todo dia via Vercel Cron, entregando por WhatsApp **e** email. **É por isso
  que a previsão de gasto é persistida como `FinancialEntry` e não como campo
  novo: o lembrete vem de graça e já está em produção.**
- **`getUpcoming(db, days)`** (`src/lib/actions/financial-reports.ts`) já
  devolve a lista de pendentes com tipo/categoria/valor/vencimento, **mas
  filtra `due_date >= now`**, ou seja, esconde o que já venceu. Ela serve a rota
  `GET /api/v1/financial/upcoming`: **não altere o comportamento dela**
  (quebraria contrato). Crie uma função irmã.
- **O status `overdue` de `FinancialEntry` nunca é gravado por ninguém.** Os
  únicos `"overdue"` no código são de `Subscription` (Asaas). Toda conta não
  paga fica `pending` para sempre, mesmo depois de vencer. Portanto: filtrar por
  `pending` é correto e completo, e "vencida" precisa ser **calculado**
  comparando `due_date` com a data de hoje, nunca lido do status.
- **O painel web já exibe as previsões sem nenhuma alteração.**
  `src/app/(dashboard)/financeiro/page.tsx` já mostra "Total a pagar" (soma de
  despesas pendentes), lista lançamentos com vencimento e status, e tem botão de
  marcar como pago. Previsões aparecem lá automaticamente, editáveis
  (`related_module: geral` é editável) e quitáveis.
- **`resumo:contas_a_receber` está semanticamente errado hoje**: responde
  "N ordens concluídas aguardando fatura", que **não é** conta a receber (só
  vira recebível quando a ordem é faturada, momento em que o `FinancialEntry`
  pendente nasce, pela rota de status). Isso será corrigido nesta spec.
- Padrão dos handlers: recebem identificadores que o usuário conhece
  (`ear_tag`, `vaccine_name`) e resolvem para IDs **no servidor**
  (`findAnimalByEarTag`, `findVaccineByName`). O usuário nunca vê um ID.
  Helpers em `src/lib/actions/whatsapp-handlers/shared.ts`: `ask()`,
  `failReply()`, `str()`, `num()`, `confirmFlow()`.

---

## 3. Decisões fechadas com o usuário

Todas confirmadas explicitamente em entrevista. Não reabrir sem pedir.

1. **Lista de agendamentos de prestador:** até **5 itens**, ordenados pela data
   mais próxima, com `"e mais N agendamento(s)"` quando passar disso. Formato da
   linha: `"{serviço} para {cliente} dia {dd/mm/aaaa}, R$ {valor}"`. Vazio:
   `"Nenhum agendamento pendente no momento."`
2. **Vacina prevista não inventa custo.** Não usar estimativa a partir da última
   aplicação, nem criar campo de custo padrão em `Vaccine`. A agenda mostra a
   data, e **o agente oferece registrar um valor previsto**.
3. **A previsão é persistida como `FinancialEntry`** (despesa, `status: pending`,
   `due_date` = data prevista, `related_module: geral`), via
   `createManualEntryAction`. Não criar tabela nem campo novo. Motivo: herda de
   graça o lembrete `bill_due`, o DRE por competência, e a edição/quitação no
   painel.
4. **Conciliação automática, com aviso no texto.** Ao registrar a vacina de
   verdade, o sistema procura a previsão pendente correspondente e **atualiza
   ela** (valor real + `paid`) em vez de criar um segundo lançamento, e diz isso
   na resposta. Sem round-trip de "sim/não". Casamento por **`related_id`
   sintético** `"{animal_id}:{vaccine_id}"`, mantendo `related_module: geral`
   (a trava de edição olha `related_module`, não `related_id`). Precedente do
   projeto: o alerta `low_balance` já usa `related_id` sintético (semana ISO).
5. **Vocabulário dos escopos do `resumo` corrigido e ampliado:**
   - `contas_a_pagar` (**novo**): lista real de despesas pendentes. Sem
     exigência de perfil (serve fazenda e prestador).
   - `contas_a_receber` (**repontado**): lista real de receitas pendentes
     (`FinancialEntry`), **não** mais ordens não faturadas. Sem exigência de
     perfil.
   - `ordens_a_faturar` (**renomeado**): assume o comportamento antigo do
     `contas_a_receber` (ordens `completed` aguardando fatura). Continua como
     opção do funil de prestador, exigindo perfil `prestador`.
   - `financeiro`: **inalterado**, continua respondendo o saldo direto (sem
     funil novo, sem regressão).
6. **Período da lista de contas:** do 1º ao último dia do **mês corrente**,
   **mais** toda pendência com vencimento anterior que nunca foi paga (inclusive
   de meses passados), marcada explicitamente como vencida. Nada não pago pode
   ficar invisível. Formato da linha vencida:
   `"⚠️ VENCIDA há {N} dias: {categoria}, R$ {valor} (venceu {dd/mm/aaaa})"`.
7. **Lavoura não ganha "insumo planejado".** `resumo:lavoura` passa a listar
   **colheita prevista com data e sem valor** (não existe base para estimar
   receita de colheita: produtividade e preço de venda são desconhecidos antes;
   inventar número seria pior que omitir). Custos de lavoura entram por
   `registrar_lancamento_financeiro` com `due_date` futuro, que **já funciona
   hoje**, e aparecem em `contas_a_pagar`.
8. **Nova intenção `registrar_previsao_vacina`**, parâmetros
   `{ear_tag, vaccine_name, cost, due_date?}`. `due_date` é opcional: o padrão é
   o `next_due_at` já calculado pelo sistema, então o usuário só precisa dizer o
   valor. **Sem confirmação sim/não** (informar o valor em resposta direta à
   pergunta já é a confirmação); em vez disso, **eco explícito** do que foi
   gravado (valor + data + a promessa do lembrete). O agente só oferece a
   previsão para vacinas que **ainda não têm** uma.
9. **Painel web: nenhuma alteração** (já funciona, ver seção 2).
   **Testes: novo `scripts/m17-agenda-custo.test.ts`** + `npm run test:m17`.

---

## 4. Regra de escrita obrigatória

**Nunca use o caractere travessão (`—`, em-dash) em nada deste projeto:** código,
comentários, texto de UI, resposta do agente, documentação ou mensagem de
commit. É uma regra permanente do usuário. Use dois pontos, vírgula ou
parênteses. Isso vale especialmente para o texto que o agente manda no WhatsApp.

---

## 5. Tasks, na ordem

### Task 1: função de listagem de pendências

`src/lib/actions/financial-reports.ts`: adicionar **função nova** (não alterar
`getUpcoming`):

```ts
export async function listPendingEntries(
  db: TenantPrismaClient,
  params: { entry_type: "income" | "expense"; end?: Date },
)
```

- `end` default: último dia do mês corrente (23:59:59).
- Filtro: `status: "pending"`, `entry_type`, `due_date: { lte: end }`.
  **Sem piso inferior**: pendências vencidas de meses anteriores entram
  (decisão 6).
- Ordenar por `due_date` ascendente.
- Cada item devolve: `id`, `category`, `amount` (via `decToNum`), `due_date`,
  `related_module`, `related_id`, e `days_overdue: number | null` (positivo
  quando `due_date` < hoje, senão `null`).
- Usar comparação por **início do dia** para "vencida", não por hora exata (uma
  conta que vence hoje não está vencida).

### Task 2: escopos do `resumo`

`src/lib/actions/whatsapp-handlers/resumo.ts`:

- `RESUMO_SECOND_LEVEL`: trocar `"Contas a receber"` por `"Ordens a faturar"`.
- **Mover `contas_a_receber` para fora do bloco que exige perfil `prestador`**
  (hoje é `if (scope === "clientes" || scope === "agendamentos" || scope === "contas_a_receber")`).
  O bloco de perfil passa a cobrir `clientes`, `agendamentos`,
  `ordens_a_faturar`.
- `scope === "agendamentos"`: trocar o `count` pela lista real:
  `db.serviceOrder.findMany({ where: { status: "scheduled" }, orderBy: { performed_at: "asc" }, take: 6, include: { service: {select:{name:true}}, service_client: {select:{name:true}} } })`.
  Mostrar 5 e, se vier um 6º, acrescentar `"e mais N agendamento(s)"` usando um
  `count` separado. Formato e mensagem de vazio: decisão 1.
- `scope === "ordens_a_faturar"`: exatamente o corpo antigo do
  `contas_a_receber` (contagem + soma de `completed`).
- `scope === "contas_a_pagar"` (novo) e `scope === "contas_a_receber"`
  (repontado): usar `listPendingEntries`, até 5 itens + `"e mais N"`,
  ordenando vencidas primeiro (elas já vêm primeiro pela ordenação por
  `due_date`). Linha normal:
  `"{categoria}: R$ {valor}, vence {dd/mm/aaaa}"`. Linha vencida: formato da
  decisão 6. Fechar com o total (`"Total a pagar no período: R$ X"`). Vazio:
  `"Nenhuma conta a pagar no período."` / `"...a receber..."`.
- `action_taken` de cada ramo novo segue o padrão existente
  (`"resumo:contas_a_pagar"` etc.).

### Task 3: agenda de rebanho no `resumo`

`scope === "rebanho"`: manter a contagem de animais ativos e **substituir** o
texto de "próxima vacina" por uma lista:

- `listUpcomingVaccinations(db, 30)` (janela de **30 dias** para a agenda; o
  alerta `vaccine_due` continua com sua janela de 15 dias, inalterado).
- Para cada item, verificar se já existe previsão:
  `db.financialEntry.findFirst({ where: { related_id: `${animal_id}:${vaccine_id}`, entry_type: "expense", status: "pending" } })`.
  Fazer isso em uma única query com `related_id: { in: [...] }` e montar um Map,
  não uma query por item.
- Linha com previsão: `"{vacina} (brinco {ear_tag}) dia {dd/mm/aaaa}, previsão R$ {valor}"`.
  Sem previsão: `"...dia {dd/mm/aaaa}, sem previsão de gasto"`.
- Se houver ao menos uma sem previsão, terminar a resposta oferecendo:
  `"Quer registrar um valor previsto para {vacina} (brinco {ear_tag})? Me diga o valor."`
  (a primeira sem previsão, uma por vez).
- Vazio: `"Nenhuma vacina prevista nos próximos 30 dias."`

### Task 4: agenda de lavoura no `resumo`

`scope === "lavoura"`: manter a contagem de talhões e acrescentar a lista de
colheitas previstas: ciclos com `status in (planted, growing)` e
`expected_harvest_at` no futuro, ordenados por data, até 5 + `"e mais N"`.
Formato: `"{crop_name} (talhão {plot.name}): colheita prevista {dd/mm/aaaa}"`.
**Sem valor** (decisão 7). Vazio: `"Nenhuma colheita prevista."`

### Task 5: intenção `registrar_previsao_vacina`

- `src/lib/whatsapp-intents.ts`: adicionar a `INTENTS` e a `INTENT_ACCESS` com
  `{ module: "financeiro", action: "write", profile: "fazenda" }`.
- `src/lib/actions/financial-entries.ts`: adicionar `related_id?: string | null`
  (opcional, aditivo) ao input de `createManualEntryAction`, repassando ao
  `create`. Não mudar mais nada dela.
- Handler `registrarPrevisaoVacina` em
  `src/lib/actions/whatsapp-handlers/rebanho.ts` (é onde `ear_tag`/`vaccine_name`
  são resolvidos), registrado em `src/lib/actions/whatsapp-router.ts`:
  1. Resolver animal por `ear_tag` e vacina por `vaccine_name` (mesmos helpers e
     mesmas mensagens de erro do `registrarVacina`).
  2. `cost` obrigatório: se ausente, `ask("Qual o valor previsto para ...?")`.
  3. `due_date`: se o parâmetro não vier, buscar o `next_due_at` da vacinação
     mais recente daquele animal + vacina. Se também não houver, `ask()` pedindo
     a data.
  4. **Idempotência:** se já existir previsão pendente com o mesmo
     `related_id`, **atualizar** (valor/data) em vez de criar uma segunda, e
     dizer no texto que a previsão foi atualizada.
  5. Eco da resposta: `"Previsão registrada: Vacinação {vacina} (brinco {ear_tag}), R$ {valor}, vencimento {dd/mm/aaaa}. Vou te lembrar 3 dias antes."`
     A promessa é verdadeira porque corresponde ao `bill_due` (decisão 3);
     **não escreva essa frase se a data estiver fora do alcance do alerta por
     algum motivo.**
  6. `category` do lançamento: `"Vacinação prevista - {vacina} (brinco {ear_tag})"`.

### Task 6: conciliação em `addVaccinationAction`

`src/lib/actions/animals.ts`, dentro de `addVaccinationAction`, **antes** de
chamar `createLinkedEntry`:

- Procurar previsão pendente: `related_id === `${animal_id}:${vaccine_id}``,
  `entry_type: "expense"`, `status: "pending"`.
- **Se existe e um `cost` real foi informado:** atualizar aquele lançamento
  (`amount` = custo real, `status: "paid"`, `paid_at` = agora) e **não** criar
  um novo via `createLinkedEntry`. Devolver no `ActionResult` algo como
  `reconciled: { previous_amount, new_amount }`.
- **Se existe e nenhum `cost` foi informado:** **não** conciliar e **não**
  quitar (não afirmar um número que o usuário não confirmou). Deixar a previsão
  pendente e devolver `pending_prevision_amount`, para o handler dizer:
  `"Vacina registrada. Você tem uma previsão de R$ {valor} pendente para essa vacina; me diga o valor real quando quiser que eu quite."`
- **Se não existe:** comportamento atual, inalterado.
- O retorno ganha campos **aditivos**: a rota web
  (`POST /api/v1/animals/:id/vaccinations`) ignora campos extras e continua
  funcionando sem alteração. Verifique isso ao terminar.
- Atualizar o `reply_text` de `registrarVacina` (`rebanho.ts`) para mencionar a
  conciliação quando ela acontecer (decisão 4: o ajuste tem que ficar visível).

### Task 7: faxina

`src/app/(dashboard)/financeiro/page.tsx` linha ~137: o fallback de vencimento
nulo usa um travessão (`—`), violando a regra da seção 4. Trocar por
`"sem data"`.

### Task 8: documentação

- `docs/n8n-whatsapp-workflow.md`: acrescentar `registrar_previsao_vacina` à
  lista de intenções do prompt de classificação, e os escopos novos do `resumo`
  (`contas_a_pagar`, `contas_a_receber` repontado, `ordens_a_faturar`). **Sem
  isso a feature não funciona em produção**, porque a classificação de intenção
  acontece dentro do N8N, não no Tibé.
- `CLAUDE.md` e `AGENTS.md`: registrar o módulo (tabela de status, lista de
  comandos de teste com `test:m17`, e um parágrafo na seção do agente WhatsApp
  explicando a previsão de gasto + conciliação). Os dois arquivos devem ficar
  em sincronia.
- `/docs/api` (`src/app/(public)/docs/api/page.tsx`): **nada a fazer**, esta
  spec não cria endpoint HTTP novo. Confirme antes de fechar.

### Task 9: testes

`scripts/m17-agenda-custo.test.ts` + `"test:m17"` no `package.json`. Rodar com a
URL do Docker inline (ver AGENTS.md). Cobrir:

1. Lista de agendamentos de prestador traz data e `total_value` reais; corta em
   5 com `"e mais N"`; mensagem de vazio quando não há `scheduled`.
2. Agenda de rebanho distingue vacina **com** e **sem** previsão, e oferece
   registrar apenas para as sem.
3. `registrar_previsao_vacina` cria `FinancialEntry` pendente, despesa, com
   `related_id` sintético correto e `due_date` = `next_due_at` quando a data não
   é informada.
4. Chamar `registrar_previsao_vacina` duas vezes **atualiza** a mesma linha, não
   cria duas.
5. **Conciliação:** registrar a vacina com custo real atualiza a previsão para
   `paid` com o valor real e **o total de despesas não dobra**. Este é o teste
   mais importante da spec.
6. Registrar a vacina **sem** custo deixa a previsão pendente e não quita nada.
7. `contas_a_pagar` inclui uma pendência **vencida de mês anterior**, marcada
   como vencida. (Regressão do pior modo de falha: nada não pago pode ficar
   invisível.)
8. `contas_a_receber` responde a partir de `FinancialEntry` (receita pendente) e
   **não** de ordens não faturadas; `ordens_a_faturar` responde o comportamento
   antigo.
9. Isolamento multi-tenant nos caminhos novos (padrão de todo módulo).

Rodar também a regressão: `test:m3`, `test:m4`, `test:m11`, `test:m12`
(mexemos em `resumo` e no caminho financeiro).

---

## 6. Critérios de aceitação

Derivados diretamente do que o usuário disse que não pode acontecer:

1. Perguntar "quais minhas contas a pagar" **nunca** omite uma pendência não
   paga, inclusive vencida de mês anterior.
2. Registrar uma vacina que tinha previsão **nunca** resulta em despesa contada
   duas vezes.
3. Toda previsão registrada com `due_date` futuro **de fato** gera alerta
   `bill_due` 3 dias antes (verificável rodando `generateAlertsForTenant`).
4. "Contas a receber" significa a mesma coisa no WhatsApp, no DRE e no painel.
5. Nenhum travessão (`—`) introduzido em código, texto de agente ou docs.
6. Nenhuma mudança de schema Prisma foi necessária.
