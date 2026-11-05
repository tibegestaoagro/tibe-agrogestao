# Empório, entrega 4: orçamento. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O balcão ganha o modo Orçamento. O orçamento salvo tem número, validade, cliente e vendedor, sai em A4 e na bobina, aparece numa lista de acompanhamento e vira venda pelo vendedor no balcão ou pelo Caixa digitando o número.

**Architecture:** Dois modelos novos, `EmporioQuote` e `EmporioQuoteItem`, e a coluna `EmporioSale.quote_id`. O cálculo de preço, desconto e vendedor da venda sai de `prepararVenda` para funções compartilhadas, usadas pelo orçamento e pela venda. Faturar é a venda de sempre (`venderAction`) com `quote_id`: o servidor confere o orçamento, ajusta o preço-base e marca o orçamento na mesma transação. A situação (aberto, vencido, faturado) nunca é gravada: sai de `valid_until` e de `sale_id`.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Postgres 17, Zod 4, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-04-emporio-orcamento-caixa-impressao-design.md`, seção "Entrega 4: orçamento" (e "Os dois papéis", para o papel). Spec do módulo: `docs/specs/module-39-meu-emporio.md`; as decisões desta entrega entram a partir da **Q176**.

## Global Constraints

- **As oito invariantes do `CLAUDE.md`.** Em especial: nunca travessão (U+2014); nada de heredoc para escrever arquivo; regra de negócio em `src/lib/actions`, com a rota fina; migração antes do push; todo model com `tenant_id` em `TENANT_SCOPED_MODELS` (`npm run test:isolation`).
- **Ordem action, rota, tela.** Toda rota nova é documentada em `src/app/(public)/docs/api/endpoints.ts` (`npm run test:docs-api`).
- **Permissão:** sai de `src/lib/emporio/papel.ts` (`pode`, `exigir`, `papelDoEmporio`). Escrita registra no Histórico (`registrarNoHistorico`, `src/lib/emporio/historico.ts`); a conferência 19 do `npm run check` reprova action de escrita do Empório sem ele.
- **Recusa de campo:** sai com `field` (4º parâmetro de `fail`), com o nome do campo na API; o Zod passa por `apiErroDeZod`; na tela, todo campo do `ORDEM` renderiza `error=` (conferência 15).
- **Suíte nova `test:m94`** (`scripts/m94-emporio-orcamento.test.ts`, entrada no `package.json`): escrita a partir da spec e vista falhando antes. Sempre com as URLs locais inline:
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m94`
- **Migração local:** `migrate diff` e `db:deploy`, os dois com a URL do Docker inline, SQL salvo à mão; **nunca no Neon** nesta branch; tirar do SQL os `DROP INDEX` de `WhatsAppProviderConfig_one_active` e `AnimalBatch_tenant_ear_tag_key`.
- **Arquivo novo só conta no `npm run check` depois de `git add -N`** (o check lê `git ls-files`).
- **Subagente não commita:** deixa no working tree e relata os arquivos.
- **Venda em teste precisa de turno aberto** (`abrirTurnoDeTeste` de `scripts/_emporio-turno.ts`).
- **Dinheiro em centavos inteiros** nas contas; `Decimal` só na gravação.

### Decisões do usuário nesta rodada (05/11)

| pergunta | decisão |
|---|---|
| a venda que saiu de um orçamento é cancelada | o orçamento **volta a aberto** e pode ser faturado de novo; a venda cancelada continua dizendo de qual orçamento veio |
| dentro da validade, o preço do dia baixou | vale **o menor** entre o orçado e o de hoje |
| quem vê a lista de orçamentos | **Vendedor para cima**; o Caixa só fatura digitando o número |

### Valores fixados por este plano (o que a spec deixou ao builder)

| o quê | valor |
|---|---|
| modelo | `EmporioQuote`: `id`, `tenant_id`, `establishment_id`, `operation_key`, `number Int`, `contact_id String` (obrigatório), `seller_user_id String?`, `created_by_user_id String?`, `valid_until DateTime @db.Date`, `net_amount Decimal(14,2)`, `discount_amount Decimal(14,2) @default(0)`, `discount_authorized_by_user_id String?`, `sale_id String? @unique` (a venda **ativa** que o faturou), `notes String?`, `created_at`, `updated_at`. Únicos `[tenant_id, operation_key]` e `[tenant_id, number]`; índices `[tenant_id, establishment_id, created_at]` e `[tenant_id, contact_id]` |
| itens | `EmporioQuoteItem`: `id`, `tenant_id`, `quote_id` (Cascade), `emporio_product_id`, `presentation_id` (Restrict), `quantity Decimal(14,3)`, `suggested_price Decimal(14,2)?`, `unit_price Decimal(14,2)`, `total Decimal(14,2)`; índices `[tenant_id]`, `[quote_id]` |
| relações | `EmporioQuote.sale` (`"QuoteInvoice"`, `sale_id`, `onDelete: SetNull`); `EmporioSale.quote_id String?` (`"SaleFromQuote"`, `onDelete: Restrict`), **sem** `@unique` (a venda cancelada guarda o orçamento, e a nova também); índice `[tenant_id, quote_id]` |
| migração | `prisma/migrations/20261105150000_emporio_orcamento`, aditiva |
| número | `proximoNumero(tx, "orcamento")` (`src/lib/emporio/numeracao.ts`, a chave já existe), exibido com `formatarNumero` |
| validade | `valid_until = somarDias(hojeEmBrasilia(), EmporioSettings.quote_validity_days)` (`src/lib/emporio/cartao.ts`); sem linha de configuração, 7 dias. Vale **até o fim** do dia `valid_until` em Brasília |
| situação (derivada, nunca gravada) | `faturado` se `sale_id` preenchido; senão `vencido` se `hojeEmBrasilia() > valid_until`; senão `aberto` |
| cliente do orçamento | obrigatório, ativo, **não** Consumidor final (`system_key === "consumidor_final"`) e com cadastro completo (`cadastroIncompleto` de `src/lib/contatos/cadastro.ts` falso) |
| vendedor do orçamento | a mesma regra da venda (Q168, Q169): o Caixa escolhe (`SELLER_REQUIRED`, `INVALID_SELLER`), os demais ficam como vendedor sem o campo |
| preço e desconto do orçamento | a mesma regra da venda (Q85, `max_discount_pct`, `DISCOUNT_ABOVE_LIMIT`), pelas funções extraídas na Task 1 |
| quem salva orçamento e lê um orçamento | `vendedor_da_loja` (inclui o Caixa, nas lojas dele) |
| quem lista e busca | `fora_do_caixa` (o Caixa recebe 403) |
| busca `q` | só dígitos com 1 a 6 dígitos: também pelo número; dígitos (3 ou mais): `contact.phone` e `contact.document` comparados só pelos dígitos; texto: `contact.name_busca contains normalizarTermo(q)` (`src/lib/actions/whatsapp-handlers/shared.ts`) |
| filtro `situacao` | `acompanhamento` (padrão: aberto e vencido), `aberto`, `vencido`, `faturado`, `todos`; ordem por `created_at` decrescente; `limit` padrão 200, máximo 500 |
| faturar | `POST /api/v1/emporio/sales` com `quote_id`. Só na loja do orçamento. Vendedor da venda = vendedor do orçamento (`vendedorHerdado`, como na troca), e o Caixa não precisa mandar `seller_user_id` |
| preço-base ao faturar | para cada item da venda cuja apresentação está no orçamento: dentro da validade, o preço-base (o `suggested_price` da venda) é `min(preço orçado, preço de hoje)`, e o orçado se hoje não houver preço; vencido, o preço de hoje (regra normal). Item fora do orçamento: regra normal |
| marcar faturado | na transação da venda, `emporioQuote.updateMany({ where: { id, sale_id: null }, data: { sale_id } })`; contagem 0 aborta com `QUOTE_ALREADY_INVOICED` |
| cancelar a venda | na transação de `cancelarVendaAction`, `emporioQuote.updateMany({ where: { sale_id: venda.id }, data: { sale_id: null } })` |
| Histórico | `orcamento.criar` (alvo `orcamento`); a venda faturada continua `venda.criar`, com "do orçamento nº X" no resumo |
| papel | `/emporio/imprimir/orcamento/[id]?formato=a4\|cupom`. A4: título ORÇAMENTO, "Válido até dd/mm/aaaa" em destaque no lugar das formas de pagamento, rodapé `quote_footer`. Bobina: "ORÇAMENTO" / "SEM VALOR FISCAL", "Orçamento nº", "Válido até". A venda faturada mostra "Orçamento nº X" nos dois papéis |
| páginas | `/emporio/orcamentos` (rótulo "Orçamentos", logo depois de Vendas no menu, `exige: "fora_do_caixa"`) e `/emporio/orcamentos/[id]`; o balcão aceita `/emporio/vender?orcamento=<id>` |

### Recusas (código, status, `field`, mensagem exata)

| código | status | field | mensagem |
|---|---|---|---|
| `QUOTE_CUSTOMER_REQUIRED` | 422 | `contact_id` | `O orçamento precisa de um cliente com nome, documento e telefone.` |
| `QUOTE_CUSTOMER_INCOMPLETE` | 422 | `contact_id` | `Complete o cadastro do cliente (nome, documento e telefone) antes de salvar o orçamento.` |
| `QUOTE_NOT_FOUND` | 404 | `quote_id` (no lookup, `number`) | `Orçamento não encontrado nesta loja.` |
| `QUOTE_OTHER_STORE` | 422 | `quote_id` | `Este orçamento é de outra loja. Fature na loja dele.` |
| `QUOTE_ALREADY_INVOICED` | 409 | `quote_id` | `Este orçamento já foi faturado na venda nº <número formatado>.` |

## Review Focus

1. **Dois balcões faturando o mesmo orçamento ao mesmo tempo:** sai uma venda só; a outra recebe `QUOTE_ALREADY_INVOICED` e nada dela fica gravado (nem estoque, nem caixa). Teste na Task 3, com `Promise.all`.
2. **O orçamento válido até hoje, faturado às 23h50 de Brasília** (já é amanhã em UTC): ainda vale o preço orçado. No dia seguinte, vale o de hoje. Teste na Task 3, gravando `valid_until` no banco.
3. **O preço baixou depois do orçamento:** vale o menor, e o desconto sobre ele continua no limite da loja. Teste na Task 3.
4. **A venda do orçamento é cancelada:** o orçamento volta a aberto, fatura de novo, e as duas vendas guardam o `quote_id`. Teste na Task 3.
5. **O Caixa:** salva orçamento só com vendedor escolhido; fatura sem escolher, e o vendedor é o do orçamento; recebe 403 na lista. Testes nas Tasks 1, 2 e 3.

---

### Task 1: O orçamento salvo (schema, cálculo compartilhado, action e rotas de gravar e ler)

**Files:**
- Modify: `prisma/schema.prisma` (modelos novos, `EmporioSale.quote_id`, relações inversas em `Tenant`, `Establishment`, `Contact`, `EmporioProduct`, `ProductPresentation`)
- Create: `prisma/migrations/20261105150000_emporio_orcamento/migration.sql`
- Modify: `src/lib/prisma.ts` (`TENANT_SCOPED_MODELS`): `EmporioQuote`, `EmporioQuoteItem`
- Create: `src/lib/emporio/precificar.ts`
- Modify: `src/lib/actions/emporio-vendas.ts` (`prepararVenda` passa a usar `precificar.ts`)
- Modify: `src/lib/emporio/venda-schema.ts` (`corpoDoOrcamentoSchema`)
- Create: `src/lib/actions/emporio-orcamentos.ts`
- Create: `src/app/api/v1/emporio/quotes/route.ts` (POST nesta task; GET na Task 2), `src/app/api/v1/emporio/quotes/[id]/route.ts`
- Modify: `src/app/(public)/docs/api/endpoints.ts`, `package.json`
- Test: `scripts/m94-emporio-orcamento.test.ts` (seção 1)

**Interfaces:**
- Produces, em `src/lib/emporio/precificar.ts` (extraído de `emporio-vendas.ts`, linhas ~521-646, sem mudar o comportamento da venda):
  - `precificarItens(db, ator, loja: { id; max_discount_pct }, items: VendaItemInput[], opts?: { precoBase?: Map<string, number> }): Promise<ActionResult<ItensPrecificados>>`, onde `precoBase` (centavos por `presentation_id`) substitui o preço sugerido daquela apresentação; `ItensPrecificados = { itens: { emporio_product_id; presentation_id; quantity; suggested_cent: number | null; unit_cent; total_cent; produto; apresentacao }[]; total_cent; desconto_cent; autorizou: string | null }`
  - `resolverVendedor(db, ator, lojaId, sellerUserId?: string, herdado?: string | null): Promise<ActionResult<string>>`
- Produces, em `src/lib/actions/emporio-orcamentos.ts`:
  - `salvarOrcamentoAction(db, ator, input: OrcamentoInput): Promise<ActionResult<OrcamentoView & { replayed: boolean }>>`, com `OrcamentoInput = { operation_key; establishment_id; contact_id; items: VendaItemInput[]; seller_user_id?; notes? }`
  - `lerOrcamentoAction(db, ator, id): Promise<ActionResult<OrcamentoView>>`
  - `type OrcamentoView = { id; number; numero: string; establishment_id; loja: string; contact: { id; name; phone; document }; seller_user_id; seller_name; created_by_name; created_at; valid_until: string /* AAAA-MM-DD */; situacao: "aberto" | "vencido" | "faturado"; sale: { id; numero } | null; vendas: { id; numero; status }[]; net_amount: number; discount_amount: number; notes; items: OrcamentoItemView[] }`
  - `type OrcamentoItemView = { presentation_id; emporio_product_id; produto; apresentacao; quantity: number; preco_orcado: number; preco_hoje: number | null; preco_que_vale: number | null; mudou: boolean; saldo_base: number; falta: boolean; total: number }`. `preco_que_vale` segue a regra do preço-base ao faturar; `mudou` é `preco_que_vale !== preco_orcado`; `saldo_base` é o saldo da loja na unidade-base (pela mesma conta de `gravarVenda`, `custoMedio` sobre os movimentos da loja); `falta` é `quantity` na unidade-base maior que `saldo_base`.
- Rotas: `POST /api/v1/emporio/quotes` (201; replay 200), `GET /api/v1/emporio/quotes/[id]` (404 fora do alcance).

- [ ] **Step 1: Escrever a seção 1 da m94 (falhando).** Casos, cada um com o texto exato da mensagem:
  - o Vendedor salva com cliente completo: 201, `numero` "000001" no tenant novo, `valid_until` = hoje de Brasília + `quote_validity_days`, `situacao` "aberto", `seller_user_id` = o Vendedor; nenhum `StockMovement`, `CashMovement` ou `FinancialEntry` novo;
  - mesma `operation_key`: 200, mesmo id, `replayed: true`;
  - segundo orçamento: "000002"; a numeração não conflita com a da venda;
  - Consumidor final: `QUOTE_CUSTOMER_REQUIRED`; sem `contact_id`: a mesma; cliente sem documento: `QUOTE_CUSTOMER_INCOMPLETE`;
  - Caixa sem `seller_user_id`: `SELLER_REQUIRED`; com vendedor de outra loja: `INVALID_SELLER`; com vendedor válido: 201, `created_by` o Caixa;
  - desconto acima de `max_discount_pct` pelo Vendedor: `DISCOUNT_ABOVE_LIMIT`; pelo Gestor: 201 com `discount_authorized_by_user_id`;
  - item sem preço na loja: a mesma recusa da venda;
  - Histórico com `orcamento.criar`;
  - `lerOrcamentoAction` por outro tenant: 404; pelo Vendedor de outra loja: 404;
  - regressão: m84, m87, m89, m91, m92 e m93 seguem verdes depois da extração.
- [ ] **Step 2:** rodar `test:m94` e ver falhar por falta do módulo.
- [ ] **Step 3:** schema, migração (diff com a URL local, conferir o SQL, `db:deploy` local), `TENANT_SCOPED_MODELS`.
- [ ] **Step 4:** extrair `precificarItens` e `resolverVendedor`; `prepararVenda` passa a chamá-las. Rodar m84, m87, m89, m91, m92 e m93: verdes.
- [ ] **Step 5:** `salvarOrcamentoAction`, `lerOrcamentoAction`, `corpoDoOrcamentoSchema`, as duas rotas e `endpoints.ts`.
- [ ] **Step 6:** `test:m94`, `test:isolation`, `test:docs-api`, `npx tsc --noEmit`, `npm run check` (com `git add -N` nos arquivos novos): verdes.
- [ ] **Step 7:** relatar os arquivos (o controlador commita).

### Task 2: A lista e a busca pelo número

**Files:**
- Modify: `src/lib/actions/emporio-orcamentos.ts`
- Modify: `src/app/api/v1/emporio/quotes/route.ts` (GET)
- Create: `src/app/api/v1/emporio/quotes/lookup/route.ts`
- Modify: `src/app/(public)/docs/api/endpoints.ts`
- Test: `scripts/m94-emporio-orcamento.test.ts` (seção 2)

**Interfaces:**
- Consumes: `OrcamentoView` (Task 1).
- Produces:
  - `listarOrcamentosAction(db, ator, f: { establishment_id?; q?; situacao?: "acompanhamento" | "aberto" | "vencido" | "faturado" | "todos"; limit? }): Promise<ActionResult<OrcamentoLinha[]>>`, `type OrcamentoLinha = { id; numero; loja; cliente; telefone: string | null; valor: number; criado_em: string; valid_until: string; situacao; venda_numero: string | null; vendedor: string | null }`. Sem loja: as lojas que o ator vê.
  - `buscarOrcamentoPorNumeroAction(db, ator, establishmentId: string, numero: number): Promise<ActionResult<OrcamentoView>>` (`vendedor_da_loja`; inclui o Caixa).
- Rotas: `GET /api/v1/emporio/quotes?establishment_id=&q=&situacao=&limit=` e `GET /api/v1/emporio/quotes/lookup?establishment_id=&number=`.

- [ ] **Step 1: seção 2 da m94 (falhando):**
  - busca por número ("12" acha o 000012), por telefone com máscara ("(34) 99999-0000" acha pelo dígito), por CPF com pontos, por nome sem acento ("joao" acha "João");
  - `situacao` padrão traz aberto e vencido e não traz faturado; `vencido` (gravando `valid_until` ontem) e `faturado` (gravando `sale_id`) filtram;
  - o Gestor da Loja 1 não vê orçamento da Loja 2; com `establishment_id` da Loja 2: 404;
  - o Caixa na lista: 403; o Caixa no lookup da loja dele: 200; número de outra loja: `QUOTE_NOT_FOUND` no campo `number`.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** implementar as actions, as rotas e `endpoints.ts`.
- [ ] **Step 4:** `test:m94`, `test:docs-api`, `tsc`, `check`: verdes.
- [ ] **Step 5:** relatar os arquivos.

### Task 3: Faturar o orçamento (venda com `quote_id`) e o cancelamento que o reabre

**Files:**
- Modify: `src/lib/actions/emporio-vendas.ts` (`VenderInput.quote_id?`, `venderAction`, `gravarVenda`, `cancelarVendaAction`, `VendaView`)
- Modify: `src/lib/emporio/venda-schema.ts` (`quote_id` opcional no corpo da venda)
- Modify: `src/app/(public)/docs/api/endpoints.ts` (o campo novo de `POST /sales`)
- Test: `scripts/m94-emporio-orcamento.test.ts` (seção 3)

**Interfaces:**
- Consumes: `precificarItens(..., { precoBase })`, `resolverVendedor(..., herdado)` (Task 1).
- Produces: `VendaView` ganha `quote: { id; numero } | null`. `venderAction` com `quote_id` aplica as regras de "faturar", "preço-base ao faturar" e "marcar faturado" da tabela; `cancelarVendaAction` reabre o orçamento.

- [ ] **Step 1: seção 3 da m94 (falhando):**
  - faturar dentro da validade com preço de hoje maior: a venda sai com o preço orçado como `suggested_price`, sem desconto; o orçamento fica `faturado` com `sale.numero`;
  - preço de hoje menor: a venda usa o de hoje como base;
  - orçamento vencido: vale o preço de hoje;
  - `valid_until` = hoje de Brasília e a venda às 23h50 de Brasília (`sold_at`): ainda vale o orçado;
  - o Caixa fatura sem `seller_user_id`: 201, vendedor = o do orçamento;
  - outra loja: `QUOTE_OTHER_STORE`; outro tenant ou id inexistente: `QUOTE_NOT_FOUND`;
  - faturar de novo: `QUOTE_ALREADY_INVOICED` com o número da venda na mensagem;
  - duas vendas ao mesmo tempo (`Promise.all`, chaves diferentes): uma 201 e outra `QUOTE_ALREADY_INVOICED`; o estoque baixou uma vez só;
  - cancelar a venda: o orçamento volta a `aberto`; faturar de novo: 201; as duas vendas têm `quote_id`; `vendas` do orçamento lista as duas;
  - a mesma `operation_key` da venda faturada: replay, sem mudar o orçamento;
  - item a mais, fora do orçamento, na mesma venda: regra normal de preço.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** implementar; o `QUOTE_ALREADY_INVOICED` dentro da transação usa `AbortarVenda`, como as outras recusas de dentro dela.
- [ ] **Step 4:** `test:m94` e m84, m87, m89, m91, m92, m93; `tsc`, `check`: verdes.
- [ ] **Step 5:** relatar os arquivos.

### Task 4: O papel do orçamento, e o orçamento de origem no papel da venda

**Files:**
- Modify: `src/lib/actions/emporio-impressao.ts` (`ImpressoVenda` ganha `tipo: "venda" | "orcamento"`, `validade: string | null`, `orcamento_origem: string | null`; nova `lerImpressoDoOrcamentoAction(db, ator, quoteId)`)
- Modify: `src/components/emporio/impresso/papel-a4.tsx`, `src/components/emporio/impresso/papel-cupom.tsx`
- Create: `src/app/(impressao)/emporio/imprimir/orcamento/[id]/page.tsx` (como a de venda, `?formato=a4|cupom`, na largura configurada)
- Test: `scripts/m94-emporio-orcamento.test.ts` (seção 4), e o que a `m91` fixa do papel da venda continua verde

- [ ] **Step 1: seção 4 da m94 (falhando):** o impresso do orçamento tem `tipo` "orcamento", `validade` "dd/mm/aaaa", sem pagamentos, `rodape` = `quote_footer`, vendedor; o da venda faturada tem `orcamento_origem` = "000001"; o da venda sem orçamento, `null`; o Vendedor de outra loja: 404.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** implementar a action, os dois papéis (título ORÇAMENTO, "Válido até" em destaque no A4; "ORÇAMENTO" / "SEM VALOR FISCAL", "Orçamento nº" e "Válido até" na bobina; "Orçamento nº X" na venda) e a página de impressão.
- [ ] **Step 4:** `test:m94`, `test:m91`, `tsc`, `check`: verdes.
- [ ] **Step 5:** relatar os arquivos.

### Task 5: O balcão: modo Orçamento e faturar

**Files:**
- Modify: `src/app/(dashboard)/emporio/vender/page.tsx` (lê `?orcamento=<id>` e passa o `OrcamentoView` inicial)
- Modify: `src/app/(dashboard)/emporio/_components/balcao.tsx`, `_components/venda-estado.ts`, `_components/venda-campos.tsx`
- Create, se o `balcao.tsx` passar de ~500 linhas: `_components/balcao-orcamento.tsx`

Comportamento:
- Um seletor **Venda | Orçamento** no topo do balcão. No Orçamento somem as formas de pagamento e a escolha do caixa; ficam loja, cliente, vendedor (para o Caixa), itens e observação. O cliente tem de ser completo (a recusa chega em `contact_id`).
- Dois botões no Orçamento: **Salvar orçamento** (`POST /api/v1/emporio/quotes`, com `operation_key` e assinatura como a venda) e **Faturar** (passa para Venda com o carrinho, sem `quote_id`).
- Depois de salvar: o resumo "Orçamento nº 000012 salvo, válido até 12/11/2026" com **Imprimir A4**, **Imprimir cupom**, **Faturar agora** (carrega o orçamento na Venda) e **Novo atendimento**.
- Na Venda, o campo **Orçamento nº** com **Carregar** (`GET /quotes/lookup` da loja escolhida). Carregado: os itens com `preco_que_vale` como preço, o cliente do orçamento, o vendedor travado no do orçamento, e a faixa "Faturando o orçamento nº X" com **Tirar orçamento**. Avisos: vencido ("Orçamento vencido em dd/mm/aaaa: vale o preço de hoje."), item com `mudou` ("O preço mudou: orçado R$ X, hoje vale R$ Y."), item com `falta` ("Falta estoque: há N na loja."). O envio leva `quote_id`.
- `quote_id` e `number` entram no `ORDEM`, com `error=` no campo. Trocar de loja tira o orçamento carregado. Venda gravada ou "Novo atendimento" limpa o orçamento, como já limpa o vendedor (ruling da entrega 3).
- `?orcamento=<id>` abre o balcão na Venda com o orçamento carregado.

- [ ] **Step 1:** implementar. Sem teste automático (padrão das telas deste módulo); a prova é o roteiro da Task 7.
- [ ] **Step 2:** `tsc`, `lint`, `check`: verdes; abrir `/emporio/vender` no `next dev` e salvar e faturar um orçamento à mão uma vez.
- [ ] **Step 3:** relatar os arquivos.

### Task 6: As páginas de Orçamentos e o orçamento na venda

**Files:**
- Create: `src/app/(dashboard)/emporio/orcamentos/page.tsx`, `src/app/(dashboard)/emporio/orcamentos/[id]/page.tsx`, `src/app/(dashboard)/emporio/orcamentos/_components/orcamentos-filtro.tsx`
- Modify: `src/lib/emporio/paginas.ts` ("Orçamentos" depois de "Vendas", `exige: "fora_do_caixa"`), `scripts/nav-build.test.ts`
- Modify: `src/app/(dashboard)/emporio/vendas/[id]/page.tsx` ("Orçamento nº X", com link, quando a venda veio de um)

Comportamento:
- Lista: colunas número, cliente, telefone, valor, data, validade, situação (pílula: aberto, vencido, faturado com o número da venda), vendedor; filtros loja, situação (padrão "Em acompanhamento") e busca por telefone, CPF, CNPJ, nome ou número; a 390 px sem rolagem horizontal da página.
- Detalhe: cliente com telefone, vendedor, quem fez, data, validade, situação, itens, subtotal, desconto, total, as vendas que saíram dele; **Imprimir A4**, **Imprimir cupom** e, se não faturado, **Faturar** (`/emporio/vender?orcamento=<id>`).
- O Caixa que abre `/emporio/orcamentos` é levado a `/emporio` (como nas outras páginas que ele não vê); o detalhe abre para ele.

- [ ] **Step 1:** atualizar `scripts/nav-build.test.ts` para a lista nova e ver falhar.
- [ ] **Step 2:** implementar.
- [ ] **Step 3:** o teste do menu, `tsc`, `lint`, `check`: verdes.
- [ ] **Step 4:** relatar os arquivos.

### Task 7: Roteiro no navegador, spec e handoff

**Files:**
- Create: `scripts/_cenario-emporio-orcamento.ts`, `scripts/navegador/emporio-orcamento.py`
- Modify: `docs/specs/module-39-meu-emporio.md` (Q176 em diante: as decisões desta entrega e as três do usuário), `docs/agents/current-handoff.md`

Roteiro (Vendedor e Caixa da mesma loja, Gestor; um produto com preço que muda e um com pouco estoque):
1. O Vendedor salva um orçamento com Consumidor final e vê a recusa no campo do cliente; escolhe cliente completo, salva, e vê o número e a validade; abre a impressão A4 e a bobina e confere "ORÇAMENTO" e "Válido até".
2. O preço de um item sobe; o Caixa digita o número, carrega, vê o vendedor do orçamento travado e o aviso de estoque, e fatura pelo preço orçado; a venda mostra "Orçamento nº".
3. O Gestor cancela a venda; na lista, o orçamento volta a "Aberto"; busca pelo telefone com máscara e acha.
4. Um orçamento com `valid_until` ontem (cenário): o Vendedor carrega e vê o aviso de vencido e o preço de hoje.
5. O Caixa abre `/emporio/orcamentos` e volta para `/emporio`; o menu dele não tem Orçamentos.
6. A 390 px: lista de Orçamentos e balcão no modo Orçamento sem rolagem horizontal.

- [ ] **Step 1:** cenário e roteiro.
- [ ] **Step 2:** com o `next dev` de pé, rodar `npm run navegador -- emporio-orcamento`: verde.
- [ ] **Step 3:** prova nos dois sentidos: tirar o envio de `quote_id` no balcão, ver o roteiro reprovar, restaurar, ver passar.
- [ ] **Step 4:** rodar de novo `emporio-vendedor` e `emporio-turno`: verdes.
- [ ] **Step 5:** spec Q176 em diante e handoff (a migração `20261105150000` NÃO está no Neon; ordem do deploy: migração, merge e push; sem reaplicação, porque nenhuma venda antiga tem orçamento).
- [ ] **Step 6:** relatar os arquivos.
