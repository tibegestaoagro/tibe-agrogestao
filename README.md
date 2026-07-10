# Tibé (AgroGestão)

SaaS multi-tenant de gestão agropecuária — rebanho, lavoura, prestação de serviço
e financeiro, com agente de IA no WhatsApp como canal primário. Desenvolvido pela
Pleno Digital; cliente/financiador do MVP: Da Mata Sementes LTDA.

> Documentação de produto: [`docs/tibe-prd.md`](docs/tibe-prd.md) · Specs por
> módulo: [`docs/specs/`](docs/specs/) · Documentação técnica navegável (arquitetura,
> schema, todos os endpoints, agente WhatsApp, guias): **[`/docs` no app](https://tibe-agrogestao.vercel.app/docs)**.

## Status

| # | Módulo | Status |
|---|--------|--------|
| 0 | Setup, schema multi-tenant, auth, isolamento | ✅ em produção |
| 1 | Rebanho e Lavoura | ✅ em produção |
| 2 | Prestador de Serviço | ✅ em produção |
| 3 | Agente WhatsApp | ✅ código pronto — N8N/Meta/Salvy ainda não provisionados |
| 4 | Financeiro e Alertas | ✅ em produção |
| 5 | Painel Web, Cobrança (Asaas) e Site | ✅ em produção |
| 6 | Painel da Plataforma (interno Pleno) | ⏳ não iniciado |

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma 7 (`@prisma/adapter-pg`)
· PostgreSQL 17 (Neon) · NextAuth v5 beta (Credentials + bcrypt) · Zod · Recharts ·
Redis Cloud + BullMQ · N8N (orquestração do agente WhatsApp) · WhatsApp Business
Cloud API (Meta) · Asaas (cobrança recorrente).

## Estrutura de pastas

```
src/app/(public)/     páginas sem autenticação — home, planos, faq, políticas, docs, login, criar-conta
src/app/(dashboard)/  painel autenticado, uma pasta por módulo (rebanho, lavoura, prestador, financeiro, alertas, configuracoes)
src/app/api/v1/       API de negócio (sessão obrigatória via guard())
src/app/api/internal/ rotas chamadas pelo N8N e pela Vercel Cron (secret no header, não sessão)
src/app/api/webhooks/ rotas chamadas por serviços externos (Asaas — token no header)
src/lib/actions/      lógica de negócio pura (funções que recebem o client Prisma escopado)
src/lib/serializers.ts, src/lib/serialize.ts   Prisma (Decimal/Date) → JSON (number/ISO string)
src/lib/prisma.ts     client Prisma + extension de isolamento multi-tenant
src/components/       componentes React, organizados por módulo
prisma/schema.prisma  schema — modelos em PascalCase, campos em snake_case
docs/specs/           uma spec por módulo (fonte usada para implementar cada um)
scripts/              testes de isolamento/regressão (rodados via tsx, sem servidor)
```

## Pré-requisitos

- Node.js 20+ (testado em Node 24)
- Um PostgreSQL 17 (Neon em produção; Docker local em desenvolvimento)
- Redis (Redis Cloud ou local) — necessário para o job de alertas e o lock de idempotência diário

## Setup local

```bash
# 1. Dependências (roda "prisma generate" automaticamente via postinstall)
npm install

# 2. Variáveis de ambiente
cp .env.example .env
#   preencha ao menos DATABASE_URL e NEXTAUTH_SECRET — o resto é opcional em dev
#   (ver detalhes de cada variável em /docs/setup no app)

# 3. Banco: aplicar migrações
npm run db:deploy      # prisma migrate deploy (não-interativo)

# 4. Seed inicial (tenant Da Mata Sementes + usuário owner + catálogo de vacinas)
npm run db:seed

# 5. Subir a aplicação
npm run dev            # http://localhost:3000
```

### Postgres local via Docker (opcional)

```bash
docker run -d --name tibe-pg \
  -e POSTGRES_PASSWORD=tibe -e POSTGRES_USER=tibe -e POSTGRES_DB=tibe_dev \
  -p 55432:5432 postgres:17
# DATABASE_URL=postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public
```

### Credenciais do seed (dev)

```
email: owner@damata.com.br
senha: tibe123
```

O tenant do seed é criado sem `TenantProfile`, então o primeiro login cai no
onboarding (escolha entre perfil Fazenda, Prestador de Serviço, ou ambos).

## Scripts

| Script                   | Descrição                                                     |
|--------------------------|----------------------------------------------------------------|
| `npm run dev`            | Servidor de desenvolvimento                                    |
| `npm run build`          | Build de produção (roda lint + tsc também)                     |
| `npm run lint`           | ESLint                                                          |
| `npm run db:migrate`     | Cria/aplica migração em dev (`prisma migrate dev` — interativo) |
| `npm run db:deploy`      | Aplica migrações pendentes (`prisma migrate deploy`)           |
| `npm run db:seed`        | Seed inicial                                                    |
| `npm run db:check`       | Valida a conexão com o banco                                    |
| `npm run auth:check`     | Valida o caminho de credenciais (seed + bcrypt)                 |
| `npm run test:isolation` | Isolamento multi-tenant genérico (Módulo 0)                     |
| `npm run test:m1`        | Rebanho e Lavoura + isolamento dos modelos-filho                |
| `npm run test:m2`        | Prestador de Serviço                                            |
| `npm run test:m3`        | Agente WhatsApp (permissão por role, confirmação, isolamento)   |
| `npm run test:m4`        | Financeiro e Alertas                                             |

Todos os testes chamam os route handlers diretamente (via `tsx`), sem precisar de
um servidor rodando — mas precisam de `DATABASE_URL` apontando para um banco real.

## Isolamento multi-tenant (a regra mais importante do projeto)

`tenant_id` nunca vem do client — é sempre resolvido da sessão NextAuth no
servidor. Toda query de negócio usa o **client escopado**:

```ts
import { getTenantDb } from "@/lib/tenant-context";
import { scoped } from "@/lib/prisma";

const db = await getTenantDb();
await db.animal.findMany();                  // tenant_id injetado automaticamente
await db.animal.create({ data: scoped({ ear_tag: "001", property_id }) });
```

O isolamento é implementado por uma **Prisma Client Extension** em
[`src/lib/prisma.ts`](src/lib/prisma.ts) — única fonte de verdade — e validado por
testes automatizados em [`scripts/`](scripts/). Todos os modelos de negócio,
inclusive os que à primeira vista parecem "filhos" (`AnimalWeightLog`,
`AnimalVaccination`, `AnimalMovement`, `CropCycle`, `PlotInput`), **também**
carregam `tenant_id` e passam pela mesma extension — decisão deliberada de
defense-in-depth, não um descuido.

A única exceção estrutural é `PlatformUser` (Módulo 6, ainda não implementado),
que vive inteiramente fora do conceito de tenant por desenho. Um punhado de rotas
legitimamente usa o client Prisma base (sem escopo) por precisarem operar antes de
conhecer o tenant, ou fora de uma sessão — ver a seção "Isolamento multi-tenant" em
`/docs/arquitetura` no app para a lista completa e a justificativa de cada uma.

## Deploy

Passo a passo inicial (GitHub + Vercel + Neon) em [`docs/deploy.md`](docs/deploy.md).
Para a configuração completa em produção hoje — todas as variáveis de ambiente, o
cron de alertas e as dependências externas ainda não provisionadas — ver `/docs/deploy`
no app, que é mantido junto com o código.

## Contribuindo

Ver [`CONTRIBUTING.md`](CONTRIBUTING.md).
