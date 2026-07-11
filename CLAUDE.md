# Tibé (AgroGestão) — contexto para Claude Code

SaaS multi-tenant de gestão agropecuária (rebanho, lavoura, prestação de serviço,
financeiro) com agente de IA no WhatsApp como canal primário. Cliente/financiador
do MVP: Da Mata Sementes LTDA. Desenvolvido pela Pleno Digital.

**Leia primeiro:** [docs/tibe-prd.md](docs/tibe-prd.md) (PRD completo, v1.1) e a
spec do módulo em que for trabalhar em `docs/specs/module-XX-*.md`. Este arquivo
é um resumo operacional — o PRD é a fonte de verdade para modelo de dados,
contratos e regras de produto.

Veja também [AGENTS.md](AGENTS.md) (mesma base técnica, redigida de forma
agnóstica de ferramenta, para o caso de sessões abertas com outro agente).

---

## Como este projeto é conduzido (não pule isso)

Este projeto é dividido em módulos, entregues **um de cada vez**, seguindo a
fase do contrato. O usuário (Dilton) segue este protocolo com qualquer agente:

1. **Antes de codificar um módulo**, leia a spec inteira e devolva um resumo
   curto confirmando o objetivo + **toda ambiguidade ou inconsistência
   encontrada**. Nunca assuma em silêncio — pergunte. Use `AskUserQuestion`
   para decisões de produto/arquitetura que a spec não resolve.
2. **Implemente task por task**, na ordem da spec.
3. **Siga os contratos de API literalmente** (nomes de campo, tipos, formato de
   sucesso/erro). Extensões aditivas ao contrato (campos novos que não quebram
   o que já existe) são aceitáveis se documentadas — mas produto/arquitetura
   novos exigem pergunta antes.
4. **Todo modelo com `tenant_id`** passa pelo client Prisma escopado
   (`getTenantDb()` / `prismaForTenant()`), nunca filtro manual — ver seção de
   isolamento abaixo.
5. **Ao final de cada módulo**, rode os critérios de aceitação da spec (com
   testes automatizados sempre que possível) e reporte o que passou/faltou
   *antes* do usuário validar manualmente.
6. **Não avance para o próximo módulo sem aprovação explícita do usuário.**
7. **Nunca rode `git push` sem ser pedido.** Commits normalmente são pedidos
   explicitamente também.

## Status dos módulos

| # | Módulo | Status |
|---|--------|--------|
| 0 | Setup, schema multi-tenant, auth, isolamento | ✅ em produção |
| 1 | Rebanho e Lavoura | ✅ em produção |
| 2 | Prestador de Serviço | ✅ em produção |
| 3 | Agente WhatsApp | ✅ código do Tibé pronto — **N8N/Meta/Salvy ainda não provisionados** (guia: [docs/n8n-whatsapp-workflow.md](docs/n8n-whatsapp-workflow.md)) |
| 4 | Financeiro e Alertas | ✅ completo — Redis/BullMQ real; PDF via link assinado (sem R2); envio WhatsApp aguarda N8N (mesmo gap do M3) |
| 5 | Painel Web, Cobrança (Asaas) e Site | ✅ completo — Asaas real (código pronto, sem chave de sandbox testada ainda); dashboard consolidado, usuários, cobrança/bloqueio por inadimplência, site público (`/`, `/planos`, `/faq`, `/politicas/*`), documentação técnica em `/docs`, README/CONTRIBUTING |
| 6 | Painel da Plataforma (`PlatformUser`, interno Pleno) | ✅ completo — auth separada (`/plataforma`), MRR/churn/LTV/funil, gestão de tenants e equipe |

Specs: `docs/specs/module-00-setup.md` … `module-06-painel-plataforma.md`.

---

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Prisma 7 · PostgreSQL 17
(Neon) · NextAuth v5 beta (**duas instâncias** — tenant e plataforma, M6) ·
Zod · Recharts · UI kit shadcn-style feito à mão (ver seção UI) · Redis Cloud
+ BullMQ (M4) · Asaas (M5, cobrança recorrente). N8N e Cloudflare R2
continuam no PRD mas fora do código: N8N é infra externa (orquestra o agente
WhatsApp, não roda dentro do Tibé) ainda não provisionada; R2 nunca chegou a
ser necessário (PDFs são gerados sob demanda, sem storage — ver Módulo 4).
Todos os 7 módulos do PRD (0-6) têm código completo agora.

## Deploy e infra

- **App:** https://tibe-agrogestao.vercel.app (Vercel, deploy automático em
  push na `main`).
- **Repo:** `https://github.com/tibegestaoagro/tibe-agrogestao.git` — conta
  dona é `tibegestaoagro`; `dilton-pleno` é colaborador com Write.
- **Banco de produção:** Neon (`tibe-agrogestao` / `neondb`). O `.env` local
  do projeto **aponta para o Neon por padrão** — veja o aviso de dev abaixo.
- **Banco de dev local:** Postgres 17 via Docker, container `tibe-pg`, porta
  `55432` (`docker start tibe-pg` se não estiver rodando).

  ```
  postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public
  ```

### ⚠️ Armadilha: `.env` aponta para produção (Neon)

O arquivo `.env` (gitignored) foi deixado apontando para o **Neon de
produção**, não para o Docker local. Antes de rodar migração, seed ou teste
**localmente**, use a URL do Docker **inline**, sem editar o `.env`:

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m1
```

Só use o `.env` (Neon) quando a intenção for **de fato** migrar/seedar
produção — e confirme com o usuário antes, é uma ação de alto impacto.

### Migrações no Prisma 7 (não use `prisma migrate dev` direto)

`prisma migrate dev` é interativo (pede confirmação em prompts) e **falha** em
ambiente não-interativo (agente de código) assim que precisa perguntar algo.
O fluxo usado neste projeto:

```powershell
# 1. Gera o SQL da diferença entre o banco atual e o schema
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script

# 2. Salva esse SQL manualmente em prisma/migrations/<timestamp>_nome/migration.sql

# 3. Aplica (não-interativo, idempotente)
npm run db:deploy   # = prisma migrate deploy
```

Aplique sempre primeiro no Docker local, rode os testes, e só depois
replique no Neon (com a URL **Direct**, sem `-pooler`, para migrar — a
**Pooled**, com `-pooler`, é a usada em runtime/`DATABASE_URL` da Vercel).

### Redis (BullMQ) já está provisionado (Redis Cloud)

Diferente do Postgres, o `REDIS_URL` no `.env` local aponta para a **mesma**
instância Redis Cloud usada em produção — não há um Redis local separado.
Isso é aceitável porque o uso é só fila/lock de job (dado efêmero, sem risco
de negócio). BullMQ empacota sua própria cópia de `ioredis` internamente —
**nunca** passe a instância de `getRedisConnection()` (`src/lib/redis.ts`)
direto para `new Queue()`/`new Worker()`, dá erro de tipo (duas classes
`Redis` estruturalmente iguais, nominalmente diferentes). Use
`getRedisConnectionOptions()` (host/porta/senha crus) para qualquer construtor
do BullMQ.

### ⚠️ Testar sessão autenticada localmente via `next start` não funciona

Páginas protegidas (`/dashboard`, `/financeiro`, etc.) redirecionam para
`/login` mesmo com um cookie de sessão válido quando testadas via `next
start` local + cookie jar (ex: PowerShell `WebRequestSession`) — o Edge
Middleware não reconhece a sessão nesse setup específico, mesmo com
`AUTH_TRUST_HOST=true`. **Rotas `/api/v1/*` (Node runtime) funcionam
normalmente** com a mesma sessão — só o Middleware (Edge) tem esse problema
localmente. Confirmado que não é regressão de nenhum módulo (páginas antigas
como `/dashboard` têm o mesmo comportamento). A produção (Vercel) nunca
apresentou esse problema em testes reais de navegador. Não vale a pena
investigar mais fundo — para validar fluxo de página autenticada, use o
navegador real (local `next dev` ou a URL da Vercel), não `next start` +
cookie jar.

---

## Isolamento multi-tenant (a regra mais importante do projeto)

`tenant_id` **nunca** vem do client — é sempre resolvido da sessão NextAuth no
servidor. Toda query de negócio usa o client Prisma **escopado**:

```ts
import { getTenantDb } from "@/lib/tenant-context";
import { scoped } from "@/lib/prisma";

const db = await getTenantDb();                 // dentro de rota/Server Component autenticado
await db.animal.findMany();                      // tenant_id injetado automaticamente
await db.animal.create({ data: scoped({ ear_tag: "001", property_id }) });
```

Implementação: `src/lib/prisma.ts` — uma **Prisma Client Extension**
(`buildTenantClient`) injeta `tenant_id` em toda operação dos modelos listados
em `TENANT_SCOPED_MODELS`. `prismaForTenant(tenantId)` devolve o client
escopado (cacheado por tenant); `getTenantDb()` (em `tenant-context.ts`) resolve
o tenant da sessão e chama `prismaForTenant`.

- `scoped(data)` é um helper de tipos: satisfaz o `tenant_id` exigido pelo
  Prisma Client no `create` **sem** você passar o valor manualmente — a
  extension injeta o valor real em runtime. **Nunca** passe `tenant_id` de
  verdade num `scoped(...)` — isso violaria o próprio propósito do helper.
- **Todos** os modelos de negócio (inclusive os que antes eram "filhos" sem
  `tenant_id` no PRD original — `AnimalWeightLog`, `AnimalVaccination`,
  `AnimalMovement`, `CropCycle`, `PlotInput`) **têm** `tenant_id` e estão em
  `TENANT_SCOPED_MODELS`. Isso foi uma decisão deliberada de defense-in-depth
  (desvio do PRD, aprovado pelo usuário) — não remova.
- O client **base** (`prisma`, sem escopo) só deve ser usado em: login
  (`auth.ts`, lookup de email global), `prisma/seed.ts`, scripts internos, o
  lookup cross-tenant de `POST /api/internal/whatsapp/resolve-contact`
  (precisa achar a qual tenant um telefone pertence, antes de saber o tenant),
  o job diário de alertas (`generateAllAlerts`/`deliverAllPendingAlerts` em
  `src/lib/actions/alerts.ts` e `alert-delivery.ts`) — que precisa **listar
  todos os tenants ativos** antes de escopar por tenant a cada iteração —, e
  `POST /api/webhooks/asaas` (M5), que localiza a `Subscription` pelo
  `asaas_subscription_id` porque o Asaas não manda sessão de tenant nenhuma,
  `getBillingAccess()` (`src/lib/billing-access.ts`) — sempre chamada com um
  `tenantId` já resolvido da sessão pelo caller (nunca de input do client),
  e `inviteUserAction` (`src/lib/actions/users.ts`) — checagem de duplicidade
  de `User.email`, que é **globalmente único** (não dá pra checar isso com o
  client escopado; só devolve 409 genérico, não vaza dado de outro tenant).
  Qualquer uso novo do client base fora desses casos é suspeito — pare e
  pergunte.
- `PlatformUser` e `SubscriptionStatusLog` (Módulo 6) são a **outra** exceção
  estrutural: nenhum dos dois está em `TENANT_SCOPED_MODELS` (não fazem
  sentido escopados por tenant — `PlatformUser` não pertence a tenant algum,
  `SubscriptionStatusLog` só é lido por rotas de plataforma via
  `tenant_id` explícito quando precisa filtrar por tenant). `PlatformUser`
  nunca deve ser alcançável a partir de uma sessão de tenant — e o inverso
  também: ver seção "Painel da Plataforma" abaixo para como isso é garantido
  (duas instâncias NextAuth com cookies diferentes, não uma checagem de role).

Todo módulo que adiciona endpoints ganha um teste de isolamento automatizado
(`scripts/*.test.ts`, rodados via `tsx`, chamando os route handlers
diretamente com um `Request` construído). Rode sempre antes de reportar um
módulo como concluído:

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"
npm run test:isolation   # M0 — isolamento genérico
npm run test:m1          # M1 — Rebanho/Lavoura + isolamento dos "filhos"
npm run test:m2          # M2 — Prestador + total_value persistido
npm run test:m3          # M3 — WhatsApp: permissão por role/perfil, confirmação, isolamento
npm run test:m4          # M4 — Financeiro/Alertas + idempotência + cron
npm run test:m5          # M5 — billing-access, webhook Asaas, usuários, trial_ending
npm run test:m6          # M6 — MRR/churn/LTV/funil, isolamento PlatformUser, força de status
```

---

## Padrões de API

- Sucesso: `{ data, meta }`. Erro: `{ error: { code, message } }`. Helpers em
  `src/lib/api.ts` (`apiOk`, `apiError`, `ApiErrors`).
- Rotas de negócio (`/api/v1/*`) autenticam por **sessão** — use o guard
  padrão:

  ```ts
  import { guard, readJson } from "@/lib/api-guard";

  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;
  // g.db (client escopado) e g.user disponíveis
  ```

  `guard(module, "read"|"write", { profile? })` checa sessão + permissão por
  role (matriz do PRD §5.2, em `src/lib/permissions.ts`) + perfil de tenant
  ativo (fazenda/prestador), tudo de uma vez.

- Rotas internas (`/api/internal/*`, chamadas pelo N8N) autenticam por
  **secret no header** (`x-internal-secret` contra `INTERNAL_API_SECRET`), não
  por sessão — `src/lib/internal-guard.ts` (`requireInternalSecret`). Dentro
  delas, a *role* do usuário é sempre **relida do banco** a partir de
  `user_id`+`tenant_id`; nunca confie em role vinda do caller.
- Rotas de webhook (`/api/webhooks/*`) seguem a mesma ideia (token no header,
  não sessão). Só existe `POST /api/webhooks/asaas` (M5) — o webhook do
  WhatsApp vai para o N8N, não para o Tibé (ver seção do agente abaixo), então
  `/api/webhooks/whatsapp` continua não existindo (seria código morto).

## Lógica de negócio: `src/lib/actions/*`

Toda regra de negócio (criar animal, registrar pesagem, calcular GMD, gerar
`FinancialEntry` de uma venda, etc.) vive em `src/lib/actions/*.ts`, **não**
dentro do route handler. As rotas HTTP (`/api/v1/...`) são wrappers finos:
validam com Zod, chamam a action, serializam a resposta. O agente WhatsApp
(`/api/internal/whatsapp/execute-action`) chama as **mesmas** actions
diretamente. Isso foi um refactor deliberado no Módulo 3 (a pedido do usuário,
"deixar liso para trazer modificações depois") — ao adicionar/editar uma
regra de negócio, mude na action, não duplique lógica na rota.

Padrão de retorno (`src/lib/actions/types.ts`):

```ts
type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string; status: number };
```

Arquivos principais: `animals.ts`, `service-orders.ts`, `service-clients.ts`,
`properties.ts`, `financial-summary.ts`, `billing.ts` (M5, assinatura Asaas),
`users.ts` (M5, convite/role/ativação). Lançamentos financeiros automáticos
sempre passam por `createLinkedEntry()` (`src/lib/financial.ts`) — nunca crie
`FinancialEntry` manualmente fora dela nas actions existentes.

## Serialização

Prisma devolve `Decimal` e `Date`; os contratos de API usam `number` e string
ISO8601. Use sempre `decToNum()` / `isoOrNull()` (`src/lib/serialize.ts`) e os
serializers prontos em `src/lib/serializers.ts` — não formate objetos Prisma à
mão numa resposta de API.

---

## Autenticação

NextAuth v5 (beta), Credentials + bcrypt. Split em dois arquivos por causa do
Edge runtime do middleware:

- `src/lib/auth.config.ts` — config **edge-safe** (sem Prisma/bcrypt), usada
  pelo `middleware.ts` para proteger rotas. É aqui que fica a lista de rotas
  públicas.
- `src/lib/auth.ts` — instância completa (Node runtime), com o provider de
  credenciais de fato.

`User.email` é **globalmente único** (o login recebe só email+senha, sem
seletor de tenant/subdomínio) — um email pertence a exatamente um tenant.
`middleware.ts` libera `/api/*` da checagem de sessão (cada handler faz sua
própria auth) para que rotas de API sem sessão devolvam `401` JSON em vez de
redirecionar para `/login`.

## Roles e permissões

Enum `UserRole`: `OWNER | ADMIN | OPERADOR | VISUALIZADOR` (maiúsculas,
conforme contrato de login). Hierarquia e matriz de acesso por módulo em
`src/lib/permissions.ts` (espelha PRD §5.2). `canAccess`/`canWrite` recebem a
role diretamente (reusáveis fora de contexto de sessão HTTP — é assim que o
agente WhatsApp valida permissão, sem precisar de cookie).

## UI

Não existe um design system de terceiros instalado via CLI — **o `npx
shadcn@latest init` trava neste ambiente** (fica esperando prompt
interativo). Os componentes em `src/components/ui/` (`button`, `input`,
`label`, `table`, `sheet`, `select`, `badge`) foram escritos à mão no estilo
shadcn (Radix primitives + `class-variance-authority` + `tailwind-merge`,
`cn()` em `src/lib/utils.ts`), com `components.json` já configurado — se um
dia rodar o CLI interativamente, ele deve reconhecer a estrutura existente.
Gráficos: Recharts v3. Cores da marca em `tailwind.config.ts`
(`tibe.primary/dark/light`), fonte Inter via `next/font/google`.

Páginas server (list/detail) buscam dados direto via `getTenantDb()`; ações de
escrita são componentes client dentro de `<Sheet>` (painel lateral), chamando
`apiPost`/`apiPatch` de `src/lib/client-api.ts` e dando `router.refresh()` no
sucesso.

---

## Signup público (`/planos` + `/criar-conta`) — fora do escopo original do PRD

O PRD §12 marca "onboarding self-service completo" como **fora do MVP** (v1.1).
Ainda assim, existe hoje um fluxo de signup público real, construído a pedido
explícito do usuário para destravar testes do painel antes dos módulos
4-5-6:

- `/planos` — preços **reais** (`PLAN_PRICES` em `src/lib/asaas.ts`: campo
  R$97, fazenda R$197, grupo R$397 — a mesma constante usada para criar a
  assinatura no Asaas, nunca duplique o número), cada plano linkando para
  `/criar-conta?plan=campo|fazenda|grupo`.
- `/criar-conta` — formulário completo (empresa, CNPJ/CPF, telefone,
  responsável, email, senha) → `POST /api/v1/signup` (única rota `/api/v1`
  que roda **sem sessão**, por natureza — ainda não existe usuário). Cria
  `Tenant` (status **trial**, `plan` = o card clicado, `trial_ends_at` = agora
  + `TRIAL_DAYS` — `src/lib/billing-access.ts`, 14 dias) + `User` (role
  `OWNER`) de verdade, com checagem de documento/email duplicado. O client
  faz login automático (`signIn` do NextAuth) logo em seguida e manda para
  `/dashboard`, que redireciona ao onboarding existente (sem `TenantProfile`
  ainda).
- **Sem rate limiting** (não há fila/Redis conectado a esta rota) — gap
  conhecido, aceitável para uso controlado de testes, mas revisar antes de
  divulgar publicamente.
- Este fluxo continua sendo a **única** forma de criar tenant (o Módulo 5 não
  o substituiu — a spec 5.11 previa um trial passwordless via WhatsApp, mas
  isso exigiria N8N em produção; decisão do usuário foi manter `/criar-conta`
  como está e reusá-lo como CTA da home pública).

## O agente WhatsApp (Módulo 3)

Arquitetura (PRD §7): **Meta → N8N → Tibé → N8N → Meta**. O Tibé nunca fala
direto com a Meta Cloud API; o N8N é o único intermediário. Por isso:

- **Não existe** `/api/webhooks/whatsapp` no Tibé — seria código morto.
- A classificação de intenção por LLM acontece **dentro do N8N** (a chave de
  API do provedor de LLM fica nas credenciais do N8N, não no `.env` do Tibé).
- `POST /api/internal/whatsapp/resolve-contact` — identifica tenant/usuário
  pelo telefone (único lookup cross-tenant legítimo do sistema). Devolve,
  além do contrato da spec, `meta.first_contact`, `meta.suggested_reply` e
  `meta.recent_history` (extensões aditivas — a spec não definia de onde o
  N8N obteria essas informações).
- `POST /api/internal/whatsapp/execute-action` — roteia as 9 intenções do MVP
  (`src/lib/whatsapp-intents.ts` tem a lista + regra de permissão/perfil por
  intenção) para as mesmas `actions` usadas pela web. Confirmação obrigatória
  acima de R$ 5.000 (`CONFIRMATION_THRESHOLD`) para venda/compra de animal e
  ordens de serviço de alto valor — ver `src/lib/actions/whatsapp-router.ts` e
  `src/lib/actions/confirmation.ts` (interpretação de "sim"/"não" em texto
  livre, usada só dentro dos dois fluxos de confirmação, nunca globalmente).
- `gerar_relatorio` (tipo `financeiro`) devolve um `report_url` de verdade
  (link assinado, ver Módulo 4 abaixo); tipos `rebanho|lavoura|prestador`
  ainda respondem "não disponível" — não há gerador de PDF para eles.
- Guia completo para montar o workflow no N8N (nó a nó, quando a infra externa
  — Salvy, Meta Business Manager, N8N em produção — estiver pronta):
  [docs/n8n-whatsapp-workflow.md](docs/n8n-whatsapp-workflow.md). Inclui a
  seção de envio de alertas (Módulo 4) via `N8N_ALERT_WEBHOOK_URL`.

## Financeiro e Alertas (Módulo 4)

- **Lançamentos manuais** (`POST /api/v1/financial-entries`) sempre nascem
  `related_module: geral`. `PATCH` (edição completa) só é permitido nesses —
  editar um lançamento gerado por outro módulo (venda de animal, insumo,
  ordem faturada) é bloqueado (`NOT_EDITABLE`) para não descolar do dado de
  origem; "marcar como pago" funciona em qualquer lançamento, de qualquer
  origem. Lógica em `src/lib/actions/financial-entries.ts`.
- **Regime contábil**: DRE (`getDre`) é por **competência** — todos os
  lançamentos do período por `due_date`, pago ou não. Fluxo de caixa
  (`getCashFlow`) é por **caixa** — só `status: paid`, agrupado por
  `paid_at`. Os dois em `src/lib/actions/financial-reports.ts`.
- **PDF sem R2**: `src/lib/reports/generate-financial-pdf.ts` (pdf-lib, gera
  na hora, nunca armazena) atrás de um link assinado por HMAC com expiração
  (`src/lib/reports/report-token.ts`, reusa `INTERNAL_API_SECRET` como
  chave) — funciona sem sessão (necessário para quem clica vindo do
  WhatsApp). `GET /api/v1/financial/report/link` (sessão, gera o link) →
  `GET /api/v1/financial/report?token=` (público, serve o PDF). Trocar pelo
  R2 real no futuro não deve exigir mudar quem consome o link.
- **Alertas** (`src/lib/actions/alerts.ts`): idempotência por
  `(alert_type, related_module, related_id)` — inclusive `low_balance`, que
  usa a **semana ISO** como `related_id` sintético (resolve "no máximo 1 por
  semana" com o mesmo mecanismo dos outros tipos, sem regra especial).
- **BullMQ real** (Redis Cloud já provisionado), mas **sem worker
  persistente** — decisão do módulo, não há onde hospedar um processo 24/7
  hoje. `GET /api/internal/jobs/generate-alerts` (disparado 1x/dia pela
  Vercel Cron, `vercel.json`, autenticado por `CRON_SECRET` que a Vercel
  injeta sozinha) roda a geração **síncrona** dentro da própria requisição.
  A `Queue` do BullMQ registra um histórico auditável (uso real, mas só de
  bookkeeping); a idempotência "não rodar 2x no mesmo dia" é um lock simples
  no Redis (`SET NX`), não o estado interno do job — mais robusto sem um
  Worker para gerenciá-lo. Ver `getRedisConnectionOptions()` acima.
- **Envio por WhatsApp** (`src/lib/actions/alert-delivery.ts`): mesmo padrão
  do Módulo 3 — Tibé chama `N8N_ALERT_WEBHOOK_URL` (outbound); se não
  configurada, alertas ficam `pending` sem quebrar nada.

## Cobrança e billing (Módulo 5)

- **Cliente Asaas** (`src/lib/asaas.ts`): `access_token` no header (sem
  prefixo Bearer), sandbox vs produção por `ASAAS_ENV`. `AsaasNotConfiguredError`
  quando `ASAAS_API_KEY` não está setada — nunca chegou a ser testado contra o
  Asaas de verdade neste ambiente (sem chave de sandbox própria), então
  qualquer bug de integração real só aparece quando a chave existir.
- **PIX e boleto ficam dentro do painel; cartão de crédito redireciona ao
  checkout hospedado do Asaas.** Decisão deliberada (não é limitação): o
  usuário queria tudo no painel (público brasileiro desconfia de sair do site
  para pagar), mas processar cartão dentro do próprio backend exigiria
  certificação PCI-DSS **SAQ-D** (pesada); redirecionar para o checkout do
  Asaas mantém o Tibé em **SAQ-A** (leve), porque o dado de cartão nunca toca
  o servidor do Tibé. `subscribeAction` (`src/lib/actions/billing.ts`) devolve
  um de três formatos (`SubscribeResult`): `pix` (QR + copia-cola), `boleto`
  (linha digitável), ou `redirect` (URL da fatura Asaas, só para cartão).
- **`Subscription.status` nasce `"overdue"`, mesmo numa assinatura nova** —
  não é bug. `next_due_date` fica no futuro (gerado pelo Asaas), e
  `billing-access.ts` dá carência automática enquanto isso, então o tenant não
  é bloqueado no intervalo entre criar a assinatura e o primeiro webhook de
  pagamento confirmar.
- **`POST /api/webhooks/asaas`** (autenticação por token no header
  `asaas-access-token`, comparado com `ASAAS_WEBHOOK_TOKEN`): processa
  `PAYMENT_CONFIRMED` (→ `Subscription.status: active` + `Tenant.status:
  active` + busca `next_due_date` fresco no Asaas), `PAYMENT_OVERDUE` (→
  `overdue`), `PAYMENT_DELETED` (→ `canceled`); outros eventos e assinaturas
  não rastreadas são reconhecidos com `200 { processed: false }`, nunca erro
  (o Asaas não deve reenviar por causa de eventos fora do nosso escopo).
- **Acesso por nível de cobrança** (`src/lib/billing-access.ts`,
  `getBillingAccess(tenantId)`): três níveis — `full` / `read_only` /
  `blocked` — pela mesma régua de dias, tanto para assinatura em atraso
  (`next_due_date`) quanto para trial vencido sem assinatura
  (`trial_ends_at`, `TRIAL_DAYS = 14`): **< 5 dias → full; 5–15 → read_only;
  ≥ 15 → blocked**. `guard()` aplica em toda rota de API (bloqueia escrita em
  `read_only`, tudo em `blocked`, exceto `opts.skipBillingCheck: true` — usado
  só pelas próprias rotas `/api/v1/billing/*`, que precisam continuar
  acessíveis para o tenant conseguir regularizar). O layout do dashboard
  aplica a mesma regra a nível de página, redirecionando para
  `/configuracoes/assinatura` quando bloqueado.
- **`x-pathname` via middleware**: `middleware.ts` foi reestruturado da forma
  `export const { auth: middleware } = NextAuth(authConfig)` para a forma de
  função de ordem superior (`auth((req) => { ... res.headers.set("x-pathname",
  ...) ...})`) só para conseguir propagar o pathname atual para o layout do
  dashboard (Node runtime, com Prisma) sem duplicar lógica de auth no Edge.
  Se precisar adicionar outro header/side-effect no middleware, é aqui que
  entra.
- **`AlertType.trial_ending`** (extensão aditiva ao enum, spec 5.8 não previa
  no PRD original): dispara quando `trial_ends_at` está a ≤ 2 dias e o tenant
  não tem `Subscription` nenhuma. `related_id` é o próprio `tenant_id` (o
  trial só vence uma vez, então é naturalmente idempotente sem precisar de um
  identificador sintético como o `low_balance` da semana ISO).

## Site público, documentação e gestão de usuários (Módulo 5)

- **`app/(public)/`**: `/` (home com hero/módulos/como funciona), `/planos`
  (preços reais, ver seção de Signup acima), `/faq`, `/politicas/privacidade`
  e `/politicas/termos` (LGPD — `/politicas` sozinho é um redirect para
  `/politicas/privacidade`, não uma página própria). Nav/footer compartilhados
  em `src/components/public/` (`PublicNav`, `PublicFooter`) — qualquer página
  pública nova deve reusar os dois, não duplicar o markup.
- **SEO**: `metadataBase` + title template (`"%s | Tibé"`) no `RootLayout`;
  cada página pública define seu próprio `title`/`description` (a home não
  sobrescreve `title`, herda o `default` do root). `app/sitemap.ts` e
  `app/robots.ts` geram `/sitemap.xml` e `/robots.txt` automaticamente — como
  são rotas especiais do Next, **precisam** estar em `PUBLIC_PATHS`
  (`src/lib/auth.config.ts`), senão o middleware redireciona o crawler para
  `/login`.
- **Documentação técnica em `/docs`** (dentro do próprio Tibé — decisão do
  usuário, sem Mintlify/Notion): `src/app/(public)/docs/` — layout com sidebar
  fixa (`docs/layout.tsx`) e uma página por seção (`arquitetura`, `schema`,
  `api`, `whatsapp`, `setup`, `deploy`, `glossario`). A página `/docs/api` é
  **gerada a partir de um array de dados** (`Endpoint[]`, componente
  `EndpointCard` em `src/components/public/`) cobrindo todos os endpoints
  `/api/v1` e `/api/internal` reais — ao adicionar/mudar um endpoint,
  atualize essa lista também, senão a documentação e o código divergem. `/docs`
  precisa estar em `PUBLIC_PREFIXES` (`auth.config.ts`) — mesma armadilha do
  sitemap/robots.
- **Gestão de usuários** (`src/lib/actions/users.ts`): convite gera senha
  temporária (`generateTempPassword`) mostrada **uma única vez** na resposta —
  não há envio de email neste projeto (nenhum módulo tem infra de email).
  Regras de "não pode editar/desativar a si mesmo" e "só Owner promove a
  Owner" ficam nas rotas (`api/v1/users/[id]/role`, `.../active`), não nas
  actions — a action em si é mais simples (`updateUserRoleAction`,
  `setUserActiveAction`) e só bloqueia desativar um `OWNER`.
- **`README.md`/`CONTRIBUTING.md`** na raiz do repo agora refletem o estado
  real do projeto (antes só existia um `README.md` desatualizado do Módulo 0,
  com uma afirmação **errada** sobre isolamento — dizia que os modelos-filho
  não tinham `tenant_id`, o que foi revertido ainda no Módulo 1). Mantenha os
  dois em sincronia com mudanças de arquitetura, junto com este arquivo.

## Painel da Plataforma (Módulo 6)

Único módulo sem fase contratual com a Agromax — ferramenta interna da Pleno
Digital para acompanhar a saúde do negócio Tibé como um todo (todos os
tenants na mesma tela, por desenho). `PlatformUser` (roles `MASTER_ADMIN` |
`EQUIPE`) já existia no schema desde o Módulo 0 como placeholder; este módulo
construiu tudo em volta dele.

- **`/plataforma` é uma pasta REAL, não um route group `(platform)`.** A
  spec descreve `app/(platform)/kpis/page.tsx` etc., mas route groups não
  aparecem na URL — `(platform)/login/page.tsx` viraria `/login`, colidindo
  direto com o login de tenant. `app/plataforma/` é um segmento de URL de
  verdade; `(painel)` como sub-route-group dentro dele separa o layout do
  login (`app/plataforma/login/`, sem nav) do layout autenticado
  (`app/plataforma/(painel)/`, com sidebar) sem afetar a URL.
- **Duas instâncias NextAuth genuinamente separadas** — não uma sessão
  compartilhada com um campo de "tipo". `src/lib/platform-auth.config.ts` +
  `platform-auth.ts` espelham `auth.config.ts`/`auth.ts`, mas com cookie
  próprio (`tibe-platform-session`) e secret próprio (`PLATFORM_AUTH_SECRET`,
  nunca reusar `NEXTAUTH_SECRET`) montados em `/api/platform-auth/[...nextauth]`.
  Isso faz a separação tenant↔plataforma ser estrutural (cookies diferentes,
  cada instância só enxerga o próprio) em vez de depender de uma checagem de
  código que alguém pode esquecer de replicar num endpoint novo.
- **⚠️ `next-auth` (não o `@auth/core` cru) assume `basePath: "/api/auth"`
  por padrão** quando `NEXTAUTH_URL`/`AUTH_URL` não tem path — uma instância
  secundária montada em qualquer outro caminho (`/api/platform-auth/*` aqui)
  **precisa** declarar `basePath` explicitamente na config, senão todo
  request quebra com `UnknownAction: Cannot parse action`. Isso custou uma
  depuração real neste módulo (`grep basePath` em
  `node_modules/next-auth/lib/env.js` se precisar reconfirmar o mecanismo).
- **Middleware**: `/plataforma` está em `PUBLIC_PREFIXES` de `auth.config.ts`
  (isento da checagem de sessão de TENANT) — a proteção de verdade é manual,
  dentro do próprio `middleware.ts`, usando `getToken({ req, secret:
  PLATFORM_AUTH_SECRET, cookieName: "tibe-platform-session" })` (de
  `next-auth/jwt`, não a instância `auth()` da plataforma — `getToken` é a
  primitiva de baixo nível que não depende de estar dentro do HOF
  `auth(callback)`, ao contrário de chamar `auth()` "cru" de uma segunda
  instância dentro do middleware da primeira, que não é um padrão
  documentado/confiável). Testado ponta a ponta (login, acesso, logout, e as
  duas direções de isolamento cross-sessão) via curl com o dance de CSRF do
  NextAuth — ver histórico da sessão se precisar repetir.
- **`guardPlatform(opts?: { requireMasterAdmin? })`** (`src/lib/platform-guard.ts`)
  espelha `guard()`. `equipe` lê tenants (6.3); só `master_admin` vê KPIs
  financeiros (6.4-6.7) e executa as duas ações administrativas (forçar
  status 6.9, gerenciar equipe 6.10) — recorte de permissão decidido com o
  usuário, não estava 100% explícito na spec (PRD §5.3 delegava a decisão
  para este módulo).
- **`SubscriptionStatusLog`** (novo modelo): toda transição de
  `Subscription.status` grava uma linha aqui —
  `logSubscriptionStatusChange()` em `src/lib/platform/subscription-log.ts`,
  chamada tanto pelo webhook do Asaas quanto por `subscribeAction`/
  `cancelSubscriptionAction` (M5, automático, `changed_by_platform_user_id`
  nulo) quanto por `forceSubscriptionStatusAction` (M6, manual, com o
  `PlatformUser` responsável e `reason`). Existe porque **não tinha como
  calcular churn/funil corretamente sem isso** — `Subscription` não guardava
  nenhum timestamp de transição (só `created_at`), então "cancelamentos no
  período" e "tempo médio de conversão trial→pago" eram impossíveis de
  responder. Um único mecanismo resolve isso E serve de log de auditoria
  para a 6.9 — decisão tomada com o usuário em vez de assumida.
- **`lib/platform/kpis.ts`**: `calculateMRR` soma `PLAN_PRICES` (preço atual)
  das assinaturas `active` — não há histórico de preço por assinatura, então
  "valor do plano vigente" só pode significar o preço de hoje, inclusive
  retroativo no gráfico de evolução (limitação aceita). `getStatusAsOf(date)`
  reconstrói o status de cada assinatura numa data (o log mais recente com
  `created_at <= date`) — é a peça que sustenta `calculateChurn` (ativos no
  início do período), `calculateMrrTrend` (MRR real mês a mês, não a
  aproximação mais simples que a spec sugeria) e `calculateFunnel` (tempo até
  a primeira ativação). `calculateLTV` devolve `null` (não `Infinity`) quando
  não há churn observado ainda — divisão por zero evitada explicitamente.
- **Captura de UTM** (`src/lib/utm.ts`, `UtmCapture` renderizado dentro de
  `PublicNav`): first-touch via cookie (`tibe_utm`, 30 dias) — só grava se o
  cookie ainda não existir, porque sem isso a origem real de um lead que
  navega `/` → `/planos` → `/criar-conta` seria perdida (a última página
  raramente carrega os mesmos query params da primeira). `/criar-conta` lê o
  cookie no submit e manda para `POST /api/v1/signup`, que persiste em
  `Tenant.lead_source_utm_*` (campos já existiam desde o M0, nunca eram
  preenchidos antes deste módulo).
- Testes (`npm run test:m6`) rodam contra `lib/platform/kpis.ts` e as actions
  diretamente (mesmo motivo dos M1/M2/M5: rotas atrás de `guardPlatform()`
  não dá para invocar direto sem uma sessão de verdade). Como as funções de
  KPI escaneiam **todos** os tenants do banco por desenho, os testes usam
  baseline antes/depois (não contagem absoluta) para não quebrar num banco
  de dev com dados de outros testes/seed.
- **Seed do `master_admin`**: ainda não adicionado a `prisma/seed.ts` —
  precisa de nome/email/senha reais do responsável (Dilton), não inventados.
  Pendente até essa informação chegar.

---

## Memória de longo prazo (Claude Code, específico desta ferramenta)

Além deste arquivo (versionado, visível a qualquer sessão/ferramenta/humano),
existe um sistema de memória **local à máquina**, fora do repositório, em
`C:\Users\dilto\.claude\projects\d--Projetos-Web-agrogestao-tibe\memory\`
(`MEMORY.md` é o índice). Ele guarda decisões e contexto de sessões passadas
do Claude Code especificamente — **não é visível** para outras ferramentas,
outros agentes, nem para quem só olha o repositório. Trate este `CLAUDE.md`
como a fonte que deve funcionar sozinha; a memória é um complemento, não uma
dependência.

## Comandos úteis

```powershell
npm run dev              # servidor de desenvolvimento
npm run build             # build de produção (roda lint + tsc também)
npm run db:migrate        # cria/aplica migração em dev (interativo — evite em automação)
npm run db:deploy         # aplica migrações pendentes (não-interativo)
npm run db:seed           # seed (tenant Da Mata + owner + vacinas padrão)
npm run db:check          # valida conexão com o banco
npm run auth:check        # valida credencial do seed (bcrypt)
npm run test:isolation    # M0
npm run test:m1           # M1
npm run test:m2           # M2
npm run test:m3           # M3
npm run test:m4           # M4
npm run test:m5           # M5
npm run test:m6           # M6
```

Credenciais do seed (dev): `owner@damata.com.br` / `tibe123`.
