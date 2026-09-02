# Fase 0 (Contatos) e fase 33.1 (Mão de obra fixa): plano de implementação

> **Para quem executa:** use `superpowers:executing-plans` (ou
> `superpowers:subagent-driven-development`) para tocar tarefa por tarefa. Os
> passos usam caixa (`- [ ]`) para marcação.

**Objetivo:** entregar a tela de contatos que as quatro fases seguintes
consomem, e o cadastro de trabalhador fixo com previsão de pagamento rolante
alimentando o Financeiro.

**Arquitetura:** `Worker` guarda a pessoa e nada de dinheiro; todo valor é
`FinancialEntry` criado por `createLinkedEntry` com `related_module:
mao_de_obra` e `related_id` do trabalhador. A previsão do próximo pagamento é
uma entrada pendente, e confirmar o pagamento quita a atual e cria a próxima na
mesma transação, sem cron.

**Stack:** Next.js 16 (App Router), Prisma 7, PostgreSQL 17, Zod 4, Redis
(BullMQ), UI kit próprio.

**Spec:** [2026-09-02-mao-de-obra-e-servicos-com-maquinas-design.md](../specs/2026-09-02-mao-de-obra-e-servicos-com-maquinas-design.md)

## Restrições globais

Valem para toda tarefa, sem repetição em cada uma.

- **`tenant_id` nunca vem do client.** Toda query usa `getTenantDb()` ou
  `prismaForTenant()`. Model novo com `tenant_id` entra em
  `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts:27`), e `npm run test:isolation`
  reprova se faltar.
- **Regra de negócio em `src/lib/actions/*`**, nunca no route handler. A rota é
  wrapper fino, e o handler do WhatsApp chama a mesma action.
- **Ordem de entrega: action, depois rota, depois tela.**
- **Nunca use travessão** (U+2014) em código, doc ou mensagem de commit.
- **Nunca escreva conteúdo com escape por heredoc.** Use Edit/Write.
- **Banco local em todo teste**, passado inline, nunca editando o `.env`:
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public"`.
  Use `127.0.0.1`, não `localhost`.
- **Migração antes do push** (invariante 3). Aplique primeiro no Docker local.
  A aplicação no Neon é **do usuário, no terminal**: `db:deploy` contra
  produção é recusado pelo classificador de permissões.
- **`npm run check` tem que sair com 0 falhas** ao fim de cada tarefa que toca
  tela ou doc. As conferências que mordem aqui: 8 (cor crua do Tailwind), 10
  (recusa do servidor tratada), 11 (painel de escrita usa `FormSheet`), 12
  (recusa do Zod em português), 15 (campo do `ORDEM` com `error=`).
- **Commit ao fim de cada tarefa**, na branch de trabalho. Merge e push na
  `main` exigem autorização explícita do usuário, a cada vez.
- **Branch de trabalho:** `mao-de-obra-fase-1`, criada a partir da `main`.

## O guard: um `ModuleKey` próprio

Decidido pelo usuário em 02/09. O PRD §5.2 não define módulo de permissão para
mão de obra, e reusar `financeiro` ou `rebanho` faria **OPERADOR enxergar
salário**, porque as duas matrizes dão escrita a ele.

`mao_de_obra` nasce com matriz própria, espelhando `usuarios`, que é o outro
módulo que guarda dado pessoal:

```ts
  mao_de_obra: { OWNER: W, ADMIN: W, OPERADOR: N, VISUALIZADOR: N },
```

Duas consequências, para ninguém se surpreender depois:

1. **O agente WhatsApp aplica a mesma regra.** `canWrite` recebe a role direta,
   então um OPERADOR que mandar "João é meu vaqueiro e ganha 2.500" recebe
   recusa de permissão, e não um cadastro. É o comportamento certo: o salário
   não deve entrar por um canal onde o autor é só um número de telefone.
2. **A fase 33.2 vai precisar decidir de novo.** A diária de um serviço não tem
   a sensibilidade de um salário, e travar o OPERADOR fora dela impediria quem
   está no curral de registrar o trabalho do dia. Quando o `ServiceJob` chegar,
   ele provavelmente usa outro guard, e essa escolha é da spec daquela fase, não
   desta.

---

# Fase 0: a tela de contatos

## Task 1: as actions que faltam em `contacts.ts`

Hoje o arquivo tem `listContacts`, `createContact` e `findOrCreateContact`, e
mais nada: não dá para editar nem arquivar um contato, embora a coluna
`archived_at` exista desde o Módulo 31.

E `CONTACT_TYPES` lista **10** tipos enquanto o enum `ContactType` tem **13**:
`laticinio`, `queijaria` e `mercado` foram acrescentados pelo §24 do Módulo 32 e
nunca entraram na constante. Como a rota valida com `z.enum(CONTACT_TYPES)`, um
contato de laticínio é recusado pela API e o filtro `?type=laticinio` é ignorado
em silêncio. `as const satisfies readonly ContactType[]` não pega isso, porque
só confere que cada valor listado é válido, não que a lista é completa.

**Arquivos:**
- Modificar: `src/lib/actions/contacts.ts`
- Criar: `scripts/m55-contatos.test.ts`
- Modificar: `package.json` (script `test:m55`)

**Interfaces:**
- Consome: `TenantPrismaClient`, `scoped`, `ok`, `fail`, `ActionResult`.
- Produz:
  - `CONTACT_TYPES` passa a ter 13 valores e a ser exaustiva por tipo.
  - `updateContact(db: TenantPrismaClient, id: string, input: ContactInput): Promise<ActionResult<ContactView>>`
  - `setContactArchived(db: TenantPrismaClient, id: string, arquivado: boolean): Promise<ActionResult<ContactView>>`
  - `getContactDetail(db: TenantPrismaClient, id: string): Promise<ActionResult<ContactDetailView>>`
  - `ContactDetailView = ContactView & { archived: boolean; negotiations: { id: string; type: string; occurred_at: string; amount: number | null }[] }`

- [ ] **Passo 1: escrever a suíte que falha**

Criar `scripts/m55-contatos.test.ts`:

```ts
import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Fase 0 dos Módulos 33 e 34: a tela de contatos.
 *
 * Prova:
 *   1. CONTACT_TYPES cobre o enum inteiro (os 3 tipos do Módulo 32 §24 estavam
 *      fora, e a rota recusava contato de laticínio).
 *   2. Edição altera, e devolve o contato novo.
 *   3. Editar com nome vazio é recusado no campo `name`.
 *   4. Editar contato que não existe devolve 404, não explode.
 *   5. Arquivar tira da listagem, e desarquivar devolve.
 *   6. Contato arquivado não é achado por `findOrCreateContact`: ele CRIA um
 *      novo, que é o comportamento correto (o arquivado saiu de circulação).
 *   7. O detalhe traz as negociações do contato.
 *
 * Roda: `npm run test:m55`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("📇 M55: contatos (fase 0 dos Módulos 33 e 34)\n");

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { ContactType } = await import("@/generated/prisma/enums");
  const {
    CONTACT_TYPES,
    listContacts,
    createContact,
    updateContact,
    setContactArchived,
    getContactDetail,
    findOrCreateContact,
  } = await import("@/lib/actions/contacts");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M55 ${stamp}`, document: `M55${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    console.log("1. CONTACT_TYPES cobre o enum inteiro (§24 do Módulo 32)");
    const doEnum = Object.values(ContactType) as string[];
    const faltando = doEnum.filter((t) => !(CONTACT_TYPES as readonly string[]).includes(t));
    check(
      "nenhum tipo do enum fora de CONTACT_TYPES",
      faltando.length === 0,
      `faltam: ${faltando.join(", ")}`,
    );

    console.log("\n2. Edição");
    const criado = await createContact(db, { name: "Pedro Cercador", type: "prestador_servico" });
    if (!criado.ok) throw new Error("createContact falhou");
    const editado = await updateContact(db, criado.data.id, {
      name: "Pedro Cercador e Filhos",
      type: "prestador_servico",
      phone: "62999990000",
      city: "Rio Verde",
      notes: null,
    });
    check("edição devolve ok", editado.ok);
    check(
      "nome novo persistiu",
      editado.ok && editado.data.name === "Pedro Cercador e Filhos",
      editado.ok ? editado.data.name : "recusado",
    );
    check("telefone persistiu", editado.ok && editado.data.phone === "62999990000");

    console.log("\n3. Recusa por campo");
    const semNome = await updateContact(db, criado.data.id, { name: "   " });
    check("nome vazio é recusado", !semNome.ok);
    check(
      "a recusa aponta o campo name",
      !semNome.ok && semNome.field === "name",
      !semNome.ok ? String(semNome.field) : "aceitou",
    );

    console.log("\n4. Contato inexistente");
    const fantasma = await updateContact(db, "clnaoexiste000000000000", { name: "X" });
    check("editar inexistente devolve recusa", !fantasma.ok);
    check("com status 404", !fantasma.ok && fantasma.status === 404);

    console.log("\n5. Arquivar e desarquivar");
    const arquivado = await setContactArchived(db, criado.data.id, true);
    check("arquivar devolve ok", arquivado.ok);
    const listaSem = await listContacts(db);
    check(
      "arquivado sai da listagem",
      !listaSem.some((c) => c.id === criado.data.id),
      `lista tem ${listaSem.length}`,
    );
    await setContactArchived(db, criado.data.id, false);
    const listaCom = await listContacts(db);
    check("desarquivado volta à listagem", listaCom.some((c) => c.id === criado.data.id));

    console.log("\n6. Arquivado não é reaproveitado pela conversa");
    await setContactArchived(db, criado.data.id, true);
    const achado = await findOrCreateContact(db, "Pedro Cercador e Filhos");
    check("findOrCreateContact cria um novo", achado.criado === true);
    check("e não devolve o arquivado", achado.id !== criado.data.id);

    console.log("\n7. Detalhe com histórico");
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M55" }) });
    const joao = await createContact(db, { name: "João Comprador" });
    if (!joao.ok) throw new Error("createContact falhou");
    await db.negotiation.create({
      data: scoped({
        type: "venda_gado",
        occurred_at: new Date("2026-08-01"),
        property_id: fazenda.id,
        contact_id: joao.data.id,
        amount: 15000,
      }),
    });
    const detalhe = await getContactDetail(db, joao.data.id);
    check("detalhe devolve ok", detalhe.ok);
    check(
      "com a negociação do contato",
      detalhe.ok && detalhe.data.negotiations.length === 1,
      detalhe.ok ? String(detalhe.data.negotiations.length) : "recusado",
    );
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

comBanco().then(() => {
  console.log(falhas === 0 ? "\n✅ M55 verde" : `\n❌ M55: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
```

- [ ] **Passo 2: acrescentar o script ao `package.json`**

Depois da linha `"test:m54"`:

```json
"test:m55": "tsx scripts/m55-contatos.test.ts",
```

- [ ] **Passo 3: rodar e ver falhar**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m55
```

Esperado: erro de importação, porque `updateContact`, `setContactArchived` e
`getContactDetail` não existem.

- [ ] **Passo 4: implementar em `src/lib/actions/contacts.ts`**

Trocar a constante por uma que o compilador obriga a ser exaustiva:

```ts
/**
 * Os tipos oferecidos na API e na tela.
 *
 * ⚠️ Precisa cobrir o enum INTEIRO. Até 02/09 esta lista tinha 10 dos 13
 * valores: `laticinio`, `queijaria` e `mercado` entraram no schema pelo §24 do
 * Módulo 32 e nunca chegaram aqui, então `POST /api/v1/contacts` recusava um
 * laticínio e `GET ?type=laticinio` ignorava o filtro em silêncio.
 *
 * `satisfies readonly ContactType[]` NÃO pega isso: ele confere que cada valor
 * listado é válido, nunca que a lista é completa. O `Record` abaixo pega, porque
 * um valor novo no enum quebra a compilação até ser listado aqui.
 */
const TIPOS_COMPLETOS: Record<ContactType, true> = {
  particular: true,
  fazendeiro: true,
  comerciante_gado: true,
  frigorifico: true,
  leilao: true,
  feira_evento: true,
  cooperativa: true,
  loja_fornecedor: true,
  prestador_servico: true,
  laticinio: true,
  queijaria: true,
  mercado: true,
  outro: true,
};

export const CONTACT_TYPES = Object.keys(TIPOS_COMPLETOS) as readonly ContactType[];
```

Acrescentar as três actions:

```ts
export type ContactDetailView = ContactView & {
  archived: boolean;
  negotiations: { id: string; type: string; occurred_at: string; amount: number | null }[];
};

/**
 * Edita um contato. Só os campos do §5: nada de documento, endereço nem dado
 * bancário, que o Módulo 31 já decidiu ficar fora.
 */
export async function updateContact(
  db: TenantPrismaClient,
  id: string,
  input: ContactInput,
): Promise<ActionResult<ContactView>> {
  const nome = (input.name ?? "").trim();
  if (!nome) return fail("VALIDATION_ERROR", "Informe o nome do contato.", 422, "name");

  const atual = await db.contact.findUnique({ where: { id } });
  if (!atual) return fail("NOT_FOUND", "Contato não encontrado.", 404);

  const contato = await db.contact.update({
    where: { id },
    data: {
      name: nome,
      type: input.type ?? null,
      phone: input.phone ?? null,
      city: input.city ?? null,
      notes: input.notes ?? null,
    },
  });
  return ok(serializar(contato));
}

/**
 * Arquiva ou desarquiva. Desativar, nunca apagar: um contato apagado levaria
 * junto o nome de quem está em negociação antiga, e `Negotiation.contact_id` é
 * `onDelete: SetNull`, então o histórico ficaria anônimo em silêncio.
 */
export async function setContactArchived(
  db: TenantPrismaClient,
  id: string,
  arquivado: boolean,
): Promise<ActionResult<ContactView>> {
  const atual = await db.contact.findUnique({ where: { id } });
  if (!atual) return fail("NOT_FOUND", "Contato não encontrado.", 404);

  const contato = await db.contact.update({
    where: { id },
    data: { archived_at: arquivado ? new Date() : null },
  });
  return ok(serializar(contato));
}

/** O contato mais o histórico do §37: por ora, as negociações dele. */
export async function getContactDetail(
  db: TenantPrismaClient,
  id: string,
): Promise<ActionResult<ContactDetailView>> {
  const contato = await db.contact.findUnique({
    where: { id },
    include: {
      negotiations: {
        where: { canceled_at: null },
        orderBy: { occurred_at: "desc" },
        take: 50,
        select: { id: true, type: true, occurred_at: true, amount: true },
      },
    },
  });
  if (!contato) return fail("NOT_FOUND", "Contato não encontrado.", 404);

  return ok({
    ...serializar(contato),
    archived: contato.archived_at !== null,
    negotiations: contato.negotiations.map((n) => ({
      id: n.id,
      type: n.type,
      occurred_at: n.occurred_at.toISOString(),
      amount: n.amount === null ? null : Number(n.amount),
    })),
  });
}
```

Ajustar os imports do topo: acrescentar `fail` ao import de `@/lib/actions/types`.

- [ ] **Passo 5: rodar e ver passar**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m55
```

Esperado: `✅ M55 verde`, com o item 1 confirmando que nenhum tipo ficou fora.

- [ ] **Passo 6: provar que a trava do item 1 falha de verdade**

Comente um dos treze tipos no `Record`. `npx tsc --noEmit` tem que acusar. Isso
é o invariante 8 aplicado: trava só vale depois de você a ver falhar.
Descomente.

- [ ] **Passo 7: commit**

```
git add src/lib/actions/contacts.ts scripts/m55-contatos.test.ts package.json
git commit -m "Contatos: editar, arquivar, e os tres tipos que a API recusava"
```

## Task 2: as rotas de contato

**Arquivos:**
- Criar: `src/app/api/v1/contacts/[id]/route.ts`
- Modificar: `scripts/m55-contatos.test.ts` (bloco 8)
- Modificar: `src/app/(public)/docs/api/endpoints.ts`

**Interfaces:**
- Consome: `updateContact`, `setContactArchived`, `getContactDetail` da Task 1.
- Produz: `GET`, `PATCH` e `DELETE` em `/api/v1/contacts/[id]`. O `DELETE`
  arquiva, não apaga.

- [ ] **Passo 1: escrever o bloco 8 da suíte, que falha**

Acrescentar antes do `finally`:

```ts
    console.log("\n8. A recusa do Zod sai em português (conferência 12)");
    const { PATCH } = await import("@/app/api/v1/contacts/[id]/route");
    check("a rota PATCH existe", typeof PATCH === "function");
```

- [ ] **Passo 2: rodar e ver falhar**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m55
```

Esperado: `Cannot find module '@/app/api/v1/contacts/[id]/route'`.

- [ ] **Passo 3: criar a rota**

`src/app/api/v1/contacts/[id]/route.ts`:

```ts
import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  updateContact,
  setContactArchived,
  getContactDetail,
  CONTACT_TYPES,
} from "@/lib/actions/contacts";
import { withApi } from "@/lib/route";

/**
 * GET    /api/v1/contacts/:id   contato + histórico de negociações
 * PATCH  /api/v1/contacts/:id   edição (§5 do Módulo 31: só os campos simples)
 * DELETE /api/v1/contacts/:id   ARQUIVA, não apaga
 *
 * Wrapper fino: a regra vive em `src/lib/actions/contacts.ts`.
 *
 * Reusa o guard de "rebanho" pela mesma razão registrada em
 * `src/app/api/v1/contacts/route.ts`: o PRD §5.2 não define módulo para
 * Negociações, e as matrizes de `rebanho` e `financeiro` são idênticas hoje.
 */

const patchSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do contato"),
  type: z.enum(CONTACT_TYPES as readonly [string, ...string[]]).nullish(),
  phone: z.string().trim().max(40).nullish(),
  city: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

type Ctx = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, ctx: Ctx) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const { id } = await ctx.params;
  const res = await getContactDetail(g.db, id);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

async function PATCHHandler(request: Request, ctx: Ctx) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const { id } = await ctx.params;
  const res = await updateContact(g.db, id, parsed.data as never);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

async function DELETEHandler(_request: Request, ctx: Ctx) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const { id } = await ctx.params;
  const res = await setContactArchived(g.db, id, true);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
export const DELETE = withApi(DELETEHandler);
```

⚠️ Confira a assinatura real de `apiError`, `apiErroDeZod` e `readJson` em
`src/lib/api.ts` e `src/lib/api-guard.ts` antes de colar: se a ordem dos
argumentos divergir, ajuste aqui, não lá. E confira em uma rota `[id]` já
existente (`src/app/api/v1/machines/[id]/route.ts`) se este projeto usa `params`
como `Promise` ou não, porque isso muda entre versões do Next.

- [ ] **Passo 4: rodar a suíte e a conferência**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m55
npm run check
npm run test:docs-api
```

Esperado: M55 verde; `check` com 0 falhas; `test:docs-api` **falhando**, porque
a rota nova não está em `endpoints.ts`.

- [ ] **Passo 5: registrar em `/docs/api`**

Acrescentar as três rotas a `src/app/(public)/docs/api/endpoints.ts`, seguindo
a entrada de `/api/v1/contacts` que já está lá.

- [ ] **Passo 6: rodar `npm run test:docs-api`**

Esperado: verde.

- [ ] **Passo 7: commit**

```
git add src/app/api/v1/contacts scripts/m55-contatos.test.ts "src/app/(public)/docs/api/endpoints.ts"
git commit -m "Contatos: as rotas de detalhe, edicao e arquivamento"
```

## Task 3: a tela de contatos

Fecha a linha "tela de contatos" da `dividas.md` §2.3.

**Arquivos:**
- Criar: `src/app/(dashboard)/contatos/page.tsx`
- Criar: `src/app/(dashboard)/contatos/[id]/page.tsx`
- Criar: `src/components/contatos/contact-form.tsx`
- Criar: `src/components/contatos/contact-labels.ts`
- Modificar: `src/lib/nav.ts`

**Interfaces:**
- Consome: `listContacts`, `getContactDetail`, `CONTACT_TYPES`.
- Produz: `CONTACT_TYPE_LABELS: Record<ContactType, string>` em
  `contact-labels.ts`, usado pela lista e pelo formulário.

- [ ] **Passo 1: os rótulos em português**

`src/components/contatos/contact-labels.ts`:

```ts
import type { ContactType } from "@/generated/prisma/client";

/**
 * O rótulo de cada tipo. `Record` completo de propósito: tipo novo no enum
 * quebra a compilação até ganhar rótulo, que é a mesma trava de
 * `TIPOS_COMPLETOS` em `contacts.ts`.
 */
export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  particular: "Particular",
  fazendeiro: "Fazendeiro",
  comerciante_gado: "Comerciante de gado",
  frigorifico: "Frigorífico",
  leilao: "Leilão",
  feira_evento: "Feira ou evento",
  cooperativa: "Cooperativa",
  loja_fornecedor: "Loja ou fornecedor",
  prestador_servico: "Prestador de serviço",
  laticinio: "Laticínio",
  queijaria: "Queijaria",
  mercado: "Mercado",
  outro: "Outro",
};
```

- [ ] **Passo 2: o painel de escrita**

`src/components/contatos/contact-form.tsx`, copiando a estrutura de
`src/components/confinamento/site-form.tsx`. O que **não pode faltar**, porque
são as conferências 10, 11 e 15 do `npm run check`:

- `FormSheet` como envelope (conferência 11);
- `const ORDEM = ["name", "type", "phone", "city", "notes"] as const;`
- `const err = useErrosDeFormulario(ORDEM);`
- **todo** campo do `ORDEM` com `error={err.erros.<campo>}` no `<Field>`
  (conferência 15: campo listado sem `error=` engole a mensagem inteira, porque
  `aplicarErroDoServidor` só usa o rodapé quando o campo NÃO está no `ORDEM`);
- `if (!res.ok) { err.doServidor(res); return; }` (conferência 10);
- `error={err.global}`, `focarCampoId={err.focarCampoId}`, `tentativa={err.tentativa}`
  no `FormSheet`;
- `err.limparCampo("<campo>")` no `onChange` de cada controle.

O componente serve para criar e para editar: receba `contact?: ContactView` e,
quando vier preenchido, mande `apiPatch` para `/api/v1/contacts/${contact.id}`
em vez de `apiPost` para `/api/v1/contacts`.

- [ ] **Passo 3: a listagem**

`src/app/(dashboard)/contatos/page.tsx`: server component que chama
`listContacts`, com busca por nome e filtro por tipo, tabela com nome, tipo
(pelo `CONTACT_TYPE_LABELS`), telefone e município, e o botão do painel de
criação.

⚠️ **Nenhuma cor crua do Tailwind** (conferência 8): use os tokens semânticos
do `globals.css`, nada de `text-gray-500`, `bg-gray-50` nem `divide-gray-200`.
A catraca só encolhe, e arquivo novo com cor crua reprova.

⚠️ **Não use `bg-tibe-light`**: o alias depreciado aponta para
`--superficie-afundada`, que é o próprio fundo do painel, e a pílula fica
invisível sobrando só o texto. Está na `dividas.md` §2.5.

- [ ] **Passo 4: o detalhe**

`src/app/(dashboard)/contatos/[id]/page.tsx`: dados do contato, botão de editar
(o mesmo `contact-form`), botão de arquivar, e a lista de negociações vinda de
`getContactDetail`.

- [ ] **Passo 5: o item de menu**

Em `src/lib/nav.ts`, dentro do grupo `"Operação"`, depois de `Negociações`:

```ts
        // Fase 0 dos Módulos 33 e 34: a agenda de pessoas. Fica depois de
        // Negociações porque é de lá que a maior parte dos contatos nasce
        // (`findOrCreateContact`, a partir do nome dito na conversa), e é a
        // primeira tela que dá para editar e arquivar o que aquele caminho
        // criou.
        { href: "/contatos", label: "Contatos", show: hasFazenda },
```

⚠️ **Item dentro de grupo nasce invisível se o grupo estiver fechado.** Foi o
que aconteceu com o Confinamento no dia do deploy. Confira no navegador que ele
aparece, não só que o arquivo compila.

- [ ] **Passo 6: rodar tudo**

```
npm run check
npx tsc --noEmit
npm run lint
```

Esperado: `check` com 0 falhas, `tsc` com 0, lint limpo.

- [ ] **Passo 7: validar no navegador (invariante 8)**

```
npx tsx scripts/_sessao-local.ts
npm run dev
```

Ponha o cookie em `document.cookie`, abra `/contatos`, e confirme, **olhando**:
o item no menu, criar um contato, editar, arquivar (some da lista), abrir o
detalhe, e mandar o formulário com nome vazio para ver a mensagem **embaixo do
campo**, não no rodapé.

⚠️ Confirme que o navegador que respondeu é o **desta máquina**: o
`claude-in-chrome` conecta por conta e pode dirigir o Chrome de outra, e aba em
segundo plano zera os rects e finge defeito de interface.

- [ ] **Passo 8: commit**

```
git add "src/app/(dashboard)/contatos" src/components/contatos src/lib/nav.ts
git commit -m "Contatos: a tela que as quatro fases seguintes consomem"
```

---

# Fase 33.1: mão de obra fixa

## Task 4: extrair o store de pendência genérico

Paga a `dividas.md` §3.2 antes de ela virar oito cópias. Os seis arquivos
(`herd`, `negotiation`, `stock`, `event`, `barter`, `leite`, `confinamento`)
somam 1.307 linhas do mesmo mecanismo de Redis com prefixo diferente.

⚠️ **`stock-pending.ts` tem 479 linhas e NÃO é só o store**: ele carrega regra
de domínio própria. Extraia dele apenas as quatro funções de Redis, deixando o
resto onde está. Os outros seis são conversão direta.

**Arquivos:**
- Criar: `src/lib/actions/pending-store.ts`
- Modificar: `src/lib/actions/herd-pending.ts`, `negotiation-pending.ts`,
  `stock-pending.ts`, `event-pending.ts`, `barter-pending.ts`,
  `leite-pending.ts`, `confinamento-pending.ts`
- Criar: `scripts/m56-pending-store.test.ts`
- Modificar: `package.json`

**Interfaces:**
- Produz:
  ```ts
  export type PedidoPendente<C extends string> = {
    parameters: Record<string, unknown>;
    aguardando: C;
    tentativas?: number;
    salvo_em?: number;
  };
  export const MAX_TENTATIVAS = 3;
  export function criarStoreDePendencia<C extends string>(config: {
    prefixo: string;
    ttlSegundos?: number;
    atalho?: (campo: C) => string;
  }): {
    salvar(tenantId: string, userId: string, pedido: PedidoPendente<C>): Promise<void>;
    carregar(tenantId: string, userId: string): Promise<PedidoPendente<C> | null>;
    limpar(tenantId: string, userId: string): Promise<void>;
    aplicarResposta(
      pendente: PedidoPendente<C>,
      novos: Record<string, unknown>,
    ): Record<string, unknown> | null;
  };
  ```

- [ ] **Passo 1: rodar as seis suítes ANTES, e anotar o resultado**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m24
```

Repita para `m36`, `m37`, `m48`, `m49` e `m51`. **Anote quais estavam verdes.**
Uma que já estivesse vermelha antes não é regressão desta tarefa, e sem a
anotação você não vai saber.

Se o Redis local não existir nesta máquina, crie uma vez:

```
docker run -d --name tibe-redis -p 56379:6379 redis:7-alpine
```

- [ ] **Passo 2: escrever a suíte do store genérico**

`scripts/m56-pending-store.test.ts`, provando: salva e carrega; TTL aplicado;
`limpar` apaga; `aplicarResposta` só aceita o campo perguntado; `aplicarResposta`
devolve `null` quando a mensagem nova não traz o campo; o atalho de nome
alternativo funciona; e Redis fora do ar não derruba (mock que lança).

- [ ] **Passo 3: rodar e ver falhar**

Esperado: `Cannot find module '@/lib/actions/pending-store'`.

- [ ] **Passo 4: escrever `pending-store.ts`**

Copie o corpo de `herd-pending.ts` (é o mais completo), trocando `chave()` por
`` `tibe:${config.prefixo}:${tenantId}:${userId}` `` e `atalho()` pelo do
`config`. Mantenha os `try/catch` vazios com o comentário: Redis fora do ar não
pode derrubar o registro.

- [ ] **Passo 5: rodar e ver passar**

- [ ] **Passo 6: converter os sete arquivos, UM POR VEZ**

Cada um vira um arquivo curto que só declara o tipo do campo, o atalho e chama
`criarStoreDePendencia`, reexportando os nomes antigos
(`savePendingHerd`, `loadPendingHerd`, `clearPendingHerd`, `aplicarResposta`)
para nenhum chamador mudar. Exemplo do `herd`:

```ts
import { criarStoreDePendencia, type PedidoPendente } from "@/lib/actions/pending-store";

export type CampoPendente = /* a mesma união de antes */;
export type { PedidoPendente };
export { MAX_TENTATIVAS } from "@/lib/actions/pending-store";

const store = criarStoreDePendencia<CampoPendente>({
  prefixo: "herd-pending",
  atalho: (campo) => {
    if (campo === "categoria") return "category";
    if (campo === "categoria_destino") return "categoria";
    if (campo === "fazenda") return "property";
    if (campo === "pasto") return "pasto_origem";
    if (campo === "movement_type") return "tipo";
    return campo;
  },
});

export const savePendingHerd = store.salvar;
export const loadPendingHerd = store.carregar;
export const clearPendingHerd = store.limpar;
export const aplicarResposta = store.aplicarResposta;
```

⚠️ **Preserve os comentários longos de cada arquivo.** Eles registram os
defeitos reais que criaram cada regra (o "sim" que gravou 18 animais, o tipo de
movimentação herdado de uma conversa de uma hora antes). Perder isso é perder a
razão de a regra existir, e a próxima sessão vai "simplificar" de volta.

⚠️ **O prefixo de chave tem que ser idêntico ao de antes**, senão o pendente de
uma conversa em andamento em produção some. Confira cada um contra o
`chave()` original.

- [ ] **Passo 7: rodar as seis suítes DEPOIS**

As mesmas do passo 1, mesmo comando. Compare com a anotação. **Qualquer uma que
mudou de verde para vermelha é regressão desta tarefa e para o trabalho.**

- [ ] **Passo 8: `tsc`, lint e check**

```
npx tsc --noEmit && npm run lint && npm run check
```

- [ ] **Passo 9: commit**

```
git add src/lib/actions/*-pending.ts src/lib/actions/pending-store.ts scripts/m56-pending-store.test.ts package.json
git commit -m "Pendencia do WhatsApp: as sete copias viram um store so"
```

## Task 5: o schema do trabalhador

**Arquivos:**
- Modificar: `prisma/schema.prisma`
- Criar: `prisma/migrations/20260903100000_mao_de_obra_fase_1/migration.sql`
- Modificar: `src/lib/prisma.ts` (`TENANT_SCOPED_MODELS`)

**Interfaces:**
- Produz: model `Worker`; enums `WorkerType`, `PayFrequency`, `WorkerStatus`,
  `WorkerEntryKind`; `RelatedModule.mao_de_obra`;
  `FinancialEntry.worker_entry_kind`.

- [ ] **Passo 1: escrever o schema**

```prisma
enum WorkerType {
  /// Relação contínua com a fazenda (§3.1): vaqueiro, tratorista, caseiro.
  fixo
  /// Trabalha por períodos curtos ou diárias (§3.2). Cadastrado aqui quando é
  /// alguém que volta; o diarista de uma vez só nem precisa de cadastro, e vira
  /// `worker_count` no `ServiceJob` da fase 33.2.
  eventual
}

enum PayFrequency {
  mensal
  quinzenal
  semanal
  diaria
  outra
}

enum WorkerStatus {
  ativo
  inativo
}

/// Distingue os tipos de pagamento do §9, §10 e §11 (adiantamento, gratificação,
/// benefício) do pagamento normal. Existe pelo mesmo motivo que
/// `negotiation_role` existe: `category` é texto livre que o produtor renomeia
/// no painel, e o §9 pede o adiantamento mostrado SEPARADO do pagamento.
enum WorkerEntryKind {
  pagamento
  adiantamento
  gratificacao
  beneficio
  outro
}

/// Quem trabalha na fazenda (Módulo 33, §5 e §36).
///
/// NÃO é folha de pagamento: o §35 e o §41 do documento do cliente excluem
/// eSocial, FGTS, INSS, férias, 13º, rescisão e ponto, e essa exclusão é
/// deliberada, não escopo adiado.
///
/// NENHUM valor pago ou devido mora aqui (invariante 2). `pay_amount` é o valor
/// COMBINADO, que é dado de entrada, não soma: é a mesma razão pela qual
/// `Negotiation.amount` é gravado. O que foi pago é `FinancialEntry` com
/// `related_module: mao_de_obra` e `related_id` deste registro.
model Worker {
  id          String       @id @default(cuid())
  tenant_id   String
  property_id String?
  name        String
  /// Texto livre, com as dez sugestões do §6 oferecidas na tela. Não é enum
  /// porque o §6 termina em "Outro" e o documento não pede lista fechada.
  role        String
  type        WorkerType
  status      WorkerStatus @default(ativo)

  pay_frequency PayFrequency?
  pay_amount    Decimal?      @db.Decimal(14, 2)
  /// Dia habitual de pagamento (§5). 1 a 31; a previsão cai no último dia do
  /// mês quando o mês não tem o dia escolhido.
  pay_day       Int?

  phone      String?
  started_at DateTime?
  notes      String?

  archived_at         DateTime?
  recorded_by_user_id String?
  created_at          DateTime  @default(now())
  updated_at          DateTime  @updatedAt

  tenant      Tenant    @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  property    Property? @relation(fields: [property_id], references: [id], onDelete: Restrict)
  recorded_by User?     @relation("WorkerRecordedBy", fields: [recorded_by_user_id], references: [id], onDelete: SetNull)

  @@index([tenant_id])
  @@index([tenant_id, status])
  @@index([property_id])
}
```

Acrescentar `mao_de_obra` ao enum `RelatedModule`, com comentário explicando por
que é valor próprio (o §30 pede o gasto com equipe somável separado do resto).

Acrescentar a `FinancialEntry`:

```prisma
  /// Módulo 33: que tipo de pagamento de mão de obra é este. Nulo em tudo que
  /// não vem de `Worker`.
  worker_entry_kind WorkerEntryKind?
```

Acrescentar `workers Worker[]` a `Tenant`, `Property` e `User` (relação
`"WorkerRecordedBy"`).

- [ ] **Passo 2: registrar em `TENANT_SCOPED_MODELS`**

Em `src/lib/prisma.ts:27`, acrescentar `"worker"` ao `Set`.

- [ ] **Passo 3: gerar o SQL da migração**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Salvar em `prisma/migrations/20260903100000_mao_de_obra_fase_1/migration.sql`.

⚠️ **Remova do SQL gerado os dois `DROP INDEX`** de
`WhatsAppProviderConfig_one_active` e `AnimalBatch_tenant_ear_tag_key`. Eles são
índices parciais que o `schema.prisma` não representa, então todo `migrate diff`
os sugere como se fossem drift. Derrubá-los quebra "no máximo 1 provider ativo"
e "brinco único por tenant". `npm run check` confere que os dois continuam
criados.

- [ ] **Passo 4: aplicar no Docker local**

```
docker start tibe-pg
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run db:deploy
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma generate
```

- [ ] **Passo 5: provar o isolamento**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:isolation
```

Esperado: verde. Agora **tire `"worker"` do `TENANT_SCOPED_MODELS` e rode de
novo**: tem que reprovar. Devolva. Trava só vale depois de vista falhar.

- [ ] **Passo 6: `npm run check` e `npm run test:drift`**

- [ ] **Passo 7: commit**

```
git add prisma/schema.prisma prisma/migrations src/lib/prisma.ts
git commit -m "Schema: o trabalhador, e o tipo de pagamento no financeiro"
```

⚠️ **Este commit mexe em schema.** Ele NÃO pode ir para a `main` antes de o
usuário aplicar a migração no Neon, no terminal dele. Invariante 3.

## Task 6: a data do próximo pagamento, sem banco

Função pura, testável sem Postgres. Fica sozinha numa tarefa porque é onde mora
a única aritmética do módulo, e porque os casos de borda (dia 31 em fevereiro)
são exatamente o que um teste com banco esconderia.

**Arquivos:**
- Criar: `src/lib/mao-de-obra/proxima-data.ts`
- Criar: `scripts/m57-mao-de-obra.test.ts`
- Modificar: `package.json`

**Interfaces:**
- Produz:
  ```ts
  export function proximaDataDePagamento(
    frequencia: PayFrequency,
    diaHabitual: number | null,
    apartirDe: Date,
  ): Date;
  ```

- [ ] **Passo 1: escrever a suíte que falha**

Bloco 1 de `scripts/m57-mao-de-obra.test.ts`, **sem** `exigirBancoLocal` neste
bloco (a função é pura):

```ts
console.log("1. A data do próximo pagamento (§5, §7)");
const { proximaDataDePagamento } = await import("@/lib/mao-de-obra/proxima-data");

const d = (s: string) => new Date(`${s}T12:00:00.000Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

check(
  "mensal, dia 5, a partir de 02/09 cai em 05/09",
  iso(proximaDataDePagamento("mensal", 5, d("2026-09-02"))) === "2026-09-05",
  iso(proximaDataDePagamento("mensal", 5, d("2026-09-02"))),
);
check(
  "mensal, dia 5, a partir de 05/09 cai no mês seguinte",
  iso(proximaDataDePagamento("mensal", 5, d("2026-09-05"))) === "2026-10-05",
  iso(proximaDataDePagamento("mensal", 5, d("2026-09-05"))),
);
check(
  "mensal, dia 31, em fevereiro cai no ultimo dia do mes",
  iso(proximaDataDePagamento("mensal", 31, d("2026-02-01"))) === "2026-02-28",
  iso(proximaDataDePagamento("mensal", 31, d("2026-02-01"))),
);
check(
  "semanal soma 7 dias",
  iso(proximaDataDePagamento("semanal", null, d("2026-09-02"))) === "2026-09-09",
);
check(
  "quinzenal soma 15 dias",
  iso(proximaDataDePagamento("quinzenal", null, d("2026-09-02"))) === "2026-09-17",
);
check(
  "diaria soma 1 dia",
  iso(proximaDataDePagamento("diaria", null, d("2026-09-02"))) === "2026-09-03",
);
check(
  "mensal sem dia habitual soma um mes",
  iso(proximaDataDePagamento("mensal", null, d("2026-09-02"))) === "2026-10-02",
);
```

- [ ] **Passo 2: acrescentar `"test:m57"` ao `package.json` e rodar**

Esperado: falha por módulo inexistente.

- [ ] **Passo 3: implementar**

`src/lib/mao-de-obra/proxima-data.ts`:

```ts
import type { PayFrequency } from "@/generated/prisma/client";

/**
 * A data do próximo pagamento (§7 do Módulo 33).
 *
 * ESTRITAMENTE DEPOIS de `apartirDe`: quem acabou de confirmar o pagamento do
 * dia 5 espera o próximo no mês que vem, não hoje de novo. Um `>=` aqui criaria
 * duas previsões pendentes para o mesmo dia, e a regra da previsão rolante é
 * que existe SEMPRE UMA.
 *
 * O dia habitual só vale para `mensal` e `outra`. Em `diaria`, `semanal` e
 * `quinzenal` o documento não pede dia fixo do mês, e forçá-lo faria "toda
 * sexta" virar "todo dia 5". Quinzenal soma 15 dias a partir do último
 * pagamento, que é como o produtor conta.
 *
 * Fevereiro: dia 31 vira o último dia do mês, nunca 03/03. O produtor que
 * escreveu 31 quis dizer "no fim do mês".
 */
export function proximaDataDePagamento(
  frequencia: PayFrequency,
  diaHabitual: number | null,
  apartirDe: Date,
): Date {
  const base = new Date(
    Date.UTC(apartirDe.getUTCFullYear(), apartirDe.getUTCMonth(), apartirDe.getUTCDate(), 12),
  );

  if (frequencia === "diaria") return somarDias(base, 1);
  if (frequencia === "semanal") return somarDias(base, 7);
  if (frequencia === "quinzenal") return somarDias(base, 15);

  // mensal e outra
  if (diaHabitual === null) return somarMeses(base, 1);

  const noMes = comDia(base.getUTCFullYear(), base.getUTCMonth(), diaHabitual);
  if (noMes.getTime() > base.getTime()) return noMes;
  return comDia(base.getUTCFullYear(), base.getUTCMonth() + 1, diaHabitual);
}

function somarDias(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n, 12));
}

function somarMeses(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate(), 12));
}

/** Grampeia o dia ao último do mês: 31 em fevereiro vira 28 ou 29. */
function comDia(ano: number, mes: number, dia: number): Date {
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0, 12)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimo), 12));
}
```

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: quebrar de propósito**

Troque o `>` por `>=` na comparação de `noMes`. O caso "a partir de 05/09 cai no
mês seguinte" tem que ficar vermelho. Devolva.

- [ ] **Passo 6: commit**

```
git add src/lib/mao-de-obra scripts/m57-mao-de-obra.test.ts package.json
git commit -m "Mao de obra: a data do proximo pagamento, e o dia 31 em fevereiro"
```

## Task 7: as actions do trabalhador

**Arquivos:**
- Criar: `src/lib/actions/workers.ts`
- Modificar: `scripts/m57-mao-de-obra.test.ts` (blocos 2 a 6)

**Interfaces:**
- Consome: `createLinkedEntry` de `@/lib/financial`, `proximaDataDePagamento`,
  `scoped`, `ok`, `fail`.
- Produz:
  ```ts
  export type WorkerView = {
    id: string; name: string; role: string;
    type: "fixo" | "eventual"; status: "ativo" | "inativo";
    pay_frequency: string | null; pay_amount: number | null; pay_day: number | null;
    property_id: string | null; phone: string | null;
    started_at: string | null; notes: string | null;
    proximo_pagamento: { id: string; amount: number; due_date: string } | null;
  };
  export type WorkerInput = {
    name: string;
    role: string;
    type: "fixo" | "eventual";
    pay_frequency?: "mensal" | "quinzenal" | "semanal" | "diaria" | "outra" | null;
    pay_amount?: number | null;
    pay_day?: number | null;
    property_id?: string | null;
    phone?: string | null;
    started_at?: Date | null;
    notes?: string | null;
  };
  export type WorkerEntryView = {
    id: string;
    kind: "pagamento" | "adiantamento" | "gratificacao" | "beneficio" | "outro" | null;
    amount: number;
    category: string | null;
    due_date: string | null;
    paid_at: string | null;
    status: "pending" | "paid" | "overdue";
    notes: string | null;
  };
  export type WorkerDetailView = WorkerView & { entries: WorkerEntryView[] };

  export const FUNCOES_SUGERIDAS: readonly string[];
  export function listWorkers(
    db: TenantPrismaClient,
    filtro?: { status?: "ativo" | "inativo" | null; property_id?: string | null },
  ): Promise<WorkerView[]>;
  export function createWorker(
    db: TenantPrismaClient, input: WorkerInput,
  ): Promise<ActionResult<WorkerView>>;
  export function updateWorker(
    db: TenantPrismaClient, id: string, input: WorkerInput,
  ): Promise<ActionResult<WorkerView>>;
  export function setWorkerStatus(
    db: TenantPrismaClient, id: string, status: "ativo" | "inativo",
  ): Promise<ActionResult<WorkerView>>;
  export function getWorkerDetail(
    db: TenantPrismaClient, id: string,
  ): Promise<ActionResult<WorkerDetailView>>;
  ```

- [ ] **Passo 1: escrever os blocos 2 a 4 da suíte**

Provam: cadastro de fixo cria a previsão pendente; cadastro de eventual **não**
cria previsão; fixo sem valor ou sem frequência é recusado no campo; inativar
cancela a previsão pendente; e o detalhe traz os lançamentos.

```ts
console.log("\n2. Cadastro de trabalhador fixo cria UMA previsão (§7, §40.2)");
const joao = await createWorker(db, {
  name: "João",
  role: "Vaqueiro",
  type: "fixo",
  pay_frequency: "mensal",
  pay_amount: 2500,
  pay_day: 5,
  property_id: fazenda.id,
});
check("cadastro devolve ok", joao.ok);
if (!joao.ok) throw new Error("createWorker falhou");

const previsoes = await db.financialEntry.findMany({
  where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
});
check("nasceu exatamente UMA previsão", previsoes.length === 1, String(previsoes.length));
check("no valor combinado", Number(previsoes[0]?.amount) === 2500);
check("como despesa", previsoes[0]?.entry_type === "expense");
check("marcada como pagamento", previsoes[0]?.worker_entry_kind === "pagamento");

console.log("\n3. Eventual não gera previsão (§13: quem paga é a diária)");
const diarista = await createWorker(db, { name: "Zé", role: "Serviços gerais", type: "eventual" });
check("cadastro devolve ok", diarista.ok);
if (!diarista.ok) throw new Error("createWorker falhou");
const semPrevisao = await db.financialEntry.count({
  where: { related_module: "mao_de_obra", related_id: diarista.data.id },
});
check("nenhuma previsão para o eventual", semPrevisao === 0, String(semPrevisao));

console.log("\n4. Fixo sem valor é recusado NO CAMPO");
const semValor = await createWorker(db, { name: "X", role: "Caseiro", type: "fixo", pay_frequency: "mensal" });
check("recusado", !semValor.ok);
check("no campo pay_amount", !semValor.ok && semValor.field === "pay_amount");

const semFreq = await createWorker(db, { name: "Y", role: "Caseiro", type: "fixo", pay_amount: 1000 });
check("sem frequência é recusado", !semFreq.ok);
check("no campo pay_frequency", !semFreq.ok && semFreq.field === "pay_frequency");

console.log("\n5. Inativar cancela a previsão pendente");
await setWorkerStatus(db, joao.data.id, "inativo");
const aindaPendente = await db.financialEntry.count({
  where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
});
check("nenhuma previsão pendente sobrou", aindaPendente === 0, String(aindaPendente));
await setWorkerStatus(db, joao.data.id, "ativo");
const voltou = await db.financialEntry.count({
  where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
});
check("reativar recria a previsão", voltou === 1, String(voltou));
```

- [ ] **Passo 2: rodar e ver falhar**

- [ ] **Passo 3: implementar `src/lib/actions/workers.ts`**

Pontos que o implementador precisa acertar, e que a suíte cobra:

1. `FUNCOES_SUGERIDAS` com as dez do §6: Vaqueiro, Trabalhador rural,
   Tratorista, Ordenhador, Gerente, Caseiro, Auxiliar de fazenda, Campeiro,
   Serviços gerais, Outro.
2. `createWorker` valida, em ordem, e **sempre com `field`**: `name` vazio;
   `role` vazio; `type` fixo sem `pay_frequency` (campo `pay_frequency`); fixo
   sem `pay_amount` maior que zero (campo `pay_amount`); `pay_day` fora de 1 a
   31 (campo `pay_day`).
3. Cadastro de `fixo` chama `garantirPrevisao` dentro da mesma transação
   (`runSerializableTenantTransaction`, de `@/lib/financial`), para uma recusa
   não deixar previsão órfã.
4. `garantirPrevisao(tx, worker)` é **idempotente**: se já existe entrada
   pendente com `related_id` do trabalhador, não cria outra. É o que sustenta a
   regra "existe sempre UMA".
5. A previsão usa `createLinkedEntry` com
   `{ entry_type: "expense", category: "Mão de obra fixa", related_module: "mao_de_obra", related_id: worker.id, status: "pending", due_date: proximaDataDePagamento(...), occurred_at: hoje }`
   e `worker_entry_kind: "pagamento"`.

⚠️ `createLinkedEntry` hoje **não** aceita `worker_entry_kind`. Acrescente o
campo ao `params` dele em `src/lib/financial.ts`, do mesmo jeito que
`negotiation_role` foi acrescentado, e não crie `FinancialEntry` por fora do
helper: o CLAUDE.md proíbe.

6. `setWorkerStatus(db, id, "inativo")` apaga as previsões **pendentes** (nunca
   as pagas: o §40.8 exige histórico). Voltar para `ativo` chama
   `garantirPrevisao`.

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: provar a idempotência**

Chame `garantirPrevisao` duas vezes seguidas num teste temporário e confirme que
continua **uma**. Sem isso, um clique duplo no botão de reativar cria duas contas
a pagar para o mesmo mês.

- [ ] **Passo 6: commit**

```
git add src/lib/actions/workers.ts src/lib/financial.ts scripts/m57-mao-de-obra.test.ts
git commit -m "Mao de obra: o cadastro do trabalhador, e a previsao que nasce com ele"
```

## Task 8: confirmar pagamento, adiantamento e extras

**Arquivos:**
- Modificar: `src/lib/actions/workers.ts`
- Modificar: `scripts/m57-mao-de-obra.test.ts` (blocos 6 a 9)

**Interfaces:**
- Produz:
  ```ts
  export function confirmWorkerPayment(db, input: {
    worker_id: string; amount?: number | null; paid_at?: Date; notes?: string | null;
  }): Promise<ActionResult<{ pago: number; proxima_previsao: string | null }>>;
  export function recordWorkerAdvance(db, input: {
    worker_id: string; amount: number; occurred_at?: Date; notes?: string | null;
  }): Promise<ActionResult<{ id: string; amount: number }>>;
  export function recordWorkerExtra(db, input: {
    worker_id: string; kind: "gratificacao" | "beneficio" | "outro";
    amount: number; category: string; occurred_at?: Date; notes?: string | null;
  }): Promise<ActionResult<{ id: string; amount: number }>>;
  ```

- [ ] **Passo 1: escrever os blocos, que falham**

```ts
console.log("\n6. Confirmar o pagamento quita a previsão e cria a próxima (§8)");
const antes = await db.financialEntry.findFirst({
  where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
});
const pago = await confirmWorkerPayment(db, { worker_id: joao.data.id });
check("confirmação devolve ok", pago.ok);
check("pagou o valor previsto", pago.ok && pago.data.pago === 2500);

const quitada = await db.financialEntry.findUnique({ where: { id: antes!.id } });
check("a previsão virou paga", quitada?.status === "paid");
check("com paid_at preenchido", quitada?.paid_at !== null);

const pendentes = await db.financialEntry.findMany({
  where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
});
check("nasceu a próxima, e só ela", pendentes.length === 1, String(pendentes.length));
check(
  "com vencimento no mês seguinte",
  pendentes[0]!.due_date!.toISOString().slice(0, 7) !==
    antes!.due_date!.toISOString().slice(0, 7),
);

console.log("\n7. Confirmar sem previsão pendente é recusado, não inventa");
await db.financialEntry.deleteMany({
  where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
});
const semPrevisao2 = await confirmWorkerPayment(db, { worker_id: joao.data.id });
check("recusado", !semPrevisao2.ok);

console.log("\n8. Adiantamento é lançamento SEPARADO (§9)");
const adiant = await recordWorkerAdvance(db, { worker_id: joao.data.id, amount: 500 });
check("adiantamento devolve ok", adiant.ok);
const lancAdiant = await db.financialEntry.findFirst({
  where: { related_id: joao.data.id, worker_entry_kind: "adiantamento" },
});
check("gravado como adiantamento", lancAdiant !== null);
check("já pago", lancAdiant?.status === "paid");
check("e NÃO mexeu na previsão do mês", lancAdiant?.id !== antes!.id);

console.log("\n9. Valor zero ou negativo é recusado no campo");
const zero = await recordWorkerAdvance(db, { worker_id: joao.data.id, amount: 0 });
check("zero recusado", !zero.ok);
check("no campo amount", !zero.ok && zero.field === "amount");
```

- [ ] **Passo 2: rodar e ver falhar**

- [ ] **Passo 3: implementar**

Regras que a suíte cobra:

1. `confirmWorkerPayment` roda em transação: acha a previsão pendente mais
   antiga do trabalhador; se **não** houver, recusa com
   `fail("NOT_FOUND", "Não há pagamento previsto para este trabalhador.", 404)`.
   Nunca inventa um valor: o §40.3 diz que o sistema prevê, e o produtor
   confirma.
2. `amount` opcional: quando vier, sobrescreve o previsto (o produtor pagou
   diferente), e o lançamento guarda o valor real.
3. Marca a previsão como `paid` com `paid_at`, e chama `garantirPrevisao` na
   mesma transação. Trabalhador `inativo` **não** ganha próxima previsão.
4. `recordWorkerAdvance` e `recordWorkerExtra` criam lançamento **novo**,
   `status: "paid"`, com o `worker_entry_kind` correspondente. Nunca tocam na
   previsão do mês: o §9 pede o adiantamento mostrado separado.
5. Os três recusam `amount` que não seja finito e maior que zero, com
   `field: "amount"`.

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: quebrar de propósito**

Faça `confirmWorkerPayment` criar a próxima previsão **fora** da transação e
force um erro depois. Tem que sobrar previsão órfã, provando que a transação é
o que impede isso. Devolva.

- [ ] **Passo 6: commit**

```
git add src/lib/actions/workers.ts scripts/m57-mao-de-obra.test.ts
git commit -m "Mao de obra: confirmar pagamento, adiantamento e extras"
```

## Task 9: as rotas

**Arquivos:**
- Criar: `src/app/api/v1/workers/route.ts`
- Criar: `src/app/api/v1/workers/[id]/route.ts`
- Criar: `src/app/api/v1/workers/[id]/payments/route.ts`
- Modificar: `src/lib/permissions.ts`
- Modificar: `src/app/(public)/docs/api/endpoints.ts`

**Interfaces:**
- Consome: as actions das Tasks 7 e 8.
- Produz: `ModuleKey` ganha `"mao_de_obra"`; `GET`/`POST` em `/workers`;
  `GET`/`PATCH` em `/workers/[id]`; `POST` em `/workers/[id]/payments` com
  `kind` no corpo escolhendo entre confirmar pagamento, adiantamento e extra.

- [ ] **Passo 1: o módulo de permissão**

Em `src/lib/permissions.ts`, acrescentar `"mao_de_obra"` à união `ModuleKey` e a
linha à `ACCESS_MATRIX`:

```ts
  // Módulo 33. Não reusa `financeiro` nem `rebanho` porque as duas dão escrita
  // a OPERADOR, e isto guarda SALÁRIO. Espelha `usuarios`, que é o outro
  // módulo com dado pessoal. Decisão do usuário em 02/09; o raciocínio e as
  // consequências estão na seção "O guard" do plano desta fase.
  mao_de_obra: { OWNER: W, ADMIN: W, OPERADOR: N, VISUALIZADOR: N },
```

⚠️ **`ACCESS_MATRIX` é `Record<ModuleKey, ...>`**, então acrescentar à união sem
acrescentar a linha quebra a compilação. Isso é bom: é a trava funcionando.
Confirme com `npx tsc --noEmit` que ela quebra antes de você escrever a linha.

- [ ] **Passo 2: escrever as rotas**

Copie a estrutura inteira do arquivo escrito na **Task 2, passo 3**
(`src/app/api/v1/contacts/[id]/route.ts`): ele já tem a forma exata que estas
três precisam. Trocam o guard, o schema e as actions chamadas, e nada mais.

Todas com `guard("mao_de_obra", "read" | "write", { profile: "fazenda" })` (ver
a seção "O guard" no topo), `withApi`, `apiErroDeZod` na recusa de schema e
`apiError(res.code, res.message, res.status, res.field)` na recusa da action.

⚠️ **A recusa do Zod precisa sair em português e dizer o campo** (conferência
12). Use `apiErroDeZod`, nunca `error.message` cru: 71 rotas já devolveram "Too
small: expected number to be >=0" no rodapé do painel por causa disso.

- [ ] **Passo 3: registrar em `/docs/api` e rodar**

```
npm run test:docs-api && npm run check && npx tsc --noEmit
```

- [ ] **Passo 4: provar que a permissão morde**

Rode `npm run test:isolation` e acrescente à suíte `m57` um bloco que confirme
`canWrite("OPERADOR", "mao_de_obra") === false` e
`canAccess("VISUALIZADOR", "mao_de_obra") === false`. Depois troque o `N` por
`W` na matriz e veja o bloco ficar vermelho. Devolva.

- [ ] **Passo 5: provar a recusa em português**

Com `next dev` de pé, mande `POST /api/v1/workers` com `pay_amount: -5` e
confirme que a mensagem é uma frase em português citando o campo.

- [ ] **Passo 6: commit**

```
git add src/app/api/v1/workers src/lib/permissions.ts "src/app/(public)/docs/api/endpoints.ts"
git commit -m "Mao de obra: as rotas do trabalhador e dos pagamentos"
```

## Task 10: a tela

**Arquivos:**
- Criar: `src/app/(dashboard)/mao-de-obra/page.tsx`
- Criar: `src/app/(dashboard)/mao-de-obra/[id]/page.tsx`
- Criar: `src/components/mao-de-obra/worker-form.tsx`
- Criar: `src/components/mao-de-obra/payment-form.tsx`
- Criar: `src/components/mao-de-obra/labels.ts`
- Modificar: `src/lib/nav.ts`

- [ ] **Passo 1: os rótulos**

`Record` completo de `WorkerType`, `PayFrequency`, `WorkerStatus` e
`WorkerEntryKind` para português, pelo mesmo motivo da Task 3: valor novo no
enum quebra a compilação até ganhar rótulo.

- [ ] **Passo 2: a listagem (§38 "Minha equipe")**

Nome, função, situação e **próximo pagamento** (valor e data), que é o que o §38
pede. Mais o resumo do mês: total previsto e total pago.

⚠️ **Valor em dinheiro usa `MoneyInput`, nunca `<input type="number">`**
(conferência 7).

- [ ] **Passo 3: os dois painéis de escrita**

`worker-form.tsx` com
`ORDEM = ["name", "role", "type", "pay_frequency", "pay_amount", "pay_day", "property_id", "phone", "started_at", "notes"]`,
e `payment-form.tsx` com `ORDEM = ["kind", "amount", "occurred_at", "notes"]`.

⚠️ **Todo campo do `ORDEM` precisa de `error=` no `<Field>`** (conferência 15).
Foi assim que oito campos mudos passaram de uma vez na tela do Confinamento: a
conferência 10 aprova o arquivo porque ele trata a recusa em ALGUM lugar, e só
a 15 olha campo por campo.

- [ ] **Passo 4: o detalhe (§37 histórico)**

Dados do trabalhador, próximo pagamento com botão de confirmar, botões de
adiantamento e de extra, e a lista de lançamentos separada por
`worker_entry_kind`, que é o §9 pedindo o adiantamento mostrado à parte.

- [ ] **Passo 5: o menu**

Em `src/lib/nav.ts`, grupo `"Operação"`, depois de `Contatos`:

```ts
        // Módulo 33: quem trabalha na fazenda. Fica depois de Contatos porque
        // é a mesma pergunta ("quem"), separada pelo §36: aqui mora quem
        // recebe salário ou diária, e em Contatos quem entrega um serviço.
        { href: "/mao-de-obra", label: "Mão de Obra", show: hasFazenda },
```

- [ ] **Passo 6: rodar tudo**

```
npm run check && npx tsc --noEmit && npm run lint
```

- [ ] **Passo 7: validar no navegador**

Cadastrar o João do §7 (vaqueiro, R$ 2.500, dia 5), ver "Próximo pagamento: R$
2.500 no dia 5", confirmar o pagamento, ver a despesa aparecer em `/financeiro`
**sem relançar**, e ver a próxima previsão nascer para outubro. Depois lançar um
adiantamento de R$ 500 e confirmar que ele aparece **separado**.

- [ ] **Passo 8: commit**

```
git add "src/app/(dashboard)/mao-de-obra" src/components/mao-de-obra src/lib/nav.ts
git commit -m "Mao de obra: a tela da equipe, do pagamento e do adiantamento"
```

## Task 11: o handler do WhatsApp

O classificador do n8n segue congelado: o handler nasce pronto e sem uso, como
os das missões 3 e 4 do Módulo 31.

**Arquivos:**
- Criar: `src/lib/actions/whatsapp-handlers/mao-de-obra.ts`
- Criar: `src/lib/actions/worker-pending.ts`
- Modificar: `src/lib/whatsapp-intents.ts`, `src/lib/actions/whatsapp-router.ts`
- Modificar: `scripts/m57-mao-de-obra.test.ts` (blocos 10 a 12)

**Interfaces:**
- Consome: `criarStoreDePendencia` da Task 4; as actions das Tasks 7 e 8.
- Produz: as intenções `registrar_trabalhador`,
  `registrar_pagamento_trabalhador` e `registrar_adiantamento`.

- [ ] **Passo 1: escrever os blocos da suíte**

⚠️ **O teste precisa imitar o produtor real, não um classificador ideal.** A
lição registrada: uma suíte ficou verde com a conversa quebrada porque simulava
um classificador que remonta os parâmetros, e o do n8n **não remonta**. Escreva
o segundo turno mandando **só** o campo que faltava, exatamente como o
classificador manda.

Provar, no mínimo:

- "João é meu vaqueiro e ganha 2.500 por mês" pede confirmação e **não grava**;
- o "sim" seguinte grava, com os valores **mostrados**, não remontados;
- "não, deixa pra lá" **cancela** e não grava nada (é o defeito da compra
  recusada de R$ 1.200, e ele nasceu exatamente aqui);
- "paguei o João hoje" com previsão conhecida oferece o valor previsto;
- "paguei o João hoje" **sem** trabalhador cadastrado responde perguntando, e
  não cria trabalhador em silêncio.

- [ ] **Passo 2: rodar e ver falhar**

- [ ] **Passo 3: implementar**

`worker-pending.ts` é uma chamada a `criarStoreDePendencia` com
`prefixo: "worker-pending"`, e nada mais: se você se pegar copiando 90 linhas de
Redis, a Task 4 não foi feita.

- [ ] **Passo 4: rodar e ver passar, com Redis local**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m57
```

- [ ] **Passo 5: commit**

```
git add src/lib/actions/whatsapp-handlers/mao-de-obra.ts src/lib/actions/worker-pending.ts src/lib/whatsapp-intents.ts src/lib/actions/whatsapp-router.ts scripts/m57-mao-de-obra.test.ts
git commit -m "Mao de obra: o handler das tres intencoes, com o classificador congelado"
```

## Task 12: fechar a rodada

- [ ] **Passo 1: rodar a suíte inteira**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:all
```

Ele não para na primeira falha. Leia o resumo do fim.

- [ ] **Passo 2: apagar da `dividas.md` o que fechou**

A linha "tela de contatos" da §2.3 e a §3.2 inteira (as sete cópias do store),
se a Task 4 tiver sido feita. O protocolo do arquivo manda apagar item fechado,
e a numeração **não** é refeita.

- [ ] **Passo 3: atualizar o `current-handoff.md`**

Substituir a seção "Estado atual". Só fatos verificados: escopo entregue,
suítes, commits, e o próximo passo (fase 33.2). Sem copiar a conversa.

- [ ] **Passo 4: registrar a lição no cofre, se houver**

Use a skill `memoria-cofre`. Uma nota por lição, com `[[wikilink]]`. Se nada
surpreendeu, não invente nota.

- [ ] **Passo 5: commit e parar**

```
git add docs/agents
git commit -m "Handoff: a fase 0 e a mao de obra fixa"
```

⚠️ **Não faça merge nem push na `main`.** A rodada termina aqui, com a branch
`mao-de-obra-fase-1` pronta e a migração **ainda não aplicada no Neon**. Os dois
passos são do usuário, e a migração vem antes do push.
