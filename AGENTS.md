# Tibé (AgroGestão): guia para agentes de código

SaaS multi-tenant de gestão agropecuária (rebanho, lavoura, prestação de
serviço, financeiro) com um agente de IA no WhatsApp como canal primário de
interação do produtor rural. Cliente/financiador do MVP: Da Mata Sementes
LTDA. Desenvolvido pela Pleno Digital.

**Leia primeiro:** [docs/tibe-prd.md](docs/tibe-prd.md) (PRD completo, v1.1) e
a spec do módulo relevante em `docs/specs/module-XX-*.md`. Este arquivo é um
resumo operacional da arquitetura: o PRD é a fonte de verdade para modelo de
dados, contratos de API e regras de produto.

Veja também [CLAUDE.md](CLAUDE.md) (mesma base técnica; inclui alguns detalhes
específicos de como o Claude Code opera neste projeto, como o sistema de
memória local à ferramenta).

---

## Regras de trabalho deste projeto

1. O projeto é entregue **módulo por módulo** (specs em `docs/specs/`), na
   ordem das fases do contrato. Não pule módulos nem misture escopo de um
   módulo futuro no atual sem necessidade comprovada.
2. **Antes de codificar um módulo**, leia a spec inteira e devolva um resumo
   curto confirmando o objetivo + toda ambiguidade ou inconsistência
   encontrada. **Nunca assuma silenciosamente** uma decisão de produto ou
   arquitetura que a spec não resolve: pergunte antes de implementar.
   Extensões *aditivas* a um contrato de API (campos novos que não quebram
   nada existente) são aceitáveis se documentadas no código/commit; mudanças
   de comportamento ou de modelo de dados não são.
3. Todo modelo que carrega `tenant_id` **deve** passar pelo client Prisma
   escopado por tenant: nunca construa o filtro de tenant manualmente numa
   query de negócio (ver seção de isolamento).
4. Todo módulo que adiciona endpoints ganha um teste automatizado de
   isolamento multi-tenant antes de ser considerado concluído.
5. Ao final de cada módulo (ou rodada de trabalho significativa), rode os
   critérios de aceitação com testes automatizados sempre que possível, e
   reporte o que passou/faltou antes de quem pediu o trabalho validar
   manualmente.
6. Não avance para o próximo módulo/rodada sem aprovação explícita de quem
   está conduzindo o trabalho.
7. Não faça push/deploy sem confirmação explícita de quem está pedindo o
   trabalho. Commits normalmente são pedidos explicitamente também.

## Status dos módulos

| # | Módulo | Status |
|---|--------|--------|
| 0 | Setup, schema multi-tenant, auth, isolamento | ✅ em produção |
| 1 | Rebanho e Lavoura | ✅ em produção |
| 2 | Prestador de Serviço | ✅ em produção |
| 3 | Agente WhatsApp | ✅ código do Tibé pronto: **N8N/Meta/Salvy ainda não provisionados** (guia: [docs/n8n-whatsapp-workflow.md](docs/n8n-whatsapp-workflow.md)) |
| 4 | Financeiro e Alertas | ✅ completo: Redis/BullMQ real; PDF via link assinado (sem R2); envio por WhatsApp+email (email sempre tentado, WhatsApp aguarda N8N) |
| 5 | Painel Web, Cobrança (Asaas) e Site | ✅ completo: Asaas real (código pronto, sem chave de sandbox testada ainda); dashboard consolidado, usuários, cobrança/bloqueio por inadimplência, site público (`/`, `/planos`, `/faq`, `/politicas/*`), documentação técnica em `/docs`, README/CONTRIBUTING |
| 6 | Painel da Plataforma (`PlatformUser`, interno Pleno) | ✅ completo: auth separada (`/plataforma`), MRR/churn/LTV/funil, gestão de tenants e equipe |
| 7 | Provider WhatsApp configurável (fora do PRD original) | ✅ completo: Evolution API/Meta Cloud API configurável pelo painel, credenciais criptografadas |

Specs: `docs/specs/module-00-setup.md` … `module-06-painel-plataforma.md`. M7
em diante não tem spec formal (trabalho pós-PRD, decidido diretamente com
quem conduz o projeto).

---

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma 7 (PostgreSQL 17,
Neon) · NextAuth v5 beta (**duas instâncias**: tenant e plataforma, M6) ·
Zod · Recharts. UI kit no estilo shadcn/ui, construído à mão (ver seção UI) ·
Redis Cloud + BullMQ (M4) · Asaas (M5, cobrança recorrente) · nodemailer
(Gmail SMTP) + Resend (canal de email, ver seção Email). N8N segue como
infra externa não provisionada (orquestra o agente WhatsApp, não roda dentro
do Tibé); Cloudflare R2 nunca foi necessário (PDFs são gerados sob demanda,
sem storage). Todos os 7 módulos do PRD (0-6) têm código completo, mais
trabalho pós-PRD (M7+: provider WhatsApp configurável, email, recuperação de
senha).

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

Use o `.env` (Neon) só quando a intenção for **de fato** migrar/seedar
produção — e confirme antes com quem está conduzindo o projeto, é uma ação
de alto impacto.

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

⚠️ O índice parcial `WhatsAppProviderConfig_one_active` (`WHERE "active"`, M7)
não é representável no `schema.prisma`: todo `migrate diff` futuro vai
sugerir um `DROP INDEX` dele como "drift". Não aplique esse drop; remova a
linha do SQL gerado antes de salvar a migração.

### Redis (BullMQ) já provisionado (Redis Cloud): sem instância local separada

O `.env` local aponta para a mesma instância Redis Cloud de produção (uso é só
fila/lock de job e rate limit de login, dado efêmero, sem risco de negócio).
BullMQ empacota sua própria cópia de `ioredis`: não passe a instância de
`getRedisConnection()` (`src/lib/redis.ts`) direto para `new Queue()`/
`new Worker()` (erro de tipo, duas classes `Redis` nominalmente diferentes);
use `getRedisConnectionOptions()` para construtores do BullMQ.

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
telefone pertence, antes de saber o tenant), o job diário de alertas
(`generateAllAlerts`/`deliverAllPendingAlerts` em `src/lib/actions/alerts.ts`
e `alert-delivery.ts`), que precisa listar todos os tenants ativos antes de
escopar por tenant, `POST /api/webhooks/asaas` (M5), que localiza a
`Subscription` pelo `asaas_subscription_id` (o Asaas não manda sessão de
tenant), `getBillingAccess()` (sempre chamada com um `tenantId` já resolvido
da sessão pelo caller), `inviteUserAction` (checagem de duplicidade de
`User.email`, globalmente único), `WhatsAppProviderConfig` (M7: config
GLOBAL de plataforma, mesma categoria estrutural de `PlatformUser`, fora de
`TENANT_SCOPED_MODELS`), `createTenantManuallyAction`
(`src/lib/actions/platform-tenants.ts`, checa duplicidade de documento/email
antes do tenant existir, mesma necessidade estrutural do `/api/v1/signup`), e
`requestPasswordResetAction`/`verifyPasswordResetCodeAction`
(`src/lib/actions/password-reset.ts`) que resolvem o `User` pelo email antes
de saber o tenant (fluxo sem sessão, por natureza), e
`confirmPasswordResetAction` que resolve o `PasswordResetCode` pelo próprio
`id` antes de saber o tenant, pelo mesmo motivo. Qualquer outro uso do client
base é suspeito.

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
npm run test:m7          # Provider WhatsApp configurável (crypto, config, envio)
npm run test:m9          # Evolution client (QR)
npm run test:m10         # Criação manual de tenant + troca de senha
npm run test:m11         # registrar_lancamento_financeiro (recibo por mídia)
npm run test:m12         # Ajuda e resumo (agente WhatsApp)
npm run test:m13         # Seam de gate de sessão (session-gate.ts)
npm run test:m14         # platform-tenants.ts (update/archive/reenvio de boas-vindas)
npm run test:m15         # Canal de email (falha graciosa, EmailLog, quem recebe)
npm run test:m16         # Recuperação de senha (código, rate limit, senha forte)
```

---

## Padrões de API

- Sucesso: `{ data, meta }`. Erro: `{ error: { code, message } }`
  (`src/lib/api.ts`).
- Rotas `/api/v1/*` autenticam por **sessão** via `guard()`
  (`src/lib/api-guard.ts`): checa sessão, `must_change_password`/
  `plan_confirmed` (via `requireSessionGateApi()`, `src/lib/session-gate.ts`),
  permissão por role (matriz do PRD §5.2 em `src/lib/permissions.ts`), perfil
  de tenant ativo e nível de cobrança, tudo de uma vez.
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
`users.ts` (M5, convite/role/ativação), `tenants.ts` (seam compartilhado de
criação de tenant+dono, usado por `/api/v1/signup` e
`createTenantManuallyAction`), `password-reset.ts`. Lançamentos financeiros
automáticos (venda de animal, insumo com custo, ordem de serviço faturada...)
sempre passam por `createLinkedEntry()` (`src/lib/financial.ts`).

O agente WhatsApp roteia intenções por um `Record<Intent, Handler>`
exaustivo (`src/lib/actions/whatsapp-router.ts`), com um handler por
intenção agrupado por domínio em `src/lib/actions/whatsapp-handlers/*`
(`rebanho.ts`, `prestador.ts`, `financeiro.ts`, `ajuda.ts`, `resumo.ts`,
`shared.ts` com os helpers comuns e o `confirmFlow()` compartilhado pelas 3
intenções que pedem confirmação sim/não).

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

**Gate de sessão** (`must_change_password` → `plan_confirmed` → perfil ativo)
centralizado em `src/lib/session-gate.ts`: `requireSessionGateApi()` (usado
por `guard()`), `requireSessionGateForPage()` (usado pelo layout do
dashboard), `redirectIfGatePassed()` (usado pelas páginas standalone
`/trocar-senha`, `/escolher-plano`, `/onboarding`, cada uma no próprio
estágio da cadeia — inclusive a lógica inversa "se já passou, manda pro
dashboard"). Nível de cobrança (`billing-access.ts`) fica fora desse seam de
propósito: políticas diferentes o suficiente entre API e página pra não
valer a pena unificar.

## Roles e permissões

Enum `UserRole`: `OWNER | ADMIN | OPERADOR | VISUALIZADOR` (maiúsculas,
conforme contrato de login). Hierarquia e matriz de acesso por módulo em
`src/lib/permissions.ts` (espelha PRD §5.2). `canAccess`/`canWrite` recebem a
role diretamente, sem depender de sessão HTTP: usadas tanto nas rotas web
quanto no roteamento de intenções do agente WhatsApp.

## UI

Sem design system de terceiros instalado via CLI (o instalador do shadcn/ui é
interativo e não roda em ambientes não-interativos). Os componentes em
`src/components/ui/` foram escritos à mão no estilo shadcn (Radix UI +
`class-variance-authority` + `tailwind-merge`), com `components.json`
configurado. Gráficos: Recharts v3. Cores da marca em `tailwind.config.ts`.

Painel do tenant é **responsivo, mobile-first, deliberado** (o fluxo nasce no
WhatsApp, o cliente acessa majoritariamente pelo celular): `(dashboard)/
layout.tsx` (server) calcula os links de navegação já filtrados por perfil
ativo + permissão e passa pra `DashboardShell` (client). Nunca importe
`@/lib/permissions` dentro de um client component do dashboard: esse módulo
arrasta `auth.ts` → `rate-limit.ts` → `ioredis` (módulos Node inexistentes no
browser) e quebra o build.

---

## Signup público (`/planos` + `/criar-conta`): fora do escopo original do PRD

O PRD §12 marca onboarding self-service completo como fora do MVP (v1.1), mas
existe um fluxo de signup público real (não é mockup): `/planos` (preços
**reais**: `PLAN_PRICES` em `src/lib/asaas.ts`: campo R$97, fazenda R$197,
grupo R$397, mesma constante usada para criar a assinatura no Asaas) →
`/criar-conta` (formulário completo) → `POST /api/v1/signup` (única rota
`/api/v1` que roda sem sessão) cria `Tenant` (status trial, plan = card
escolhido, `trial_ends_at` = agora + `TRIAL_DAYS`: `src/lib/billing-access.ts`,
14 dias) + `User` (OWNER) de verdade, via `createTenantWithOwner()`
(`src/lib/actions/tenants.ts`, seam compartilhado com a criação manual), com
checagem de documento/email duplicado. Login automático em seguida, e um
email de boas-vindas (ver seção Email). Sem rate limiting no formulário em
si (não há fila/Redis conectados a esta rota especificamente): gap
conhecido, aceitável para uso controlado de testes.

Existe uma segunda forma de criar `Tenant`, exclusiva de `master_admin`: o
painel da plataforma (`POST /api/platform/tenants`, botão "Criar tenant" em
`/plataforma/tenants`), para dar acesso de teste sem o fluxo público. Chama o
mesmo `createTenantWithOwner()`, mas gera senha temporária em vez de receber
uma, e marca `User.must_change_password: true`: o usuário é obrigado a
trocar a senha em `/trocar-senha` antes de acessar qualquer outra coisa
(gate centralizado em `session-gate.ts`, ver seção Autenticação). O convite
de usuário (`inviteUserAction`) não tem esse gate: continua como estava.

## O agente WhatsApp (Módulo 3)

Arquitetura (PRD §7): **Meta → N8N → Tibé → N8N → Meta**. O Tibé nunca fala
direto com a Meta Cloud API; o N8N é o único intermediário. Por isso:

- **Não existe** `/api/webhooks/whatsapp` no Tibé: seria código morto.
- A classificação de intenção por LLM acontece **dentro do N8N** (a chave de
  API do provedor de LLM fica nas credenciais do N8N, não no ambiente do
  Tibé).
- `POST /api/internal/whatsapp/resolve-contact`: identifica tenant/usuário
  pelo telefone (único lookup cross-tenant legítimo do sistema, junto com os
  demais listados na seção de isolamento). Devolve, além do contrato da
  spec, `meta.first_contact`, `meta.suggested_reply` e `meta.recent_history`.
- `POST /api/internal/whatsapp/execute-action`: roteia as 13 intenções
  (`src/lib/whatsapp-intents.ts` tem a lista + regra de permissão/perfil por
  intenção) para as mesmas `actions` usadas pela web, via o dispatcher em
  `whatsapp-router.ts` (ver seção "Lógica de negócio" acima). Confirmação
  obrigatória acima de R$ 5.000 (`CONFIRMATION_THRESHOLD`) para venda/compra
  de animal e ordens de serviço de alto valor, via `confirmFlow()`
  compartilhado (`whatsapp-handlers/shared.ts`).
- **Áudio e recibo por foto/PDF**: o agente entende áudio (transcrito via
  Whisper dentro do N8N, tratado como texto normal a partir daí) e foto/PDF
  de nota fiscal/recibo (extração por visão, também no N8N, vira a intenção
  `registrar_lancamento_financeiro`, que **sempre** pede confirmação,
  independente do valor). Categoria fora da lista fixa de
  `category-suggestions.ts` cai em `"Outros"`. `webhookBase64: true` não é
  confiável pra áudio/imagem na Evolution em produção: `POST
  /api/internal/whatsapp/fetch-media` (`src/lib/whatsapp-media.ts`) busca a
  mídia sob demanda via `/chat/getBase64FromMediaMessage` da Evolution, pelo
  `message_id`. Só suporta Evolution por enquanto.
- **`ajuda` e `resumo`**: duas intenções pra deixar o agente utilizável por
  quem tem resistência a tecnologia. `ajuda` (`topic?`) devolve texto fixo
  (nunca gerado pela LLM) de como usar um recurso. `resumo` (`scope?`) é um
  funil de até 2 perguntas terminando em dado real: nível 1
  rebanho/lavoura/prestador/financeiro, nível 2 (só sob prestador)
  clientes/agendamentos/contas a receber. Sem estado novo: reconstrói onde
  parou via `recent_history`, mesmo mecanismo da confirmação sim/não.
- `gerar_relatorio` (tipo `financeiro`) devolve um `report_url` de verdade
  (link assinado, ver Financeiro abaixo); outros tipos ainda respondem "não
  disponível".
- Guia de integração completo (nó a nó do workflow N8N, incluindo envio de
  alertas): [docs/n8n-whatsapp-workflow.md](docs/n8n-whatsapp-workflow.md).
- **Envio de mensagem é do Tibé, não do N8N** (M7, desvio deliberado da
  regra "N8N é o único intermediário", só no ENVIO): o N8N chama `POST
  /api/internal/whatsapp/send-message` e o Tibé entrega pelo provider ATIVO
  em `WhatsAppProviderConfig` (Evolution API não-oficial OU Meta Cloud API,
  configurável em `/plataforma/configuracoes/whatsapp`, só master_admin,
  credenciais AES-256-GCM com `CONFIG_ENCRYPTION_KEY`). O RECEBIMENTO
  continua no N8N. Despacho em `src/lib/whatsapp-send.ts`.

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
- **Envio por WhatsApp + email** (`src/lib/actions/alert-delivery.ts`): os 2
  canais são tentados independentemente (WhatsApp via `N8N_ALERT_WEBHOOK_URL`,
  email sempre tentado, ver seção Email). Um alerta vira `sent` assim que
  **qualquer um** dos 2 canais entregar — sem isso, um alerta que só falha no
  WhatsApp (N8N não configurado, gap conhecido) ficaria `pending` pra sempre
  e reenviaria o mesmo email todo dia no cron.

## Email

Canal adicional ao WhatsApp, não substituto: boas-vindas e alertas saem
também por email, pra não depender só do WhatsApp em avisos que precisam de
comprovação de envio (fatura em atraso, fim de trial) — exigência explícita
por motivo de defensabilidade.

- `EMAIL_PROVIDER=gmail_smtp|resend` (`.env`, default `gmail_smtp`): Gmail
  SMTP em desenvolvimento/início de produção (`GMAIL_SMTP_USER` +
  `GMAIL_SMTP_APP_PASSWORD`, uma "Senha de app" do Google); Resend guardado
  pronto (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`) pra quando o domínio
  próprio tiver um remetente verificado. Troca é só a env var + redeploy,
  sem UI.
- `src/lib/email-send.ts`: `sendEmail()` nunca lança (sempre devolve `{ok}`)
  e **sempre grava uma linha em `EmailLog`**, sucesso ou falha — rastro
  auditável, não dá pra confiar só no retorno da função.
  `src/lib/email-templates.ts`: HTML simples escrito à mão (sem lib de
  template), cores da marca.
- Pontos de disparo: `createTenantManuallyAction` e
  `resendWelcomeMessageAction` disparam email junto com o WhatsApp que já
  existe; `POST /api/v1/signup` ganhou email de boas-vindas que não tinha
  equivalente nenhum antes; `deliverPendingAlertsForTenant`/
  `deliverAllPendingAlerts` disparam email para os 5 tipos de `AlertType`,
  sem filtro. `resendWelcomeMessageAction` continua exigindo `Tenant.phone`
  (decisão deliberada: essa action existe pra reenviar *pelo WhatsApp*).
- Sem tabela de log pra boas-vindas além do `EmailLog`: `Alert.status`/
  `sent_at` já cobre alertas.
- Sem teste de entrega real: `test:m15` cobre a falha graciosa e a lógica de
  quem recebe o quê.

## Recuperação de senha

Só para `User` de tenant (`PlatformUser` fica de fora, deliberado: conta
sensível demais pra self-service). 3 etapas, 3 páginas standalone (mesmo
padrão de `/trocar-senha`/`/escolher-plano`):

- `/esqueci-senha` (email + escolha do canal) → `POST
  /api/v1/password-reset/request`. Resposta **sempre genérica**
  (`{ requested: true }`), exista ou não a conta: proteção contra
  enumeração de conta. Rate limit (`checkLoginRateLimit`, scope
  `password-reset-request`, 3/hora por email) aplicado **antes** da busca
  pelo usuário, mesmo motivo. As etapas 1 e 2 são correlacionadas pelo
  **email** (que o usuário já sabe), nunca pelo id do `PasswordResetCode`.
- `/esqueci-senha/verificar?email=` (código de 6 dígitos, expira em 10
  minutos, máx. 5 tentativas por código) → `POST
  /api/v1/password-reset/verify`. Conta inexistente e código errado
  devolvem o mesmo `INVALID_CODE`. Sucesso marca `verified_at` e devolve o
  `id` da linha (`rid`) — só aqui o id vira referência, já que nesse ponto
  a existência da conta já está provada.
- `/esqueci-senha/nova-senha?rid=` (nova senha + confirmação, regra forte) →
  `POST /api/v1/password-reset/confirm`. Exige `verified_at` preenchido e
  `consumed_at` nulo; zera `must_change_password`; redireciona pro `/login`.
- `isStrongPassword()` (`src/lib/passwords.ts`, mín. 8 + maiúscula + número +
  símbolo): aplicada aqui e em `changeOwnPasswordAction` — não no signup
  público, decisão deliberada de escopo.
- `test:m16` cobre a lógica toda sem depender de entrega real.

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
  redireciona o crawler para `/login`. `/docs` e `/esqueci-senha` também
  precisam estar lá.
- Documentação técnica em `/docs` (dentro do Tibé, sem Mintlify/Notion):
  `src/app/(public)/docs/`, uma página por seção. `/docs/api` é gerada a
  partir de um array de dados (`Endpoint[]`, `EndpointCard` em
  `src/components/public/`): ao mudar um endpoint, atualize essa lista.
- Usuários (`src/lib/actions/users.ts`): convite gera senha temporária
  mostrada uma única vez (`inviteUserAction` não dispara email, diferente do
  fluxo de criação manual/signup: gap conhecido, não é uma inconsistência,
  é só um ponto que não foi conectado ao canal de email ainda). Regras de
  "não edita a si mesmo" e "só Owner promove a Owner" ficam nas rotas
  (`api/v1/users/[id]/role`, `.../active`), não nas actions.
- `README.md`/`CONTRIBUTING.md` na raiz refletem o estado real do projeto:
  mantenha os dois em sincronia com mudanças de arquitetura, junto com este
  arquivo e o `CLAUDE.md`.

## Painel da Plataforma (Módulo 6)

Ferramenta interna da Pleno Digital, sem fase contratual com a Agromax:
todos os tenants numa visão agregada, por desenho. `PlatformUser`
(`MASTER_ADMIN`/`EQUIPE`) já existia no schema desde o M0; este módulo
construiu o painel em volta dele.

- `/plataforma` é uma **pasta real** (não um route group `(platform)`):
  route groups não geram segmento de URL, e `/login` já é usado pelo tenant.
  `app/plataforma/(painel)/` é um sub-route-group interno só para separar o
  layout do login (sem nav) do layout autenticado (com sidebar), sem afetar
  a URL.
- **Duas instâncias NextAuth de verdade**, não uma sessão com campo de tipo:
  `src/lib/platform-auth.config.ts`/`platform-auth.ts` espelham
  `auth.config.ts`/`auth.ts`, com cookie próprio (`tibe-platform-session`) e
  secret próprio (`PLATFORM_AUTH_SECRET`, nunca reusar `NEXTAUTH_SECRET`),
  montados em `/api/platform-auth/[...nextauth]`.
- ⚠️ `next-auth` assume `basePath: "/api/auth"` por padrão: uma instância
  secundária **precisa** declarar `basePath` explícito na config, senão todo
  request quebra com `UnknownAction`.
- Middleware: `/plataforma` está isento da checagem de sessão de tenant
  (`PUBLIC_PREFIXES` em `auth.config.ts`); a proteção real é manual dentro do
  próprio `middleware.ts`, via `getToken({ req, secret: PLATFORM_AUTH_SECRET,
  cookieName: "tibe-platform-session" })` (de `next-auth/jwt`: primitiva de
  baixo nível, não a instância `auth()` da plataforma chamada "crua" dentro
  do middleware da outra instância).
- `guardPlatform({ requireMasterAdmin? })` (`src/lib/platform-guard.ts`)
  espelha `guard()`. `equipe` lê tenants; só `master_admin` vê KPIs
  financeiros e executa ações administrativas (forçar status, gerenciar
  equipe, criação manual de tenant).
- `SubscriptionStatusLog` (modelo): toda transição de `Subscription.status`
  grava uma linha (`logSubscriptionStatusChange()` em
  `src/lib/platform/subscription-log.ts`): chamada pelo webhook do Asaas e
  por `subscribeAction`/`cancelSubscriptionAction` (M5, automático) e por
  `forceSubscriptionStatusAction` (M6, manual, com o `PlatformUser`
  responsável). Existe porque `Subscription` não guardava nenhum timestamp de
  transição: sem isso, churn e tempo médio de conversão eram impossíveis de
  calcular.
- `lib/platform/kpis.ts`: MRR sempre usa `PLAN_PRICES` (preço atual, sem
  histórico de preço por assinatura). `getStatusAsOf(date)` reconstrói o
  status de cada assinatura numa data a partir do log: sustenta churn (ativos
  no início do período), evolução real de MRR mês a mês, e tempo até a
  primeira ativação no funil. LTV devolve `null` (não `Infinity`) sem churn
  observado.
- Captura de UTM (`src/lib/utm.ts`, `UtmCapture` dentro de `PublicNav`):
  first-touch via cookie (`tibe_utm`, 30 dias): só grava se ainda não
  existir. `POST /api/v1/signup` persiste em `Tenant.lead_source_utm_*`.
- Testes (`npm run test:m6`) rodam contra `lib/platform/kpis.ts` e as actions
  direto (rotas atrás de `guardPlatform()` não dá pra invocar sem sessão de
  verdade). Funções de KPI escaneiam **todos** os tenants por desenho, então
  os testes comparam baseline antes/depois, não contagem absoluta.
- Seed do `master_admin` já existe em `prisma/seed.ts`, aplicado em produção.
- Mensagem de boas-vindas por WhatsApp+email (`src/lib/whatsapp-welcome.ts`
  + seção Email): `createTenantManuallyAction` dispara, melhor esforço, uma
  mensagem com link de login, email e senha temporária. Botão "Reenviar
  boas-vindas" gera uma NOVA senha temporária a cada uso (a original em
  claro não é recuperável) e marca `must_change_password` de novo.
- Painel do tenant é mobile-first (ver seção UI acima).

## Provider WhatsApp configurável (M7) e Evolution QR (M9)

`WhatsAppProviderConfig` (config GLOBAL de plataforma, fora de
`TENANT_SCOPED_MODELS`, mesma categoria de `PlatformUser`): Evolution API
não-oficial OU Meta Cloud API, configurável em
`/plataforma/configuracoes/whatsapp` (só `master_admin`), credenciais
AES-256-GCM com `CONFIG_ENCRYPTION_KEY` (`src/lib/crypto-config.ts`).
Invariante "no máximo 1 ativo por vez" garantida em transação (`$transaction`
com desativar-todos + ativar-alvo) mais um índice parcial de defesa extra no
banco (ver a armadilha de migração acima). Conectar a instância Evolution
via QR code é feito direto pelo painel (`src/lib/evolution-client.ts` +
rotas `/api/platform/whatsapp-config/evolution/{connect,status}`), sem
precisar acessar a Evolution manualmente; o webhook pro N8N é configurado
automaticamente nesse fluxo.

---

## Agent skills

Ferramentas de agente configuradas neste repo (independentes da ferramenta
usada para rodar o agente):

- **Issue tracker**: GitHub Issues do repo (`tibegestaoagro/tibe-agrogestao`),
  via `gh` CLI. Ver `docs/agents/issue-tracker.md`.
- **Triage labels**: labels padrão (`needs-triage`, `needs-info`,
  `ready-for-agent`, `ready-for-human`, `wontfix`). Ver
  `docs/agents/triage-labels.md`.
- **Domain docs**: single-context, `CONTEXT.md` + `docs/adr/` na raiz (ainda
  não existem, criados sob demanda). Ver `docs/agents/domain.md`.

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
npm run test:m7           # Provider WhatsApp configurável
npm run test:m9           # Evolution client (QR)
npm run test:m10          # Criação manual de tenant + troca de senha
npm run test:m11          # Recibo por mídia (WhatsApp)
npm run test:m12          # Ajuda e resumo (WhatsApp)
npm run test:m13          # Gate de sessão
npm run test:m14          # platform-tenants.ts (update/archive/reenvio)
npm run test:m15          # Canal de email
npm run test:m16          # Recuperação de senha
```

Credenciais do seed (dev): `owner@damata.com.br` / `tibe123`.
