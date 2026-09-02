# Fase 33.2 (serviço contratado): plano de implementação

> **Para quem executa:** use `superpowers:executing-plans` para tocar tarefa por
> tarefa. Os passos usam caixa (`- [ ]`) para marcação.

**Objetivo:** entregar o `ServiceJob` na direção contratada (a diária, o
empreito e o serviço por unidade), com conta a pagar de saldo aberto, os
vínculos com fazenda, pasto, confinamento e leite, as anotações de atividade e
ausência, e o resumo do §30.

**Arquitetura:** `ServiceJob` guarda o combinado (preço unitário ou valor
fechado) e nenhum saldo. A quantidade trabalhada é a soma de `ServiceJobLog`; o
total é derivado dela; o pago e o restante são somas de `FinancialEntry`. O
lote de confinamento passa a somar o custo por junção, e não por `related_id`
direto.

**Stack:** Next.js 16 (App Router), Prisma 7, PostgreSQL 17, Zod 4, Redis, UI kit
próprio.

**Spec:** [2026-09-02-mao-de-obra-e-servicos-com-maquinas-design.md](../specs/2026-09-02-mao-de-obra-e-servicos-com-maquinas-design.md),
com as quatro decisões da seção 3.1.

## Restrições globais

- **`tenant_id` nunca vem do client.** Model novo com `tenant_id` entra em
  `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts:27`), e `npm run test:isolation`
  reprova se faltar.
- **Regra de negócio em `src/lib/actions/*`**, nunca no route handler.
- **Ordem de entrega: action, depois rota, depois tela.**
- **Nunca use travessão** (U+2014). **Nunca escreva conteúdo com escape por
  heredoc:** use Edit/Write.
- **Banco e Redis locais, passados inline**, nunca editando o `.env`:
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public"`
  e `REDIS_URL="redis://127.0.0.1:6390"`. Use `127.0.0.1`, não `localhost`.
  ⚠️ **O Redis local desta máquina é `tibe-redis-local` na porta 6390**, não a
  56379 que o `CLAUDE.md` documenta.
- **Migração antes do push.** Aplique no Docker local; **quem aplica no Neon é
  o usuário, no terminal**.
- **`npm run check` com 0 falhas** ao fim de cada tarefa que toca tela ou doc.
  As que mordem aqui: 7 (`<input type="number">`), 8 (cor crua), 10 (recusa do
  servidor), 11 (`FormSheet`), 12 (Zod em português), 15 (campo do `ORDEM` com
  `error=`).
- **Commit ao fim de cada tarefa.** Branch: **`mao-de-obra-fase-2`**, já criada.
  Merge e push na `main` exigem autorização explícita do usuário.
- **Padrão de referência:** a fase 33.1 está na `main` e é o molde.
  `src/lib/actions/workers.ts` para action, `src/app/api/v1/workers/route.ts`
  para rota, `src/components/mao-de-obra/worker-form.tsx` para painel de
  escrita, `src/lib/actions/whatsapp-handlers/mao-de-obra.ts` para handler.
- **Suítes:** `m58` (nova, o serviço contratado). A `m57` continua sendo a da
  mão de obra fixa e não deve ser inflada.

## Onde o dinheiro mora, e por que isso é a parte delicada

Três números que a tela do §22 mostra, e **nenhum deles é gravado no
`ServiceJob`**:

| número | de onde vem |
|---|---|
| **total combinado** | `fechado`: `agreed_amount`. Senão: soma dos logs × `unit_price` |
| **já pago** | soma dos `FinancialEntry` com `status: paid` do serviço |
| **restante** | soma dos `FinancialEntry` com `status: pending` do serviço |

⚠️ **Os três podem divergir, e isso é informação, não defeito.** O produtor pode
editar um lançamento em `/financeiro`, e ali é onde o dinheiro de verdade mora.
A tela mostra os três lado a lado justamente para a divergência aparecer. Nunca
"corrija" um pelo outro.

---

## Task 1: o schema

**Arquivos:**
- Modificar: `prisma/schema.prisma`
- Criar: `prisma/migrations/20260904100000_servico_contratado/migration.sql`
- Modificar: `src/lib/prisma.ts` (`TENANT_SCOPED_MODELS`)
- Modificar: `src/lib/permissions.ts`

**Interfaces:**
- Produz: models `ServiceJob`, `ServiceJobLog`, `WorkerLog`; enums
  `ServiceDirection`, `ServicePricing`, `ServiceJobStatus`, `WorkerLogKind`;
  `ModuleKey` ganha `"servicos"`; `MachineMaintenance` ganha `contact_id`.

- [ ] **Passo 1: os enums e os três models**

```prisma
enum ServiceDirection {
  /// A fazenda CONTRATA (§15 a §18 da Mão de Obra, §29 de Máquinas). Despesa.
  contratado
  /// A fazenda PRESTA com máquina própria (§3.1 de Máquinas). Receita.
  /// Só a fase 34.1 escreve este valor; ele nasce aqui para o enum não mudar
  /// depois, o que exigiria migração numa tabela já cheia.
  prestado
}

/// As nove formas de cobrança: a união do §16 da Mão de Obra com o §11 de
/// Máquinas. `fechado` é o empreito do §15, e é o único em que `unit_price`
/// não se aplica.
enum ServicePricing {
  hora
  hectare
  dia
  viagem
  tonelada
  metro
  quilometro
  cabeca
  fechado
}

enum ServiceJobStatus {
  agendado
  em_andamento
  concluido
  cancelado
}

/// §12 (atividade realizada) e §34 (falta, folga, férias, afastamento) num
/// modelo só. Os dois são "uma anotação com data sobre um trabalhador", e o
/// documento é explícito que nenhum dos dois calcula nada.
enum WorkerLogKind {
  atividade
  falta
  folga
  ferias
  afastamento
}

/// O trabalho contratado de terceiro (§13 a §18 da Mão de Obra).
///
/// NENHUM SALDO MORA AQUI (invariante 2). `unit_price` e `agreed_amount` são o
/// COMBINADO, dado de entrada, não soma: mesma razão de `Negotiation.amount` e
/// de `Worker.pay_amount`. A quantidade é soma de `ServiceJobLog`, o total é
/// derivado dela, e o pago e o restante são somas de `FinancialEntry`.
model ServiceJob {
  id          String              @id @default(cuid())
  tenant_id   String
  property_id String
  direction   ServiceDirection    @default(contratado)
  status      ServiceJobStatus    @default(agendado)
  occurred_at DateTime
  /// O que foi feito: "Reforma de cerca", "Roçada". Texto livre, com as 19
  /// sugestões do §20 oferecidas na tela.
  description String

  pricing    ServicePricing
  /// Nulo quando `pricing` é `fechado`.
  unit_price Decimal?       @db.Decimal(14, 2)
  /// Só quando `pricing` é `fechado`: o valor combinado do empreito (§15).
  agreed_amount Decimal?    @db.Decimal(14, 2)

  /// §14: "vieram 3 homens". Multiplica a quantidade de dias na diária.
  /// 1 em todo o resto.
  worker_count Int @default(1)

  /// A contraparte. Os dois nulos no caso dos três homens sem nome do §14.
  contact_id String?
  worker_id  String?

  /// §25, §26, §27, §28: onde o trabalho aconteceu, e a que ele pertence.
  pasture_id          String?
  confinement_stay_id String?
  milk_site_id        String?

  /// §29 de Máquinas. Nulo em toda a fase 33.2: só a 34.1 preenche.
  /// ⚠️ Manutenção de máquina NÃO entra aqui: é `MachineMaintenance`, que já
  /// existe e já gera lançamento (decisão 10 da spec).
  machine_id String?

  notes String?

  canceled_at         DateTime?
  canceled_reason     String?
  canceled_by_user_id String?
  recorded_by_user_id String?
  created_at          DateTime  @default(now())
  updated_at          DateTime  @updatedAt

  tenant            Tenant          @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  property          Property        @relation(fields: [property_id], references: [id], onDelete: Restrict)
  contact           Contact?        @relation(fields: [contact_id], references: [id], onDelete: SetNull)
  worker            Worker?         @relation(fields: [worker_id], references: [id], onDelete: SetNull)
  pasture           Pasture?        @relation(fields: [pasture_id], references: [id], onDelete: SetNull)
  confinement_stay  HerdStay?       @relation(fields: [confinement_stay_id], references: [id], onDelete: SetNull)
  milk_site         MilkSite?       @relation(fields: [milk_site_id], references: [id], onDelete: SetNull)
  machine           Machine?        @relation(fields: [machine_id], references: [id], onDelete: SetNull)
  recorded_by       User?           @relation("ServiceJobRecordedBy", fields: [recorded_by_user_id], references: [id], onDelete: SetNull)
  canceled_by       User?           @relation("ServiceJobCanceledBy", fields: [canceled_by_user_id], references: [id], onDelete: SetNull)
  logs              ServiceJobLog[]

  @@index([tenant_id])
  @@index([tenant_id, status])
  @@index([tenant_id, occurred_at])
  @@index([confinement_stay_id])
  @@index([contact_id])
  @@index([worker_id])
}

/// A quantidade trabalhada, que é SEMPRE soma.
///
/// Um serviço de tiro único cria uma linha só. O §19 permite vários dias e o
/// §20 permite acrescentar "fiz 8 hectares hoje" ao serviço em andamento, e a
/// tela disso chega na fase 34.2; o modelo nasce agora para não haver migração
/// de dado de produção depois.
model ServiceJobLog {
  id             String    @id @default(cuid())
  tenant_id      String
  service_job_id String
  occurred_at    DateTime
  quantity       Decimal   @db.Decimal(14, 3)
  notes          String?
  /// Cancelar não apaga: para de contar e mantém a linha, como em HerdMovement.
  canceled_at    DateTime?
  created_at     DateTime  @default(now())

  service_job ServiceJob @relation(fields: [service_job_id], references: [id], onDelete: Cascade)

  @@index([tenant_id])
  @@index([service_job_id])
}

/// A anotação simples do §12 e do §34.
///
/// O §12 diz "o objetivo não será controlar cada minuto do trabalhador" e o §34
/// diz "o TIBÉ não deverá calcular automaticamente consequências trabalhistas".
/// Nada aqui alimenta cálculo nenhum: é data, tipo e descrição.
model WorkerLog {
  id          String        @id @default(cuid())
  tenant_id   String
  worker_id   String
  kind        WorkerLogKind
  occurred_at DateTime
  description String?
  property_id String?
  pasture_id  String?
  created_at  DateTime      @default(now())

  tenant   Tenant    @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  worker   Worker    @relation(fields: [worker_id], references: [id], onDelete: Cascade)
  property Property? @relation(fields: [property_id], references: [id], onDelete: SetNull)
  pasture  Pasture?  @relation(fields: [pasture_id], references: [id], onDelete: SetNull)

  @@index([tenant_id])
  @@index([worker_id])
}
```

- [ ] **Passo 2: o `contact_id` em `MachineMaintenance`**

Decisão 10: o §29 fica onde já está, e ganha só quem foi o mecânico.

```prisma
  /// §29 do Módulo 33: quem prestou a manutenção. O serviço em si continua
  /// sendo `MachineMaintenance`, e NÃO um `ServiceJob`: este model já tem
  /// data, descrição e custo, e já gera lançamento financeiro. Dois lugares
  /// para a mesma coisa é o que a decisão 3 da spec existe para evitar.
  contact_id String?
  contact    Contact? @relation(fields: [contact_id], references: [id], onDelete: SetNull)
```

E o índice `@@index([contact_id])` na mesma tabela.

- [ ] **Passo 3: as relações inversas**

Acrescente, em cada model:

- `Tenant`: `service_jobs ServiceJob[]` e `worker_logs WorkerLog[]`
- `Property`: `service_jobs ServiceJob[]` e `worker_logs WorkerLog[]`
- `Pasture`: `service_jobs ServiceJob[]` e `worker_logs WorkerLog[]`
- `Contact`: `service_jobs ServiceJob[]` e `machine_maintenances MachineMaintenance[]`
- `Worker`: `service_jobs ServiceJob[]` e `logs WorkerLog[]`
- `HerdStay`: `service_jobs ServiceJob[]`
- `MilkSite`: `service_jobs ServiceJob[]`
- `Machine`: `service_jobs ServiceJob[]`
- `User`: `service_jobs_recorded ServiceJob[] @relation("ServiceJobRecordedBy")` e
  `service_jobs_canceled ServiceJob[] @relation("ServiceJobCanceledBy")`

⚠️ `npx prisma validate` acusa relação inversa faltando. Rode-o antes de gerar
a migração, não depois.

- [ ] **Passo 4: `TENANT_SCOPED_MODELS`**

Em `src/lib/prisma.ts`, depois de `"Worker"`:

```ts
  "ServiceJob",
  "ServiceJobLog",
  "WorkerLog",
```

- [ ] **Passo 5: o `ModuleKey` `servicos`**

Em `src/lib/permissions.ts`, acrescente à união e à matriz:

```ts
  // Fase 33.2. Matriz OPERACIONAL, ao contrário de `mao_de_obra`: a diária de
  // um serviço não tem a sensibilidade de um salário, e quem viu o trabalho
  // acontecer é quem está no curral. O corte fica: OPERADOR registra "vieram 3
  // homens hoje" e continua sem enxergar quanto o vaqueiro ganha por mês.
  // Decisão do usuário em 02/09.
  servicos: { OWNER: W, ADMIN: W, OPERADOR: W, VISUALIZADOR: R },
```

⚠️ Acrescente à UNIÃO primeiro e rode `npx tsc --noEmit`: `ACCESS_MATRIX` é
`Record<ModuleKey, ...>` e tem que quebrar. Só então escreva a linha.

- [ ] **Passo 6: gerar e salvar a migração**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Salve em `prisma/migrations/20260904100000_servico_contratado/migration.sql`.

⚠️ **Se o SQL trouxer `DROP INDEX` de `WhatsAppProviderConfig_one_active` ou
`AnimalBatch_tenant_ear_tag_key`, APAGUE essas linhas.** São índices parciais
que o `schema.prisma` não representa, e derrubá-los quebra "no máximo 1 provider
ativo" e "brinco único por tenant".

- [ ] **Passo 7: aplicar no local e provar as duas travas**

```
docker start tibe-pg
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run db:deploy
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma generate
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:isolation
```

Depois **tire os três models de `TENANT_SCOPED_MODELS` e rode de novo**: tem que
reprovar nomeando os três. Devolva.

Confirme os índices parciais de pé:

```
docker exec tibe-pg psql -U tibe -d tibe_dev -t -c "SELECT indexname FROM pg_indexes WHERE indexname IN ('WhatsAppProviderConfig_one_active','AnimalBatch_tenant_ear_tag_key');"
```

- [ ] **Passo 8: `check`, `drift` e commit**

```
npm run check && DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:drift
git add prisma src/lib/prisma.ts src/lib/permissions.ts
git commit -m "Schema: o servico contratado, e o modulo de permissao servicos"
```

⚠️ **Este commit mexe em schema.** Não vai para a `main` antes de o usuário
aplicar a migração no Neon.

---

## Task 2: o total derivado, sem banco

Função pura, sozinha numa tarefa porque é a única aritmética do módulo e porque
as bordas (`fechado` sem `unit_price`, log cancelado, `worker_count`) são o que
um teste com fixture esconderia.

**Arquivos:**
- Criar: `src/lib/mao-de-obra/total-do-servico.ts`
- Criar: `scripts/m58-servico-contratado.test.ts`
- Modificar: `package.json`

**Interfaces:**
- Produz:
  ```ts
  export type ServicoParaTotal = {
    pricing: ServicePricing;
    unit_price: number | null;
    agreed_amount: number | null;
    worker_count: number;
  };
  export type LogParaTotal = { quantity: number; canceled_at: Date | null };
  export function quantidadeTrabalhada(logs: LogParaTotal[]): number;
  export function totalDoServico(s: ServicoParaTotal, logs: LogParaTotal[]): number;
  ```

- [ ] **Passo 1: escrever o bloco 1 da suíte**

`scripts/m58-servico-contratado.test.ts`, com o cabeçalho no molde da `m57`
(`import "dotenv/config"`, `exigirBancoLocal()`, a função `check`, e o
`process.exit(falhas === 0 ? 0 : 1)` no fim). O bloco:

```ts
console.log("1. O total derivado (§14, §15, §17, §18)");
const { totalDoServico, quantidadeTrabalhada } = await import(
  "@/lib/mao-de-obra/total-do-servico"
);
const log = (q: number, cancelado = false) => ({
  quantity: q,
  canceled_at: cancelado ? new Date() : null,
});

check(
  "§14: 3 homens por 4 dias a 150 dá 12 diárias e R$ 1.800",
  totalDoServico(
    { pricing: "dia", unit_price: 150, agreed_amount: null, worker_count: 3 },
    [log(4)],
  ) === 1800,
);
check(
  "e a quantidade trabalhada é 4, não 12: worker_count multiplica o VALOR",
  quantidadeTrabalhada([log(4)]) === 4,
);
check(
  "§15: empreito de R$ 6.000 ignora quantidade e preço unitário",
  totalDoServico(
    { pricing: "fechado", unit_price: null, agreed_amount: 6000, worker_count: 1 },
    [log(999)],
  ) === 6000,
);
check(
  "§17: 30 hectares a 120 dá R$ 3.600",
  totalDoServico(
    { pricing: "hectare", unit_price: 120, agreed_amount: null, worker_count: 1 },
    [log(30)],
  ) === 3600,
);
check(
  "§19: vários dias somam (5 + 7 + 4 horas a 250 dá R$ 4.000)",
  totalDoServico(
    { pricing: "hora", unit_price: 250, agreed_amount: null, worker_count: 1 },
    [log(5), log(7), log(4)],
  ) === 4000,
);
check(
  "log CANCELADO não conta",
  totalDoServico(
    { pricing: "hora", unit_price: 250, agreed_amount: null, worker_count: 1 },
    [log(5), log(7, true)],
  ) === 1250,
);
check(
  "sem log nenhum, o total é zero, não NaN",
  totalDoServico(
    { pricing: "hectare", unit_price: 120, agreed_amount: null, worker_count: 1 },
    [],
  ) === 0,
);
check(
  "preço unitário nulo fora do fechado devolve zero, não NaN",
  totalDoServico(
    { pricing: "hectare", unit_price: null, agreed_amount: null, worker_count: 1 },
    [log(30)],
  ) === 0,
);
check(
  "fechado SEM agreed_amount devolve zero, não cai no unit_price",
  totalDoServico(
    { pricing: "fechado", unit_price: 999, agreed_amount: null, worker_count: 1 },
    [log(2)],
  ) === 0,
);
check(
  "decimal não vira dízima: 2,5 horas a 250 dá 625",
  totalDoServico(
    { pricing: "hora", unit_price: 250, agreed_amount: null, worker_count: 1 },
    [log(2.5)],
  ) === 625,
);
```

- [ ] **Passo 2: `"test:m58": "tsx scripts/m58-servico-contratado.test.ts",` no `package.json`, e rodar**

Esperado: `ERR_MODULE_NOT_FOUND`.

- [ ] **Passo 3: implementar**

```ts
import type { ServicePricing } from "@/generated/prisma/client";

/**
 * O total de um serviço (§14, §15, §17, §18 do Módulo 33).
 *
 * DERIVADO, sempre. O `ServiceJob` guarda o COMBINADO (preço unitário ou valor
 * fechado), que é dado de entrada; a quantidade é a soma dos logs. Um total
 * gravado divergiria do que o produtor lançou, em silêncio, que é a razão de o
 * saldo do rebanho e o do estoque também serem soma.
 *
 * `worker_count` multiplica o VALOR, não a quantidade. O §14 é explícito: 3
 * homens por 4 dias são "12 diárias", mas o serviço durou 4 dias. Somar 12 na
 * quantidade faria a tela dizer que a cerca levou doze dias.
 */
export type ServicoParaTotal = {
  pricing: ServicePricing;
  unit_price: number | null;
  agreed_amount: number | null;
  worker_count: number;
};

export type LogParaTotal = { quantity: number; canceled_at: Date | null };

/** A quantidade trabalhada: soma dos logs NÃO cancelados. */
export function quantidadeTrabalhada(logs: LogParaTotal[]): number {
  return logs
    .filter((l) => l.canceled_at === null)
    .reduce((soma, l) => soma + (Number.isFinite(l.quantity) ? l.quantity : 0), 0);
}

export function totalDoServico(s: ServicoParaTotal, logs: LogParaTotal[]): number {
  if (s.pricing === "fechado") {
    // Sem valor combinado, o total é ZERO, nunca o `unit_price`: um empreito
    // sem valor é um cadastro incompleto, e cair no preço unitário inventaria
    // um número que ninguém combinou.
    return Number.isFinite(s.agreed_amount ?? NaN) ? (s.agreed_amount as number) : 0;
  }
  if (!Number.isFinite(s.unit_price ?? NaN)) return 0;
  const pessoas = Number.isFinite(s.worker_count) && s.worker_count > 0 ? s.worker_count : 1;
  return quantidadeTrabalhada(logs) * (s.unit_price as number) * pessoas;
}
```

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: quebrar de propósito**

Troque `pessoas` por `1` na última linha. O caso do §14 (R$ 1.800) tem que ficar
vermelho, e só ele. Devolva.

- [ ] **Passo 6: commit**

```
git add src/lib/mao-de-obra/total-do-servico.ts scripts/m58-servico-contratado.test.ts package.json
git commit -m "Servico: o total derivado, e o worker_count que multiplica valor e nao quantidade"
```

---

## Task 3: criar, listar e detalhar o serviço

**Arquivos:**
- Criar: `src/lib/actions/service-jobs.ts`
- Modificar: `scripts/m58-servico-contratado.test.ts` (blocos 2 a 5)

**Interfaces:**
- Consome: `totalDoServico`, `quantidadeTrabalhada`, `createLinkedEntry`,
  `runSerializableTenantTransaction`, `scoped`, `ok`, `fail`.
- Produz:
  ```ts
  export const SERVICOS_SUGERIDOS: readonly string[];   // as 19 do §20
  export type ServiceJobInput = {
    property_id: string;
    occurred_at: Date;
    description: string;
    pricing: ServicePricing;
    unit_price?: number | null;
    agreed_amount?: number | null;
    quantity?: number | null;      // vira o PRIMEIRO ServiceJobLog
    worker_count?: number | null;
    contact_id?: string | null;
    contact_name?: string | null;  // cria o contato pelo nome dito
    worker_id?: string | null;
    pasture_id?: string | null;
    confinement_stay_id?: string | null;
    milk_site_id?: string | null;
    notes?: string | null;
    pago?: boolean;                // §21: à vista
    due_date?: Date | null;        // §21: futuro
  };
  export type ServiceJobView = {
    id: string; direction: string; status: string;
    occurred_at: string; description: string;
    pricing: string; unit_price: number | null; agreed_amount: number | null;
    worker_count: number;
    quantidade: number; total: number; pago: number; restante: number;
    contact_id: string | null; contact_name: string | null;
    worker_id: string | null; worker_name: string | null;
    property_id: string; pasture_id: string | null;
    confinement_stay_id: string | null; milk_site_id: string | null;
    notes: string | null; canceled_at: string | null;
  };
  export type ServiceJobDetailView = ServiceJobView & {
    logs: { id: string; occurred_at: string; quantity: number; notes: string | null; canceled_at: string | null }[];
    entries: { id: string; amount: number; status: string; due_date: string | null; paid_at: string | null }[];
  };
  export function listServiceJobs(db, filtro?): Promise<ServiceJobView[]>;
  export function createServiceJob(db, input): Promise<ActionResult<ServiceJobView>>;
  export function getServiceJobDetail(db, id): Promise<ActionResult<ServiceJobDetailView>>;
  ```

- [ ] **Passo 1: escrever os blocos 2 a 5**

O bloco 2 é o exemplo do §14 e vai escrito por inteiro, porque é o molde dos
outros:

```ts
console.log("\n2. §13 e §14: a diária dos três homens");
const cerca = await createServiceJob(db, {
  property_id: fazenda.id,
  occurred_at: new Date("2026-09-01"),
  description: "Reforma de cerca",
  pricing: "dia",
  unit_price: 150,
  quantity: 4,
  worker_count: 3,
  contact_name: "Turma da cerca",
});
check("cadastro devolve ok", cerca.ok, cerca.ok ? "" : cerca.message);
if (!cerca.ok) throw new Error("createServiceJob falhou");

check("a quantidade é 4 DIAS, não 12", cerca.data.quantidade === 4, String(cerca.data.quantidade));
check("o total é R$ 1.800 (12 diárias)", cerca.data.total === 1800, String(cerca.data.total));
check("pago 0", cerca.data.pago === 0);
check("restante 1.800", cerca.data.restante === 1800);
check(
  "nasceu UM log com a quantidade",
  (await db.serviceJobLog.count({ where: { service_job_id: cerca.data.id } })) === 1,
);
const contas = await db.financialEntry.findMany({
  where: { related_module: "servico", related_id: cerca.data.id },
});
check("e UMA conta a pagar", contas.length === 1, String(contas.length));
check("pendente", contas[0]?.status === "pending");
check("como despesa", contas[0]?.entry_type === "expense");
check("no valor total", Number(contas[0]?.amount) === 1800);
check(
  "o contato foi criado pelo nome dito",
  (await db.contact.count({ where: { name: "Turma da cerca" } })) === 1,
);
```

Os demais provam:

- **Bloco 3 (§15):** o empreito de R$ 6.000 com `pricing: "fechado"` não exige
  quantidade, e o total é o combinado.
- **Bloco 4 (§21 à vista):** `pago: true` cria o lançamento já quitado, e
  `restante` é zero. E `pago: true` com `due_date` é recusado no campo
  `due_date`, porque pagar à vista e ter vencimento é contradição.
- **Bloco 5, as recusas, todas com `field`:** descrição vazia (`description`);
  `pricing` diferente de `fechado` sem `unit_price` (`unit_price`);
  `fechado` sem `agreed_amount` (`agreed_amount`); `unit_price` zero ou
  negativo (`unit_price`); fazenda inexistente (`property_id`, 404). E que
  nenhuma delas deixou serviço nem lançamento órfão no banco.

- [ ] **Passo 2: rodar e ver falhar**

- [ ] **Passo 3: implementar**

Pontos que a suíte cobra, e que o implementador precisa acertar:

1. `SERVICOS_SUGERIDOS` com as 19 do §20: Construção de cerca, Reforma de cerca,
   Roçada, Gradagem, Aração, Plantio, Adubação, Calagem, Colheita, Silagem,
   Transporte, Manutenção de máquina, Serviço veterinário, Vacinação,
   Inseminação, Construção, Eletricista, Limpeza, Outros.
2. Validação em ordem, **sempre com `field`**.
3. **Tudo numa transação** (`runSerializableTenantTransaction`): o serviço, o
   primeiro log e o lançamento nascem juntos ou não nascem.
4. `contact_name` sem `contact_id` chama `findOrCreateContact` **dentro da
   transação**, como `negotiations.ts` faz, para uma recusa não deixar contato
   órfão.
5. O lançamento: `createLinkedEntry` com
   `{ entry_type: "expense", category: "Serviço terceirizado", related_module: "servico", related_id: job.id }`,
   `status` `paid` quando `pago`, senão `pending` com o `due_date` informado (ou
   a data do serviço quando não houver).
6. `direction` é sempre `contratado` nesta fase. A action **não aceita**
   `prestado`: a fase 34.1 é que abre esse caminho, e aceitá-lo agora criaria
   receita sem tela para vê-la.
7. `machine_id` **não é aceito** nesta fase, pela decisão 10: manutenção de
   máquina é `MachineMaintenance`. Se alguém passar, recuse com
   `field: "machine_id"` e a mensagem apontando para Máquinas.

- [ ] **Passo 4: o §24, que é Meu Dia**

O §24 pede que "atividades futuras" virem compromisso ("Tratorista vem
terça-feira"), e ele está no escopo desta fase. Quando `occurred_at` for **no
futuro**, `createServiceJob` cria uma `Task` na mesma transação:

```ts
    // §24: serviço marcado para o futuro vira compromisso no Meu Dia. O
    // `Task` é o modelo do Módulo 27, e reusá-lo é o que faz o compromisso
    // aparecer no lugar onde o produtor já olha, com o lembrete que ele já
    // tem. Nada de agenda nova.
    if (input.occurred_at.getTime() > Date.now()) {
      await tx.task.create({
        data: scoped({
          title: `${input.description}: ${nomeDaContraparte ?? "serviço contratado"}`,
          due_date: input.occurred_at,
          remind: true,
        }),
      });
    }
```

Acrescente ao bloco 2 da suíte um caso: um serviço com data futura cria a
`Task`, e um com data de hoje ou passada **não** cria. Sem o segundo caso, a
regra passaria criando tarefa para todo serviço registrado depois do fato, que é
a maioria.

⚠️ **`Task` não tem `related_id`**, então o vínculo é só o texto do título. É
uma limitação conhecida do Módulo 27, não descuido: ligar os dois exigiria mexer
naquele model, e o §24 pede que o compromisso "apareça", não que seja navegável.

- [ ] **Passo 5: rodar e ver passar**

- [ ] **Passo 6: provar a transação**

Force um erro depois de criar o serviço e antes do lançamento (jogue um `throw`
temporário). Confirme que **nenhum** dos três sobrou no banco. Devolva.

- [ ] **Passo 7: commit**

```
git add src/lib/actions/service-jobs.ts scripts/m58-servico-contratado.test.ts
git commit -m "Servico: criar, listar e detalhar o contratado, e o compromisso do §24"
```

---

## Task 4: o pagamento com saldo aberto (§21, §22)

**Arquivos:**
- Modificar: `src/lib/actions/service-jobs.ts`
- Modificar: `scripts/m58-servico-contratado.test.ts` (blocos 6 a 8)

**Interfaces:**
- Produz:
  ```ts
  export function recordServiceJobPayment(db, input: {
    service_job_id: string; amount: number; paid_at?: Date; notes?: string | null;
  }): Promise<ActionResult<{ pago: number; restante: number }>>;
  export function cancelServiceJob(db, input: {
    service_job_id: string; reason?: string | null; user_id?: string | null;
  }): Promise<ActionResult<{ id: string }>>;
  ```

- [ ] **Passo 1: escrever os blocos, que falham**

O **bloco 6 é o exemplo literal do §22** e não pode ser resumido:

```ts
console.log("\n6. §22: o exemplo literal (10.000, adianta 3.000, sobram 7.000)");
const empreito = await createServiceJob(db, {
  property_id: fazenda.id,
  occurred_at: new Date("2026-09-01"),
  description: "Construção de curral",
  pricing: "fechado",
  agreed_amount: 10000,
  contact_name: "Pedro Pedreiro",
});
if (!empreito.ok) throw new Error("createServiceJob falhou");
check("total 10.000", empreito.data.total === 10000);
check("pago 0", empreito.data.pago === 0);
check("restante 10.000", empreito.data.restante === 10000);

const parcial = await recordServiceJobPayment(db, {
  service_job_id: empreito.data.id,
  amount: 3000,
});
check("o pagamento parcial é aceito", parcial.ok, parcial.ok ? "" : parcial.message);
check("pago vira 3.000", parcial.ok && parcial.data.pago === 3000);
check("restante vira 7.000", parcial.ok && parcial.data.restante === 7000);

const depois = await getServiceJobDetail(db, empreito.data.id);
check(
  "e o serviço tem DOIS lançamentos: um pago e um pendente",
  depois.ok && depois.data.entries.length === 2,
  depois.ok ? String(depois.data.entries.length) : "recusado",
);
check(
  "o total combinado NÃO mudou",
  depois.ok && depois.data.total === 10000,
  depois.ok ? String(depois.data.total) : "recusado",
);
```

O **bloco 7** prova o fechamento: pagar os R$ 7.000 restantes deixa `restante` em
zero, **nenhum lançamento pendente sobra**, e um pagamento a mais é recusado com
mensagem dizendo que já está quitado.

O **bloco 8** prova o cancelamento (§17.9 do Módulo 31, aplicado aqui): cancelar
o serviço cancela os lançamentos **pendentes**, deixa os **pagos** de pé, marca
`canceled_at`, e o serviço some da listagem padrão mas continua no detalhe.

⚠️ **Um caso que não pode faltar:** pagar mais que o restante é recusado no
campo `amount`, com a mensagem dizendo quanto falta. Sem isso, um dedo pesado
transforma R$ 700 em R$ 7.000 e o serviço fica com saldo negativo.

- [ ] **Passo 2: rodar e ver falhar**

- [ ] **Passo 3: implementar**

Regras que a suíte cobra:

1. `recordServiceJobPayment` roda em transação: cria um lançamento **pago** com
   o valor, e **reduz** o pendente pelo mesmo valor. Quando o pendente chega a
   zero, ele é **apagado**: uma conta a pagar de R$ 0,00 na tela do Financeiro
   seria ruído, e o histórico do que foi pago está nos lançamentos pagos.
2. Recusa `amount` maior que o restante, com `field: "amount"` e a mensagem
   dizendo o valor que falta.
3. Recusa pagamento em serviço já quitado (nenhum pendente), com 409 e a
   mensagem dizendo que já está pago.
4. Recusa pagamento em serviço cancelado.
5. `cancelServiceJob` apaga os lançamentos pendentes e **nunca** os pagos, marca
   `canceled_at`, `canceled_reason` e `canceled_by_user_id`, e **não** apaga os
   logs: o §40.8 exige histórico.

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: quebrar de propósito**

Tire a recusa de "pagar mais que o restante". O teste tem que mostrar o
`restante` negativo. Devolva.

- [ ] **Passo 6: commit**

```
git add src/lib/actions/service-jobs.ts scripts/m58-servico-contratado.test.ts
git commit -m "Servico: o saldo aberto do §22, e o cancelamento que preserva o pago"
```

---

## Task 5: o custo do lote passa a enxergar o serviço

⚠️ **Esta tarefa toca `src/lib/actions/confinement.ts`, que está em produção.**
É a decisão 12 da spec, e é a única desta fase que mexe em código de outro
módulo.

**Arquivos:**
- Modificar: `src/lib/actions/confinement.ts:440-457` (o `Promise.all` e o
  cálculo de `financial_cost`)
- Modificar: `scripts/m58-servico-contratado.test.ts` (bloco 9)

**Interfaces:**
- Consome: `ServiceJob.confinement_stay_id` da Task 1.
- Produz: `ConfinementLotSummary.financial_cost` passa a incluir os serviços.

- [ ] **Passo 1: rodar a `m51` ANTES e anotar**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:6390" npm run test:m51
```

**Anote se estava verde.** Sem isso, um vermelho pré-existente vira "regressão".

- [ ] **Passo 2: escrever o bloco 9, que falha**

```ts
console.log("\n9. §27: o custo do lote de confinamento passa a ver o serviço");
const { getConfinementLotSummary, openConfinementStay, createConfinementSite } =
  await import("@/lib/actions/confinement");

// A fixture: um confinamento próprio com um lote aberto. Confira a assinatura
// real de `openConfinementStay` em `src/lib/actions/confinement.ts` antes de
// colar: ela exige categoria e quantidade, e a `m51` já monta este cenário.
const site = await createConfinementSite(db, {
  type: "proprio",
  name: "Curral M58",
  property_id: fazenda.id,
});
if (!site.ok) throw new Error("createConfinementSite falhou");
const aberto = await openConfinementStay(db, {
  confinement_site_id: site.data.id,
  property_id: fazenda.id,
  category_id: "boi_25_36",
  quantity: 20,
  started_at: new Date("2026-08-01"),
});
if (!aberto.ok) throw new Error("openConfinementStay falhou");
const lote = aberto.data;

const antes = await getConfinementLotSummary(db, lote.id);
check("o lote começa sem custo de serviço", antes.ok && antes.data.financial_cost === 0);

const tratorista = await createServiceJob(db, {
  property_id: fazenda.id,
  occurred_at: new Date("2026-09-01"),
  description: "Trato do confinamento",
  pricing: "dia",
  unit_price: 200,
  quantity: 5,
  confinement_stay_id: lote.id,
  contact_name: "Tratorista do lote",
});
if (!tratorista.ok) throw new Error("createServiceJob falhou");
check("o serviço custa R$ 1.000", tratorista.data.total === 1000);

const depoisDoServico = await getConfinementLotSummary(db, lote.id);
check(
  "e o CUSTO DO LOTE passou a incluí-lo",
  depoisDoServico.ok && depoisDoServico.data.financial_cost === 1000,
  depoisDoServico.ok ? String(depoisDoServico.data.financial_cost) : "recusado",
);

// A outra ponta: o serviço acha o PRÓPRIO dinheiro, que é o §22.
const detalhe = await getServiceJobDetail(db, tratorista.data.id);
check(
  "e o serviço continua achando o próprio lançamento",
  detalhe.ok && detalhe.data.restante === 1000,
  detalhe.ok ? String(detalhe.data.restante) : "recusado",
);

// Cancelar o serviço tira o custo do lote.
await cancelServiceJob(db, { service_job_id: tratorista.data.id });
const depoisDoCancelamento = await getConfinementLotSummary(db, lote.id);
check(
  "cancelar o serviço tira o custo do lote",
  depoisDoCancelamento.ok && depoisDoCancelamento.data.financial_cost === 0,
  depoisDoCancelamento.ok ? String(depoisDoCancelamento.data.financial_cost) : "recusado",
);
```

- [ ] **Passo 3: rodar e ver falhar**

Esperado: o custo do lote continua zero depois do serviço.

- [ ] **Passo 4: alterar `confinement.ts`**

No `Promise.all` de `getConfinementLotSummary`, acrescente uma quarta consulta:

```ts
    // Os serviços amarrados a este lote (§27 do Módulo 33). O lançamento de um
    // serviço aponta para o SERVIÇO, não para a estadia, porque o §22 exige que
    // o serviço saiba quanto dele já foi pago. `related_id` aponta para uma
    // coisa só, então o lote soma por junção. Ver a decisão 12 em
    // docs/superpowers/specs/2026-09-02-mao-de-obra-e-servicos-com-maquinas-design.md
    db.serviceJob.findMany({
      where: { confinement_stay_id: stayId, canceled_at: null },
      select: { id: true },
    }),
```

E depois dela, as despesas desses serviços:

```ts
  const custosDeServico =
    servicos.length === 0
      ? []
      : await db.financialEntry.findMany({
          where: {
            related_module: "servico",
            related_id: { in: servicos.map((s) => s.id) },
            entry_type: "expense",
          },
        });

  const financial_cost =
    custos.reduce((soma, c) => soma + (decToNum(c.amount) ?? 0), 0) +
    custosDeServico.reduce((soma, c) => soma + (decToNum(c.amount) ?? 0), 0);
```

Atualize o comentário do campo `financial_cost` no tipo `ConfinementLotSummary`
para dizer que ele soma as duas origens.

- [ ] **Passo 5: rodar a `m58` e a `m51`**

A `m58` verde, e a `m51` no mesmo estado do passo 1. **Qualquer suíte que mudou
de verde para vermelha é regressão desta tarefa e para o trabalho.**

- [ ] **Passo 6: quebrar de propósito**

Tire a segunda consulta. O bloco 9 tem que voltar a mostrar custo zero. Devolva.

- [ ] **Passo 7: commit**

```
git add src/lib/actions/confinement.ts scripts/m58-servico-contratado.test.ts
git commit -m "Confinamento: o custo do lote passa a somar os servicos amarrados a ele"
```

---

## Task 6: a anotação de atividade e ausência (§12, §34)

**Arquivos:**
- Criar: `src/lib/actions/worker-logs.ts`
- Modificar: `scripts/m58-servico-contratado.test.ts` (bloco 10)

**Interfaces:**
- Produz:
  ```ts
  export type WorkerLogInput = {
    worker_id: string;
    kind: "atividade" | "falta" | "folga" | "ferias" | "afastamento";
    occurred_at: Date;
    description?: string | null;
    property_id?: string | null;
    pasture_id?: string | null;
  };
  export type WorkerLogView = {
    id: string; kind: string; occurred_at: string;
    description: string | null; property_id: string | null; pasture_id: string | null;
  };
  export function listWorkerLogs(db, workerId: string): Promise<WorkerLogView[]>;
  export function createWorkerLog(db, input): Promise<ActionResult<WorkerLogView>>;
  export function deleteWorkerLog(db, id: string): Promise<ActionResult<{ id: string }>>;
  ```

- [ ] **Passo 1: escrever o bloco 10, que falha**

Prova: cria uma atividade e uma falta; a listagem devolve as duas em ordem
decrescente de data; trabalhador inexistente devolve 404; `kind` inválido é
recusado no campo; apagar apaga (aqui **apagar é apagar**, e é a exceção
deliberada do módulo, porque uma anotação errada não é histórico de dinheiro).

⚠️ **Um caso que prova a decisão do documento:** criar uma falta e conferir que
**nenhum `FinancialEntry` nasceu**. O §34 diz que o Tibé "não deverá calcular
automaticamente consequências trabalhistas", e desconto por falta é exatamente
o que este teste impede de aparecer sem decisão de produto.

- [ ] **Passo 2: rodar, ver falhar, implementar, ver passar**

A action é fina: valida `worker_id` existente, valida `kind` pelo enum, grava.
Nada de cálculo, nada de dinheiro.

- [ ] **Passo 3: commit**

```
git add src/lib/actions/worker-logs.ts scripts/m58-servico-contratado.test.ts
git commit -m "Mao de obra: a anotacao de atividade e ausencia, que nao calcula nada"
```

---

## Task 7: o resumo do §30

**Arquivos:**
- Criar: `src/lib/actions/labor-summary.ts`
- Modificar: `scripts/m58-servico-contratado.test.ts` (bloco 11)

**Interfaces:**
- Produz:
  ```ts
  export type LaborSummary = {
    fixa: number;
    eventual: number;
    terceirizados: number;
    total: number;
  };
  export function getLaborSummary(db, periodo: { de: Date; ate: Date }): Promise<LaborSummary>;
  ```

- [ ] **Passo 1: escrever o bloco 11, que falha**

O §30 pede o gasto separado em três, e **a regra de classificação precisa estar
escrita, porque não é óbvia**:

| coluna | o que soma |
|---|---|
| **fixa** | `FinancialEntry` pagos com `related_module: mao_de_obra` |
| **eventual** | pagos de `ServiceJob` com `worker_id` preenchido, ou sem contraparte nenhuma (os três homens sem nome do §14) |
| **terceirizados** | pagos de `ServiceJob` com `contact_id` preenchido |

O teste monta um de cada e confere os três números e o total. E confere que
**pendente não entra**: o §30 pergunta "quanto estou GASTANDO", e conta a pagar
não é gasto ainda.

- [ ] **Passo 2: rodar, ver falhar, implementar, ver passar**

- [ ] **Passo 3: quebrar de propósito**

Faça a coluna `eventual` somar também os que têm `contact_id`. O teste tem que
mostrar `terceirizados` e `eventual` contando o mesmo dinheiro. Devolva.

- [ ] **Passo 4: commit**

```
git add src/lib/actions/labor-summary.ts scripts/m58-servico-contratado.test.ts
git commit -m "Mao de obra: o resumo do §30, separado em fixa, eventual e terceirizados"
```

---

## Task 8: as rotas

**Arquivos:**
- Criar: `src/app/api/v1/service-jobs/route.ts`
- Criar: `src/app/api/v1/service-jobs/[id]/route.ts`
- Criar: `src/app/api/v1/service-jobs/[id]/payments/route.ts`
- Criar: `src/app/api/v1/workers/[id]/logs/route.ts`
- Modificar: `src/app/(public)/docs/api/endpoints.ts`

- [ ] **Passo 1: escrever as rotas**

Copie a estrutura de `src/app/api/v1/workers/[id]/route.ts`, que já tem a forma
exata (`props: { params: Promise<{ id: string }> }`, `readJson` devolvendo
`{ json }` ou `{ error }`, `apiErroDeZod`, `apiError` com `res.field`).

Guard: **`servicos`** nas quatro, exceto `/workers/[id]/logs`, que usa
`mao_de_obra` (é a ficha do trabalhador, e quem não vê salário não vê a ficha).

⚠️ **A recusa do Zod precisa sair em português e dizer o campo** (conferência
12). Use `apiErroDeZod`, nunca `error.message` cru.

`DELETE /service-jobs/[id]` **cancela**, não apaga, e chama
`cancelServiceJob`.

- [ ] **Passo 2: registrar em `/docs/api` e rodar**

```
npm run test:docs-api && npm run check && npx tsc --noEmit
```

- [ ] **Passo 3: provar a permissão, e que ela é DIFERENTE da de salário**

Acrescente ao bloco 11 da `m58`:

```ts
check("OPERADOR ESCREVE serviço", canWrite("OPERADOR", "servicos"));
check("mas NÃO escreve mão de obra", !canWrite("OPERADOR", "mao_de_obra"));
check("VISUALIZADOR lê serviço", canAccess("VISUALIZADOR", "servicos"));
check("mas NÃO lê mão de obra", !canAccess("VISUALIZADOR", "mao_de_obra"));
```

Depois troque o `W` do OPERADOR em `servicos` por `N` e veja duas ficarem
vermelhas. Devolva.

- [ ] **Passo 4: commit**

```
git add src/app/api/v1/service-jobs src/app/api/v1/workers "src/app/(public)/docs/api/endpoints.ts" scripts/m58-servico-contratado.test.ts
git commit -m "Servico: as rotas do contratado, dos pagamentos e das anotacoes"
```

---

## Task 9: as telas

**Arquivos:**
- Criar: `src/app/(dashboard)/servicos/page.tsx`
- Criar: `src/app/(dashboard)/servicos/[id]/page.tsx`
- Criar: `src/components/servicos/service-job-form.tsx`
- Criar: `src/components/servicos/service-payment-form.tsx`
- Criar: `src/components/servicos/service-cancel-button.tsx`
- Criar: `src/components/servicos/labels.ts`
- Modificar: `src/app/(dashboard)/mao-de-obra/[id]/page.tsx` (a ficha ganha as
  anotações do §12 e §34, e os serviços do trabalhador)
- Modificar: `src/app/(dashboard)/mao-de-obra/page.tsx` (o resumo do §30)
- Modificar: `src/lib/nav.ts`

- [ ] **Passo 1: os rótulos**

`Record` completo de `ServicePricing`, `ServiceJobStatus` e `WorkerLogKind`, mais
a frase de cada cobrança ("por hora", "por hectare", "fechado"), pelo mesmo
motivo de sempre: valor novo no enum quebra a compilação até ganhar rótulo.

- [ ] **Passo 2: o painel de escrita do serviço**

`ORDEM = ["description", "pricing", "unit_price", "agreed_amount", "quantity", "worker_count", "occurred_at", "contact_name", "property_id", "pasture_id", "confinement_stay_id", "milk_site_id", "pago", "due_date", "notes"]`.

⚠️ **Campo que some da tela não pode ser cobrado.** `unit_price` e `quantity`
desaparecem quando a cobrança é `fechado`, e `agreed_amount` desaparece quando
não é. Cobrar um campo oculto manda o foco para um `id` que não está no DOM: a
recusa aparece e nada acontece. Condicione a cobrança à visibilidade.

⚠️ **Todo campo do `ORDEM` precisa de `error=` no `<Field>`** (conferência 15).
Foi assim que oito campos mudos passaram de uma vez na tela do Confinamento.

⚠️ **Dinheiro e quantidade usam `MoneyInput`**, nunca `<input type="number">`
(conferência 7).

- [ ] **Passo 3: a listagem**

Serviços em andamento e concluídos, com prestador, serviço, valor e situação de
pagamento (§38 da Mão de Obra pede "Serviços em andamento: prestador, serviço,
valor, situação"). Mais os três números do §30 no topo.

⚠️ **Nenhuma cor crua do Tailwind** (conferência 8) e **nada de
`bg-tibe-light`**, que é o próprio fundo do painel e deixa a pílula invisível.

- [ ] **Passo 4: o detalhe**

Os quatro números do §22 (total, pago, restante, próximo vencimento), a lista de
lançamentos, os logs de quantidade, e os botões de pagamento e cancelamento.

- [ ] **Passo 5: a ficha do trabalhador ganha o que faltava**

Em `/mao-de-obra/[id]`, duas seções novas: as anotações (§12, §34) e os serviços
em que ele entrou como diarista.

- [ ] **Passo 6: o menu**

Em `src/lib/nav.ts`, no grupo "Operação", depois de "Mão de Obra":

```ts
        // Fase 33.2: o serviço contratado. Fica ao lado de Mão de Obra porque
        // é a outra metade da mesma pergunta do §36 (quem trabalha x quem
        // entrega serviço), e separado dela porque a permissão é outra:
        // OPERADOR registra serviço e não vê salário.
        {
          href: "/servicos",
          label: "Serviços",
          show: hasFazenda && canAccess(role, "servicos"),
        },
```

⚠️ **Item dentro de grupo nasce invisível se o grupo estiver fechado.** Confira
no navegador que ele aparece, não só que o arquivo compila.

- [ ] **Passo 7: `check`, `tsc`, `lint`**

- [ ] **Passo 8: validar no navegador (invariante 8)**

⚠️ **Reinicie o `next dev` antes**, porque esta fase acrescentou models e o
servidor serve o client Prisma que existia quando subiu. É a armadilha
documentada em `docs/conhecimento/dev-server-servido-com-client-prisma-velho.md`
e ela mordeu de novo na fase 33.1.

```
npx tsx scripts/_sessao-local.ts
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:6390" npm run dev
```

Confirme, **olhando**: o item no menu; o exemplo do §14 (3 homens, 4 dias, 150)
mostrando 12 diárias e R$ 1.800; o exemplo do §22 (10.000, adianta 3.000, sobram
7.000); a despesa aparecendo em `/financeiro` sob "Serviço"; e o formulário com
descrição vazia mostrando a mensagem **embaixo do campo**.

⚠️ Use o **browser-harness**, não o `claude-in-chrome`. E confirme que a aba que
respondeu é a desta máquina.

- [ ] **Passo 9: commit**

```
git add "src/app/(dashboard)/servicos" src/components/servicos "src/app/(dashboard)/mao-de-obra" src/lib/nav.ts
git commit -m "Servico: a tela do contratado, do pagamento e das anotacoes"
```

---

## Task 10: os handlers do WhatsApp

**Arquivos:**
- Criar: `src/lib/actions/whatsapp-handlers/servico.ts`
- Criar: `src/lib/actions/service-pending.ts`
- Modificar: `src/lib/whatsapp-intents.ts`, `src/lib/actions/whatsapp-router.ts`
- Modificar: `scripts/m58-servico-contratado.test.ts` (blocos 12 a 14)

**Interfaces:**
- Consome: `criarStoreDePendencia` de `@/lib/actions/pending-store`.
- Produz: as intenções `registrar_diaria` e `registrar_servico_contratado`.

- [ ] **Passo 1: o store, que é uma chamada só**

`service-pending.ts` é `criarStoreDePendencia` com
`prefixo: "servico-pending"` e o mapa de atalhos. **Se você se pegar copiando
90 linhas de Redis, a extração da fase 33.1 não foi lida.**

- [ ] **Passo 2: escrever os blocos, imitando o produtor real**

⚠️ **No segundo turno, mande APENAS o campo que faltava.** O classificador do
n8n NÃO remonta o pedido, e uma suíte que reenvia o pacote inteiro fica verde
com a conversa quebrada.

Provar, no mínimo:

- §32: "Vieram 3 homens trabalhar na cerca por 4 dias, 150 a diária" pede
  confirmação mostrando **12 diárias e R$ 1.800**, e só grava no "sim";
- "O Pedro fez a cerca por 6 mil" vira empreito com confirmação;
- **"não, deixa pra lá" cancela e não grava nada**, checado antes de tudo;
- **o "sim" executa o MOSTRADO**: mande um valor diferente no turno da
  confirmação e prove que o guardado venceu;
- **nome de prestador ambíguo PERGUNTA**, copiando a forma de
  `resolverTrabalhador` em `mao-de-obra.ts`, que já resolve isso.

- [ ] **Passo 3: implementar, rodar, e provar as duas travas quebrando**

- [ ] **Passo 4: commit**

```
git add src/lib/actions/whatsapp-handlers/servico.ts src/lib/actions/service-pending.ts src/lib/whatsapp-intents.ts src/lib/actions/whatsapp-router.ts scripts/m58-servico-contratado.test.ts
git commit -m "Servico: os handlers da diaria e do empreito, com o classificador congelado"
```

---

## Task 11: fechar a rodada

- [ ] **Passo 1: a suíte inteira**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:6390" npm run test:all
```

- [ ] **Passo 2: apagar da `dividas.md` o que fechou**

Da §2.3, a linha `§6.2 e §7.2, pasto de origem e destino` **se** a tela passar a
oferecer o pasto (ela passa: o `ServiceJob` tem `pasture_id`). Confira antes de
apagar; se só o serviço oferece e a negociação não, **não apague**, corrija a
linha dizendo o que ainda falta.

**Metade da §2.8 fecha:** o §29 do Confinamento ("registrar custos básicos: não
existe caminho") passa a existir para serviço. Reescreva o item dizendo o que
ainda falta (a despesa avulsa lançada em `/financeiro` continua sem chegar ao
lote), em vez de apagá-lo inteiro.

- [ ] **Passo 3: atualizar o `current-handoff.md`**

Substitua a seção "Estado atual". Só fatos verificados. Se o arquivo passar de
200 linhas, arquive em `historico/2026-09.md` antes.

- [ ] **Passo 4: a lição no cofre, se houver**

Use a skill `memoria-cofre`. **Procure antes de criar:** as três lições da fase
33.1 já estavam no cofre, e duas delas eram notas antigas. Se nada surpreendeu,
não invente nota.

- [ ] **Passo 5: commit e parar**

⚠️ **Não faça merge nem push na `main`.** A rodada termina com a branch pronta e
a migração **ainda não aplicada no Neon**. Os dois passos são do usuário, e a
migração vem antes do push.
