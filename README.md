# Tibé (AgroGestão)

SaaS multi-tenant de gestão agropecuária: rebanho, lavoura, prestação de serviço
e financeiro, com agente de IA no WhatsApp como canal primário. Desenvolvido pela
Pleno Digital; cliente/financiador do MVP: Da Mata Sementes LTDA.

> **Produto:** [`docs/tibe-prd.md`](docs/tibe-prd.md) · **Specs por módulo:**
> [`docs/specs/`](docs/specs/) · **Documentação técnica navegável** (arquitetura,
> schema, todos os endpoints, agente WhatsApp, guias):
> [`/docs` no app](https://tibe-agrogestao.vercel.app/docs).
>
> **Trabalhando no código?** O contexto operacional completo está em
> [`CLAUDE.md`](CLAUDE.md): invariantes, status dos módulos, armadilhas do
> ambiente e o mapa de onde cada coisa mora. Este README é só a porta de
> entrada.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma 7
(`@prisma/adapter-pg`) · PostgreSQL 17 (Neon) · NextAuth v5 beta · Zod ·
Recharts · Redis Cloud + BullMQ · N8N (orquestração do agente WhatsApp) ·
Evolution API / WhatsApp Cloud API · Asaas (cobrança recorrente).

## Estrutura de pastas

```
src/app/(public)/     páginas sem autenticação: home, planos, faq, políticas, docs, login, criar-conta
src/app/(dashboard)/  painel autenticado, uma pasta por módulo
src/app/plataforma/   painel interno da Pleno Digital: auth separada da de tenant
src/app/api/v1/       API de negócio (sessão obrigatória via guard())
src/app/api/platform/ API do painel da plataforma (guardPlatform())
src/app/api/internal/ rotas chamadas pelo N8N e pela Vercel Cron (secret no header)
src/app/api/webhooks/ rotas chamadas por serviços externos (Asaas: token no header)
src/lib/actions/      lógica de negócio pura (funções que recebem o client Prisma escopado)
src/lib/prisma.ts     client Prisma + extension de isolamento multi-tenant
src/components/       componentes React, organizados por módulo
prisma/schema.prisma  modelos em PascalCase, campos em snake_case
scripts/              testes de isolamento e regressão (via tsx, sem servidor)
.claude/rules/        regras por área, carregadas sob demanda pelo agente
```

## Pré-requisitos

- Node.js 20+ (testado em Node 24)
- PostgreSQL 17 (Neon em produção; Docker local em desenvolvimento)
- Redis (Redis Cloud ou local): job de alertas e lock de idempotência diário

## Setup local

```bash
npm install               # roda "prisma generate" via postinstall
cp .env.example .env      # preencha ao menos DATABASE_URL e NEXTAUTH_SECRET
npm run db:deploy         # aplica as migrações
npm run db:seed           # tenant Da Mata + owner + catálogo de vacinas
npm run dev               # http://localhost:3000
```

### Postgres local via Docker

```bash
docker run -d --name tibe-pg \
  -e POSTGRES_PASSWORD=tibe -e POSTGRES_USER=tibe -e POSTGRES_DB=tibe_dev \
  -p 55432:5432 postgres:17
```

⚠️ **O `.env` deste projeto aponta para o Neon de produção.** Para rodar teste ou
migração localmente, passe a URL do Docker inline, com `127.0.0.1` (e não
`localhost`, que não resolve neste ambiente):

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m1
```

Credenciais do seed (dev): `owner@damata.com.br` / `tibe123`. O tenant do seed
nasce sem `TenantProfile`, então o primeiro login cai no onboarding.

## Verificação

```bash
npm run check          # conferência estática do repositório, sem banco
npm run build          # build de produção (roda lint + tsc)
npm run test:isolation # isolamento multi-tenant (Módulo 0)
```

A lista completa de suítes está no `package.json`, e é ela que vale:
`npm run check` reprova qualquer comando citado na documentação que não exista
lá, além de caminho e rota que não existem mais.

## Isolamento multi-tenant

`tenant_id` nunca vem do client: é sempre resolvido da sessão no servidor, e o
isolamento é implementado por uma Prisma Client Extension em
[`src/lib/prisma.ts`](src/lib/prisma.ts), fonte única de verdade, validada por
testes automatizados.

A regra completa, com a lista justificada de cada exceção legítima, está em
[`.claude/rules/isolamento.md`](.claude/rules/isolamento.md) e em
`/docs/arquitetura` no app.

## Deploy

Passo a passo inicial (GitHub + Vercel + Neon) em
[`docs/deploy.md`](docs/deploy.md). A configuração de produção de hoje, com
todas as variáveis de ambiente e o cron de alertas, está em `/docs/deploy` no
app, mantido junto com o código.

Merge na `main` dispara deploy de produção: não há staging além dos previews de
PR, e a migração **precisa** ser aplicada antes do push.
