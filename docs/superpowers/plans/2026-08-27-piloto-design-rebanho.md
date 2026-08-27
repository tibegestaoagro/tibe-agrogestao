# Piloto de design no Rebanho: plano de implementação

> **Para executores:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans` para executar tarefa por tarefa. Os passos usam
> caixa (`- [ ]`) para acompanhamento.

**Objetivo:** fechar as três camadas do sistema de design (cor, escrita,
leitura) na área de Rebanho, e instalar a catraca que impede a cor crua de
voltar.

**Arquitetura:** a decisão que sustenta o plano é tirar a regra de dentro do
componente. Quem decide **qual** campo focar e **qual** campo o servidor
recusou são funções puras em `src/lib/erros-de-formulario.ts`, cobertas por
suíte de verdade; o React só executa a decisão. Isso existe porque o projeto
não tem runner de DOM, e a alternativa seria não testar nada.

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind com tokens semânticos
em `globals.css`, Zod nos contratos, suítes em `tsx scripts/*.test.ts`.

**Spec:** [2026-08-27-sequencia-para-fechar-os-modulos-design.md](../specs/2026-08-27-sequencia-para-fechar-os-modulos-design.md)

## Restrições globais

Valem para toda tarefa, sem repetir em cada uma:

- **Travessão (U+2014) é proibido** em código, documentação e mensagem de
  commit. O hook `guarda-escrita.mjs` recusa a escrita.
- **Nunca escrever conteúdo com escape por heredoc no shell.** Use Edit/Write.
- **Regra de negócio vive em `src/lib/`**, nunca no componente nem na rota.
- **Commit por tarefa concluída** na branch `piloto-design-rebanho`. Merge e
  push na `main` exigem autorização do usuário, a cada vez.
- **`npx tsc --noEmit` tem ruído pré-existente** em
  `scripts/m23-token-auth.test.ts`, e só nele (dívida 3.1). Compare contra essa
  linha de base: erro em qualquer outro arquivo é regressão sua.
- **Nenhuma tarefa aqui toca schema.** Se você se pegar editando
  `prisma/schema.prisma`, parou no lugar errado.
- **Suíte nova precisa de entrada no `package.json`**, senão `npm run check`
  reprova.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/contracts/src/envelope.ts` | contrato do envelope; ganha `field` opcional |
| `src/lib/api.ts` | `apiError` passa a aceitar `field` |
| `src/lib/client-api.ts` | resultado de erro passa a carregar `field` |
| `src/lib/erros-de-formulario.ts` | **novo.** As duas decisões puras |
| `scripts/m46-erros-de-formulario.test.ts` | **novo.** Suíte das funções puras |
| `src/components/ui/field.tsx` | ganha `id` estável obrigatório no uso |
| `src/components/ui/form-sheet.tsx` | foca o campo que a função pura escolheu |
| `src/components/ui/empty-state.tsx` | **novo.** Estado vazio padrão |
| `src/components/ui/carregando.tsx` | **novo.** Estado de carregamento padrão |
| `src/components/rebanho/*.tsx` | os quatro painéis convertidos |
| `src/app/(dashboard)/rebanho/**` | leitura: vazio, carregando, tabela estreita |
| `scripts/baseline-cor-crua.json` | **novo.** Linha de base da cor crua |
| `scripts/check-repo.ts` | **novo item 8:** a catraca de cor |

---

### Task 1: `field` no envelope de erro

O envelope hoje é `{ error: { code, message } }`, e por isso a tela não sabe
qual campo o servidor recusou. A extensão é aditiva: quem não lê `field`
continua funcionando igual, que é a condição do CLAUDE.md para extensão sem
nova rodada de contrato.

**Arquivos:**
- Modificar: `packages/contracts/src/envelope.ts`
- Modificar: `src/lib/api.ts:17-23`
- Modificar: `src/lib/client-api.ts:5-7` e `:20-26`
- Modificar: `scripts/m40-envelope-de-erro.test.ts`
- Modificar: `src/app/(public)/docs/api/page.tsx` (a seção do envelope)

**Interfaces:**
- Produz: `apiError(code, message, status?, field?)`;
  `ApiError = { error: { code: string; message: string; field?: string } }`;
  o resultado de erro de `client-api` passa a ter `field?: string`.

- [ ] **Passo 1: escrever o caso que falha, em `m40`**

Acrescente ao final da suíte, antes do resumo:

```ts
{
  const r = apiError("SALDO_INSUFICIENTE", "Existem apenas 3 animais.", 422, "quantity");
  const body = await r.json();
  assert(body.error.field === "quantity", "apiError propaga o campo recusado");
  assert(apiErrorSchema.safeParse(body).success, "envelope com field continua valido pelo schema");
}
{
  const r = apiError("NOT_FOUND", "Nao encontrado", 404);
  const body = await r.json();
  assert(!("field" in body.error), "sem field, a chave nem aparece");
}
```

Importe no topo do arquivo: `import { apiError } from "@/lib/api";` e
`import { apiErrorSchema } from "@tibe/contracts/envelope";` (confira o
caminho de import que as outras suítes usam para o pacote de contratos e siga
o mesmo).

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test:m40`
Esperado: FALHA, porque `apiError` ainda não aceita o quarto argumento (erro de
tipo) e o schema ainda não conhece `field`.

- [ ] **Passo 3: contrato**

Em `packages/contracts/src/envelope.ts`:

```ts
export type ApiError = {
  error: { code: string; message: string; field?: string };
};

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /**
     * Qual campo do formulario o servidor recusou. Opcional de proposito:
     * a maioria dos erros nao pertence a campo nenhum (rede, permissao,
     * conflito). Quem nao le continua igual, que e o que torna esta
     * extensao aditiva.
     */
    field: z.string().optional(),
  }),
});
```

- [ ] **Passo 4: servidor**

Em `src/lib/api.ts`, substitua `apiError` inteira:

```ts
export function apiError(
  code: string,
  message: string,
  status = 400,
  field?: string,
) {
  return NextResponse.json(
    { error: field ? { code, message, field } : { code, message } },
    { status },
  );
}
```

Repare que a chave só aparece quando existe. Mandar `field: undefined` no JSON
seria a mesma coisa na prática, mas deixa a resposta suja e faz o teste de
ausência precisar de exceção.

- [ ] **Passo 5: cliente**

Em `src/lib/client-api.ts`:

```ts
type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; field?: string };
```

e dentro de `request`, no ramo de erro:

```ts
    return {
      ok: false,
      code: json?.error?.code ?? "ERROR",
      message: json?.error?.message ?? "Erro inesperado",
      field: typeof json?.error?.field === "string" ? json.error.field : undefined,
    };
```

- [ ] **Passo 6: rodar e ver passar**

Run: `npm run test:m40`
Esperado: PASSA, com os dois casos novos verdes.

- [ ] **Passo 7: documentar na página de contrato**

Em `src/app/(public)/docs/api/page.tsx`, onde o envelope de erro é descrito,
acrescente `field` como opcional, com uma frase dizendo que ele aparece só em
recusa de formulário. Rode `npm run test:docs-api` para conferir que a página
continua batendo com as rotas reais.

- [ ] **Passo 8: commit**

```bash
git add packages/contracts/src/envelope.ts src/lib/api.ts src/lib/client-api.ts scripts/m40-envelope-de-erro.test.ts "src/app/(public)/docs/api/page.tsx"
git commit -m "O envelope de erro passa a dizer QUAL campo o servidor recusou"
```

---

### Task 2: as duas decisões, como função pura

Sem runner de DOM, a única forma honesta de testar comportamento de formulário
é tirar a decisão do componente. São duas: qual campo focar, e o que fazer com
um erro que veio do servidor.

**Arquivos:**
- Criar: `src/lib/erros-de-formulario.ts`
- Criar: `scripts/m46-erros-de-formulario.test.ts`
- Modificar: `package.json` (script `test:m46`)

**Interfaces:**
- Consome: o tipo de erro de `client-api` (Task 1).
- Produz:
  `primeiroInvalido<K extends string>(erros: Partial<Record<K, string>>, ordem: readonly K[]): K | null`
  e
  `aplicarErroDoServidor<K extends string>(res: { code: string; message: string; field?: string }, ordem: readonly K[]): { erros: Partial<Record<K, string>>; global: string | null }`.

- [ ] **Passo 1: escrever a suíte que falha**

Crie `scripts/m46-erros-de-formulario.test.ts`:

```ts
import { primeiroInvalido, aplicarErroDoServidor } from "@/lib/erros-de-formulario";

/**
 * As duas decisoes de formulario que nao podem morar no componente.
 *
 * Motivo: este repositorio nao tem runner de DOM. Regra dentro do JSX aqui e
 * regra sem teste, e a fase 1 ja mostrou o preco disso (27 paineis de escrita
 * sem `<form>`, descobertos por medicao e nao por suite).
 *
 * Roda: `npm run test:m46` (sem banco).
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

const ORDEM = ["tipo", "categoria", "valor", "vencimento"] as const;

console.log("\n1. primeiroInvalido segue a ordem da TELA, nao a do objeto");
assert(primeiroInvalido({ valor: "x", tipo: "y" }, ORDEM) === "tipo", "escolhe o que aparece primeiro na tela");
assert(primeiroInvalido({ vencimento: "x" }, ORDEM) === "vencimento", "com um erro so, escolhe ele");
assert(primeiroInvalido({}, ORDEM) === null, "sem erro, nao ha o que focar");
assert(primeiroInvalido({ inexistente: "x" } as never, ORDEM) === null, "campo fora da ordem nao rouba o foco");

console.log("\n2. aplicarErroDoServidor separa erro de campo de erro global");
{
  const r = aplicarErroDoServidor(
    { code: "SALDO_INSUFICIENTE", message: "Existem apenas 3 animais.", field: "valor" },
    ORDEM,
  );
  assert(r.erros.valor === "Existem apenas 3 animais.", "erro com field vira erro do campo");
  assert(r.global === null, "e nao repete no rodape");
}
{
  const r = aplicarErroDoServidor({ code: "NETWORK", message: "Falha de rede" }, ORDEM);
  assert(r.global === "Falha de rede", "erro sem field fica no rodape");
  assert(Object.keys(r.erros).length === 0, "e nao inventa campo");
}
{
  const r = aplicarErroDoServidor(
    { code: "X", message: "Campo que a tela nao tem", field: "fazenda" },
    ORDEM,
  );
  assert(r.global === "Campo que a tela nao tem", "field desconhecido cai no rodape em vez de sumir");
  assert(Object.keys(r.erros).length === 0, "e nao cria campo fantasma");
}

console.log("");
if (failures === 0) console.log("✅ m46: erros de formulario, tudo certo.");
else {
  console.error(`❌ m46: ${failures} falha(s).`);
  process.exit(1);
}
```

O terceiro caso é o que importa de verdade: se o servidor citar um campo que
aquela tela não mostra, a mensagem **não pode desaparecer**. Erro que some é
pior que erro no lugar errado.

- [ ] **Passo 2: registrar a suíte**

Em `package.json`, na seção de scripts, ao lado das outras `test:mNN`:

```json
"test:m46": "tsx scripts/m46-erros-de-formulario.test.ts",
```

- [ ] **Passo 3: rodar e ver falhar**

Run: `npm run test:m46`
Esperado: FALHA, com "Cannot find module '@/lib/erros-de-formulario'".

- [ ] **Passo 4: implementar**

Crie `src/lib/erros-de-formulario.ts`:

```ts
/**
 * As duas decisoes de formulario que o componente NAO deve tomar.
 *
 * Elas vivem aqui por testabilidade: sem runner de DOM, regra dentro do JSX e
 * regra sem prova. Ver `scripts/m46-erros-de-formulario.test.ts`.
 */

/**
 * Qual campo focar depois de uma validacao que reprovou.
 *
 * A ordem que vale e a da TELA, nao a de insercao no objeto de erros: o
 * produtor le de cima para baixo, e mandar o foco para o terceiro campo
 * quando o primeiro tambem esta errado faz ele corrigir na ordem errada.
 */
export function primeiroInvalido<K extends string>(
  erros: Partial<Record<K, string>>,
  ordem: readonly K[],
): K | null {
  for (const chave of ordem) {
    if (erros[chave]) return chave;
  }
  return null;
}

/**
 * Onde a recusa do servidor deve aparecer.
 *
 * Com `field` conhecido, ela vira erro daquele campo e NAO se repete no
 * rodape: a mesma frase em dois lugares faz o produtor procurar dois
 * problemas. Sem `field`, ou com um campo que esta tela nao mostra, ela fica
 * no rodape. O que nunca acontece e a mensagem sumir.
 */
export function aplicarErroDoServidor<K extends string>(
  res: { code: string; message: string; field?: string },
  ordem: readonly K[],
): { erros: Partial<Record<K, string>>; global: string | null } {
  const campo = res.field as K | undefined;
  if (campo && ordem.includes(campo)) {
    return { erros: { [campo]: res.message } as Partial<Record<K, string>>, global: null };
  }
  return { erros: {}, global: res.message };
}
```

- [ ] **Passo 5: rodar e ver passar**

Run: `npm run test:m46`
Esperado: PASSA, 7 asserções verdes.

- [ ] **Passo 6: conferir o repositório**

Run: `npm run check`
Esperado: 0 falhas. Se acusar suíte sem entrada no `package.json`, o passo 2
foi pulado.

- [ ] **Passo 7: commit**

```bash
git add src/lib/erros-de-formulario.ts scripts/m46-erros-de-formulario.test.ts package.json
git commit -m "As duas decisoes de formulario saem do componente e ganham suite"
```

---

### Task 3: `FormSheet` foca o campo errado, `Field` aceita id estável

O `Field` gera `id` com `useId` quando não recebe um. Isso resolve o
cabeamento do rótulo, mas impede focar de fora, porque ninguém sabe o id. A
saída é o painel passar ids estáveis nos campos que podem receber foco.

**Arquivos:**
- Modificar: `src/components/ui/form-sheet.tsx`
- Modificar: `src/components/ui/field.tsx` (só o comentário de uso)

**Interfaces:**
- Consome: `primeiroInvalido` (Task 2).
- Produz: `FormSheetProps` ganha `focarCampoId?: string | null`.

- [ ] **Passo 1: acrescentar o foco ao `FormSheet`**

No topo do arquivo, junto dos outros imports:

```ts
import * as React from "react";
```

já existe. Acrescente à interface, depois de `error`:

```ts
  /**
   * Id do campo que deve receber foco. Mude este valor a cada submit
   * reprovado (inclusive para o MESMO campo duas vezes seguidas) e o painel
   * rola ate ele. Quem escolhe o campo e `primeiroInvalido`, em
   * `src/lib/erros-de-formulario.ts`.
   */
  focarCampoId?: string | null;
  /** Muda a cada tentativa, para refocar o mesmo campo na segunda recusa. */
  tentativa?: number;
```

E dentro do componente, antes do `return`:

```ts
  React.useEffect(() => {
    if (!focarCampoId) return;
    const alvo = document.getElementById(focarCampoId);
    if (!alvo) return;
    alvo.focus({ preventScroll: true });
    alvo.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focarCampoId, tentativa]);
```

O `tentativa` existe porque errar o mesmo campo duas vezes não muda
`focarCampoId`, e sem ele o efeito não rodaria de novo: o produtor tocaria em
salvar e nada aconteceria na tela.

O `preventScroll` seguido de `scrollIntoView` é de propósito: o foco puro rola
de forma abrupta e às vezes deixa o campo colado no topo, atrás do cabeçalho
do painel.

- [ ] **Passo 2: registrar no `Field` como se usa**

No bloco de comentário de `src/components/ui/field.tsx`, acrescente ao final:

```
 * Para que o campo possa RECEBER FOCO de fora (depois de uma recusa), passe
 * um `id` estavel em vez de deixar o `useId` gerar. O `FormSheet` foca pelo
 * id, e id gerado muda entre renders do servidor e do cliente.
```

- [ ] **Passo 3: conferir tipo e lint**

Run: `npx tsc --noEmit`
Esperado: só o ruído conhecido de `scripts/m23-token-auth.test.ts`.

Run: `npm run lint`
Esperado: limpo.

- [ ] **Passo 4: commit**

```bash
git add src/components/ui/form-sheet.tsx src/components/ui/field.tsx
git commit -m "O painel de escrita passa a levar o produtor ate o campo errado"
```

---

### Task 4: converter os dois painéis pequenos do Rebanho

**Arquivos:**
- Modificar: `src/components/rebanho/animal-edit-form.tsx` (124 linhas)
- Modificar: `src/components/rebanho/movement-cancel.tsx` (109 linhas)

**Interfaces:**
- Consome: `FormSheet` com `focarCampoId` (Task 3), `primeiroInvalido` e
  `aplicarErroDoServidor` (Task 2).

- [ ] **Passo 1: reescrever `animal-edit-form.tsx`**

O arquivo inteiro passa a ser:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { apiPatch } from "@/lib/client-api";
import { primeiroInvalido, aplicarErroDoServidor } from "@/lib/erros-de-formulario";

type Property = { id: string; name: string };

const ORDEM = ["ear_tag", "breed", "sex", "property_id", "birth_date"] as const;
type Campo = (typeof ORDEM)[number];
type Erros = Partial<Record<Campo, string>>;

export default function AnimalEditForm({
  animal,
  properties,
}: {
  animal: {
    id: string;
    ear_tag: string;
    breed: string | null;
    sex: "male" | "female";
    property_id: string;
    birth_date: string | null; // ISO ou null
  };
  properties: Property[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [erros, setErros] = useState<Erros>({});
  const [foco, setFoco] = useState<Campo | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const [earTag, setEarTag] = useState(animal.ear_tag);
  const [breed, setBreed] = useState(animal.breed ?? "");
  const [sex, setSex] = useState<"male" | "female">(animal.sex);
  const [propertyId, setPropertyId] = useState(animal.property_id);
  const [birthDate, setBirthDate] = useState(
    animal.birth_date ? animal.birth_date.slice(0, 10) : "",
  );

  function reprovar(novos: Erros) {
    setErros(novos);
    setFoco(primeiroInvalido(novos, ORDEM));
    setTentativa((n) => n + 1);
  }

  async function submit() {
    const novos: Erros = {};
    if (!earTag) novos.ear_tag = "Informe o brinco.";
    if (!breed) novos.breed = "Informe a raça.";
    if (Object.keys(novos).length > 0) {
      reprovar(novos);
      return;
    }

    setLoading(true);
    setErros({});
    setError(null);
    const res = await apiPatch(`/api/v1/animals/${animal.id}`, {
      ear_tag: earTag,
      breed,
      sex,
      property_id: propertyId,
      birth_date: birthDate ? new Date(birthDate).toISOString() : null,
    });
    setLoading(false);

    if (!res.ok) {
      const { erros: doServidor, global } = aplicarErroDoServidor(res, ORDEM);
      setError(global);
      reprovar(doServidor);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Editar
        </Button>
      }
      title="Editar animal"
      open={open}
      onOpenChange={setOpen}
      onSubmit={submit}
      submitLabel="Salvar alterações"
      pending={loading}
      error={error}
      focarCampoId={foco}
      tentativa={tentativa}
    >
      <Field label="Brinco" required id="ear_tag" error={erros.ear_tag}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={earTag} onChange={(e) => setEarTag(e.target.value)} />
        )}
      </Field>

      <Field label="Raça" required id="breed" error={erros.breed}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={breed} onChange={(e) => setBreed(e.target.value)} />
        )}
      </Field>

      <Field label="Sexo" required id="sex" error={erros.sex}>
        {({ id, ...aria }) => (
          <Select value={sex} onValueChange={(v) => setSex(v as "male" | "female")}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Macho</SelectItem>
              <SelectItem value="female">Fêmea</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Propriedade" required id="property_id" error={erros.property_id}>
        {({ id, ...aria }) => (
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Data de nascimento" id="birth_date" error={erros.birth_date}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        )}
      </Field>
    </FormSheet>
  );
}
```

Três coisas mudaram além do invólucro, e vale saber por quê: o erro único
("Brinco e raça são obrigatórios") virou erro por campo; o `text-red-700`
solto desapareceu, porque agora quem pinta erro é o `Field`; e as chaves de
`ORDEM` usam o nome do campo **da API**, não o do estado React, para que o
`field` que o servidor devolve case sem tradutor no meio.

- [ ] **Passo 2: converter `movement-cancel.tsx` seguindo o mesmo molde**

Leia o arquivo, e aplique as mesmas cinco mudanças: `Sheet` vira `FormSheet`,
cada par `<Label>` mais controle vira `<Field>` com `id` estável, o erro único
vira `Erros` por campo, `ORDEM` usa os nomes da API, e o botão de salvar sai
do corpo (o `FormSheet` já traz o dele). Se o painel tiver um campo só, ainda
assim use `Erros`: a próxima pessoa vai acrescentar o segundo.

- [ ] **Passo 3: conferir**

Run: `npx tsc --noEmit`
Esperado: só o ruído conhecido.

Run: `npm run lint`
Esperado: limpo.

- [ ] **Passo 4: commit**

```bash
git add src/components/rebanho/animal-edit-form.tsx src/components/rebanho/movement-cancel.tsx
git commit -m "Rebanho: os dois paineis pequenos ganham form de verdade e erro por campo"
```

---

### Task 5: converter os dois painéis grandes do Rebanho

**Arquivos:**
- Modificar: `src/components/rebanho/movement-form.tsx` (364 linhas)
- Modificar: `src/components/rebanho/animal-actions.tsx` (240 linhas)

- [ ] **Passo 1: `movement-form.tsx`**

Mesmo molde da Task 4, com uma diferença que importa: este painel já usa
`MoneyInput`, e o valor lido por `lerValorDoCampo` continua igual. Não troque
a leitura de número por nada; a catraca do `npm run check` existe justamente
para isso.

Ao montar `ORDEM`, use a ordem em que os campos aparecem na tela, de cima para
baixo, e com o nome que a API espera (`movement_type`, `quantity`,
`from_category_id`, e assim por diante, conforme o corpo que este painel já
envia hoje).

Este é o painel que mais se beneficia do erro por campo: ele é o que recebe
"saldo insuficiente" do servidor, que é erro de **quantidade**, e hoje aparece
no rodapé.

- [ ] **Passo 2: `animal-actions.tsx`**

Este arquivo tem mais de um painel dentro. Converta um de cada vez e rode
`npx tsc --noEmit` entre eles: erro de tipo em arquivo grande é mais barato de
achar em pedaço pequeno.

- [ ] **Passo 3: conferir**

Run: `npx tsc --noEmit` e `npm run lint`
Esperado: limpo, fora o ruído conhecido.

- [ ] **Passo 4: commit**

```bash
git add src/components/rebanho/movement-form.tsx src/components/rebanho/animal-actions.tsx
git commit -m "Rebanho: movimentacao e acoes do animal com erro no campo certo"
```

---

### Task 6: os primitivos de leitura

Hoje o estado vazio do Rebanho é um parágrafo escrito à mão, e cada tela
resolve do seu jeito. Isso vira dois componentes, para o rollout depois ter o
que reusar.

**Arquivos:**
- Criar: `src/components/ui/empty-state.tsx`
- Criar: `src/components/ui/carregando.tsx`
- Modificar: `src/app/(dashboard)/rebanho/page.tsx:223` e `:275`

**Interfaces:**
- Produz: `<EmptyState titulo acao? children? />` e `<Carregando linhas? />`.

- [ ] **Passo 1: criar `empty-state.tsx`**

```tsx
import * as React from "react";

/**
 * Estado vazio.
 *
 * Existe porque "Nenhum animal registrado ainda." em cinza claro nao diz o que
 * fazer em seguida, e o produtor que abre a tela pela primeira vez ve
 * exatamente isso. Um vazio bom tem UMA saida obvia, e por isso `acao` fica
 * ao lado do texto e nao no fim da pagina.
 */
export function EmptyState({
  titulo,
  children,
  acao,
}: {
  titulo: string;
  /** Uma frase curta dizendo o que aparece aqui quando houver dado. */
  children?: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-borda-forte bg-superficie-afundada px-6 py-10 text-center">
      <p className="font-medium text-texto">{titulo}</p>
      {children && <p className="max-w-sm text-sm text-texto-secundario">{children}</p>}
      {acao}
    </div>
  );
}
```

- [ ] **Passo 2: criar `carregando.tsx`**

```tsx
/**
 * Espera com forma de lista.
 *
 * Barra girando no meio da tela nao diz quanto falta nem o que vem; um
 * esqueleto com a altura das linhas que vao chegar evita o salto de layout
 * quando o dado entra, que no celular joga o dedo do produtor no botao errado.
 */
export function Carregando({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Carregando">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-md bg-superficie-afundada" />
      ))}
    </div>
  );
}
```

- [ ] **Passo 3: usar os dois no Rebanho**

Em `src/app/(dashboard)/rebanho/page.tsx`, troque o parágrafo da linha 223 por
`<EmptyState>` com título "Nenhum animal registrado ainda" e uma frase dizendo
que o saldo aparece aqui assim que houver movimentação. Faça o mesmo na linha
275, para o histórico de movimentações.

A página é Server Component, então o `Carregando` entra via `loading.tsx` da
rota, não via estado. Crie
`src/app/(dashboard)/rebanho/loading.tsx` exportando um componente que
renderiza `<Carregando linhas={6} />`.

- [ ] **Passo 4: conferir e commitar**

Run: `npx tsc --noEmit` e `npm run lint`

```bash
git add src/components/ui/empty-state.tsx src/components/ui/carregando.tsx "src/app/(dashboard)/rebanho/"
git commit -m "Vazio e espera deixam de ser texto solto e viram primitivo"
```

---

### Task 7: a tabela em tela estreita

**Arquivos:**
- Modificar: `src/app/(dashboard)/rebanho/page.tsx` (a tabela de movimentações)
- Modificar: `src/components/ui/table.tsx`, se o invólucro couber lá

- [ ] **Passo 1: decidir onde o corte acontece**

Leia a tabela de movimentações do Rebanho e liste as colunas. Em tela de
celular, tabela larga faz uma de duas coisas: estoura a página no eixo
horizontal (e aí o produtor perde o menu) ou espreme a coluna até a data
quebrar em três linhas.

A regra deste projeto passa a ser: **a tabela rola dentro do próprio quadro**,
nunca a página. O invólucro é:

```tsx
<div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
  {/* a <table> existente, sem mudanca */}
</div>
```

O `-mx-4 px-4` existe para a rolagem começar na borda da tela e não parecer um
corte no meio do conteúdo.

- [ ] **Passo 2: aplicar e conferir no navegador**

Run: `npm run dev`
Abra `/rebanho` e reduza a janela a 360px de largura. Esperado: a página não
rola de lado; a tabela sim, dentro do quadro dela.

- [ ] **Passo 3: commit**

```bash
git add "src/app/(dashboard)/rebanho/page.tsx" src/components/ui/table.tsx
git commit -m "Tabela larga passa a rolar dentro do quadro, e nao a pagina"
```

---

### Task 8: a cor do Rebanho vira token

São 71 ocorrências em 8 arquivos. O mapa abaixo foi conferido contra os hex de
`globals.css`, e as quatro primeiras linhas são troca exata, mesmo valor:

| classe crua | token | observação |
|---|---|---|
| `text-gray-900` | `text-texto` | `#111827`, idêntico |
| `text-gray-600` | `text-texto-secundario` | `#4b5563`, idêntico |
| `text-gray-500` | `text-texto-discreto` | `#6b7280`, idêntico |
| `border-gray-200` | `border-borda` | `#e5e7eb`, idêntico |
| `text-gray-700` | `text-texto-secundario` | escurece de leve, melhora contraste |
| `border-gray-300` | `border-borda-forte` | `#d1d5db`, idêntico |
| `bg-gray-100` | `bg-superficie-afundada` | de cinza para o creme da marca |
| `text-red-700` | `text-perigo-tinta` | `#b91c1c`, idêntico |
| `bg-red-50` | `bg-perigo-suave` | |
| `text-green-700` | `text-sucesso-tinta` | |
| `bg-green-50` | `bg-sucesso-suave` | |

**Arquivos:** os 8 do Rebanho. Ache-os com:

```bash
grep -rlE "(text|bg|border)-(gray|slate|zinc|red|green|blue|yellow|amber|emerald)-[0-9]{2,3}" "src/app/(dashboard)/rebanho/" src/components/rebanho/
```

- [ ] **Passo 1: trocar, arquivo por arquivo**

Não use substituição cega em todos de uma vez. Para cada ocorrência que **não**
estiver na tabela acima, pare e decida: qual é o PAPEL daquela cor ali? Se
nenhum token servir, é sinal de que a cor está dizendo algo que o sistema de
design ainda não nomeia, e isso é uma pergunta para o usuário, não uma
invenção sua.

- [ ] **Passo 2: conferir que zerou**

```bash
grep -rcE "(text|bg|border)-(gray|slate|zinc|red|green|blue|yellow|amber|emerald)-[0-9]{2,3}" "src/app/(dashboard)/rebanho/" src/components/rebanho/
```

Esperado: 0 em todos os arquivos.

- [ ] **Passo 3: olhar no navegador antes de commitar**

Run: `npm run dev`, abra `/rebanho` e o detalhe de um animal. Compare com o
antes. Token trocado sem olhar já produziu texto invisível neste projeto.

- [ ] **Passo 4: commit**

```bash
git add "src/app/(dashboard)/rebanho/" src/components/rebanho/
git commit -m "Rebanho para de pintar com a paleta crua do Tailwind"
```

---

### Task 9: a catraca de cor no `npm run check`

Sem isto, o rollout é uma limpeza que volta a sujar. O molde é o item 7 do
`check-repo.ts` (o de `type="number"`): uma linha de base que **só pode
encolher**.

**Arquivos:**
- Criar: `scripts/baseline-cor-crua.json`
- Modificar: `scripts/check-repo.ts` (novo item 8, e a chamada em `main()`)

- [ ] **Passo 1: gerar a linha de base**

Com o Rebanho já limpo (Task 8), gere a lista dos arquivos que ainda pintam
cru, fora da `/plataforma`, que está fora por decisão registrada no commit
`638d0f6`:

```bash
grep -rlE "(text|bg|border)-(gray|slate|zinc|red|green|blue|yellow|amber|emerald)-[0-9]{2,3}" src/ | grep -v plataforma | sort
```

Escreva o resultado como um array JSON em `scripts/baseline-cor-crua.json`,
usando a ferramenta Write (nunca heredoc). Esperado: cerca de 123 caminhos.

- [ ] **Passo 2: escrever o verificador**

Em `scripts/check-repo.ts`, antes de `main()`:

```ts
// ------------------------------------------------- 8. cor crua do Tailwind
/**
 * A paleta semantica existe desde o `638d0f6`, mas o produto continua pintando
 * com a paleta crua do Tailwind. Medido em 2026-08-27: 966 ocorrencias em 131
 * arquivos fora da `/plataforma`.
 *
 * Isso importa alem do estilo: o `check-contraste.ts` confere os 25 pares de
 * token do `globals.css` e NAO enxerga `text-gray-500`. Foi um cinza desses,
 * a 2,85:1, que a medicao de 20/08 reprovou. A catraca protegia a paleta que
 * quase ninguem usava.
 *
 * A linha de base em `baseline-cor-crua.json` so pode ENCOLHER. Arquivo novo
 * com cor crua reprova; arquivo da base que ficou limpo aparece como aviso
 * para sair da lista.
 *
 * A `/plataforma` fica de fora: aquele painel tem casca escura, e la o cinza
 * claro e a escolha certa. Mesma excecao do `638d0f6`.
 */
const COR_CRUA = /(text|bg|border)-(gray|slate|zinc|red|green|blue|yellow|amber|emerald)-[0-9]{2,3}/;

function conferirCorCrua() {
  console.log("\n8. Cor crua do Tailwind (tokens semanticos)");

  const base = new Set<string>(
    JSON.parse(readFileSync(join(RAIZ, "scripts", "baseline-cor-crua.json"), "utf8")),
  );
  const ofensores: string[] = [];
  const limpos: string[] = [];

  for (const rel of versionados()) {
    if (!rel.startsWith("src/") || !rel.endsWith(".tsx")) continue;
    if (rel.includes("plataforma")) continue;
    const full = join(RAIZ, rel);
    if (!existsSync(full)) continue;
    const tem = COR_CRUA.test(readFileSync(full, "utf8"));

    if (base.has(rel)) {
      if (!tem) limpos.push(rel);
      continue;
    }
    if (tem) ofensores.push(rel);
  }

  check(
    "nenhuma tela nova pintando com a paleta crua",
    ofensores.length === 0,
    ofensores.length > 0
      ? `use os tokens de globals.css:\n       ${ofensores.slice(0, 12).join("\n       ")}`
      : undefined,
  );

  if (limpos.length > 0) {
    console.log(
      `  ℹ️  ja sem cor crua, remova de baseline-cor-crua.json (${limpos.length}): ${limpos.slice(0, 6).join(", ")}`,
    );
  }
}
```

E em `main()`, depois de `conferirCamposNumericos();`:

```ts
  conferirCorCrua();
```

- [ ] **Passo 3: provar que a catraca morde**

Acrescente `text-gray-500` a qualquer classe de um arquivo do Rebanho (que
acabou de sair da base), rode `npm run check` e confirme que ele **reprova**
citando o arquivo. Depois desfaça a mudança e rode de novo, esperando 0
falhas. Catraca que ninguém viu morder é catraca que talvez não morda.

- [ ] **Passo 4: commit**

```bash
git add scripts/check-repo.ts scripts/baseline-cor-crua.json
git commit -m "A cor crua ganha catraca, com linha de base que so encolhe"
```

---

### Task 10: validação ao vivo e fechamento

O invariante 8 é explícito: suíte verde não é validação. Nenhuma tarefa acima
provou que o produtor consegue usar a tela.

- [ ] **Passo 1: subir e validar no navegador**

Run: `npm run dev`

Com `DATABASE_URL` apontando para o Docker local, nunca para o `.env`:

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run dev
```

Confira, em `/rebanho`, com a janela em 360px:

1. Abrir o painel de movimentação, tocar em salvar vazio: o foco vai para o
   primeiro campo errado e a tela rola até ele.
2. Errar de novo o mesmo campo: o foco volta para ele (é o `tentativa`).
3. Pedir uma saída maior que o saldo: a mensagem de saldo insuficiente aparece
   **no campo de quantidade**, não no rodapé.
4. Com o teclado do celular aberto, tocar em "Ir": o formulário envia.
5. A lista vazia mostra o `EmptyState`, não o parágrafo cinza.
6. A tabela rola dentro do quadro, e a página não rola de lado.

- [ ] **Passo 2: rodar a rede de segurança inteira**

```bash
npm run check
npm run test:m46
npm run test:m40
npm run test:docs-api
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:herd
```

- [ ] **Passo 3: atualizar os documentos**

1. Em `docs/superpowers/specs/2026-08-27-sequencia-para-fechar-os-modulos-design.md`,
   corrigir a numeração de suíte: o piloto ficou com o `m46`, então a fase 2 é
   `m47`, o leilão `m48` e a permuta `m49`.
2. No mesmo documento, registrar que o envelope ganhou `field`.
3. Atualizar `docs/agents/current-handoff.md` com o estado da frente 1: o que
   entrou, o que foi validado no navegador, e o próximo passo.

- [ ] **Passo 4: commit e parar**

```bash
git add docs/
git commit -m "Frente 1 validada no navegador, e a numeracao de suite corrigida"
```

**Pare aqui.** Merge na `main` exige autorização explícita do usuário, a cada
vez, e a frente 2 não começa sem aprovação da 1.

---

## Auto-revisão

**Cobertura da spec.** As três camadas da frente 1 têm tarefa: cor (8 e 9),
escrita (1 a 5), leitura (6 e 7). A catraca pedida está na 9. O recorte que a
spec exclui, o painel de totais do Rebanho, não aparece em nenhuma tarefa, o
que está certo.

**Tipos.** `primeiroInvalido` e `aplicarErroDoServidor` são definidos na Task 2
e usados com a mesma assinatura nas Tasks 4 e 5. `focarCampoId` e `tentativa`
são definidos na Task 3 e usados nas mesmas duas. `apiError` com quarto
argumento nasce na Task 1 e é o que faz o caso 3 da Task 10 funcionar.

**Lacuna conhecida, registrada de propósito:** nenhuma rota do Rebanho passa a
mandar `field` neste plano. A Task 1 abre o caminho e a Task 10 valida com o
erro de saldo insuficiente, que exige uma linha na action correspondente. Se
ao chegar na Task 10 o erro ainda cair no rodapé, a correção é acrescentar o
`field` naquela chamada de `apiError`, e isso é trabalho de minutos, não uma
tarefa nova.
