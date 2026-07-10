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
| 5 | Painel Web, Cobrança (Asaas) e Site | ⏳ não iniciado |
| 6 | Painel da Plataforma (`PlatformUser`, interno Pleno) | ⏳ não iniciado |

Specs: `docs/specs/module-00-setup.md` … `module-06-painel-plataforma.md`.

---

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Prisma 7 · PostgreSQL 17
(Neon) · NextAuth v5 beta (Credentials) · Zod · Recharts · UI kit shadcn-style
feito à mão (ver seção UI). BullMQ/Redis, N8N, Cloudflare R2 e Asaas fazem
parte do PRD mas **ainda não foram integrados** no código (entram nos módulos
4-6).

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
  e o job diário de alertas (`generateAllAlerts`/`deliverAllPendingAlerts` em
  `src/lib/actions/alerts.ts` e `alert-delivery.ts`) — que precisa **listar
  todos os tenants ativos** antes de escopar por tenant a cada iteração.
  Qualquer uso novo do client base fora desses casos é suspeito — pare e
  pergunte.
- `PlatformUser` (Módulo 6, ainda não implementado) será a **outra** exceção
  intencional — nunca deve ser alcançável a partir de uma sessão de tenant.

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
- Rotas de webhook (`/api/webhooks/*`) seguem a mesma ideia (secret no
  header), mas **nenhuma existe ainda** — o webhook do WhatsApp vai para o
  N8N, não para o Tibé (ver seção do agente abaixo).

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
`properties.ts`, `financial-summary.ts`. Lançamentos financeiros automáticos
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

- `/planos` — cards de preço **ilustrativos** (sem Asaas), cada um linkando
  para `/criar-conta?plan=campo|fazenda|grupo`.
- `/criar-conta` — formulário completo (empresa, CNPJ/CPF, telefone,
  responsável, email, senha) → `POST /api/v1/signup` (única rota `/api/v1`
  que roda **sem sessão**, por natureza — ainda não existe usuário). Cria
  `Tenant` (status **trial**, `plan` = o card clicado) + `User` (role
  `OWNER`) de verdade, com checagem de documento/email duplicado. O client
  faz login automático (`signIn` do NextAuth) logo em seguida e manda para
  `/dashboard`, que redireciona ao onboarding existente (sem `TenantProfile`
  ainda).
- **Sem rate limiting** (não há fila/Redis conectado) — gap conhecido,
  aceitável para uso controlado de testes, mas revisar antes de divulgar
  publicamente.
- Se o Módulo 5 (Asaas) redesenhar o fluxo de contratação de verdade, este
  fluxo provavelmente precisa ser revisto/substituído — não é a versão final.

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
```

Credenciais do seed (dev): `owner@damata.com.br` / `tibe123`.
