# Módulo 38: Meu Dia

Quarta e última das quatro áreas. **Não é módulo novo**: é a fase que transforma
a tabela de tarefas que existe hoje na tela que o documento descreve. O mapa das
quatro e as 34 decisões estão em
[2026-09-10-sequencia-das-quatro-areas.md](2026-09-10-sequencia-das-quatro-areas.md).

Documento do cliente: `docs/modulo-meu-dia/`. As seções citadas com § são dele.

**O princípio que governa a área, na frase do próprio documento (§3):** "o
produtor não procura o que precisa fazer. O Tibé mostra o que merece sua
atenção."

⚠️ **A regra de ouro (§62)**, que decide o que entra na tela: *isso exige
alguma atenção ou ação do produtor agora?* Se não, não ocupa a tela principal.
É ela que impede o Meu Dia de virar o feed do §51 ou o painel de ERP do §52.

⚠️ **O Meu Dia não duplica os módulos (§35, §61).** Uma conta a pagar continua
sendo do Financeiro; o Meu Dia só a apresenta. Uma tarefa criada aqui pertence
ao sistema de tarefas. Nada nesta fase cria uma segunda base do que já existe.

---

## O que existe hoje, medido

| pedido do documento | hoje |
|---|---|
| §30 a §32, as três seções | **não existem**: `/meu-dia` é uma tabela única de tarefas, ordenada por data |
| §18, cadastro de tarefa | existe, com **dois** campos: título e data. Nada mais |
| §19, tarefa sem data | **impossível**: `Task.due_date` é obrigatório no schema |
| §21, horário | não existe |
| §22, responsável | não existe |
| §23, prioridade | não existe |
| §24, recorrência | não existe |
| §26, adiar | **não existe**: `PATCH /api/v1/tasks/[id]` aceita só `status` |
| §25 e §27, concluir e cancelar | existem, e são os dois únicos botões da tela |
| §28, atrasada | existe e está correta: `effectiveStatus` compara por DIA, não por instante |
| §46, resumo da fazenda | existe **no `/dashboard`**, não aqui |
| §7, financeiro | o `/dashboard` já conta contas de hoje e recebimentos previstos |
| §53, histórico do dia | não existe |
| §38 a §43, WhatsApp | `criar_tarefa` existe; consultar o dia, não |

⚠️ **Parte do §49 já está construída, no lugar errado.** O `/dashboard` tem a
saudação, o bloco "Meu Dia" com contas do dia, recebimentos, tarefas pendentes e
próxima vacina, e o mini calendário. Esta fase **move o que é do Meu Dia para o
Meu Dia**, em vez de escrever de novo. O que fica no `/dashboard` é o que o §52
proíbe aqui: gráfico, indicador, série histórica.

### O que já está pronto para ser reusado

| o que | onde |
|---|---|
| tarefa, com status e "atrasada" derivada | `src/lib/actions/tasks.ts` |
| comparação por dia-calendário | `prazoVencido`, `src/lib/dia-calendario.ts` |
| prioridade normal/urgente | enum `ShoppingPriority`, **já compartilhado** (decisão 28) |
| pessoa da fazenda | `Worker`, do Módulo 33 |
| contas a pagar e a receber com vencimento | `listPendingEntries`, `src/lib/actions/financial-reports.ts` |
| vacinas previstas | `listUpcomingVaccinations` |
| alerta de estoque baixo | `low_stock`, que já roda no cron diário |
| itens da lista de compra | `listarItensAction`, com o urgente do §14 |
| criar tarefa pelo WhatsApp | intenção `criar_tarefa` |

---

## O desenho

### As três seções, lidas ao vivo

Decisão 21, mantida: "Hoje", "Atenção" e "Próximos dias" são **consulta no
request**, como o `/dashboard` já faz. O §61 é explícito que o Meu Dia "não
deverá criar bases paralelas desnecessárias".

Materializar daria a cada módulo um segundo lugar para escrever, e no dia em que
os dois divergirem **a tela mente**, que é o pior defeito possível numa tela
cuja única promessa é mostrar a verdade do dia.

### As fontes, e por que estas

Decisão do usuário em 11/09: entram **as áreas que já guardam uma data no
banco**, porque só elas sabem dizer o que vence sem inventar nada.

| fonte | o que vira | seção |
|---|---|---|
| `FinancialEntry` pendente | contas a pagar e a receber (§7) | Hoje, Atenção quando vencida, Próximos dias |
| `Task` | tarefa do produtor (§17) | as três, conforme a data |
| `AnimalVaccination.next_due_at` | vacina prevista (§9) | Hoje e Próximos dias |
| `ServiceJob` agendado | serviço com data (§13) | Hoje e Próximos dias |
| `HerdStay` de confinamento com saída prevista | saída de lote (§10) | Próximos dias |
| alerta `low_stock` | estoque crítico (§15) | Atenção |
| `ShoppingItem` pendente | só a CONTAGEM e os urgentes (§14) | resumo |

⚠️ **A Lista de Compra não aparece inteira (§14).** O documento é explícito: uma
linha dizendo quantos itens existem, e outra quando houver urgente. Despejar a
lista no Meu Dia é exatamente o que o §51 proíbe.

**Fora, porque o dado não existe:** retirada e entrega de negociação (§8),
coleta de leite (§11), troca de óleo e manutenção programada (§16), diarista
agendado (§12). Nenhum deles tem campo de data hoje, e criar seis campos novos
em cinco módulos para preencher uma tela é a cauda balançando o cachorro.
Registrar como dívida.

### A ordem de importância (§50)

Não é cronológica, e essa é a parte que o produtor sente:

1. vencido ou atrasado;
2. compromisso de hoje **com horário**;
3. pagamento e recebimento de hoje;
4. tarefa urgente;
5. demais tarefas de hoje;
6. próximos compromissos.

⚠️ **Isso é uma função pura de ordenação, e é onde a tela ganha ou perde.** Ela
merece teste próprio, com o caso que discrimina: uma tarefa urgente sem horário
contra um compromisso comum às 14h.

### `Task` cresce, e o que cresce nela

```
model Task {
  /// §19: a data passa a ser OPCIONAL. "Preciso consertar a porteira" e uma
  /// tarefa legitima, e ela nao pode sumir por nao ter dia.
  due_date    DateTime?

  /// §21: horario, opcional. Guardado junto da data, nao em coluna propria.
  /// Sem data nao ha horario que signifique alguma coisa.
  due_time    String?

  /// §22, decisao 20: aponta para `Worker`, com texto livre de reserva.
  worker_id   String?
  assignee    String?

  /// §23, decisao 28: o MESMO enum da Lista de Compra.
  priority    ShoppingPriority @default(normal)

  /// Decisao 31: fazenda e observacao entram; PASTO fica fora.
  property_id String?
  notes       String?

  /// §24, decisao 25: recorrencia pelo padrao ROLANTE.
  recurrence  TaskRecurrence?
}
```

⚠️ **Data opcional tem três consequências, e as três já foram decididas**
(decisão 19): tarefa sem data vai para seção própria, nunca misturada com
"Hoje"; não gera lembrete, porque não há dia para lembrar; e **nunca é
"Atrasada"**, porque não há prazo a estourar.

⚠️ **`effectiveStatus` precisa mudar junto.** Hoje ele assume `due_date`
presente. Com a data opcional, o campo passa a ser `Date | null` e a função tem
que responder `pending` para o nulo. É a mudança mais fácil de esquecer desta
fase, e ela quebra em produção, não no `tsc`.

### Recorrência pelo padrão rolante

Decisão 25. "Toda segunda conferir os bebedouros" não cria 52 linhas: conclui a
de hoje e a próxima nasce a partir da conclusão.

⚠️ **Consequência aceita de olhos abertos:** quem pula três segundas seguidas
fica com **uma** pendência, não três. Para tarefa de rotina isso está certo, e o
contrário entulharia a tela com o que já não adianta fazer.

### Adiar, editar e excluir (§26, §27)

O `PATCH` aceita só `status`, e a tela tem dois botões. O §26 pede adiar, e
editar o título é o mínimo para quem digitou errado. Entram os três.

⚠️ **Adiar é mudar a data, e o §26 diz que "o histórico poderá registrar que a
tarefa foi reagendada".** Nesta fase o registro é o `updated_at`: uma tabela de
histórico de tarefa não foi pedida e traria a pergunta sem boa resposta sobre o
que fazer quando a tarefa é apagada.

### O histórico do dia (§53)

Decisão 26, mantida: união de `HerdMovement`, `StockMovement`,
`FinancialPayment`, `MilkMovement` e `ServiceJobLog` por data, lida ao vivo.

Sem tabela de log, que traria a pergunta sem boa resposta: o que acontece com a
linha quando a movimentação de origem é cancelada.

### O resumo da fazenda (§46, §47)

Poucos números, e **só os do perfil do produtor** (§47, §60): quem não tem leite
não vê litro nenhum. O `/dashboard` já resolve o perfil ativo, e a mesma
checagem serve aqui.

### O que fica FORA, e por quê

| o que | por quê |
|---|---|
| Entrada universal (§34 a §37) | decisão 5: depende do classificador, que está congelado. Caixa de texto sem cérebro atrás mente para o produtor |
| Meu Dia como porta de entrada (§4) | decisão do usuário em 11/09: troca em rodada própria, depois de ele ser usado alguns dias |
| Concluir e alterar tarefa por frase no WhatsApp (§42, §43) | decisão do usuário: casar frase com tarefa erra calado, e o pasto ambíguo já mostrou o preço |
| Calendário de período longo (§33) | o próprio documento diz que "não deverá ser a experiência principal"; o mini calendário do `/dashboard` já cobre |
| Pasto na tarefa | decisão 31 |
| Tudo do §63 | o documento já os tira: kanban, cronograma, dependência, ponto eletrônico, feed |

---

## As decisões desta fase

| # | decisão | alternativa descartada |
|---|---|---|
| 38.1 | Só as fontes que já têm data no banco | criar campo de data em cinco módulos para encher uma tela |
| 38.2 | A porta de entrada troca depois | virar a home de todos os clientes no mesmo dia em que a tela nasce |
| 38.3 | WhatsApp consulta e cria, não conclui por frase | casar texto com tarefa e marcar a errada em silêncio |
| 38.4 | O bloco do `/dashboard` MUDA de lugar, não é reescrito | duas telas com a mesma lista, divergindo na primeira mudança |
| 38.5 | A ordem do §50 é função pura, com teste próprio | ordenar na consulta, onde nenhum teste alcança |
| 38.6 | Adiar, editar e excluir entram | o §26 pedido e não entregue, de novo |

---

## Tarefas

### T01: schema e migração

`Task` ganha os sete campos, e `due_date` vira opcional. Enum `TaskRecurrence`
(`diaria`, `semanal`, `mensal`), e `priority` reusando `ShoppingPriority`.

`worker_id` e `property_id` com `SetNull`: arquivar um trabalhador ou uma
fazenda não pode travar a tarefa.

⚠️ Migração escrita à mão com `migrate diff`, nunca `migrate dev`. Aplicar
primeiro no Docker local, e **antes do push** no Neon (invariante 3).

⚠️ **Tornar uma coluna opcional é seguro; o caminho de volta não é.** Registrar
no SQL que a migração não tem reversão trivial.

### T02: as actions da tarefa

`src/lib/actions/tasks.ts` cresce:

| action | o que faz |
|---|---|
| `criarTarefaAction` | título obrigatório, todo o resto opcional (§18) |
| `atualizarTarefaAction` | editar título, data, hora, responsável, prioridade, fazenda, observação |
| `adiarTarefaAction` | §26: muda a data, e só ela |
| `concluirTarefaAction` | §25, e é aqui que a recorrência do §24 gera a próxima |
| `excluirTarefaAction` | o §27 quer cancelar mantendo histórico; excluir de vez é para quem digitou errado |

⚠️ **`effectiveStatus` passa a receber `Date | null`** e responde `pending` para
tarefa sem data (decisão 19). Sem isso, toda tarefa sem data vira "Atrasada" no
dia seguinte.

### T03: a consulta das três seções

`src/lib/actions/meu-dia.ts`, função que lê as seis fontes e devolve os itens já
classificados em Hoje, Atenção, Próximos dias e Sem data.

Um tipo só de item na saída (`origem`, `titulo`, `quando`, `valor?`,
`href`), porque a tela trata todos igual e a diferença é só de onde veio.

⚠️ **Consulta só o que a fazenda ATIVA do seletor do topo alcança**, como o
Financeiro passou a fazer na 35.1. E, como lá, **item sem fazenda não pode
sumir**: ele aparece em todas.

### T04: a ordem do §50

Função pura de ordenação, separada da consulta, exatamente para poder ser
testada. Recebe os itens e devolve na ordem das seis prioridades.

⚠️ O caso que discrimina: **tarefa urgente sem horário contra compromisso comum
às 14h**. O horário vence, porque o §50 põe "compromissos de hoje com horário"
acima de "tarefas urgentes".

### T05: as rotas

`/api/v1/tasks` (GET, POST) ganha os campos novos; `/api/v1/tasks/[id]` ganha
`PATCH` completo e `DELETE`. Wrappers finos, `apiErroDeZod` na recusa, `field`
em toda recusa que pertence a um campo.

### T06: a tela

`/meu-dia` deixa de ser tabela. Saudação (§49), as três seções, a seção de sem
data, o resumo da fazenda (§46) e o acesso à Lista de Compra (§14).

O formulário de tarefa ganha os campos do §18, todos opcionais menos o título,
no padrão do kit: `FormSheet` + `Field` + `useErrosDeFormulario`.

⚠️ **O §52 proíbe gráfico, indicador técnico e tabela extensa aqui.** Se a tela
começar a parecer o `/dashboard`, o desenho saiu do trilho.

### T07: o bloco do dashboard muda de lugar

O `/dashboard` perde o bloco "Meu Dia" e ganha um link. **Nada é reescrito**: a
consulta da T03 passa a servir os dois, e o dashboard fica com o que é dele,
gráfico e indicador.

### T08: o histórico do dia (§53)

União das cinco origens por data, ao vivo. Uma seção recolhida na própria tela,
porque o §53 fala em "consultar", não em ver o tempo todo.

### T09: os handlers do WhatsApp

| intenção | conversa |
|---|---|
| `consultar_meu_dia` | "o que tenho para hoje?" (§38) |
| `consultar_amanha` | "o que tenho amanhã?" (§39) |
| `consultar_semana` | "o que tenho essa semana?" (§40) |

`criar_tarefa` já existe e ganha os campos novos (§41: "me lembra sexta de
comprar vacina").

⚠️ **A resposta segue o §38:** cumprimento, a contagem, e a lista curta. E a
ordem é a do §50, a mesma da tela: a função da T04 serve aos dois.

⚠️ **O classificador do n8n não emite as três**, como as da calculadora, da
lista, do evento e da permuta.

### T10: a suíte

Escrita **da spec**. O que precisa de caso que discrimina:

- tarefa **sem data** que não vira "Atrasada" no dia seguinte (T02);
- a ordem do §50, com o urgente sem hora contra o das 14h (T04);
- recorrência rolante: concluir gera UMA próxima, não o mês inteiro (T02);
- item sem fazenda que continua aparecendo com o filtro ligado (T03);
- "Atenção" que só recebe o que está vencido, e não o que vence hoje (T03).

### T11: validação ao vivo

Navegador real, com cenário montado por script `tsx`, e as três conversas pelo
roteador. A ordem que funciona: quebre a trava de propósito, rode a suíte, e
**abra a tela**.

O que só o navegador prova: as seções na ordem certa com dado real, o formulário
de tarefa com sete campos opcionais, e a tela num telefone de 400px.

---

## Critérios de aceite (§64)

Os 28 itens do documento, menos os que as decisões tiraram:

| § | item | como fica |
|---|---|---|
| §64 | ver o que precisa de atenção hoje | T03, T04, T06 |
| §64 | tarefas, compromissos, pagamentos, recebimentos | T03 |
| §64 | situações atrasadas e próximos compromissos | T03 |
| §64 | criar tarefa e lembrete, com data, horário e responsável opcionais | T01, T02, T06 |
| §64 | marcar urgente, concluir, adiar, cancelar | T02, T05, T06 |
| §64 | tarefa recorrente simples | T02 |
| §64 | receber compromissos das demais áreas | T03, nas seis fontes da decisão 38.1 |
| §64 | consultar o dia, amanhã e a semana pelo WhatsApp | T09 |
| §64 | criar lembrete pelo WhatsApp | `criar_tarefa`, já existente |
| §64 | resumo da fazenda e histórico do dia | T06, T08 |
| §64 | ver só o que é do seu perfil | T06 |
| §64 | **registrar acontecimentos pelo Meu Dia** | **fora** (decisão 5) |
| §64 | **concluir tarefa pelo WhatsApp** | **fora** (decisão 38.3) |
