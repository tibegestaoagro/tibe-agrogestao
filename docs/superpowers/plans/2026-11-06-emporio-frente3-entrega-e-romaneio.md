# Empório, Frente 3: pedido para entrega e romaneio. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Pré-requisito:** os planos 1 (`2026-11-06-emporio-frente1-clientes-e-fornecedores.md`) e 2 (`2026-11-06-emporio-frente2-escolha-do-cliente.md`) **concluídos e commitados** na branch, com as migrações do plano 1 aplicadas no Docker. Este plano usa os nomes do bloco "Interfaces que os planos 2 e 3 usam" do plano 1 sem tradução. Se algum nome de lá mudou na execução, pare e corrija este plano antes de começar.

**Goal:** O orçamento e a venda ganham a marca "Pedido para entrega", com a escolha e a cópia do endereço e os obrigatórios de entrega; a venda fechada pode mudar a marca e o endereço por quem fatura; e toda venda tem o romaneio (sem preço) em A4 e na bobina.

**Architecture:** Uma regra pura (`src/lib/emporio/pedido-para-entrega.ts`) resolve a marca, a escolha e o endereço contra o cliente e devolve as colunas a gravar; o orçamento, a venda e a mudança depois de fechada chamam a mesma função. O endereço é **copiado** para nove colunas novas em `EmporioQuote` e `EmporioSale` (migração só de acréscimo). O romaneio é uma leitura nova em `emporio-impressao.ts`, com rota de dados e página de impressão irmã da venda.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Postgres 17, Zod 4, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-06-emporio-clientes-fornecedores-romaneio-design.md`, seção "Frente 3: pedido para entrega e romaneio" (mais a tabela de obrigatórios da Frente 1 e o item "Cadastro incompleto" da Frente 2). Spec do módulo: `docs/specs/module-39-meu-emporio.md`.

## Interfaces deste plano

**Nomes: a regra da palavra "entrega".** "Entrega" sozinha já é o malote do turno (`confirmarEntregaAction`) e as fases "entrega 1 a 4". Neste plano, **nenhum identificador usa "entrega" sozinha**: em TypeScript é sempre `PedidoParaEntrega`, `ParaEntrega` ou `EnderecoDeEntrega` (como o `faltaParaEntrega` do plano 1); no banco e na API é o inglês `delivery` (o malote é `handover` no schema). Na tela, o rótulo é "Pedido para entrega", e o romaneio diz "ENTREGA" ou "RETIRADA".

**Schema (`prisma/schema.prisma`, Task 2), iguais em `EmporioQuote` e `EmporioSale`:**

| coluna | tipo |
|---|---|
| `for_delivery` | `Boolean @default(false)` |
| `delivery_address_kind` | `EmporioDeliveryAddressKind?` (enum novo: `principal`, `cadastro_entrega`, `outro`); nulo na retirada |
| `delivery_zip`, `delivery_street`, `delivery_number`, `delivery_complement`, `delivery_district`, `delivery_city`, `delivery_state` | `String?`, a cópia do endereço escolhido; todas nulas na retirada |

**Regra pura (`src/lib/emporio/pedido-para-entrega.ts`, Task 1):**

```ts
import type { ClienteParaConferir, EnderecoDoPedido } from "@/lib/emporio/cliente-cadastro";
export type EscolhaDoEndereco = "principal" | "cadastro_entrega" | "outro";
export type PedidoParaEntregaInput = {
  for_delivery?: boolean | null; delivery_address_kind?: string | null;
  delivery_zip?: string | null; delivery_street?: string | null; delivery_number?: string | null;
  delivery_complement?: string | null; delivery_district?: string | null; delivery_city?: string | null; delivery_state?: string | null;
};
export type PedidoParaEntregaColunas = {
  for_delivery: boolean; delivery_address_kind: EscolhaDoEndereco | null;
  delivery_zip: string | null; delivery_street: string | null; delivery_number: string | null; delivery_complement: string | null;
  delivery_district: string | null; delivery_city: string | null; delivery_state: string | null;
};
export type FaltaNoCliente = { code: "VALIDATION_ERROR" | "DELIVERY_CUSTOMER_INCOMPLETE"; field: "customer_id"; message: string };
export const RETIRADA: PedidoParaEntregaColunas;                       // false e tudo nulo
export function faltaNoClienteParaEntrega(c: ClienteParaConferir): FaltaNoCliente | null;
export function resolverPedidoParaEntrega(c: ClienteParaConferir, input: PedidoParaEntregaInput): ActionResult<PedidoParaEntregaColunas>;
export function entradaHerdadaDoOrcamento(q: PedidoParaEntregaColunas): PedidoParaEntregaInput;
export function enderecoDasColunas(r: PedidoParaEntregaColunas): EnderecoDoPedido | null; // nulo na retirada
export function linhaDoEndereco(e: EnderecoDoPedido | null): string | null;
```

**Views (Tasks 3 e 4):** `OrcamentoView` e `VendaView` ganham `for_delivery: boolean`, `delivery_address_kind: EscolhaDoEndereco | null`, `delivery_address: EnderecoDoPedido | null`. `ImpressoVenda` ganha `pedido_para_entrega: boolean` e `endereco_de_entrega: string | null` (Task 6).

**Actions novas:**

```ts
// src/lib/actions/emporio-clientes.ts (Task 3)
export type OpcaoDeEndereco = { endereco: EnderecoDoPedido; linha: string | null; completo: boolean };
export type OpcoesDeEntregaView = {
  customer_id: string; fixed: boolean;
  falta_no_cliente: { code: string; message: string } | null;
  principal: OpcaoDeEndereco; cadastro_entrega: OpcaoDeEndereco | null;
};
lerOpcoesDeEntregaDoClienteAction(db, ator, customerId: string): Promise<ActionResult<OpcoesDeEntregaView>>

// src/lib/actions/emporio-vendas.ts (Task 5)
mudarPedidoParaEntregaAction(db, ator, saleId: string, input: PedidoParaEntregaInput): Promise<ActionResult<VendaView>>

// src/lib/actions/emporio-impressao.ts (Task 6)
export type RomaneioView = {
  numero: string; orcamento_origem: string | null; emitida_em: string;
  situacao: "ativa" | "cancelada" | "trocada" | "devolvida";
  loja: ImpressoVenda["loja"]; tem_logo: boolean; logo_updated_at: string | null;
  vendedor: string | null; caixa: string | null;
  pedido_para_entrega: boolean;
  cliente: { nome: string; telefone: string | null; documento: string | null };
  endereco_de_entrega: string | null;
  itens: { produto: string; apresentacao: string; quantidade: string }[];
  linhas: number; observacoes: string | null; largura_bobina: 80 | 58;
};
lerRomaneioDaVendaAction(db, ator, saleId: string): Promise<ActionResult<RomaneioView>>
```

**Rotas (todas por `guardEmporio`):**

| rota | action |
|---|---|
| `POST /api/v1/emporio/quotes` e `POST /api/v1/emporio/sales` | aceitam os campos de `PedidoParaEntregaInput` (Tasks 3 e 4) |
| `GET /api/v1/emporio/customers/:id/delivery-options` | `lerOpcoesDeEntregaDoClienteAction` |
| `PATCH /api/v1/emporio/sales/:id/delivery` | `mudarPedidoParaEntregaAction` |
| `GET /api/v1/emporio/sales/:id/packing-list` | `lerRomaneioDaVendaAction` |
| página `/emporio/imprimir/romaneio/[id]?formato=a4\|cupom` | `lerRomaneioDaVendaAction` |

## Global Constraints

- **As oito invariantes do `CLAUDE.md`.** Nunca travessão (U+2014); nada de heredoc para escrever arquivo (SQL inclusive: Write/Edit); regra de negócio em `src/lib/actions`, rota fina; migração antes do push.
- **Banco:** o `.env` aponta para o Neon. Toda suíte, `migrate diff`, `db:deploy` e cenário levam a URL do Docker inline:
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m97`
  **Nada é aplicado no Neon**, salvo o passo parado da Task 10, com autorização do usuário na conversa.
- **Ordem action, rota, tela.** Toda rota nova ou mudada vai para `src/app/(public)/docs/api/endpoints.ts` (`npm run test:docs-api`).
- **"Entrega" sozinha não vira identificador** (ver "Nomes" acima).
- **Obrigatórios de entrega** (spec, Frente 1): PF: CPF no cadastro e o endereço escolhido completo; PJ: o cadastro completo (já exige CNPJ e endereço principal) e o endereço escolhido completo. "Endereço completo" = CEP, rua, número, bairro, cidade e UF; complemento opcional. O Consumidor final é recusado.
- **"Outro endereço" vale só para aquele pedido**: nunca escreve em `EmporioCustomer`.
- **O endereço é copiado** no momento em que o pedido é gravado: reimprimir depois mostra a cópia, nunca o cadastro de hoje.
- **Mudar depois de fechada** não mexe em estoque, caixa nem financeiro: só as nove colunas e uma linha no Histórico.
- **Permissão:** salvar orçamento e vender com a marca seguem as permissões de hoje (`vendedor_da_loja`). Mudar a marca depois de fechada exige a ação nova `fatura_na_loja` de `src/lib/emporio/papel.ts`: Dono e Gerente geral sempre; Gestor e Caixa só nas lojas deles; Vendedor nunca.
- **Histórico:** `mudarPedidoParaEntregaAction` chama `registrarNoHistorico` na mesma transação (conferência 19). Chave nova em `ACOES_DO_HISTORICO`: `"venda.pedido_para_entrega": "Mudou o pedido para entrega de uma venda"`. As leituras novas começam por `ler` (prefixo de leitura da conferência 19).
- **Recusa de campo** sai com `field` (4º parâmetro de `fail`) no nome da API; Zod por `apiErroDeZod`; na tela, todo campo do `ORDEM` com `error=` no `<Field>` (conferência 15), e **todo campo do `ORDEM` com o `<Field>` renderizado sempre que o servidor puder recusá-lo**.
- **Suíte nova `test:m97`** (`scripts/m97-emporio-entrega-romaneio.test.ts`, texto impresso "M97: Módulo 39 (Meu Empório), Frente 3: pedido para entrega e romaneio"). O plano 1 usa a `m95` e o plano 2 a `m96`; se o plano 2 usou outro número, use o próximo livre e corrija este plano. Escrita a partir da spec e vista falhando antes de cada implementação. Limpeza no padrão da `m95` (`emporioQuote` e `emporioSale` antes de `emporioCustomer`).
- **Venda em teste precisa de turno aberto** (`abrirTurnoDeTeste` de `scripts/_emporio-turno.ts`).
- **Arquivo novo só conta no `npm run check` depois de `git add -N`.**
- **Subagente não commita:** deixa no working tree e relata os arquivos; a sessão principal commita, uma tarefa por vez.
- **Fora deste plano:** acompanhar a entrega no sistema (status, entregue, quem recebeu), frete e data agendada. Nenhuma coluna, rota ou botão para isso.

### Recusas (código, status, `field`, mensagem exata)

| quando | código | status | field | mensagem |
|---|---|---|---|---|
| marca ligada com o Consumidor final | `VALIDATION_ERROR` | 422 | `customer_id` | `Pedido para entrega precisa do cliente de verdade, não do Consumidor final.` (a do plano 1) |
| marca ligada, PF sem CPF | `DELIVERY_CUSTOMER_INCOMPLETE` | 422 | `customer_id` | `Para entrega, informe o CPF do cliente.` (o texto do plano 1, em `customer_id`) |
| marca ligada, cadastro incompleto para o tipo | `DELIVERY_CUSTOMER_INCOMPLETE` | 422 | `customer_id` | `Para entrega, complete o cadastro do cliente: ` + a mensagem de `faltaNoCadastro` |
| marca ligada sem escolha | `VALIDATION_ERROR` | 422 | `delivery_address_kind` | `Escolha o endereço de entrega.` |
| `cadastro_entrega` sem endereço de entrega no cadastro | `VALIDATION_ERROR` | 422 | `delivery_address_kind` | `Este cliente não tem endereço de entrega no cadastro. Escolha o endereço principal ou outro endereço.` |
| `principal` incompleto | `VALIDATION_ERROR` | 422 | `delivery_address_kind` | `O endereço principal do cadastro está incompleto. Complete o cadastro do cliente ou escolha outro endereço.` |
| `cadastro_entrega` incompleto | `VALIDATION_ERROR` | 422 | `delivery_address_kind` | `O endereço de entrega do cadastro está incompleto. Complete o cadastro do cliente ou escolha outro endereço.` |
| `outro` incompleto | `VALIDATION_ERROR` | 422 | `delivery_zip` ... `delivery_state` | as do plano 1 (`Informe o CEP do endereço de entrega.` etc.) |
| `outro` com CEP ou UF fora do formato | `VALIDATION_ERROR` | 422 | `delivery_zip` / `delivery_state` | `CEP inválido. Use os 8 números.` / `Escolha a UF da lista.` (as de `conferirCadastro`) |
| escolha que não é das três | `VALIDATION_ERROR` | 422 | `delivery_address_kind` | `Escolha o endereço de entrega.` |
| mudar venda cancelada | `VALIDATION_ERROR` | 422 | sem campo | `Venda cancelada não muda o pedido para entrega.` |
| mudar venda trocada | `VALIDATION_ERROR` | 422 | sem campo | `Venda trocada não muda o pedido para entrega: mude na venda da troca.` |
| mudar pelo Vendedor | `FORBIDDEN` | 403 | sem campo | `Só o caixa, o gestor da loja, o gerente geral e o dono podem mudar o pedido para entrega.` |

Por que a recusa do cliente sai em `customer_id` e não em `document` (como devolve `faltaParaEntrega`): o balcão não tem campo de CPF; o aviso precisa cair embaixo do cliente escolhido, onde fica o "Completar cadastro". As do endereço "outro" caem nos campos `delivery_*` sem tradução, como o plano 1 pediu. As de `principal` e `cadastro_entrega` caem em `delivery_address_kind`, porque nesses casos os campos `delivery_*` não aparecem na tela e a recusa seria engolida.

### Decisões que este plano fixa (vão para a spec na Task 9)

| o quê | valor |
|---|---|
| D1 nomes | ver "Nomes" acima; colunas `for_delivery`, `delivery_address_kind`, `delivery_*` em `EmporioQuote` e `EmporioSale` |
| D2 a escolha | `principal`, `cadastro_entrega` (só se o cadastro tem algum dos sete campos de entrega) ou `outro`; a escolha fica gravada junto com a cópia |
| D3 faturar | `for_delivery` **ausente ou nulo** no corpo de uma venda com `quote_id` = herda do orçamento por `entradaHerdadaDoOrcamento`: a marca e a escolha; na escolha `outro`, também o endereço do orçamento; em `principal` e `cadastro_entrega`, o endereço é copiado de novo do cadastro do cliente **da venda**, naquele momento. Presente (inclusive `false`), vale o corpo. A tela sempre manda explícito, pré-preenchido do orçamento |
| D4 o orçamento não muda depois de salvo | como hoje (não há edição de orçamento); quem corrige a entrega é o caixa ao faturar, ou quem fatura, na venda fechada |
| D5 mudar depois de fechada | só `fatura_na_loja`; recusado em venda cancelada e em venda trocada; aceito em venda com devolução parcial ou total sem troca; o cliente da venda não muda aqui; sem mudança de valor, devolve a venda sem gravar nem registrar no Histórico; o alcance é o de `lerVendaAction`, então o Caixa só muda (e só reimprime o romaneio de) venda **de hoje**, como já só enxerga a venda de hoje |
| D6 a troca | a venda nova da troca nasce sempre como retirada (`trocarAction` passa `for_delivery: false`, como já anula o `quote_id`); quem fatura pode marcá-la depois pela D5 |
| D7 o romaneio | sai em toda venda, inclusive a cancelada (com aviso); conteúdo da spec, sem preço; cliente sempre presente (Consumidor final aparece pelo nome, sem telefone nem documento); aviso por situação: `VENDA CANCELADA: NÃO SEPARAR`, `VENDA TROCADA: NÃO SEPARAR`, `VENDA COM DEVOLUÇÃO: CONFIRA NA VENDA ANTES DE SEPARAR` |
| D8 o papel do orçamento e da venda | ganham uma linha "PEDIDO PARA ENTREGA" com o endereço, para o caixa ver no papel que o cliente traz (extensão pequena, não pedida na spec: confirmar com o usuário) |

## Review Focus

1. **O endereço do cadastro escolhido está incompleto** (`principal` de uma PF só com nome, telefone e CPF): a recusa aparece embaixo da escolha do endereço, não some e não cai no rodapé. Teste na Task 1 (campo `delivery_address_kind`) e conferência no roteiro da Task 8.
2. **Faturar com um cliente diferente do orçamento, ou com o cadastro mudado depois do orçamento:** em `principal` a venda copia o endereço do cliente da venda, de agora; em `outro`, o do orçamento. Teste na Task 4.
3. **Mudar a entrega enquanto outro cancela a venda:** quem chega depois do cancelamento recebe a recusa da venda cancelada, e nada de estoque, caixa ou financeiro muda em nenhum caminho. Teste na Task 5 (`Promise.all` e contagens).
4. **Romaneio de muitos itens com nome longo na bobina de 58 mm:** nada passa da largura, o PDF sai numa página só da largura da bobina; no A4 com muitos itens, o bloco de assinaturas não se parte entre folhas. Conferido no roteiro da Task 8.
5. **O corpo que manda `for_delivery: false` ao faturar um orçamento marcado** vira retirada (o caixa desmarcou), e o que omite o campo herda. Teste na Task 4.

---

### Task 1: A regra pura do pedido para entrega

**Files:**
- Create: `src/lib/emporio/pedido-para-entrega.ts`
- Create: `scripts/m97-emporio-entrega-romaneio.test.ts` (seção 1, sem banco; esqueleto com `check`, `comBanco` e `limpar` no padrão da `m95`)
- Modify: `package.json` (`"test:m97": "tsx scripts/m97-emporio-entrega-romaneio.test.ts"`)

**Interfaces:**
- Consumes: `ClienteParaConferir`, `EnderecoDoPedido`, `faltaNoCadastro`, `faltaParaEntrega`, `enderecoPrincipalDe`, `enderecoDeEntregaDe`, `enderecoCompleto`, `ehConsumidorFinal` (plano 1, `src/lib/emporio/cliente-cadastro.ts`); `conferirCadastro(input)` e `formatarCep` (`src/lib/contatos/cadastro.ts`); `fail`, `ok`, `ActionResult`.
- Produces: o bloco "Regra pura" do topo.

- [ ] **Step 1: Escrever a seção 1 da m97 (falhando).** Fixtures: `PF_CPF` (PF com nome, telefone, CPF válido, endereço principal completo, sem endereço de entrega), `PF_SEM_CPF` (idem sem documento), `PF_SO_NOME_TEL_CPF` (com CPF, sem endereço), `PJ` (completa, com endereço de entrega completo), `CF` (`system_key: "consumidor_final"`). `OUTRO` = `{ delivery_zip: "38400-000", delivery_street: "Rua B", delivery_number: "20", delivery_complement: "", delivery_district: "Centro", delivery_city: "Uberlândia", delivery_state: "mg" }`. Casos (mensagens exatas da tabela de recusas):
  - `for_delivery` `false`, nulo ou ausente: `ok(RETIRADA)`, mesmo com o Consumidor final e com campos de endereço no input;
  - `CF` marcado: `VALIDATION_ERROR` em `customer_id`; `PF_SEM_CPF` marcado com `OUTRO`: `DELIVERY_CUSTOMER_INCOMPLETE` em `customer_id`, "Para entrega, informe o CPF do cliente."; PF sem telefone: `customer_id`, "Para entrega, complete o cadastro do cliente: Informe o telefone.";
  - marcado sem escolha, ou com `"qualquer"`: `delivery_address_kind`, "Escolha o endereço de entrega.";
  - `PF_CPF` + `principal`: ok, `delivery_address_kind: "principal"` e as sete colunas iguais ao endereço principal;
  - **Review Focus 1:** `PF_SO_NOME_TEL_CPF` + `principal`: `delivery_address_kind` com a frase do principal incompleto; `PF_CPF` + `cadastro_entrega`: a frase "não tem endereço de entrega"; PJ com endereço de entrega sem bairro + `cadastro_entrega`: a frase do endereço de entrega incompleto;
  - `PF_CPF` + `outro` + `OUTRO`: ok, `delivery_zip` "38400000", `delivery_state` "MG", `delivery_complement` nulo; `OUTRO` com `delivery_number: "  "`: `delivery_number`, "Informe o número do endereço de entrega."; CEP "1234": `delivery_zip`, "CEP inválido. Use os 8 números."; UF "XX": `delivery_state`, "Escolha a UF da lista.";
  - `principal` com campos `delivery_*` no input: os do input são ignorados (as colunas vêm do cadastro);
  - `entradaHerdadaDoOrcamento` de um `outro` devolve as sete colunas; de um `principal` devolve só `{ for_delivery: true, delivery_address_kind: "principal" }`; de `RETIRADA`, `{ for_delivery: false }`;
  - `faltaNoClienteParaEntrega(PF_CPF)` nulo; `(PF_SEM_CPF)` a frase do CPF; `(CF)` a do Consumidor final;
  - `linhaDoEndereco({ zip: "38400000", street: "Rua A", number: "10", complement: null, district: "Centro", city: "Uberlândia", state: "MG" })` é `"Rua A, 10, Centro, Uberlândia/MG, CEP 38400-000"`; com complemento "Apto 2": `"Rua A, 10, Apto 2, Centro, Uberlândia/MG, CEP 38400-000"`; nulo dá nulo;
  - `enderecoDasColunas(RETIRADA)` nulo.
- [ ] **Step 2:** rodar `test:m97` e ver falhar por falta do módulo.
- [ ] **Step 3:** implementar. Ordem do `resolverPedidoParaEntrega`: marca desligada, `RETIRADA`; `faltaNoClienteParaEntrega` (Consumidor final; `faltaNoCadastro` com o prefixo; PF sem CPF); a escolha; o endereço (do cadastro pela função do plano 1, ou o `outro` limpo: espaço vira nulo, CEP e UF por `conferirCadastro`); `faltaParaEntrega(c, endereco)` para a falta do endereço, devolvida em `delivery_*` no `outro` e trocada pela frase fixa em `delivery_address_kind` nas outras duas escolhas.
- [ ] **Step 4:** `test:m97`, `npx tsc --noEmit`, `npm run check` (com `git add -N`): verdes.
- [ ] **Step 5:** relatar os arquivos (commit: `Empório: a regra pura do pedido para entrega`).

### Task 2: As colunas do pedido para entrega (só acréscimo)

**Files:**
- Modify: `prisma/schema.prisma` (enum `EmporioDeliveryAddressKind`; as nove colunas em `EmporioQuote` e `EmporioSale`, com comentário `///` citando a Frente 3)
- Create: `prisma/migrations/20261107120000_emporio_pedido_para_entrega/migration.sql` (timestamp maior que o de toda migração dos planos 1 e 2: conferir com `ls prisma/migrations | tail -3`)
- Test: `scripts/m97-emporio-entrega-romaneio.test.ts` (seção 2)

**Interfaces:**
- Produces: o bloco "Schema" do topo.

- [ ] **Step 1: seção 2 da m97 (falhando):** um orçamento e uma venda gravados sem as colunas novas leem `for_delivery: false` e as outras nulas; gravar `delivery_address_kind: "outro"` com as sete colunas e ler de volta; o client do tenant B não acha a venda do A.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** schema e migração: `migrate diff` com a URL do Docker inline, SQL salvo com Write, só `CREATE TYPE` e `ADD COLUMN` (o `for_delivery` com `DEFAULT false NOT NULL`); tirar os `DROP INDEX` de `WhatsAppProviderConfig_one_active` e `AnimalBatch_tenant_ear_tag_key`; `db:deploy` com a URL inline.
- [ ] **Step 4:** `test:m97`, `npx tsx scripts/ci-migration-drift.ts` com a URL inline (sem drift), `test:isolation`, `tsc`, `check`: verdes.
- [ ] **Step 5:** relatar os arquivos (commit: `Empório: as colunas do pedido para entrega no orçamento e na venda`).

### Task 3: O orçamento para entrega e as opções de endereço do cliente

**Files:**
- Modify: `src/lib/actions/emporio-orcamentos.ts` (`OrcamentoInput & PedidoParaEntregaInput`; em `salvarOrcamentoAction`, depois das conferências do cliente do plano 1 e antes dos itens, `resolverPedidoParaEntrega` com o cliente lido com todos os campos de `ClienteParaConferir`; gravar as colunas; `OrcamentoView` com os três campos novos; o resumo do Histórico ganha `, para entrega` quando marcado)
- Modify: `src/lib/actions/emporio-clientes.ts` (`lerOpcoesDeEntregaDoClienteAction`, `OpcoesDeEntregaView`, `OpcaoDeEndereco`)
- Modify: `src/lib/emporio/venda-schema.ts` (`pedidoParaEntregaSchema`: `for_delivery: z.boolean({ error: "Marque ou desmarque o pedido para entrega." }).nullish()`, `delivery_address_kind: z.string().nullish()`, os sete `delivery_*` como `z.string().nullish()`; espalhado em `corpoDoOrcamentoSchema` e `corpoDaVendaSchema`)
- Modify: `src/app/api/v1/emporio/quotes/route.ts` (passa os campos)
- Create: `src/app/api/v1/emporio/customers/[id]/delivery-options/route.ts`
- Modify: `src/app/(public)/docs/api/endpoints.ts`
- Test: `scripts/m97-emporio-entrega-romaneio.test.ts` (seção 3)

**Interfaces:**
- Consumes: Task 1 inteira; `ClienteView` e o `db.emporioCustomer` do plano 1.
- Produces: `OrcamentoView.for_delivery`, `.delivery_address_kind`, `.delivery_address`; `pedidoParaEntregaSchema`; `lerOpcoesDeEntregaDoClienteAction` e a rota `delivery-options`.

- [ ] **Step 1: seção 3 da m97 (falhando),** pela rota `POST /api/v1/emporio/quotes` (Vendedor da loja):
  - sem a marca, com o Consumidor final: 201, `for_delivery: false`, `delivery_address: null` (o plano 1 continua valendo);
  - marcado com o Consumidor final: 422 `customer_id` com a frase da tabela, e nenhum orçamento gravado;
  - marcado, PF sem CPF: 422 `DELIVERY_CUSTOMER_INCOMPLETE`; com CPF e `outro` completo: 201, `delivery_address_kind: "outro"`, `delivery_address.city` "Uberlândia"; **o cadastro do cliente não mudou** (`emporioCustomer` lido de novo: os campos de endereço e de entrega iguais aos de antes);
  - marcado com `principal`: 201 e a cópia igual ao endereço principal; **depois editar o endereço do cliente** (`editarClienteAction`) e ler o orçamento: a cópia continua a antiga;
  - marcado com `principal` incompleto: 422 `delivery_address_kind`; `outro` sem bairro: 422 `delivery_district`;
  - o resumo do `orcamento.criar` termina com `, para entrega`;
  - `GET .../customers/:id/delivery-options` da PJ: `principal.completo` true, `cadastro_entrega` com `linha`; da PF sem CPF: `falta_no_cliente.message` "Para entrega, informe o CPF do cliente."; do Consumidor final: `fixed: true` e a falta do Consumidor final; de outra conta: 404 "Cliente não encontrado."; o Caixa da loja lê: 200.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** implementar a action do orçamento, a de opções, o schema, as rotas e `endpoints.ts` (descrição dos campos novos do orçamento e da rota nova). `lerOpcoesDeEntregaDoClienteAction` exige `vendedor_da_loja` (quem vende), lê o cliente pelo client escopado (arquivado é lido normalmente), e monta `principal` por `enderecoPrincipalDe`, `cadastro_entrega` por `enderecoDeEntregaDe`, `completo` por `enderecoCompleto`, `linha` por `linhaDoEndereco` e `falta_no_cliente` por `faltaNoClienteParaEntrega`.
- [ ] **Step 4:** `test:m97`, `test:m94`, `test:m95`, `test:docs-api`, `tsc`, `check`: verdes.
- [ ] **Step 5:** relatar os arquivos (commit: `Empório: o orçamento para entrega, com o endereço copiado`).

### Task 4: A venda para entrega e o faturamento que herda

**Files:**
- Modify: `src/lib/actions/emporio-vendas.ts`:
  - `VenderInput & PedidoParaEntregaInput`;
  - `orcamentoAFaturar` lê as nove colunas do orçamento e devolve `pedido: PedidoParaEntregaColunas` em `OrcamentoAFaturar`;
  - `prepararVenda` lê o cliente com os campos de `ClienteParaConferir` e resolve, depois do cliente e antes dos itens: `const entrada = input.for_delivery == null && orcamento ? entradaHerdadaDoOrcamento(orcamento.pedido) : input`; `Preparada.pedido`;
  - a gravação espalha `p.pedido` no `create` da venda; o resumo do `venda.criar` ganha `, para entrega`;
  - `trocarAction` monta a venda nova com `for_delivery: false`, ignorando o corpo;
  - `VendaView` e `INCLUDE_VENDA`/`montarVendas` com os três campos novos (a lista de vendas também os devolve)
- Modify: `src/app/api/v1/emporio/sales/route.ts` (passa os campos; o schema já veio na Task 3), `src/app/(public)/docs/api/endpoints.ts`
- Test: `scripts/m97-emporio-entrega-romaneio.test.ts` (seção 4)

**Interfaces:**
- Consumes: Tasks 1 a 3.
- Produces: `VendaView.for_delivery`, `.delivery_address_kind`, `.delivery_address`.

- [ ] **Step 1: seção 4 da m97 (falhando):**
  - venda direta pelo Caixa, marcada, PJ com `cadastro_entrega`: 201, a cópia é o endereço de entrega do cadastro; venda direta marcada com o Consumidor final: 422 `customer_id`, e o número de vendas, de `StockMovement` e de `CashMovement` da loja não mudou;
  - faturar (`quote_id`) um orçamento marcado com `outro`, sem `for_delivery` no corpo: a venda herda `for_delivery`, `delivery_address_kind: "outro"` e o endereço do orçamento;
  - **Review Focus 5:** faturar o mesmo tipo de orçamento com `for_delivery: false`: a venda é retirada, sem endereço;
  - faturar com corpo marcado e `outro` diferente: vale o do corpo;
  - **Review Focus 2:** orçamento marcado com `principal`; editar o endereço principal do cliente; faturar sem `for_delivery`: a venda copia o endereço **novo**; faturar outro orçamento `principal` do cliente A com `customer_id` do cliente B: a cópia é o principal de B;
  - orçamento marcado; tirar o CPF do cliente (`editarClienteAction` com `document: null`); faturar sem `for_delivery`: 422 `DELIVERY_CUSTOMER_INCOMPLETE`, o orçamento continua aberto (`sale_id` nulo); completar o CPF e faturar de novo: 201;
  - a troca de uma venda marcada: a venda nova tem `for_delivery: false`, mesmo com `for_delivery: true` no corpo da troca;
  - `listarVendasAction` traz `for_delivery` de cada venda.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `test:m97`, m81 a m95 (uma por uma, URLs inline), `test:docs-api`, `tsc`, `lint`, `check`: verdes.
- [ ] **Step 5:** relatar os arquivos (commit: `Empório: a venda para entrega, e o faturamento que herda a marca e o endereço do orçamento`).

### Task 5: Mudar o pedido para entrega depois de fechada

**Files:**
- Modify: `src/lib/emporio/papel.ts` (ação `fatura_na_loja` em `AcaoEmporio` e em `pode`: `conta` passa; `gestor` e `caixa` com `noAlcance`; `vendedor` não; frase em `FRASES`: `Só o caixa, o gestor da loja, o gerente geral e o dono podem fazer isso.`, e em `recusaDe` com `oQue`: `Só o caixa, o gestor da loja, o gerente geral e o dono podem ${oQue}.`)
- Modify: `src/lib/emporio/historico.ts` (chave `venda.pedido_para_entrega`)
- Modify: `src/lib/actions/emporio-vendas.ts` (`mudarPedidoParaEntregaAction`)
- Create: `src/app/api/v1/emporio/sales/[id]/delivery/route.ts` (PATCH, corpo `pedidoParaEntregaSchema`)
- Modify: `src/app/(public)/docs/api/endpoints.ts`; o teste que cobre a tabela de `pode` (`scripts/m87-emporio-f6b.test.ts`), com a linha da ação nova para os cinco papéis
- Test: `scripts/m97-emporio-entrega-romaneio.test.ts` (seção 5)

**Interfaces:**
- Consumes: `resolverPedidoParaEntrega`, `linhaDoEndereco`, `enderecoDasColunas` (Task 1); `VendaView` (Task 4); a derivação de "trocada" do plano 1 (uma devolução da venda tem venda de troca).
- Produces: `mudarPedidoParaEntregaAction`; a ação `fatura_na_loja` (a Task 7 usa `pode(c, "fatura_na_loja", lojaId)` para mostrar o botão).

Comportamento: lê a venda pelo alcance de `lerVendaAction` (a mesma recusa 404 dela); `exigir(db, ator, "fatura_na_loja", "mudar o pedido para entrega", venda.establishment_id)`; cancelada e trocada recusam (tabela); lê o cliente da venda; resolve; sem diferença nas nove colunas devolve a venda sem gravar; senão, numa transação, `updateMany({ where: { id, status: "concluida" } })` com as colunas (contagem 0 = a recusa da cancelada) e `registrarNoHistorico` com `action: "venda.pedido_para_entrega"`, `target_type: "venda"`, `target_id`, e:
- resumo: `Mudou a venda nº <numero> para entrega (<linha>)`, `Mudou a venda nº <numero> para retirada no balcão` ou `Mudou o endereço de entrega da venda nº <numero> (<linha>)`;
- `changes`: `{ campo: "for_delivery", antes, depois }` quando a marca muda, e `{ campo: "delivery_address", antes: linha ou null, depois: linha ou null }` quando o endereço muda.

- [ ] **Step 1: seção 5 da m97 (falhando):**
  - o Caixa da loja muda uma venda de retirada para entrega com `outro`: 200, a venda lida tem a cópia; uma linha `venda.pedido_para_entrega` com o resumo "para entrega (...)"; o Gestor da loja muda para `principal`: 200, resumo "Mudou o endereço de entrega..."; o Dono muda para retirada: 200, colunas nulas, resumo "para retirada no balcão";
  - o Vendedor da loja: 403 com a frase da tabela; o Gestor e o Caixa de outra loja: 404 (a leitura pelo alcance vem antes da permissão, então quem não vê a venda nem fica sabendo que ela existe); outro tenant: 404; o Caixa da loja numa venda de ontem (gravada com `sold_at` de ontem): 404, e o Gestor da loja muda a mesma venda: 200;
  - mandar os mesmos valores de novo: 200 e nenhuma linha nova no Histórico;
  - venda cancelada: 422 com a frase; venda trocada (`trocarAction`): 422 com a frase da trocada; a venda nova da troca aceita a mudança: 200;
  - Consumidor final marcado: 422 `customer_id`;
  - **não mexe em nada mais:** contagens de `StockMovement`, `CashMovement`, `FinancialEntry` e `EmporioSalePayment` iguais antes e depois de cada mudança aceita; `net_amount` e `status` iguais;
  - **Review Focus 3:** `Promise.all([cancelarVendaAction(gestor, ...), mudarPedidoParaEntregaAction(caixa, ...)])` repetido em 5 vendas novas: em toda rodada, ou a mudança aconteceu antes (e a venda cancelada fica com ela), ou recusou com a frase da cancelada; nunca um erro 500;
  - a rota `PATCH /api/v1/emporio/sales/:id/delivery` com `delivery_address_kind: "outro"` sem CEP: 422 `field` `delivery_zip`.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** implementar papel, histórico, action, rota e `endpoints.ts`.
- [ ] **Step 4:** `test:m97`, `test:m87`, `test:docs-api`, `tsc`, `check` (conferência 19 verde): verdes.
- [ ] **Step 5:** relatar os arquivos (commit: `Empório: quem fatura muda o pedido para entrega da venda fechada, com Histórico`).

### Task 6: O romaneio (dados, rota e papel)

**Files:**
- Modify: `src/lib/actions/emporio-impressao.ts` (`RomaneioView`, `lerRomaneioDaVendaAction`; `ImpressoVenda.pedido_para_entrega` e `.endereco_de_entrega`, preenchidos nas duas leituras de hoje pela cópia do pedido)
- Create: `src/app/api/v1/emporio/sales/[id]/packing-list/route.ts` (GET, padrão de `sales/[id]/receipt/route.ts`)
- Create: `src/app/(impressao)/emporio/imprimir/romaneio/[id]/page.tsx` (cópia da página da venda, título "Imprimir romaneio", `RomaneioCupom` em `?formato=cupom`, senão `RomaneioA4`)
- Create: `src/components/emporio/impresso/romaneio-a4.tsx`, `src/components/emporio/impresso/romaneio-cupom.tsx`
- Modify: `src/components/emporio/impresso/papel-a4.tsx`, `papel-cupom.tsx` (a linha da D8)
- Modify: `src/app/(public)/docs/api/endpoints.ts`
- Test: `scripts/m97-emporio-entrega-romaneio.test.ts` (seção 6)

**Interfaces:**
- Consumes: `lerVendaAction`, `lerLojaEClienteDoPapel` (privada, já no mesmo arquivo, lendo `EmporioCustomer` depois do plano 1), `enderecoDasColunas`, `linhaDoEndereco`; `TamanhoDaBobina`, `LogoDoPapel`.
- Produces: `RomaneioView`, `lerRomaneioDaVendaAction`, a rota `packing-list` e a página `/emporio/imprimir/romaneio/[id]`.

Dados: `emitida_em` = `sold_at`; `situacao` pela regra do plano 1 (`cancelada` pelo status; senão `trocada` se alguma devolução tem `exchange_sale_id`; senão `devolvida` se há devolução; senão `ativa`); `cliente` = o de `lerLojaEClienteDoPapel` sem o endereço, ou `{ nome: "Consumidor final", telefone: null, documento: null }`; `endereco_de_entrega` = `linhaDoEndereco(enderecoDasColunas(venda))`, só com a marca; `itens` na ordem da venda, `quantidade` por `numeroBr`; `linhas` = número de itens; `observacoes` = `notes`; `vendedor` e `caixa` como em `lerImpressoDaVendaAction`.

Papel (preto sobre branco, sem tokens do tema, como os outros papéis):
- **A4** (`<article className="a4">`, `@page { size: A4; margin: 12mm }`): cabeçalho da loja com logo; à direita "ROMANEIO", "Venda nº", "Orçamento nº" quando houver, data e hora; faixa grande "ENTREGA" ou "RETIRADA NO BALCÃO"; o aviso da D7 em caixa de borda grossa quando a situação não é `ativa`; bloco do cliente (nome, telefone, documento; na entrega, "Endereço de entrega" com a linha); vendedor e caixa; tabela com a caixa de marcar (`span` de 5 mm com borda, nunca um caractere), Produto, Apresentação, Quantidade; "<n> linhas de produto"; observações; o bloco de assinaturas com `break-inside: avoid`: "Separado por", "Conferido por", "Recebido por: nome, documento e assinatura", "Data: ____/____/______".
- **Bobina** (`<article className="cupom">`, obrigatório: `TamanhoDaBobina` mede `article.cupom`; largura de `largura_bobina`): o mesmo conteúdo em coluna, cada item com a caixa de marcar, "2 x Produto (Apresentação)"; linhas de assinatura em traço; nomes com `overflow-wrap: anywhere`.
- Nenhum valor em dinheiro no romaneio.

- [ ] **Step 1: seção 6 da m97 (falhando):**
  - `JSON.stringify` do romaneio de uma venda com desconto e fiado não tem `R$`, nem as chaves `preco`, `total`, `valor`, `subtotal`, `desconto`, `pagamentos`;
  - venda marcada com `outro`: `pedido_para_entrega` true e `endereco_de_entrega` igual a `linhaDoEndereco` da cópia; venda de retirada de cliente com endereço completo no cadastro: `endereco_de_entrega` nulo;
  - venda faturada de orçamento: `orcamento_origem` com 6 dígitos; `vendedor` e `caixa` preenchidos; `linhas` igual ao número de itens; `observacoes` igual a `notes`; Consumidor final: `cliente.nome` "Consumidor final" e documento nulo;
  - venda cancelada: `situacao: "cancelada"`; venda trocada: `"trocada"`; com devolução sem troca: `"devolvida"`;
  - depois de `mudarPedidoParaEntregaAction` para outro endereço, o romaneio relido traz o novo;
  - o Vendedor de outra loja e outro tenant: 404; a rota `GET .../packing-list`: 200 com `data.itens`;
  - `lerImpressoDoOrcamentoAction` de orçamento marcado: `pedido_para_entrega` true e a linha do endereço; da venda de retirada: false e nulo.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** implementar action, rota, página, os dois papéis, a linha da D8 e `endpoints.ts`.
- [ ] **Step 4:** `test:m97`, `test:m91`, `test:m94`, `test:docs-api`, `tsc`, `lint`, `check`: verdes; no `next dev`, abrir `/emporio/imprimir/romaneio/<id>?formato=a4` e `?formato=cupom` de uma venda de entrega e de uma cancelada.
- [ ] **Step 5:** relatar os arquivos (commit: `Empório: o romaneio da venda, sem preço, em A4 e na bobina`).

### Task 7: As telas: o balcão, a venda e o orçamento

**Files:**
- Create: `src/app/(dashboard)/emporio/_components/pedido-para-entrega-campos.tsx`
- Create: `src/app/(dashboard)/emporio/_components/mudar-pedido-para-entrega-form.tsx` (`FormSheet` do kit, título "Pedido para entrega")
- Modify: `src/app/(dashboard)/emporio/_components/balcao.tsx` (estado do pedido, `ORDEM`, corpo do orçamento e da venda, assinatura da chave, resumo com o romaneio), `balcao-orcamento.tsx` (`cargaDoOrcamento` leva o pedido; `ResumoDoOrcamento` diz "Pedido para entrega" com a linha), `venda-estado.ts` só se o tipo `CargaDoOrcamento` precisar do campo novo
- Modify: `src/app/(dashboard)/emporio/vendas/[id]/page.tsx`, `src/app/(dashboard)/emporio/vendas/page.tsx` (pílula "Entrega"), `src/app/(dashboard)/emporio/orcamentos/[id]/page.tsx`

**Interfaces:**
- Consumes: `OpcoesDeEntregaView` e a rota `delivery-options` (Task 3); `VendaView`/`OrcamentoView` com os campos novos; `pode(c, "fatura_na_loja", lojaId)` (Task 5); a página do romaneio (Task 6); o `ClienteForm` do plano 1 em modo `completar`; o componente de escolha do cliente do plano 2.
- Produces:
  ```ts
  export type CampoDoPedido = "for_delivery" | "delivery_address_kind" | "delivery_zip" | "delivery_street" | "delivery_number"
    | "delivery_complement" | "delivery_district" | "delivery_city" | "delivery_state";
  export type PedidoParaEntregaValor = {
    for_delivery: boolean; delivery_address_kind: EscolhaDoEndereco | "";
    outro: Record<"delivery_zip" | "delivery_street" | "delivery_number" | "delivery_complement" | "delivery_district" | "delivery_city" | "delivery_state", string>;
  };
  export const PEDIDO_RETIRADA: PedidoParaEntregaValor;
  export function corpoDoPedidoParaEntrega(v: PedidoParaEntregaValor): PedidoParaEntregaInput; // desmarcado: { for_delivery: false }
  export function valorDoPedido(x: { for_delivery: boolean; delivery_address_kind: EscolhaDoEndereco | null; delivery_address: EnderecoDoPedido | null }): PedidoParaEntregaValor;
  export function PedidoParaEntregaCampos(p: { valor: PedidoParaEntregaValor; aoMudar: (v: PedidoParaEntregaValor) => void;
    customerId: string | null; erros: Partial<Record<CampoDoPedido, string>>; idDe: (campo: CampoDoPedido) => string; aoMudarCadastro?: () => void }): JSX.Element;
  ```

Comportamento do `PedidoParaEntregaCampos`:
- Uma caixa de marcar "Pedido para entrega" (`input type="checkbox"`, alvo de 44 px, como no balcão), dentro de `<Field error={erros.for_delivery}>`.
- Marcada e com cliente escolhido, busca `GET /api/v1/emporio/customers/<id>/delivery-options` (de novo quando o cliente muda e depois de completar o cadastro). Com `falta_no_cliente`, mostra a frase e o botão "Completar cadastro" (`ClienteForm` em modo `completar` com o id do cliente; ao salvar, busca as opções de novo e chama `aoMudarCadastro`). Se o componente de escolha do plano 2 já mostra aviso e "Completar cadastro" no quadro do cliente, passe a frase para ele em vez de repetir o botão aqui. (Conferido pela sessão principal em 06/11: o plano 2 entrega `EscolherCliente` com a prop `aviso?: Falta | null`, que é esse gancho, e o `ClienteForm` com `open`, `onOpenChange`, `inicial`, `faltaInicial` e `onSalvo(ClienteView)`; `ClienteEscolhido` de `src/lib/emporio/cliente-escolhido.ts` tem a forma de `ClienteParaConferir` e serve direto para `faltaParaEntrega`. Use esses.)
- A escolha, em `<Field error={erros.delivery_address_kind}>`, com três opções (`input type="radio"`): "Endereço principal: <linha ou 'incompleto'>", "Endereço de entrega do cadastro: <linha>" (só se `cadastro_entrega` existe) e "Outro endereço (só para este pedido)". Trocar o cliente limpa a escolha e mantém a marca.
- "Outro endereço" mostra os sete campos, cada um num `<Field>` com `error=`: CEP (`inputMode="numeric"`, nunca `type="number"`), rua, número, complemento, bairro, cidade, UF (Select do kit com `UFS`). Os campos ficam montados enquanto "Outro" estiver escolhido, e só então o servidor pode recusá-los (as outras escolhas recusam em `delivery_address_kind`).
- Ao desmarcar, nada é apagado do estado até o envio, mas o corpo leva só `{ for_delivery: false }`.

No balcão:
- `ORDEM` passa a `establishment_id, number, quote_id, items, customer_id, for_delivery, delivery_address_kind, delivery_zip, delivery_street, delivery_number, delivery_complement, delivery_district, delivery_city, delivery_state, payments, notes, seller_user_id, cash_register_id` (o nome `customer_id` é o do plano 1; confira o `ORDEM` que o plano 2 deixou e encaixe os campos novos logo depois do cliente).
- O bloco aparece logo abaixo do cliente, nos dois modos (Venda e Orçamento). `corpoDoPedidoParaEntrega(valor)` vai no corpo de `POST /quotes` e de `POST /sales`. **A assinatura da `operation_key` inclui o pedido**: mudar a marca ou o endereço gera outra chave.
- `carregarNaVenda` (faturar) preenche o valor com `valorDoPedido(orcamento)`; "Novo atendimento", trocar de loja e gravar voltam a `PEDIDO_RETIRADA`.
- O resumo da venda registrada ganha "Romaneio A4" e "Romaneio cupom" (`/emporio/imprimir/romaneio/<id>?formato=a4|cupom`, `target="_blank"`), ao lado de "Imprimir A4" e "Imprimir cupom", e a frase "para entrega" quando marcada.

Na venda (`/emporio/vendas/[id]`):
- Botões "Romaneio A4" e "Romaneio cupom" junto dos de impressão, em toda venda.
- Bloco "Retirada no balcão" ou "Pedido para entrega" com a linha do endereço. Com `pode(c, "fatura_na_loja", venda.establishment_id)` e a venda nem cancelada nem trocada, o botão "Mudar" abre o `MudarPedidoParaEntregaForm` (`FormSheet`, `PedidoParaEntregaCampos` pré-preenchido por `valorDoPedido(venda)`, `PATCH /api/v1/emporio/sales/<id>/delivery`, `ORDEM` com `customer_id` e os campos do pedido; a recusa em `customer_id` aparece embaixo do nome do cliente no topo do painel; ao salvar, `router.refresh()`).

No orçamento (`/emporio/orcamentos/[id]`): a linha "Pedido para entrega: <endereço>" ou "Retirada no balcão".

- [ ] **Step 1:** implementar. Sem teste automático novo (padrão das telas deste módulo); a prova é o roteiro da Task 8.
- [ ] **Step 2:** `tsc`, `lint`, `check` (conferências 7, 10, 11, 14 e 15 em especial): verdes.
- [ ] **Step 3:** no `next dev` (`npx tsx scripts/_sessao-local.ts` para a sessão): orçamento para entrega com "Outro endereço", faturar e ver a marca e o endereço já preenchidos, ver a recusa do principal incompleto embaixo da escolha, mudar na tela da venda.
- [ ] **Step 4:** relatar os arquivos (commit: `Empório: pedido para entrega no balcão, mudança na venda e romaneio oferecido com o cupom`).

### Task 8: Cenário e roteiro no navegador, com impressão vista de verdade

**Files:**
- Create: `scripts/_cenario-emporio-romaneio.ts` (travado por `exigirBancoLocal()`, no padrão de `_cenario-emporio-orcamento.ts`; conta própria com prefixo "Rom": uma loja com bobina de **58 mm**, um produto com nome de 60 caracteres e outro curto, Vendedor, Caixa e Gestor da loja, o caixa com turno aberto, cliente PF "Rom Cliente PF" com nome, telefone e endereço principal incompleto e **sem CPF**, cliente PJ "Rom Cliente PJ" completa com endereço de entrega)
- Create: `scripts/navegador/emporio-romaneio.py` (cabeçalho com `cenario:` e as sessões `caixa`, `gestor`, `vendedor`)

Roteiro:
1. O Vendedor abre Vender > Orçamento, escolhe "Rom Cliente PF", inclui os dois produtos, marca "Pedido para entrega": aparece "Para entrega, informe o CPF do cliente." e o botão "Completar cadastro"; completa o CPF no painel; escolhe "Endereço principal" e salva: a recusa do principal incompleto aparece **embaixo da escolha do endereço** (Review Focus 1); escolhe "Outro endereço", tenta sem número (recusa embaixo do Número), completa e salva.
2. Pela API (`api("GET", ...)`), o cadastro do cliente não ganhou o endereço "outro".
3. O papel do orçamento (A4) mostra "PEDIDO PARA ENTREGA" e o endereço.
4. O Caixa digita o número no balcão: a marca e o "Outro endereço" vêm preenchidos; fecha a venda em dinheiro; o resumo oferece "Imprimir cupom" e "Romaneio cupom".
5. **Romaneio A4:** "ROMANEIO", "ENTREGA", o endereço, "Orçamento nº", o vendedor e o caixa, as linhas de assinatura, nenhum "R$" no texto; o número de caixas de marcar igual ao de linhas de produto; na mídia de impressão o botão some e nada sobra acima do papel; com 40 linhas injetadas na tabela pelo `js`, o bloco de assinaturas não começa numa folha e termina noutra (topo e base na mesma página de 297 mm).
6. **Romaneio na bobina:** a regra `@page` com `size: 58mm <altura>mm`; o PDF (`Page.printToPDF`) numa página só, de 58 mm; nada passa da largura com o nome longo (Review Focus 4).
7. O Caixa faz uma venda direta para o Consumidor final e tenta marcar entrega: recusa embaixo do cliente; desmarca e fecha; o romaneio diz "RETIRADA" e não tem "Endereço de entrega".
8. Na venda da PJ (feita pelo Caixa como retirada), o Vendedor não vê "Mudar"; o Caixa muda para entrega com o endereço de entrega do cadastro; o romaneio reimpresso traz o endereço; o Gestor vê a linha "Mudou a venda nº ... para entrega" no Histórico.
9. O Gestor cancela essa venda: o romaneio mostra "VENDA CANCELADA: NÃO SEPARAR" e a venda não oferece mais "Mudar".
10. A 390 px: o balcão com o bloco de entrega aberto em "Outro endereço", a venda e o painel "Pedido para entrega" sem rolagem horizontal.

- [ ] **Step 1:** cenário e roteiro; com o `npm run dev` de pé, `npm run navegador -- emporio-romaneio`: verde.
- [ ] **Step 2: prova nos dois sentidos.** (a) Fazer `lerRomaneioDaVendaAction` devolver o endereço também na retirada: o passo 7 reprova; restaurar. (b) Trocar, em `resolverPedidoParaEntrega`, o `field` do principal incompleto para `delivery_zip`: o passo 1 reprova (a recusa some); restaurar. Ver passar depois de cada restauração.
- [ ] **Step 3:** rodar de novo `emporio-orcamento`, `emporio-impressao` e `emporio-clientes` (do plano 1): verdes.
- [ ] **Step 4:** ver no celular de verdade (ou relatar que não houve aparelho): o balcão com a entrega marcada e o romaneio aberto.
- [ ] **Step 5:** relatar os arquivos e o que se viu nos PDFs (commit: `Empório: roteiro do pedido para entrega e do romaneio, com a impressão conferida`).

### Task 9: Manual, demonstração, spec, dívidas e handoff

**Files:**
- Modify: `scripts/cenario-demonstracao-emporio.ts` (um orçamento para entrega com "Outro endereço", faturado; uma venda de retirada)
- Modify: `scripts/navegador/manual-emporio.py` (figuras novas: o balcão com "Pedido para entrega" marcado e o romaneio A4, no padrão das outras, computador e celular)
- Modify: `src/app/(dashboard)/manual/_conteudo/partes-tarefa-3.tsx` (parte nova "Pedido para entrega e romaneio": marcar, completar o cadastro ali mesmo, as três escolhas de endereço, faturar herda, o caixa completa mas não fatura incompleto, mudar depois de fechada e quem pode, imprimir o romaneio, retirada no balcão e entrega pela logística, as três assinaturas, o aviso de venda cancelada ou trocada), `conteudos.tsx`, `indice.ts`, `figuras.ts`; `partes-consulta.tsx` (perguntas: "O cliente não quer dar o CPF, mas quer entrega", "Posso mudar o endereço depois de fechar a venda?", "Por que o romaneio não tem preço?"); `partes-funcao.tsx` (Sou Caixa: muda a entrega da venda fechada; o Vendedor não)
- Modify: `docs/specs/module-39-meu-emporio.md`, `docs/agents/dividas.md`, `docs/agents/current-handoff.md`

Decisões para a spec, uma linha cada no formato da tabela, com os **próximos números livres depois das do plano 2** (conferir a última linha da tabela): D1 a D8 deste plano, mais uma linha com o romaneio (rota, formatos, conteúdo) e uma com as recusas e o `field` delas. Marcar que a D8 e a permissão `fatura_na_loja` (que deixa o Vendedor de fora, embora ele fature hoje) são para o usuário confirmar.

Dívidas (seção nova em `docs/agents/dividas.md`): acompanhar a entrega no sistema (futuro, pedido pelo usuário); o orçamento não muda a entrega depois de salvo; a venda da troca nasce como retirada; o romaneio não conta volumes.

- [ ] **Step 1:** cenário de demonstração no `tibe_dev` (URL inline) e `npm run seed:demo` sem erro.
- [ ] **Step 2:** manual e figuras; `npm run navegador -- manual-emporio`: verde.
- [ ] **Step 3:** spec, dívidas e handoff (a migração `20261107120000_emporio_pedido_para_entrega` **não** está no Neon; ela é só acréscimo e pode ir antes do push a qualquer hora, mas as do plano 1 exigem a janela fora do horário das lojas).
- [ ] **Step 4:** `check`, `tsc`, `lint`: verdes; relatar os arquivos (commit: `Empório: manual, demonstração e decisões do pedido para entrega e do romaneio`).

### Task 10: Suíte inteira e o passo parado do Neon

**Files:** nenhum.

- [ ] **Step 1:** `npm run test:all -- --sem-redis` com as URLs inline: relatar o resumo.
- [ ] **Step 2:** `npx prisma migrate status` contra o Neon (só leitura, URL Direct inline): relatar quais migrações dos planos 1, 2 e 3 estão pendentes.
- [ ] **Step 3: PARADO.** Aplicar no Neon **só com autorização explícita do usuário na conversa**, que cite a migração, e na ordem das migrações (as do plano 1 primeiro, na janela fora do horário das lojas). A autorização não se deduz de rodada anterior nem vem de subagente. Depois, `migrate status` em dia. Merge na `main` e push exigem a autorização própria do invariante 7.
