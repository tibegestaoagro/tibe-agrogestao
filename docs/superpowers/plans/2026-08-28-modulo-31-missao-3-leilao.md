# Módulo 31, missão 3: plano de implementação

> **Para executores:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans` para executar tarefa por tarefa. Os passos usam
> caixa (`- [ ]`) para acompanhamento.

**Objetivo:** o produtor manda gado para leilão sem que isso vire venda, e
fecha a remessa depois dizendo quantos venderam, quantos voltaram e quantos
seguiram para outro destino.

**Arquitetura:** a remessa é uma `Negotiation(evento)` sem valor, com uma
`HerdStay(evento)` filha. As movimentações apontam para as duas. No
encerramento, a mesma negociação ganha o valor, os custos viram lançamentos
filhos, e cada destino vira um movimento.

**Stack:** Prisma 7 sobre PostgreSQL 17, Next.js 14 (App Router), Zod nas
rotas, suítes em `tsx scripts/*.test.ts`.

**Spec:** [2026-08-28-modulo-31-missao-3-leilao-design.md](../specs/2026-08-28-modulo-31-missao-3-leilao-design.md)

## Restrições globais

- **O envio NÃO gera receita** (§17.8). Se você se pegar criando
  `FinancialEntry` na abertura, parou no lugar errado.
- **O saldo nunca é gravado** (invariante 2). O que está na remessa é a soma
  das movimentações que apontam para ela.
- **`tenant_id` nunca vem do client** (invariante 1).
- **Migração antes do push** (invariante 3), aplicada primeiro no Docker local.
  No Neon, só junto do merge, com autorização do usuário.
- **Regra de negócio em `src/lib/actions/`**, nunca no route handler.
- **Travessão (U+2014) é proibido**; heredoc com escape no shell também.
- **Cor crua do Tailwind é reprovada** pelo `npm run check`. Tela nova usa
  token semântico e o kit (`FormSheet`, `Field`, `EmptyState`).
- **`npx tsc --noEmit` tem ruído pré-existente** em
  `scripts/m23-token-auth.test.ts`, e só nele.
- **Banco local, sempre:**
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public"`,
  com `docker start tibe-pg` antes.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | `HerdStay.negotiation_id` e `HerdStay.event_type` |
| `prisma/migrations/<ts>_remessa_de_evento/migration.sql` | a migração |
| `src/lib/actions/event-consignments.ts` | **novo.** Abrir e encerrar remessa |
| `src/lib/actions/negotiations.ts` | `cancelNegotiation` passa a desfazer a estadia |
| `src/app/api/v1/negotiations/events/route.ts` | **novo.** POST abrir |
| `src/app/api/v1/negotiations/[id]/close-event/route.ts` | **novo.** POST encerrar |
| `src/lib/actions/whatsapp-handlers/evento.ts` | **novo.** As três operações por conversa |
| `src/lib/whatsapp-intents.ts` | as intenções novas e o acesso delas |
| `src/lib/actions/whatsapp-router.ts` | roteia as intenções novas |
| `src/components/negociacoes/event-form.tsx` | **novo.** Abrir remessa |
| `src/components/negociacoes/event-close-form.tsx` | **novo.** Encerrar |
| `scripts/m48-leilao.test.ts` | **novo.** A suíte da frente |

---

### Task 1: schema e migração

**Arquivos:**
- Modificar: `prisma/schema.prisma`
- Criar: `prisma/migrations/<timestamp>_remessa_de_evento/migration.sql`

**Interfaces:**
- Produz: `HerdStay.negotiation_id` (anulável, FK para `Negotiation`) e
  `HerdStay.event_type` (anulável, texto).

- [ ] **Passo 1: acrescentar os dois campos**

Em `model HerdStay`, junto dos outros campos:

```prisma
  /// De qual envelope comercial a estadia nasceu. Só a remessa de evento tem:
  /// pasto de terceiro, boitel e desaparecimento não são negócio. O filho
  /// aponta para o envelope, como em `HerdMovement.negotiation_id`.
  negotiation_id String?

  /// "Tipo do evento" do §8.1: leilão, feira, exposição. Texto livre porque o
  /// documento não fecha a lista, e uma constante nossa recusaria o que o
  /// produtor escrever.
  event_type String?
```

E na seção de relações do mesmo model:

```prisma
  negotiation Negotiation? @relation(fields: [negotiation_id], references: [id], onDelete: SetNull)
```

⚠️ **O Prisma exige o lado inverso.** Acrescente `herd_stays HerdStay[]` em
`model Negotiation`, senão `npx prisma validate` reprova com "missing opposite
relation field".

- [ ] **Passo 2: validar**

Run: `npx prisma validate`
Esperado: "The schema at prisma\schema.prisma is valid".

- [ ] **Passo 3: gerar e salvar a migração**

```bash
docker start tibe-pg
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Salve a saída em `prisma/migrations/<timestamp>_remessa_de_evento/migration.sql`,
**sem a primeira linha** (`Loaded Prisma config from prisma.config.ts.`, que o
Prisma escreve antes do SQL e não é SQL).

⚠️ Se aparecer `DROP INDEX` de `WhatsAppProviderConfig_one_active` ou
`AnimalBatch_tenant_ear_tag_key`, remova as linhas: são índices parciais que o
schema não representa e que sustentam regra em produção. Na frente 2 o
`migrate diff` não os sugeriu, mas o `CLAUDE.md` avisa que ele costuma sugerir.

- [ ] **Passo 4: aplicar e regenerar o client**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run db:deploy
npx prisma generate
```

Sem o `generate`, `db.herdStay` não conhece os campos novos e as tarefas
seguintes falham com erro de tipo que parece erro seu.

- [ ] **Passo 5: conferir**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:isolation`
Run: `npm run check`

- [ ] **Passo 6: commit**

```bash
git add prisma/
git commit -m "A estadia passa a saber de qual negocio ela nasceu"
```

---

### Task 2: abrir a remessa

**Arquivos:**
- Criar: `src/lib/actions/event-consignments.ts`
- Criar: `scripts/m48-leilao.test.ts`
- Modificar: `package.json` (`test:m48`)

**Interfaces:**
- Consome: `recordMovementInTx(db, tx, input)` e `runSerializableTenantTransaction`;
  `findOrCreateContact(tx, nome)`; `situacaoDaEstadia`/`donoDaEstadia`/
  `tipoDeEnvio` de `@/lib/herd/stay-rules`.
- Produz:
  `openEventConsignment(db, input): Promise<ActionResult<{ id: string; stay_id: string }>>`,
  onde `input` tem `property_id`, `category_id`, `quantity`, `pasture_id?`,
  `event_name`, `event_type?`, `city?`, `organizer_name?`, `contact_id?`,
  `occurred_at?`, `expected_end_at?`, `notes?`, `recorded_by_user_id?`.

- [ ] **Passo 1: escrever a suíte que falha**

Crie `scripts/m48-leilao.test.ts` com o preâmbulo das suítes com banco (copie o
de `scripts/m47-estadias.test.ts`, que é o mais recente: `import "dotenv/config"`,
`exigirBancoLocal()`, criação de tenant, `try/finally` apagando o tenant).

Os casos:

```ts
console.log("1. A remessa nasce SEM receita nenhuma");
{
  const proprioAntes = soma(await getPositions(db, { owner: "proprio" }));
  const contasAntes = await db.financialEntry.count();

  const r = await openEventConsignment(db, {
    property_id: fazenda.id,
    category_id: "femea_36_mais",
    quantity: 20,
    event_name: "Leilão de Outubro",
    event_type: "leilão",
    organizer_name: "Leiloeira Central",
  });
  check("a remessa abre", r.ok, r.ok ? "" : r.message);

  check(
    "NENHUM lançamento financeiro nasce (§17.8)",
    (await db.financialEntry.count()) === contasAntes,
  );
  const negociacao = await db.negotiation.findFirst({ where: { id: r.ok ? r.data.id : "" } });
  check("a negociação é do tipo evento", negociacao?.type === "evento");
  check("e nasce SEM valor", negociacao?.amount === null, String(negociacao?.amount));

  check(
    "o rebanho próprio não muda: ainda é dele",
    soma(await getPositions(db, { owner: "proprio" })) === proprioAntes,
  );
  check(
    "20 cabeças passam a estar em evento",
    soma(await getPositions(db, { owner: "proprio", situation: "evento" })) === 20,
  );

  const estadia = await db.herdStay.findFirst({ where: { id: r.ok ? r.data.stay_id : "" } });
  check("a estadia aponta para a negociação", estadia?.negotiation_id === (r.ok ? r.data.id : null));
  check("com o tipo do evento gravado", estadia?.event_type === "leilão");
  check("e o nome do evento no local", estadia?.location_name === "Leilão de Outubro");

  const mov = await db.herdMovement.findFirst({ where: { stay_id: r.ok ? r.data.stay_id : "" } });
  check("o movimento é envio_evento", mov?.movement_type === "envio_evento");
  check("e aponta para os dois", mov?.negotiation_id != null && mov?.stay_id != null);
}

console.log("\n2. Sem saldo não abre, e nada fica pela metade");
{
  const negociacoesAntes = await db.negotiation.count();
  const estadiasAntes = await db.herdStay.count();
  const r = await openEventConsignment(db, {
    property_id: fazenda.id,
    category_id: "tourinho_reprodutor",
    quantity: 999,
    event_name: "Leilão impossível",
  });
  check("recusa por saldo", !r.ok && r.code === "INSUFFICIENT_BALANCE", r.ok ? "abriu" : r.code);
  check("apontando a quantidade", !r.ok && r.field === "quantity");
  check("e não deixa negociação órfã", (await db.negotiation.count()) === negociacoesAntes);
  check("nem estadia órfã", (await db.herdStay.count()) === estadiasAntes);
}
```

Em `package.json`, ao lado das outras:

```json
"test:m48": "tsx scripts/m48-leilao.test.ts",
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m48`
Esperado: FALHA com "Cannot find module '@/lib/actions/event-consignments'".

- [ ] **Passo 3: implementar**

`openEventConsignment`, numa transação só, na ordem:

1. valida quantidade inteira maior que zero (recusa com `field: "quantity"`) e
   categoria (`isValidCategory`);
2. resolve ou cria o contato pelo nome do organizador, com `findOrCreateContact(tx, nome)`,
   dentro da transação, para que uma recusa adiante não deixe contato órfão;
3. cria `Negotiation` com `type: "evento"` e **`amount: null`**;
4. cria `HerdStay` com `type: "evento"`, `negotiation_id`, `event_type`,
   `location_name` (o nome do evento), `city`, `counterparty_name` (o
   organizador) e `expected_end_at`;
5. grava o movimento com `recordMovementInTx`, tipo `tipoDeEnvio("evento")`, de
   `presente`/`proprio` para `evento`/`proprio` com `pasture_id: null` no
   destino, passando `negotiation_id` e `stay_id`.

⚠️ **Nenhum `createLinkedEntry` nesta função.** É o §17.8, e é o erro mais caro
possível aqui: receita antes da confirmação.

⚠️ **Para abortar de dentro da transação, use `AbortarNegociacao` mais
`comRollback`**, que já existem em `negotiations.ts` e são o mecanismo do
projeto. Devolver `fail()` de dentro do `$transaction` CONFIRMA a transação
(seção 6 da spec do Módulo 31), e aí a negociação ficaria gravada sem o
movimento. Exporte os dois de `negotiations.ts` se ainda não estiverem
exportados, em vez de criar um terceiro mecanismo.

- [ ] **Passo 4: rodar e ver passar**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m48`
Esperado: PASSA.

- [ ] **Passo 5: commit**

```bash
git add src/lib/actions/event-consignments.ts scripts/m48-leilao.test.ts package.json
git commit -m "Remessa para leilao: o gado sai da fazenda e nenhuma receita nasce"
```

---

### Task 3: encerrar com venda parcial

**Arquivos:**
- Modificar: `src/lib/actions/event-consignments.ts`
- Modificar: `scripts/m48-leilao.test.ts`

**Interfaces:**
- Produz: `closeEventConsignment(db, negotiationId, input)`, com
  `input: { vendidos?: number; retornados?: number; outro_destino?: { quantity: number; type: HerdStayType; counterparty_name?: string | null; location_name?: string | null } | null; amount?: number | null; pago?: boolean; due_date?: Date | null; parcelas?: { due_date: Date; amount: number }[]; custos?: { descricao: string; amount: number }[]; occurred_at?: Date | null; recorded_by_user_id?: string | null }`.

- [ ] **Passo 1: escrever os casos que falham**

```ts
console.log("\n3. A soma dos três destinos tem que bater com o enviado");
{
  const remessa = await abrirComVinte();
  const errado = await closeEventConsignment(db, remessa.id, { vendidos: 12, retornados: 5 });
  check("17 de 20 é recusado", !errado.ok && errado.code === "DESTINOS_NAO_BATEM", errado.ok ? "passou" : errado.code);
  check("apontando a quantidade", !errado.ok && errado.field === "quantity");
  check(
    "e nenhuma cabeça se mexeu",
    soma(await getPositions(db, { owner: "proprio", situation: "evento" })) === emEventoAntes + 20,
  );
}

console.log("\n4. Venda parcial: o exemplo do documento, 12 vendidos e 8 retornados");
{
  const presenteAntes = soma(await getPositions(db, { owner: "proprio", situation: "presente" }));
  const proprioAntes = soma(await getPositions(db, { owner: "proprio" }));
  const remessa = await abrirComVinte();

  const r = await closeEventConsignment(db, remessa.id, {
    vendidos: 12,
    retornados: 8,
    amount: 60000,
    pago: true,
    custos: [{ descricao: "Comissão da leiloeira", amount: 3000 }],
  });
  check("fecha", r.ok, r.ok ? "" : r.message);

  check(
    "os 8 voltaram para a fazenda",
    soma(await getPositions(db, { owner: "proprio", situation: "presente" })) === presenteAntes - 12,
  );
  check(
    "e o rebanho próprio caiu só os 12 vendidos",
    soma(await getPositions(db, { owner: "proprio" })) === proprioAntes - 12,
  );

  const negociacao = await db.negotiation.findFirst({ where: { id: remessa.id } });
  check("a MESMA negociação passa a ter valor", Number(negociacao?.amount) === 60000, String(negociacao?.amount));

  const lancamentos = await db.financialEntry.findMany({ where: { negotiation_id: remessa.id } });
  const principal = lancamentos.filter((l) => l.negotiation_role === "principal");
  const custos = lancamentos.filter((l) => l.negotiation_role === "custo_adicional");
  check("a receita dos vendidos nasce como principal", principal.length === 1 && Number(principal[0].amount) === 60000);
  check("e ela é RECEITA", principal[0]?.entry_type === "income");
  check("a comissão nasce como custo adicional", custos.length === 1 && Number(custos[0].amount) === 3000);
  check("e ela é DESPESA", custos[0]?.entry_type === "expense");
}

console.log("\n5. Outro destino abre uma estadia nova, sem cabeça sumir");
{
  const proprioAntes = soma(await getPositions(db, { owner: "proprio" }));
  const remessa = await abrirComVinte();
  const r = await closeEventConsignment(db, remessa.id, {
    vendidos: 5,
    retornados: 5,
    outro_destino: { quantity: 10, type: "pasto_terceiro", counterparty_name: "Sítio do João" },
    amount: 25000,
    pago: true,
  });
  check("fecha com os três destinos", r.ok, r.ok ? "" : r.message);
  check(
    "o rebanho próprio caiu só os 5 vendidos",
    soma(await getPositions(db, { owner: "proprio" })) === proprioAntes - 5,
  );
  check(
    "as 10 estão em pasto de terceiro",
    soma(await getPositions(db, { owner: "proprio", situation: "pasto_terceiro" })) === pastoAntes + 10,
  );
  check("nenhuma sobrou em evento", soma(await getPositions(db, { owner: "proprio", situation: "evento" })) === emEventoAntes);

  const novas = await db.herdStay.findMany({ where: { type: "pasto_terceiro", counterparty_name: "Sítio do João" } });
  check("a estadia nova existe", novas.length >= 1);
}

console.log("\n6. Sem venda não se aceita valor");
{
  const remessa = await abrirComVinte();
  const r = await closeEventConsignment(db, remessa.id, { retornados: 20, amount: 5000 });
  check(
    "valor sem venda é recusado",
    !r.ok && r.code === "VALOR_SEM_VENDA",
    r.ok ? "aceitou" : r.code,
  );

  const ok = await closeEventConsignment(db, remessa.id, { retornados: 20 });
  check("sem valor, o retorno total fecha", ok.ok, ok.ok ? "" : ok.message);
  const lancamentos = await db.financialEntry.findMany({ where: { negotiation_id: remessa.id } });
  check("e nenhum lançamento nasce", lancamentos.length === 0, String(lancamentos.length));
}
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m48`
Esperado: FALHA, `closeEventConsignment` não existe.

- [ ] **Passo 3: implementar**

Numa transação só:

1. lê a negociação (`type: "evento"`, não cancelada) e a estadia filha;
2. calcula o saldo aberto somando as movimentações da estadia, do mesmo jeito
   que `listStays` faz em `herd-stays.ts`;
3. **recusa quando `vendidos + retornados + outro_destino.quantity` não é igual
   ao saldo**, com `DESTINOS_NAO_BATEM` e `field: "quantity"`;
4. **recusa `amount` quando `vendidos` é zero**, com `VALOR_SEM_VENDA` e
   `field: "amount"` (decisão 4 da spec);
5. grava um movimento por destino, todos com `negotiation_id` e `stay_id`:
   `venda` para os vendidos, `retorno_estadia` para os retornados, e para o
   terceiro balde um `retorno_estadia` seguido do envio da estadia nova (ou o
   envio direto de `evento` para a situação da estadia nova, o que o
   `validateShape` aceitar: as duas pontas existem, é transferência);
6. quando há venda, grava `amount` na negociação e cria o lançamento
   `principal` por `createLinkedEntry`, com parcelas quando houver;
7. cria um lançamento `custo_adicional` por custo, cada um com a descrição.

⚠️ **A soma das parcelas tem que dar exatamente `amount`**, regra que a missão
1 já aplica em `validar()`. Reuse a mesma checagem em vez de escrever outra.

⚠️ **Nada de `HerdStayType` chutado no "outro destino".** O produtor escolhe, e
os valores válidos são os que `stay-rules.ts` conhece. Um tipo que não aceite
receber cabeças vindas de evento é recusa, não improviso.

- [ ] **Passo 4: rodar e ver passar**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m48`

- [ ] **Passo 5: commit**

```bash
git add src/lib/actions/event-consignments.ts scripts/m48-leilao.test.ts
git commit -m "Encerrar remessa: receita so para os vendidos, e a soma tem que bater"
```

---

### Task 4: cancelar desfaz a estadia junto

**Arquivos:**
- Modificar: `src/lib/actions/negotiations.ts` (`cancelNegotiation`)
- Modificar: `scripts/m48-leilao.test.ts`

- [ ] **Passo 1: escrever os casos que falham**

```ts
console.log("\n7. Cancelar a remessa desfaz rebanho, dinheiro e estadia");
{
  const presenteAntes = soma(await getPositions(db, { owner: "proprio", situation: "presente" }));
  const remessa = await abrirComVinte();
  const r = await cancelNegotiation(db, remessa.id, "lançado errado");
  check("cancela", r.ok, r.ok ? "" : r.message);
  check(
    "as 20 voltam para a fazenda",
    soma(await getPositions(db, { owner: "proprio", situation: "presente" })) === presenteAntes,
  );
  const estadia = await db.herdStay.findFirst({ where: { negotiation_id: remessa.id } });
  check("e a estadia fica marcada como cancelada", estadia?.canceled_at != null);
}

console.log("\n8. Remessa já encerrada não se cancela inteira");
{
  const remessa = await abrirComVinte();
  await closeEventConsignment(db, remessa.id, { vendidos: 10, retornados: 10, amount: 30000, pago: true });
  const r = await cancelNegotiation(db, remessa.id, "mudei de ideia");
  check(
    "recusa, porque desfazer venda é decisão do produtor",
    !r.ok && r.code === "ESTADIA_JA_ENCERRADA",
    r.ok ? "cancelou" : r.code,
  );
}
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m48`

- [ ] **Passo 3: implementar**

Em `cancelNegotiation`, dentro da mesma transação que já existe, depois de
cancelar os movimentos: buscar a `HerdStay` com `negotiation_id` igual ao da
negociação; se houver, recusar com `ESTADIA_JA_ENCERRADA` quando ela já tiver
movimento de saída, e marcar `canceled_at` quando não tiver.

⚠️ **Não duplique a lógica de `cancelStay`.** Se a regra ficar em dois lugares,
uma delas envelhece. Extraia o pedaço comum ou chame a função existente com o
`tx` da transação em curso.

- [ ] **Passo 4: rodar e ver passar, e conferir as vizinhas**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m48
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m35
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m47
```

O `m35` é o da missão 1 e cobre `cancelNegotiation`: se ele quebrar, a mudança
atingiu o cancelamento de venda de gado.

- [ ] **Passo 5: commit**

```bash
git add src/lib/actions/negotiations.ts scripts/m48-leilao.test.ts
git commit -m "Cancelar a remessa devolve as cabecas e fecha a estadia junto"
```

---

### Task 5: as rotas

**Arquivos:**
- Criar: `src/app/api/v1/negotiations/events/route.ts`
- Criar: `src/app/api/v1/negotiations/[id]/close-event/route.ts`
- Modificar: `src/app/(public)/docs/api/endpoints.ts`

- [ ] **Passo 1: escrever as duas rotas**

Wrappers finos, no padrão do projeto:

```ts
import { guard, readJson } from "@/lib/api-guard";
import { apiOk, apiError } from "@/lib/api";
import { withApi } from "@/lib/route";

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await openEventConsignment(g.db, {
    ...parsed.data,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
```

O `result.field` no fim é a fiação da frente 1: sem ele, a recusa de saldo
volta a cair no rodapé do painel.

⚠️ **`withApi` é obrigatório.** O `test:m40` varre o repositório e reprova
`export async function POST` cru.

- [ ] **Passo 2: documentar**

Acrescente as duas em `src/app/(public)/docs/api/endpoints.ts`, no grupo de
Negociações, dizendo o que mais importa: a abertura **não gera lançamento**, e
o encerramento recusa `DESTINOS_NAO_BATEM` e `VALOR_SEM_VENDA`.

- [ ] **Passo 3: conferir**

```bash
npm run test:docs-api
npm run test:m40
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:isolation
```

- [ ] **Passo 4: commit**

```bash
git add src/app/api/v1/negotiations "src/app/(public)/docs/api/endpoints.ts"
git commit -m "As duas rotas da remessa de evento"
```

---

### Task 6: o handler de WhatsApp

O §19 pede três operações por conversa: criar remessas, registrar vendas
parciais e registrar o retorno de animais não vendidos. **O classificador do
n8n NÃO é tocado** (decisão do usuário): o handler nasce pronto e espera.

**Arquivos:**
- Criar: `src/lib/actions/whatsapp-handlers/evento.ts`
- Modificar: `src/lib/whatsapp-intents.ts`
- Modificar: `src/lib/actions/whatsapp-router.ts`
- Modificar: `scripts/m48-leilao.test.ts`

- [ ] **Passo 1: escrever os casos que falham**

```ts
console.log("\n9. Pelo WhatsApp: abrir remessa e encerrar");
{
  const abrir = await rotear(db, "registrar_remessa_evento", {
    quantidade: 20,
    categoria: "vacas",
    evento: "Leilão de Outubro",
  });
  check("o assistente confirma antes de gravar", abrir.requires_confirmation === true);

  const confirmado = await rotear(db, "registrar_remessa_evento", {
    quantidade: 20,
    categoria: "vacas",
    evento: "Leilão de Outubro",
  }, { confirmed: true });
  check("confirmado, a remessa nasce", confirmado.action_taken?.startsWith("registrar_remessa_evento:ok"));
  check(
    "e a resposta diz que nao houve venda",
    /não .*(venda|receita)/i.test(confirmado.reply_text),
    confirmado.reply_text,
  );
}
```

O helper `rotear` é o mesmo do `m36` (o da missão 1 por WhatsApp): copie o
preâmbulo de lá, que já monta o contexto do handler com role e perfil.

- [ ] **Passo 2: registrar as intenções**

Em `src/lib/whatsapp-intents.ts`, acrescente à lista de `Intent` e a
`INTENT_ACCESS`:

```ts
  registrar_remessa_evento: { module: "rebanho", action: "write", profile: "fazenda" },
  encerrar_remessa_evento: { module: "rebanho", action: "write", profile: "fazenda" },
```

Módulo `rebanho` pelo mesmo motivo já documentado ali para estoque: o PRD não
define `ModuleKey` próprio, e quem pode mandar gado para leilão precisa poder
ver onde ele foi parar.

- [ ] **Passo 3: implementar o handler e rotear**

`src/lib/actions/whatsapp-handlers/evento.ts` exporta dois `Handler`, no padrão
dos existentes: leem `ctx.parameters`, **pedem confirmação antes de gravar**
(`requires_confirmation: true`), e no `confirmed` chamam a action.

⚠️ **Recusa explícita cancela sempre.** `ctx.explicitNo` significa "não, deixa
pra lá", e o estoque já pagou o preço de tratar isso de outro jeito: em
2026-08-18 uma compra recusada foi gravada. Siga o que `estoque.ts` faz.

Em `whatsapp-router.ts`, acrescente as duas ao mapa de handlers, junto de
`registrar_negocio_gado`.

- [ ] **Passo 4: rodar e ver passar**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m48
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m36
```

- [ ] **Passo 5: commit**

```bash
git add src/lib/actions/whatsapp-handlers/evento.ts src/lib/whatsapp-intents.ts src/lib/actions/whatsapp-router.ts scripts/m48-leilao.test.ts
git commit -m "Remessa de evento pelo WhatsApp: o handler nasce, o classificador espera"
```

---

### Task 7: a tela

**Arquivos:**
- Criar: `src/components/negociacoes/event-form.tsx`
- Criar: `src/components/negociacoes/event-close-form.tsx`
- Modificar: `src/app/(dashboard)/negociacoes/page.tsx`

- [ ] **Passo 1: o formulário de abrir**

`FormSheet` mais `Field`, com `id` estável igual ao nome do campo na API e o
estado de erro pelo `useErrosDeFormulario`, exatamente como o `stay-form.tsx`
da frente 2. Campos: nome do evento, tipo, organizador, fazenda, categoria,
quantidade, pasto de origem, data de saída, retorno previsto, observação.

Uma frase fixa abaixo do botão, porque é a coisa que o produtor mais precisa
entender: **enviar não é vender, e nada é lançado no Financeiro agora.**

- [ ] **Passo 2: o formulário de encerrar**

Três campos de quantidade (vendidos, retornaram, outro destino) com o **placar
ao vivo** que a frente 2 introduziu ("Faltam 8 para fechar" / "A conta fecha"),
copiando o padrão de `stay-close-form.tsx`.

O valor recebido e os custos aparecem **só quando "vendidos" passa de zero**,
que é a decisão 4 da spec virando comportamento de tela.

Quando "outro destino" passa de zero, aparecem os campos da estadia nova: tipo
e contraparte.

- [ ] **Passo 3: a linha na lista**

Na página de Negociações, a remessa aparece como as outras, com o tipo
"Evento". Enquanto a estadia estiver aberta, mostra o saldo e o botão de
encerrar; depois, mostra o valor como qualquer venda.

- [ ] **Passo 4: conferir**

```bash
npx tsc --noEmit
npm run lint
npm run check
```

O `check` reprova cor crua nova, então use os tokens.

- [ ] **Passo 5: commit**

```bash
git add src/components/negociacoes "src/app/(dashboard)/negociacoes"
git commit -m "A remessa de evento ganha tela, com o placar da soma"
```

---

### Task 8: validação ao vivo e fechamento

- [ ] **Passo 1: subir e validar no navegador**

```bash
docker start tibe-pg
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run dev
```

Abra `http://127.0.0.1:3000/negociacoes` (nunca `localhost`: não resolve nesta
máquina, e o `allowedDevOrigins` existe por causa disso) e confira, anotando os
números do painel de Rebanho antes e depois:

1. abrir remessa de 20: o rebanho próprio **não muda**, "fora, e voltam" sobe
   20, e o Financeiro **não ganha nenhum lançamento**;
2. a remessa aparece nas duas telas: em Negociações e em "Fora da fazenda
   agora", no Rebanho;
3. encerrar com 12 vendidos e 8 retornados: próprio cai 12, os 8 voltam, a
   receita nasce e a comissão aparece como custo;
4. tentar encerrar com soma errada: recusa, com a mensagem no campo;
5. tentar informar valor sem venda: recusa;
6. "outro destino" abrindo pasto de terceiro: as cabeças mudam de estadia, e
   nenhuma some.

- [ ] **Passo 2: a rede inteira**

```bash
docker start tibe-redis
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:all
```

- [ ] **Passo 3: documentos**

Atualize `docs/agents/current-handoff.md` com o estado da frente 3 e o próximo
passo (frente 4, a permuta). Em `docs/agents/dividas.md`, o item 2.1 passa a
ter só a missão 4.

- [ ] **Passo 4: parar**

Migração no Neon, merge e push exigem autorização explícita do usuário, a cada
vez.

---

## Auto-revisão

**Cobertura da spec.** Seção 4 (modelo) está na Task 1; seção 5 (abrir) na Task
2; seção 6 (encerrar, com os três destinos e o dinheiro) na Task 3; seção 7
(cancelar) na Task 4; seção 8 (entrega, WhatsApp, tela, provas) nas Tasks 5 a
8. As seis decisões da seção 3 têm teste: a 1 e a 2 na Task 2 e 3, a 3 no caso
5, a 4 no caso 6, a 5 na Task 6, a 6 no caso 4.

**Tipos.** `openEventConsignment` nasce na Task 2 e é usada nos testes das
Tasks 3, 4 e 6; `closeEventConsignment` nasce na Task 3 e é usada na 4;
`result.field` vem da frente 1 e aparece com o mesmo significado nas Tasks 2, 3
e 5.

**Uma decisão que o plano deixa para a implementação, de propósito:** como
gravar o "outro destino" no livro-razão, se como um movimento só de `evento`
para a situação da estadia nova, ou como retorno seguido de envio. As duas
respeitam o invariante 2 e o `validateShape` decide qual passa. O teste do caso
5 vale para as duas, porque ele confere o resultado (as cabeças na estadia
nova, nenhuma sumida), não o caminho.
