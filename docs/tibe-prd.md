# PRD: Tibé
**Nome interno do projeto:** AgroGestão
**Versão:** 1.1
**Cliente:** Da Mata Sementes LTDA (Agromax Sementes de Capim e Sal Mineral)
**Responsável:** Pleno Digital
**Data:** Junho 2026

---

## 1. Visão geral do produto

Tibé é uma plataforma SaaS multi-tenant de gestão agropecuária. O produto centraliza controle de rebanho, lavoura, prestação de serviço e financeiro em uma única interface, com um agente de inteligência artificial integrado ao WhatsApp como canal primário de interação para o produtor rural.

Diferente do Pleno CRM (single-tenant, infraestrutura compartilhada com o cliente), o Tibé é construído do zero como produto SaaS para múltiplos clientes pagantes, com isolamento de dados por tenant desde a primeira linha de schema.

O MVP é desenvolvido sob contrato fechado com a Da Mata Sementes LTDA, primeira cliente e financiadora do desenvolvimento, mas a arquitetura deve suportar onboarding self-service de novos tenants a partir do lançamento.

---

## 2. Contexto técnico e infraestrutura

### 2.1 Infraestrutura provisionada

```
Banco:          Neon.tech (PostgreSQL 17, serverless, região AWS South America - São Paulo)
Deploy app:     Vercel (Next.js, free tier inicial)
Orquestração:   N8N self-hosted via Railway
Fila de jobs:   Redis Cloud (free tier, 30MB)
WhatsApp:       WhatsApp Business Cloud API (Meta), número virtual via Salvy
Storage:        Cloudflare R2
Cobrança:       Asaas (recorrência de assinantes)
```

Diferente do Pleno CRM, não há VPS própria nem Coolify nesta arquitetura. Cada peça de infraestrutura é um serviço gerenciado independente, sem rede Docker compartilhada.

### 2.2 Domínios (a definir)

```
app.tibe.com.br        → aplicação principal (painel web, escopado por tenant)
tibe.com.br             → página comercial
docs.tibe.com.br        → documentação técnica pública
dashboard.tibe.com.br   → painel interno da plataforma (acesso exclusivo Pleno Digital)
```

Domínio final pendente de registro. Repositório e deploy inicial usam o domínio gerado pela Vercel (`*.vercel.app`) até a confirmação.

O subdomínio `dashboard.*` roda na mesma aplicação Next.js (mesmo deploy, mesmo repositório), diferenciado por rota (`app/(platform)/`) e por middleware de autenticação próprio, não é um app ou deploy separado.

### 2.3 Banco de dados

```
Provedor:   Neon.tech
Projeto:    tibe-agrogestao
Banco:      neondb (único banco, multi-tenant via tenant_id)
Branching:  habilitado (preview automático por PR via integração Vercel)
```

Diferente do Pleno CRM, que usa um Postgres compartilhado com múltiplos bancos por aplicação, o Tibé usa um único banco lógico no Neon, com isolamento por linha (`tenant_id`), não por schema ou por database.

---

## 3. Stack tecnológica

### 3.1 Frontend

```
Framework:    Next.js 14 (App Router)
Linguagem:    TypeScript
Estilos:      Tailwind CSS
Componentes:  shadcn/ui
Gráficos:     Recharts
Monorepo:     não aplicável nesta fase (app único, sem mobile nativo planejado para o MVP)
```

### 3.2 Backend

```
API:          Next.js API Routes (Route Handlers) + Server Actions
Jobs:         BullMQ + Redis Cloud (alertas agendados, geração de relatório)
Orquestração: N8N (recepção e roteamento de mensagens WhatsApp)
```

### 3.3 Persistência

```
ORM:          Prisma
Banco:        PostgreSQL 17 (Neon)
Cache/Fila:   Redis Cloud (free tier)
```

### 3.4 Autenticação

```
Biblioteca:   NextAuth v5
Providers:    Credenciais próprias (email e senha)
```

Sem OAuth Google nesta fase. Diferente do Pleno CRM, não há necessidade de integração com Google Ads/GA4.

### 3.5 Deploy

```
CI/CD:        GitHub + Vercel (auto-deploy via push na branch main, preview por PR)
N8N:          Railway (deploy via template oficial)
```

---

## 4. Modelo de dados central

Tenant é a raiz de todo o isolamento. Toda tabela de negócio carrega `tenant_id`. Um tenant pode ativar simultaneamente o perfil de fazenda (rebanho e lavoura) e o perfil de prestador de serviço, não são exclusivos.

A única exceção ao isolamento por tenant é `PlatformUser`, que representa a equipe da Pleno Digital e não pertence a nenhum tenant. Esse modelo fica completamente fora do middleware de isolamento descrito na seção 10.4, ele enxerga todos os tenants por desenho, não por bypass.

```
Tenant
  id, name, document (CNPJ/CPF), phone, email, plan (campo|fazenda|grupo),
  status (trial|active|suspended|canceled), trial_ends_at,
  lead_source_utm_source, lead_source_utm_medium, lead_source_utm_campaign,
  created_at, updated_at

PlatformUser
  id, name, email, password_hash, role (master_admin|equipe), created_at, active
  // não carrega tenant_id, vive fora do isolamento multi-tenant

TenantProfile
  id, tenant_id, profile_type (fazenda|prestador), active, created_at
  // um tenant pode ter os dois profiles ativos simultaneamente

User
  id, tenant_id, name, email, password_hash, role (owner|admin|operador|visualizador),
  phone, created_at, active

Property
  id, tenant_id, name, address, area_hectares, created_at
  // "fazenda" ou "propriedade": um tenant pode ter múltiplas

// ── Módulo Rebanho ──
Animal
  id, tenant_id, property_id, ear_tag, breed, sex, birth_date,
  status (active|sold|deceased), current_weight, created_at, updated_at

AnimalWeightLog
  id, animal_id, weight, measured_at, created_at

Vaccine
  id, tenant_id, name, default_interval_days

AnimalVaccination
  id, animal_id, vaccine_id, applied_at, next_due_at, created_at

AnimalMovement
  id, animal_id, movement_type (purchase|sale|transfer|death),
  from_property_id, to_property_id, value, notes, occurred_at, created_at

// ── Módulo Lavoura ──
Plot
  id, tenant_id, property_id, name, area_hectares, current_crop, created_at

CropCycle
  id, plot_id, crop_name, planted_at, expected_harvest_at, harvested_at,
  yield_amount, yield_unit, status (planted|growing|harvested), created_at

PlotInput
  id, cycle_id, input_type (fertilizer|pesticide|seed), name, quantity,
  unit, cost, applied_at, created_at

// ── Módulo Prestador de Serviço ──
ServiceClient
  id, tenant_id, name, document, phone, email, notes, created_at

Service
  id, tenant_id, name, pricing_type (hour|day|fixed), unit_price, created_at

ServiceOrder
  id, tenant_id, service_client_id, service_id, description,
  quantity, total_value, performed_at, status (scheduled|completed|invoiced),
  created_at

// ── Módulo Financeiro (compartilhado entre perfis) ──
FinancialEntry
  id, tenant_id, entry_type (income|expense), category, amount,
  related_module (rebanho|lavoura|servico|geral), related_id,
  due_date, paid_at, status (pending|paid|overdue), notes, created_at

// ── Agente WhatsApp ──
WhatsAppContact
  id, tenant_id, phone, user_id, last_interaction_at, created_at

AgentConversationLog
  id, tenant_id, whatsapp_contact_id, direction (in|out), message_type,
  content, intent_detected, action_taken, created_at

// ── Alertas ──
Alert
  id, tenant_id, alert_type (vaccine_due|harvest_near|bill_due|low_balance),
  related_module, related_id, message, status (pending|sent|dismissed),
  scheduled_for, sent_at, created_at

// ── Cobrança (Asaas) ──
Subscription
  id, tenant_id, asaas_customer_id, asaas_subscription_id, plan,
  status (active|overdue|canceled), next_due_date, created_at
```

---

## 5. Sistema de roles e permissões

### 5.1 Definição das roles

**Owner**
Dono do tenant. Acesso total, incluindo gestão de assinatura, usuários e configurações. Único role que pode cancelar a conta.

**Admin**
Acesso total às operações do dia a dia (todos os módulos), sem acesso a billing/assinatura.

**Operador**
Acesso de leitura e escrita aos módulos operacionais (rebanho, lavoura, prestador, financeiro). Sem acesso a configurações de usuários.

**Visualizador**
Apenas leitura em todos os módulos. Sem capacidade de criar ou editar registros.

O agente WhatsApp herda a role do `User` vinculado ao `WhatsAppContact` que enviou a mensagem. Um número de telefone não cadastrado como `User` não consegue operar dados, apenas recebe resposta padrão de boas-vindas com instrução de cadastro.

### 5.2 Matriz de permissões por módulo

| Módulo | Owner | Admin | Operador | Visualizador |
|--------|-------|-------|----------|--------------|
| Rebanho | Total | Total | Total | Leitura |
| Lavoura | Total | Total | Total | Leitura |
| Prestador de Serviço | Total | Total | Total | Leitura |
| Financeiro | Total | Total | Total | Leitura |
| Alertas | Total | Total | Leitura | Leitura |
| Usuários | Total | Total | Sem acesso | Sem acesso |
| Assinatura / Billing | Total | Sem acesso | Sem acesso | Sem acesso |

### 5.3 Papéis da plataforma (PlatformUser)

`PlatformUser` representa a equipe da Pleno Digital, não pertence a tenant algum e **não** usa a matriz da seção 5.2. Possui dois papéis:

- **master_admin**: acesso total ao painel da plataforma (`(platform)/`): lista de tenants, KPIs e configurações internas.
- **equipe**: acesso restrito ao painel da plataforma; o recorte exato de permissões (leitura vs. ações administrativas) é definido na spec do Módulo 6.

Duas regras invariáveis governam essa separação:

1. Nenhum `User` de tenant: mesmo sendo Owner: acessa rota ou dado de plataforma.
2. Nenhum `PlatformUser`, em qualquer papel, opera dados de negócio de um tenant pelas rotas de tenant; seu acesso se dá exclusivamente pelas rotas próprias do painel da plataforma.

---

## 6. Integrações externas

### 6.1 WhatsApp via Business Cloud API (Meta)

Tipo de conexão: API Oficial desde o início, sem fase intermediária via QR Code.

Número: virtual, provisionado via Salvy, vinculado ao Meta Business Manager do tenant raiz (Da Mata Sementes) na Fase 2. Tenants futuros terão fluxo de provisionamento próprio (fora do escopo do MVP).

Webhook: Meta envia eventos para o N8N, que processa, identifica o tenant pelo número de telefone de origem, e encaminha para o endpoint do Tibé.

### 6.2 N8N como camada de orquestração

N8N não armazena dados de negócio. Função exclusiva: receber webhook da Meta, normalizar payload, identificar tenant e usuário, chamar a IA para interpretar intenção, e fazer a chamada HTTP para a API do Tibé com o resultado estruturado.

### 6.3 Asaas

Autenticação: API Key por ambiente (sandbox em desenvolvimento, produção no lançamento).

Fluxo: criação de cliente Asaas no momento do onboarding do tenant, criação de assinatura recorrente vinculada ao plano escolhido, recebimento de webhook de pagamento confirmado/falha/atraso.

### 6.4 Cloudflare R2

Uso: armazenamento de relatórios PDF gerados, fotos de animais (futuro), documentos anexados a registros financeiros.

---

## 7. Arquitetura de mensagens do agente

```
Produtor envia mensagem no WhatsApp
        ↓
Meta Business Cloud API → Webhook N8N
        ↓
N8N identifica tenant pelo número de telefone (WhatsAppContact)
        ↓
N8N chama LLM via API com contexto do tenant + histórico recente
        ↓
LLM retorna intenção estruturada (cadastrar | consultar | relatório | ambíguo)
        ↓
N8N chama endpoint correspondente da API Next.js do Tibé
        ↓
Tibé processa, persiste no banco, retorna resposta formatada
        ↓
N8N envia resposta via Meta Cloud API → WhatsApp do produtor
```

Toda interação é registrada em `AgentConversationLog` para auditoria e para servir de contexto de curto prazo nas mensagens seguintes da mesma conversa.

---

## 8. Módulos do produto

### Módulo 0: Setup e infraestrutura multi-tenant
**Spec:** `specs/module-00-setup.md`

### Módulo 1: Rebanho e Lavoura
**Spec:** `specs/module-01-rebanho-lavoura.md`

### Módulo 2: Prestador de Serviço
**Spec:** `specs/module-02-prestador.md`

### Módulo 3: Agente WhatsApp
**Spec:** `specs/module-03-agente-whatsapp.md`

### Módulo 4: Financeiro e Alertas
**Spec:** `specs/module-04-financeiro-alertas.md`

### Módulo 5: Painel Web, Cobrança e Site
**Spec:** `specs/module-05-painel-cobranca-site.md`

### Módulo 6: Painel da Plataforma (Admin Interno)
**Spec:** `specs/module-06-painel-plataforma.md`

---

## 9. Referência visual

Identidade: tons de verde ligados ao campo brasileiro (paleta já definida na proposta comercial: `#2E7D32` primário, `#1B5E20` escuro, `#E8F5E9` claro). Tipografia Inter para interface.

Prioridade: schema multi-tenant e fluxo do agente WhatsApp têm prioridade sobre refinamento visual do painel. O painel web é a interface secundária do produto; o WhatsApp é a primária.

---

## 10. Convenções de desenvolvimento

### 10.1 Estrutura de pastas

```
tibe-agrogestao/
  src/
    app/
      (auth)/                  → rotas de autenticação
      (dashboard)/              → rotas protegidas, escopadas por tenant
        rebanho/
        lavoura/
        prestador/
        financeiro/
        alertas/
        configuracoes/
          usuarios/
          assinatura/
      (public)/                 → site comercial, fora do dashboard
        page.tsx                → home
        planos/
        politicas/
      (platform)/                → painel interno da plataforma, subdomínio dashboard.*
        login/
        tenants/
        kpis/
        configuracoes/
    components/
      ui/                       → shadcn/ui
      rebanho/
      lavoura/
      prestador/
      financeiro/
    lib/
      prisma.ts                 → cliente Prisma singleton com middleware de tenant
      auth.ts
      tenant-context.ts         → resolução de tenant_id por sessão
      asaas.ts                  → cliente Asaas API
      meta-whatsapp.ts          → cliente Meta Cloud API
    prisma/
      schema.prisma
    api/
      webhooks/
        whatsapp/
        asaas/
      v1/
      internal/
```

### 10.2 Variáveis de ambiente obrigatórias

```env
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
REDIS_URL=
META_WHATSAPP_TOKEN=
META_WHATSAPP_PHONE_ID=
META_WHATSAPP_VERIFY_TOKEN=
N8N_WEBHOOK_SECRET=
ASAAS_API_KEY=
ASAAS_ENV=sandbox
CLOUDFLARE_R2_ACCESS_KEY=
CLOUDFLARE_R2_SECRET_KEY=
CLOUDFLARE_R2_BUCKET=
INTERNAL_API_SECRET=
```

### 10.3 Padrões de API

Todas as rotas de API seguem o padrão REST com prefixo `/api/v1/`.

Respostas de sucesso: `{ data: {}, meta: {} }`

Respostas de erro: `{ error: { code: string, message: string } }`

Toda rota protegida exige sessão NextAuth válida. O `tenant_id` nunca é recebido do client, é sempre resolvido a partir da sessão do usuário autenticado no servidor, evitando que um tenant manipule o ID para acessar dados de outro.

Rotas de webhook (`/api/webhooks/*`) autenticam via secret no header, não via sessão.

### 10.4 Isolamento multi-tenant no Prisma

Todo client Prisma usado em rotas autenticadas passa por um middleware central que injeta automaticamente `where: { tenant_id }` em toda query de leitura e escrita. Nenhuma query de negócio deve construir o filtro de tenant manualmente, o middleware é a única fonte de verdade para esse isolamento.

**Exceção única e intencional:** o modelo `PlatformUser` e as rotas do painel da plataforma (`app/(platform)/`) não passam por esse middleware. Eles operam com um client Prisma sem injeção de `tenant_id`, encapsulado em módulo próprio e acessível apenas a partir de uma sessão de `PlatformUser` autenticada. Não pode existir caminho de código que parta de uma sessão de tenant e alcance esse client: a exceção é unidirecional e vive inteiramente no lado da plataforma, conforme seção 4.

---

## 11. Critérios de aceitação por módulo

Cada módulo só é considerado concluído quando:
1. Todas as tasks da spec estão implementadas.
2. Os endpoints da API retornam os contratos definidos.
3. O isolamento de tenant foi validado (usuário do tenant A não acessa dados do tenant B em nenhum endpoint). Exceção única e intencional: o Módulo 6, onde `PlatformUser` enxerga todos os tenants por desenho.
4. O fluxo completo de ponta a ponta foi testado manualmente, incluindo via WhatsApp quando aplicável.
5. As permissões por role foram validadas.

---

## 12. O que não está no escopo desta versão

- Onboarding self-service completo de novos tenants (cadastro automático sem intervenção manual): o MVP cobre o tenant Da Mata Sementes provisionado manualmente; o fluxo de signup público é v1.1
- App mobile nativo (React Native): planejado para v1.1
- Modo offline do agente: planejado para v1.1
- Módulo de maquinário e manutenção preventiva: planejado para v1.2
- Emissão de nota fiscal rural: planejado para v1.3
- IA preditiva (recomendação de defensivos, previsão de safra): planejado para v2.0
- Provisionamento automático de número WhatsApp por tenant (fluxo Salvy + Meta é manual no MVP)

---

## 13. Histórico de versões

### v1.1: Junho 2026
- Adicionado o **Módulo 6: Painel da Plataforma (Admin Interno)**, desenvolvimento interno da Pleno Digital, sem fase contratual com a Agromax.
- Introduzido o modelo `PlatformUser` (papéis `master_admin|equipe`), fora do isolamento multi-tenant: única exceção intencional ao isolamento por `tenant_id`.
- Adicionado o subdomínio `dashboard.tibe.com.br` (mesmo deploy Next.js, rota `app/(platform)/`, middleware de auth próprio).
- Adicionada a pasta `app/(platform)/` à estrutura de pastas (seção 10.1).
- Adicionados campos de origem de lead ao `Tenant`: `lead_source_utm_source`, `lead_source_utm_medium`, `lead_source_utm_campaign`.
- Nova seção **5.3** (papéis da plataforma) e exceção documentada na seção **10.4**; critério de aceitação **11.3** atualizado com a exceção.

### v1.0: Junho 2026
- Versão inicial do PRD: produto, infraestrutura, stack, modelo de dados multi-tenant, roles, integrações e módulos 0–5.