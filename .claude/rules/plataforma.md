---
paths:
  - "src/app/plataforma/**"
  - "src/lib/platform/**"
  - "src/app/api/platform/**"
  - "src/lib/platform-*.ts"
---
<!-- Carrega sozinho ao ler um arquivo que casa com os globs acima.
     Por que duas instancias NextAuth de verdade, por que `/plataforma` e pasta real e nao route group, e a armadilha do basePath que custou uma depuracao inteira. -->

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
