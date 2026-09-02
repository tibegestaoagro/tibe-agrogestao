# Fase 34.2: o custeio do serviço com máquinas

> **Para quem executa:** este plano é seguido tarefa por tarefa, na ordem. Os
> passos usam `- [ ]` para marcar progresso. Leia o `CLAUDE.md` antes, e a
> regra da área ao abrir o primeiro arquivo dela.

**Objetivo:** o serviço prestado deixa de ser um evento de tiro único e passa a
durar dias, acumular produção, consumir combustível que baixa do estoque, somar
custos e mostrar o resultado gerencial do §25.

**Arquitetura:** nenhum saldo é gravado (invariante 2). A quantidade já é soma
de `ServiceJobLog` desde a fase 33.2; o custo passa a ser soma de
`ServiceJobCost`. O dinheiro continua sendo `FinancialEntry` criado por
`createLinkedEntry`, e a novidade é **para onde ele aponta**: o lançamento de um
CUSTO aponta para o custo, nunca para o serviço, pela razão explicada na
decisão 17 abaixo.

**Stack:** Next.js 16, Prisma 7, Postgres 17, Zod 4, o kit de UI da casa.

**Spec:** `docs/superpowers/specs/2026-09-02-mao-de-obra-e-servicos-com-maquinas-design.md`
(seção 6, linha da fase 34.2) e o documento do cliente
`docs/modulo-servico-com-maquinas/tibe-servicos-com-maquinas.docx`, §19 a §25,
§32 a §35, §41 a §43.

## Restrições globais

- **`tenant_id` nunca vem do client.** Todo model novo com `tenant_id` entra em
  `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts`), e `npm run test:isolation`
  reprova se esquecer.
- **Migração ANTES do push.** Gerada por `migrate diff`, aplicada com
  `npm run db:deploy`, primeiro no Docker local. **Nunca** `prisma migrate dev`.
- **Nenhum travessão** (U+2014) em código, documento ou commit.
- **Nada de heredoc com escape** (`\n`, `\t`, `\\`): use Edit/Write.
- **Merge, push na `main` e deploy exigem autorização explícita do usuário.**
- Regra de negócio em `src/lib/actions/*`; a rota é wrapper fino.
- Toda recusa que pertence a um campo leva o 4º parâmetro de `fail()`.
- Comando de teste, com as duas travas:
  ```
  DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:6390" npm run test:m60
  ```
  ⚠️ O Redis local desta máquina é `tibe-redis-local` na porta **6390**, não a
  56379 que o `CLAUDE.md` documenta. Confira com `docker ps`.
- A suíte desta fase é a **`m60`**. A spec de design diz `m59`, e `m59` já é a
  da fase 34.1: o contador de suítes descolou do número do módulo há muito
  tempo, e a regra do `CLAUDE.md` é usar o próximo número livre.

---

## As três decisões tomadas com o usuário em 02/09

Elas entram na spec de design como **decisões 17, 18 e 19** (Task 10).

**17. O custo mora em `ServiceJobCost`, e ele NÃO é dinheiro por si só.**
O §25 diz em letra que o cálculo "será gerencial, não contábil". O combustível
que sai do estoque **já virou despesa quando foi comprado**: lançá-lo de novo
faria o diesel aparecer duas vezes no DRE do mês. Então o custo é uma linha
própria, e cada linha tem uma opção "isso saiu do caixa agora" que gera o
`FinancialEntry` (pedágio, alimentação, o operador pago por fora).

⚠️ **E quando gera, o lançamento aponta para o CUSTO, não para o serviço.**
Se apontasse para o serviço, `serializar` em `service-jobs.ts` somaria os
R$ 480 de diesel dentro de `pago`, e a ficha diria **"recebido R$ 480"** num
serviço em que ninguém pagou nada. É o mesmo raciocínio da decisão 12 (o lote
de confinamento soma por junção porque `related_id` aponta para uma coisa só).

**18. O valor do combustível é digitado, não derivado.**
`StockMovement` não guarda custo unitário, e o Módulo 31 está fechado. O §22
diz "quando o valor estiver disponível", que é exatamente um campo opcional no
próprio lançamento. Sem valor informado, o combustível baixa do estoque e não
soma no §25.

**19. O horímetro final atualiza `Machine.hour_meter`.**
O campo já existe. As horas calculadas (`final - inicial`) viram o lançamento de
quantidade quando a cobrança é por hora. O alerta de manutenção do §34 continua
fora: o documento diz "futuramente", e ele pertence à frente do alertário.

---

## Estrutura de arquivos

| arquivo | responsabilidade |
|---|---|
| `prisma/schema.prisma` | `ServiceJobCost`, `ServiceCostKind`, `StockMovement.service_job_id`, `ServiceJob.hour_meter_*` |
| `prisma/migrations/20260906100000_custeio_do_servico/migration.sql` | a migração, aditiva |
| `src/lib/actions/service-jobs.ts` | `addServiceJobLog`, `startServiceJob`, `finishServiceJob` (mexe no que já existe) |
| `src/lib/actions/service-costs.ts` | **novo**: `recordServiceCost`, `recordServiceFuel`, `getServiceCosts`, `cancelServiceCost` |
| `src/lib/actions/machine-services.ts` | `getServicesSummary` (o resumo do §41) |
| `src/app/api/v1/service-jobs/[id]/logs/route.ts` | **nova**: POST do §20 |
| `src/app/api/v1/service-jobs/[id]/costs/route.ts` | **nova**: GET e POST do §21 ao §24 |
| `src/app/api/v1/service-jobs/[id]/status/route.ts` | **nova**: PATCH do §42 (iniciar, encerrar) |
| `src/components/servicos/service-log-form.tsx` | **novo**: painel de produção diária |
| `src/components/servicos/service-cost-form.tsx` | **novo**: painel de custo, com o ramo do combustível |
| `src/components/servicos/service-status-buttons.tsx` | **novo**: iniciar e encerrar |
| `src/app/(dashboard)/servicos/[id]/page.tsx` | custos, resultado do §25, horímetro |
| `src/app/(dashboard)/servicos/page.tsx` | o resumo do §41 |
| `src/lib/actions/whatsapp-handlers/servico.ts` | as cinco conversas do §42 |
| `scripts/m60-custeio-do-servico.test.ts` | **nova**: a suíte |

---

## Task 1: o schema e a migração

**Arquivos:**
- Modificar: `prisma/schema.prisma`
- Criar: `prisma/migrations/20260906100000_custeio_do_servico/migration.sql`
- Modificar: `src/lib/prisma.ts` (`TENANT_SCOPED_MODELS`)

**Interfaces:**
- Produz: o model `ServiceJobCost` e o enum `ServiceCostKind`, usados por toda
  tarefa daqui em diante.

- [ ] **Passo 1: o enum das oito naturezas do §24, mais as duas do §21 e §23**

Em `prisma/schema.prisma`, junto dos outros enums de serviço:

```prisma
/// As naturezas de custo do §21 (combustível), §23 (mão de obra) e §24 (a
/// lista literal do documento). Enum, e não texto livre, porque o §25 soma por
/// natureza e `category` do financeiro é texto que o produtor renomeia no
/// painel: agrupar por string faria a soma mudar quando alguém corrigisse um
/// acento. Mesmo motivo de `worker_entry_kind` existir.
enum ServiceCostKind {
  combustivel
  mao_de_obra
  pedagio
  alimentacao
  transporte
  manutencao
  pecas
  lubrificantes
  comissao
  outro
}
```

- [ ] **Passo 2: o model**

```prisma
/// Um custo de um serviço (§21 a §25 do documento de Máquinas).
///
/// ⚠️ NÃO é dinheiro por si só. O §25 diz que o cálculo é "gerencial, não
/// contábil", e o combustível que sai do estoque já virou despesa quando foi
/// comprado: lançá-lo de novo faria o diesel aparecer duas vezes no DRE.
/// Quando o produtor marca que o dinheiro saiu agora, o `FinancialEntry`
/// nasce apontando para ESTE registro, nunca para o serviço (decisão 17).
model ServiceJobCost {
  id             String          @id @default(cuid())
  tenant_id      String
  service_job_id String
  kind           ServiceCostKind
  description    String

  /// Nulo quando o produtor não sabe o valor. O §22 é explícito: o custo só é
  /// calculado "quando o valor estiver disponível". Um zero no lugar do nulo
  /// faria o §25 somar um custo que ninguém informou.
  amount Decimal? @db.Decimal(14, 2)

  /// Quantidade e unidade do §21, só para o combustível e afins. Ficam aqui, e
  /// não só no `StockMovement`, porque o produto pode não existir no estoque:
  /// o §21 diz "SE o diesel existir no estoque", então o registro precisa
  /// sobreviver sem ele.
  quantity Decimal? @db.Decimal(14, 3)
  unit     String?

  occurred_at DateTime

  /// A baixa de estoque que este custo gerou, quando gerou. Nulo quando o
  /// produto não estava no estoque, ou quando o custo não é de produto.
  stock_movement_id String? @unique

  /// O lançamento financeiro, quando o produtor disse que o dinheiro saiu
  /// agora. Nulo é o caso comum do combustível.
  financial_entry_id String? @unique

  notes               String?
  recorded_by_user_id String?
  canceled_at         DateTime?
  canceled_reason     String?
  created_at          DateTime  @default(now())

  tenant      Tenant     @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  service_job ServiceJob @relation(fields: [service_job_id], references: [id], onDelete: Cascade)
  recorded_by User?      @relation("ServiceCostRecordedBy", fields: [recorded_by_user_id], references: [id], onDelete: SetNull)

  @@index([tenant_id])
  @@index([service_job_id])
  @@index([tenant_id, canceled_at])
}
```

⚠️ **`onDelete: Cascade` no serviço, e não `Restrict`.** É o oposto da escolha
de `Property`: um custo não tem sentido nenhum sem o serviço que o gerou (ao
contrário de "saíram 20 da Fazenda A", que continua significando algo). E
serviço não se apaga: cancela.

- [ ] **Passo 3: as três relações inversas e as duas colunas**

Em `model ServiceJob`, junto das outras relações:

```prisma
  costs ServiceJobCost[]
```

E os dois campos do §33, no mesmo model:

```prisma
  /// §33: o horímetro no começo e no fim, opcional. As horas trabalhadas saem
  /// da diferença, e o final atualiza `Machine.hour_meter` (decisão 19).
  hour_meter_start Decimal? @db.Decimal(10, 1)
  hour_meter_end   Decimal? @db.Decimal(10, 1)
```

Em `model Tenant`:

```prisma
  service_job_costs ServiceJobCost[]
```

Em `model User`:

```prisma
  service_costs_recorded ServiceJobCost[] @relation("ServiceCostRecordedBy")
```

Em `model StockMovement`, a coluna do §35 e a relação:

```prisma
  /// §21 e §35 do documento de Máquinas: qual serviço consumiu o produto.
  /// Opcional, como `stay_id`: nem toda saída de estoque é combustível de
  /// serviço.
  service_job_id String?
```

```prisma
  service_job ServiceJob? @relation(fields: [service_job_id], references: [id], onDelete: SetNull)
```

E o índice, junto dos outros de `StockMovement`:

```prisma
  @@index([service_job_id])
```

Em `model ServiceJob`, a inversa dessa:

```prisma
  stock_movements StockMovement[]
```

⚠️ **`ServiceJob` fica com QUATRO listas de relação depois desta tarefa**
(`logs`, `costs`, `stock_movements` e as duas de `Worker` que a 34.1 criou).
Releia o model inteiro depois de editar: na fase 33.1 um `@@index([tenant_id])`
duplicado entrou por descuido ao inserir relação, e o `prisma format` não
reclama.

- [ ] **Passo 4: `TENANT_SCOPED_MODELS`**

Em `src/lib/prisma.ts`, acrescente `"serviceJobCost"` ao conjunto. Sem isso, o
`npm run test:isolation` reprova, e com razão: seria uma tabela com `tenant_id`
fora do escopo automático.

- [ ] **Passo 5: gerar a migração**

```
npx prisma format
npx prisma generate
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma migrate diff --from-url "postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" --to-schema-datamodel prisma/schema.prisma --script
```

⚠️ **Não use `--from-config-datasource`**: ele lê o `.env`, que aponta para o
Neon de PRODUÇÃO, e o local está à frente. Está em
`docs/conhecimento/migrate-diff-le-o-env-e-o-env-e-producao.md`.

Salve a saída em `prisma/migrations/20260906100000_custeio_do_servico/migration.sql`,
com um comentário de cabeçalho no mesmo estilo do
`20260905100000_servico_prestado`.

⚠️ **Confira que não há NENHUM `DROP`.** Em especial, se aparecer
`DROP INDEX "WhatsAppProviderConfig_one_active"` ou
`DROP INDEX "AnimalBatch_tenant_ear_tag_key"`, **apague essas linhas**: são os
dois índices parciais que o `schema.prisma` não representa, e derrubá-los
quebra "no máximo 1 provider ativo" e "brinco único por tenant".

- [ ] **Passo 6: aplicar no Docker local e conferir**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run db:deploy
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:isolation
```

Espere: `Database schema is up to date!` e a suíte de isolamento verde.

- [ ] **Passo 7: commit**

```
git add prisma/ src/lib/prisma.ts
git commit -m "Schema: o custo do servico, o horimetro e a baixa de estoque por servico"
```

---

## Task 2: a produção diária e o horímetro (§19, §20, §33)

**Arquivos:**
- Modificar: `src/lib/actions/service-jobs.ts`
- Criar: `scripts/m60-custeio-do-servico.test.ts`
- Modificar: `package.json` (`test:m60`)

**Interfaces:**
- Produz:
  ```ts
  export async function addServiceJobLog(
    db: TenantPrismaClient,
    input: {
      service_job_id: string;
      quantity?: number | null;
      occurred_at?: Date | null;
      notes?: string | null;
      hour_meter_start?: number | null;
      hour_meter_end?: number | null;
    },
  ): Promise<ActionResult<{ id: string; quantidade: number; total: number; horas?: number }>>;
  ```

- [ ] **Passo 1: criar a suíte com o bloco 1, o exemplo literal do §19**

Cabeçalho, igual ao da `m59` (as duas travas, porque o bloco do WhatsApp
chegará na Task 9):

```ts
import "dotenv/config";
import { exigirBancoLocal, exigirRedisLocal } from "./_banco-local";

exigirBancoLocal();
exigirRedisLocal();

/**
 * Módulo 34, fase 2: o custeio do serviço com máquinas.
 *
 * Prova, por seção do documento de Máquinas:
 *   1. §19 e §20: o serviço que dura vários dias, e a produção acrescentada.
 *
 * ⚠️ A `m58` e a `m59` cobrem o mesmo arquivo e têm que continuar verdes.
 *
 * Roda: `npm run test:m60`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🔧 M60: custeio do serviço (Módulo 34, fase 2)\n");

async function main() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { createServiceJob, addServiceJobLog, getServiceJobDetail } = await import(
    "@/lib/actions/service-jobs"
  );

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M60 ${stamp}`, document: `M60${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M60" }) });
    const trator = await db.machine.create({
      data: scoped({
        property_id: fazenda.id,
        name: "Trator Massey",
        type: "Trator",
        hour_meter: 1250,
      }),
    });

    console.log("1. §19: o serviço de três dias, 5 + 7 + 4 = 16 horas");
    const servico = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Gradagem",
      pricing: "hora",
      unit_price: 150,
      quantity: 5,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    if (!servico.ok) throw new Error("createServiceJob falhou");
    check("dia 1: 5 horas", servico.data.quantidade === 5, String(servico.data.quantidade));

    const dia2 = await addServiceJobLog(db, {
      service_job_id: servico.data.id,
      quantity: 7,
      occurred_at: new Date("2026-09-02T12:00:00.000Z"),
    });
    check("dia 2 aceito", dia2.ok, dia2.ok ? "" : dia2.message);
    const dia3 = await addServiceJobLog(db, {
      service_job_id: servico.data.id,
      quantity: 4,
      occurred_at: new Date("2026-09-03T12:00:00.000Z"),
    });
    check("dia 3 aceito", dia3.ok, dia3.ok ? "" : dia3.message);

    check(
      "total trabalhado: 16 horas, o número literal do §19",
      dia3.ok && dia3.data.quantidade === 16,
      dia3.ok ? String(dia3.data.quantidade) : "recusado",
    );
    check(
      "e o total em dinheiro acompanha: 16 x 150 = 2.400",
      dia3.ok && dia3.data.total === 2400,
      dia3.ok ? String(dia3.data.total) : "recusado",
    );

    /**
     * ⚠️ O CASO QUE DISCRIMINA: o §19 diz em letra que "o produtor não deverá
     * criar três serviços diferentes". Uma implementação que criasse um serviço
     * por dia daria os mesmos 16 na soma de uma listagem, e a ficha do §22
     * mostraria três contas a receber de 750, 1.050 e 600 em vez de uma de
     * 2.400. Por isso o teste cobra UM serviço e TRÊS logs.
     */
    check(
      "um serviço só, com três lançamentos de quantidade",
      (await db.serviceJob.count()) === 1 &&
        (await db.serviceJobLog.count({ where: { service_job_id: servico.data.id } })) === 3,
      `${await db.serviceJob.count()} serviços`,
    );

    const detalhe = await getServiceJobDetail(db, servico.data.id);
    check(
      "e a conta a receber acompanhou o total",
      detalhe.ok && detalhe.data.a_receber === 2400,
      detalhe.ok ? String(detalhe.data.a_receber) : "recusado",
    );
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M60 verde" : `\n❌ M60: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
```

Acrescente ao `package.json`, junto de `test:m59`:

```json
    "test:m60": "tsx scripts/m60-custeio-do-servico.test.ts",
```

- [ ] **Passo 2: rodar e ver falhar**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:6390" npm run test:m60
```

Espere: erro de `addServiceJobLog` não existir.

- [ ] **Passo 3: implementar `addServiceJobLog`**

Em `src/lib/actions/service-jobs.ts`, depois de `createServiceJob`:

```ts
/**
 * Acrescenta produção a um serviço em andamento (§19 e §20).
 *
 * A CONTA EM ABERTO ACOMPANHA. O §22 mostra o total ao lado do que já foi
 * pago, e um serviço que cresceu de 5 para 16 horas com a conta parada em
 * R$ 750 mostraria "faltam 750" quando faltam 2.400. Por isso o lançamento
 * pendente é ajustado aqui, e não só a quantidade.
 *
 * ⚠️ O `fechado` NÃO aceita log de quantidade: o §16 diz que o valor fechado
 * não exige cálculo por hora ou hectare, e uma quantidade ali não muda o total
 * nem significa nada. Recusar é mais honesto que aceitar e ignorar.
 */
export async function addServiceJobLog(
  db: TenantPrismaClient,
  input: {
    service_job_id: string;
    quantity?: number | null;
    occurred_at?: Date | null;
    notes?: string | null;
    hour_meter_start?: number | null;
    hour_meter_end?: number | null;
  },
): Promise<ActionResult<{ id: string; quantidade: number; total: number; horas: number | null }>> {
  const job = await db.serviceJob.findUnique({
    where: { id: input.service_job_id },
    include: INCLUDE,
  });
  if (!job) return fail("NOT_FOUND", "Serviço não encontrado.", 404);
  if (job.canceled_at) {
    return fail("CONFLICT", "Este serviço foi cancelado, então não há o que lançar.", 409);
  }
  if (job.pricing === "fechado") {
    return fail(
      "CONFLICT",
      "Este serviço foi combinado por valor fechado, então não tem quantidade para lançar.",
      409,
      "quantity",
    );
  }

  /**
   * §33: com o horímetro, a quantidade sai da diferença, e o produtor não
   * precisa fazer a conta. Digitar os dois E a quantidade é contradição, e o
   * silêncio aqui esconderia qual dos dois valeu.
   */
  let horas: number | null = null;
  const inicial = input.hour_meter_start;
  const final = input.hour_meter_end;
  if (inicial !== null && inicial !== undefined && final !== null && final !== undefined) {
    if (!Number.isFinite(inicial) || !Number.isFinite(final)) {
      return fail("VALIDATION_ERROR", "Informe o horímetro com números.", 422, "hour_meter_end");
    }
    if (final <= inicial) {
      return fail(
        "VALIDATION_ERROR",
        "O horímetro final precisa ser maior que o inicial.",
        422,
        "hour_meter_end",
      );
    }
    horas = Math.round((final - inicial) * 10) / 10;
    if (input.quantity !== null && input.quantity !== undefined) {
      return fail(
        "VALIDATION_ERROR",
        "Informe o horímetro OU a quantidade, não os dois: com o horímetro a conta é automática.",
        422,
        "quantity",
      );
    }
  }

  const quantidade = horas ?? input.quantity ?? null;
  if (quantidade === null || !Number.isFinite(quantidade) || quantidade <= 0) {
    return fail("VALIDATION_ERROR", "Informe quanto foi feito.", 422, "quantity");
  }

  const quando = input.occurred_at ?? new Date();

  await runSerializableTenantTransaction(db, async (tx) => {
    await tx.serviceJobLog.create({
      data: scoped({
        service_job_id: job.id,
        occurred_at: quando,
        quantity: quantidade,
        notes: input.notes?.trim() || null,
      }),
    });

    if (horas !== null) {
      await tx.serviceJob.update({
        where: { id: job.id },
        data: { hour_meter_start: inicial, hour_meter_end: final },
      });
      /**
       * Decisão 19: o horímetro final é o número da máquina agora. Ele só
       * ANDA PARA A FRENTE: um serviço lançado fora de ordem não pode fazer o
       * horímetro da máquina voltar, porque o §34 vai comparar esse número com
       * a próxima manutenção prevista.
       */
      if (job.machine_id) {
        const maquina = await tx.machine.findFirst({ where: { id: job.machine_id } });
        const atual = decToNum(maquina?.hour_meter) ?? 0;
        if (final > atual) {
          await tx.machine.update({ where: { id: job.machine_id }, data: { hour_meter: final } });
        }
      }
    }

    // A conta em aberto acompanha o total novo.
    const logs = [
      ...job.logs.map((l) => ({
        quantity: decToNum(l.quantity) ?? 0,
        canceled_at: l.canceled_at,
      })),
      { quantity: quantidade, canceled_at: null as Date | null },
    ];
    const total = totalDoServico(
      {
        pricing: job.pricing,
        unit_price: decToNum(job.unit_price),
        agreed_amount: decToNum(job.agreed_amount),
        worker_count: job.worker_count,
      },
      logs,
    );

    const pendentes = await tx.financialEntry.findMany({
      where: {
        related_module: "servico",
        related_id: job.id,
        status: { in: ["pending", "overdue"] },
      },
      orderBy: { due_date: "asc" },
    });
    const jaPago = (
      await tx.financialEntry.findMany({
        where: { related_module: "servico", related_id: job.id, status: "paid" },
        select: { amount: true },
      })
    ).reduce((s, e) => s + (decToNum(e.amount) ?? 0), 0);

    const emAberto = Math.round((total - jaPago) * 100) / 100;
    if (pendentes.length > 0) {
      // Ajusta a primeira e apaga as outras: o §22 é saldo aberto, não
      // parcelamento (decisão 3 da fase 33.2).
      await tx.financialEntry.update({
        where: { id: pendentes[0].id },
        data: { amount: emAberto },
      });
      for (const extra of pendentes.slice(1)) {
        await tx.financialEntry.delete({ where: { id: extra.id } });
      }
    } else if (emAberto > 0) {
      await createLinkedEntry(tx as never, {
        entry_type: sinalDe(job.direction),
        category: categoriaDe(job.direction),
        amount: emAberto,
        related_module: "servico",
        related_id: job.id,
        occurred_at: quando,
        status: "pending",
      });
    }
  });

  const depois = await getServiceJobDetail(db, job.id);
  if (!depois.ok) return depois;
  return ok({
    id: job.id,
    quantidade: depois.data.quantidade,
    total: depois.data.total,
    horas,
  });
}
```

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: o bloco 2, o horímetro do §33**

Acrescente à suíte, depois do bloco 1:

```ts
    console.log("\n2. §33: o horímetro calcula as horas, e alimenta a máquina");
    const comHorimetro = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-04T12:00:00.000Z"),
      description: "Aração",
      pricing: "hora",
      unit_price: 200,
      quantity: 1,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    if (!comHorimetro.ok) throw new Error("createServiceJob falhou");

    const leitura = await addServiceJobLog(db, {
      service_job_id: comHorimetro.data.id,
      hour_meter_start: 1250,
      hour_meter_end: 1258,
    });
    check("aceito", leitura.ok, leitura.ok ? "" : leitura.message);
    check(
      "1.250 para 1.258 dá 8 horas, o exemplo literal do §33",
      leitura.ok && leitura.data.horas === 8,
      leitura.ok ? String(leitura.data.horas) : "recusado",
    );
    check(
      "e as 8 horas viraram quantidade (1 do cadastro + 8)",
      leitura.ok && leitura.data.quantidade === 9,
      leitura.ok ? String(leitura.data.quantidade) : "recusado",
    );
    check(
      "o horímetro da MÁQUINA foi para 1.258 (decisão 19)",
      Number((await db.machine.findUnique({ where: { id: trator.id } }))?.hour_meter) === 1258,
      String((await db.machine.findUnique({ where: { id: trator.id } }))?.hour_meter),
    );

    console.log("   e as três recusas do horímetro");
    const invertido = await addServiceJobLog(db, {
      service_job_id: comHorimetro.data.id,
      hour_meter_start: 1300,
      hour_meter_end: 1290,
    });
    check(
      "final menor que o inicial é recusado no campo",
      !invertido.ok && invertido.field === "hour_meter_end",
      !invertido.ok ? String(invertido.field) : "aceitou",
    );

    const ambos = await addServiceJobLog(db, {
      service_job_id: comHorimetro.data.id,
      hour_meter_start: 1258,
      hour_meter_end: 1262,
      quantity: 99,
    });
    check(
      "horímetro E quantidade juntos é recusado",
      !ambos.ok && ambos.field === "quantity",
      !ambos.ok ? String(ambos.field) : "aceitou",
    );

    /**
     * ⚠️ O horímetro NÃO ANDA PARA TRÁS. Um serviço lançado fora de ordem
     * (a leitura de ontem digitada hoje) faria a máquina voltar de 1.258 para
     * 1.254, e o §34 passaria a dizer que faltam mais horas para a manutenção
     * do que realmente faltam.
     */
    await addServiceJobLog(db, {
      service_job_id: comHorimetro.data.id,
      hour_meter_start: 1250,
      hour_meter_end: 1254,
    });
    check(
      "e uma leitura antiga não faz a máquina voltar",
      Number((await db.machine.findUnique({ where: { id: trator.id } }))?.hour_meter) === 1258,
      String((await db.machine.findUnique({ where: { id: trator.id } }))?.hour_meter),
    );

    console.log("   e o valor fechado recusa quantidade");
    const empreito = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-05T12:00:00.000Z"),
      description: "Terraplanagem",
      pricing: "fechado",
      agreed_amount: 9000,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    const noEmpreito = await addServiceJobLog(db, {
      service_job_id: empreito.ok ? empreito.data.id : "",
      quantity: 3,
    });
    check("recusado no empreito (§16)", !noEmpreito.ok, "aceitou");
```

- [ ] **Passo 6: rodar, e quebrar de propósito**

Troque `if (final > atual)` por `if (true)` e confira que "uma leitura antiga
não faz a máquina voltar" reprova. Devolva.

- [ ] **Passo 7: commit**

```
git add src/lib/actions/service-jobs.ts scripts/m60-custeio-do-servico.test.ts package.json
git commit -m "Servico: a producao diaria do §19 e o horimetro do §33"
```

---

## Task 3: iniciar e encerrar (§18, §42)

Foi prometido para a fase 34.1 pela spec de design e não foi entregue. Entra
aqui, e o plano registra isso em vez de fingir que sempre foi desta fase.

**Arquivos:**
- Modificar: `src/lib/actions/service-jobs.ts`
- Modificar: `scripts/m60-custeio-do-servico.test.ts` (bloco 3)

**Interfaces:**
- Produz:
  ```ts
  export async function setServiceJobStatus(
    db: TenantPrismaClient,
    input: { service_job_id: string; status: "em_andamento" | "concluido" },
  ): Promise<ActionResult<ServiceJobDetailView>>;
  ```

- [ ] **Passo 1: o bloco 3**

```ts
    console.log("\n3. §42: começar e terminar o serviço");
    const doFluxo = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      description: "Subsolagem",
      pricing: "hectare",
      unit_price: 300,
      quantity: 10,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    if (!doFluxo.ok) throw new Error("createServiceJob falhou");
    check("marcado para depois de amanhã, nasce agendado", doFluxo.data.status === "agendado");

    const comecou = await setServiceJobStatus(db, {
      service_job_id: doFluxo.data.id,
      status: "em_andamento",
    });
    check("'comecei hoje' põe em andamento", comecou.ok && comecou.data.status === "em_andamento",
      comecou.ok ? comecou.data.status : "recusado");

    const terminou = await setServiceJobStatus(db, {
      service_job_id: doFluxo.data.id,
      status: "concluido",
    });
    check("'terminei' conclui", terminou.ok && terminou.data.status === "concluido",
      terminou.ok ? terminou.data.status : "recusado");
    check(
      "e devolve o que o §42 manda mostrar: quantidade, total e o que falta receber",
      terminou.ok &&
        terminou.data.quantidade === 10 &&
        terminou.data.total === 3000 &&
        terminou.data.a_receber === 3000,
      terminou.ok
        ? `${terminou.data.quantidade} / ${terminou.data.total} / ${terminou.data.a_receber}`
        : "recusado",
    );

    /**
     * ⚠️ Concluir NÃO mexe no dinheiro. O §42 pergunta "o João já pagou?"
     * DEPOIS de mostrar o resumo, e a resposta é outro passo. Um `concluido`
     * que quitasse sozinho inventaria um recebimento que não aconteceu, e o
     * produtor descobriria no fim do mês, com a conta a receber zerada.
     */
    check(
      "e a conta a receber continua aberta",
      (await db.financialEntry.count({
        where: { related_module: "servico", related_id: doFluxo.data.id, status: "pending" },
      })) === 1,
    );

    const cancelado = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date(),
      description: "Roçada",
      pricing: "hectare",
      unit_price: 100,
      quantity: 2,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    await cancelServiceJob(db, { service_job_id: cancelado.ok ? cancelado.data.id : "" });
    const reabrir = await setServiceJobStatus(db, {
      service_job_id: cancelado.ok ? cancelado.data.id : "",
      status: "em_andamento",
    });
    check("serviço cancelado não volta a andar", !reabrir.ok, "aceitou");
```

Acrescente `setServiceJobStatus` e `cancelServiceJob` ao `import` do topo da
suíte.

- [ ] **Passo 2: rodar, ver falhar, implementar**

```ts
/**
 * "Comecei a gradagem do João hoje" e "Terminei o serviço do João" (§42).
 *
 * Só o status muda. Concluir NÃO quita nada: o §42 pergunta se o cliente já
 * pagou DEPOIS de mostrar o resumo, e responder por ele inventaria um
 * recebimento.
 */
export async function setServiceJobStatus(
  db: TenantPrismaClient,
  input: { service_job_id: string; status: "em_andamento" | "concluido" },
): Promise<ActionResult<ServiceJobDetailView>> {
  const job = await db.serviceJob.findUnique({ where: { id: input.service_job_id } });
  if (!job) return fail("NOT_FOUND", "Serviço não encontrado.", 404);
  if (job.canceled_at) {
    return fail("CONFLICT", "Este serviço foi cancelado.", 409);
  }
  await db.serviceJob.update({ where: { id: job.id }, data: { status: input.status } });
  return getServiceJobDetail(db, job.id);
}
```

- [ ] **Passo 3: rodar e ver passar. Commit**

```
git add src/lib/actions/service-jobs.ts scripts/m60-custeio-do-servico.test.ts
git commit -m "Servico: comecar e encerrar, as duas pontas do §42 que faltaram na 34.1"
```

---

## Task 4: o custo do serviço (§23, §24) e a trava do recebido

**Arquivos:**
- Criar: `src/lib/actions/service-costs.ts`
- Modificar: `scripts/m60-custeio-do-servico.test.ts` (bloco 4)

**Interfaces:**
- Produz:
  ```ts
  export type ServiceCostView = {
    id: string;
    kind: ServiceCostKind;
    description: string;
    amount: number | null;
    quantity: number | null;
    unit: string | null;
    occurred_at: string;
    gerou_lancamento: boolean;
    baixou_estoque: boolean;
    canceled_at: string | null;
  };

  export async function recordServiceCost(
    db: TenantPrismaClient,
    input: {
      service_job_id: string;
      kind: ServiceCostKind;
      description: string;
      amount?: number | null;
      occurred_at?: Date | null;
      notes?: string | null;
      /** §17: marcar isto gera a despesa no Financeiro. */
      saiu_do_caixa?: boolean;
      user_id?: string | null;
    },
  ): Promise<ActionResult<ServiceCostView>>;

  export async function getServiceCosts(
    db: TenantPrismaClient,
    serviceJobId: string,
  ): Promise<{ linhas: ServiceCostView[]; total: number; por_natureza: Partial<Record<ServiceCostKind, number>> }>;

  export async function cancelServiceCost(
    db: TenantPrismaClient,
    input: { cost_id: string; reason?: string | null },
  ): Promise<ActionResult<{ id: string }>>;
  ```

- [ ] **Passo 1: o bloco 4, com o caso que discrimina**

```ts
    console.log("\n4. §23 e §24: o custo do serviço, e o que ele NÃO mexe");
    const { recordServiceCost, getServiceCosts, cancelServiceCost } = await import(
      "@/lib/actions/service-costs"
    );

    const comCusto = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-06T12:00:00.000Z"),
      description: "Ensilagem",
      pricing: "hectare",
      unit_price: 300,
      quantity: 15,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    if (!comCusto.ok) throw new Error("createServiceJob falhou");
    check("receita de 4.500", comCusto.data.total === 4500, String(comCusto.data.total));

    const operador = await recordServiceCost(db, {
      service_job_id: comCusto.data.id,
      kind: "mao_de_obra",
      description: "Diária do operador",
      amount: 600,
      saiu_do_caixa: true,
    });
    check("custo de operador aceito", operador.ok, operador.ok ? "" : operador.message);
    check("e gerou lançamento", operador.ok && operador.data.gerou_lancamento);

    const pedagio = await recordServiceCost(db, {
      service_job_id: comCusto.data.id,
      kind: "pedagio",
      description: "Pedágio da estrada",
      amount: 200,
      saiu_do_caixa: false,
    });
    check("custo sem saída de caixa aceito", pedagio.ok);
    check("e NÃO gerou lançamento", pedagio.ok && !pedagio.data.gerou_lancamento);

    const custos = await getServiceCosts(db, comCusto.data.id);
    check("dois custos somando 800", custos.total === 800, String(custos.total));
    check(
      "separados por natureza",
      custos.por_natureza.mao_de_obra === 600 && custos.por_natureza.pedagio === 200,
      JSON.stringify(custos.por_natureza),
    );

    /**
     * ⚠️ O CASO QUE DISCRIMINA A FASE INTEIRA, e o motivo da decisão 17.
     *
     * O lançamento do custo aponta para o CUSTO, nunca para o serviço. Se
     * apontasse para o serviço, `serializar` somaria os R$ 600 do operador
     * dentro de `pago`, e a ficha diria "RECEBIDO R$ 600" num serviço em que o
     * João não pagou nada. O produtor cobraria R$ 3.900 de quem devia R$ 4.500.
     *
     * Por isso o teste cobra os três números do serviço DEPOIS de lançar custo.
     */
    const fichaDepois = await getServiceJobDetail(db, comCusto.data.id);
    check(
      "o custo não vira recebimento: recebido continua 0",
      fichaDepois.ok && fichaDepois.data.recebido === 0,
      fichaDepois.ok ? String(fichaDepois.data.recebido) : "recusado",
    );
    check(
      "e a receber continua 4.500",
      fichaDepois.ok && fichaDepois.data.a_receber === 4500,
      fichaDepois.ok ? String(fichaDepois.data.a_receber) : "recusado",
    );
    check(
      "e o lançamento do custo aponta para o CUSTO, não para o serviço",
      (await db.financialEntry.count({
        where: { related_module: "servico", related_id: operador.ok ? operador.data.id : "" },
      })) === 1,
    );

    console.log("   e o cancelamento");
    const antesDoCancel = (await getServiceCosts(db, comCusto.data.id)).total;
    await cancelServiceCost(db, { cost_id: pedagio.ok ? pedagio.data.id : "" });
    const depoisDoCancel = await getServiceCosts(db, comCusto.data.id);
    check(
      "custo cancelado sai da soma",
      antesDoCancel === 800 && depoisDoCancel.total === 600,
      `${antesDoCancel} -> ${depoisDoCancel.total}`,
    );
    check(
      "mas continua no histórico, marcado",
      depoisDoCancel.linhas.some((l) => l.canceled_at !== null),
    );
```

- [ ] **Passo 2: rodar, ver falhar, implementar `src/lib/actions/service-costs.ts`**

```ts
import type { ServiceCostKind } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { decToNum, isoOrNull } from "@/lib/serialize";

/**
 * O custo de um serviço (§21 a §25 do documento de Máquinas).
 *
 * ⚠️ ESTE MÓDULO NÃO É O DINHEIRO DO SERVIÇO. O §25 diz que o cálculo é
 * "gerencial, não contábil": o combustível que saiu do estoque já virou
 * despesa quando foi comprado, e lançá-lo de novo faria o diesel aparecer duas
 * vezes no DRE do mês.
 *
 * Quando o produtor diz que o dinheiro saiu agora (o pedágio, o operador pago
 * por fora), o `FinancialEntry` nasce apontando para o CUSTO, com
 * `related_id` do `ServiceJobCost`. NUNCA para o serviço: `serializar` em
 * `service-jobs.ts` soma por `related_id` do job para descobrir quanto já foi
 * pago, e uma despesa ali faria a ficha dizer "recebido R$ 600" num serviço em
 * que ninguém pagou nada. É a mesma razão de o lote de confinamento somar por
 * junção (decisão 12).
 */

const CATEGORIA: Record<ServiceCostKind, string> = {
  combustivel: "Combustível",
  mao_de_obra: "Mão de obra do serviço",
  pedagio: "Pedágio",
  alimentacao: "Alimentação",
  transporte: "Transporte",
  manutencao: "Manutenção",
  pecas: "Peças",
  lubrificantes: "Lubrificantes",
  comissao: "Comissão",
  outro: "Outros custos do serviço",
};

export type ServiceCostView = {
  id: string;
  kind: ServiceCostKind;
  description: string;
  amount: number | null;
  quantity: number | null;
  unit: string | null;
  occurred_at: string;
  gerou_lancamento: boolean;
  baixou_estoque: boolean;
  canceled_at: string | null;
};

type LinhaDeCusto = {
  id: string;
  kind: ServiceCostKind;
  description: string;
  amount: unknown;
  quantity: unknown;
  unit: string | null;
  occurred_at: Date;
  financial_entry_id: string | null;
  stock_movement_id: string | null;
  canceled_at: Date | null;
};

function serializar(c: LinhaDeCusto): ServiceCostView {
  return {
    id: c.id,
    kind: c.kind,
    description: c.description,
    amount: decToNum(c.amount as never),
    quantity: decToNum(c.quantity as never),
    unit: c.unit,
    occurred_at: c.occurred_at.toISOString(),
    gerou_lancamento: c.financial_entry_id !== null,
    baixou_estoque: c.stock_movement_id !== null,
    canceled_at: isoOrNull(c.canceled_at),
  };
}

export async function recordServiceCost(
  db: TenantPrismaClient,
  input: {
    service_job_id: string;
    kind: ServiceCostKind;
    description: string;
    amount?: number | null;
    occurred_at?: Date | null;
    notes?: string | null;
    saiu_do_caixa?: boolean;
    user_id?: string | null;
  },
): Promise<ActionResult<ServiceCostView>> {
  const job = await db.serviceJob.findUnique({ where: { id: input.service_job_id } });
  if (!job) return fail("NOT_FOUND", "Serviço não encontrado.", 404);
  if (job.canceled_at) {
    return fail("CONFLICT", "Este serviço foi cancelado, então não há custo a lançar.", 409);
  }
  if (!(input.description ?? "").trim()) {
    return fail("VALIDATION_ERROR", "Diga qual foi o custo.", 422, "description");
  }
  const valor = input.amount ?? null;
  if (valor !== null && (!Number.isFinite(valor) || valor <= 0)) {
    return fail("VALIDATION_ERROR", "O valor precisa ser maior que zero.", 422, "amount");
  }
  /**
   * Marcar "saiu do caixa" sem dizer quanto é contradição: o lançamento
   * financeiro precisa de um valor, e criar um de R$ 0,00 encheria o
   * Financeiro de linhas que não significam nada.
   */
  if (input.saiu_do_caixa && valor === null) {
    return fail(
      "VALIDATION_ERROR",
      "Para lançar no Financeiro, informe o valor que saiu.",
      422,
      "amount",
    );
  }

  const quando = input.occurred_at ?? new Date();

  const criado = await runSerializableTenantTransaction(db, async (tx) => {
    const custo = await tx.serviceJobCost.create({
      data: scoped({
        service_job_id: job.id,
        kind: input.kind,
        description: input.description.trim(),
        amount: valor,
        occurred_at: quando,
        notes: input.notes?.trim() || null,
        recorded_by_user_id: input.user_id ?? null,
      }),
    });

    if (input.saiu_do_caixa && valor !== null) {
      const lancamento = await createLinkedEntry(tx as never, {
        entry_type: "expense",
        category: CATEGORIA[input.kind],
        amount: valor,
        related_module: "servico",
        related_id: custo.id,
        occurred_at: quando,
        status: "paid",
      });
      await tx.serviceJobCost.update({
        where: { id: custo.id },
        data: { financial_entry_id: lancamento.id },
      });
      return { ...custo, financial_entry_id: lancamento.id };
    }
    return custo;
  });

  return ok(serializar(criado as never));
}

export async function getServiceCosts(
  db: TenantPrismaClient,
  serviceJobId: string,
): Promise<{
  linhas: ServiceCostView[];
  total: number;
  por_natureza: Partial<Record<ServiceCostKind, number>>;
}> {
  const linhas = await db.serviceJobCost.findMany({
    where: { service_job_id: serviceJobId },
    orderBy: { occurred_at: "desc" },
  });

  const por_natureza: Partial<Record<ServiceCostKind, number>> = {};
  let total = 0;
  for (const l of linhas) {
    // Cancelado continua no histórico e sai da soma, como o log de quantidade.
    if (l.canceled_at !== null) continue;
    const valor = decToNum(l.amount) ?? 0;
    total += valor;
    por_natureza[l.kind] = (por_natureza[l.kind] ?? 0) + valor;
  }

  return {
    linhas: linhas.map((l) => serializar(l as never)),
    total: Math.round(total * 100) / 100,
    por_natureza,
  };
}

/**
 * Cancela um custo.
 *
 * ⚠️ O lançamento financeiro, se houver, é CANCELADO e não apagado, e a baixa
 * de estoque NÃO volta. São duas escolhas diferentes de propósito: o dinheiro
 * que saiu do caixa saiu mesmo (o padrão do Módulo 31), enquanto o diesel que
 * o trator queimou não volta para o tanque. Estornar a quantidade faria o saldo
 * do estoque mentir para mais.
 */
export async function cancelServiceCost(
  db: TenantPrismaClient,
  input: { cost_id: string; reason?: string | null },
): Promise<ActionResult<{ id: string }>> {
  const custo = await db.serviceJobCost.findUnique({ where: { id: input.cost_id } });
  if (!custo) return fail("NOT_FOUND", "Custo não encontrado.", 404);
  if (custo.canceled_at) return fail("CONFLICT", "Este custo já foi cancelado.", 409);

  await runSerializableTenantTransaction(db, async (tx) => {
    await tx.serviceJobCost.update({
      where: { id: custo.id },
      data: { canceled_at: new Date(), canceled_reason: input.reason?.trim() || null },
    });
    if (custo.financial_entry_id) {
      await tx.financialEntry.update({
        where: { id: custo.financial_entry_id },
        data: { status: "cancelled" },
      });
    }
  });

  return ok({ id: custo.id });
}
```

⚠️ **`cancelled`, com dois L.** `FinancialEntryStatus` escreve assim, enquanto
os campos `canceled_at` dos models escrevem com um L só. As duas grafias
convivem no schema, e `"canceled"` aqui não compila. Conferido no
`prisma/schema.prisma` em 02/09.

- [ ] **Passo 3: rodar e ver passar**

- [ ] **Passo 4: quebrar de propósito**

Troque `related_id: custo.id` por `related_id: job.id` e confira que
**"o custo não vira recebimento"** reprova, mostrando `600`. Devolva. É a trava
central da fase.

- [ ] **Passo 5: commit**

```
git add src/lib/actions/service-costs.ts scripts/m60-custeio-do-servico.test.ts
git commit -m "Servico: o custo do §24, apontando para o custo e nunca para o servico"
```

---

## Task 5: o combustível que baixa do estoque (§21, §22, §35)

**Arquivos:**
- Modificar: `src/lib/actions/service-costs.ts`
- Modificar: `src/lib/actions/stock-ledger.ts` (`StockMovementInput` ganha `service_job_id`)
- Modificar: `scripts/m60-custeio-do-servico.test.ts` (bloco 5)

**Interfaces:**
- Produz:
  ```ts
  export async function recordServiceFuel(
    db: TenantPrismaClient,
    input: {
      service_job_id: string;
      product_id?: string | null;
      description?: string | null;
      quantity: number;
      unit?: string | null;
      unit_price?: number | null;
      amount?: number | null;
      occurred_at?: Date | null;
      user_id?: string | null;
    },
  ): Promise<ActionResult<ServiceCostView & { saldo_do_produto: number | null }>>;
  ```

- [ ] **Passo 1: o bloco 5, o exemplo literal do §21 e §22**

```ts
    console.log("\n5. §21, §22 e §35: 80 litros de diesel a R$ 6,00");
    const { recordServiceFuel } = await import("@/lib/actions/service-costs");
    const { getStockBalance, recordStockMovement } = await import("@/lib/actions/stock-ledger");

    const categoria = await db.productCategory.create({
      data: scoped({ name: "Combustíveis" }),
    });
    const diesel = await db.product.create({
      data: scoped({ category_id: categoria.id, name: "Diesel S10", unit: "litro" }),
    });
    await recordStockMovement(db, {
      product_id: diesel.id,
      property_id: fazenda.id,
      movement_type: "compra",
      quantity: 500,
    });
    const saldoAntes = (await getStockBalance(db, { product_id: diesel.id }))[0];
    check("500 litros no estoque", Number(saldoAntes?.quantity) === 500, String(saldoAntes?.quantity));

    const combustivel = await recordServiceFuel(db, {
      service_job_id: comCusto.data.id,
      product_id: diesel.id,
      quantity: 80,
      unit_price: 6,
    });
    check("aceito", combustivel.ok, combustivel.ok ? "" : combustivel.message);
    check(
      "custo de R$ 480, o número literal do §22",
      combustivel.ok && combustivel.data.amount === 480,
      combustivel.ok ? String(combustivel.data.amount) : "recusado",
    );
    check(
      "o estoque caiu para 420 litros (§35)",
      combustivel.ok && combustivel.data.saldo_do_produto === 420,
      combustivel.ok ? String(combustivel.data.saldo_do_produto) : "recusado",
    );
    check(
      "e a movimentação aponta para o serviço",
      (await db.stockMovement.count({
        where: { service_job_id: comCusto.data.id, movement_type: "utilizacao" },
      })) === 1,
    );

    /**
     * ⚠️ E o combustível NÃO gera despesa, que é a decisão 17 em ação. O
     * diesel virou despesa quando foi COMPRADO: um lançamento aqui faria o
     * mesmo dinheiro aparecer duas vezes no DRE do mês, e o produtor veria
     * R$ 3.480 de diesel num mês em que saíram R$ 3.000.
     */
    check(
      "e NÃO gerou lançamento financeiro",
      combustivel.ok && !combustivel.data.gerou_lancamento,
    );

    console.log("   e o §21 literal: 'SE o diesel existir no estoque'");
    const semEstoque = await recordServiceFuel(db, {
      service_job_id: comCusto.data.id,
      description: "Diesel comprado no posto",
      quantity: 40,
      unit: "litro",
      unit_price: 6.5,
    });
    check("sem produto cadastrado, o custo entra assim mesmo", semEstoque.ok,
      semEstoque.ok ? "" : semEstoque.message);
    check(
      "com o valor calculado, e sem baixa de estoque",
      semEstoque.ok && semEstoque.data.amount === 260 && !semEstoque.data.baixou_estoque,
      semEstoque.ok ? `${semEstoque.data.amount} / ${semEstoque.data.baixou_estoque}` : "recusado",
    );

    console.log("   e o §22 é OPCIONAL: sem valor, só a quantidade");
    const semValor = await recordServiceFuel(db, {
      service_job_id: comCusto.data.id,
      product_id: diesel.id,
      quantity: 20,
    });
    check("aceito sem valor", semValor.ok, semValor.ok ? "" : semValor.message);
    check("custo nulo, não zero", semValor.ok && semValor.data.amount === null,
      semValor.ok ? String(semValor.data.amount) : "recusado");
    check(
      "mas o estoque caiu do mesmo jeito, para 400",
      semValor.ok && semValor.data.saldo_do_produto === 400,
      semValor.ok ? String(semValor.data.saldo_do_produto) : "recusado",
    );
```

- [ ] **Passo 2: `StockMovementInput` ganha o campo**

Em `src/lib/actions/stock-ledger.ts`, no tipo:

```ts
  /**
   * §21 e §35 do documento de Máquinas: qual serviço consumiu o produto.
   * Opcional, exatamente como `stay_id`.
   */
  service_job_id?: string | null;
```

E no `create` de `recordStockMovementInTx`, junto de `stay_id`:

```ts
      service_job_id: input.service_job_id ?? null,
```

⚠️ **Confira o serviço, como o `stay_id` é conferido.** Logo acima existe um
bloco `if (input.stay_id) { ... }` que busca a estadia antes de gravar, porque
a extensão do Prisma só injeta `tenant_id` na linha NOVA e a FK do Postgres só
confere que a chave existe em algum lugar do banco. Faça o mesmo:

```ts
  if (input.service_job_id) {
    const servico = await tx.serviceJob.findFirst({ where: { id: input.service_job_id } });
    if (!servico) return fail("INVALID_SERVICE_JOB", "Serviço inválido", 422, "service_job_id");
  }
```

- [ ] **Passo 3: implementar `recordServiceFuel`**

Em `src/lib/actions/service-costs.ts`:

```ts
/**
 * O combustível do §21, que baixa do estoque quando o produto existe.
 *
 * ⚠️ O §21 diz "SE o diesel existir no estoque, o TIBÉ deverá reduzir". O SE é
 * literal e é a regra: comprar diesel no posto a caminho da fazenda do cliente
 * é o caso comum, e recusar o custo por falta de cadastro faria o produtor
 * desistir de registrar em vez de cadastrar o produto.
 *
 * ⚠️ E ele NÃO gera despesa (decisão 17): o diesel do estoque já foi pago na
 * compra. O combustível avulso do posto TAMBÉM não, aqui, porque quem quiser
 * a despesa usa `recordServiceCost` com `saiu_do_caixa`. Um caminho só para
 * criar dinheiro é o que impede a duplicata.
 */
export async function recordServiceFuel(
  db: TenantPrismaClient,
  input: {
    service_job_id: string;
    product_id?: string | null;
    description?: string | null;
    quantity: number;
    unit?: string | null;
    unit_price?: number | null;
    amount?: number | null;
    occurred_at?: Date | null;
    user_id?: string | null;
  },
): Promise<ActionResult<ServiceCostView & { saldo_do_produto: number | null }>> {
  const job = await db.serviceJob.findUnique({ where: { id: input.service_job_id } });
  if (!job) return fail("NOT_FOUND", "Serviço não encontrado.", 404);
  if (job.canceled_at) {
    return fail("CONFLICT", "Este serviço foi cancelado.", 409);
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return fail("VALIDATION_ERROR", "Informe quanto foi gasto.", 422, "quantity");
  }

  const produto = input.product_id
    ? await db.product.findUnique({ where: { id: input.product_id } })
    : null;
  if (input.product_id && !produto) {
    return fail("VALIDATION_ERROR", "Produto não encontrado.", 422, "product_id");
  }
  const descricao = (input.description ?? produto?.name ?? "").trim();
  if (!descricao) {
    return fail("VALIDATION_ERROR", "Diga qual foi o combustível.", 422, "description");
  }

  /**
   * O §22 aceita as duas formas de dizer o valor: o total ("gastei R$ 480") e
   * o unitário ("R$ 6,00 o litro"). O total informado VENCE, porque foi o que
   * o produtor viu na bomba.
   */
  let valor: number | null = null;
  if (input.amount !== null && input.amount !== undefined && Number.isFinite(input.amount)) {
    valor = input.amount;
  } else if (
    input.unit_price !== null &&
    input.unit_price !== undefined &&
    Number.isFinite(input.unit_price)
  ) {
    valor = Math.round(input.unit_price * input.quantity * 100) / 100;
  }
  if (valor !== null && valor <= 0) {
    return fail("VALIDATION_ERROR", "O valor precisa ser maior que zero.", 422, "amount");
  }

  const quando = input.occurred_at ?? new Date();

  const criado = await runSerializableTenantTransaction(db, async (tx) => {
    let movimentoId: string | null = null;
    if (produto) {
      const mov = await recordStockMovementInTx(db, tx, {
        product_id: produto.id,
        property_id: job.property_id,
        movement_type: "utilizacao",
        quantity: input.quantity,
        occurred_at: quando,
        service_job_id: job.id,
        purpose: `Serviço: ${job.description}`,
        recorded_by_user_id: input.user_id ?? null,
      });
      if (!mov.ok) throw new Error(mov.message);
      movimentoId = mov.data.id;
    }

    return tx.serviceJobCost.create({
      data: scoped({
        service_job_id: job.id,
        kind: "combustivel",
        description: descricao,
        amount: valor,
        quantity: input.quantity,
        unit: produto?.unit ?? input.unit ?? null,
        occurred_at: quando,
        stock_movement_id: movimentoId,
        recorded_by_user_id: input.user_id ?? null,
      }),
    });
  });

  const saldo = produto
    ? ((await getStockBalance(db, { product_id: produto.id }))[0]?.quantity ?? 0)
    : null;

  return ok({ ...serializar(criado as never), saldo_do_produto: saldo });
}
```

Acrescente ao topo do arquivo:

```ts
import { recordStockMovementInTx, getStockBalance } from "@/lib/actions/stock-ledger";
```

⚠️ **Confira o tipo de `StockPosition.quantity`** antes de comparar com 420:
`getStockBalance` devolve os campos já serializados ou `Decimal`? Leia o tipo e
converta se precisar, em vez de confiar.

- [ ] **Passo 4: rodar e ver passar. Depois quebrar**

Faça `recordServiceFuel` recusar quando não houver produto (`if (!produto)
return fail(...)`) e confira que **"sem produto cadastrado, o custo entra assim
mesmo"** reprova. É o "SE" literal do §21. Devolva.

- [ ] **Passo 5: rodar `m37` e `m38`, as duas suítes do estoque**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:6390" npm run test:m37
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:6390" npm run test:m38
```

A Task 5 mexe em `stock-ledger.ts`, que é módulo fechado e em produção. As duas
verdes são a prova de que o campo novo não mudou nada do que já existia.

- [ ] **Passo 6: commit**

```
git add src/lib/actions/service-costs.ts src/lib/actions/stock-ledger.ts scripts/m60-custeio-do-servico.test.ts
git commit -m "Servico: o combustivel do §21 baixando o estoque, sem duplicar a despesa"
```

---

## Task 6: o resultado do §25 e o resumo do §41

**Arquivos:**
- Modificar: `src/lib/actions/service-jobs.ts` (`ServiceJobDetailView` ganha o custo)
- Modificar: `src/lib/actions/machine-services.ts` (`getServicesSummary`)
- Modificar: `scripts/m60-custeio-do-servico.test.ts` (blocos 6 e 7)

**Interfaces:**
- Produz:
  ```ts
  // em ServiceJobDetailView, três campos novos:
  //   custo_total: number;
  //   custo_por_natureza: Partial<Record<ServiceCostKind, number>>;
  //   resultado: number;      // total - custo_total
  //   costs: ServiceCostView[];

  export type ServicesSummary = {
    servicos: number;
    quantidade_por_unidade: Partial<Record<ServicePricing, number>>;
    valor: number;
    recebido: number;
    a_receber: number;
  };
  export async function getServicesSummary(
    db: TenantPrismaClient,
    periodo: { de: Date; ate: Date },
  ): Promise<ServicesSummary>;
  ```

- [ ] **Passo 1: o bloco 6, o exemplo literal do §25**

```ts
    console.log("\n6. §25: receita 4.500, custo 1.600, resultado 2.900");
    const paraOResultado = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-07T12:00:00.000Z"),
      description: "Ensilagem do §25",
      pricing: "hectare",
      unit_price: 300,
      quantity: 15,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    if (!paraOResultado.ok) throw new Error("createServiceJob falhou");

    await recordServiceCost(db, {
      service_job_id: paraOResultado.data.id,
      kind: "combustivel",
      description: "Diesel",
      amount: 800,
    });
    await recordServiceCost(db, {
      service_job_id: paraOResultado.data.id,
      kind: "mao_de_obra",
      description: "Operador",
      amount: 600,
    });
    await recordServiceCost(db, {
      service_job_id: paraOResultado.data.id,
      kind: "outro",
      description: "Outros",
      amount: 200,
    });

    const comResultado = await getServiceJobDetail(db, paraOResultado.data.id);
    check("receita 4.500", comResultado.ok && comResultado.data.total === 4500,
      comResultado.ok ? String(comResultado.data.total) : "recusado");
    check("custo registrado 1.600", comResultado.ok && comResultado.data.custo_total === 1600,
      comResultado.ok ? String(comResultado.data.custo_total) : "recusado");
    check("resultado simples 2.900", comResultado.ok && comResultado.data.resultado === 2900,
      comResultado.ok ? String(comResultado.data.resultado) : "recusado");

    /**
     * ⚠️ O resultado é do SERVIÇO, e o serviço contratado também tem um: ele é
     * NEGATIVO, porque um serviço que a fazenda contratou não tem receita. Uma
     * implementação que só calculasse para o prestado deixaria a ficha do
     * contratado com um campo em branco no lugar de um número verdadeiro.
     */
    const contratadoComCusto = await createServiceJob(db, {
      direction: "contratado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-07T12:00:00.000Z"),
      description: "Roçada contratada",
      pricing: "fechado",
      agreed_amount: 1000,
    });
    await recordServiceCost(db, {
      service_job_id: contratadoComCusto.ok ? contratadoComCusto.data.id : "",
      kind: "pedagio",
      description: "Pedágio",
      amount: 50,
    });
    const fichaContratado = await getServiceJobDetail(
      db,
      contratadoComCusto.ok ? contratadoComCusto.data.id : "",
    );
    check(
      "no contratado o resultado é negativo: 1.000 de custo mais 50",
      fichaContratado.ok && fichaContratado.data.resultado === -1050,
      fichaContratado.ok ? String(fichaContratado.data.resultado) : "recusado",
    );
```

⚠️ Para o contratado, `resultado` é `-(total) - custo_total`. Escreva a fórmula
por direção, não um `total - custo` que só faz sentido de um lado:

```ts
  const resultado =
    job.direction === "prestado" ? total - custoTotal : -(total + custoTotal);
```

- [ ] **Passo 2: o bloco 7, o resumo do §41**

```ts
    console.log("\n7. §41: o resumo do mês");
    const { getServicesSummary } = await import("@/lib/actions/machine-services");
    const resumo = await getServicesSummary(db, {
      de: new Date("2026-09-01T00:00:00.000Z"),
      ate: new Date("2026-09-30T23:59:59.999Z"),
    });
    check("conta os serviços do período", resumo.servicos > 0, String(resumo.servicos));
    check(
      "soma as horas e os hectares SEPARADOS, como o §32",
      typeof resumo.quantidade_por_unidade.hora === "number" &&
        typeof resumo.quantidade_por_unidade.hectare === "number",
      JSON.stringify(resumo.quantidade_por_unidade),
    );
    check(
      "e os três números do dinheiro fecham: valor = recebido + a receber",
      Math.abs(resumo.valor - (resumo.recebido + resumo.a_receber)) < 0.01,
      `${resumo.valor} = ${resumo.recebido} + ${resumo.a_receber}`,
    );

    /**
     * ⚠️ O resumo é do PRESTADO. O §41 diz "Valor dos serviços / Recebido / A
     * receber", e "recebido" não significa nada num serviço que a fazenda
     * contratou: ali o dinheiro sai. Misturar as duas direções faria a despesa
     * de um serviço contratado aparecer como faturamento do mês.
     */
    const soPrestado = await db.serviceJob.count({
      where: {
        direction: "prestado",
        canceled_at: null,
        occurred_at: {
          gte: new Date("2026-09-01T00:00:00.000Z"),
          lte: new Date("2026-09-30T23:59:59.999Z"),
        },
      },
    });
    check(
      "e o contratado NÃO entra na conta",
      resumo.servicos === soPrestado,
      `${resumo.servicos} no resumo, ${soPrestado} prestados`,
    );
```

- [ ] **Passo 3: implementar os dois, rodar, ver passar**

`getServicesSummary` filtra `direction: "prestado"`, `canceled_at: null` e
`occurred_at` no período, e reusa `totalDoServico`/`quantidadeTrabalhada`. O
recebido e o a receber saem de `FinancialEntry` com `related_id` dos serviços
achados, exatamente como `listServiceJobs` faz: uma consulta só, nunca uma por
linha.

- [ ] **Passo 4: quebrar de propósito**

Tire o `direction: "prestado"` do filtro e confira que **"o contratado NÃO
entra na conta"** reprova. Devolva.

- [ ] **Passo 5: commit**

```
git add src/lib/actions/ scripts/m60-custeio-do-servico.test.ts
git commit -m "Servico: o resultado do §25 e o resumo mensal do §41"
```

---

## Task 7: as rotas

**Arquivos:**
- Criar: `src/app/api/v1/service-jobs/[id]/logs/route.ts`
- Criar: `src/app/api/v1/service-jobs/[id]/costs/route.ts`
- Criar: `src/app/api/v1/service-jobs/[id]/status/route.ts`
- Modificar: `src/app/(public)/docs/api/endpoints.ts`

⚠️ **Leia `src/app/api/v1/service-jobs/[id]/payments/route.ts` antes de
escrever.** Ele é o vizinho mais próximo, e as duas armadilhas da casa estão
nele: `readJson` devolve `{ json }` OU `{ error }` (nunca o corpo direto), e os
`params` chegam em `props`, não num segundo argumento desestruturado.

- [ ] **Passo 1: `POST /service-jobs/:id/logs`**

Guard `servicos:write`, perfil fazenda. Zod:

```ts
const schema = z.object({
  quantity: z.number().positive("A quantidade precisa ser maior que zero").nullish(),
  occurred_at: z.string().datetime("Informe uma data válida").nullish(),
  notes: z.string().trim().max(500).nullish(),
  hour_meter_start: z.number().nonnegative().nullish(),
  hour_meter_end: z.number().nonnegative().nullish(),
});
```

- [ ] **Passo 2: `GET` e `POST /service-jobs/:id/costs`**

O `GET` devolve `getServiceCosts`. O `POST` bifurca: com `product_id` ou com
`kind: "combustivel"`, chama `recordServiceFuel`; senão, `recordServiceCost`.

⚠️ **A recusa do Zod sai por `apiErroDeZod(parsed.error)`**, nunca à mão. A
trava 12 do `npm run check` reprova o contrário.

- [ ] **Passo 3: `PATCH /service-jobs/:id/status`**

```ts
const schema = z.object({ status: z.enum(["em_andamento", "concluido"]) });
```

- [ ] **Passo 4: `/docs/api`, e a conferência**

Acrescente as três entradas na seção "Serviços contratados e prestados
(Módulos 33 e 34)", no formato das que já estão lá. Depois:

```
npm run test:docs-api
npm run check
npx tsc --noEmit
```

- [ ] **Passo 5: provar a recusa contra o servidor**

Com `next dev` de pé contra o banco local, e o cookie de
`npx tsx scripts/_sessao-local.ts`:

```
POST /api/v1/service-jobs/<id>/logs  com {"quantity": 5, "hour_meter_start": 100, "hour_meter_end": 108}
```

Espere `422` com `field: "quantity"` e a mensagem em português.

⚠️ **Reinicie o `next dev`** antes desta prova: o servidor serve o client
Prisma que existia quando começou, e a Task 1 criou uma tabela. Está em
`docs/conhecimento/dev-server-servido-com-client-prisma-velho.md` e já mordeu
duas vezes nesta sequência.

- [ ] **Passo 6: commit**

```
git add src/app/api/v1/service-jobs "src/app/(public)/docs/api/endpoints.ts"
git commit -m "Rotas: producao diaria, custo do servico e a mudanca de situacao"
```

---

## Task 8: as telas

**Arquivos:**
- Criar: `src/components/servicos/service-log-form.tsx`
- Criar: `src/components/servicos/service-cost-form.tsx`
- Criar: `src/components/servicos/service-status-buttons.tsx`
- Modificar: `src/app/(dashboard)/servicos/[id]/page.tsx`
- Modificar: `src/app/(dashboard)/servicos/page.tsx`
- Modificar: `src/components/servicos/labels.ts`

- [ ] **Passo 1: os rótulos**

Em `labels.ts`, um `Record` COMPLETO, para valor novo no enum quebrar a
compilação até ganhar rótulo (é a trava que pegou `laticinio` em
`contact-labels.ts`):

```ts
export const SERVICE_COST_KIND_LABELS: Record<ServiceCostKind, string> = {
  combustivel: "Combustível",
  mao_de_obra: "Mão de obra",
  pedagio: "Pedágio",
  alimentacao: "Alimentação",
  transporte: "Transporte",
  manutencao: "Manutenção",
  pecas: "Peças",
  lubrificantes: "Lubrificantes",
  comissao: "Comissão",
  outro: "Outros",
};
```

- [ ] **Passo 2: o painel de produção diária**

Segue a receita da casa (`FormSheet` + `Field` + `useErrosDeFormulario`), com
`ORDEM = ["quantity", "hour_meter_start", "hour_meter_end", "occurred_at", "notes"]`.

⚠️ **Todo campo do `ORDEM` precisa de `error=` no `<Field>`** (conferência 15
do `npm run check`). Um campo listado sem ele engole a recusa inteira.

⚠️ **`prefixoDeId` é obrigatório** se este painel dividir a página com o de
custo, e ele vai dividir: os dois têm um campo de data.

⚠️ **Nada de `<input type="number">`** (conferência 7): use `MoneyInput` com
`kind="quantidade"`.

- [ ] **Passo 3: o painel de custo, com o ramo do combustível**

Um seletor de natureza no topo. Quando é `combustivel`, aparecem produto
(opcional, da lista do estoque), quantidade e valor por unidade, e some o
"saiu do caixa". Nas outras naturezas, aparece o valor e o "saiu do caixa".

⚠️ **Campo que some não pode ser cobrado.** A cobrança de `quantity` e
`unit_price` fica condicionada a `kind === "combustivel"`, como
`unit_price`/`agreed_amount` já é condicionada a `pricing` no formulário de
serviço.

- [ ] **Passo 4: a ficha do serviço**

Uma seção "Custos" com a tabela e a soma por natureza, e um cartão com os três
números do §25: receita, custo registrado e resultado. Mais o horímetro, quando
houver, na linha de subtítulo que a 34.1 criou.

⚠️ **Nada de cor crua do Tailwind** (conferência 8): use token semântico. E não
use `bg-tibe-light`, que é o alias depreciado que aponta para o fundo da própria
página e produz pílula invisível.

- [ ] **Passo 5: o resumo do §41 na listagem**

Um bloco "Serviços com máquinas: <mês>" com os cinco números do documento:
serviços realizados, horas trabalhadas, área atendida, valor, recebido, a
receber.

- [ ] **Passo 6: `check`, `tsc`, `lint`**

- [ ] **Passo 7: validar no navegador (invariante 8)**

⚠️ **Reinicie o `next dev`** se ele estiver de pé desde antes da Task 1.

⚠️ Use o **browser-harness**, não o `claude-in-chrome`. Se der
`CDP WS handshake failed`, o usuário precisa liberar a depuração remota em
`chrome://inspect/#remote-debugging`: é clique dele, não dá para contornar.

⚠️ **Olhe o contador de issues do overlay do Next**, no canto inferior
esquerdo. Foi ele, e só ele, que denunciou o `Decimal` atravessando para um
Client Component na fase 34.1, com `tsc`, `lint`, `check` e as suítes verdes.
Está em `docs/conhecimento/decimal-do-prisma-so-quebra-no-console-do-navegador.md`.

Confirme, olhando: o §19 (três lançamentos somando 16 horas numa ficha só), o
§33 (horímetro 1.250 para 1.258 dando 8 horas, e a ficha da máquina em 1.258),
o §21 (o estoque do diesel caindo em `/estoque`), o §25 (os três números) e o
§41 (o resumo).

- [ ] **Passo 8: commit**

```
git add src/components/servicos "src/app/(dashboard)/servicos"
git commit -m "Telas: a producao diaria, o custo do servico e o resultado do §25"
```

---

## Task 9: o WhatsApp (§42)

**Arquivos:**
- Modificar: `src/lib/actions/whatsapp-handlers/servico.ts`
- Modificar: `src/lib/actions/service-pending.ts`
- Modificar: `src/lib/whatsapp-intents.ts`, `src/lib/actions/whatsapp-router.ts`
- Modificar: `scripts/m60-custeio-do-servico.test.ts` (bloco 8)

O §42 tem cinco conversas, e três já existem (o cadastro, na 34.1; o
recebimento, pela rota, na 34.1). Faltam:

| frase do §42 | intenção |
|---|---|
| "Comecei a gradagem do João hoje." | `iniciar_servico` |
| "Fiz 8 hectares hoje." | `registrar_producao_servico` |
| "Gastei 60 litros de diesel hoje nesse serviço." | `registrar_combustivel_servico` |
| "Terminei o serviço do João." | `encerrar_servico` |
| "João me pagou 2 mil hoje." | `registrar_recebimento_servico` |

⚠️ **Todas precisam achar QUAL serviço**, e é aí que mora o risco. O produtor
diz "o serviço do João", não um id. A regra é a mesma de `resolverMaquina` na
34.1: **ambiguidade pergunta, e nada é escolhido em silêncio**. Um "fiz 8
hectares hoje" que caísse no primeiro serviço em andamento poria a produção no
cliente errado, e o §32 mandaria as horas para a máquina errada junto.

- [ ] **Passo 1: `resolverServicoEmAndamento`**

```ts
/**
 * Acha o serviço a que a frase se refere, sem inventar.
 *
 * Procura entre os NÃO CONCLUÍDOS, porque "fiz 8 hectares hoje" é sobre algo em
 * curso. Com o nome do cliente, filtra por ele; sem nome, só resolve se houver
 * exatamente um em andamento.
 *
 * ⚠️ Dois em andamento e nenhum nome é PERGUNTA, nunca o primeiro. É o defeito
 * que `resolverPasto` ainda tem (`dividas.md` §3.3), e este caminho nasce sem
 * ele.
 */
async function resolverServicoEmAndamento(
  db: TenantPrismaClient,
  cliente: string | null,
): Promise<{ ok: true; job: { id: string; description: string } } | { ok: false; resposta: RouterResult }>
```

- [ ] **Passo 2: o bloco 8**

Cobre, no mínimo:

1. "Fiz 8 hectares hoje" com UM serviço em andamento: pede confirmação
   mostrando "acrescentar 8 hectares ao serviço de gradagem do João", e o "sim"
   soma.
2. **DOIS serviços em andamento e nenhum nome: PERGUNTA**, listando os dois.
   Este é o caso que discrimina.
3. "Gastei 60 litros de diesel": confirma, e o "sim" baixa o estoque.
4. "não" cancela, e NADA é gravado. Primeira coisa checada no handler.
5. "Terminei o serviço do João": responde com quantidade total, valor total e
   situação do pagamento, que são os três itens que o §42 lista em letra.

⚠️ **No segundo turno, mande APENAS o campo que faltava.** O classificador não
remonta o pedido, e um teste que reenvia tudo prova um classificador que não
existe. A regra inteira, com a tabela de campos remontados, está em
`.claude/rules/whatsapp.md`, e a `m58` já tem os dois caminhos escritos: leia o
bloco 16 dela antes de escrever este.

- [ ] **Passo 3: implementar, e provar as travas quebrando**

As três de sempre: recusa cancela; o "sim" executa o MOSTRADO; ambiguidade
pergunta. Quebre cada uma e confira que a conferência certa reprova.

- [ ] **Passo 4: commit**

```
git add src/lib/actions/ src/lib/whatsapp-intents.ts scripts/m60-custeio-do-servico.test.ts
git commit -m "Agente: as cinco conversas do §42, com o servico que nunca e escolhido em silencio"
```

---

## Task 10: fechar a rodada

- [ ] **Passo 1: a suíte inteira**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:6390" npm run test:all
```

Espere `63/63 passaram`. Qualquer vermelha é regressão desta fase até prova em
contrário: a `m37`, a `m38`, a `m58` e a `m59` cobrem código que esta fase
tocou.

- [ ] **Passo 2: os critérios de aceite do §46**

O documento lista 30 itens. Percorra a lista e diga, item por item, o que passou
e o que faltou, ANTES de o usuário validar à mão. É o passo 4 do protocolo do
`CLAUDE.md`, e é o que impede "concluído" de significar "compilou".

- [ ] **Passo 3: as decisões 17, 18 e 19 na spec de design**

Acrescente as três à seção 3.2 de
`docs/superpowers/specs/2026-09-02-mao-de-obra-e-servicos-com-maquinas-design.md`,
no formato das 16 que já estão lá. A spec é o documento de registro: uma decisão
que só existe neste plano some quando o plano for arquivado.

- [ ] **Passo 4: as dívidas**

**Confira antes de escrever que fecha.** Esta fase provavelmente NÃO fecha
nenhuma dívida conhecida. O que ela muda:

- a §2.10 (o rótulo "Prestador") ganha mais linhas sob o mesmo nome, agora com
  as categorias de custo;
- a §3.3 (`resolverPasto` devolve o primeiro achado) fica mais visível: a Task 9
  cria mais um caminho que resolve isso do jeito CERTO, e o contraste com
  `resolverPasto` fica gritante. Vale registrar isso no item.

- [ ] **Passo 5: o handoff**

Substitua "Estado atual" em `docs/agents/current-handoff.md`. Se passar de 200
linhas, arquive em `docs/agents/historico/2026-09.md` ANTES de acrescentar.

- [ ] **Passo 6: a lição no cofre, se houver**

```
grep -ril "<termo>" docs/conhecimento/
```

Procure antes de criar; nota existente recebe seção nova, não reescrita. **Se
nada surpreendeu, não invente nota.**

- [ ] **Passo 7: commit e PARAR**

⚠️ **Não faça merge nem push.** A migração precisa ir ao Neon antes, e os dois
passos são do usuário, a cada vez.

---

## Autorrevisão deste plano

**Cobertura da spec.** §19 e §20 → Task 2. §21, §22, §35 → Task 5. §23, §24 →
Task 4. §25 → Task 6. §32 → já entregue na 34.1, e a Task 2 alimenta o
horímetro que o §32 usa. §33 → Task 2. §34 → **fora de escopo, por decisão
registrada**: o documento diz "futuramente" e a spec de design põe o alerta na
frente do alertário. §41 → Task 6. §42 → Tasks 3 e 9. §43 → já entregue na
33.2. §46 → Task 10, passo 2.

**Sem marcador vazio.** Nenhum passo diz "implemente depois" ou "trate os erros
apropriadamente". Os três lugares em que o plano manda CONFERIR em vez de
mostrar o código (`EntryStatus` cancelado na Task 4, o tipo de
`StockPosition.quantity` na Task 5, o vizinho `payments/route.ts` na Task 7) são
deliberados: são fatos do repositório que o plano não deve fixar de memória, e
cada um diz exatamente onde olhar.

**Consistência de tipos.** `ServiceCostView` é definido na Task 4 e usado nas
Tasks 5, 6, 7 e 8 com o mesmo nome e os mesmos campos. `recordServiceCost` e
`recordServiceFuel` são dois caminhos distintos de propósito, e só o primeiro
cria dinheiro. `getServiceCosts` devolve `{ linhas, total, por_natureza }` nas
três tarefas que a chamam.

**Um risco que este plano não elimina.** A Task 5 mexe em `stock-ledger.ts`,
que é módulo fechado e em produção. O passo 5 daquela tarefa existe só por
isso, e não deve ser pulado.
