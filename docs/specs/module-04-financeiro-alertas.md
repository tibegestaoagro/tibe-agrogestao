# Spec: Módulo 4, Financeiro e Alertas

**Depende de:** Módulos 0, 1 e 2 concluídos
**Agente responsável:** agente de financeiro e automações
**Fase do contrato:** Fase 3 (Semanas 5 e 6)

---

## Objetivo

Criar o módulo financeiro compartilhado entre os perfis fazenda e prestador de serviço, com lançamentos manuais e automáticos, fluxo de caixa, DRE simplificado, geração de relatório em PDF, e sistema de alertas automáticos via job agendado.

---

## Tasks: Financeiro

### 4.1 Modelo de dados

- Confirmar modelo `FinancialEntry` no schema Prisma (definido no PRD seção 4)
- Confirmar que os Módulos 1 e 2 já criam `FinancialEntry` automaticamente em suas respectivas ações (venda de animal, insumo com custo, ordem de serviço faturada)

### 4.2 Lançamentos manuais

- Criar endpoint `POST /api/v1/financial-entries` para lançamento manual de receita ou despesa não vinculada a outro módulo (`related_module: geral`)
- Campos: tipo, categoria, valor, data de vencimento, observações
- Criar endpoint `GET /api/v1/financial-entries` com filtros por período, tipo, categoria, módulo de origem, status
- Criar endpoint `PATCH /api/v1/financial-entries/:id` para editar
- Criar endpoint `PATCH /api/v1/financial-entries/:id/pay` para marcar como pago, registrando `paid_at`

### 4.3 Categorização automática

- Ao criar lançamento manual, sugerir categoria com base em palavras-chave do campo de observações (lista fixa de categorias comuns do agro: ração, combustível, mão de obra, manutenção, insumos, veterinário, outros)
- Sugestão é exibida na interface como pré-preenchimento editável, não bloqueia o usuário de escolher outra categoria

### 4.4 Fluxo de caixa

- Criar endpoint `GET /api/v1/financial/cash-flow` retornando saldo por período, agrupado por dia ou mês conforme parâmetro
- Suportar filtro por `related_module` (ver fluxo só do rebanho, só da lavoura, só do prestador, ou consolidado)

### 4.5 DRE simplificado

- Criar endpoint `GET /api/v1/financial/dre` retornando receitas e despesas agrupadas por `related_module`, com resultado (receita - despesa) por módulo e total geral
- Período configurável via query params

### 4.6 Contas a pagar e a receber

- Criar endpoint `GET /api/v1/financial/upcoming` retornando lançamentos com `due_date` nos próximos 7 dias e status `pending`
- Usado pela interface web e pelo sistema de alertas

### 4.7 Geração de relatório em PDF

- Criar função `lib/reports/generate-financial-pdf.ts` que monta um PDF com: resumo do período, DRE por módulo, lista de lançamentos
- Fazer upload do PDF gerado para Cloudflare R2
- Retornar URL assinada de download
- Esta função é chamada tanto pela interface web (botão "Exportar relatório") quanto pelo Módulo 3 (agente WhatsApp, intenção `gerar_relatorio`)

### 4.8 Interface do módulo Financeiro

- Criar página `app/(dashboard)/financeiro/page.tsx`
- Cards de resumo no topo: saldo do período, total a receber, total a pagar, contas vencendo em 7 dias
- Gráfico de fluxo de caixa (Recharts, linha)
- Tabela de lançamentos com filtros por tipo, categoria, módulo, status, período
- Botão de novo lançamento manual abrindo formulário em painel lateral
- Botão de exportar relatório em PDF

---

## Tasks: Alertas

### 4.9 Modelo de dados

- Confirmar modelo `Alert` no schema Prisma

### 4.10 Job de geração de alertas (BullMQ)

- Criar job agendado (cron diário, horário configurável, sugestão 06h00) usando BullMQ
- O job verifica, para cada tenant ativo:
  - Vacinações vencendo nos próximos 15 dias (via endpoint do Módulo 1) → cria `Alert` tipo `vaccine_due`
  - Ciclos de lavoura com `expected_harvest_at` nos próximos 7 dias → cria `Alert` tipo `harvest_near`
  - `FinancialEntry` com `due_date` nos próximos 3 dias e status `pending` → cria `Alert` tipo `bill_due`
  - Saldo do mês corrente negativo → cria `Alert` tipo `low_balance` (no máximo um por semana, para não repetir todo dia)
- Job não cria `Alert` duplicado para o mesmo evento (idempotência por `related_module + related_id + alert_type`)

### 4.11 Envio de alertas via WhatsApp

- Após criação dos `Alert` do dia, disparar envio via N8N para o `User` owner/admin do tenant
- Atualizar `status` do `Alert` para `sent` e preencher `sent_at`
- Formato da mensagem: direto, citando o item específico (ex: "🐄 Atenção: a vacina de aftosa do animal 1234 vence em 3 dias")

### 4.12 Interface do módulo Alertas

- Criar página `app/(dashboard)/alertas/page.tsx`
- Lista de alertas pendentes e enviados, com filtro por tipo e status
- Botão de "marcar como resolvido" (`status: dismissed`) para alertas que o usuário já tratou manualmente

---

## Contratos de API

### GET /api/v1/financial/dre
```json
Query: ?start=2026-06-01&end=2026-06-30

Response 200:
{
  "data": {
    "period": { "start": "2026-06-01", "end": "2026-06-30" },
    "by_module": [
      {
        "module": "rebanho | lavoura | servico | geral",
        "total_income": 0,
        "total_expense": 0,
        "result": 0
      }
    ],
    "total_result": 0
  }
}
```

### POST /api/v1/financial-entries
```json
Request:
{
  "entry_type": "income | expense",
  "category": "string",
  "amount": "number",
  "due_date": "ISO8601",
  "notes": "string | null"
}

Response 201:
{
  "data": {
    "id": "string",
    "entry_type": "income | expense",
    "amount": "number",
    "status": "pending",
    "created_at": "ISO8601"
  }
}
```

### GET /api/v1/financial/upcoming
```json
Response 200:
{
  "data": [
    {
      "id": "string",
      "entry_type": "income | expense",
      "category": "string",
      "amount": "number",
      "due_date": "ISO8601",
      "related_module": "string"
    }
  ]
}
```

---

## Critérios de aceitação

- Venda de animal registrada no Módulo 1 aparece automaticamente no fluxo de caixa sem lançamento manual
- DRE separa corretamente resultado por módulo (rebanho, lavoura, serviço, geral)
- Job de alertas roda diariamente e não duplica alerta para o mesmo evento em execuções consecutivas
- Vacina vencendo em 10 dias gera alerta; vacina vencendo em 20 dias não gera
- Alerta de saldo negativo não é reenviado mais de uma vez por semana
- Relatório PDF gerado pela interface web e pelo agente WhatsApp produz o mesmo conteúdo a partir da mesma função
- Link de download do PDF funciona e expira conforme política do Cloudflare R2 configurada
- Todos os endpoints respeitam o isolamento de tenant validado no Módulo 0
