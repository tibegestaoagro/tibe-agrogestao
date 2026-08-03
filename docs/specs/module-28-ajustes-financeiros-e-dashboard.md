# Módulo 28: ajustes financeiros e tela inicial reformulada

**Status:** especificado, decisões fechadas com o usuário em 2026-08-04.
Implementação a seguir. Todas as ambiguidades foram resolvidas em entrevista,
então **não é necessário perguntar de novo** o que está decidido aqui.

---

## 1. Objetivo

Última peça da seção 2 do plano de ação (`docs/cliente/02-plano-de-acao.md`):
ajustes de comportamento financeiro que o documento do cliente pede (adiar
vencimento, cancelar conta, categorias personalizadas de receita/despesa,
preferências de quais lembretes receber) e a tela inicial reformulada, agora
possível porque Máquinas e Meu Dia já existem (eram a dependência que
segurava essa etapa).

## 2. Decisões fechadas (não reabrir sem pedir)

1. **Categorias financeiras ganham modelo próprio por tenant**,
   `FinancialCategory`, separado por `entry_type` (receita/despesa). Mesmo
   padrão de `AnimalCategory` (Módulo 25): CRUD simples, seedado com
   defaults, `category` do `FinancialEntry` continua sendo texto livre (não
   vira `FK` obrigatória, pra não quebrar lançamento antigo nem os
   automáticos que já passam string solta via `createLinkedEntry`), mas o
   painel passa a sugerir a partir dessa lista em vez da constante fixa
   `FINANCIAL_CATEGORIES`.
2. **Cancelar lançamento vale pra qualquer um, sem restrição de origem.**
   Diferente de editar (`NOT_EDITABLE` fora de `related_module: geral`):
   cancelar só muda `status`, não mexe em valor/categoria, risco bem menor.
   Mesmo raciocínio de "marcar como pago", que já funciona em qualquer
   lançamento hoje.
3. **Adiar vencimento também vale pra qualquer lançamento**, mesmo critério
   do item acima: só muda `due_date`, não a origem do dado.
4. **Preferência de lembrete é por TIPO de alerta, nunca por canal.** A
   política de canal (`notify()`, Onda 2) continua sendo decisão do
   sistema: alerta crítico sempre tenta push+WhatsApp+email, resumo diário
   sempre tenta push com WhatsApp de reforço. Enfraquecer isso por escolha
   do usuário contrariaria a garantia de comprovação já estabelecida
   deliberadamente. O usuário só liga/desliga QUAIS tipos de alerta quer
   ver (ex: desligar `harvest_near` num tenant sem perfil lavoura).
5. **Preferência é por TENANT, não por usuário.** Mesmo nível dos
   destinatários de alerta hoje (`findAlertRecipient`, um por tenant).
   Ausência de preferência = habilitado (opt-out, não opt-in): não exige
   seedar linha nenhuma pra tenant existente continuar recebendo tudo como
   já recebe hoje.
6. **Tela inicial soma os indicadores que faltam, não substitui o que já
   existe.** O dashboard atual (Módulo 5, `/dashboard`) já tem cards úteis
   (rebanho, lavoura, prestador, saldo, alertas pendentes, gráfico de fluxo
   de caixa) que ninguém pediu para remover. Adiciona os 4 que são
   genuinamente novos porque as áreas são novas: próximos compromissos
   (Meu Dia), contas vencidas, manutenções próximas (Máquinas), últimos
   lançamentos.

## 3. Modelo de dados

```prisma
enum FinancialEntryStatus {
  pending
  paid
  overdue
  cancelled
}

model FinancialCategory {
  id         String    @id @default(cuid())
  tenant_id  String
  name       String
  entry_type EntryType
  active     Boolean   @default(true)
  created_at DateTime  @default(now())

  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, entry_type, name])
  @@index([tenant_id])
}

// Ausência de linha = habilitado (opt-out). Só existe linha pra tipo
// explicitamente desligado por algum usuário.
model AlertPreference {
  id         String    @id @default(cuid())
  tenant_id  String
  alert_type AlertType
  enabled    Boolean   @default(false)
  created_at DateTime  @default(now())

  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, alert_type])
  @@index([tenant_id])
}
```

`FinancialCategory` e `AlertPreference` entram em `TENANT_SCOPED_MODELS`.
`AlertPreference.enabled` é `false` por padrão só porque a linha só é criada
quando alguém MUDA o padrão: uma linha com `enabled: false` representa "essa
pessoa desligou este tipo". Não existe linha com `enabled: true` (seria
redundante com a ausência de linha).

**Categorias padrão semeadas na primeira leitura** (mesmo mecanismo de
`listCategoriesAction` do Módulo 25): despesa = as 7 atuais de
`FINANCIAL_CATEGORIES` (Ração, Combustível, Mão de obra, Manutenção,
Insumos, Veterinário, Outros); receita = Venda de animal, Venda de lote,
Faturamento de serviço, Outros.

## 4. Regras de negócio

- **`postponeEntryDueDateAction(db, id, newDueDate)`**: só para lançamento
  `status: pending` (não faz sentido adiar um já pago ou cancelado). Sem
  restrição de `related_module`.
- **`cancelEntryAction(db, id)`**: muda `status` para `cancelled`. Sem
  restrição de `related_module`, sem restrição de status atual anterior
  (cancelar um `overdue` também é válido).
- **Geração de alerta** (`generateAlertsForTenant`): antes de cada uma das 7
  verificações, checa se existe `AlertPreference` para aquele
  `alert_type` com `enabled: false`; se existir, pula a verificação inteira
  (nenhum alerta daquele tipo é gerado nesta execução, pra este tenant).
- **`FinancialCategory`**: CRUD simples (criar, renomear, desativar), mesmo
  padrão de `animal-categories.ts`. Nome único por tenant+tipo (case
  insensitive).
- **Dashboard, 4 cards novos**:
  - Próximos compromissos: `Task` com `status: pending`, `due_date` nos
    próximos 7 dias, ordenado por data, até 5 linhas.
  - Contas vencidas: contagem de `FinancialEntry` com `status: pending` e
    `due_date` no passado (mesmo critério que definiria "atrasada").
  - Manutenções próximas: `Machine` com `next_maintenance_at` nos próximos
    15 dias (mesma janela do alerta `maintenance_due`).
  - Últimos lançamentos: 5 `FinancialEntry` mais recentes por `created_at`,
    qualquer status.

## 5. Fora de escopo desta rodada

- `category` do `FinancialEntry` virar `FK` obrigatória pra
  `FinancialCategory` (continua texto livre, a categoria é só sugestão).
- Preferência de lembrete por usuário (fica por tenant).
- Reordenar/customizar quais cards aparecem no dashboard (só adiciona, não
  vira configurável).
- Os 7 atalhos da seção 5.2 do documento do cliente: não detalhados o
  suficiente pra especificar agora: os 4 indicadores novos já cobrem o
  ganho principal desta rodada.
- Reestruturar a navegação pro formato do mockup do cliente (decisão já
  registrada: fica pra depois, sem prazo).

## 6. Critérios de aceitação

1. `npm run test:m1`, `test:m4`, `test:m17`, `test:m25`, `test:m27`,
   `test:m28` (Meu Dia) continuam passando sem alteração.
2. Novo `npm run test:m29` cobrindo: CRUD de `FinancialCategory` (por tipo,
   isolamento), cancelar lançamento de qualquer origem, adiar vencimento,
   preferência de alerta desligando um tipo específico (a geração pula
   aquele tipo, os outros continuam normais), isolamento multi-tenant de
   `AlertPreference`.
3. Painel: `/configuracoes/categorias-financeiras` (CRUD), preferências de
   alerta em alguma tela de configurações, ações de adiar/cancelar em
   `/financeiro`, 4 cards novos em `/dashboard`.
4. Zero travessão (U+2014) em qualquer arquivo novo ou alterado.
