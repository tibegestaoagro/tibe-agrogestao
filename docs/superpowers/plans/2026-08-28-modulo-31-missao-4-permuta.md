# Módulo 31, missão 4: plano de implementação da permuta

> **Para executores:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans` para executar tarefa por tarefa. Os passos usam
> caixa (`- [ ]`) para acompanhamento.

**Objetivo:** o produtor entrega uma coisa, recebe outra, e o Tibé atualiza
rebanho, estoque, máquinas e financeiro a partir de UM registro só.

**Arquitetura:** a permuta é uma `Negotiation(permuta)` com um lado entregue e
um lado recebido. Cada lado é gravado por quem já sabe gravá-lo (livro-razão do
rebanho, livro-razão do estoque, cadastro de máquinas), e o lado que não tem
área no Tibé vira texto. A diferença em dinheiro é o único valor da negociação.

**Stack:** Prisma 7 sobre PostgreSQL 17, Next.js 14 (App Router), Zod nas rotas,
suítes em `tsx scripts/*.test.ts`.

**Spec:** [2026-08-28-modulo-31-missao-4-permuta-design.md](../specs/2026-08-28-modulo-31-missao-4-permuta-design.md)

## Restrições globais

- **O saldo nunca é gravado** (invariante 2): rebanho e estoque continuam sendo
  a soma das movimentações.
- **`tenant_id` nunca vem do client** (invariante 1).
- **Migração antes do push** (invariante 3), aplicada primeiro no Docker local.
  No Neon, só junto do merge, com autorização do usuário.
- **Regra de negócio em `src/lib/actions/`**, nunca no route handler.
- **Travessão (U+2014) é proibido**; heredoc com escape no shell também.
- **Cor crua do Tailwind é reprovada** pelo `npm run check`. Tela nova usa token
  semântico e o kit (`FormSheet`, `Field`, `EmptyState`, `MoneyInput`).
- **`npx tsc --noEmit` tem ruído pré-existente** em
  `scripts/m23-token-auth.test.ts`, e só nele. `npm run lint` tem 9 warnings
  pré-existentes e 0 erros.
- **Banco e Redis locais, sempre:**
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public"`
  e `REDIS_URL="redis://127.0.0.1:56379"`, com `docker start tibe-pg tibe-redis`
  antes.
- **A permuta NÃO tem custos adicionais.** O §15 (frete, comissão, taxa) é de
  compra e venda; o §12 não os menciona. Não invente o campo.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | os dois enums, as duas colunas de `Machine`, as duas de `Negotiation` |
| `prisma/migrations/<ts>_permuta/migration.sql` | a migração |
| `src/lib/actions/herd-ledger.ts` | `permuta_entrada` e `permuta_saida` nas listas de forma |
| `src/lib/actions/barters.ts` | **novo.** `createBarter`, a action inteira |
| `src/lib/actions/negotiations.ts` | direção do dinheiro na permuta; cancelar com máquina |
| `src/lib/validation/negotiation.ts` | o schema Zod da rota |
| `src/app/api/v1/negotiations/barters/route.ts` | **novo.** POST |
| `src/lib/actions/barter-pending.ts` | **novo.** A pendência da conversa |
| `src/lib/actions/whatsapp-handlers/permuta.ts` | **novo.** O handler |
| `src/lib/whatsapp-intents.ts` | a intenção nova e o acesso dela |
| `src/lib/actions/whatsapp-router.ts` | roteia a intenção nova |
| `src/components/negociacoes/barter-form.tsx` | **novo.** O formulário de dois lados |
| `src/app/(dashboard)/negociacoes/page.tsx` | o botão e a linha da permuta |
| `scripts/m49-permuta.test.ts` | **novo.** A suíte da frente |

---

### Task 1: schema, migração e a forma do movimento

**Arquivos:**
- Modificar: `prisma/schema.prisma`
- Modificar: `src/lib/actions/herd-ledger.ts` (listas `ENTRY_ONLY` e `EXIT_ONLY`)
- Criar: `prisma/migrations/<timestamp>_permuta/migration.sql`
- Criar: `scripts/m49-permuta.test.ts`
- Modificar: `package.json` (`test:m49`)

**Interfaces:**
- Produz: `HerdMovementType.permuta_entrada` e `permuta_saida`;
  `MachineStatus.negociada`; `Machine.acquired_negotiation_id` e
  `Machine.disposed_negotiation_id` (anuláveis, FK para `Negotiation`);
  `Negotiation.barter_out_note` e `barter_in_note` (anuláveis, texto).

- [ ] **Passo 1: acrescentar os valores de enum**

Em `enum HerdMovementType`, no fim da lista:

```prisma
  /// Missão 4 do Módulo 31. Tipos PRÓPRIOS, e não `compra`/`venda`
  /// reaproveitados: uma permuta não é venda, e o extrato do rebanho mostrando
  /// "Venda" de 20 cabeças sem receita nenhuma ligada é o §12.6 quebrado no
  /// lugar em que ele mais importa. O estoque já resolveu assim na missão 2.
  permuta_entrada
  permuta_saida
```

Em `enum MachineStatus`:

```prisma
  /// Máquina entregue numa permuta. `sold` não serve: a tela o mostra como
  /// "Vendida", e a máquina dada em troca não foi vendida.
  negociada
```

- [ ] **Passo 2: acrescentar as colunas**

Em `model Machine`, junto dos outros campos:

```prisma
  /// De qual permuta esta máquina VEIO. Duas colunas e não uma: um trator pode
  /// entrar por uma permuta e sair por outra, meses depois, e com uma coluna
  /// só o cancelamento não saberia qual dos dois vínculos está desfazendo.
  acquired_negotiation_id String?
  /// Por qual permuta esta máquina SAIU.
  disposed_negotiation_id String?
```

E na seção de relações do mesmo model:

```prisma
  acquired_negotiation Negotiation? @relation("MachineAcquired", fields: [acquired_negotiation_id], references: [id], onDelete: SetNull)
  disposed_negotiation Negotiation? @relation("MachineDisposed", fields: [disposed_negotiation_id], references: [id], onDelete: SetNull)
```

E os índices, junto dos que já existem:

```prisma
  @@index([acquired_negotiation_id])
  @@index([disposed_negotiation_id])
```

Em `model Negotiation`, junto de `notes`:

```prisma
  /// O lado da permuta que NÃO tem área no Tibé (serviço, outro): a descrição
  /// do produtor é tudo que existe. Nulos quando o lado é animais, produtos ou
  /// máquina, porque aí quem guarda o quê é o filho.
  barter_out_note String?
  barter_in_note  String?
```

⚠️ **O Prisma exige o lado inverso das duas relações.** Em `model Negotiation`,
junto de `herd_stays`:

```prisma
  machines_acquired Machine[] @relation("MachineAcquired")
  machines_disposed Machine[] @relation("MachineDisposed")
```

Sem isso `npx prisma validate` reprova com "missing opposite relation field".

- [ ] **Passo 3: validar o schema**

Run: `npx prisma validate`
Esperado: "The schema at prisma\schema.prisma is valid".

- [ ] **Passo 4: gerar e salvar a migração**

```bash
docker start tibe-pg tibe-redis
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Salve a saída em `prisma/migrations/<timestamp>_permuta/migration.sql`, **sem a
primeira linha** (`Loaded Prisma config from prisma.config.ts.`, que o Prisma
escreve antes do SQL e não é SQL).

⚠️ Se aparecer `DROP INDEX` de `WhatsAppProviderConfig_one_active` ou
`AnimalBatch_tenant_ear_tag_key`, **remova as linhas**: são índices parciais que
o schema não representa e que sustentam regra em produção. Nas frentes 2 e 3 o
`migrate diff` não os sugeriu, mas o `CLAUDE.md` avisa que ele costuma sugerir.

- [ ] **Passo 5: aplicar e regenerar o client**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run db:deploy
npx prisma generate
```

Sem o `generate`, `db.machine` não conhece as colunas novas e as tarefas
seguintes falham com erro de tipo que parece erro seu.

- [ ] **Passo 6: escrever a suíte que falha**

Crie `scripts/m49-permuta.test.ts`. Preâmbulo (copie o de
`scripts/m48-leilao.test.ts`, que é o mais recente):

```ts
import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import type { TenantPrismaClient } from "@/lib/prisma";
import type { HandlerCtx } from "@/lib/actions/whatsapp-handlers/shared";

exigirBancoLocal();

/**
 * Módulo 31, missão 4: permuta.
 *
 * A frase do cliente que esta suíte protege é o §12.6: "a permuta deverá ser
 * registrada como uma única negociação. O produtor não deverá precisar criar
 * manualmente uma venda e depois uma compra."
 *
 * Roda: `npm run test:m49`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

function ctx(
  db: TenantPrismaClient,
  tenantId: string,
  parameters: Record<string, unknown>,
  opts: { confirmed?: boolean; explicitNo?: boolean; userId?: string } = {},
): HandlerCtx {
  return {
    db,
    tenant_id: tenantId,
    role: "OWNER",
    activeProfiles: ["fazenda"],
    parameters,
    confirmed: opts.confirmed ?? false,
    explicitNo: opts.explicitNo ?? false,
    user_id: opts.userId,
  };
}
```

E o corpo, com o primeiro bloco:

```ts
async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { getPositions, recordMovement } = await import("@/lib/actions/herd-ledger");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M49 ${stamp}`, document: `M49${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const usuario = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      name: "Produtor de Teste",
      email: `m49-${stamp}@teste.local`,
      password_hash: "x",
      role: "OWNER",
    },
  });
  const USUARIO = usuario.id;
  const db = prismaForTenant(tenant.id);

  const soma = (posicoes: { quantity: number }[]) =>
    posicoes.reduce((s, p) => s + p.quantity, 0);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M49" }) });
    const pasto = await db.pasture.create({
      data: scoped({ property_id: fazenda.id, name: "Pasto A", area_hectares: 10 }),
    });

    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 300,
      to: {
        category_id: "macho_36_mais",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente",
        owner: "proprio",
      },
    });
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 300,
      to: {
        category_id: "femea_13_24",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente",
        owner: "proprio",
      },
    });

    console.log("1. A forma dos movimentos novos, antes de qualquer permuta");
    {
      // A ARMADILHA DA MISSÃO 3, que custou uma rodada: um tipo de movimento
      // novo que não entra nas listas de forma cai no ramo de `ajuste`, que
      // exige exatamente UMA das pontas. A action devolveria `ok` e o
      // movimento ficaria gravado com a forma errada.
      const entradaComOrigem = await recordMovement(db, {
        movement_type: "permuta_entrada",
        quantity: 1,
        from: {
          category_id: "macho_36_mais",
          property_id: fazenda.id,
          pasture_id: pasto.id,
          situation: "presente",
          owner: "proprio",
        },
        to: {
          category_id: "femea_13_24",
          property_id: fazenda.id,
          pasture_id: pasto.id,
          situation: "presente",
          owner: "proprio",
        },
      });
      check(
        "permuta_entrada é ENTRADA: recusa quando vem com origem",
        !entradaComOrigem.ok,
        entradaComOrigem.ok ? "aceitou as duas pontas" : entradaComOrigem.code,
      );

      const saidaComDestino = await recordMovement(db, {
        movement_type: "permuta_saida",
        quantity: 1,
        from: {
          category_id: "macho_36_mais",
          property_id: fazenda.id,
          pasture_id: pasto.id,
          situation: "presente",
          owner: "proprio",
        },
        to: {
          category_id: "femea_13_24",
          property_id: fazenda.id,
          pasture_id: pasto.id,
          situation: "presente",
          owner: "proprio",
        },
      });
      check(
        "permuta_saida é SAÍDA: recusa quando vem com destino",
        !saidaComDestino.ok,
        saidaComDestino.ok ? "aceitou as duas pontas" : saidaComDestino.code,
      );

      const saidaOk = await recordMovement(db, {
        movement_type: "permuta_saida",
        quantity: 2,
        from: {
          category_id: "macho_36_mais",
          property_id: fazenda.id,
          pasture_id: pasto.id,
          situation: "presente",
          owner: "proprio",
        },
      });
      check("com só a origem, passa", saidaOk.ok, saidaOk.ok ? "" : saidaOk.message);
      check(
        "e tira as 2 cabeças do rebanho",
        soma(await getPositions(db, { owner: "proprio", category_id: "macho_36_mais" })) === 298,
      );
    }
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

comBanco()
  .then(() => {
    console.log(
      falhas === 0 ? `\n✅ M49: permuta, 0 falhas.` : `\n❌ M49: ${falhas} falha(s).`,
    );
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((erro) => {
    console.error("\n❌ M49 quebrou:", erro);
    process.exit(1);
  });
```

Em `package.json`, ao lado das outras:

```json
"test:m49": "tsx scripts/m49-permuta.test.ts",
```

- [ ] **Passo 7: rodar e ver falhar**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m49`
Esperado: as duas primeiras conferências FALHAM, porque sem os tipos nas listas
o `validateShape` cai no ramo de `ajuste` e aceita as duas pontas.

- [ ] **Passo 8: pôr os dois tipos nas listas de forma**

Em `src/lib/actions/herd-ledger.ts`, na constante `ENTRY_ONLY`:

```ts
  // Missão 4: o animal recebido numa permuta não sai de posição nenhuma, do
  // mesmo jeito que uma compra. É entrada.
  "permuta_entrada",
```

E em `EXIT_ONLY`:

```ts
  // Missão 4: o animal entregue numa permuta sai do rebanho de vez, sem
  // destino, do mesmo jeito que uma venda.
  "permuta_saida",
```

- [ ] **Passo 9: rodar e ver passar**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m49`
Esperado: PASSA, 4 conferências verdes.

- [ ] **Passo 10: conferir as vizinhas**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:isolation
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m30
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m27
npm run check
```

O `m30` é o do livro-razão do rebanho e cobre `validateShape`; o `m27` é o de
máquinas e cobre o enum de status.

- [ ] **Passo 11: commit**

```bash
git add prisma/ src/lib/actions/herd-ledger.ts scripts/m49-permuta.test.ts package.json
git commit -m "A permuta ganha tipo proprio no rebanho, e a maquina sabe de qual troca veio"
```

---

### Task 2: gado por gado, com diferença recebida (§12.8)

**Arquivos:**
- Criar: `src/lib/actions/barters.ts`
- Modificar: `src/lib/actions/negotiations.ts` (a direção do dinheiro)
- Modificar: `scripts/m49-permuta.test.ts`

**Interfaces:**
- Consome: `recordMovementInTx(db, tx, input)` de `@/lib/actions/herd-ledger`;
  `runSerializableTenantTransaction` e `createLinkedEntry` de `@/lib/financial`;
  `findOrCreateContact(tx, nome)` de `@/lib/actions/contacts`;
  `AbortarNegociacao`, `comRollback` e `validarPagamento` de
  `@/lib/actions/negotiations`.
- Produz:

```ts
export type LadoEntregue =
  | { kind: "animais"; category_id: string; quantity: number; pasture_id?: string | null }
  | { kind: "produtos"; product_id: string; quantity: number }
  | { kind: "maquina"; machine_id: string }
  | { kind: "descricao"; texto: string };

export type LadoRecebido =
  | { kind: "animais"; category_id: string; quantity: number; pasture_id?: string | null }
  | { kind: "produtos"; product_id: string; quantity: number }
  | { kind: "maquina"; name: string; type: string; brand?: string | null; model?: string | null; year?: number | null }
  | { kind: "descricao"; texto: string };

export type BarterInput = {
  property_id: string;
  entregue: LadoEntregue | null;
  recebido: LadoRecebido | null;
  diferenca?: { direcao: "paguei" | "recebi"; amount: number } | null;
  contact_id?: string | null;
  contact_name?: string | null;
  occurred_at?: Date | null;
  pago?: boolean;
  due_date?: Date | null;
  parcelas?: { due_date: Date; amount: number }[];
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

export async function createBarter(
  db: TenantPrismaClient,
  input: BarterInput,
): Promise<ActionResult<{ id: string; machine_id: string | null }>>;
```

Também produz, em `negotiations.ts`, o campo aditivo
`NegotiationDetail.recebe_dinheiro: boolean`.

- [ ] **Passo 1: escrever os casos que falham**

Acrescente ao `m49`, dentro do `try`, depois do bloco 1:

```ts
    console.log("\n2. O exemplo §12.8: 15 fêmeas por 10 bezerros e R$ 18.000 recebidos");
    {
      const femeasAntes = soma(await getPositions(db, { owner: "proprio", category_id: "femea_13_24" }));
      const bezerrosAntes = soma(await getPositions(db, { owner: "proprio", category_id: "macho_0_7" }));

      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "femea_13_24", quantity: 15, pasture_id: pasto.id },
        recebido: { kind: "animais", category_id: "macho_0_7", quantity: 10, pasture_id: pasto.id },
        diferenca: { direcao: "recebi", amount: 18000 },
        pago: true,
        contact_name: "Fazenda Vizinha",
      });
      check("a permuta abre", r.ok, r.ok ? "" : r.message);

      check(
        "saíram 15 fêmeas",
        soma(await getPositions(db, { owner: "proprio", category_id: "femea_13_24" })) === femeasAntes - 15,
      );
      check(
        "entraram 10 bezerros",
        soma(await getPositions(db, { owner: "proprio", category_id: "macho_0_7" })) === bezerrosAntes + 10,
      );

      const movs = await db.herdMovement.findMany({
        where: { negotiation_id: r.ok ? r.data.id : "" },
        select: { movement_type: true, quantity: true },
      });
      check("dois movimentos, um de cada lado", movs.length === 2, String(movs.length));
      check(
        "o extrato diz PERMUTA, nunca venda",
        movs.every((m) => m.movement_type === "permuta_saida" || m.movement_type === "permuta_entrada"),
        movs.map((m) => m.movement_type).join(","),
      );

      const lancamentos = await db.financialEntry.findMany({
        where: { negotiation_id: r.ok ? r.data.id : "" },
      });
      check("um lançamento só", lancamentos.length === 1, String(lancamentos.length));
      check("e ele é RECEITA", lancamentos[0]?.entry_type === "income", lancamentos[0]?.entry_type);
      check("de R$ 18.000", Number(lancamentos[0]?.amount) === 18000, String(lancamentos[0]?.amount));

      // A ARMADILHA: `ehVenda()` decide pelo TIPO, e numa permuta a direção do
      // dinheiro depende da diferença. Sem tratar, a linha diria "A pagar"
      // numa permuta em que o produtor RECEBEU.
      const detalhe = await getNegotiation(db, r.ok ? r.data.id : "");
      check("a negociação sabe que o dinheiro ENTROU", detalhe?.recebe_dinheiro === true);
      check(
        "e a tela diz Recebida, nunca 'A pagar'",
        situacaoLabel(detalhe?.situacao ?? "", detalhe?.recebe_dinheiro ?? false) === "Recebida",
        situacaoLabel(detalhe?.situacao ?? "", detalhe?.recebe_dinheiro ?? false),
      );
      check("o valor da negociação é a diferença", Number(detalhe?.amount) === 18000, String(detalhe?.amount));
      check("o contato foi criado", detalhe?.contact_name === "Fazenda Vizinha", detalhe?.contact_name ?? "");
    }

    console.log("\n3. Sem saldo, nada fica pela metade");
    {
      const negociacoesAntes = await db.negotiation.count();
      const contatosAntes = await db.contact.count();
      const bezerrosAntes = soma(await getPositions(db, { owner: "proprio", category_id: "macho_0_7" }));

      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "femea_13_24", quantity: 9999, pasture_id: pasto.id },
        recebido: { kind: "animais", category_id: "macho_0_7", quantity: 10, pasture_id: pasto.id },
        contact_name: "Contato Fantasma",
      });
      check("recusa por saldo", !r.ok && r.code === "INSUFFICIENT_BALANCE", r.ok ? "abriu" : r.code);
      check("apontando a quantidade", !r.ok && r.field === "quantity");
      check("nenhuma negociação órfã", (await db.negotiation.count()) === negociacoesAntes);
      check("nenhum contato órfão", (await db.contact.count()) === contatosAntes);
      check(
        "e os bezerros do outro lado NÃO entraram",
        soma(await getPositions(db, { owner: "proprio", category_id: "macho_0_7" })) === bezerrosAntes,
      );
    }
```

E acrescente os imports no topo do `comBanco`:

```ts
  const { createBarter } = await import("@/lib/actions/barters");
  const { getNegotiation, situacaoLabel } = await import("@/lib/actions/negotiations");
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m49`
Esperado: FALHA com "Cannot find module '@/lib/actions/barters'".

- [ ] **Passo 3: a direção do dinheiro, em `negotiations.ts`**

Acrescente o campo ao tipo `NegotiationDetail`, junto de `situacao`:

```ts
  /**
   * O dinheiro deste negócio ENTRA para o produtor?
   *
   * Aditivo, e existe porque `ehVenda()` decide pelo TIPO e numa PERMUTA a
   * direção depende da diferença, não do tipo: a mesma `permuta` pode ser
   * dinheiro entrando ou saindo. Quem lê a tela deve usar este campo, nunca
   * chamar `ehVenda` por conta própria.
   */
  recebe_dinheiro: boolean;
```

Acrescente a função, logo abaixo de `ehVenda`:

```ts
/**
 * O lado do dinheiro DESTE negócio, e não do tipo dele.
 *
 * Para tudo que não é permuta, é o tipo que manda, como sempre foi. Para a
 * permuta, quem sabe a resposta é o lançamento principal: uma troca em que o
 * produtor pagou a diferença gera despesa, e uma em que ele recebeu gera
 * receita, com o mesmo `NegotiationType`.
 */
function dinheiroEntra(
  tipo: NegotiationType,
  lancamentos: { entry_type: string; negotiation_role: string | null }[],
): boolean {
  if (tipo !== "permuta") return ehVenda(tipo);
  return lancamentos.some(
    (l) => l.negotiation_role === "principal" && l.entry_type === "income",
  );
}
```

Em `getNegotiation`, onde hoje está `ehVenda(n.type)` dentro do
`derivarSituacao`, calcule a direção UMA vez antes e use nos dois lugares:

```ts
  const recebe = dinheiroEntra(n.type, lancamentos);
```

```ts
    situacao: derivarSituacao(
      n.canceled_at,
      lancamentos.filter(
        (l) =>
          l.negotiation_role !== "estorno" &&
          l.entry_type === (recebe ? "income" : "expense"),
      ),
    ),
    recebe_dinheiro: recebe,
```

⚠️ **`listNegotiations` chama `getNegotiation` por id**, então ela herda o campo
sem mudança. Confira lendo a função antes de supor.

- [ ] **Passo 4: escrever a action**

Crie `src/lib/actions/barters.ts`. A estrutura, com os dois lados de animais
(os outros tipos entram nas tarefas 3 e 4):

```ts
import type { TenantPrismaClient } from "@/lib/prisma";
import { scoped } from "@/lib/prisma";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { recordMovementInTx, type HerdPositionKey } from "@/lib/actions/herd-ledger";
import { isValidCategory } from "@/lib/herd/categories";
import { findOrCreateContact } from "@/lib/actions/contacts";
import { AbortarNegociacao, comRollback, validarPagamento } from "@/lib/actions/negotiations";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
```

Validações antes da transação, na ordem: categoria válida e quantidade inteira
maior que zero em cada lado que for `animais`; `diferenca.amount` maior que
zero quando houver; `validarPagamento` quando houver diferença; e a fazenda
existe.

Dentro de `comRollback(() => runSerializableTenantTransaction(db, async (tx) => {`:

1. contato: `if (!contactId && input.contact_name?.trim()) contactId = (await findOrCreateContact(tx, input.contact_name)).id;`
2. `const negociacao = await tx.negotiation.create({ data: scoped({ type: "permuta", occurred_at, property_id, contact_id: contactId, amount: input.diferenca?.amount ?? null, notes: input.notes ?? null, recorded_by_user_id: input.recorded_by_user_id ?? null }) });`
3. lado entregue, quando `kind === "animais"`:

```ts
      const posicao: HerdPositionKey = {
        category_id: lado.category_id,
        property_id: input.property_id,
        pasture_id: lado.pasture_id ?? null,
        situation: "presente",
        owner: "proprio",
      };
      const movimento = await recordMovementInTx(db, tx, {
        movement_type: "permuta_saida",
        quantity: lado.quantity,
        from: posicao,
        to: null,
        // O dinheiro é criado por esta action, com a diferença e as parcelas.
        // Deixar o livro-razão criar também geraria dois lançamentos.
        value: null,
        occurred_at,
        recorded_by_user_id: input.recorded_by_user_id ?? null,
        negotiation_id: negociacao.id,
      });
      if (!movimento.ok) throw new AbortarNegociacao(movimento);
```

4. lado recebido, quando `kind === "animais"`: igual, com
   `movement_type: "permuta_entrada"`, `from: null` e `to: posicao`.
5. a diferença:

```ts
      if (input.diferenca) {
        const recebe = input.diferenca.direcao === "recebi";
        const parcelas =
          input.pago || !input.parcelas || input.parcelas.length === 0
            ? [{ due_date: input.pago ? occurred_at : (input.due_date ?? new Date()), amount: input.diferenca.amount }]
            : input.parcelas;
        for (const parcela of parcelas) {
          await createLinkedEntry(tx, {
            entry_type: recebe ? "income" : "expense",
            category: "Diferença de permuta",
            amount: parcela.amount,
            // `geral` e não `rebanho`: uma permuta pode ser estoque por
            // máquina, sem animal nenhum. É o que `moduloDoEstorno` já
            // devolve para `permuta`, então o estorno cai na mesma gaveta.
            related_module: "geral",
            related_id: negociacao.id,
            occurred_at,
            due_date: parcela.due_date,
            status: input.pago ? "paid" : "pending",
            negotiation_id: negociacao.id,
            negotiation_role: "principal",
          });
        }
      }
```

6. `return ok({ id: negociacao.id, machine_id: null });`

⚠️ **`throw`, nunca `return fail(...)` dentro da transação.** Devolver um valor
de dentro do callback de `$transaction` **confirma** a transação, e a
negociação ficaria gravada apontando para nada. É a seção 6 da spec do Módulo
31, e o `test:m35` tem um caso só para isso.

- [ ] **Passo 5: rodar e ver passar**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m49`
Esperado: PASSA.

- [ ] **Passo 6: conferir as vizinhas**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m35
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m37
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m48
npx tsc --noEmit
```

`m35`, `m37` e `m48` usam `getNegotiation`, que mudou. Se algum quebrar, a
mudança da direção do dinheiro atingiu tipo que não é permuta.

- [ ] **Passo 7: commit**

```bash
git add src/lib/actions/barters.ts src/lib/actions/negotiations.ts scripts/m49-permuta.test.ts
git commit -m "Permuta de gado por gado: o extrato diz permuta, e a direcao do dinheiro sai do lancamento"
```

---

### Task 3: a máquina, nos dois sentidos (§12.7)

**Arquivos:**
- Modificar: `src/lib/actions/barters.ts`
- Modificar: `scripts/m49-permuta.test.ts`

**Interfaces:**
- Consome: `createBarter` da Task 2, e os tipos `LadoEntregue`/`LadoRecebido`.
- Produz: `createBarter` passa a devolver `machine_id` preenchido quando o lado
  recebido é `maquina`.

- [ ] **Passo 1: escrever os casos que falham**

```ts
    console.log("\n4. O exemplo §12.7: 20 bois por 1 trator, pagando R$ 30.000");
    {
      const boisAntes = soma(await getPositions(db, { owner: "proprio", category_id: "macho_36_mais" }));

      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "macho_36_mais", quantity: 20, pasture_id: pasto.id },
        recebido: { kind: "maquina", name: "Trator John Deere 6110", type: "Trator", brand: "John Deere" },
        diferenca: { direcao: "paguei", amount: 30000 },
        pago: true,
        contact_name: "Revenda Agrícola",
      });
      check("a permuta abre", r.ok, r.ok ? "" : r.message);

      check(
        "saíram os 20 bois",
        soma(await getPositions(db, { owner: "proprio", category_id: "macho_36_mais" })) === boisAntes - 20,
      );

      const maquina = await db.machine.findFirst({ where: { id: r.ok ? r.data.machine_id ?? "" : "" } });
      check("o trator foi cadastrado", maquina != null);
      check("apontando para a permuta", maquina?.acquired_negotiation_id === (r.ok ? r.data.id : null));
      check("ativo", maquina?.status === "active", maquina?.status);
      // A máquina veio de gado, não de dinheiro: pôr valor aqui geraria uma
      // despesa de aquisição ALÉM da diferença.
      check("e SEM custo de aquisição", maquina?.acquisition_cost === null, String(maquina?.acquisition_cost));

      const lancamentos = await db.financialEntry.findMany({
        where: { negotiation_id: r.ok ? r.data.id : "" },
      });
      check("UM lançamento, não dois", lancamentos.length === 1, String(lancamentos.length));
      check("e ele é DESPESA", lancamentos[0]?.entry_type === "expense", lancamentos[0]?.entry_type);
      check("de R$ 30.000", Number(lancamentos[0]?.amount) === 30000, String(lancamentos[0]?.amount));

      const detalhe = await getNegotiation(db, r.ok ? r.data.id : "");
      check("o dinheiro SAIU", detalhe?.recebe_dinheiro === false);
      check(
        "e a tela diz Quitada",
        situacaoLabel(detalhe?.situacao ?? "", detalhe?.recebe_dinheiro ?? false) === "Quitada",
        situacaoLabel(detalhe?.situacao ?? "", detalhe?.recebe_dinheiro ?? false),
      );
    }

    console.log("\n5. A máquina que SAI vira 'negociada', não 'vendida'");
    {
      const velha = await db.machine.create({
        data: scoped({ property_id: fazenda.id, name: "Trator velho", type: "Trator" }),
      });

      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "maquina", machine_id: velha.id },
        recebido: { kind: "animais", category_id: "macho_0_7", quantity: 8, pasture_id: pasto.id },
      });
      check("a permuta abre", r.ok, r.ok ? "" : r.message);

      const depois = await db.machine.findFirst({ where: { id: velha.id } });
      check("o status é negociada", depois?.status === "negociada", depois?.status);
      check("apontando para a permuta que a levou", depois?.disposed_negotiation_id === (r.ok ? r.data.id : null));
      check("e o vínculo de entrada continua vazio", depois?.acquired_negotiation_id === null);

      const lancamentos = await db.financialEntry.count({
        where: { negotiation_id: r.ok ? r.data.id : "" },
      });
      check("troca seca não gera lançamento nenhum", lancamentos === 0, String(lancamentos));

      const detalhe = await getNegotiation(db, r.ok ? r.data.id : "");
      check("e a situação é sem_valor", detalhe?.situacao === "sem_valor", detalhe?.situacao);
      // A palavra muda por tipo: "Sem venda" serve para a remessa de leilão
      // ainda aberta, mas numa permuta a troca ACONTECEU, o que não houve foi
      // dinheiro. Ver o passo 2 da Task 8.
      check(
        "e a tela diz 'Troca sem dinheiro'",
        situacaoLabel(detalhe?.situacao ?? "", false, "permuta") === "Troca sem dinheiro",
        situacaoLabel(detalhe?.situacao ?? "", false, "permuta"),
      );
    }

    console.log("\n6. Máquina que já saiu não sai de novo");
    {
      const jaSaiu = await db.machine.findFirst({ where: { name: "Trator velho" } });
      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "maquina", machine_id: jaSaiu?.id ?? "" },
        recebido: { kind: "animais", category_id: "macho_0_7", quantity: 1, pasture_id: pasto.id },
      });
      check(
        "recusa: ela não é mais do produtor",
        !r.ok && r.code === "MAQUINA_INDISPONIVEL",
        r.ok ? "aceitou" : r.code,
      );
    }
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m49`
Esperado: FALHA no bloco 4, porque `createBarter` ignora o lado `maquina`.

- [ ] **Passo 3: implementar os dois sentidos**

No lado RECEBIDO, quando `kind === "maquina"`, dentro da transação:

```ts
      const maquina = await tx.machine.create({
        data: scoped({
          property_id: input.property_id,
          name: lado.name.trim(),
          type: lado.type.trim(),
          brand: lado.brand ?? null,
          model: lado.model ?? null,
          year: lado.year ?? null,
          acquired_at: occurred_at,
          // SEM custo de aquisição: o que o trator custou foi o gado, não
          // dinheiro. `createMachineAction` cria um FinancialEntry sozinha
          // quando recebe custo, e aqui isso seria uma despesa fantasma além
          // da diferença. Por isso esta action grava a Machine direto, e
          // também porque aquela não aceita `tx`.
          acquisition_cost: null,
          acquired_negotiation_id: negociacao.id,
        }),
      });
      machineId = maquina.id;
```

No lado ENTREGUE, quando `kind === "maquina"`:

```ts
      const maquina = await tx.machine.findFirst({ where: { id: lado.machine_id } });
      if (!maquina) {
        throw new AbortarNegociacao({
          ok: false,
          code: "MAQUINA_INDISPONIVEL",
          message: "Máquina não encontrada.",
          status: 422,
        });
      }
      if (maquina.disposed_negotiation_id || maquina.status === "negociada" || maquina.status === "sold") {
        throw new AbortarNegociacao({
          ok: false,
          code: "MAQUINA_INDISPONIVEL",
          message: `${maquina.name} já saiu do seu patrimônio e não pode ser entregue de novo.`,
          status: 422,
        });
      }
      await tx.machine.update({
        where: { id: maquina.id },
        data: { status: "negociada", disposed_negotiation_id: negociacao.id },
      });
```

Declare `let machineId: string | null = null;` antes dos lados e devolva
`ok({ id: negociacao.id, machine_id: machineId })`.

⚠️ **Valide `name` e `type` da máquina recebida ANTES da transação**, com
`fail("VALIDATION_ERROR", "Informe o nome da máquina.", 422, "name")` e o
equivalente para o tipo. É a mesma checagem que `createMachineAction` faz, e
sem ela um nome vazio vira uma linha inútil no cadastro de Máquinas.

- [ ] **Passo 4: rodar e ver passar**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m49
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m27
```

- [ ] **Passo 5: a palavra da troca seca**

O bloco 5 do teste exige `situacaoLabel(..., "permuta") === "Troca sem dinheiro"`.
Hoje a situação `sem_valor` é rotulada "Sem venda", palavra escolhida na frente
3 para a remessa de leilão ainda aberta. Numa permuta ela lê mal: a troca
**aconteceu**, o que não houve foi dinheiro. Em
`src/lib/actions/negotiations.ts`:

```ts
export function situacaoLabel(
  situacao: SituacaoNegociacao | string,
  venda: boolean,
  /** Só `sem_valor` usa: numa permuta a troca aconteceu, o dinheiro é que não. */
  tipo?: NegotiationType,
): string {
  switch (situacao) {
    // ... os outros casos, inalterados
    case "sem_valor":
      return tipo === "permuta" ? "Troca sem dinheiro" : "Sem venda";
```

O parâmetro é o TERCEIRO e **opcional** de propósito: as chamadas que já existem
(`m35`, `m48` e as duas páginas de Negociações) continuam compilando e
devolvendo exatamente o mesmo texto. Rode `npm run test:m48` depois para provar
isso.

- [ ] **Passo 6: o rótulo do status novo**

Em `src/app/(dashboard)/maquinas/page.tsx` e
`src/app/(dashboard)/maquinas/[id]/page.tsx`, na constante `STATUS`:

```ts
  negociada: { label: "Negociada", variant: "gray" },
```

Sem isso a máquina entregue aparece sem badge nenhum nas duas telas, porque o
`Record` não tem a chave.

⚠️ **Confira também `src/app/(dashboard)/dashboard/page.tsx:97`**, que conta
máquinas com `status: { not: "sold" }`. Uma máquina negociada não é mais do
produtor e não deve entrar na contagem: troque por
`status: { notIn: ["sold", "negociada"] }`.

- [ ] **Passo 7: commit**

```bash
git add src/lib/actions/barters.ts src/lib/actions/negotiations.ts scripts/m49-permuta.test.ts "src/app/(dashboard)/maquinas" "src/app/(dashboard)/dashboard/page.tsx"
git commit -m "Permuta com maquina: o trator entra ligado a troca, e o que sai vira negociada"
```

---

### Task 4: estoque, os lados sem área, e a recusa

**Arquivos:**
- Modificar: `src/lib/actions/barters.ts`
- Modificar: `scripts/m49-permuta.test.ts`

**Interfaces:**
- Consome: `recordStockMovementInTx(db, tx, input)` de
  `@/lib/actions/stock-ledger`, com
  `input: { product_id, property_id, movement_type, quantity, occurred_at?, negotiation_id?, recorded_by_user_id? }`.

- [ ] **Passo 1: escrever os casos que falham**

```ts
    console.log("\n7. Produto por animal, e o lado sem área vira texto");
    {
      await ensureProductCategories(db);
      const categorias = await listProductCategories(db);
      const produto = await createProduct(db, {
        name: "Sal mineral",
        category_id: categorias[0].id,
        unit: "saca",
      });
      const produtoId = produto.ok ? produto.data.id : "";
      await recordStockMovement(db, {
        product_id: produtoId,
        property_id: fazenda.id,
        movement_type: "compra",
        quantity: 100,
      });

      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "produtos", product_id: produtoId, quantity: 30 },
        recebido: { kind: "animais", category_id: "macho_0_7", quantity: 5, pasture_id: pasto.id },
      });
      check("a permuta abre", r.ok, r.ok ? "" : r.message);

      const saldo = await getStockBalance(db, { product_id: produtoId, property_id: fazenda.id });
      check("o estoque caiu 30 sacas", (saldo[0]?.quantity ?? 0) === 70, String(saldo[0]?.quantity));

      const movs = await db.stockMovement.findMany({
        where: { negotiation_id: r.ok ? r.data.id : "" },
        select: { movement_type: true },
      });
      check("com o tipo permuta_saida", movs[0]?.movement_type === "permuta_saida", movs[0]?.movement_type);
    }

    console.log("\n8. Bezerro por serviço: o que o Tibé sabe registrar, ele registra");
    {
      const bezerrosAntes = soma(await getPositions(db, { owner: "proprio", category_id: "macho_0_7" }));

      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "macho_0_7", quantity: 1, pasture_id: pasto.id },
        recebido: { kind: "descricao", texto: "Construção de 500m de cerca" },
        contact_name: "Seu Zé da cerca",
      });
      check("a permuta abre", r.ok, r.ok ? "" : r.message);
      check(
        "o bezerro sai do rebanho de verdade",
        soma(await getPositions(db, { owner: "proprio", category_id: "macho_0_7" })) === bezerrosAntes - 1,
      );

      const negociacao = await db.negotiation.findFirst({ where: { id: r.ok ? r.data.id : "" } });
      check(
        "e o outro lado fica como texto",
        negociacao?.barter_in_note === "Construção de 500m de cerca",
        negociacao?.barter_in_note ?? "",
      );
      check("o lado entregue não vira texto", negociacao?.barter_out_note === null);
    }

    console.log("\n9. Permuta que não move nada é recusada");
    {
      const negociacoesAntes = await db.negotiation.count();
      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "descricao", texto: "Uma tarde de trabalho" },
        recebido: { kind: "descricao", texto: "Uma tarde de trabalho" },
      });
      check(
        "sem item e sem dinheiro, não é negócio",
        !r.ok && r.code === "PERMUTA_VAZIA",
        r.ok ? "aceitou" : r.code,
      );
      check("e nada é gravado", (await db.negotiation.count()) === negociacoesAntes);

      // Com dinheiro, os dois lados descritivos passam: o dinheiro é real.
      const comDinheiro = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "descricao", texto: "Uma tarde de trabalho" },
        recebido: { kind: "descricao", texto: "Reparo do curral" },
        diferenca: { direcao: "paguei", amount: 500 },
        pago: true,
      });
      check("com diferença, passa", comDinheiro.ok, comDinheiro.ok ? "" : comDinheiro.message);
    }

    console.log("\n10. As recusas de entrada");
    {
      const semLados = await createBarter(db, {
        property_id: fazenda.id,
        entregue: null,
        recebido: null,
        diferenca: { direcao: "paguei", amount: 100 },
        pago: true,
      });
      check("os dois lados vazios é recusado", !semLados.ok && semLados.code === "PERMUTA_VAZIA", semLados.ok ? "aceitou" : semLados.code);

      const parcelaErrada = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "macho_0_7", quantity: 1, pasture_id: pasto.id },
        recebido: { kind: "descricao", texto: "Uma roçadeira" },
        diferenca: { direcao: "paguei", amount: 1000 },
        parcelas: [
          { due_date: new Date(), amount: 300 },
          { due_date: new Date(), amount: 300 },
        ],
      });
      check(
        "parcela que não fecha com a diferença é recusada",
        !parcelaErrada.ok && parcelaErrada.code === "PARCELAS_NAO_FECHAM",
        parcelaErrada.ok ? "aceitou" : parcelaErrada.code,
      );
    }
```

E os imports, no topo do `comBanco`:

```ts
  const { getStockBalance, recordStockMovement } = await import("@/lib/actions/stock-ledger");
  const { ensureProductCategories, listProductCategories, createProduct } = await import(
    "@/lib/actions/products"
  );
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m49`
Esperado: o bloco 7 falha (o estoque não se mexe), o 8 falha (o texto não é
gravado) e o 9 falha (a permuta vazia é aceita).

- [ ] **Passo 3: implementar os três**

Estoque, no lado entregue:

```ts
      const movimento = await recordStockMovementInTx(db, tx, {
        product_id: lado.product_id,
        property_id: input.property_id,
        movement_type: "permuta_saida",
        quantity: lado.quantity,
        occurred_at,
        negotiation_id: negociacao.id,
        recorded_by_user_id: input.recorded_by_user_id ?? null,
      });
      if (!movimento.ok) throw new AbortarNegociacao(movimento);
```

No lado recebido, o mesmo com `movement_type: "permuta_entrada"`.

Texto: quando `kind === "descricao"`, guarde na coluna do lado
(`barter_out_note` para o entregue, `barter_in_note` para o recebido). Como a
negociação já foi criada, use um `update` no fim da transação, ou monte as duas
colunas ANTES do `create` (preferível: uma escrita a menos):

```ts
    const barter_out_note = input.entregue?.kind === "descricao" ? input.entregue.texto.trim() : null;
    const barter_in_note = input.recebido?.kind === "descricao" ? input.recebido.texto.trim() : null;
```

A recusa, ANTES da transação:

```ts
  // §12: uma permuta em que nada se move e nenhum dinheiro muda de mão é uma
  // anotação, não um negócio. Gravá-la encheria a lista de linhas que não
  // representam nada, e nenhuma área do Tibé teria o que atualizar.
  const move = (lado: LadoEntregue | LadoRecebido | null) =>
    lado != null && lado.kind !== "descricao";
  if (!move(input.entregue) && !move(input.recebido) && !input.diferenca) {
    return fail(
      "PERMUTA_VAZIA",
      "Esta permuta não movimenta nada e não tem diferença em dinheiro. Informe ao menos um item ou o valor da diferença.",
      422,
    );
  }
```

- [ ] **Passo 4: rodar e ver passar**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m49
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m37
```

- [ ] **Passo 5: commit**

```bash
git add src/lib/actions/barters.ts scripts/m49-permuta.test.ts
git commit -m "Permuta com estoque e com o lado que o Tibe nao tem onde guardar"
```

---

### Task 5: cancelar a permuta

**Arquivos:**
- Modificar: `src/lib/actions/negotiations.ts` (`cancelNegotiation`)
- Modificar: `scripts/m49-permuta.test.ts`

**Interfaces:**
- Consome: `cancelNegotiation(db, id, reason, dinheiroPago?, canceledByUserId?)`.

- [ ] **Passo 1: escrever os casos que falham**

```ts
    console.log("\n11. Cancelar desfaz rebanho, estoque, máquina e dinheiro juntos");
    {
      const boisAntes = soma(await getPositions(db, { owner: "proprio", category_id: "macho_36_mais" }));
      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "macho_36_mais", quantity: 10, pasture_id: pasto.id },
        recebido: { kind: "maquina", name: "Colheitadeira", type: "Colheitadeira" },
        diferenca: { direcao: "paguei", amount: 5000 },
        pago: false,
      });
      check("a permuta abre", r.ok, r.ok ? "" : r.message);
      const maquinaId = r.ok ? r.data.machine_id ?? "" : "";

      const c = await cancelNegotiation(db, r.ok ? r.data.id : "", "lançei errado");
      check("cancela", c.ok, c.ok ? "" : c.message);
      check(
        "os 10 bois voltam",
        soma(await getPositions(db, { owner: "proprio", category_id: "macho_36_mais" })) === boisAntes,
      );

      const maquina = await db.machine.findFirst({ where: { id: maquinaId } });
      check("a colheitadeira NÃO é apagada", maquina != null);
      check("vira inativa", maquina?.status === "inactive", maquina?.status);
      check("e continua apontando para a permuta cancelada", maquina?.acquired_negotiation_id != null);

      const conta = await db.financialEntry.findFirst({
        where: { negotiation_id: r.ok ? r.data.id : "" },
      });
      check("a conta em aberto é cancelada", conta?.status === "cancelled", conta?.status);
    }

    console.log("\n12. Máquina com manutenção lançada trava o cancelamento");
    {
      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "macho_36_mais", quantity: 5, pasture_id: pasto.id },
        recebido: { kind: "maquina", name: "Pulverizador", type: "Pulverizador" },
      });
      const maquinaId = r.ok ? r.data.machine_id ?? "" : "";
      await db.machineMaintenance.create({
        data: scoped({
          machine_id: maquinaId,
          performed_at: new Date(),
          description: "Troca de bicos",
        }),
      });

      const c = await cancelNegotiation(db, r.ok ? r.data.id : "", "mudei de ideia");
      check(
        "recusa, porque apagar destruiria a manutenção",
        !c.ok && c.code === "MAQUINA_COM_MANUTENCAO",
        c.ok ? "cancelou" : c.code,
      );

      const maquina = await db.machine.findFirst({ where: { id: maquinaId } });
      check("e a máquina continua ativa", maquina?.status === "active", maquina?.status);
      const negociacao = await db.negotiation.findFirst({ where: { id: r.ok ? r.data.id : "" } });
      check("com a negociação viva", negociacao?.canceled_at === null);
    }

    console.log("\n13. A máquina entregue volta a ser do produtor");
    {
      const velha = await db.machine.create({
        data: scoped({ property_id: fazenda.id, name: "Grade aradora", type: "Implemento" }),
      });
      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "maquina", machine_id: velha.id },
        recebido: { kind: "animais", category_id: "macho_0_7", quantity: 3, pasture_id: pasto.id },
      });
      const c = await cancelNegotiation(db, r.ok ? r.data.id : "", "não foi isso");
      check("cancela", c.ok, c.ok ? "" : c.message);

      const depois = await db.machine.findFirst({ where: { id: velha.id } });
      check("a grade volta a ativa", depois?.status === "active", depois?.status);
      check("e o vínculo de saída é limpo", depois?.disposed_negotiation_id === null);
    }
```

E o import de `cancelNegotiation` na linha que já traz `getNegotiation` e
`situacaoLabel`.

- [ ] **Passo 2: rodar e ver falhar**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m49`
Esperado: os blocos 11, 12 e 13 falham, porque `cancelNegotiation` não conhece
máquina.

- [ ] **Passo 3: as recusas, ANTES de tocar em nada**

Em `cancelNegotiation`, logo depois da guarda de `negociacao.canceled_at` (a
mesma posição em que a missão 3 pôs a guarda da estadia):

```ts
    /**
     * A MÁQUINA (missão 4, a permuta).
     *
     * As duas recusas vêm antes de qualquer escrita. O §17.9 manda alertar
     * "quando parte do item já tiver sido utilizada", e manutenção lançada é
     * exatamente isso: apagar ou inativar a máquina destruiria história que o
     * produtor criou à mão.
     */
    const maquinaQueEntrou = await tx.machine.findFirst({
      where: { acquired_negotiation_id: id },
    });
    if (maquinaQueEntrou) {
      const manutencoes = await tx.machineMaintenance.count({
        where: { machine_id: maquinaQueEntrou.id },
      });
      if (manutencoes > 0) {
        throw new AbortarNegociacao({
          ok: false,
          code: "MAQUINA_COM_MANUTENCAO",
          message:
            `Não dá para cancelar: você já registrou ${manutencoes} manutenção(ões) em ` +
            `${maquinaQueEntrou.name}. Cancele-as antes.`,
          status: 422,
        });
      }
      if (maquinaQueEntrou.disposed_negotiation_id) {
        throw new AbortarNegociacao({
          ok: false,
          code: "MAQUINA_JA_NEGOCIADA",
          message:
            `Não dá para cancelar: ${maquinaQueEntrou.name} já saiu numa outra permuta. ` +
            `Cancele aquela primeiro.`,
          status: 422,
        });
      }
    }
```

- [ ] **Passo 4: desfazer, junto do resto**

No mesmo bloco em que a missão 3 marca a estadia como cancelada (depois do laço
de movimentações, antes do `update` da negociação):

```ts
    // A máquina que ENTROU não é apagada: cancelar nunca apaga, em todo o
    // resto do projeto. Ela fica inativa, e o vínculo permanece para a tela
    // conseguir dizer de onde ela veio.
    if (maquinaQueEntrou) {
      await tx.machine.update({
        where: { id: maquinaQueEntrou.id },
        data: { status: "inactive" },
      });
    }

    // A que SAIU volta a ser do produtor, e o vínculo é limpo: ela pode ser
    // entregue de novo numa permuta futura.
    const maquinaQueSaiu = await tx.machine.findFirst({
      where: { disposed_negotiation_id: id },
    });
    if (maquinaQueSaiu) {
      await tx.machine.update({
        where: { id: maquinaQueSaiu.id },
        data: { status: "active", disposed_negotiation_id: null },
      });
    }
```

- [ ] **Passo 5: rodar e ver passar, e conferir as vizinhas**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m49
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m35
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m37
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m48
```

Os três cobrem `cancelNegotiation` e estão em produção. Se algum quebrar, a
mudança atingiu o cancelamento de gado, de produto ou de remessa.

- [ ] **Passo 6: commit**

```bash
git add src/lib/actions/negotiations.ts scripts/m49-permuta.test.ts
git commit -m "Cancelar permuta: a maquina fica inativa, e manutencao lancada trava"
```

---

### Task 6: a rota

**Arquivos:**
- Criar: `src/app/api/v1/negotiations/barters/route.ts`
- Modificar: `src/lib/validation/negotiation.ts`
- Modificar: `src/app/(public)/docs/api/endpoints.ts`

**Interfaces:**
- Produz: `POST /api/v1/negotiations/barters`, guard
  `guard("rebanho", "write", { profile: "fazenda" })`, resposta `201` com
  `{ data: { id, machine_id }, meta: {} }`.

- [ ] **Passo 1: o schema Zod**

Em `src/lib/validation/negotiation.ts`, no fim:

```ts
/**
 * Missão 4: a permuta (§12).
 *
 * Cada lado é um objeto com `kind`, e os campos que aquele `kind` exige. O
 * discriminador vive no schema para o Zod recusar um lado de animais sem
 * categoria antes de a action ver o corpo.
 */
const ladoEntregueSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("animais"),
    category_id: z.string().min(1, "Informe a categoria dos animais"),
    quantity: z.number().int().positive("A quantidade deve ser maior que zero"),
    pasture_id: z.string().min(1).nullish(),
  }),
  z.object({
    kind: z.literal("produtos"),
    product_id: z.string().min(1, "Informe o produto"),
    quantity: z.number().positive("A quantidade deve ser maior que zero"),
  }),
  z.object({
    kind: z.literal("maquina"),
    machine_id: z.string().min(1, "Informe a máquina entregue"),
  }),
  z.object({
    kind: z.literal("descricao"),
    texto: z.string().trim().min(1, "Descreva o que foi entregue").max(300),
  }),
]);

const ladoRecebidoSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("animais"),
    category_id: z.string().min(1, "Informe a categoria dos animais"),
    quantity: z.number().int().positive("A quantidade deve ser maior que zero"),
    pasture_id: z.string().min(1).nullish(),
  }),
  z.object({
    kind: z.literal("produtos"),
    product_id: z.string().min(1, "Informe o produto"),
    quantity: z.number().positive("A quantidade deve ser maior que zero"),
  }),
  z.object({
    kind: z.literal("maquina"),
    name: z.string().trim().min(1, "Informe o nome da máquina").max(200),
    type: z.string().trim().min(1, "Informe o tipo da máquina").max(100),
    brand: z.string().trim().min(1).max(100).nullish(),
    model: z.string().trim().min(1).max(100).nullish(),
    year: z.number().int().min(1900).max(2200).nullish(),
  }),
  z.object({
    kind: z.literal("descricao"),
    texto: z.string().trim().min(1, "Descreva o que foi recebido").max(300),
  }),
]);

export const barterSchema = z.object({
  property_id: z.string().min(1, "Informe a fazenda"),
  entregue: ladoEntregueSchema.nullish(),
  recebido: ladoRecebidoSchema.nullish(),
  diferenca: z
    .object({
      direcao: z.enum(["paguei", "recebi"]),
      amount: z.number().positive("A diferença deve ser maior que zero"),
    })
    .nullish(),
  contact_id: z.string().min(1).nullish(),
  contact_name: z.string().trim().min(1).max(200).nullish(),
  occurred_at: z.string().datetime({ message: "Data inválida" }).nullish(),
  pago: z.boolean().nullish(),
  due_date: z.string().datetime({ message: "Data de vencimento inválida" }).nullish(),
  parcelas: z.array(parcelaSchema).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

export type BarterBody = z.infer<typeof barterSchema>;
```

- [ ] **Passo 2: a rota**

Crie `src/app/api/v1/negotiations/barters/route.ts`, no padrão fino do projeto:

```ts
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { createBarter } from "@/lib/actions/barters";
import { barterSchema } from "@/lib/validation/negotiation";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/negotiations/barters   registra uma permuta (§12)
 *
 * Rota própria, e não mais um `type` em `POST /api/v1/negotiations`: o corpo é
 * de outra natureza (dois lados de tipos diferentes, e o valor é a DIFERENÇA,
 * não o preço). Aceitá-la na rota geral significaria um schema em que `itens`
 * e `amount` mudam de sentido conforme o tipo.
 */

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = barterSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const d = parsed.data;

  const result = await createBarter(g.db, {
    property_id: d.property_id,
    entregue: d.entregue ?? null,
    recebido: d.recebido ?? null,
    diferenca: d.diferenca ?? null,
    contact_id: d.contact_id ?? null,
    contact_name: d.contact_name ?? null,
    occurred_at: d.occurred_at ? new Date(d.occurred_at) : null,
    pago: d.pago ?? false,
    due_date: d.due_date ? new Date(d.due_date) : null,
    parcelas: (d.parcelas ?? []).map((p) => ({
      due_date: new Date(p.due_date),
      amount: p.amount,
    })),
    notes: d.notes ?? null,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
```

⚠️ **`withApi` é obrigatório.** O `test:m40` varre o repositório e reprova
`export async function POST` cru.

⚠️ **`result.field` no fim** é a fiação da frente 1: sem ele, a recusa de saldo
volta a cair no rodapé do painel em vez de aparecer embaixo do campo.

- [ ] **Passo 3: documentar**

Acrescente a rota em `src/app/(public)/docs/api/endpoints.ts`, no grupo
"Negociações (Módulo 31)", dizendo o que mais importa: **o valor é a
diferença**, o lado sem área vira texto, e as recusas `PERMUTA_VAZIA`,
`MAQUINA_INDISPONIVEL` e `INSUFFICIENT_BALANCE`.

- [ ] **Passo 4: conferir**

```bash
npm run test:docs-api
npm run test:m40
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:isolation
npx tsc --noEmit
```

- [ ] **Passo 5: commit**

```bash
git add src/app/api/v1/negotiations/barters src/lib/validation/negotiation.ts "src/app/(public)/docs/api/endpoints.ts"
git commit -m "A rota da permuta"
```

---

### Task 7: o handler de WhatsApp

O §18.5 dá o diálogo literal: "Troquei 20 bois por um trator e paguei mais 30
mil" e o resumo do assistente. **O classificador do n8n NÃO é tocado** (decisão
do usuário): o handler nasce pronto e espera.

**Arquivos:**
- Criar: `src/lib/actions/barter-pending.ts`
- Criar: `src/lib/actions/whatsapp-handlers/permuta.ts`
- Modificar: `src/lib/whatsapp-intents.ts`
- Modificar: `src/lib/actions/whatsapp-router.ts`
- Modificar: `docs/agents/dividas.md`
- Modificar: `scripts/m49-permuta.test.ts`

- [ ] **Passo 1: o store de pendência**

Copie `src/lib/actions/event-pending.ts` para
`src/lib/actions/barter-pending.ts`, trocando: a chave para
`tibe:permuta-pending:${tenantId}:${userId}`, o tipo `CampoRemessa` por
`CampoPermuta` (`"entregue" | "recebido" | "diferenca" | "confirmacao"`), e os
nomes exportados para `savePendingBarter`, `loadPendingBarter`,
`clearPendingBarter`, `aplicarRespostaPermuta`.

⚠️ **Chave PRÓPRIA, nunca a de outro domínio.** Uma permuta e uma compra de gado
são duas conversas, e dividir a chave faria o "sim" de uma executar a outra.

⚠️ **Esta é a QUINTA cópia deste mecanismo** (`herd-pending`,
`negotiation-pending`, `stock-pending`, `event-pending` e esta). O comentário
de `negotiation-pending.ts` dizia "quando o terceiro domínio precisar disto, aí
sim vale extrair um store genérico". Já passou. **Não extraia agora**: mexer em
quatro módulos validados em produção no meio desta missão é o risco que a
própria nota alertava. Em vez disso, acrescente o item à seção 3 de
`docs/agents/dividas.md`, com este texto:

```markdown
### 3.2 Cinco cópias do store de pendência do WhatsApp

`herd-pending.ts`, `negotiation-pending.ts`, `stock-pending.ts`,
`event-pending.ts` e `barter-pending.ts` são o mesmo mecanismo com prefixo de
chave diferente: uns 90 linhas de Redis repetidas cinco vezes. A nota em
`negotiation-pending.ts` previa extrair no terceiro caso; chegamos ao quinto.

Extrair é seguro (nenhum tem lógica própria além do mapa de atalhos de campo),
mas toca quatro módulos que estão em produção, e por isso não foi feito no meio
da missão 4. Vale uma rodada própria, com as suítes `m24`, `m36`, `m37` e `m48`
rodando antes e depois.
```

- [ ] **Passo 2: escrever os casos que falham**

```ts
    console.log("\n14. Pelo WhatsApp: o resumo do §18.5, e a recusa que cancela");
    {
      await clearPendingBarter(tenant.id, USUARIO);

      const negociacoesAntes = await db.negotiation.count();
      const recusa = await registrarPermuta(
        ctx(db, tenant.id, { entregue: "20 bois", recebido: "um trator", diferenca_paga: 30000 }, {
          explicitNo: true,
          userId: USUARIO,
        }),
      );
      check("a recusa cancela", recusa.action_taken.endsWith(":cancelado"), recusa.action_taken);
      check("e nada é gravado", (await db.negotiation.count()) === negociacoesAntes);

      // A cicatriz de 18/08: um "sim" sem pendente executava o que o
      // classificador remontou.
      const simSolto = await registrarPermuta(
        ctx(db, tenant.id, { entregue: "999 bois", recebido: "um trator" }, {
          confirmed: true,
          userId: USUARIO,
        }),
      );
      check(
        "um sim sem pendente não grava nada",
        simSolto.action_taken === "clarification_requested",
        simSolto.action_taken,
      );
      check("a contagem continua igual", (await db.negotiation.count()) === negociacoesAntes);
    }
```

E os imports:

```ts
  const { registrarPermuta } = await import("@/lib/actions/whatsapp-handlers/permuta");
  const { clearPendingBarter } = await import("@/lib/actions/barter-pending");
```

- [ ] **Passo 3: registrar a intenção**

Em `src/lib/whatsapp-intents.ts`, na lista `INTENTS`:

```ts
  // Modulo 31 (missao 4, §18.5): "troquei 20 bois por um trator e paguei mais
  // 30 mil". O classificador do n8n ainda NAO emite esta intencao: ela fica
  // roteada e testada, esperando a rodada em que o agente for atualizado.
  "registrar_permuta",
```

E em `INTENT_ACCESS`:

```ts
  registrar_permuta: { module: "rebanho", action: "write", profile: "fazenda" },
```

- [ ] **Passo 4: o handler**

Crie `src/lib/actions/whatsapp-handlers/permuta.ts`, exportando
`export const registrarPermuta: Handler`. A estrutura, na ordem exata do handler
de evento (`src/lib/actions/whatsapp-handlers/evento.ts`), que é o modelo mais
recente:

1. **`explicitNo` PRIMEIRO**: limpa o pendente e responde "Tudo bem, não
   registrei nada.", com `action_taken` terminando em `:cancelado`;
2. `confirmed` sem `user_id` ou sem pendente de `gesto: "permuta"` e
   `aguardando: "confirmacao"`: devolve `ask(...)`, **nunca grava**;
3. lê `entregue`, `recebido` e a diferença dos `parameters`, resolve a
   categoria com `resolverCategoria` e a fazenda com `resolverFazenda`
   (ambas de `./herd`), e o valor com `lerDinheiro` de `./parsers`;
4. faltando dado, guarda o pendente e pergunta;
5. **confirmação sempre**, com o resumo literal do §18.5:

```ts
      reply_text:
        `Entendi a seguinte permuta:\n` +
        `Entregou: ${descricaoEntregue}\n` +
        `Recebeu: ${descricaoRecebida}\n` +
        (diferenca ? `Diferença ${diferenca.direcao === "paguei" ? "paga" : "recebida"}: ${reais(diferenca.amount)}\n` : "") +
        `Deseja registrar?`,
```

6. confirmado, chama `createBarter` e limpa o pendente.

⚠️ **A v1 do handler aceita só `animais` e `descricao` nos dois lados.** Máquina
e produto exigem escolher um registro do catálogo, e o handler de estoque já
mostrou que adivinhar produto pela conversa cria três saldos para a mesma
coisa. Quando o lado é máquina ou produto, o handler responde que aquela
permuta se registra pelo painel, com a frase: "Essa permuta envolve máquina ou
produto do estoque, e preciso que você escolha o registro certo. Cadastre pelo
painel, em Negociações." Registre a limitação no cabeçalho do arquivo.

- [ ] **Passo 5: rotear**

Em `src/lib/actions/whatsapp-router.ts`, no import dos handlers e no mapa
`HANDLERS`:

```ts
  registrar_permuta: registrarPermuta,
```

⚠️ **NÃO acrescente a intenção a `REMONTAVEIS` nem à lógica de desempate.**
Mexer ali arrisca sequestrar fluxos que estão em produção, e o classificador
não emite esta intenção ainda.

- [ ] **Passo 6: rodar e conferir**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m49
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m36
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m3
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m24
```

`m3` e `m24` cobrem o roteador.

- [ ] **Passo 7: commit**

```bash
git add src/lib/actions/barter-pending.ts src/lib/actions/whatsapp-handlers/permuta.ts src/lib/whatsapp-intents.ts src/lib/actions/whatsapp-router.ts scripts/m49-permuta.test.ts docs/agents/dividas.md
git commit -m "Permuta pelo WhatsApp: o handler nasce, o classificador espera"
```

---

### Task 8: a tela

**Arquivos:**
- Criar: `src/components/negociacoes/barter-form.tsx`
- Modificar: `src/app/(dashboard)/negociacoes/page.tsx`

- [ ] **Passo 1: o formulário de dois lados**

`FormSheet` mais `Field`, com `id` estável igual ao nome do campo na API e o
estado de erro pelo `useErrosDeFormulario`, exatamente como o `event-form.tsx`
da frente 3.

Estrutura: um seletor "O que saiu da fazenda" e um "O que entrou", cada um com
as cinco opções (`Animais`, `Produtos`, `Máquina`, `Serviço`, `Outro`), e os
campos daquele tipo aparecendo abaixo. `Serviço` e `Outro` mandam o mesmo
`kind: "descricao"`; o que muda é o rótulo do campo de texto.

Depois, "Houve diferença em dinheiro?" com três escolhas (`Não`,
`Eu paguei`, `Eu recebi`), e o valor aparecendo só quando não é `Não`.

⚠️ **A frase da decisão 4**, obrigatória, aparecendo quando o lado escolhido é
`Serviço` ou `Outro`:

```tsx
      <p className="rounded-md bg-superficie-afundada px-3 py-2 text-sm text-texto-secundario">
        Serviço não atualiza nenhuma área do Tibé. O que você entregou sai do
        rebanho ou do estoque normalmente; o serviço fica registrado como
        descrição.
      </p>
```

⚠️ **Máquina que sai é um `Select` das máquinas ativas**, nunca um campo de
texto: o produtor escolhe o registro que já existe. Máquina que entra são os
campos de cadastro (nome, tipo, marca, modelo, ano). A página passa a lista de
máquinas ativas por prop, como já passa `properties` e `contacts`.

- [ ] **Passo 2: a linha na lista**

Em `src/app/(dashboard)/negociacoes/page.tsx`:

- o botão novo, ao lado de "Mandar para leilão ou evento";
- a coluna "O quê" da permuta: hoje ela soma `n.movimentos`, e numa permuta os
  dois lados são movimentos, então o total seria 15 + 10 = 25 numa troca de 15
  por 10. Mostre os dois lados separados:

```tsx
                    {n.type === "permuta" ? (
                      <>
                        <span className="block text-xs">
                          entregou{" "}
                          {n.movimentos
                            .filter((m) => m.movement_type === "permuta_saida")
                            .reduce((s, m) => s + m.quantity, 0) || "-"}
                        </span>
                        <span className="block text-xs">
                          recebeu{" "}
                          {n.movimentos
                            .filter((m) => m.movement_type === "permuta_entrada")
                            .reduce((s, m) => s + m.quantity, 0) || "-"}
                        </span>
                      </>
                    ) : (
                      animais.toLocaleString("pt-BR")
                    )}
```

- a coluna "Valor": use `n.recebe_dinheiro` no lugar de `ehVenda(n.type)`, que é
  onde a armadilha da spec mora. A variável `venda` da página passa a ser
  `const venda = n.recebe_dinheiro;`.

⚠️ **A página passa `n.type` como terceiro argumento** de `situacaoLabel`, que
ganhou o parâmetro na Task 3: `situacaoLabel(n.situacao, venda, n.type)`. Sem
ele, a troca seca aparece como "Sem venda" em vez de "Troca sem dinheiro".

- [ ] **Passo 3: conferir**

```bash
npx tsc --noEmit
npm run lint
npm run check
npm run build
```

O `check` reprova cor crua nova, então use os tokens semânticos.

- [ ] **Passo 4: commit**

```bash
git add src/components/negociacoes/barter-form.tsx "src/app/(dashboard)/negociacoes"
git commit -m "A permuta ganha tela, com os dois lados e o aviso do lado sem area"
```

---

### Task 9: validação ao vivo e fechamento

- [ ] **Passo 1: subir e validar no navegador**

```bash
docker start tibe-pg tibe-redis
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run db:seed
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run dev
```

Abra `http://127.0.0.1:3000/negociacoes` (nunca `localhost`: não resolve nesta
máquina, e o `allowedDevOrigins` existe por causa disso) e confira, anotando os
números de Rebanho, Financeiro e Máquinas antes e depois:

1. **§12.7 ponta a ponta:** 20 bois por 1 trator com R$ 30.000 pagos. O rebanho
   cai 20, o trator aparece em Máquinas como **Ativa**, e existe UMA despesa de
   R$ 30.000, não duas;
2. **§12.8 ponta a ponta:** 15 fêmeas por 10 bezerros com R$ 18.000 recebidos.
   A linha diz **"Recebida"**, nunca "A pagar", e o valor mostra a diferença;
3. o extrato do Rebanho mostra **"Permuta"**, nunca "Venda";
4. troca seca: nenhum lançamento, e a linha diz **"Troca sem dinheiro"**, não
   "Sem venda";
5. bezerro por serviço: o aviso aparece na tela, o bezerro sai do rebanho, e a
   descrição fica na linha;
6. permuta que não move nada: recusada, com a mensagem embaixo do campo;
7. cancelar a permuta do trator: o gado volta, o trator vira **Inativa**, e a
   despesa é cancelada;
8. a máquina entregue aparece em Máquinas como **Negociada** e some da contagem
   do painel inicial.

- [ ] **Passo 2: a rede inteira**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:all
```

Esperado: 52/52 (as 51 de hoje mais a `m49`).

- [ ] **Passo 3: documentos**

Atualize `docs/agents/current-handoff.md` com o estado da frente 4 e o próximo
passo (frente 5, o rollout do sistema de design). Em `docs/agents/dividas.md`, a
seção 2.1 passa a registrar a missão 4 como feita, e o Módulo 31 inteiro como
concluído.

- [ ] **Passo 4: parar**

Migração no Neon, merge e push exigem autorização explícita do usuário, a cada
vez.

---

## Auto-revisão

**Cobertura da spec.** Seção 4 (modelo de dados) está na Task 1; a seção 5 (onde
cada metade é gravada) se reparte entre as Tasks 2, 3 e 4; a seção 6 (abrir) nas
Tasks 2 a 4; a seção 7 (a recusa) na Task 4, bloco 9; a seção 8 (dinheiro e a
armadilha do `ehVenda`) na Task 2, passo 3; a seção 9 (cancelar) na Task 5; a
seção 10 (entrega e provas) nas Tasks 6 a 9. As seis decisões da seção 3 têm
teste: a 1 no bloco 2, a 2 nos blocos 2 e 5, a 3 nos blocos 11 e 12, a 4 no
bloco 8, a 5 no bloco 5, e a 6 é ausência de model, conferida por não existir
tabela nova além das colunas da Task 1.

**Placeholders.** Nenhum "TBD" ou "trate os casos de borda": cada passo tem o
código ou o comando exato.

**Consistência de tipos.** `LadoEntregue` e `LadoRecebido` nascem na Task 2 e
são usados nas Tasks 3, 4, 6 e 8 com os mesmos nomes de campo.
`createBarter` devolve `{ id, machine_id }` desde a Task 2 (com `machine_id`
sempre nulo até a Task 3 preenchê-lo), e a Task 6 e os blocos de teste usam
exatamente esse formato. `recebe_dinheiro` nasce na Task 2 e é consumido na
Task 8.

**Duas armadilhas escritas de propósito**, porque quem executa não tem o
contexto da conversa que as descobriu:

1. **A forma do movimento** (Task 1, passos 6 a 8). Um tipo novo fora das
   listas de `validateShape` cai no ramo de `ajuste`, a action devolve `ok` e o
   movimento fica gravado errado. O teste confere a RECUSA das formas inválidas,
   não só que o caminho feliz passou. É o que faltou na missão 3.
2. **A direção do dinheiro** (Task 2, passo 3). `ehVenda()` decide pelo tipo, e
   numa permuta a direção depende da diferença. O teste registra uma permuta
   RECEBENDO e confere que a tela diz "Recebida".

**Uma decisão que o plano deixa explícita para não ser redescoberta:** a permuta
**não tem custos adicionais**. O §15 é de compra e venda, o §12 não os menciona,
e inventar o campo criaria uma despesa que o produtor não informou.
