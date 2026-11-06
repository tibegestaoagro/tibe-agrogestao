# Empório, Frente 2: a escolha do cliente e do fornecedor. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Pré-requisito:** o plano 1 (`docs/superpowers/plans/2026-11-06-emporio-frente1-clientes-e-fornecedores.md`) **concluído**, com as duas migrações dele aplicadas no Docker. Este plano parte do estado que ele deixa e usa os nomes do bloco "Interfaces que os planos 2 e 3 usam" de lá, sem renomear nada.

**Goal:** No lugar da lista de seleção, o cliente (Venda, Orçamento, Troca) e o fornecedor (Compra) passam a ser escolhidos por dois botões e uma janela com busca no servidor, por nome sem acento, por pedaço do CPF/CNPJ e por pedaço do telefone sem DDD e sem DDI; as telas Clientes e Fornecedores passam a buscar do mesmo jeito.

**Architecture:** Uma regra pura lê o termo digitado (nome, dígitos ou poucos dígitos) e monta o filtro; uma coluna gerada `phone_busca` guarda o número local do telefone (sem DDI, sem DDD, sem máscara), calculado no banco por uma função SQL espelhada em TypeScript. Duas actions de busca (cliente e fornecedor) com rota fina devolvem uma página curta com a última compra de cada um. Na tela, um gancho de busca e uma janela genérica servem aos dois componentes de escolha, `EscolherCliente` e `EscolherFornecedor`.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Postgres 17, Zod 4, Tailwind, Radix Dialog (o `Sheet` do kit).

**Spec:** `docs/superpowers/specs/2026-11-06-emporio-clientes-fornecedores-romaneio-design.md`, seção "Frente 2: a escolha do cliente e do fornecedor" (mais "Como entregar", itens da Frente 2). Spec do módulo: `docs/specs/module-39-meu-emporio.md`; as decisões desta frente entram na próxima livre da tabela (pelo plano 1, a **Q199**).

## Interfaces que o plano 3 usa

O plano 3 (pedido para entrega e romaneio) depende destes nomes. Não os mude sem atualizar este bloco.

**Tipo do cliente escolhido (`src/lib/emporio/cliente-escolhido.ts`, Task 3):**

```ts
export type ClienteEscolhido = Omit<Required<ClienteParaConferir>, "name"> & {
  id: string; name: string; incomplete: boolean; fixed: boolean;
};
export type ClienteDaBusca = ClienteEscolhido & { ultima_compra: { em: string; valor: number } | null };
export function clienteEscolhidoDe(v: ClienteView): ClienteEscolhido;
export function consumidorFinalEscolhido(cf: { id: string; name: string }): ClienteEscolhido; // fixed: true, system_key "consumidor_final", o resto nulo
```

`ClienteEscolhido` é, por estrutura, um `ClienteParaConferir` (plano 1): o plano 3 chama `faltaParaEntrega(escolhido, endereco)` direto sobre ele. **Exceção:** o cliente que vem da carga de um orçamento no balcão tem só `id`, `name`, `phone` e `document` (o resto nulo); quem precisar do endereço busca o completo por `GET /api/v1/emporio/customers/search?id=<id>`.

**Componente (`src/app/(dashboard)/emporio/_components/escolher-cliente.tsx`, Task 5):**

```ts
export function EscolherCliente(props: {
  campo: CampoDoField;                       // o que o <Field> passa ao filho: id e aria
  consumidorFinal: { id: string; name: string };
  valor: ClienteEscolhido | null;
  onEscolher: (c: ClienteEscolhido) => void; // também chamado depois de "Completar cadastro" e de "Cadastrar novo"
  permitirCadastro?: boolean;                // padrão true
  aviso?: Falta | null;                      // GANCHO DO PLANO 3: mostrado no quadro, com "Completar cadastro"
}): JSX.Element;
```

Com `aviso`, o quadro do cliente escolhido mostra `aviso.message` e o botão "Completar cadastro", que abre o `ClienteForm` em modo `completar` com `faltaInicial={aviso}`. No Consumidor final o aviso aparece sem o botão (não há o que completar: é trocar de cliente). Neste plano ninguém passa `aviso`.

**Formulário do cliente (`cliente-form.tsx`, acréscimos da Task 5):** `open?: boolean`, `onOpenChange?: (a: boolean) => void` (controlado quando vêm), `inicial?: { name?: string; phone?: string }` (só no `novo`), `faltaInicial?: Falta | null` (só no `completar`: a mensagem aparece embaixo do campo `faltaInicial.field`, se ele estiver no `ORDEM` do formulário, e o foco vai para ele), `onSalvo: (c: ClienteView) => void`.

**Busca (Task 3):** `buscarClientesAction(db, ator, f: { q?: string; id?: string; pagina?: number; por_pagina?: number }): Promise<ActionResult<ResultadoDaBusca<ClienteDaBusca>>>` e `GET /api/v1/emporio/customers/search?q=&id=&page=&per_page=`.

**Roteiros (`scripts/navegador/_lib.py`, Task 5):** `escolher_cliente(nome, busca=None)`, `escolher_fornecedor(nome, busca=None)` (Task 6), `escolhido(tipo="cliente")`.

**Numeração:** esta frente usa a suíte `test:m96`; o plano 3 usa a seguinte livre (`test:m97`). Decisões: Q199 em diante aqui; o plano 3 continua da próxima livre quando for executado.

## Global Constraints

- **As oito invariantes do `CLAUDE.md`.** Em especial: nunca travessão (U+2014); nada de heredoc para escrever arquivo (SQL inclusive: use Write/Edit); regra de negócio em `src/lib/actions`, rota fina; migração antes do push; nenhuma query de negócio fora do client escopado (a busca usa `db.emporioCustomer`/`db.emporioSupplier`, nunca `$queryRaw` com `tenant_id` à mão).
- **Banco de produção:** o `.env` aponta para o Neon. Toda suíte, `migrate diff`, `db:deploy` e cenário levam as URLs do Docker inline:
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m96`
  **Nada é aplicado no Neon**, salvo o passo parado da Task 8, com autorização do usuário na conversa.
- **Ordem action, rota, tela.** Rota nova ou mudada documentada em `src/app/(public)/docs/api/endpoints.ts` (`npm run test:docs-api`).
- **Textos fixados pela spec, literais:** "Escolher cliente", "Cadastrar novo cliente", "Não achou? Cadastrar novo", "Trocar", "sem CPF/CNPJ"; no fornecedor, "Escolher fornecedor" e "Cadastrar novo fornecedor". O Consumidor final é marcado "Cliente padrão", com o aviso `Não vale para fiado, cheque nem entrega.`
- **A busca por dígitos começa com 3 dígitos.** Com 1 ou 2, a resposta vem vazia com `poucos_digitos: true`, e a tela diz `Digite pelo menos 3 números para buscar por CPF/CNPJ ou telefone.`
- **Permissão** (`exigir` de `src/lib/emporio/papel.ts`): buscar cliente, `vendedor_da_loja`; buscar fornecedor, `fora_do_caixa` (as mesmas de listar, no plano 1). Leitura: nada entra no Histórico (conferência 19 é só de escrita).
- **Kit e `npm run check` (19 conferências):** a janela é o `Sheet` de `src/components/ui/sheet.tsx`; selos com `Badge`; nenhuma cor crua, nenhum `<input type="number">`; o `id` do `<Field>` do cliente é `customer_id` e o do fornecedor `supplier_id`, com `error=` (conferência 15); dinheiro por `reaisBr` (`src/lib/numero-br.ts`); data `dd/mm/aaaa` com `timeZone: "America/Sao_Paulo"`, como em `src/app/(dashboard)/emporio/vendas/page.tsx:23`.
- **Migração local:** `migrate diff` com a URL do Docker inline, SQL salvo à mão, `db:deploy` com a URL inline; tirar do SQL os `DROP INDEX` de `WhatsAppProviderConfig_one_active` e `AnimalBatch_tenant_ear_tag_key`; colunas geradas escritas à mão (padrão de `prisma/migrations/20261008120000_busca_sem_acento/migration.sql`).
- **Arquivo novo só conta no `npm run check` depois de `git add -N`.**
- **Subagente não commita:** deixa no working tree e relata os arquivos; a sessão principal commita, uma tarefa por vez.
- **Celular:** toda tela mexida é vista a 390 px, sem rolagem horizontal da página.

### Valores fixados por este plano (o que a spec deixou ao builder)

| o quê | valor |
|---|---|
| termo com letra | busca por nome: `name_busca contains normalizarTermo(q)`. Se o termo, sem espaço, tem letra **e** dígito e 3 ou mais caracteres, também `document contains normalizarCnpj(q)` (CNPJ alfanumérico) |
| termo sem letra | `digitos = q` só com os dígitos. Menos de 3: `poucos_digitos`. 3 ou mais: `document contains digitos` OU `phone_busca contains telefoneLocal(digitos)` quando `digitos` tem 10 ou mais, senão `phone_busca contains digitos` |
| termo vazio (ou só espaço e pontuação sem dígito) | sem filtro de texto: a lista por nome, paginada |
| número local (`telefoneLocal`) | só dígitos; tira zeros à esquerda; se sobram 12 ou 13 e começa com `55`, tira os 2 (DDI); se sobram 10 ou 11, tira os 2 (DDD); devolve o resto (nulo se vazio). Qualquer outro tamanho fica com todos os dígitos, para a busca por pedaço não perder ninguém |
| resultado | só ativos (`archived_at` nulo); cliente sem `system_key` (o Consumidor final fica fora da busca por texto e é fixado no topo pela tela); ordem `name_busca`, depois `id`; `por_pagina` padrão 20, máximo 50; `pagina` inválida vira 1 |
| busca por `id` | ignora `q`; devolve 0 ou 1 item ativo, inclusive o Consumidor final (`fixed: true`) |
| última compra do cliente | a venda `concluida` mais recente dele nas lojas que o ator enxerga (`lojasDoAtor`; nulo = todas): `em` = `sold_at`, `valor` = `net_amount`. Duas consultas para a página inteira (`groupBy` com `_max.sold_at`, depois as vendas desses pares), nunca uma por linha |
| última compra do fornecedor | a compra não cancelada mais recente dele nas lojas do ator: `em` = `purchased_at`, `valor` = soma dos `item_total` + `freight` (a conta do `total` de `emporio-compras.ts`) |
| telefone formatado (`formatarTelefone`) | pelos dígitos sem DDI: 11 `(34) 99876-1234`; 10 `(34) 3333-5678`; 9 `99876-1234`; 8 `3333-5678`; outro tamanho, o texto como foi gravado; nulo `sem telefone` |
| escolha inicial | Venda e Orçamento abrem sem cliente (como hoje); Troca abre com o cliente da venda de origem, se ativo; Compra abre sem fornecedor, e o fornecedor continua opcional ("Tirar fornecedor") |
| tela Clientes e Fornecedores | `listarClientesAction` e `listarFornecedoresAction` passam a filtrar pela mesma regra do termo (a ordem e o resto do plano 1 não mudam) e devolvem `poucos_digitos`; a rota leva para `meta.poucos_digitos` |
| painel dentro de painel | o `FormSheet` ignora o submit que sobe de um formulário filho (`e.target !== e.currentTarget`), como o balcão já faz (`balcao.tsx`, "O painel de Cliente novo é filho desta árvore"). É o que libera "Cadastrar novo cliente" dentro da Troca e "Cadastrar novo fornecedor" dentro da Compra |
| corrida na digitação | espera de 300 ms depois da última tecla; cada pedido leva um número, e só a resposta do último número entra na lista |

## Review Focus

1. **Telefone gravado em qualquer formato** (`+55 (34) 99876-1234`, `5534998761234`, `034 99876-1234`, `(55) 99876-1234` com DDD 55 do RS e sem DDI, `34 3333-5678` fixo, `998761234` sem DDD): o cliente é achado pelos 4 primeiros, pelos 4 últimos e pelo meio do número local, e quem tem só o DDI 55 não aparece quando se digita `553`. Testes nas Tasks 2 e 3.
2. **O que o balcão digita:** o número inteiro com DDD (`34998761234`), com `+55`, com máscara (`99876-1234`, `(34) 9987`) e o CPF com máscara (`529.982`): acha. Testes nas Tasks 1 e 3.
3. **Painel dentro de painel:** "Cadastrar novo cliente" dentro da Troca e "Cadastrar novo fornecedor" dentro da Compra salvam o cadastro, voltam com ele escolhido e **não** enviam a troca nem a compra. Prova nos roteiros das Tasks 5 e 6.
4. **Digitação rápida:** respostas fora de ordem não trocam a lista pela de um texto antigo, e "Carregar mais" depois de mudar o texto não mistura páginas de termos diferentes. Prova no roteiro da Task 7 (digitação sem pausa).
5. **Curinga no termo:** `_é` ou `a%` não viram "acha tudo"; termo só de pontuação (`...`, `-`) não filtra por nada estranho. Teste na Task 3.

---

## Estrutura de arquivos

| arquivo | responsabilidade |
|---|---|
| `src/lib/emporio/telefone.ts` (novo) | `telefoneLocal`, `formatarTelefone`: puras, servidor e tela |
| `src/lib/emporio/busca-de-cadastro.ts` (novo) | `lerTermo`, `ondeBuscaCliente`, `ondeBuscaFornecedor`, `ResultadoDaBusca` |
| `src/lib/emporio/cliente-escolhido.ts` (novo) | os tipos do cliente escolhido e os dois montadores |
| `prisma/migrations/20261107090000_emporio_busca_por_telefone/migration.sql` (novo) | `telefone_local()` e as colunas `phone_busca` |
| `src/lib/actions/emporio-clientes.ts`, `emporio-fornecedores.ts` | as buscas, e a lista do plano 1 com a regra do termo |
| `src/app/api/v1/emporio/customers/search/route.ts`, `suppliers/search/route.ts` (novos) | rotas finas |
| `src/app/(dashboard)/emporio/_components/busca-no-servidor.ts` (novo) | o gancho: espera, numeração dos pedidos, páginas |
| `src/app/(dashboard)/emporio/_components/janela-de-escolha.tsx` (novo) | a janela genérica (campo, lista, estados, "Carregar mais", rodapé) |
| `src/app/(dashboard)/emporio/_components/escolher-cliente.tsx`, `escolher-fornecedor.tsx` (novos) | botões, janela e quadro de cada um |
| `scripts/m96-emporio-escolha-do-cliente.test.ts` (novo) | a suíte da frente |
| `scripts/_cenario-emporio-escolha.ts`, `scripts/navegador/emporio-escolha.py` (novos) | o cenário e o roteiro vivo |

---

### Task 1: A regra pura do termo e do telefone

**Files:**
- Create: `src/lib/emporio/telefone.ts`, `src/lib/emporio/busca-de-cadastro.ts`
- Create: `scripts/m96-emporio-escolha-do-cliente.test.ts` (seção 1, sem banco; esqueleto com `check`, `comBanco` e `limpar` copiados da `m95`, na mesma ordem de limpeza; texto impresso `M96: Módulo 39 (Meu Empório), Frente 2: a escolha do cliente e do fornecedor`)
- Modify: `package.json` (`"test:m96": "tsx scripts/m96-emporio-escolha-do-cliente.test.ts"`)

**Interfaces:**
- Consumes: `normalizarTermo` (`src/lib/actions/whatsapp-handlers/shared.ts`), `normalizarCnpj` (`src/lib/contatos/cadastro.ts`), `Prisma` de `@prisma/client` (ou o caminho que `src/lib/prisma.ts` usa).
- Produces:

```ts
export function telefoneLocal(texto: string | null | undefined): string | null;
export function formatarTelefone(texto: string | null | undefined): string;
export type TermoDeBusca =
  | { modo: "vazio" }
  | { modo: "poucos_digitos" }
  | { modo: "digitos"; digitos: string; telefone: string }
  | { modo: "nome"; nome: string; documento: string | null };
export function lerTermo(q: string | null | undefined): TermoDeBusca;
export function ondeBuscaCliente(t: TermoDeBusca): Prisma.EmporioCustomerWhereInput; // {} em "vazio"; não chamar em "poucos_digitos"
export function ondeBuscaFornecedor(t: TermoDeBusca): Prisma.EmporioSupplierWhereInput;
export type ResultadoDaBusca<T> = { itens: T[]; total: number; pagina: number; por_pagina: number; poucos_digitos: boolean };
```

- [ ] **Step 1: Escrever a seção 1 da m96 (falhando).** Casos:
  - `telefoneLocal`: `"+55 (34) 99876-1234"` e `"5534998761234"` e `"034 99876-1234"` e `"34998761234"` e `"998761234"` dão `"998761234"`; `"(55) 99876-1234"` dá `"998761234"` (DDD 55, 11 dígitos, não é DDI); `"5555998761234"` dá `"998761234"`; `"34 3333-5678"` e `"553433335678"` dão `"33335678"`; `"0 15 34 99876 1234"` (código de operadora: sem o zero sobram 13 dígitos que não começam com 55) dá `"1534998761234"`, todos os dígitos sem o zero; `""`, `"abc"` e `null` dão `null`;
  - `formatarTelefone`: `"+55 (34) 99876-1234"` dá `"(34) 99876-1234"`; `"3433335678"` dá `"(34) 3333-5678"`; `"998761234"` dá `"99876-1234"`; `"ramal 12"` dá `"ramal 12"`; `null` dá `"sem telefone"`;
  - `lerTermo`: `"  "` e `"..."` dão `vazio`; `"12"` e `"(3"` dão `poucos_digitos`; `"1234"` dá `{ modo: "digitos", digitos: "1234", telefone: "1234" }`; `"+55 34 99876-1234"` dá `telefone: "998761234"` e `digitos: "5534998761234"`; `"529.982"` dá `digitos: "529982"`; `"Zé  da Ponte"` dá `{ modo: "nome", nome: "ze da ponte", documento: null }`; `"12AB34"` dá `nome: "12ab34"` e `documento: "12AB34"`; `"Maria 12"` dá `documento: null` (tem espaço);
  - `ondeBuscaCliente({ modo: "vazio" })` é `{}`; no modo `digitos`, um `OR` com `document` e `phone_busca`.
- [ ] **Step 2:** `test:m96` e ver falhar por falta dos módulos.
- [ ] **Step 3:** implementar os dois arquivos pela tabela "Valores fixados". Os dois são puros (nada de import de servidor), porque a tela também os usa.
- [ ] **Step 4:** `test:m96`, `npx tsc --noEmit`, `npm run check` (com `git add -N`): verdes.
- [ ] **Step 5:** relatar os arquivos (commit: `Empório: a regra pura da busca de cliente, por nome, documento e telefone sem DDD`).

### Task 2: A coluna do número local

**Files:**
- Modify: `prisma/schema.prisma` (`EmporioCustomer.phone_busca` e `EmporioSupplier.phone_busca`: `String? @default(dbgenerated("telefone_local(phone)"))`, com o comentário `/// Coluna GERADA pelo Postgres: ver ServiceClient.name_busca.`)
- Create: `prisma/migrations/20261107090000_emporio_busca_por_telefone/migration.sql`
- Test: `scripts/m96-emporio-escolha-do-cliente.test.ts` (seção 2)

**Interfaces:**
- Consumes: `telefoneLocal` (Task 1).
- Produces: `phone_busca` lido pelas Tasks 3 e 4.

O SQL, escrito à mão com Write (a regex é `[^0-9]`, sem barra invertida):

```sql
SET lock_timeout = '5s';
-- A regra é a MESMA de telefoneLocal (src/lib/emporio/telefone.ts), passo a passo.
CREATE OR REPLACE FUNCTION telefone_local(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$
    SELECT NULLIF(CASE WHEN length(d2) IN (10, 11) THEN substr(d2, 3) ELSE d2 END, '')
    FROM (
      SELECT CASE WHEN length(d) IN (12, 13) AND left(d, 2) = '55' THEN substr(d, 3) ELSE d END AS d2
      FROM (SELECT ltrim(regexp_replace(texto, '[^0-9]', '', 'g'), '0') AS d) a
    ) b
  $$;
ALTER TABLE "EmporioCustomer" ADD COLUMN "phone_busca" TEXT GENERATED ALWAYS AS (telefone_local("phone")) STORED;
ALTER TABLE "EmporioSupplier" ADD COLUMN "phone_busca" TEXT GENERATED ALWAYS AS (telefone_local("phone")) STORED;
```

- [ ] **Step 1: seção 2 da m96 (falhando):**
  - **paridade:** para cada telefone da lista da seção 1, `SELECT telefone_local($1)` (pelo `$queryRaw` do client de teste, sem tabela) é igual a `telefoneLocal(...)`;
  - um `EmporioCustomer` criado com `phone: "+55 (34) 99876-1234"` lê `phone_busca` `"998761234"`; editado para `"34 3333-5678"`, lê `"33335678"`; com `phone` nulo, `phone_busca` nulo;
  - o mesmo para `EmporioSupplier`.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** schema e migração; aplicar no Docker com a URL inline.
- [ ] **Step 4:** `test:m96`, `npx tsx scripts/ci-migration-drift.ts` com a URL inline (sem drift), `test:isolation`, `tsc`, `check`: verdes.
- [ ] **Step 5:** relatar os arquivos (commit: `Empório: o número local do telefone guardado para a busca`).

### Task 3: A busca de clientes (action, rota, lista do plano 1)

**Files:**
- Create: `src/lib/emporio/cliente-escolhido.ts`
- Modify: `src/lib/actions/emporio-clientes.ts` (`buscarClientesAction`; `listarClientesAction` com `lerTermo`/`ondeBuscaCliente` e `poucos_digitos`)
- Create: `src/app/api/v1/emporio/customers/search/route.ts` (GET, `guardEmporio("read")`, `apiOk(itens, { total, page, per_page, poucos_digitos })`)
- Modify: `src/app/api/v1/emporio/customers/route.ts` (GET leva `poucos_digitos` para o `meta`), `src/app/(public)/docs/api/endpoints.ts` (a rota nova, e na lista `q` passa a dizer "nome, CPF/CNPJ ou telefone")
- Test: `scripts/m96-emporio-escolha-do-cliente.test.ts` (seção 3)

**Interfaces:**
- Consumes: `lerTermo`, `ondeBuscaCliente`, `ResultadoDaBusca` (Task 1); `phone_busca` (Task 2); do plano 1, `ClienteView`, `ClienteParaConferir`, `faltaNoCadastro`, `ehConsumidorFinal`, `lojasDoAtor`, `exigir`.
- Produces: os tipos e montadores de `cliente-escolhido.ts` e `buscarClientesAction` do bloco do plano 3; a rota `GET /api/v1/emporio/customers/search`.

- [ ] **Step 1: seção 3 da m96 (falhando).** Cenário: tenant A com loja 1 e loja 2, um Vendedor só da loja 1; clientes "Maria Souza" (`+55 (34) 99876-1234`, CPF `529.982.247-25`), "Maria Sousa" (`34 3333-5678`, sem documento), "João da Ponte" (`998761111`), "Zé Carlos" (`(55) 99123-4567`), um PJ com CNPJ alfanumérico, um arquivado "Maria Arquivada"; tenant B com "Maria de Outra Conta" e o mesmo telefone da Maria Souza. Casos:
  - `q: "maria"` acha as duas Marias de A, nesta ordem, sem a arquivada, sem o Consumidor final, sem a de B; `q: "joao"` acha "João da Ponte"; `q: "PONTE"` também;
  - `q: "1234"` (4 últimos) e `q: "9987"` (4 primeiros) e `q: "8761"` (o meio, atravessando o hífen da máscara) acham a Maria Souza; `q: "3333"` acha a Maria Sousa; **Review Focus 1:** `q: "553"` não acha a Maria Souza (o 55 dela é DDI); `q: "9912"` acha o Zé (DDD 55);
  - **Review Focus 2:** `q: "34998761234"`, `q: "+55 34 99876-1234"`, `q: "99876-1234"` e `q: "(34) 9987"` acham a Maria Souza; `q: "529.982"` e `q: "247"` acham pelo CPF; um pedaço com letra do CNPJ alfanumérico acha o PJ;
  - `q: "12"`: `itens` vazio, `poucos_digitos: true`; a rota devolve `meta.poucos_digitos: true`;
  - **Review Focus 5:** cliente "Zé Carlos" e `q: "_é"`: nada; `q: "a%"`: só quem tem `a%` no nome (nenhum); `q: "..."`: lista sem filtro de texto (modo vazio). Se o Prisma já escapa `%` e `_` no `contains`, o teste passa sem código novo; senão, escapar no `ondeBusca*` (Task 1) e voltar lá com o caso;
  - `por_pagina: 2` com `q: ""`: 2 itens, `total` certo, `pagina: 1`; `pagina: 2` traz os seguintes; `por_pagina: 500` vira 50;
  - `id` do Consumidor final: 1 item com `fixed: true`; `id` de cliente de B: 0 itens; `id` do arquivado: 0 itens;
  - **última compra:** Maria Souza com uma venda concluída antiga (R$ 50,00), uma cancelada mais nova e uma concluída na loja 2 (R$ 80,00, a mais nova de todas): o Dono vê `{ em: <sold_at da loja 2>, valor: 80 }`; o Vendedor da loja 1 vê a de R$ 50,00; "João da Ponte" sem venda: `null`;
  - cada item traz `incomplete` (cliente migrado só com nome: `true`) e os campos de endereço;
  - quem não tem papel no Empório: 403; o Caixa: ok;
  - `listarClientesAction({ q: "1234" })` acha a Maria Souza (a tela Clientes busca igual) e `q: "12"` devolve `poucos_digitos: true`.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** `cliente-escolhido.ts` e `buscarClientesAction`: `exigir(db, ator, "vendedor_da_loja")`; `poucos_digitos` volta sem consulta; `findMany` + `count` com `{ archived_at: null, system_key: null, ...ondeBuscaCliente(t) }`; a última compra pela regra da tabela; o item montado por `clienteEscolhidoDe` mais `ultima_compra`.
- [ ] **Step 4:** a rota (parâmetros inválidos viram o padrão), a lista do plano 1, `endpoints.ts`.
- [ ] **Step 5:** `test:m96`, `test:m95`, `test:isolation`, `test:docs-api`, `tsc`, `check`: verdes.
- [ ] **Step 6:** relatar os arquivos (commit: `Empório: a busca de clientes no servidor, com a última compra de cada um`).

### Task 4: A busca de fornecedores

**Files:**
- Modify: `src/lib/actions/emporio-fornecedores.ts` (`buscarFornecedoresAction`; `listarFornecedoresAction` com a regra do termo e `poucos_digitos`)
- Create: `src/app/api/v1/emporio/suppliers/search/route.ts`
- Modify: `src/app/api/v1/emporio/suppliers/route.ts` (`meta.poucos_digitos`), `src/app/(public)/docs/api/endpoints.ts`
- Test: `scripts/m96-emporio-escolha-do-cliente.test.ts` (seção 4)

**Interfaces:**
- Consumes: `lerTermo`, `ondeBuscaFornecedor`, `ResultadoDaBusca` (Task 1); `FornecedorView` (plano 1).
- Produces:

```ts
export type FornecedorEscolhido = Pick<FornecedorView, "id" | "kind" | "property_id" | "name" | "person_kind" | "document" | "phone">;
export type FornecedorDaBusca = FornecedorEscolhido & { ultima_compra: { em: string; valor: number } | null };
buscarFornecedoresAction(db, ator, f: { q?: string; id?: string; pagina?: number; por_pagina?: number }):
  Promise<ActionResult<ResultadoDaBusca<FornecedorDaBusca>>>
// GET /api/v1/emporio/suppliers/search?q=&id=&page=&per_page=
```

- [ ] **Step 1: seção 4 da m96 (falhando):**
  - fornecedor de fora "Agropecuária Central" (`(34) 3222-0000`, CNPJ) e fornecedor de propriedade da "Fazenda Boa Vista": `q: "agropecuaria"` acha o de fora; `q: "boa vista"` acha o de propriedade com `kind: "propriedade"` e `name` "Fazenda Boa Vista"; `q: "2220"` e `q: "3222"` acham pelo telefone; pedaço do CNPJ acha;
  - arquivado não aparece; de outra conta nunca; `q: "12"`: `poucos_digitos`;
  - **última compra:** uma compra recebida (itens R$ 200,00, frete R$ 20,00) e uma mais nova cancelada: `{ em: <purchased_at da recebida>, valor: 220 }`; o de propriedade sem compra: `null`;
  - o Caixa: 403; o Vendedor: ok (`fora_do_caixa`);
  - `listarFornecedoresAction({ q: "3222" })` acha o de fora.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** a action (mesma forma da Task 3, `exigir(db, ator, "fora_do_caixa")`), a rota, a lista do plano 1, `endpoints.ts`.
- [ ] **Step 4:** `test:m96`, `test:m95`, `test:isolation`, `test:docs-api`, `tsc`, `check`: verdes.
- [ ] **Step 5:** relatar os arquivos (commit: `Empório: a busca de fornecedores no servidor`).

### Task 5: A escolha do cliente na Venda, no Orçamento e na Troca

**Files:**
- Modify: `src/components/ui/form-sheet.tsx` (o submit que sobe de formulário filho é ignorado: `if (e.target !== e.currentTarget) return;` antes do `preventDefault`, com uma linha de comentário dizendo por quê)
- Create: `src/app/(dashboard)/emporio/_components/busca-no-servidor.ts`, `janela-de-escolha.tsx`, `escolher-cliente.tsx`
- Modify: `src/app/(dashboard)/emporio/_components/cliente-form.tsx` (os acréscimos do bloco do plano 3; o gatilho padrão do `novo` passa a "Cadastrar novo cliente")
- Modify: `venda-campos.tsx` (o `Field` "Cliente", `id` `customer_id`, renderiza `EscolherCliente`; sai a prop da lista de clientes, entra `consumidorFinal`; `permitirClienteNovo` vira `permitirCadastro`), `venda-estado.ts` (o estado do cliente passa a ser `cliente: ClienteEscolhido | null` com `setCliente`, no lugar do id, da lista de recém-cadastrados e dos `contatoCriado`/`contatoAtualizado`; Consumidor final = `cliente?.fixed`; corpo `customer_id: cliente?.id ?? null`; a carga do orçamento leva `cliente`), `catalogo-venda.ts` (devolve `consumidorFinal: { id, name }` no lugar da lista), `balcao.tsx`, `balcao-orcamento.tsx` (a carga monta `cliente` de `OrcamentoView.customer` com `fixed = id === consumidorFinal.id`), `trocar-form.tsx` (`clienteInicial`, `permitirCadastro`)
- Modify: `src/app/(dashboard)/emporio/vender/page.tsx`, `src/app/(dashboard)/emporio/vendas/[id]/page.tsx` (o `clienteInicial` da troca por `buscarClientesAction(db, user, { id: venda.customer_id })`, `itens[0] ?? null`)
- Modify: `scripts/navegador/_lib.py` (`escolher_cliente`, `escolhido`), e os roteiros que escolhiam o cliente na lista: `emporio-cliente-menu.py` (inclusive o `cliente_escolhido()` dele, que lia o gatilho do Select), `emporio-f3a.py`, `emporio-f3b.py`, `emporio-impressao.py`, `emporio-orcamento.py`, `emporio-turno.py`, `emporio-vendedor.py`, `manual-emporio.py` (a figura que escolhe "Haras Santa Clara"), `emporio-clientes.py` (do plano 1)

**Interfaces:**
- Consumes: `ClienteEscolhido`, `ClienteDaBusca`, `clienteEscolhidoDe`, `consumidorFinalEscolhido`, a rota de busca (Task 3); `formatarTelefone` (Task 1); `formatarDocumento` (`src/lib/contatos/cadastro.ts`); `Falta` (plano 1).
- Produces: `EscolherCliente` e os acréscimos do `ClienteForm` do bloco do plano 3, e:

```ts
// busca-no-servidor.ts
export function useBuscaNoServidor<T>(rota: string, aberta: boolean): {
  termo: string; setTermo: (s: string) => void; itens: T[]; total: number; poucosDigitos: boolean;
  carregando: boolean; erro: string | null; temMais: boolean; carregarMais: () => void; tentarDeNovo: () => void;
};
// janela-de-escolha.tsx
export function JanelaDeEscolha<T extends { id: string; name: string }>(props: {
  titulo: string; tipo: "cliente" | "fornecedor"; aberta: boolean; onAbertaChange: (a: boolean) => void;
  busca: ReturnType<typeof useBuscaNoServidor<T>>; fixoNoTopo?: React.ReactNode;
  linha: (item: T) => React.ReactNode; onEscolher: (item: T) => void; onCadastrar?: (termo: string) => void;
}): JSX.Element;
export type CampoDoField = { id: string; "aria-invalid": boolean | undefined; "aria-describedby": string | undefined; "aria-required": boolean | undefined };
```

Comportamento (o esboço aprovado pelo usuário):
- **Sem cliente:** o contêiner do campo (recebe `campo`, `tabIndex={-1}`, para o foco da recusa cair nele) mostra `Nenhum cliente escolhido.` e os dois botões, "Escolher cliente" e "Cadastrar novo cliente" (este só com `permitirCadastro`), que quebram linha a 390 px.
- **A janela** (`Sheet`, título e `aria` "Escolher cliente", `data-escolha="cliente"` no conteúdo): campo `type="search"`, `aria-label="Buscar cliente"`, placeholder `Nome, CPF/CNPJ ou telefone`, com foco ao abrir; Enter nunca envia nada e, com um resultado só, escolhe; o Consumidor final sempre fixo no topo, com o selo "Cliente padrão" e o aviso; depois a lista, cada linha um botão (`data-opcao`, `data-nome` com o nome exato, altura mínima de toque) com o nome, `formatarTelefone`, o documento formatado ou "sem CPF/CNPJ", e `Última compra dd/mm/aaaa, R$ x` ou `Sem compras`; estados `Buscando...`, `Nenhum cliente encontrado.`, a frase dos poucos dígitos, a falha (`role="alert"`, com "Tentar de novo"); "Carregar mais" enquanto `itens.length < total`; rodapé "Não achou? Cadastrar novo" (com `permitirCadastro`), que fecha a janela e abre o `ClienteForm` `novo` com `inicial` (`name` se o termo tem letra, `phone` se só dígitos).
- **Escolhido:** um quadro (`data-escolhido="cliente"`) com nome, telefone formatado e documento (ou "sem CPF/CNPJ"), e o botão "Trocar" (`aria-label="Trocar cliente"`, para não colidir com o "Trocar" da tela da venda). No Consumidor final, o selo e o aviso. Cliente com `incomplete` mostra `Cadastro incompleto` e "Completar cadastro" (o que existe hoje, preservado). Com `aviso`, o gancho do plano 3.
- **Salvo no `ClienteForm`** (`novo` ou `completar`): `onEscolher(clienteEscolhidoDe(view))`, e o campo limpa a recusa.
- Os textos da recusa no cliente continuam os do servidor (plano 1), embaixo do campo.

- [ ] **Step 1:** em `_lib.py`, `escolher_cliente(nome, busca=None)` (abre pelo botão "Escolher cliente" ou "Trocar cliente" dentro do campo, digita `busca or nome` no campo de busca da janela `[data-escolha=cliente]`, espera a linha com `data-nome == nome` e clica; "Consumidor final" clica direto na linha fixa) e `escolhido(tipo)` (texto do `[data-escolhido=<tipo>]`, ou `""`). Trocar `escolher("Cliente", X)` por `escolher_cliente(X)` nos roteiros da lista de arquivos, e o `cliente_escolhido()` do `emporio-cliente-menu` por `escolhido()` (a conferência "sem cliente escolhido ao abrir" passa a esperar `""`). Rodar `emporio-f3a` e ver reprovar (a tela ainda é a lista).
- [ ] **Step 2:** o `FormSheet`, o gancho, a janela, `EscolherCliente`, o `ClienteForm`.
- [ ] **Step 3:** venda, orçamento e troca (estado, campos, catálogo, balcão, troca, as duas páginas). A troca ganha "Cadastrar novo cliente".
- [ ] **Step 4:** `tsc`, `lint`, `check`: verdes. Com o `next dev` de pé: `emporio-f3a`, `emporio-f3b`, `emporio-cliente-menu`, `emporio-orcamento`, `emporio-impressao`, `emporio-turno`, `emporio-vendedor`, `emporio-clientes`: verdes.
- [ ] **Step 5: Review Focus 3, na mão no `next dev`:** abrir a troca de uma venda, "Cadastrar novo cliente", salvar uma PF: o painel da troca continua aberto, com o cliente novo no quadro, e nenhuma troca foi gravada (conferir em `/emporio/vendas`). Desfazer a guarda do `FormSheet`, repetir e ver a troca ser enviada (ou recusada no rodapé); restaurar. Relatar o que viu.
- [ ] **Step 6:** a 390 px, `/emporio/vender` com a janela aberta e com o quadro: sem rolagem horizontal.
- [ ] **Step 7:** relatar os arquivos (commit: `Empório: o cliente escolhido por busca, na venda, no orçamento e na troca`).

### Task 6: A escolha do fornecedor na Compra, e a busca nas telas Clientes e Fornecedores

**Files:**
- Create: `src/app/(dashboard)/emporio/_components/escolher-fornecedor.tsx`
- Modify: `src/app/(dashboard)/emporio/_components/fornecedor-form.tsx` (do plano 1: `open?`, `onOpenChange?`, `inicial?: { name?: string; phone?: string }`, `onSalvo?: (f: FornecedorView) => void`)
- Modify: `compra-form.tsx` (o `Field` "Fornecedor", `id` `supplier_id`, hint `Opcional.`, renderiza `EscolherFornecedor`; sai a prop `fornecedores`; estado `fornecedor: FornecedorEscolhido | null`; a regra do plano 1 de esconder o pagamento passa a ler `fornecedor?.kind === "propriedade"`), `src/app/(dashboard)/emporio/compras/page.tsx` (deixa de carregar a lista)
- Modify: `src/app/(dashboard)/emporio/clientes/page.tsx`, `clientes/_components/clientes-filtro.tsx`, `src/app/(dashboard)/emporio/fornecedores/page.tsx` e o filtro dela (placeholder `Nome, CPF/CNPJ ou telefone`; com `poucos_digitos`, a frase dos poucos dígitos no lugar da lista vazia)
- Modify: `scripts/navegador/_lib.py` (`escolher_fornecedor`), `manual-emporio.py` (a figura que escolhe "Agropecuária Central"), `emporio-clientes.py` (passo do fornecedor de propriedade)

**Interfaces:**
- Consumes: `JanelaDeEscolha`, `useBuscaNoServidor`, `CampoDoField` (Task 5); `FornecedorEscolhido`, `FornecedorDaBusca`, a rota (Task 4).
- Produces:

```ts
export function EscolherFornecedor(props: {
  campo: CampoDoField; valor: FornecedorEscolhido | null;
  onEscolher: (f: FornecedorEscolhido | null) => void; permitirCadastro?: boolean;
}): JSX.Element;
```

Comportamento: a mesma janela (título "Escolher fornecedor", `data-escolha="fornecedor"`, sem linha fixa no topo); a linha do fornecedor de propriedade mostra o nome dela com o selo "Propriedade"; a do de fora, telefone e documento; a última compra igual à do cliente. Os botões "Escolher fornecedor" e "Cadastrar novo fornecedor"; o quadro (`data-escolhido="fornecedor"`) com nome, "Propriedade do dono" ou telefone e documento, "Trocar" (`aria-label="Trocar fornecedor"`) e "Tirar fornecedor" (chama `onEscolher(null)`).

- [ ] **Step 1:** `escolher_fornecedor` em `_lib.py` e a troca nos roteiros; rodar `emporio-clientes` e ver reprovar no passo do fornecedor.
- [ ] **Step 2:** `EscolherFornecedor`, o `FornecedorForm`, a compra e a página de compras.
- [ ] **Step 3:** as telas Clientes e Fornecedores com a busca nova.
- [ ] **Step 4:** `tsc`, `lint`, `check`: verdes; `emporio-clientes`, `emporio-f2a`, `emporio-f2b`, `emporio-f5` e `manual-emporio` verdes.
- [ ] **Step 5: Review Focus 3, na mão:** na Compra, "Cadastrar novo fornecedor", salvar um de fora: a compra continua aberta, com ele no quadro, e nenhuma compra foi gravada. Escolher o de propriedade: as formas de pagamento somem (plano 1). A 390 px, a Compra com a janela aberta e as telas Clientes e Fornecedores: sem rolagem horizontal.
- [ ] **Step 6:** relatar os arquivos (commit: `Empório: o fornecedor escolhido por busca na compra, e a mesma busca em Clientes e Fornecedores`).

### Task 7: Roteiro vivo, manual, spec, dívidas e handoff

**Files:**
- Create: `scripts/_cenario-emporio-escolha.ts` (Da Mata, uma loja com o produto de preço da F6b, o Vendedor e o Gestor dela; os clientes da seção 3 da m96 com os mesmos telefones, a Maria Souza com uma venda concluída antiga; "Agropecuária Central" e um fornecedor de propriedade; idempotente, nomes com prefixo `Escolha`)
- Create: `scripts/navegador/emporio-escolha.py` (cabeçalho `# cenario:` e `# sessao:` no padrão de `emporio-cliente-menu.py`)
- Modify: `src/app/(dashboard)/manual/_conteudo/partes-tarefa-2.tsx`, `partes-funcao.tsx`, `partes-consulta.tsx`, `partes-tarefa-3.tsx`, `partes-tarefa-1.tsx` (toda frase que manda "escolher no campo Cliente", "o primeiro da lista" ou "clicar em Cliente novo" passa a "Escolher cliente", a busca por nome, CPF/CNPJ ou pelo pedaço do telefone, e "Cadastrar novo cliente"; no fornecedor, "Escolher fornecedor"); uma figura nova da janela aberta no Vender, em `figuras.ts` e `manual-emporio.py`, no padrão das outras
- Modify: `docs/specs/module-39-meu-emporio.md`, `docs/agents/dividas.md`, `docs/agents/current-handoff.md`

Roteiro `emporio-escolha` (Vendedor; o passo 9 com o Gestor):
1. Vender sem cliente: os dois botões; "Escolher cliente" abre a janela com o Consumidor final no topo, "Cliente padrão" e o aviso.
2. Digita `8761` (o meio, atravessando o hífen): só a Maria Souza, com `(34) 99876-1234`, `529.982.247-25` e a última compra.
3. Digita `1234` e depois `9987`: a Maria Souza nas duas.
4. Digita `12`: a frase dos poucos dígitos, nenhuma linha além do Consumidor final.
5. **Review Focus 4:** digita `m`, `ma`, `mar`, `mari`, `maria` sem pausa e logo `3333`: a lista final é só a Maria Sousa, com "sem CPF/CNPJ".
6. Escolhe a Maria Souza: o quadro com nome, telefone, documento e "Trocar"; vende em dinheiro; a venda sai com o nome dela.
7. "Trocar cliente", escolhe o Consumidor final, marca Fiado: a recusa embaixo do campo Cliente.
8. "Escolher cliente", digita `Pedro Escolha`, "Não achou? Cadastrar novo": o cadastro abre com o nome preenchido; salva com telefone; o quadro mostra o Pedro.
9. Gestor na Compra: "Escolher fornecedor", sem Consumidor final; `boa vista` acha a propriedade com o selo; escolhida, sem forma de pagamento.
10. Clientes: filtro `1234` acha a Maria Souza.
11. A 390 px: Vender com a janela aberta, sem rolagem horizontal (`document.documentElement.scrollWidth <= innerWidth`).

Decisões para a spec (uma linha cada): Q199 a busca no servidor (rotas, 3 dígitos, 20 por página até 50, só ativos, ordem); Q200 o número local do telefone (a regra e a coluna gerada); Q201 a janela (Consumidor final fixo fora da busca, sem escolha inicial, última compra pelas lojas do ator); Q202 o fornecedor na janela (opcional, selo de propriedade, última compra com frete); Q203 Clientes e Fornecedores com a mesma busca; Q204 painel dentro de painel e o cadastro novo na Troca e na Compra.

Dívidas: fechar, na seção do plano 1 (5.20), "a busca de clientes por telefone e documento é do plano 2"; registrar que a lista de orçamentos (`listarOrcamentosAction`) ainda filtra telefone e documento em memória e poderia usar `phone_busca`.

- [ ] **Step 1:** o cenário rodado no `tibe_dev` (URL inline), duas vezes seguidas sem erro.
- [ ] **Step 2:** com o `next dev` de pé, `npm run navegador -- emporio-escolha`: verde.
- [ ] **Step 3: prova nos dois sentidos:** trocar `phone_busca` por `phone` no `ondeBuscaCliente`, ver o passo 2 reprovar (`8761` não casa com `99876-1234`), restaurar, ver passar.
- [ ] **Step 4:** manual, figura (`manual-emporio` verde), spec, dívidas e handoff (a migração `20261107090000` **não** está no Neon; ordem do deploy: as do plano 1 e esta no Neon, depois merge e push).
- [ ] **Step 5:** `test:m96`, `test:m95`, `test:docs-api`, `test:isolation`, `check`, `tsc`, `lint`: verdes; relatar os arquivos (commit: `Empório: roteiro, manual e decisões da escolha do cliente`).

### Task 8: Conferência final e o passo parado do Neon

**Files:** nenhum.

- [ ] **Step 1:** `npm run test:all -- --sem-redis` com as URLs inline: relatar o resumo.
- [ ] **Step 2:** `npx prisma migrate status` contra o Neon (leitura, URL Direct inline): a pendente deve ser só `20261107090000_emporio_busca_por_telefone`. Se as do plano 1 ainda estiverem pendentes, parar e relatar: este plano não sobe antes delas.
- [ ] **Step 3: PARADO.** Aplicar a migração no Neon **só com autorização explícita do usuário na conversa**, que cite a migração. A autorização não se deduz de rodada anterior nem vem de subagente. Depois, `migrate status` em dia. Merge na `main` e push exigem a autorização própria do invariante 7.
