# Módulo 27: Meu Dia (tarefas e compromissos)

**Status:** especificado, decisões fechadas com o usuário em 2026-08-04.
Implementação a seguir. Todas as ambiguidades foram resolvidas em entrevista,
então **não é necessário perguntar de novo** o que está decidido aqui.

---

## 1. Objetivo

Terceira das quatro áreas da primeira versão do documento do cliente ainda
sem código ("Organizar minha fazenda": fazenda, rebanho, financeiro,
**compromissos**, máquinas e equipamentos). Hoje o produtor só recebe o que o
sistema decide sozinho (vacina, conta, manutenção); falta ele poder dizer
*"me lembra de comprar sal na quinta"* e o Tibé lembrar de verdade, no dia.

## 2. Decisões fechadas (não reabrir sem pedir)

1. **Entra no agente WhatsApp nesta rodada**, diferente de Máquinas e
   Calculadora. O próprio exemplo do documento do cliente é uma frase de
   WhatsApp: nova intenção (`criar_tarefa`), com confirmação antes de gravar,
   mesmo padrão de toda intenção que grava dado (`cadastrar_animal`,
   `registrar_lote_animal`, `registrar_lancamento_financeiro`).
2. **Lembrete dispara NO DIA marcado, não com dias de antecedência.**
   Mecanismo diferente de `vaccine_due`/`bill_due`/`maintenance_due` (que
   avisam ANTES de vencer): aqui o cron diário gera um alerta quando
   `due_date` cai no dia da execução. Bate com o exemplo literal do cliente
   ("na quinta", não "3 dias antes de quinta").
3. **"Atrasada" é calculado, nunca gravado**: `status = pending` e `due_date`
   no passado. Evita um job específico só para "promover" tarefa pendente
   pra atrasada; o cálculo acontece toda vez que a lista é lida.
4. **Tarefas são compartilhadas dentro do tenant**, visíveis pra todo mundo,
   não privadas por usuário. Bate com o espírito do produto (fazenda
   pequena, poucas pessoas, todo mundo precisa saber o que está pendente).
   `created_by` fica guardado só como metadado (quem criou), nunca como
   filtro de visibilidade.
5. **`due_date` é obrigatório; o lembrete (`remind`) é opcional, um toggle
   separado.** "Situação" (pendente/concluída/atrasada/cancelada) exige uma
   data pra "atrasada" fazer sentido; "lembrete opcional" do documento do
   cliente é a possibilidade de ter uma tarefa organizacional sem querer ser
   incomodado com notificação proativa nela.
6. **Concluir/cancelar fica só no painel web nesta rodada.** O WhatsApp só
   CRIA tarefa (`criar_tarefa`); marcar como feita ou cancelar não ganha
   intenção nova agora. Mantém o escopo do agente WhatsApp enxuto, bate com
   "perguntar o mínimo": o exemplo do cliente é só sobre lembrar, não sobre
   fechar o ciclo completo por chat.
7. **`RelatedModule` reusa `"geral"`.** Tarefa não pertence a nenhum domínio
   de negócio específico (rebanho/lavoura/servico/maquinas): mesma categoria
   de `low_balance`/`trial_ending`, que também usam `"geral"`.
8. **`ModuleKey` novo, `"tarefas"`**, mesma matriz aberta de
   `rebanho`/`lavoura`/`maquinas`: OWNER/ADMIN/OPERADOR escrevem,
   VISUALIZADOR só lê.
9. **Sem exclusão real.** `status: "cancelled"` é o único jeito de "remover"
   uma tarefa, mesmo critério de todo o resto do sistema (preserva
   histórico).

## 3. Modelo de dados

```prisma
enum TaskStatus {
  pending
  completed
  cancelled
}

model Task {
  id         String     @id @default(cuid())
  tenant_id  String
  title      String
  due_date   DateTime
  remind     Boolean    @default(true)
  status     TaskStatus @default(pending)
  created_by String? // User.id de quem criou; metadado, nunca filtro de visibilidade
  reminded_at DateTime? // marca que o lembrete do dia já foi gerado (idempotência)
  created_at DateTime   @default(now())
  updated_at DateTime   @updatedAt

  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@index([tenant_id])
  @@index([due_date])
}
```

`Task` entra em `TENANT_SCOPED_MODELS`. `AlertType` ganha `task_reminder`.
`ModuleKey` ganha `tarefas` (matriz igual a `rebanho`/`lavoura`/`maquinas`).
`created_by` é `String?` sem relação Prisma pra `User` (só guarda o id como
referência solta, mesmo espírito de `changed_by_platform_user_id` em
`SubscriptionStatusLog`): não precisa navegar de `Task` pra `User` em nenhum
fluxo desta rodada.

## 4. Regras de negócio

- **Criar tarefa**: `title`/`due_date` obrigatórios. `remind` default `true`.
- **Concluir/cancelar** (só painel): muda `status`. Sem geração de
  `FinancialEntry` nem qualquer efeito colateral em outro módulo: tarefa é
  puramente organizacional.
- **Geração de alerta** (`generateAlertsForTenant`, 7ª verificação): tarefas
  com `status = "pending"`, `remind = true`, `due_date` no dia de hoje
  (janela do próprio dia, 00h-23h59, não dias futuros) e `reminded_at` nulo.
  Idempotência pelo mecanismo já existente (`ensureAlert`,
  `alert_type + related_module + related_id`), mesmo sem `reminded_at`: mas
  `reminded_at` marca explicitamente que a tarefa já teve seu lembrete do
  dia gerado, evitando reprocessar a mesma tarefa em execuções futuras do
  cron depois que o dia já passou (sem isso, uma tarefa não concluída
  continuaria "no passado" indefinidamente sem re-disparar, o que já é
  coberto por checar só `due_date = hoje`, mas `reminded_at` deixa a
  auditoria explícita: quando o lembrete de fato foi gerado).
- **Intenção WhatsApp `criar_tarefa`**: extrai `title` e `due_date` da
  mensagem (interpretação de data relativa, ex: "quinta", "amanhã", fica a
  cargo do prompt do classificador no n8n, mesmo mecanismo já usado pelas
  outras intenções). Confirmação obrigatória antes de gravar (resumo:
  "Confirma: comprar sal, dia X?"). Sem `remind` configurável por
  WhatsApp nesta rodada: toda tarefa criada por lá nasce com `remind: true`.

## 5. Fora de escopo desta rodada

- Concluir/cancelar tarefa pelo WhatsApp.
- Lembrete configurável (antecedência customizada, múltiplos lembretes).
- Tarefas privadas por usuário / atribuição a um usuário específico.
- Recorrência (tarefa que se repete toda semana, por exemplo).
- Tela inicial reformulada (8 indicadores do documento do cliente, entre
  eles "próximos compromissos"): depende de Máquinas E Meu Dia existirem
  primeiro, é a próxima rodada da fila já combinada com o usuário.
- App mobile e `packages/contracts`: mesma decisão das rodadas anteriores
  (nenhum dos dois cobre os módulos novos ainda).

## 6. Critérios de aceitação

1. `npm run test:m1`, `test:m4`, `test:m17`, `test:m25`, `test:m27`
   (máquinas) continuam passando sem alteração.
2. Novo `npm run test:m28` cobrindo: CRUD de tarefa, cálculo de "atrasada"
   (sem gravar no banco), geração do alerta `task_reminder` no dia exato
   (não antes, não depois), `remind: false` não gera alerta, idempotência
   (não duplica no mesmo dia), tarefa compartilhada (visível a qualquer
   usuário do tenant, independente de quem criou), isolamento multi-tenant,
   e a intenção `criar_tarefa` ponta a ponta via
   `POST /api/internal/whatsapp/execute-action` (com confirmação).
3. Painel web: lista de tarefas com filtro por status (incluindo "atrasada"
   calculada), ação de concluir/cancelar.
4. Zero travessão (U+2014) em qualquer arquivo novo ou alterado.
