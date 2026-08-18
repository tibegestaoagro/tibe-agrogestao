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
