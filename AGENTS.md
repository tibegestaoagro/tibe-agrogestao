# Tibé (AgroGestão) — guia para agentes de código

SaaS multi-tenant de gestão agropecuária (rebanho, lavoura, prestação de
serviço, financeiro) com um agente de IA no WhatsApp como canal primário de
interação do produtor rural. Cliente/financiador do MVP: Da Mata Sementes
LTDA. Desenvolvido pela Pleno Digital.

**Leia primeiro:** [docs/tibe-prd.md](docs/tibe-prd.md) (PRD completo, v1.1) e
a spec do módulo relevante em `docs/specs/module-XX-*.md`. Este arquivo é um
resumo operacional da arquitetura — o PRD é a fonte de verdade para modelo de
dados, contratos de API e regras de produto.

---

## Regras de trabalho deste projeto

1. O projeto é entregue **módulo por módulo** (specs em `docs/specs/`), na
   ordem das fases do contrato. Não pule módulos nem misture escopo de um
   módulo futuro no atual sem necessidade comprovada.
2. **Nunca assuma silenciosamente** uma decisão de produto ou arquitetura que
   a spec não resolve — pergunte antes de implementar. Extensões *aditivas* a
   um contrato de API (campos novos que não quebram nada existente) são
   aceitáveis se documentadas no código/commit; mudanças de comportamento ou
   de modelo de dados não são.
3. Todo modelo que carrega `tenant_id` **deve** passar pelo client Prisma
   escopado por tenant — nunca construa o filtro de tenant manualmente numa
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
| 3 | Agente WhatsApp | ✅ código do Tibé pronto — infra externa (N8N/Meta/Salvy) ainda não provisionada; guia em [docs/n8n-whatsapp-workflow.md](docs/n8n-whatsapp-workflow.md) |
| 4 | Financeiro e Alertas | ✅ completo — Redis/BullMQ real; PDF via link assinado (sem R2); envio WhatsApp aguarda N8N |
| 5 | Painel Web, Cobrança (Asaas) e Site | ⏳ não iniciado |
| 6 | Painel da Plataforma (`PlatformUser`, uso interno) | ⏳ não iniciado |

---

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma 7 (PostgreSQL 17,
Neon) · NextAuth v5 beta (Credentials) · Zod · Recharts. UI kit no estilo
shadcn/ui, construído à mão (ver seção UI). BullMQ/Redis, N8N, Cloudflare R2 e
Asaas estão no PRD mas ainda não foram integrados ao código — entram nos
módulos 4-6.

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
npm run db:deploy   # prisma migrate deploy — não-interativo, idempotente
```

Aplique primeiro no banco local, rode os testes, só então replique no Neon
(use a connection string **Direct**, sem `-pooler`, para migrar — a **Pooled**
é a usada em runtime).

### Redis (BullMQ) já provisionado (Redis Cloud) — sem instância local separada

O `.env` local aponta para a mesma instância Redis Cloud de produção (uso é só
fila/lock de job, dado efêmero, sem risco de negócio). BullMQ empacota sua
própria cópia de `ioredis` — não passe a instância de `getRedisConnection()`
(`src/lib/redis.ts`) direto para `new Queue()`/`new Worker()` (erro de tipo,
duas classes `Redis` nominalmente diferentes); use
`getRedisConnectionOptions()` para construtores do BullMQ.

### Sessão autenticada via `next start` local não é confiável para testar páginas

Páginas protegidas redirecionam para `/login` mesmo com cookie de sessão
válido quando testadas via `next start` + cookie jar externo — o Edge
Middleware não reconhece a sessão nesse setup específico (rotas `/api/v1/*`,
Node runtime, funcionam normalmente com a mesma sessão). Não é regressão de
nenhum módulo (páginas antigas têm o mesmo comportamento); produção nunca
apresentou o problema em uso real de navegador. Para validar página
autenticada, use `next dev` com navegador real ou a URL de produção.

---

## Isolamento multi-tenant

`tenant_id` nunca é recebido do client — é sempre resolvido no servidor a
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
`scoped(data)` só resolve o tipo TypeScript exigido pelo Prisma no `create` —
o valor real de `tenant_id` é sempre injetado pela extension em runtime; nunca
passe um `tenant_id` de verdade dentro de `scoped(...)`.

Todos os modelos de negócio têm `tenant_id`, inclusive os que no desenho
original seriam "filhos" sem essa coluna (`AnimalWeightLog`,
`AnimalVaccination`, `AnimalMovement`, `CropCycle`, `PlotInput`) — decisão
deliberada de defense-in-depth.

O client Prisma **base** (sem escopo) só é apropriado em: autenticação (lookup
de email global), seed, scripts internos, o lookup cross-tenant de
`POST /api/internal/whatsapp/resolve-contact` (achar a qual tenant um
telefone pertence), e o job diário de alertas (`generateAllAlerts`/
`deliverAllPendingAlerts` em `src/lib/actions/alerts.ts` e
`alert-delivery.ts`), que precisa listar todos os tenants ativos antes de
escopar por tenant. Qualquer outro uso do client base é suspeito.

Testes de isolamento (rodar contra o banco local, `tsx`, chamando os route
handlers diretamente):

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"
npm run test:isolation   # base (Módulo 0)
npm run test:m1          # Rebanho/Lavoura
npm run test:m2          # Prestador
npm run test:m3          # Agente WhatsApp
npm run test:m4          # Financeiro e Alertas
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
- Não existem rotas `/api/webhooks/*` ainda — o webhook do WhatsApp é recebido
  pelo N8N, não pelo Tibé (ver arquitetura do agente abaixo).

## Lógica de negócio: `src/lib/actions/*`

Toda regra de negócio vive em funções de "action" (`src/lib/actions/*.ts`),
não dentro dos route handlers. As rotas HTTP validam a entrada, chamam a
action, e serializam a resposta; o agente WhatsApp chama as mesmas actions
diretamente. Ao alterar uma regra de negócio, mude na action correspondente —
não duplique lógica na rota.

```ts
type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string; status: number };
```

Lançamentos financeiros automáticos (venda de animal, insumo com custo, ordem
de serviço faturada...) sempre passam por `createLinkedEntry()`
(`src/lib/financial.ts`).

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
tenant). `middleware.ts` deixa `/api/*` fora da checagem de sessão — cada
handler de API faz a própria autenticação e devolve `401` JSON quando
necessário, em vez de redirecionar.

## Roles e permissões

`UserRole`: `OWNER | ADMIN | OPERADOR | VISUALIZADOR`. Matriz de acesso por
módulo em `src/lib/permissions.ts` (espelha PRD §5.2). `canAccess`/`canWrite`
recebem a role diretamente, sem depender de sessão HTTP — usadas tanto nas
rotas web quanto no roteamento de intenções do agente WhatsApp.

## UI

Sem design system de terceiros instalado via CLI (o instalador do shadcn/ui é
interativo e não roda em ambientes não-interativos). Os componentes em
`src/components/ui/` foram escritos à mão no estilo shadcn (Radix UI +
`class-variance-authority` + `tailwind-merge`), com `components.json`
configurado. Gráficos: Recharts v3. Cores da marca em `tailwind.config.ts`.

---

## Signup público (`/planos` + `/criar-conta`) — fora do escopo original do PRD

O PRD §12 marca onboarding self-service completo como fora do MVP (v1.1), mas
existe um fluxo de signup público real (não é mockup): `/planos` (preços
ilustrativos, sem cobrança real) → `/criar-conta` (formulário completo) →
`POST /api/v1/signup` (única rota `/api/v1` que roda sem sessão) cria
`Tenant` (status trial, plan = card escolhido) + `User` (OWNER) de verdade,
com login automático em seguida. Sem rate limiting (sem fila/Redis
conectados) — aceitável para testes controlados, revisar antes de expor
publicamente. Construído para permitir testes do painel antes dos módulos
4-6 existirem; provavelmente será revisto quando o Módulo 5 (Asaas) definir
o fluxo de contratação real.

## O agente WhatsApp (Módulo 3)

Arquitetura: **Meta → N8N → Tibé → N8N → Meta**. O Tibé nunca fala direto com
a Meta Cloud API — o N8N é o único intermediário, e a classificação de
intenção por LLM acontece dentro do N8N (a chave do provedor de LLM fica nas
credenciais do N8N, não no ambiente do Tibé).

- `POST /api/internal/whatsapp/resolve-contact` — identifica tenant/usuário
  pelo telefone.
- `POST /api/internal/whatsapp/execute-action` — roteia 9 intenções
  (`src/lib/whatsapp-intents.ts`) para as actions de negócio, com checagem de
  permissão por role/perfil e confirmação obrigatória acima de R$ 5.000 para
  ações financeiras relevantes (`src/lib/actions/whatsapp-router.ts`).
- `gerar_relatorio` (tipo `financeiro`) devolve um `report_url` de verdade
  (ver Módulo 4); outros tipos ainda respondem "não disponível".
- Guia de integração completo (nó a nó do workflow N8N, incluindo envio de
  alertas do Módulo 4): [docs/n8n-whatsapp-workflow.md](docs/n8n-whatsapp-workflow.md).

## Financeiro e Alertas (Módulo 4)

- Lançamentos manuais (`src/lib/actions/financial-entries.ts`) sempre nascem
  `related_module: geral`; só esses podem ser editados via `PATCH` (editar um
  lançamento de outro módulo é bloqueado — descolaria do dado de origem).
  "Marcar como pago" funciona em qualquer lançamento.
- Regime contábil: DRE = **competência** (todos os lançamentos do período por
  `due_date`); fluxo de caixa = **caixa** (só `status: paid`, por `paid_at`).
  `src/lib/actions/financial-reports.ts`.
- PDF (`src/lib/reports/generate-financial-pdf.ts`, pdf-lib) gerado sob
  demanda atrás de um link assinado por HMAC com expiração
  (`src/lib/reports/report-token.ts`) — sem Cloudflare R2 (não provisionado);
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
  Módulo 3 — outbound para `N8N_ALERT_WEBHOOK_URL`; sem configurar, fica
  `pending` sem quebrar.

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
```

Credenciais do seed (dev): `owner@damata.com.br` / `tibe123`.
