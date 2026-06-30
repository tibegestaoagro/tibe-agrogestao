# Tibé (AgroGestão)

SaaS multi-tenant de gestão agropecuária — rebanho, lavoura, prestação de serviço
e financeiro, com agente de IA no WhatsApp como canal primário.

> Documentação de produto: [`docs/tibe-prd.md`](docs/tibe-prd.md) · Specs por
> módulo: [`docs/specs/`](docs/specs/).

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Prisma 7 · PostgreSQL 17 (Neon)
· NextAuth v5 (credenciais) · BullMQ/Redis · N8N · Cloudflare R2 · Asaas.

## Pré-requisitos

- Node.js 20+ (testado em Node 24)
- Um PostgreSQL (Neon em produção; Docker local em desenvolvimento)

## Setup local

```bash
# 1. Dependências
npm install

# 2. Variáveis de ambiente
cp .env.example .env
#   preencha DATABASE_URL (Neon ou Postgres local) e NEXTAUTH_SECRET

# 3. Banco: aplicar migrações e gerar o client
npm run db:deploy      # aplica as migrações (prisma migrate deploy)
#   (ou, para evoluir o schema em dev: npm run db:migrate)

# 4. Seed inicial (tenant Da Mata Sementes + usuário owner)
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

O tenant é criado sem `TenantProfile`, então o primeiro login cai no onboarding.

## Scripts

| Script                   | Descrição                                                  |
|--------------------------|------------------------------------------------------------|
| `npm run dev`            | Servidor de desenvolvimento                                |
| `npm run build`          | Build de produção                                          |
| `npm run db:migrate`     | Cria/aplica migração em dev (`prisma migrate dev`)         |
| `npm run db:deploy`      | Aplica migrações pendentes (`prisma migrate deploy`)       |
| `npm run db:seed`        | Seed inicial                                               |
| `npm run db:check`       | Valida a conexão com o banco                               |
| `npm run auth:check`     | Valida o caminho de credenciais (seed + bcrypt)            |
| `npm run test:isolation` | **Teste de isolamento multi-tenant** (tenant A ≠ tenant B) |

## Isolamento multi-tenant (crítico)

`tenant_id` nunca vem do client — é resolvido da sessão NextAuth no servidor.
Toda query de negócio deve usar o **client escopado**:

```ts
import { getTenantDb } from "@/lib/tenant-context";
import { scoped } from "@/lib/prisma";

const db = await getTenantDb();
await db.animal.findMany();                  // tenant_id injetado automaticamente
await db.animal.create({ data: scoped({ ear_tag: "001", property_id }) });
```

O isolamento é implementado por uma Prisma Client Extension em
[`src/lib/prisma.ts`](src/lib/prisma.ts) (única fonte de verdade — PRD §10.4) e
validado por [`scripts/tenant-isolation.test.ts`](scripts/tenant-isolation.test.ts).

> Modelos-filho (`AnimalWeightLog`, `AnimalVaccination`, `AnimalMovement`,
> `CropCycle`, `PlotInput`) não têm `tenant_id` e herdam o tenant via o pai —
> devem ser sempre consultados através do registro pai escopado.

## Deploy (Vercel + Neon)

Ver passo a passo em [`docs/deploy.md`](docs/deploy.md).
