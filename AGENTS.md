# Tibé (AgroGestão): guia para agentes de código

SaaS multi-tenant de gestão agropecuária (rebanho, lavoura, prestação de
serviço, financeiro) com um agente de IA no WhatsApp como canal primário de
interação do produtor rural. Cliente/financiador do MVP: Da Mata Sementes
LTDA. Desenvolvido pela Pleno Digital.

**Leia primeiro:** [docs/tibe-prd.md](docs/tibe-prd.md) (PRD completo, v1.1) e
a spec do módulo relevante em `docs/specs/module-XX-*.md`. Este arquivo é um
resumo operacional da arquitetura: o PRD é a fonte de verdade para modelo de
dados, contratos de API e regras de produto.

---

## Regras de trabalho deste projeto

1. O projeto é entregue **módulo por módulo** (specs em `docs/specs/`), na
   ordem das fases do contrato. Não pule módulos nem misture escopo de um
   módulo futuro no atual sem necessidade comprovada.
2. **Nunca assuma silenciosamente** uma decisão de produto ou arquitetura que
   a spec não resolve: pergunte antes de implementar. Extensões *aditivas* a
   um contrato de API (campos novos que não quebram nada existente) são
   aceitáveis se documentadas no código/commit; mudanças de comportamento ou
   de modelo de dados não são.
3. Todo modelo que carrega `tenant_id` **deve** passar pelo client Prisma
   escopado por tenant: nunca construa o filtro de tenant manualmente numa
   query de negócio (ver seção de isolamento).
4. Todo módulo que adiciona endpoints ganha um teste automatizado de
   isolamento multi-tenant antes de ser considerado concluído.
5. Não faça push/deploy sem confirmação explícita de quem está pedindo o
   trabalho.

## Status dos módulos

| # | Módulo | Status |
|---|--------|--------|
| 0 | Setup, schema multi-tenant, auth, isolamento | ✅ em produção |
| 1 | Rebanho e Lavoura | ✅ em produção |
| 2 | Prestador de Serviço | ✅ em produção |
| 3 | Agente WhatsApp | ✅ código do Tibé pronto: infra externa (N8N/Meta/Salvy) ainda não provisionada; guia em [docs/n8n-whatsapp-workflow.md](docs/n8n-whatsapp-workflow.md) |
| 4 | Financeiro e Alertas | ✅ completo: Redis/BullMQ real; PDF via link assinado (sem R2); envio WhatsApp aguarda N8N |
| 5 | Painel Web, Cobrança (Asaas) e Site | ✅ completo: Asaas real (código pronto, sem chave de sandbox testada); usuários, bloqueio por inadimplência, site público, documentação técnica em `/docs`, README/CONTRIBUTING |
| 6 | Painel da Plataforma (`PlatformUser`, uso interno) | ✅ completo: auth separada (`/plataforma`), MRR/churn/LTV/funil, gestão de tenants e equipe |

---

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma 7 (PostgreSQL 17,
Neon) · NextAuth v5 beta (**duas instâncias**: tenant e plataforma, M6) ·
Zod · Recharts. UI kit no estilo shadcn/ui, construído à mão (ver seção UI) ·
Redis Cloud + BullMQ (M4) · Asaas (M5, cobrança recorrente). N8N segue como
infra externa não provisionada (orquestra o agente WhatsApp, não roda dentro
do Tibé); Cloudflare R2 nunca foi necessário (PDFs são gerados sob demanda,
sem storage). Todos os 7 módulos do PRD (0-6) têm código completo agora.

## Infra e deploy

- **App em produção:** https://tibe-agrogestao.vercel.app (Vercel; deploy
  automático em push na branch `main`).
- **Repositório:** `https://github.com/tibegestaoagro/tibe-agrogestao.git`.
- **Banco de produção:** Neon.tech, projeto `tibe-agrogestao`, banco `neondb`.
- **Banco de desenvolvimento local:** Postgres 17 via Docker, container
  `tibe-pg`, porta `55432`:

  ```
  postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public
  ```

### O `.env` local aponta para o Neon de produção

Isso é intencional (permite rodar `next dev` contra dados reais), mas é uma
armadilha para automações: rodar migração/seed/teste sem cuidado pode afetar o
banco de produção. Para trabalho **local**, sobrescreva `DATABASE_URL` inline
no comando em vez de editar `.env`:

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m1
```

### Migrações (Prisma 7)

`prisma migrate dev` é interativo e falha em shells não-interativos assim que
precisa de uma confirmação. Fluxo usado neste projeto:

```powershell
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
# salvar o SQL gerado em prisma/migrations/<timestamp>_nome/migration.sql
npm run db:deploy   # prisma migrate deploy: não-interativo, idempotente
```

Aplique primeiro no banco local, rode os testes, só então replique no Neon
(use a connection string **Direct**, sem `-pooler`, para migrar: a **Pooled**
é a usada em runtime).

⚠️ O índice parcial `WhatsAppProviderConfig_one_active` (`WHERE "active"`,
M7) não é representável no `schema.prisma`: todo `migrate diff` futuro vai
sugerir um `DROP INDEX` dele como "drift". Não aplique esse drop; remova a
linha do SQL gerado antes de salvar a migração.

### Redis (BullMQ) já provisionado (Redis Cloud): sem instância local separada

O `.env` local aponta para a mesma instância Redis Cloud de produção (uso é só
fila/lock de job, dado efêmero, sem risco de negócio). BullMQ empacota sua
própria cópia de `ioredis`: não passe a instância de `getRedisConnection()`
(`src/lib/redis.ts`) direto para `new Queue()`/`new Worker()` (erro de tipo,
duas classes `Redis` nominalmente diferentes); use
`getRedisConnectionOptions()` para construtores do BullMQ.

### Sessão autenticada via `next start` local não é confiável para testar páginas

Páginas protegidas redirecionam para `/login` mesmo com cookie de sessão
válido quando testadas via `next start` + cookie jar externo: o Edge
Middleware não reconhece a sessão nesse setup específico (rotas `/api/v1/*`,
Node runtime, funcionam normalmente com a mesma sessão). Não é regressão de
nenhum módulo (páginas antigas têm o mesmo comportamento); produção nunca
apresentou o problema em uso real de navegador. Para validar página
autenticada, use `next dev` com navegador real ou a URL de produção.

---

## Isolamento multi-tenant

`tenant_id` nunca é recebido do client: é sempre resolvido no servidor a
partir da sessão autenticada. Toda query de negócio usa o client Prisma
**escopado por tenant**:

```ts
import { getTenantDb } from "@/lib/tenant-context";
import { scoped } from "@/lib/prisma";

const db = await getTenantDb();
await db.animal.findMany();                      // tenant_id injetado automaticamente
await db.animal.create({ data: scoped({ ear_tag: "001", property_id }) });
```

Implementação em `src/lib/prisma.ts`: uma Prisma Client Extension injeta
`tenant_id` em toda operação dos modelos listados em `TENANT_SCOPED_MODELS`.
`prismaForTenant(tenantId)` devolve o client escopado (cacheado por tenant).
`scoped(data)` só resolve o tipo TypeScript exigido pelo Prisma no `create`:
o valor real de `tenant_id` é sempre injetado pela extension em runtime; nunca
passe um `tenant_id` de verdade dentro de `scoped(...)`.

Todos os modelos de negócio têm `tenant_id`, inclusive os que no desenho
original seriam "filhos" sem essa coluna (`AnimalWeightLog`,
`AnimalVaccination`, `AnimalMovement`, `CropCycle`, `PlotInput`): decisão
deliberada de defense-in-depth.

O client Prisma **base** (sem escopo) só é apropriado em: autenticação (lookup
de email global), seed, scripts internos, o lookup cross-tenant de
`POST /api/internal/whatsapp/resolve-contact` (achar a qual tenant um
telefone pertence), o job diário de alertas (`generateAllAlerts`/
`deliverAllPendingAlerts` em `src/lib/actions/alerts.ts` e
`alert-delivery.ts`), que precisa listar todos os tenants ativos antes de
escopar por tenant, e `POST /api/webhooks/asaas` (M5), que localiza a
`Subscription` pelo `asaas_subscription_id` (o Asaas não manda sessão de
tenant), e `WhatsAppProviderConfig` (spec 2026-07-11): config GLOBAL de
plataforma (rotas master_admin + `sendWhatsAppMessage`), mesma categoria
estrutural de `PlatformUser`, fora de `TENANT_SCOPED_MODELS`. Qualquer outro
uso do client base é suspeito.

`PlatformUser` e `SubscriptionStatusLog` (M6) também ficam fora de
`TENANT_SCOPED_MODELS`: não fazem sentido escopados por tenant. A separação
entre sessão de tenant e sessão de `PlatformUser` não é uma checagem de role:
são duas instâncias NextAuth com cookies diferentes (ver seção "Painel da
Plataforma").

Testes de isolamento (rodar contra o banco local, `tsx`, chamando os route
handlers diretamente):

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"
npm run test:isolation   # base (Módulo 0)
npm run test:m1          # Rebanho/Lavoura
npm run test:m2          # Prestador
npm run test:m3          # Agente WhatsApp
npm run test:m4          # Financeiro e Alertas
npm run test:m5          # Billing, webhook Asaas, usuários, trial_ending
npm run test:m6          # MRR/churn/LTV/funil, isolamento PlatformUser, força de status
```

---

## Padrões de API

- Sucesso: `{ data, meta }`. Erro: `{ error: { code, message } }`
  (`src/lib/api.ts`).
- Rotas `/api/v1/*` autenticam por **sessão** via `guard()`
  (`src/lib/api-guard.ts`): checa sessão, permissão por role (matriz do PRD
  §5.2 em `src/lib/permissions.ts`) e perfil de tenant ativo, tudo de uma vez.
- Rotas `/api/internal/*` (chamadas por sistemas internos como o N8N)
  autenticam por secret no header `x-internal-secret`
  (`src/lib/internal-guard.ts`), não por sessão. A role do usuário dentro
  delas é sempre **relida do banco**, nunca aceita do caller.
- Rotas `/api/webhooks/*` seguem a mesma ideia (token no header, não sessão).
  Só existe `POST /api/webhooks/asaas` (M5): o webhook do WhatsApp é recebido
  pelo N8N, não pelo Tibé (ver arquitetura do agente abaixo), então
  `/api/webhooks/whatsapp` continua não existindo.

## Lógica de negócio: `src/lib/actions/*`

Toda regra de negócio vive em funções de "action" (`src/lib/actions/*.ts`),
não dentro dos route handlers. As rotas HTTP validam a entrada, chamam a
action, e serializam a resposta; o agente WhatsApp chama as mesmas actions
diretamente. Ao alterar uma regra de negócio, mude na action correspondente:
não duplique lógica na rota.

```ts
type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string; status: number };
```

Arquivos principais: `animals.ts`, `service-orders.ts`, `service-clients.ts`,
`properties.ts`, `financial-summary.ts`, `billing.ts` (M5, assinatura Asaas),
`users.ts` (M5, convite/role/ativação). Lançamentos financeiros automáticos
(venda de animal, insumo com custo, ordem de serviço faturada...) sempre
passam por `createLinkedEntry()` (`src/lib/financial.ts`).

## Serialização

Prisma devolve `Decimal` e `Date`; os contratos de API usam `number` e string
ISO8601. Use `decToNum()` / `isoOrNull()` (`src/lib/serialize.ts`) e os
serializers em `src/lib/serializers.ts`.

---

## Autenticação

NextAuth v5 (beta), Credentials + bcrypt, dividido em dois arquivos por causa
do Edge runtime do middleware: `src/lib/auth.config.ts` (edge-safe, usado pelo
`middleware.ts`) e `src/lib/auth.ts` (Node runtime, provider completo).
`User.email` é globalmente único (login recebe só email+senha, sem seletor de
tenant). `middleware.ts` deixa `/api/*` fora da checagem de sessão: cada
handler de API faz a própria autenticação e devolve `401` JSON quando
necessário, em vez de redirecionar.

## Roles e permissões

`UserRole`: `OWNER | ADMIN | OPERADOR | VISUALIZADOR`. Matriz de acesso por
módulo em `src/lib/permissions.ts` (espelha PRD §5.2). `canAccess`/`canWrite`
recebem a role diretamente, sem depender de sessão HTTP: usadas tanto nas
rotas web quanto no roteamento de intenções do agente WhatsApp.

## UI

Sem design system de terceiros instalado via CLI (o instalador do shadcn/ui é
interativo e não roda em ambientes não-interativos). Os componentes em
`src/components/ui/` foram escritos à mão no estilo shadcn (Radix UI +
`class-variance-authority` + `tailwind-merge`), com `components.json`
configurado. Gráficos: Recharts v3. Cores da marca em `tailwind.config.ts`.

---

## Signup público (`/planos` + `/criar-conta`): fora do escopo original do PRD

O PRD §12 marca onboarding self-service completo como fora do MVP (v1.1), mas
existe um fluxo de signup público real (não é mockup): `/planos` (preços
**reais**: `PLAN_PRICES` em `src/lib/asaas.ts`: campo R$97, fazenda R$197,
grupo R$397, mesma constante usada para criar a assinatura no Asaas) →
`/criar-conta` (formulário completo) → `POST /api/v1/signup` (única rota
`/api/v1` que roda sem sessão) cria `Tenant` (status trial, plan = card
escolhido, `trial_ends_at` = agora + `TRIAL_DAYS`: `src/lib/billing-access.ts`,
14 dias) + `User` (OWNER) de verdade, com login automático em seguida. Sem
rate limiting (sem fila/Redis conectados a esta rota): aceitável para testes
controlados, revisar antes de expor publicamente. O Módulo 5 manteve este
fluxo como está (decisão do usuário) em vez de trocar pelo trial passwordless
via WhatsApp que a spec 5.11 previa: exigiria N8N em produção.

Há também uma segunda forma de criar `Tenant`, exclusiva de `master_admin` (spec
2026-07-24): o painel da plataforma (`POST /api/platform/tenants`, botão "Criar
tenant" em `/plataforma/tenants`) para dar acesso de teste sem o fluxo público.
Reusa a lógica de `/api/v1/signup` (trial, checagem de duplicidade), mas gera
senha temporária e marca `User.must_change_password: true`: o usuário é
forçado a trocar a senha em `/trocar-senha` (gates em `(dashboard)/layout.tsx`
e `onboarding/page.tsx`, usando `getTenantDb()` client escopado) antes de
acessar o sistema. O convite de usuário do Módulo 5 não tem esse gate.

## O agente WhatsApp (Módulo 3)

Arquitetura: **Meta → N8N → Tibé → N8N → Meta**. O Tibé nunca fala direto com
a Meta Cloud API: o N8N é o único intermediário, e a classificação de
intenção por LLM acontece dentro do N8N (a chave do provedor de LLM fica nas
credenciais do N8N, não no ambiente do Tibé).

- `POST /api/internal/whatsapp/resolve-contact`: identifica tenant/usuário
  pelo telefone.
- `POST /api/internal/whatsapp/execute-action`: roteia as intenções
  (`src/lib/whatsapp-intents.ts`) para as actions de negócio, com checagem de
  permissão por role/perfil e confirmação obrigatória acima de R$ 5.000 para
  ações financeiras relevantes (`src/lib/actions/whatsapp-router.ts`).
- `gerar_relatorio` (tipo `financeiro`) devolve um `report_url` de verdade
  (ver Módulo 4); outros tipos ainda respondem "não disponível".
- **Áudio e recibo por foto/PDF** (spec 2026-07-28): transcrição (Whisper) e
  extração por visão acontecem dentro do N8N, nunca no Tibé. Áudio vira texto
  normal antes de chegar no Tibé. Recibo vira a intenção
  `registrar_lancamento_financeiro` (sempre pede confirmação, categoria fora
  da lista fixa de `category-suggestions.ts` cai em "Outros"), que chama
  `createManualEntryAction` (mesma action do lançamento manual da web).
  `webhookBase64: true` da Evolution não é confiável pra áudio/imagem em
  produção (campo às vezes não vem no webhook) — `POST
  /api/internal/whatsapp/fetch-media` (`src/lib/whatsapp-media.ts`) busca a
  mídia sob demanda pelo `message_id` via `/chat/getBase64FromMediaMessage`.
- Guia de integração completo (nó a nó do workflow N8N, incluindo envio de
  alertas do Módulo 4): [docs/n8n-whatsapp-workflow.md](docs/n8n-whatsapp-workflow.md).
- **Envio de mensagem agora é do Tibé** (spec 2026-07-11, desvio deliberado da
  regra "N8N é o único intermediário", aprovado pelo usuário): o N8N chama
  `POST /api/internal/whatsapp/send-message` e o Tibé entrega pelo provider
  ATIVO em `WhatsAppProviderConfig` (Evolution API não-oficial OU Meta Cloud
  API: configurável em `/plataforma/configuracoes/whatsapp`, só master_admin,
  credenciais AES-256-GCM com `CONFIG_ENCRYPTION_KEY`). O RECEBIMENTO continua
  no N8N (payloads de entrada diferem por provider; segue não existindo
  `/api/webhooks/whatsapp`). Despacho em `src/lib/whatsapp-send.ts`.

## Financeiro e Alertas (Módulo 4)

- Lançamentos manuais (`src/lib/actions/financial-entries.ts`) sempre nascem
  `related_module: geral`; só esses podem ser editados via `PATCH` (editar um
  lançamento de outro módulo é bloqueado: descolaria do dado de origem).
  "Marcar como pago" funciona em qualquer lançamento.
- Regime contábil: DRE = **competência** (todos os lançamentos do período por
  `due_date`); fluxo de caixa = **caixa** (só `status: paid`, por `paid_at`).
  `src/lib/actions/financial-reports.ts`.
- PDF (`src/lib/reports/generate-financial-pdf.ts`, pdf-lib) gerado sob
  demanda atrás de um link assinado por HMAC com expiração
  (`src/lib/reports/report-token.ts`): sem Cloudflare R2 (não provisionado);
  funciona sem sessão (necessário para link vindo do WhatsApp).
- Alertas (`src/lib/actions/alerts.ts`): idempotência por
  `(alert_type, related_module, related_id)`; `low_balance` usa a semana ISO
  como `related_id` sintético para o limite de 1/semana.
- BullMQ real (Redis Cloud provisionado), **sem worker persistente** (sem
  onde hospedar um processo 24/7). `GET /api/internal/jobs/generate-alerts`
  (Vercel Cron, `vercel.json`, autenticado por `CRON_SECRET`) roda a geração
  síncrona na própria requisição; idempotência diária via lock simples no
  Redis (`SET NX`), não pelo estado do job do BullMQ.
- Envio por WhatsApp (`src/lib/actions/alert-delivery.ts`): mesmo padrão do
  Módulo 3: outbound para `N8N_ALERT_WEBHOOK_URL`; sem configurar, fica
  `pending` sem quebrar.

## Cobrança e billing (Módulo 5)

- `src/lib/asaas.ts`: header `access_token` (sem "Bearer"), sandbox/produção
  por `ASAAS_ENV`. `AsaasNotConfiguredError` se `ASAAS_API_KEY` não existir:
  nunca testado contra o Asaas real neste ambiente (sem chave de sandbox).
- **PIX/boleto ficam no painel; cartão redireciona ao checkout do Asaas**:
  decisão deliberada para evitar exigir certificação PCI-DSS SAQ-D (dado de
  cartão nunca toca o servidor do Tibé; redirecionar mantém SAQ-A).
  `subscribeAction` (`src/lib/actions/billing.ts`) devolve `pix`, `boleto` ou
  `redirect` conforme a forma de pagamento escolhida.
- `Subscription.status` nasce `"overdue"` mesmo numa assinatura nova, de
  propósito: `next_due_date` fica no futuro e `billing-access.ts` dá carência
  automática até o primeiro webhook confirmar o pagamento.
- `POST /api/webhooks/asaas` (token no header `asaas-access-token` contra
  `ASAAS_WEBHOOK_TOKEN`): `PAYMENT_CONFIRMED` → `Subscription`+`Tenant` ativos;
  `PAYMENT_OVERDUE` → `overdue`; `PAYMENT_DELETED` → `canceled`; outros
  eventos/assinaturas não rastreadas respondem `200 { processed: false }`.
- `getBillingAccess(tenantId)` (`src/lib/billing-access.ts`): `full` /
  `read_only` / `blocked`, mesma régua de dias para assinatura em atraso e
  para trial vencido sem assinatura (`TRIAL_DAYS = 14`): < 5 dias full, 5–15
  read_only, ≥ 15 blocked. `guard()` aplica em toda rota
  (`opts.skipBillingCheck: true` só nas próprias rotas `/api/v1/billing/*`).
- `AlertType.trial_ending` (extensão aditiva): dispara quando `trial_ends_at`
  está a ≤ 2 dias e o tenant não tem `Subscription`; `related_id` é o próprio
  `tenant_id` (o trial só vence uma vez).

## Site público, documentação e usuários (Módulo 5)

- `app/(public)/`: `/`, `/planos`, `/faq`, `/politicas/privacidade`,
  `/politicas/termos` (`/politicas` sozinho é redirect). Nav/footer
  compartilhados em `src/components/public/` (`PublicNav`, `PublicFooter`).
- SEO: `metadataBase` + title template no `RootLayout`; `app/sitemap.ts` e
  `app/robots.ts` geram as rotas automaticamente: **precisam** estar em
  `PUBLIC_PATHS`/`PUBLIC_PREFIXES` (`auth.config.ts`), senão o middleware
  redireciona o crawler para `/login`. `/docs` também precisa estar lá.
- Documentação técnica em `/docs` (dentro do Tibé, sem Mintlify/Notion):
  `src/app/(public)/docs/`, uma página por seção. `/docs/api` é gerada a
  partir de um array de dados (`Endpoint[]`, `EndpointCard` em
  `src/components/public/`): ao mudar um endpoint, atualize essa lista.
- Usuários (`src/lib/actions/users.ts`): convite gera senha temporária
  mostrada uma única vez (sem infra de email no projeto). Regras de "não edita
  a si mesmo" e "só Owner promove a Owner" ficam nas rotas
  (`api/v1/users/[id]/role`, `.../active`), não nas actions.
- `README.md`/`CONTRIBUTING.md` na raiz refletem o estado real do projeto
  agora: o `README.md` antigo (Módulo 0) tinha uma afirmação errada sobre
  isolamento (dizia que os modelos-filho não tinham `tenant_id`, revertido
  ainda no Módulo 1). Mantenha os dois em sincronia com mudanças de
  arquitetura, junto com este arquivo.

## Painel da Plataforma (Módulo 6)

Ferramenta interna da Pleno Digital, sem fase contratual com a Agromax:
todos os tenants numa visão agregada, por desenho. `PlatformUser`
(`MASTER_ADMIN`/`EQUIPE`) já existia no schema desde o M0; este módulo
construiu o painel em volta dele.

- `/plataforma` é uma **pasta real** (não um route group `(platform)` como a
  spec descreve): route groups não geram segmento de URL, e `/login` já é
  usado pelo tenant. `app/plataforma/(painel)/` é um sub-route-group interno
  só para separar o layout do login (sem nav) do layout autenticado (com
  sidebar), sem afetar a URL.
- **Duas instâncias NextAuth de verdade**, não uma sessão com campo de tipo:
  `src/lib/platform-auth.config.ts`/`platform-auth.ts` espelham
  `auth.config.ts`/`auth.ts`, com cookie próprio (`tibe-platform-session`) e
  secret próprio (`PLATFORM_AUTH_SECRET`, nunca reusar `NEXTAUTH_SECRET`),
  montados em `/api/platform-auth/[...nextauth]`.
- ⚠️ `next-auth` assume `basePath: "/api/auth"` por padrão: uma instância
  secundária **precisa** declarar `basePath` explícito na config, senão todo
  request quebra com `UnknownAction`. Custou uma depuração real neste módulo.
- Middleware: `/plataforma` está isento da checagem de sessão de tenant
  (`PUBLIC_PREFIXES` em `auth.config.ts`); a proteção real é manual dentro do
  próprio `middleware.ts`, via `getToken({ req, secret: PLATFORM_AUTH_SECRET,
  cookieName: "tibe-platform-session" })` (de `next-auth/jwt`: primitiva de
  baixo nível, não a instância `auth()` da plataforma chamada "crua" dentro
  do middleware da outra instância).
- `guardPlatform({ requireMasterAdmin? })` (`src/lib/platform-guard.ts`)
  espelha `guard()`. `equipe` lê tenants; só `master_admin` vê KPIs
  financeiros e executa ações administrativas (forçar status, gerenciar
  equipe): recorte decidido com o usuário (PRD delegava a decisão a este
  módulo).
- `SubscriptionStatusLog` (novo modelo): toda transição de
  `Subscription.status` grava uma linha (`logSubscriptionStatusChange()` em
  `src/lib/platform/subscription-log.ts`): chamada pelo webhook do Asaas e
  por `subscribeAction`/`cancelSubscriptionAction` (M5, automático) e por
  `forceSubscriptionStatusAction` (M6, manual, com o `PlatformUser`
  responsável). Existe porque `Subscription` não guardava nenhum timestamp de
  transição: sem isso, churn e tempo médio de conversão eram impossíveis de
  calcular. Um mecanismo só resolve isso E serve de log de auditoria da 6.9.
- `lib/platform/kpis.ts`: MRR sempre usa `PLAN_PRICES` (preço atual, sem
  histórico de preço por assinatura). `getStatusAsOf(date)` reconstrói o
  status de cada assinatura numa data a partir do log: sustenta churn (ativos
  no início do período), evolução real de MRR mês a mês, e tempo até a
  primeira ativação no funil. LTV devolve `null` (não `Infinity`) sem churn
  observado.
- Captura de UTM (`src/lib/utm.ts`, `UtmCapture` dentro de `PublicNav`):
  first-touch via cookie (`tibe_utm`, 30 dias): só grava se ainda não
  existir, porque a origem se perderia entre `/` → `/planos` → `/criar-conta`
  sem isso. `POST /api/v1/signup` persiste em `Tenant.lead_source_utm_*`
  (campos existiam desde o M0, nunca preenchidos antes deste módulo).
- Testes (`npm run test:m6`) rodam contra `lib/platform/kpis.ts` e as actions
  direto (mesmo motivo do M1/M2/M5: rotas atrás de `guardPlatform()` não dá
  para invocar sem sessão de verdade). Como as funções de KPI escaneiam
  **todos** os tenants por desenho, os testes comparam baseline antes/depois,
  não contagem absoluta, para não quebrar com dados de seed/outros testes.
- Seed do `master_admin` ainda não existe em `prisma/seed.ts`: precisa de
  nome/email/senha reais do responsável, não inventados.
- Mensagem de boas-vindas por WhatsApp (`src/lib/whatsapp-welcome.ts`):
  `createTenantManuallyAction` dispara, melhor esforço, uma mensagem com link
  de login (`NEXTAUTH_URL`), email e senha temporária. Botão "Reenviar
  boas-vindas" no detalhe do tenant gera uma NOVA senha temporária a cada uso
  (a original em claro não é recuperável, só o hash) e marca
  `must_change_password` de novo.
- Painel do tenant é mobile-first (fluxo nasce no WhatsApp): sidebar vira
  drawer off-canvas abaixo do breakpoint `md`
  (`src/components/layout/dashboard-shell.tsx` + `sidebar.tsx`, ambos client).
  `(dashboard)/layout.tsx` calcula os links de navegação já filtrados por
  permissão no server e passa prontos: nunca importe `@/lib/permissions`
  dentro de um client component do dashboard, isso arrasta
  `ioredis`/`dns` (Node-only) pro bundle do browser e quebra o build.

---

## Comandos

```bash
npm run dev              # servidor de desenvolvimento
npm run build             # build de produção
npm run db:deploy         # aplica migrações pendentes (não-interativo)
npm run db:seed           # seed (tenant Da Mata + owner + vacinas padrão)
npm run db:check          # valida conexão com o banco
npm run auth:check        # valida credencial do seed
npm run test:isolation    # Módulo 0
npm run test:m1           # Módulo 1
npm run test:m2           # Módulo 2
npm run test:m3           # Módulo 3
npm run test:m4           # Módulo 4
npm run test:m5           # Módulo 5
npm run test:m6           # Módulo 6
```

Credenciais do seed (dev): `owner@damata.com.br` / `tibe123`.
