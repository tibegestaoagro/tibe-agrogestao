---
paths:
  - "src/lib/actions/**"
  - "src/app/api/**"
  - "prisma/schema.prisma"
  - "src/lib/prisma.ts"
---
<!-- Carrega sozinho ao ler um arquivo que casa com os globs acima.
     A regra mais importante do projeto, e a lista de excecoes legitimas ao client base. Carrega ao ler qualquer action, rota ou o schema, que sao os lugares onde ela pode ser quebrada. -->

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
  também: ver `.claude/rules/plataforma.md` para como isso é garantido
  (duas instâncias NextAuth com cookies diferentes, não uma checagem de role).

Todo módulo que adiciona endpoints ganha um teste de isolamento automatizado
(`scripts/*.test.ts`, rodados via `tsx`, chamando os route handlers diretamente
com um `Request` construído). Rode antes de reportar um módulo como concluído.

**A lista de suítes e o comando correto estão no `CLAUDE.md` e no
`package.json`.** Não copie comando de teste daqui: a versão que vivia neste
trecho usava `$env:` com `localhost`, as duas armadilhas que o projeto já
pagou para aprender, e sobreviveu meses porque ninguém relê texto movido.
