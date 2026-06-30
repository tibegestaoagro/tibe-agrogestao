# Spec: Módulo 6, Painel da Plataforma (Admin Interno)

**Depende de:** Módulos 0 e 5 concluídos
**Acesso:** exclusivo `PlatformUser` (equipe Pleno Digital), nunca acessível por `User` de tenant
**Agente responsável:** agente de analytics e billing
**Fase do contrato:** fora das 4 fases contratadas com a Agromax — desenvolvimento interno da Pleno Digital, sem cobrança ao cliente

---

## Objetivo

Criar o painel interno onde a Pleno Digital acompanha a saúde do negócio Tibé como um todo: quantos tenants existem, quem pagou, quem está inadimplente, de onde vieram os clientes, e os KPIs centrais de um SaaS (MRR, churn, LTV, conversão trial→pago).

Este módulo é uma exceção arquitetural deliberada: é o único ponto do sistema onde dados de múltiplos tenants são lidos simultaneamente na mesma tela, por desenho.

---

## Contexto importante antes de começar

Este módulo não tem cobrança vinculada ao contrato da Agromax (vide Cláusula II do contrato, o objeto contratado é o produto Tibé para uso da Agromax, este painel é ferramenta interna da Pleno Digital). Não confundir com nenhuma tela visível para tenants.

Todos os dados consumidos aqui já existem nos modelos dos Módulos 0, 1, 2, 4 e 5. Este módulo não cria dado novo de negócio, cria a camada de leitura agregada e os cálculos de KPI sobre o que já existe.

---

## Tasks

### 6.1 Modelo de dados

- Criar modelo `PlatformUser` no schema Prisma, conforme PRD seção 4: id, name, email, password_hash, role (`master_admin | equipe`), created_at, active
- Adicionar campos `lead_source_utm_source`, `lead_source_utm_medium`, `lead_source_utm_campaign` ao modelo `Tenant` (já implementado no Módulo 5, task 5.11, confirmar que está presente)
- Criar seed inicial com o `PlatformUser` master_admin (Dilton)

### 6.2 Autenticação separada para a plataforma

- Configurar segunda estratégia de autenticação NextAuth (ou instância separada de provider) específica para `PlatformUser`, completamente desacoplada da sessão de `User` de tenant
- Sessão de `PlatformUser` nunca deve carregar `tenant_id`, e o middleware de isolamento do Módulo 0 nunca deve ser aplicado a queries feitas a partir de uma sessão `PlatformUser`
- Criar middleware de rota que protege todo o grupo `(platform)` exigindo sessão `PlatformUser` válida; sessão de tenant tentando acessar essa rota é redirecionada, não autorizada
- Criar página de login específica em `app/(platform)/login/page.tsx`

### 6.3 Listagem de tenants

- Criar endpoint `GET /api/platform/tenants` (fora do prefixo `/api/v1/`, este é namespace exclusivo de plataforma)
- Retorna todos os tenants com: nome, plano, status, data de cadastro, status da assinatura Asaas, próximo vencimento, perfis ativos (fazenda/prestador)
- Suportar filtros: status (`trial | active | overdue | canceled`), plano, período de cadastro
- Suportar busca por nome ou documento
- Criar endpoint `GET /api/platform/tenants/:id` com detalhe completo de um tenant: dados cadastrais, histórico de assinatura, resumo de uso (quantidade de animais, talhões, ordens de serviço, conforme perfis ativos)

### 6.4 Cálculo de MRR (Monthly Recurring Revenue)

- Criar função `lib/platform/kpis.ts` com `calculateMRR()`
- Soma o valor mensal de todos os tenants com `Subscription.status: active`, considerando o valor do plano vigente de cada um
- Criar endpoint `GET /api/platform/kpis/mrr` retornando MRR atual e breakdown por plano (quanto vem do plano campo, fazenda, grupo)

### 6.5 Cálculo de Churn

- Adicionar `calculateChurn(period)` em `lib/platform/kpis.ts`
- Churn de clientes: `(tenants cancelados no período) / (tenants ativos no início do período) * 100`
- Churn de receita (MRR churn): `(MRR perdido por cancelamento no período) / (MRR no início do período) * 100`
- Criar endpoint `GET /api/platform/kpis/churn?period=30d` (suportar `30d`, `90d`, `12m`)
- Calculado sob demanda a cada chamada, sem persistência de snapshot histórico nesta versão

### 6.6 Cálculo de LTV (Lifetime Value)

- Adicionar `calculateLTV()` em `lib/platform/kpis.ts`
- Fórmula simplificada para o MVP: `ticket médio mensal / taxa de churn mensal`
- Criar endpoint `GET /api/platform/kpis/ltv`

### 6.7 Funil de conversão

- Adicionar `calculateFunnel(period)` em `lib/platform/kpis.ts`
- Etapas do funil: visitante com UTM capturado (não rastreável sem ferramenta de analytics externa, este módulo cobre a partir do cadastro) → trial criado → trial convertido em assinatura ativa → assinatura cancelada
- Calcular taxa de conversão trial → pago: `(tenants que saíram de trial para active no período) / (total de trials criados no período) * 100`
- Calcular tempo médio de conversão: média de dias entre `Tenant.created_at` e a transição de `Subscription.status` para `active`
- Criar endpoint `GET /api/platform/kpis/funnel?period=30d`
- Breakdown do funil por `lead_source_utm_source`: quantos trials e quantas conversões vieram de cada origem (ex: instagram, google, indicação)

### 6.8 Dashboard principal da plataforma

- Criar página `app/(platform)/kpis/page.tsx` como home do painel
- Cards de topo: MRR atual, total de tenants ativos, total em trial, churn dos últimos 30 dias
- Gráfico de evolução de MRR (Recharts, linha), calculado a partir do histórico de `Subscription` (data de início de cada uma) cruzado com o status atual, sem depender de snapshot diário
- Gráfico de funil de conversão por origem (UTM)
- Seletor de período aplicável a todos os gráficos e cards: 30 dias, 90 dias, 12 meses

### 6.9 Tela de gestão de tenants

- Criar página `app/(platform)/tenants/page.tsx`
- Tabela com todos os tenants, filtros conforme task 6.3
- Badge visual de status: trial (azul), active (verde), overdue (amarelo), canceled (vermelho)
- Clique no tenant abre `app/(platform)/tenants/[id]/page.tsx` com detalhe completo
- Na tela de detalhe, ação manual disponível para `master_admin`: forçar mudança de status (ex: reativar manualmente um tenant suspenso por erro), com log de quem fez a alteração e quando

### 6.10 Gestão de equipe da plataforma

- Criar página `app/(platform)/configuracoes/equipe/page.tsx`, acessível apenas para `master_admin`
- CRUD de `PlatformUser`: convidar novo membro da equipe, definir role, desativar acesso

---

## Contratos de API

### GET /api/platform/tenants
```json
Query: ?status=active&plan=fazenda&page=1&limit=20

Response 200:
{
  "data": [
    {
      "id": "string",
      "name": "string",
      "plan": "campo | fazenda | grupo",
      "status": "trial | active | overdue | canceled",
      "active_profiles": ["fazenda", "prestador"],
      "created_at": "ISO8601",
      "subscription_status": "string",
      "next_due_date": "ISO8601 | null"
    }
  ],
  "meta": { "total": 0, "page": 1, "limit": 20 }
}
```

### GET /api/platform/kpis/mrr
```json
Response 200:
{
  "data": {
    "total_mrr": 0,
    "by_plan": {
      "campo": 0,
      "fazenda": 0,
      "grupo": 0
    },
    "active_subscriptions_count": 0
  }
}
```

### GET /api/platform/kpis/churn
```json
Query: ?period=30d

Response 200:
{
  "data": {
    "period": "30d",
    "customer_churn_pct": 0,
    "mrr_churn_pct": 0,
    "canceled_count": 0
  }
}
```

### GET /api/platform/kpis/funnel
```json
Query: ?period=30d

Response 200:
{
  "data": {
    "period": "30d",
    "trials_created": 0,
    "converted_to_paid": 0,
    "conversion_rate_pct": 0,
    "avg_days_to_convert": 0,
    "by_source": [
      {
        "utm_source": "string | null",
        "trials_created": 0,
        "converted": 0,
        "conversion_rate_pct": 0
      }
    ]
  }
}
```

---

## Critérios de aceitação

- `PlatformUser` consegue logar em `dashboard.tibe.com.br` (ou rota `(platform)` equivalente em dev) e visualizar tenants de múltiplos clientes simultaneamente na mesma tela
- `User` de tenant (mesmo role Owner) tentando acessar rota `(platform)` é bloqueado
- MRR calculado bate com a soma manual de `Subscription.status: active` multiplicado pelo valor do plano de cada uma, validado com pelo menos 3 tenants de teste em planos diferentes
- Churn de 30 dias calcula corretamente considerando apenas cancelamentos dentro da janela do período
- Funil por origem agrupa corretamente tenants sem UTM (acesso direto) em uma categoria própria, sem quebrar o cálculo
- Tempo médio de conversão calcula corretamente a diferença entre criação do trial e ativação da assinatura
- Ação de forçar mudança de status manual registra log de auditoria com `PlatformUser` responsável e timestamp
- Nenhum dado deste módulo é exposto em nenhuma rota ou resposta de API acessível por `User` de tenant
