# Tibé (AgroGestão): contexto para Claude Code

SaaS multi-tenant de gestão agropecuária (rebanho, lavoura, prestação de serviço,
financeiro) com agente de IA no WhatsApp como canal primário. Cliente/financiador
do MVP: Da Mata Sementes LTDA. Desenvolvido pela Pleno Digital.

**Leia primeiro:** [docs/tibe-prd.md](docs/tibe-prd.md) (PRD completo, v1.1) e a
spec do módulo em que for trabalhar em `docs/specs/module-XX-*.md`. Este arquivo
é um resumo operacional: o PRD é a fonte de verdade para modelo de dados,
contratos e regras de produto.

**Continuidade entre dispositivos:** depois deste arquivo, leia
[docs/agents/current-handoff.md](docs/agents/current-handoff.md). O trabalho
acontece em mais de uma máquina (desktop e notebook, conforme o usuário está
ou não no escritório): o handoff é o que permite pausar numa e retomar na
outra sem perder o fio. Não existe mais coordenação multi-agente (Codex foi
descontinuado, 2026-08-04): é só Claude Code, em dispositivos diferentes. O
estado registrado nele prevalece sobre notas antigas.

---

## Invariantes: as 8 regras que nunca podem ser quebradas

Se você só ler uma parte deste arquivo, leia esta. Cada linha aqui já foi
violada por engano em alguma sessão, e cada violação custou caro. O resto do
arquivo explica o porquê; isto é o resumo operacional.

1. **`tenant_id` nunca vem do client.** Toda query de negócio usa o client
   escopado (`getTenantDb()` / `prismaForTenant()`), nunca filtro manual. Todo
   model novo com `tenant_id` entra em `TENANT_SCOPED_MODELS`, e
   `npm run test:isolation` reprova se esquecer.
2. **O saldo do rebanho nunca é gravado** (Módulo 30): é a soma das
   movimentações. Se você se pegar escrevendo um campo de quantidade, pare.
3. **Migração ANTES do push**, sempre que o commit mexer em schema. A Vercel
   faz deploy automático e o build **não** roda migração: código e schema saem
   dessincronizados por padrão e nada avisa. Confira com
   `npx prisma migrate status` apontando pro Neon.
4. **Nunca use travessão (—) em código, documentação ou mensagem de commit.**
   Verifique com `grep -naP "\xe2\x80\x94"` antes de commitar.
5. **Nunca escreva conteúdo com escape (regex, `\n`, `\\`) por heredoc no
   shell:** este ambiente corrompe a sequência silenciosamente, e o sintoma
   parece bug de regra de negócio. Use as ferramentas Edit/Write.
6. **Regra de negócio vive em `src/lib/actions/*`**, nunca no route handler.
   As rotas são wrappers finos; o agente WhatsApp chama as mesmas actions.
7. **Merge na `main`, push para a `main` e deploy exigem aprovação explícita
   do usuário, a cada vez.** Commit e push de branch de trabalho são livres.
8. **Teste automatizado verde não é validação.** Vários defeitos reais deste
   projeto só apareceram em navegador ou aparelho de verdade, com `tsc`,
   `lint` e a suíte inteira limpos. Ver a seção de validação ao vivo.

## Retomando depois de um resumo de contexto

Sessões longas passam por resumo automático, e o detalhe literal se perde. O
que sobrevive é o que está em arquivo. Ao retomar, nesta ordem:

1. Este arquivo (invariantes + a seção da área em que for mexer).
2. [docs/agents/current-handoff.md](docs/agents/current-handoff.md): estado
   operacional, branches vivas e o próximo passo exato. **Se divergir daqui,
   o handoff vence**, porque é atualizado a cada rodada.
3. `git log --oneline -15` e a spec do módulo em `docs/specs/`.

Não confie na memória local do Claude Code para estado: ela é invisível para
outras ferramentas e envelhece sem aviso. Ela serve para preferência do
usuário e armadilha de ambiente, não para "onde o projeto está".

## Como este projeto é conduzido (não pule isso)

Este projeto é dividido em módulos, entregues **um de cada vez**, seguindo a
fase do contrato. O usuário (Dilton) segue este protocolo com qualquer agente:

1. **Antes de codificar um módulo**, leia a spec inteira e devolva um resumo
   curto confirmando o objetivo + **toda ambiguidade ou inconsistência
   encontrada**. Nunca assuma em silêncio: pergunte. Use `AskUserQuestion`
   para decisões de produto/arquitetura que a spec não resolve.
2. **Implemente task por task**, na ordem da spec.
3. **Siga os contratos de API literalmente** (nomes de campo, tipos, formato de
   sucesso/erro). Extensões aditivas ao contrato (campos novos que não quebram
   o que já existe) são aceitáveis se documentadas: mas produto/arquitetura
   novos exigem pergunta antes.
4. **Todo modelo com `tenant_id`** passa pelo client Prisma escopado
   (`getTenantDb()` / `prismaForTenant()`), nunca filtro manual: ver seção de
   isolamento abaixo.
5. **Ao final de cada módulo**, rode os critérios de aceitação da spec (com
   testes automatizados sempre que possível) e reporte o que passou/faltou
   *antes* do usuário validar manualmente.
6. **Não avance para o próximo módulo sem aprovação explícita do usuário.**
7. **Toda tarefa concluída recebe commit automático** na branch de trabalho,
   sem nova autorização. Inclua apenas escopo concluído e validado; não marque
   trabalho parcial ou com falha conhecida como concluído.
8. **O push da branch de trabalho é permitido** para preservar e compartilhar
   o commit. Merge na `main`, push direto para a `main` e deploy continuam
   exigindo aprovação explícita do usuário.
9. **Ao encerrar uma rodada significativa**, atualize
   `docs/agents/current-handoff.md` antes da resposta final: é o que permite
   retomar numa outra máquina sem perder o fio (não mais coordenação
   multi-agente). Registre somente fatos verificados: estado, escopo, testes,
   commit/deploy, pendências e próximo passo autorizado. Mantenha o handoff
   curto e não copie a conversa.

## Status dos módulos

| # | Módulo | Status |
|---|--------|--------|
| 0 | Setup, schema multi-tenant, auth, isolamento | ✅ em produção |
| 1 | Rebanho e Lavoura | ✅ em produção |
| 2 | Prestador de Serviço | ✅ em produção |
| 3 | Agente WhatsApp | ✅ **em produção e provisionado** (2026-07-30): workflow "Tibe - Atendimento WhatsApp (Evolution)" ativo no n8n (Railway, 27 nós, execuções reais com sucesso), Evolution como provider. Guia: [docs/n8n-whatsapp-workflow.md](docs/n8n-whatsapp-workflow.md) |
| 4 | Financeiro e Alertas | ✅ completo: Redis/BullMQ real; PDF via link assinado (sem R2); alerta sai por WhatsApp (direto pelo provider ativo, sem N8N) e email |
| 5 | Painel Web, Cobrança (Asaas) e Site | ✅ completo: Asaas real (código pronto, sem chave de sandbox testada ainda); dashboard consolidado, usuários, cobrança/bloqueio por inadimplência, site público (`/`, `/planos`, `/faq`, `/politicas/*`), documentação técnica em `/docs`, README/CONTRIBUTING |
| 6 | Painel da Plataforma (`PlatformUser`, interno Pleno) | ✅ completo: auth separada (`/plataforma`), MRR/churn/LTV/funil, gestão de tenants e equipe |
| 19 | Cadastro público verificado (WhatsApp + email) | ✅ implementado local: `PendingSignup`, 4 etapas, senha temporária, sessão de 7 dias |
| 17 | Agenda com custo (agente WhatsApp) | ✅ em produção: agenda real, previsão financeira e conciliação sem duplicidade; sem mudança de schema |
| 26 | Máquinas e equipamentos | ✅ em produção (`test:m27`) |
| 27 | Meu Dia (tarefas) | ✅ em produção (`test:m28`) |
| 28 | Ajustes financeiros e dashboard | ✅ em produção (`test:m29`) |
| 29 | Minha Fazenda (fazenda + pastos) | ✅ em produção: `Property.city/district`, model `Pasture`, tela `/minha-fazenda`. V1 web only, sem WhatsApp |
| 30 | **Rebanho como livro-razão** | 🚧 **em andamento**, branch `rebanho-livro-razao`: tarefas 1-2 de 6 |
| 31 | **Negociações** (compra/venda de gado, contatos) | 🚧 **em andamento**, branch `negociacoes`: missão 1 de 4, sem merge. `test:m35` + `test:m36` |

⚠️ **A numeração de módulo NÃO bate com a de teste.** `test:mNN` é um contador
de SUÍTES que descolou do número do módulo por volta do `m25`: o Módulo 26
(Máquinas) é testado por `test:m27`, e o Módulo 30 por `test:m32`. Renumerar
colidiria. Ao criar suíte nova, use o próximo número livre e deixe o texto
impresso apontando o módulo real.

Também existem suítes sem módulo próprio na tabela, de recursos entregues
dentro de outros módulos: `m20` (buffer de mensagens picadas), `m21`
(cadastro assistido de animais), `m22` (fluxo de integração), `m23` (auth por
token para o app), `m24` (notificações), `m26` (calculadora pecuária).

Specs: `docs/specs/module-00-setup.md` … `module-30-rebanho-livro-razao.md`.

---

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Prisma 7 · PostgreSQL 17
(Neon) · NextAuth v5 beta (**duas instâncias**: tenant e plataforma, M6) ·
Zod · Recharts · UI kit shadcn-style feito à mão (ver seção UI) · Redis Cloud
+ BullMQ (M4) · Asaas (M5, cobrança recorrente) · nodemailer (Gmail SMTP) +
Resend (canal de email, fora do PRD original: ver seção Email). N8N é infra
externa **já provisionada e no ar** (Railway): orquestra o agente WhatsApp,
não roda dentro do Tibé, e por isso não aparece no `package.json`. Cloudflare
R2 continua no PRD mas nunca chegou a ser necessário: PDFs são gerados sob
demanda, sem storage (ver Módulo 4).

## Deploy e infra

- **App:** https://tibe-agrogestao.vercel.app (Vercel, deploy automático em
  push na `main`).
- **Repo:** `https://github.com/tibegestaoagro/tibe-agrogestao.git`: conta
  dona é `tibegestaoagro`; `dilton-pleno` é colaborador com Write.
- **Banco de produção:** Neon (`tibe-agrogestao` / `neondb`). O `.env` local
  do projeto **aponta para o Neon por padrão**: veja o aviso de dev abaixo.
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
produção: e confirme com o usuário antes, é uma ação de alto impacto.

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
replique no Neon (com a URL **Direct**, sem `-pooler`, para migrar: a
**Pooled**, com `-pooler`, é a usada em runtime/`DATABASE_URL` da Vercel).

⚠️ O índice parcial `WhatsAppProviderConfig_one_active` (`WHERE "active"`,
M7) não é representável no `schema.prisma`: todo `migrate diff` futuro vai
sugerir um `DROP INDEX` dele como "drift". **Não aplique esse drop**; remova
a linha do SQL gerado antes de salvar a migração.

### Redis (BullMQ) já está provisionado (Redis Cloud)

Diferente do Postgres, o `REDIS_URL` no `.env` local aponta para a **mesma**
instância Redis Cloud usada em produção: não há um Redis local separado.
Isso é aceitável porque o uso é só fila/lock de job (dado efêmero, sem risco
de negócio). BullMQ empacota sua própria cópia de `ioredis` internamente:
**nunca** passe a instância de `getRedisConnection()` (`src/lib/redis.ts`)
direto para `new Queue()`/`new Worker()`, dá erro de tipo (duas classes
`Redis` estruturalmente iguais, nominalmente diferentes). Use
`getRedisConnectionOptions()` (host/porta/senha crus) para qualquer construtor
do BullMQ.

### ⚠️ Testar sessão autenticada localmente via `next start` não funciona

Páginas protegidas (`/dashboard`, `/financeiro`, etc.) redirecionam para
`/login` mesmo com um cookie de sessão válido quando testadas via `next
start` local + cookie jar (ex: PowerShell `WebRequestSession`): o Edge
Middleware não reconhece a sessão nesse setup específico, mesmo com
`AUTH_TRUST_HOST=true`. **Rotas `/api/v1/*` (Node runtime) funcionam
normalmente** com a mesma sessão: só o Middleware (Edge) tem esse problema
localmente. Confirmado que não é regressão de nenhum módulo (páginas antigas
como `/dashboard` têm o mesmo comportamento). A produção (Vercel) nunca
apresentou esse problema em testes reais de navegador. Não vale a pena
investigar mais fundo: para validar fluxo de página autenticada, use o
navegador real (local `next dev` ou a URL da Vercel), não `next start` +
cookie jar.

---

## Isolamento multi-tenant (a regra mais importante do projeto)

`tenant_id` **nunca** vem do client: é sempre resolvido da sessão NextAuth no
servidor. Toda query de negócio usa o client Prisma **escopado**:

```ts
import { getTenantDb } from "@/lib/tenant-context";
import { scoped } from "@/lib/prisma";

const db = await getTenantDb();                 // dentro de rota/Server Component autenticado
await db.animal.findMany();                      // tenant_id injetado automaticamente
await db.animal.create({ data: scoped({ ear_tag: "001", property_id }) });
```

Implementação: `src/lib/prisma.ts`: uma **Prisma Client Extension**
(`buildTenantClient`) injeta `tenant_id` em toda operação dos modelos listados
em `TENANT_SCOPED_MODELS`. `prismaForTenant(tenantId)` devolve o client
escopado (cacheado por tenant); `getTenantDb()` (em `tenant-context.ts`) resolve
o tenant da sessão e chama `prismaForTenant`.

- `scoped(data)` é um helper de tipos: satisfaz o `tenant_id` exigido pelo
  Prisma Client no `create` **sem** você passar o valor manualmente: a
  extension injeta o valor real em runtime. **Nunca** passe `tenant_id` de
  verdade num `scoped(...)`: isso violaria o próprio propósito do helper.
- **Todos** os modelos de negócio (inclusive os que antes eram "filhos" sem
  `tenant_id` no PRD original: `AnimalWeightLog`, `AnimalVaccination`,
  `AnimalMovement`, `CropCycle`, `PlotInput`) **têm** `tenant_id` e estão em
  `TENANT_SCOPED_MODELS`. Isso foi uma decisão deliberada de defense-in-depth
  (desvio do PRD, aprovado pelo usuário): não remova.
- O client **base** (`prisma`, sem escopo) só deve ser usado em: login
  (`auth.ts`, lookup de email global), `prisma/seed.ts`, scripts internos, o
  lookup cross-tenant de `POST /api/internal/whatsapp/resolve-contact`
  (precisa achar a qual tenant um telefone pertence, antes de saber o tenant),
  o job diário de alertas (`generateAllAlerts`/`deliverAllPendingAlerts` em
  `src/lib/actions/alerts.ts` e `alert-delivery.ts`): que precisa **listar
  todos os tenants ativos** antes de escopar por tenant a cada iteração, e
  `POST /api/webhooks/asaas` (M5), que localiza a `Subscription` pelo
  `asaas_subscription_id` porque o Asaas não manda sessão de tenant nenhuma,
  `getBillingAccess()` (`src/lib/billing-access.ts`): sempre chamada com um
  `tenantId` já resolvido da sessão pelo caller (nunca de input do client),
  e `inviteUserAction` (`src/lib/actions/users.ts`): checagem de duplicidade
  de `User.email`, que é **globalmente único** (não dá pra checar isso com o
  client escopado; só devolve 409 genérico, não vaza dado de outro tenant),
  `PendingSignup` (Módulo 19): cadastro público em andamento, criado ANTES de
  o tenant existir (é esse o ponto do módulo), lido sempre pelo `id` da
  própria linha, entregue ao navegador por cookie httpOnly,
  `WhatsAppProviderConfig` (spec 2026-07-11): config GLOBAL de plataforma
  (rotas master_admin + `sendWhatsAppMessage`), mesma categoria estrutural de
  `PlatformUser`, fora de `TENANT_SCOPED_MODELS`,
  e `createTenantManuallyAction` (`src/lib/actions/platform-tenants.ts`,
  spec 2026-07-24): usa `prisma.tenant.findUnique/create` e
  `prisma.user.findUnique` para checar duplicidade de documento/email antes
  do tenant existir, mesma necessidade estrutural do `/api/v1/signup`.
  Mesma categoria: `requestPasswordResetAction`/`verifyPasswordResetCodeAction`
  (`src/lib/actions/password-reset.ts`, spec 2026-07-29) resolvem o `User`
  pelo email antes de saber o tenant (login sem sessão, por natureza), e
  `confirmPasswordResetAction` resolve o `PasswordResetCode` pelo próprio
  `id` (`rid`) antes de saber o tenant, pelo mesmo motivo.
  Qualquer uso novo do client base fora desses casos é suspeito: pare e
  pergunte.
- `PlatformUser` e `SubscriptionStatusLog` (Módulo 6) são a **outra** exceção
  estrutural: nenhum dos dois está em `TENANT_SCOPED_MODELS` (não fazem
  sentido escopados por tenant: `PlatformUser` não pertence a tenant algum,
  `SubscriptionStatusLog` só é lido por rotas de plataforma via
  `tenant_id` explícito quando precisa filtrar por tenant). `PlatformUser`
  nunca deve ser alcançável a partir de uma sessão de tenant: e o inverso
  também: ver seção "Painel da Plataforma" abaixo para como isso é garantido
  (duas instâncias NextAuth com cookies diferentes, não uma checagem de role).

Todo módulo que adiciona endpoints ganha um teste de isolamento automatizado
(`scripts/*.test.ts`, rodados via `tsx`, chamando os route handlers
diretamente com um `Request` construído). Rode sempre antes de reportar um
módulo como concluído:

⚠️ **O `mNN` de `test:mNN` é um contador de SUÍTES, não o número do módulo**
(esclarecido na auditoria de 2026-08-04, depois de parecer um bug). Os dois
coincidiram até por volta do `m25` e depois descolaram: `test:m26` é a
calculadora pecuária, enquanto o *Módulo 26* das specs é Máquinas, testado
por `test:m27`. Por isso vários scripts imprimem um número diferente do que
está no próprio nome do arquivo: o texto impresso é que segue a spec, e está
certo. Renumerar não resolve (colide: já existe um `m26`). Ao criar uma suíte
nova, use o próximo número livre da sequência e deixe o texto impresso
apontando o módulo real.

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"
npm run test:isolation   # M0: isolamento genérico
npm run test:m1          # M1: Rebanho/Lavoura + isolamento dos "filhos"
npm run test:m2          # M2: Prestador + total_value persistido
npm run test:m3          # M3: WhatsApp: permissão por role/perfil, confirmação, isolamento
npm run test:m4          # M4: Financeiro/Alertas + idempotência + cron
npm run test:m5          # M5: billing-access, webhook Asaas, usuários, trial_ending
npm run test:m6          # M6: MRR/churn/LTV/funil, isolamento PlatformUser, força de status
npm run test:m7          # M7: provider WhatsApp configurável (crypto, config, envio)
npm run test:m9          # M9: Evolution client (QR)
npm run test:m10         # M10: criação manual de tenant + troca de senha
npm run test:m11         # M11: registrar_lancamento_financeiro (recibo por mídia)
npm run test:m12         # M12: ajuda e resumo (agente WhatsApp)
npm run test:m13         # M13: seam de gate de sessão (session-gate.ts)
npm run test:m14         # M14: platform-tenants.ts (update/archive/reenvio de boas-vindas)
npm run test:m15         # M15: canal de email (falha graciosa, EmailLog, quem recebe)
npm run test:m16         # M16: recuperação de senha (código, rate limit, senha forte)
npm run test:m17         # M17: agenda com custo, conciliação e alertas
npm run test:m18         # Limite de assentos por plano
npm run test:m19         # Cadastro público verificado (4 etapas)
npm run test:m30         # Rebanho por categoria (modelo único, brinco opcional)
npm run test:m31         # Cancelamento: janela de arquivamento de 60 dias
```

---

## Padrões de API

- Sucesso: `{ data, meta }`. Erro: `{ error: { code, message } }`. Helpers em
  `src/lib/api.ts` (`apiOk`, `apiError`, `ApiErrors`).
- Rotas de negócio (`/api/v1/*`) autenticam por **sessão**: use o guard
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
  por sessão: `src/lib/internal-guard.ts` (`requireInternalSecret`). Dentro
  delas, a *role* do usuário é sempre **relida do banco** a partir de
  `user_id`+`tenant_id`; nunca confie em role vinda do caller.
- Rotas de webhook (`/api/webhooks/*`) seguem a mesma ideia (token no header,
  não sessão). Só existe `POST /api/webhooks/asaas` (M5): o webhook do
  WhatsApp vai para o N8N, não para o Tibé (ver seção do agente abaixo), então
  `/api/webhooks/whatsapp` continua não existindo (seria código morto).

## Lógica de negócio: `src/lib/actions/*`

Toda regra de negócio (criar animal, registrar pesagem, calcular GMD, gerar
`FinancialEntry` de uma venda, etc.) vive em `src/lib/actions/*.ts`, **não**
dentro do route handler. As rotas HTTP (`/api/v1/...`) são wrappers finos:
validam com Zod, chamam a action, serializam a resposta. O agente WhatsApp
(`/api/internal/whatsapp/execute-action`) chama as **mesmas** actions
diretamente. Isso foi um refactor deliberado no Módulo 3 (a pedido do usuário,
"deixar liso para trazer modificações depois"): ao adicionar/editar uma
regra de negócio, mude na action, não duplique lógica na rota.

Padrão de retorno (`src/lib/actions/types.ts`):

```ts
type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string; status: number };
```

Arquivos principais: `animals.ts`, `service-orders.ts`, `service-clients.ts`,
`properties.ts`, `financial-summary.ts`, `billing.ts` (M5, assinatura Asaas),
`users.ts` (M5, convite/role/ativação). Lançamentos financeiros automáticos
sempre passam por `createLinkedEntry()` (`src/lib/financial.ts`): nunca crie
`FinancialEntry` manualmente fora dela nas actions existentes.

## Serialização

Prisma devolve `Decimal` e `Date`; os contratos de API usam `number` e string
ISO8601. Use sempre `decToNum()` / `isoOrNull()` (`src/lib/serialize.ts`) e os
serializers prontos em `src/lib/serializers.ts`: não formate objetos Prisma à
mão numa resposta de API.

---

## Autenticação

NextAuth v5 (beta), Credentials + bcrypt. Split em dois arquivos por causa do
Edge runtime do middleware:

- `src/lib/auth.config.ts`: config **edge-safe** (sem Prisma/bcrypt), usada
  pelo `middleware.ts` para proteger rotas. É aqui que fica a lista de rotas
  públicas.
- `src/lib/auth.ts`: instância completa (Node runtime), com o provider de
  credenciais de fato.

`User.email` é **globalmente único** (o login recebe só email+senha, sem
seletor de tenant/subdomínio): um email pertence a exatamente um tenant.
`middleware.ts` libera `/api/*` da checagem de sessão (cada handler faz sua
própria auth) para que rotas de API sem sessão devolvam `401` JSON em vez de
redirecionar para `/login`.

## Roles e permissões

Enum `UserRole`: `OWNER | ADMIN | OPERADOR | VISUALIZADOR` (maiúsculas,
conforme contrato de login). Hierarquia e matriz de acesso por módulo em
`src/lib/permissions.ts` (espelha PRD §5.2). `canAccess`/`canWrite` recebem a
role diretamente (reusáveis fora de contexto de sessão HTTP: é assim que o
agente WhatsApp valida permissão, sem precisar de cookie).

## UI

Não existe um design system de terceiros instalado via CLI: **o `npx
shadcn@latest init` trava neste ambiente** (fica esperando prompt
interativo). Os componentes em `src/components/ui/` (`button`, `input`,
`label`, `table`, `sheet`, `select`, `badge`) foram escritos à mão no estilo
shadcn (Radix primitives + `class-variance-authority` + `tailwind-merge`,
`cn()` em `src/lib/utils.ts`), com `components.json` já configurado: se um
dia rodar o CLI interativamente, ele deve reconhecer a estrutura existente.
Gráficos: Recharts v3. Cores da marca em `tailwind.config.ts`
(`tibe.primary/dark/light`), fonte Inter via `next/font/google`.

Páginas server (list/detail) buscam dados direto via `getTenantDb()`; ações de
escrita são componentes client dentro de `<Sheet>` (painel lateral), chamando
`apiPost`/`apiPatch` de `src/lib/client-api.ts` e dando `router.refresh()` no
sucesso.

**Painel do tenant é responsivo (mobile-first, deliberado: spec 2026-07-28):**
o fluxo nasce no WhatsApp, então o cliente acessa o painel majoritariamente
pelo celular, não desktop. `(dashboard)/layout.tsx` (server) calcula
`navLinks` já filtrados por perfil ativo + `canAccess(role, ...)` e passa pra
`DashboardShell` (`src/components/layout/dashboard-shell.tsx`, client):
**nunca** importe `@/lib/permissions` dentro de um client component do
dashboard: esse módulo importa `getSessionUser` de `tenant-context.ts`, que
arrasta `auth.ts` → `rate-limit.ts` → `ioredis` (módulos Node como `dns`
inexistentes no browser) e quebra o build. `DashboardShell` guarda o estado
de abrir/fechar do menu (hambúrguer no header, `md:hidden`) e repassa pra
`Sidebar` (`src/components/layout/sidebar.tsx`, client, drawer off-canvas
abaixo do breakpoint `md`, estático acima). `Table`/`Sheet`
(`src/components/ui/*`) já são responsivos por padrão (scroll horizontal e
largura total, respectivamente): não precisam de tratamento especial nas
páginas de conteúdo.

---

## Minha Fazenda (Módulo 29, 2026-08-04)

Área nova pedida pelo cliente (documento funcional enviado pelo cliente,
arquivo `.doc` binário em `docs/`, versionado no git para preservar a
origem):
cadastro da fazenda em si (nome, tamanho total, município, distrito) e sua
divisão em pastos (nome + tamanho cada). Objetivo do cliente: "o ponto de
partida para o restante do sistema" (rebanho, pastos, compromissos, receitas,
despesas e máquinas relacionados a uma fazenda cadastrada). V1 implementada é
estritamente o escopo da seção 12 do documento (cadastro + soma), sem os
vínculos futuros que o próprio documento lista como exemplo (tarefa→pasto,
despesa→fazenda, cerca→pasto): decisão do usuário, não avançar nisso ainda.

- **`Property` ganhou `city`/`district`** (município/distrito do documento,
  nomeados em inglês por consistência com o resto do schema, que não tem
  nenhum precedente de campo em português). Nullable no banco (propriedades
  existentes não têm valor); obrigatório só na validação Zod de criação
  (`POST /api/v1/properties`), pra não quebrar dado real já existente nem exigir
  backfill. `area_hectares` também passou a ser exigido e `> 0` só na
  criação (o documento pede isso), mantendo nullable no schema pelo mesmo
  motivo. Único ponto do código que cria `Property` é essa rota (confirmado
  antes de apertar a validação): nenhum script de teste ou fluxo de signup é
  afetado.
- **Model novo `Pasture`** (tenant-scoped, em `TENANT_SCOPED_MODELS`):
  `property_id`, `name`, `area_hectares` (obrigatório, `> 0`), `archived_at`
  (desativar, nunca deletar: mesmo padrão de `Property`). Nome do model em
  inglês por consistência (`Property`, `Plot`, `Machine`...); o termo de
  produto/UI continua "pasto", em português, como o documento pede
  explicitamente. **Não confundir com `Plot`/"Talhão"** (domínio de
  Lavoura/`CropCycle`): mesma forma superficial ("área dentro de uma
  propriedade"), domínios diferentes, sem relação entre os dois models.
- **Aviso de soma dos pastos > tamanho da fazenda é só aviso, nunca bloqueia
  salvar** (decisão do usuário, confirma a leitura literal do documento: "O
  sistema não deverá realizar alterações automaticamente"). Calculado em
  `getPastureAreaSummary()` (`src/lib/actions/properties.ts`), devolvido como
  `meta.area_summary` (aditivo) nas rotas de pasto e recalculado a cada
  render da página (Server Component, sem cache).
- **Reestruturação de navegação**: antes deste módulo, "Minha Fazenda" era o
  nome do GRUPO que agrupava Rebanho/Máquinas/Lavoura/Prestador/
  Financeiro/Alertas na sidebar (Fase 1 do layout, 2026-08-04, mesmo dia).
  O documento do cliente usa "Minha Fazenda" pra outra coisa (cadastro da
  propriedade em si), então o grupo foi renomeado pra **"Operação"** e
  "Minha Fazenda" virou um link de primeiro nível (`/minha-fazenda`, ícone
  reaproveitado do grupo antigo), logo abaixo de "Início": decisão do
  usuário, não uma dedução minha.
- **Página `/minha-fazenda`** (`src/app/(dashboard)/minha-fazenda/page.tsx`):
  Server Component, filtra por `?property_id=` (fallback pro cookie do
  seletor do topo, fallback pra primeira propriedade da lista). Substituiu o
  antigo botão "Propriedades" (Sheet dentro de Rebanho,
  `src/components/rebanho/property-manager.tsx`, **removido**: cadastro de
  fazenda agora só acontece aqui, não em dois lugares com validação
  diferente). Rebanho/Máquinas/Lavoura tiveram a mensagem de "cadastre uma
  propriedade" atualizada pra apontar pra cá.
- **Guard de permissão reusa `"rebanho"`** (mesmo módulo de `Property` já
  usava): o PRD não define um `ModuleKey` próprio para "Minha Fazenda", e
  criar um novo desviaria da matriz de acesso §5.2 sem necessidade real
  (Property/Pasture sempre foram parte do mesmo bloco de permissão que
  Rebanho).
- **Fora desta rodada, deliberadamente**: cadastro de fazenda/pasto pelo
  WhatsApp (seção 10 do documento, intenção nova + fluxo de confirmação +
  sincronizar o classificador do n8n) e qualquer vínculo de outro model a
  `Pasture` (Task, FinancialEntry, etc.): decisão do usuário, rodada
  seguinte, depois de validar o modelo de dados com uso real.

---

## Rebanho como livro-razão (Módulo 30, EM ANDAMENTO desde 2026-08-05)

Branch `rebanho-livro-razao`. Spec:
[docs/specs/module-30-rebanho-livro-razao.md](docs/specs/module-30-rebanho-livro-razao.md).
Origem: 2 documentos do cliente em `docs/Modulo Rebanho/` (versionados).

**A regra central: o saldo do rebanho NUNCA é gravado.** A quantidade de cada
posição é a soma das movimentações em `HerdMovement`. Se você se pegar
escrevendo um campo de quantidade em algum lugar, pare: é sinal de que a
regra está voltando para o modelo antigo.

- **Posição** = `categoria x fazenda x pasto x situação x dono` (enums
  `HerdSituation` e `HerdOwner`). Uma movimentação tira `quantity` cabeças de
  uma posição (campos `from_*`) e põe na outra (`to_*`). Entrada não tem
  origem, saída não tem destino, transferência tem as duas pontas. **Mudança
  de categoria não é caso especial**: é um movimento com categorias
  diferentes nas duas pontas.
- **As 12 categorias são constante de código** (`src/lib/herd/categories.ts`),
  não linha de banco editável, pelo mesmo motivo de `PLAN_PRICES`. Cada uma
  carrega sexo, faixa em meses e flag de reprodutiva: sem isso, "total de
  machos", traduzir "novilha" e o envelhecimento não são calculáveis.
  `resolveCategoryTerm()` devolve **`ambiguous` em vez de chutar** quando o
  termo serve a mais de uma faixa: é o que impede o assistente de lançar
  animais na idade errada.
- **`AnimalCategory` (tabela) segue existindo** só para o modelo antigo
  enquanto a migração dos consumidores não termina. Os nomes populares que
  ela guardava viraram a tabela de apelidos em `categories.ts`.
- **`canceled_at` não apaga**: cancelar para de contar no saldo e mantém a
  linha identificada no histórico, como o §10.8 exige.
- **Fase 1** (em andamento): as 9 movimentações básicas. **Fase 2**: leilão,
  pasto de terceiros, boitel, confinamento, desaparecimento e animais de
  terceiros. Dividir é seguro porque os eixos de dono e situação já nascem na
  fase 1.
- Testes: `npm run test:m32` (categorias, função pura, sem banco).

## Signup público (`/planos` + `/criar-conta`): fora do escopo original do PRD

O PRD §12 marca "onboarding self-service completo" como **fora do MVP** (v1.1).
Ainda assim, existe hoje um fluxo de signup público real, construído a pedido
explícito do usuário para destravar testes do painel antes dos módulos
4-5-6:

- `/planos`: preços **reais** (`PLAN_PRICES` em `src/lib/asaas.ts`: campo
  R$97, fazenda R$197, grupo R$397: a mesma constante usada para criar a
  assinatura no Asaas, nunca duplique o número), cada plano linkando para
  `/criar-conta?plan=campo|fazenda|grupo`.
- `/criar-conta`: formulário completo (empresa, CNPJ/CPF, telefone,
  responsável, email, senha) → `POST /api/v1/signup` (única rota `/api/v1`
  que roda **sem sessão**, por natureza: ainda não existe usuário). Cria
  `Tenant` (status **trial**, `plan` = o card clicado, `trial_ends_at` = agora
  + `TRIAL_DAYS`: `src/lib/billing-access.ts`, 14 dias) + `User` (role
  `OWNER`) de verdade, com checagem de documento/email duplicado. O client
  faz login automático (`signIn` do NextAuth) logo em seguida e manda para
  `/dashboard`, que redireciona ao onboarding existente (sem `TenantProfile`
  ainda).
- **Sem rate limiting** (não há fila/Redis conectado a esta rota): gap
  conhecido, aceitável para uso controlado de testes, mas revisar antes de
  divulgar publicamente.
- Este fluxo continua sendo a forma **pública** de criar tenant (ver também a
  criação manual pelo painel da plataforma, descrita abaixo): o Módulo 5 não
  o substituiu (a spec 5.11 previa um trial passwordless via WhatsApp, mas
  isso exigiria N8N em produção; decisão do usuário foi manter `/criar-conta`
  como está e reusá-lo como CTA da home pública).

**Segunda exceção deliberada (spec 2026-07-24):** `master_admin` também pode
criar um `Tenant` manualmente pelo painel da plataforma (`POST /api/platform/tenants`,
botão "Criar tenant" em `/plataforma/tenants`): usado para dar acesso de teste
a equipes de cliente sem passar pelo formulário público. Reusa a mesma lógica
de `/api/v1/signup` (trial, checagem de duplicidade), mas gera senha temporária
em vez de receber uma, e marca `User.must_change_password: true`: o usuário é
obrigado a trocar a senha em `/trocar-senha` (gate em `(dashboard)/layout.tsx`
e `onboarding/page.tsx`, usa `getTenantDb()` client escopado, não o client base)
antes de acessar qualquer outra coisa. O convite de usuário do Módulo 5
(`inviteUserAction`) não tem esse gate: continua como estava.

## O agente WhatsApp (Módulo 3)

Arquitetura (PRD §7): **Meta → N8N → Tibé → N8N → Meta**. O Tibé nunca fala
direto com a Meta Cloud API; o N8N é o único intermediário. Por isso:

- **Não existe** `/api/webhooks/whatsapp` no Tibé: seria código morto.
- A classificação de intenção por LLM acontece **dentro do N8N** (a chave de
  API do provedor de LLM fica nas credenciais do N8N, não no `.env` do Tibé).
- `POST /api/internal/whatsapp/resolve-contact`: identifica tenant/usuário
  pelo telefone (único lookup cross-tenant legítimo do sistema). Devolve,
  além do contrato da spec, `meta.first_contact`, `meta.suggested_reply` e
  `meta.recent_history` (extensões aditivas: a spec não definia de onde o
  N8N obteria essas informações).
- `POST /api/internal/whatsapp/execute-action`: roteia as intenções do MVP
  (`src/lib/whatsapp-intents.ts` tem a lista + regra de permissão/perfil por
  intenção) para as mesmas `actions` usadas pela web. Confirmação obrigatória
  acima de R$ 5.000 (`CONFIRMATION_THRESHOLD`) para venda/compra de animal e
  ordens de serviço de alto valor: ver `src/lib/actions/whatsapp-router.ts` e
  `src/lib/actions/confirmation.ts` (interpretação de "sim"/"não" em texto
  livre, usada só dentro dos dois fluxos de confirmação, nunca globalmente).
- **Áudio e recibo por foto/PDF** (spec 2026-07-28): o agente entende áudio
  (transcrito via Whisper **dentro do N8N**, tratado como texto normal a
  partir daí: o Tibé nunca sabe se veio de voz ou digitação) e foto/PDF de
  nota fiscal/recibo (extração por visão, também no N8N, vira a intenção
  `registrar_lancamento_financeiro`). Essa intenção **sempre** pede
  confirmação, independente do valor (não usa `CONFIRMATION_THRESHOLD`: a
  leitura de imagem erra mais que digitação manual). Categoria fora da lista
  fixa de `src/lib/category-suggestions.ts` cai em `"Outros"`. Handler em
  `src/lib/actions/whatsapp-router.ts`, chama `createManualEntryAction`
  (mesma action de `POST /api/v1/financial-entries`). Nó a nó no N8N:
  [docs/n8n-whatsapp-workflow.md](docs/n8n-whatsapp-workflow.md) §5.
  **`webhookBase64: true` não é confiável pra áudio/imagem na Evolution em
  produção** (descoberto testando com áudio real: o campo simplesmente não
  vem no webhook, mesmo configurado): `POST
  /api/internal/whatsapp/fetch-media` (`src/lib/whatsapp-media.ts`) busca a
  mídia sob demanda via `/chat/getBase64FromMediaMessage` da Evolution, pelo
  `message_id`, chamado pelo N8N antes de transcrever/extrair. Só suporta
  Evolution por enquanto (Meta Cloud API teria outro mecanismo de download,
  não implementado).
- **`ajuda` e `resumo`** (spec 2026-07-28): duas intenções pra deixar o
  agente utilizável por quem tem resistência a tecnologia, sem virar um
  chatbot de conversa aberta. `ajuda` (`topic?`) devolve texto **fixo**
  (tabela `HELP_TEXT` em `whatsapp-router.ts`, nunca gerado pela LLM) de
  como usar um recurso. `resumo` (`scope?`) é um funil de até 2 perguntas
  que termina em dado real (reusa as mesmas queries do `/dashboard`, sem
  action nova); nível 1: `rebanho`/`lavoura`/`prestador`/`financeiro`;
  nível 2, só sob `prestador`: `clientes`/`agendamentos`/
  `ordens_a_faturar`. `contas_a_pagar` e `contas_a_receber` consultam
  `FinancialEntry` pendente em qualquer perfil. Nenhum estado de conversa
  novo: o funil reconstrói onde parou a partir do `recent_history` a cada
  mensagem, mesmo mecanismo já usado pra confirmação sim/não. Se o histórico
  mostra que já perguntou e a resposta não resolveu, o prompt do LLM instrui
  classificar como `ambigua` em vez de perguntar de novo (evita loop).
  `ambigua` também ficou com texto menos robótico.
- **Agenda com custo (M17)**: o `resumo` lista agendamentos, vacinas e
  colheitas reais com suas datas e, quando o modelo fornece valor, o custo. A
  intenção `registrar_previsao_vacina` persiste uma despesa pendente em
  `FinancialEntry`, com `related_module: geral` e `related_id` sintético
  `"{animal_id}:{vaccine_id}"`, então o alerta `bill_due` mantém a promessa de
  lembrete. Repetir a previsão atualiza a mesma linha. Ao registrar a aplicação
  com custo real, a previsão é conciliada e quitada em vez de gerar uma segunda
  despesa. Se a data for reagendada, o alerta pendente antigo é descartado e o
  cron rearma `bill_due` quando a nova data entra na janela, preservando alertas
  já enviados ou dispensados para auditoria.
- `gerar_relatorio` (tipo `financeiro`) devolve um `report_url` de verdade
  (link assinado, ver Módulo 4 abaixo); tipos `rebanho|lavoura|prestador`
  ainda respondem "não disponível": não há gerador de PDF para eles.
- Guia completo para montar o workflow no N8N (nó a nó, incluindo o suporte a
  áudio e recibo por foto/PDF): [docs/n8n-whatsapp-workflow.md](docs/n8n-whatsapp-workflow.md).
  Inclui a seção de envio de alertas (Módulo 4) via `N8N_ALERT_WEBHOOK_URL`.
- **Envio de mensagem agora é do Tibé** (spec 2026-07-11, desvio deliberado da
  regra "N8N é o único intermediário", aprovado pelo usuário): o N8N chama
  `POST /api/internal/whatsapp/send-message` e o Tibé entrega pelo provider
  ATIVO em `WhatsAppProviderConfig` (Evolution API não-oficial OU Meta Cloud
  API: configurável em `/plataforma/configuracoes/whatsapp`, só master_admin,
  credenciais AES-256-GCM com `CONFIG_ENCRYPTION_KEY`). O RECEBIMENTO continua
  no N8N (payloads de entrada diferem por provider; segue não existindo
  `/api/webhooks/whatsapp`). Despacho em `src/lib/whatsapp-send.ts`.

## Financeiro e Alertas (Módulo 4)

- **Lançamentos manuais** (`POST /api/v1/financial-entries`) sempre nascem
  `related_module: geral`. `PATCH` (edição completa) só é permitido nesses:
  editar um lançamento gerado por outro módulo (venda de animal, insumo,
  ordem faturada) é bloqueado (`NOT_EDITABLE`) para não descolar do dado de
  origem; "marcar como pago" funciona em qualquer lançamento, de qualquer
  origem. Lógica em `src/lib/actions/financial-entries.ts`.
- **Regime contábil**: DRE (`getDre`) é por **competência**: todos os
  lançamentos do período por `due_date`, pago ou não. Fluxo de caixa
  (`getCashFlow`) é por **caixa**: só `status: paid`, agrupado por
  `paid_at`. Os dois em `src/lib/actions/financial-reports.ts`.
- **PDF sem R2**: `src/lib/reports/generate-financial-pdf.ts` (pdf-lib, gera
  na hora, nunca armazena) atrás de um link assinado por HMAC com expiração
  (`src/lib/reports/report-token.ts`, reusa `INTERNAL_API_SECRET` como
  chave): funciona sem sessão (necessário para quem clica vindo do
  WhatsApp). `GET /api/v1/financial/report/link` (sessão, gera o link) →
  `GET /api/v1/financial/report?token=` (público, serve o PDF). Trocar pelo
  R2 real no futuro não deve exigir mudar quem consome o link.
- **Alertas** (`src/lib/actions/alerts.ts`): idempotência por
  `(alert_type, related_module, related_id)`: inclusive `low_balance`, que
  usa a **semana ISO** como `related_id` sintético (resolve "no máximo 1 por
  semana" com o mesmo mecanismo dos outros tipos, sem regra especial).
- **BullMQ real** (Redis Cloud já provisionado), mas **sem worker
  persistente**: decisão do módulo, não há onde hospedar um processo 24/7
  hoje. `GET /api/internal/jobs/generate-alerts` (disparado 1x/dia pela
  Vercel Cron, `vercel.json`, autenticado por `CRON_SECRET` que a Vercel
  injeta sozinha) roda a geração **síncrona** dentro da própria requisição.
  A `Queue` do BullMQ registra um histórico auditável (uso real, mas só de
  bookkeeping); a idempotência "não rodar 2x no mesmo dia" é um lock simples
  no Redis (`SET NX`), não o estado interno do job: mais robusto sem um
  Worker para gerenciá-lo. Ver `getRedisConnectionOptions()` acima.
- **Envio por WhatsApp + email** (`src/lib/actions/alert-delivery.ts`,
  arquitetura 2026-07-29): WhatsApp mesmo padrão do Módulo 3 (Tibé chama
  `N8N_ALERT_WEBHOOK_URL`, outbound); email é tentado em paralelo, sempre
  (ver seção Email abaixo). Um alerta vira `sent` assim que **qualquer um**
  dos 2 canais entregar: sem isso, um alerta que só falha no WhatsApp (ex:
  `N8N_ALERT_WEBHOOK_URL` não configurada, gap conhecido) ficaria `pending`
  pra sempre e reenviaria o mesmo email todo dia no cron.

## Email (arquitetura 2026-07-29)

Canal adicional ao WhatsApp, não substituto: boas-vindas e alertas passam a
sair também por email, pensado para não depender só do WhatsApp em avisos
que precisam de comprovação de envio (fatura em atraso, fim de trial), uma
exigência explícita do usuário por motivo de defensabilidade.

- **`EMAIL_PROVIDER=gmail_smtp|resend`** (`.env`, default `gmail_smtp`):
  Gmail SMTP em desenvolvimento/início de produção (`GMAIL_SMTP_USER` +
  `GMAIL_SMTP_APP_PASSWORD`, uma "Senha de app" do Google, não a senha da
  conta); Resend guardado pronto (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`)
  pra quando o domínio próprio (`tibe.com.br`, ainda não registrado) tiver
  um remetente verificado. Troca é só a env var + redeploy, sem UI: decisão
  do usuário, essa troca só acontece uma vez.
- **`src/lib/email-send.ts`**: `sendEmail()` nunca lança (sempre devolve
  `{ok}`) e **sempre grava uma linha em `EmailLog`**, sucesso ou falha. Esse é o
  rastro auditável que o usuário pediu, não dá pra confiar só no retorno da
  função. `src/lib/email-templates.ts`: HTML simples escrito à mão (sem
  react-email nem outra lib de template), cores da marca
  (`tailwind.config.ts`).
- **Pontos de disparo**: `createTenantManuallyAction` e
  `resendWelcomeMessageAction` (`platform-tenants.ts`) disparam email junto
  com o WhatsApp que já existe; `POST /api/v1/signup` ganhou email de
  boas-vindas que não tinha equivalente nenhum antes (nunca teve WhatsApp);
  `deliverPendingAlertsForTenant`/`deliverAllPendingAlerts`
  (`alert-delivery.ts`) disparam email para os 5 tipos de `AlertType`, sem
  filtro. **Exceção deliberada**: `resendWelcomeMessageAction` continua
  exigindo `Tenant.phone` (falha inteira sem telefone, nem tenta o email), pois
  não foi relaxado nesta rodada porque o propósito da action é reenviar
  *pelo WhatsApp*; se precisar que o email funcione independente de
  telefone aqui também, é uma decisão de produto nova, não assumida.
- **Sem tabela de log pra boas-vindas além do `EmailLog`**: `Alert.status`/
  `sent_at` já cobre alertas; boas-vindas nunca teve persistência de
  tentativa nem por WhatsApp, continua assim (só o `EmailLog` novo).
- **Sem teste de entrega real**: `test:m15` cobre a falha graciosa (sem
  credencial configurada) e a lógica de quem recebe o quê; validação de
  entrega de verdade é manual, depois que a credencial do Gmail/Resend
  estiver preenchida no `.env`.

## Recuperação de senha (arquitetura 2026-07-29)

Só para `User` de tenant (`PlatformUser` fica de fora, deliberado: conta
sensível demais pra self-service, equipe pequena da Pleno). 3 etapas, 3
páginas standalone (mesmo padrão de `/trocar-senha`/`/escolher-plano`,
fora de `(dashboard)`/`(auth)`, em `PUBLIC_PREFIXES`):

- **`/esqueci-senha`** (email + escolha do canal) → `POST
  /api/v1/password-reset/request`. Resposta **sempre genérica**
  (`{ requested: true }`), exista ou não a conta, tenha ou não telefone pro
  canal WhatsApp: proteção contra enumeração de conta. Rate limit
  (`checkLoginRateLimit`, scope `password-reset-request`, 3/hora por email)
  aplicado **antes** da busca pelo usuário, mesmo motivo. As etapas 1 e 2
  são correlacionadas pelo **email** (que o usuário já sabe), nunca pelo id
  do `PasswordResetCode`: criar esse id só quando a conta existe vazaria a
  existência dela pela presença/ausência de um `rid` na resposta.
- **`/esqueci-senha/verificar?email=`** (código de 6 dígitos, expira em 10
  minutos, máx. 5 tentativas por código) → `POST
  /api/v1/password-reset/verify`. Conta inexistente e código errado
  devolvem o **mesmo** `INVALID_CODE`, sem diferenciar. Sucesso marca
  `PasswordResetCode.verified_at` e devolve o `id` da linha (`rid`). Só
  **aqui** que o id vira referência: nesse ponto a existência da conta já
  está inerentemente provada (não dá pra validar um código de uma conta que
  não existe), não tem mais nada a esconder.
- **`/esqueci-senha/nova-senha?rid=`** (nova senha + confirmação, regra
  forte) → `POST /api/v1/password-reset/confirm`. Exige `verified_at`
  preenchido e `consumed_at` nulo (não deixa reusar o mesmo código validado
  duas vezes); zera `must_change_password` (quem provou posse do
  email/WhatsApp já pode entrar direto, sem gate adicional); redireciona
  pro `/login`.
- **`isStrongPassword()`** (`src/lib/passwords.ts`, mín. 8 caracteres +
  maiúscula + número + símbolo): aplicada aqui e em `changeOwnPasswordAction`
  (troca obrigatória da senha temporária), mas **não** aplicada no signup
  público (`/criar-conta`), decisão deliberada de escopo, não assumida.
- **`checkLoginRateLimit`** (`src/lib/rate-limit.ts`) ganhou um 3º parâmetro
  opcional (`{ windowSeconds, maxAttempts }`) pra sustentar o limite mais
  restritivo do pedido de código sem afetar o padrão dos 2 logins (10
  tentativas/15min, inalterado).
- **`test:m16`** cobre a lógica toda (código certo/errado/expirado, limite
  de tentativas, rate limit, `isStrongPassword()`, reuso de `rid` já
  consumido) sem depender de entrega real. Validado também ponta a ponta
  num navegador real (`browser-harness`): pedir código → email de verdade
  chegou → validar → nova senha → login com a senha nova funcionou.

## Cadastro público verificado (Módulo 19, 2026-07-30)

`/criar-conta` deixou de criar conta num passo só. Agora são 4 etapas, com
**WhatsApp e email verificados antes de `Tenant`/`User` existirem**. Spec:
[docs/specs/module-19-cadastro-verificado.md](docs/specs/module-19-cadastro-verificado.md).

- **Por que verificar antes de criar:** os alertas de vencimento saem por esses
  dois canais, e o usuário exigiu que sejam defensáveis. Além disso, criar o
  tenant antes contaminaria os KPIs do painel da plataforma (todo cadastro
  abandonado viraria trial no funil e no churn) e travaria o CPF/CNPJ do dono
  real com "já existe uma conta".
- **`PendingSignup`** (modelo novo) guarda o cadastro em andamento. **Fora de
  `TENANT_SCOPED_MODELS` por necessidade estrutural**: o tenant ainda não
  existe. Mesma categoria de `PlatformUser` e `WhatsAppProviderConfig`. Expira
  em 60 minutos e é varrido por `purgeExpiredSignups()`, chamado pelo cron
  diário que já existia: dado pessoal de quem nunca virou cliente não fica
  guardado.
- **O id do cadastro viaja em cookie httpOnly** (`src/lib/signup-cookie.ts`),
  nunca na URL: lá ele ficaria no histórico e em log de referrer, e quem
  tivesse o id poderia trocar o email de destino antes da verificação.
- **Código:** 6 dígitos com hash, validade de 10 minutos, máximo 5 tentativas.
  O botão de corrigir o destino aparece aos 2 minutos: são **dois cronômetros
  diferentes** de propósito, amarrar os dois faria quem digita devagar perder
  um código válido. Código errado, expirado e ausente respondem igual.
- **Limite de envio é segurança, não otimização:** a rota dispara WhatsApp para
  qualquer número, sem login. Limitado por destino e por origem
  (`checkLoginRateLimit`, escopos `signup-send` e `signup-start`).
- **Ordem é obrigatória** (WhatsApp, depois email) e o servidor recusa o
  contrário. Trocar o destino de um canal **derruba a verificação dele**:
  verificamos o contato, não a intenção de quem preencheu.
- **Retomada:** voltar com o mesmo CPF/CNPJ enquanto o cadastro pendente vive
  cai direto na etapa que faltava.
- **Senha:** não é mais digitada no cadastro. Na conclusão nasce uma temporária,
  enviada pelos dois canais e devolvida na resposta só para o login automático,
  com `must_change_password: true`.
- **Duas trocas de senha, deliberadamente separadas em rotas diferentes:**
  `POST /api/v1/auth/change-password` (obrigatória, **sem** senha atual, porque
  a posse dos canais acabou de ser provada) e
  `POST /api/v1/auth/change-password-self` (voluntária, **com** senha atual,
  porque aí o risco é sessão aberta em máquina destravada). Juntar as duas numa
  rota com campo opcional criaria um caminho para pular a exigência. A página
  `/configuracoes/senha` é acessível a **qualquer papel**: trocar a própria
  senha não é privilégio de Owner/Admin.
- **`POST /api/v1/signup` (um passo) foi removido.** Dois caminhos públicos de
  criação de conta, um sem verificação, anulariam o módulo.
- **`/criar-conta` virou PREFIXO** em `PUBLIC_PREFIXES` (`auth.config.ts`): as
  etapas são sub-rotas, e como caminho exato o middleware mandaria o visitante
  para `/login` no meio do cadastro. Mesma armadilha já documentada para
  `/docs` e `/sitemap.xml`.
- **Sessão de 7 dias** nas duas instâncias NextAuth, substituindo o default
  herdado de 30 dias, que nunca foi decisão. **Não** existe "manter conectado":
  a promessa de "fechou a aba, pede senha" não se sustenta (cookie de sessão
  morre com o navegador, não com a aba, e o Chrome restaura), quase não se
  aplica no celular, e exigiria código customizado na camada mais sensível.
- **`dispatchEmail()`** (`src/lib/email-send.ts`) envia **sem** gravar
  `EmailLog`, e existe só para o código de verificação, que acontece antes de
  haver tenant a que atribuir o log. Para mensagem a cliente já cadastrado use
  `sendEmail()`: lá o rastro auditável é o ponto.

## Cobrança e billing (Módulo 5)

- **Cliente Asaas** (`src/lib/asaas.ts`): `access_token` no header (sem
  prefixo Bearer), sandbox vs produção por `ASAAS_ENV`. `AsaasNotConfiguredError`
  quando `ASAAS_API_KEY` não está setada: nunca chegou a ser testado contra o
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
- **`Subscription.status` nasce `"overdue"`, mesmo numa assinatura nova**:
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
- **Cancelamento tem régua própria** (spec 2026-08-04): quem cancela não é
  inadimplente, pagou o que devia e escolheu sair. Acesso **total até
  `next_due_date`**, depois **leitura por `ARCHIVE_WINDOW_DAYS` (60) dias**,
  depois **bloqueio**. A leitura na janela é deliberada: portabilidade do
  próprio dado é direito do titular na LGPD, não cortesia. `Subscription`
  ganhou `canceled_at` porque `next_due_date` sozinho não ancora quem cancela
  **já vencido** (aí a janela começa no cancelamento, não num vencimento que
  já passou): `getCancellationWindow()` faz esse `max` e é função **pura**,
  testável sem esperar 60 dias. **A fase é sempre calculada das datas, nunca
  lida de um campo que o cron preenche**: um cron atrasado não pode decidir
  acesso. `sweepCanceledSubscriptions()` (`cancellation-sweep.ts`, roda no
  cron diário) só reflete a fase em `Tenant.archived_at` para o painel da
  plataforma enxergar, e **desfaz** o arquivamento de quem reativou.
  **Passados os 60 dias nada é apagado**: o tenant fica bloqueado e aparece em
  destaque em `/plataforma/tenants` como pendente de decisão humana (decisão
  do usuário: apagar cliente é irreversível, e automatizar isso significa que
  um erro de data apaga a fazenda de alguém sem ninguém no circuito).
  Os três pontos que mudam status (`cancelSubscriptionAction`, webhook do
  Asaas, `forceSubscriptionStatusAction`) usam `subscriptionStatusData()`,
  que grava e **limpa** a data: sem isso, reativar deixaria arquivamento
  fantasma. Testes: `npm run test:m31`.
- **Acesso por nível de cobrança** (`src/lib/billing-access.ts`,
  `getBillingAccess(tenantId)`): três níveis: `full` / `read_only` /
  `blocked`: pela mesma régua de dias, tanto para assinatura em atraso
  (`next_due_date`) quanto para trial vencido sem assinatura
  (`trial_ends_at`, `TRIAL_DAYS = 14`): **< 5 dias → full; 5–15 → read_only;
  ≥ 15 → blocked**. `guard()` aplica em toda rota de API (bloqueia escrita em
  `read_only`, tudo em `blocked`, exceto `opts.skipBillingCheck: true`: usado
  só pelas próprias rotas `/api/v1/billing/*`, que precisam continuar
  acessíveis para o tenant conseguir regularizar). O layout do dashboard
  aplica a mesma regra a nível de página, redirecionando para
  `/configuracoes/assinatura` quando bloqueado.
- **`x-pathname` via middleware**: `middleware.ts` foi reestruturado da forma
  `export const { auth: middleware } = NextAuth(authConfig)` para a forma de
  função de ordem superior (`auth((req) => { ... res.headers.set("x-pathname",
  ...) ...})`) só para conseguir propagar o pathname atual para o layout do
  dashboard (Node runtime, com Prisma) sem duplicar lógica de auth no Edge.
  **Isso silenciosamente desligou `authConfig.callbacks.authorized`**: nessa
  forma o next-auth chama a função de ordem superior incondicionalmente e
  descarta o resultado de `authorized` (confirmado no código-fonte do pacote,
  função `handleAuth`). O middleware não bloqueava nada por sessão de tenant;
  quem protegia era só o `redirect()` de cada página. Corrigido em 2026-08-01
  chamando `authConfig.callbacks.authorized` explicitamente dentro da função,
  com `req.auth` (já resolvido pelo próprio next-auth). Se precisar adicionar
  outro header/side-effect no middleware, é aqui que entra: mas qualquer nova
  forma de HOF precisa preservar essa chamada explícita.
- **`AlertType.trial_ending`** (extensão aditiva ao enum, spec 5.8 não previa
  no PRD original): dispara quando `trial_ends_at` está a ≤ 2 dias e o tenant
  não tem `Subscription` nenhuma. `related_id` é o próprio `tenant_id` (o
  trial só vence uma vez, então é naturalmente idempotente sem precisar de um
  identificador sintético como o `low_balance` da semana ISO).

## Site público, documentação e gestão de usuários (Módulo 5)

- **`app/(public)/`**: `/` (home com hero/módulos/como funciona), `/planos`
  (preços reais, ver seção de Signup acima), `/faq`, `/politicas/privacidade`
  e `/politicas/termos` (LGPD: `/politicas` sozinho é um redirect para
  `/politicas/privacidade`, não uma página própria). Nav/footer compartilhados
  em `src/components/public/` (`PublicNav`, `PublicFooter`): qualquer página
  pública nova deve reusar os dois, não duplicar o markup.
- **SEO**: `metadataBase` + title template (`"%s | Tibé"`) no `RootLayout`;
  cada página pública define seu próprio `title`/`description` (a home não
  sobrescreve `title`, herda o `default` do root). `app/sitemap.ts` e
  `app/robots.ts` geram `/sitemap.xml` e `/robots.txt` automaticamente: como
  são rotas especiais do Next, **precisam** estar em `PUBLIC_PATHS`
  (`src/lib/auth.config.ts`), senão o middleware redireciona o crawler para
  `/login`.
- **Documentação técnica em `/docs`** (dentro do próprio Tibé: decisão do
  usuário, sem Mintlify/Notion): `src/app/(public)/docs/`: layout com sidebar
  fixa (`src/app/(public)/docs/layout.tsx`) e uma página por seção (`arquitetura`, `schema`,
  `api`, `whatsapp`, `setup`, `deploy`, `glossario`). A página `/docs/api` é
  **gerada a partir de um array de dados** (`Endpoint[]`, componente
  `EndpointCard` em `src/components/public/`) cobrindo todos os endpoints
  `/api/v1` e `/api/internal` reais: ao adicionar/mudar um endpoint,
  atualize essa lista também, senão a documentação e o código divergem. `/docs`
  precisa estar em `PUBLIC_PREFIXES` (`auth.config.ts`): mesma armadilha do
  sitemap/robots.
- **Limite de assentos por plano** (`src/lib/seats.ts`, decisão 2026-07-30):
  `PLAN_SEATS` fica **ao lado de `PLAN_PRICES`** em `src/lib/asaas.ts`
  (metadado de plano numa fonte só, mesmo motivo de nunca duplicar o preço):
  campo 1, fazenda 2, grupo 5. Três semânticas decididas com o usuário, todas
  intencionais: o **Owner ocupa assento** (campo = uso individual); usuário
  **desativado não ocupa** (trocar de funcionário não força upgrade); e o
  limite **nunca desativa ninguém retroativamente** (um tenant que caiu de
  plano e está acima do limite continua com todo mundo funcionando, só não
  convida nem reativa). Aplicado em `inviteUserAction` e
  `setUserActiveAction(true)`, com `SEAT_LIMIT_REACHED` (422) nomeando plano e
  limite. Na `inviteUserAction`, a checagem vem **depois** da duplicidade de
  email de propósito: responder "faça upgrade" a quem digitou um email já
  existente mandaria o cliente pagar por um problema que não é esse.
  `GET /api/v1/users` ganhou `meta.seats` (extensão aditiva) para a tela
  mostrar "N de M assentos" sem rota nova. Gap conhecido: nada valida assentos
  em massa fora desses dois pontos.
- **Gestão de usuários** (`src/lib/actions/users.ts`): convite gera senha
  temporária (`generateTempPassword`) mostrada **uma única vez** na resposta.
  **O convite NÃO envia email**, embora o projeto tenha canal de email desde
  2026-07-29 (ver seção Email): quem convida precisa passar a senha ao
  convidado por fora. Ligar o email aqui é melhoria pendente, não limitação
  de infra.
  Regras de "não pode editar/desativar a si mesmo" e "só Owner promove a
  Owner" ficam nas rotas (`api/v1/users/[id]/role`, `.../active`), não nas
  actions: a action em si é mais simples (`updateUserRoleAction`,
  `setUserActiveAction`) e só bloqueia desativar um `OWNER`.
- **`README.md`/`CONTRIBUTING.md`** na raiz do repo agora refletem o estado
  real do projeto (antes só existia um `README.md` desatualizado do Módulo 0,
  com uma afirmação **errada** sobre isolamento: dizia que os modelos-filho
  não tinham `tenant_id`, o que foi revertido ainda no Módulo 1). Mantenha os
  dois em sincronia com mudanças de arquitetura, junto com este arquivo.

## Painel da Plataforma (Módulo 6)

Único módulo sem fase contratual com a Agromax: ferramenta interna da Pleno
Digital para acompanhar a saúde do negócio Tibé como um todo (todos os
tenants na mesma tela, por desenho). `PlatformUser` (roles `MASTER_ADMIN` |
`EQUIPE`) já existia no schema desde o Módulo 0 como placeholder; este módulo
construiu tudo em volta dele.

- **`/plataforma` é uma pasta REAL, não um route group `(platform)`.** A
  spec descreve `app/(platform)/kpis/page.tsx` etc., mas route groups não
  aparecem na URL: `(platform)/login/page.tsx` viraria `/login`, colidindo
  direto com o login de tenant. `app/plataforma/` é um segmento de URL de
  verdade; `(painel)` como sub-route-group dentro dele separa o layout do
  login (`app/plataforma/login/`, sem nav) do layout autenticado
  (`app/plataforma/(painel)/`, com sidebar) sem afetar a URL.
- **Duas instâncias NextAuth genuinamente separadas**: não uma sessão
  compartilhada com um campo de "tipo". `src/lib/platform-auth.config.ts` +
  `platform-auth.ts` espelham `auth.config.ts`/`auth.ts`, mas com cookie
  próprio (`tibe-platform-session`) e secret próprio (`PLATFORM_AUTH_SECRET`,
  nunca reusar `NEXTAUTH_SECRET`) montados em `/api/platform-auth/[...nextauth]`.
  Isso faz a separação tenant↔plataforma ser estrutural (cookies diferentes,
  cada instância só enxerga o próprio) em vez de depender de uma checagem de
  código que alguém pode esquecer de replicar num endpoint novo.
- **⚠️ `next-auth` (não o `@auth/core` cru) assume `basePath: "/api/auth"`
  por padrão** quando `NEXTAUTH_URL`/`AUTH_URL` não tem path: uma instância
  secundária montada em qualquer outro caminho (`/api/platform-auth/*` aqui)
  **precisa** declarar `basePath` explicitamente na config, senão todo
  request quebra com `UnknownAction: Cannot parse action`. Isso custou uma
  depuração real neste módulo (`grep basePath` em
  `node_modules/next-auth/lib/env.js` se precisar reconfirmar o mecanismo).
- **Middleware**: `/plataforma` está em `PUBLIC_PREFIXES` de `auth.config.ts`
  (isento da checagem de sessão de TENANT): a proteção de verdade é manual,
  dentro do próprio `middleware.ts`, usando `getToken({ req, secret:
  PLATFORM_AUTH_SECRET, cookieName: "tibe-platform-session" })` (de
  `next-auth/jwt`, não a instância `auth()` da plataforma: `getToken` é a
  primitiva de baixo nível que não depende de estar dentro do HOF
  `auth(callback)`, ao contrário de chamar `auth()` "cru" de uma segunda
  instância dentro do middleware da primeira, que não é um padrão
  documentado/confiável). Testado ponta a ponta (login, acesso, logout, e as
  duas direções de isolamento cross-sessão) via curl com o dance de CSRF do
  NextAuth: ver histórico da sessão se precisar repetir.
- **`guardPlatform(opts?: { requireMasterAdmin? })`** (`src/lib/platform-guard.ts`)
  espelha `guard()`. `equipe` lê tenants (6.3); só `master_admin` vê KPIs
  financeiros (6.4-6.7) e executa as duas ações administrativas (forçar
  status 6.9, gerenciar equipe 6.10): recorte de permissão decidido com o
  usuário, não estava 100% explícito na spec (PRD §5.3 delegava a decisão
  para este módulo).
- **`SubscriptionStatusLog`** (novo modelo): toda transição de
  `Subscription.status` grava uma linha aqui:
  `logSubscriptionStatusChange()` em `src/lib/platform/subscription-log.ts`,
  chamada tanto pelo webhook do Asaas quanto por `subscribeAction`/
  `cancelSubscriptionAction` (M5, automático, `changed_by_platform_user_id`
  nulo) quanto por `forceSubscriptionStatusAction` (M6, manual, com o
  `PlatformUser` responsável e `reason`). Existe porque **não tinha como
  calcular churn/funil corretamente sem isso**: `Subscription` não guardava
  nenhum timestamp de transição (só `created_at`), então "cancelamentos no
  período" e "tempo médio de conversão trial→pago" eram impossíveis de
  responder. Um único mecanismo resolve isso E serve de log de auditoria
  para a 6.9: decisão tomada com o usuário em vez de assumida.
- **`lib/platform/kpis.ts`**: `calculateMRR` soma `PLAN_PRICES` (preço atual)
  das assinaturas `active`: não há histórico de preço por assinatura, então
  "valor do plano vigente" só pode significar o preço de hoje, inclusive
  retroativo no gráfico de evolução (limitação aceita). `getStatusAsOf(date)`
  reconstrói o status de cada assinatura numa data (o log mais recente com
  `created_at <= date`): é a peça que sustenta `calculateChurn` (ativos no
  início do período), `calculateMrrTrend` (MRR real mês a mês, não a
  aproximação mais simples que a spec sugeria) e `calculateFunnel` (tempo até
  a primeira ativação). `calculateLTV` devolve `null` (não `Infinity`) quando
  não há churn observado ainda: divisão por zero evitada explicitamente.
- **Captura de UTM** (`src/lib/utm.ts`, `UtmCapture` renderizado dentro de
  `PublicNav`): first-touch via cookie (`tibe_utm`, 30 dias): só grava se o
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
- **Seed do `master_admin`**: existe em `prisma/seed.ts`
  (`tibe.gestaoagro@gmail.com`), com credenciais reais fornecidas pelo
  usuário, já aplicado em produção (Neon).
- **Mensagem de boas-vindas por WhatsApp** (spec 2026-07-28,
  `src/lib/whatsapp-welcome.ts`): `createTenantManuallyAction` dispara,
  melhor esforço (nunca bloqueia a criação), uma mensagem com o link de login
  (`NEXTAUTH_URL` + `/login`: mesma env var de `report-link.ts`, atualiza
  sozinha quando o domínio próprio for cadastrado), email e senha temporária.
  Botão **"Reenviar boas-vindas"** no detalhe do tenant (`POST
  /api/platform/tenants/:id/welcome-message`, só master_admin) existe porque
  a senha original em claro não é recuperável (só o hash é salvo): reenviar
  **gera uma nova senha temporária** e marca `must_change_password` de novo,
  então a mensagem reenviada sempre tem uma credencial que funciona de
  verdade, nunca repete uma senha que o usuário já trocou.

---

## Validação ao vivo: por que a suíte verde não basta

Este projeto tem 35 suítes automatizadas, `tsc` e `eslint` limpos e build de
produção passando. Ainda assim, **os defeitos mais graves só apareceram em uso
real**. Lista curta, toda ela de casos verificados:

- O formulário de máquina do app **se recusava a abrir sem sinal**, tornando a
  fila offline inútil justo no curral. Achado ligando o modo avião num Android.
- O **Financeiro do app não usava a fila** de escrita: lançar sem sinal
  falhava em vez de enfileirar.
- `"Network request failed"` **vazava em inglês** para o produtor em 4 telas.
- A tela de Rebanho do app ficou **quebrada** contra o back-end novo: filtrava
  por um campo que a API deixou de devolver.
- `Tenant.archived_at` **não fazia nada**: nenhum ponto de auth, sessão ou
  billing lia o campo, embora a interface mostrasse "Arquivado".
- O middleware **não bloqueava nada** por sessão de tenant havia meses
  (`authConfig.callbacks.authorized` era descartado na forma HOF).

Nenhum desses seria pego por teste de unidade, porque nenhum é erro de
cálculo: são erros de **integração com o mundo** (rede caindo, campo que
sumiu, config que não é lida). Antes de reportar um módulo como concluído,
valide no navegador real (`browser-harness`) ou no aparelho, não só na suíte.

Duas armadilhas de ambiente que aparecem nesses testes:

- **Testar sessão autenticada via `next start` + cookie jar não funciona**
  localmente (o Edge Middleware não reconhece a sessão nesse setup). Rotas
  `/api/v1/*` funcionam normalmente. Use `next dev` + navegador real.
- **O Redis é compartilhado com produção** (não há instância local). Três
  suítes (`m4`, `m19`, `m24`) falham na segunda execução da mesma hora por
  lock diário ou limite de envio. Não é regressão: apague a chave no Redis.

## Memória de longo prazo (Claude Code, específico desta ferramenta)

Além deste arquivo (versionado, visível a qualquer sessão/ferramenta/humano),
existe um sistema de memória **local à máquina**, fora do repositório, em
`C:\Users\dilto\.claude\projects\d--Projetos-Web-agrogestao-tibe\memory\`
(`MEMORY.md` é o índice). Ele guarda decisões e contexto de sessões passadas
do Claude Code especificamente: **não é visível** para outras ferramentas,
outros agentes, nem para quem só olha o repositório. Trate este `CLAUDE.md`
como a fonte que deve funcionar sozinha; a memória é um complemento, não uma
dependência. Para estado operacional recente, use sempre
`docs/agents/current-handoff.md`; ele prevalece sobre a memória local quando
houver divergência.

## Agent skills

### Issue tracker

Issues ficam nas GitHub Issues do repo (`tibegestaoagro/tibe-agrogestao`), via `gh` CLI. Ver `docs/agents/issue-tracker.md`.

### Triage labels

Labels padrão (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Ver `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` na raiz (ainda não existem, criados sob demanda pelas skills). Ver `docs/agents/domain.md`.

## Comandos úteis

```powershell
npm run dev              # servidor de desenvolvimento
npm run build             # build de produção (roda lint + tsc também)
npm run db:migrate        # cria/aplica migração em dev (interativo: evite em automação)
npm run db:deploy         # aplica migrações pendentes (não-interativo)
npm run db:seed           # seed (tenant Da Mata + owner + vacinas padrão)
npm run db:check          # valida conexão com o banco
npm run auth:check        # valida credencial do seed (bcrypt)
npm run test:isolation    # M0 (inclui guardrail: TENANT_SCOPED_MODELS vs schema.prisma)
npm run test:docs-api     # /docs/api sincronizado com as rotas reais (sem DB)
npm run test:nav          # buildNavItems (sidebar), função pura (sem DB)
npm run test:herd         # getHerdEvolution: resultado idêntico ao da versão antiga
npm run test:m1           # M1
npm run test:m2           # M2
npm run test:m3           # M3
npm run test:m4           # M4
npm run test:m5           # M5
npm run test:m6           # M6
npm run test:m7           # M7
npm run test:m9           # M9
npm run test:m10          # M10
npm run test:m11          # M11
npm run test:m12          # M12
npm run test:m13          # M13
npm run test:m14          # M14
npm run test:m15          # M15
npm run test:m16          # M16
npm run test:m17          # M17
npm run test:m18          # Limite de assentos por plano
npm run test:m19          # Cadastro público verificado
npm run test:m20          # Buffer de mensagens picadas (WhatsApp)
npm run test:m21          # Cadastro assistido de animais
npm run test:m22          # Fluxo de integracao
npm run test:m23          # Auth por token (app mobile)
npm run test:m24          # Notificacoes
npm run test:m25          # Rebanho por categoria (Modulo 25, historico)
npm run test:m26          # Calculadora pecuaria
npm run test:m27          # Maquinas (Modulo 26)
npm run test:m28          # Meu Dia (Modulo 27)
npm run test:m29          # Ajustes financeiros (Modulo 28)
npm run test:m30          # Rebanho por categoria (modelo unico)
npm run test:m31          # Cancelamento com janela de arquivamento (60 dias)
npm run test:m32          # Rebanho: as 12 categorias (Modulo 30, sem banco)
npm run test:m33          # Rebanho: livro-razao (Modulo 30)
npm run test:m34          # Rebanho pelo WhatsApp (Modulo 30)
npm run test:m35          # Negociacao de gado (Modulo 31)
npm run test:m36          # Negocio de gado pelo WhatsApp (Modulo 31)
npm run wa                # Banco de provas do agente (docs/agents/banco-de-provas-whatsapp.md)
```

Credenciais do seed (dev): `owner@damata.com.br` / `tibe123`.
