# Empório: frete na venda, origem e-commerce e editar venda. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a venda do Empório ganha o frete cobrado do cliente (fora do faturamento, com conta a pagar à transportadora), a origem (balcão ou e-commerce) e um "Editar" que cancela a venda e registra a nova na mesma transação.

**Architecture:** três colunas novas em `EmporioSale` (`freight_amount`, `origin`, `replaces_sale_id`) e nenhum saldo gravado. `net_amount` segue sendo só os itens: o faturamento não muda de fonte. O recibo da venda (lançamento de receita) passa a valer `net + frete`; o frete pago é um `FinancialEntry` de despesa na categoria reservada "Frete de entrega", ligado à venda por `related_id`, que o A pagar, o cancelamento e o Resultado passam a reconhecer. "Editar" reaproveita `cancelarVendaAction` e `gravarVenda` numa transação só.

**Tech Stack:** Next.js 16, Prisma 7, Zod 4, suítes `tsx` contra o Docker local, roteiro Python no Chrome de testes.

**Spec:** `docs/superpowers/specs/2026-11-09-emporio-frete-ecommerce-design.md` (Q244 a Q249, já na tabela de `docs/specs/module-39-meu-emporio.md`).

## Global Constraints

- Invariantes do `CLAUDE.md`: `tenant_id` nunca do client (`scoped`, client escopado); nenhum saldo gravado; action, depois rota, depois tela; regra de negócio em `src/lib/actions/*`; `FinancialEntry` só por `createLinkedEntry`; sem travessão; sem heredoc com escape; toda action de escrita do Empório chama `registrarNoHistorico`.
- Migração aplicada **só no Docker** (`DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public"` inline). Neon é do usuário.
- `net_amount` da venda continua sendo itens menos desconto. Nenhuma soma de faturamento muda de fonte.
- Categoria reservada: `"Frete de entrega"`. Origem: `balcao` (padrão) e `ecommerce`.
- Mensagens ao usuário em português, dinheiro no formato brasileiro (`brl`/`dinheiro` já existentes).
- Subagente não commita; não recebe autorização de merge, push na `main`, deploy nem Neon.
- Modelos: implementação e revisão em Sonnet; exploração em Haiku; sem juiz Opus (decisão do usuário em 09/11).

## Review Focus

1. **Pagamentos que fecham só os itens** numa venda com frete: a recusa tem de dizer o total com o frete e cair no campo `payments`; sem isso o lançador do e-commerce não entende por que a venda não sai. Teste na Task 2.
2. **Frete com regra de "Vendeu, Pagou" percentual:** a comissão tem de sair de `net`, nunca de `net + frete`. Teste na Task 2.
3. **Editar uma venda cujo caixa do dia já fechou** (venda em dinheiro de ontem): o cancelamento pede turno aberto na loja (`CASH_CLOSED`); a edição tem de recusar inteira, sem deixar a antiga cancelada e a nova por nascer. Teste na Task 4 (transação única: depois da recusa, a antiga segue `concluida`).
4. **Conta do frete paga antes do cancelamento ou da edição:** fica paga (Q99); a nova venda da edição cria outra conta pendente, e a tela do A pagar mostra as duas, uma por venda. Teste na Task 3 (cancelar) e na Task 4 (editar).
5. **Venda antiga sem frete sendo editada só para incluir o frete** com o mesmo PIX de sempre: `net` cai, `total` fica igual ao que o cliente pagou, a saída da gaveta do cancelamento e a entrada da venda nova se anulam. Teste na Task 4.

---

### Task 1: Schema, migração e as constantes compartilhadas

**Files:**
- Modify: `prisma/schema.prisma` (`EmporioSale`, l.1205-1265; enums perto de `EmporioSaleStatus`, l.258)
- Create: `prisma/migrations/20261109120000_emporio_frete_origem_substituicao/migration.sql`
- Create: `src/lib/emporio/frete.ts`
- Modify: `src/lib/emporio/vendeu-pagou.ts:26` (`CATEGORIAS_RESERVADAS`)

**Interfaces:**
- Produces (schema): `enum EmporioSaleOrigin { balcao ecommerce }`; em `EmporioSale`: `freight_amount Decimal @default(0) @db.Decimal(14, 2)`, `origin EmporioSaleOrigin @default(balcao)`, `replaces_sale_id String? @unique` com a relação `replaces EmporioSale? @relation("SaleReplacement", fields: [replaces_sale_id], references: [id], onDelete: Restrict)` e o inverso `replaced_by EmporioSale? @relation("SaleReplacement")`. Comentário `///` em cada coluna citando a Q (Q244, Q248, Q249).
- Produces (`src/lib/emporio/frete.ts`):
  ```ts
  export const CATEGORIA_FRETE = "Frete de entrega";
  export const ORIGENS_DA_VENDA = ["balcao", "ecommerce"] as const;
  export type OrigemDaVenda = (typeof ORIGENS_DA_VENDA)[number];
  export const ROTULO_DA_ORIGEM: Record<OrigemDaVenda, string> = { balcao: "Balcão", ecommerce: "E-commerce" };
  ```

- [ ] **Step 1: Editar o schema** com o enum, as três colunas e a relação. `EmporioSale` já está em `TENANT_SCOPED_MODELS`; nenhum model novo.
- [ ] **Step 2: Gerar o SQL** com `migrate diff` (URL do Docker inline, `--from-config-datasource --to-schema prisma/schema.prisma --script`), salvar em `prisma/migrations/20261109120000_emporio_frete_origem_substituicao/migration.sql` e **remover os dois `DROP INDEX`** de `WhatsAppProviderConfig_one_active` e `AnimalBatch_tenant_ear_tag_key` se aparecerem.
- [ ] **Step 3: Aplicar no Docker** com `npm run db:deploy` (URL inline) e rodar `npx prisma generate`.
- [ ] **Step 4: Verificar** `DATABASE_URL=... npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` devolve vazio (fora os dois índices), e `npx tsc --noEmit` passa.
- [ ] **Step 5: Criar `src/lib/emporio/frete.ts`** com as quatro exportações acima e acrescentar `CATEGORIA_FRETE` a `CATEGORIAS_RESERVADAS` em `vendeu-pagou.ts` (importando de `frete.ts`).
- [ ] **Step 6: Rodar** `npm run test:isolation` (URL inline): verde.
- [ ] **Step 7: Commit** (sessão principal): "Empório: frete, origem e substituição na venda (schema e migração, Q244, Q248, Q249)".

---

### Task 2: Frete e origem em `venderAction`, `cancelarVendaAction`, leitura e rota

**Files:**
- Modify: `src/lib/actions/emporio-vendas.ts` (`VenderInput` l.463-482; `Preparada` l.513-534; `prepararVenda` l.666-925, a soma dos pagamentos l.860-873; `gravarVenda` l.1062-1339, o `create` l.1072-1090, a receita l.1151-1163, a taxa de cartão l.1300-1314; `VendaView` l.167-209; `INCLUDE_VENDA` l.211-225; `montarVendas` l.258-366; `listarVendasAction` l.389-425; `cancelarVendaAction` l.1509-1516)
- Modify: `src/lib/emporio/venda-schema.ts:54-67` (`corpoDaVendaSchema`)
- Modify: `src/app/api/v1/emporio/sales/route.ts:19-38` (filtro `origin` no GET)
- Modify: `src/lib/actions/emporio-impressao.ts` (`ImpressoVenda` l.20-57; `lerImpressoDaVendaAction` l.177-230)
- Modify: `src/app/(public)/docs/api/endpoints.ts` (l.943 GET `/sales`, l.951 POST `/sales`, l.960 GET `/sales/:id`, l.968 recibo)
- Test: `scripts/m102-emporio-frete-ecommerce.test.ts` (seções 1, 2, 5 e 8; a suíte inteira é escrita da spec na Task 6, em paralelo; aqui o implementador roda as seções que já existirem)

**Interfaces:**
- Consumes: `CATEGORIA_FRETE`, `ORIGENS_DA_VENDA`, `OrigemDaVenda` de `@/lib/emporio/frete`.
- Produces:
  - `VenderInput` ganha `freight_amount?: number | null` e `origin?: OrigemDaVenda | null`.
  - `Preparada` ganha `frete: number` (0 quando ausente) e `origin: OrigemDaVenda`.
  - `VendaView` ganha `freight_amount: number`, `total_amount: number` (`net_amount + freight_amount`), `origin: OrigemDaVenda`, `replaces: { id: string; number: number } | null`, `replaced_by: { id: string; number: number } | null`.
  - `listarVendasAction` aceita `origin?: OrigemDaVenda` (inválida: `VALIDATION_ERROR` 422 campo `origin`).
  - `corpoDaVendaSchema` ganha `freight_amount: z.number({ error: "O frete deve ser um número." }).min(0, { error: "O frete não pode ser negativo." }).nullish()` e `origin: z.enum(ORIGENS_DA_VENDA, { error: "Escolha a origem: balcão ou e-commerce." }).nullish()`.
  - `ImpressoVenda` ganha `frete: number` e `origem: OrigemDaVenda`; `total` passa a ser `net_amount + freight_amount`.
  - Gravação: `emporioSale.create` com `freight_amount: p.frete, origin: p.origin`; a receita com `amount: p.net + p.frete`; quando `p.frete > 0`, `createLinkedEntry(tx, { entry_type: "expense", category: CATEGORIA_FRETE, amount: p.frete, related_module: "emporio", related_id: venda.id, occurred_at: p.sold_at, status: "pending", due_date: p.sold_at, establishment_id: p.loja.id })`.
  - Cancelamento: `financialEntry.updateMany({ where: { related_module: "emporio", entry_type: "expense", category: CATEGORIA_FRETE, related_id: id, status: "pending" }, data: { status: "cancelled" } })`; a paga fica. Se a conta do frete estiver em aprovação (`contaEmAprovacao` de `@/lib/emporio/pedido-pagamento`, como `cancelarVendeuPagou` faz em `vendeu-pagou.ts:169-183`), recusa com o mesmo `CONTA_EM_APROVACAO`.

- [ ] **Step 1: Escrever os testes** (ou conferir os da Task 6 se já existirem) em `scripts/m102-emporio-frete-ecommerce.test.ts`, seção 1 "Frete na venda" e 2 "Origem", chamando as actions direto, no padrão da `m81` (`check(nome, cond)`, `exigirBancoLocal`, dois tenants por `papelDeFixture`/`vincularTodas` de `./_emporio-papel`). Asserções:
  - venda com itens 100,00 e `freight_amount: 20` paga com `pix` 120,00: `ok`; `net_amount === 100`, `freight_amount === 20`, `total_amount === 120`, `origin === "balcao"`; o `FinancialEntry` `income` `related_id` da venda tem `amount` 120; existe um `FinancialEntry` `expense` `category === "Frete de entrega"` `related_id` da venda, `status "pending"`, `due_date` igual a `sold_at`, `establishment_id` da loja, `amount` 20;
  - a mesma venda paga com `pix` 100,00: `!ok`, `code === "VALIDATION_ERROR"`, `field === "payments"`, `message` contém "120,00";
  - `freight_amount: -1`: `!ok`, `field === "freight_amount"`;
  - sem `freight_amount` (ou 0): nenhum `FinancialEntry` "Frete de entrega" para a venda;
  - regra do "Vendeu, Pagou" percentual 10% na loja: a `SaleVariableExpense` da venda com frete vale 10,00 (10% de `net`), não 12,00;
  - `origin: "ecommerce"`: gravado; `listarVendasAction(..., { establishment_id, origin: "ecommerce" })` traz só ela; `origin: "loja"`: `!ok`, `field === "origin"`;
  - `lerImpressoDaVendaAction`: `frete === 20`, `total === 120`, `origem === "ecommerce"`.
  - seção 5 "Cancelar": cancelar a venda com frete deixa a conta do frete `cancelled`; numa segunda venda, pagar a conta do frete por `pagarDespesasAction` (Task 3 a torna pagável: se ainda não existir, pague por `tx.financialEntry.update` direto no teste, marcando `status: "paid"`) e cancelar: a conta segue `paid`.
- [ ] **Step 2: Rodar** `DATABASE_URL=... npm run test:m102` (depois de registrar `"test:m102": "tsx scripts/m102-emporio-frete-ecommerce.test.ts"` no `package.json`, se a Task 6 ainda não o fez). Esperado: as seções 1, 2, 5 e 8 FALHAM (campo desconhecido, soma não fecha).
- [ ] **Step 3: Implementar** na ordem: tipos; validação em `prepararVenda` (`frete` finito, `>= 0`, arredondado a 2 casas, recusa `VALIDATION_ERROR` 422 campo `freight_amount`; `origin` em `ORIGENS_DA_VENDA` ou `VALIDATION_ERROR` campo `origin`, padrão `balcao`); a soma dos pagamentos passa a comparar com `netCent + freteCent` (o teto da troca também: `Math.min(centavos(valorTroca), netCent + freteCent)`), e a mensagem diz "igual ao total da venda com o frete (R$ X)" quando `freteCent > 0`; `gravarVenda`; cancelamento; `VendaView` (o `INCLUDE_VENDA` ganha `replaces: { select: { id, number } }` e `replaced_by: { select: { id, number } }`); `listarVendasAction`; `corpoDaVendaSchema`; a rota GET lê `origin` da query; `ImpressoVenda`; `/docs/api`.
- [ ] **Step 4: Rodar** `test:m102` (seções 1, 2, 5, 8 verdes), `test:m81`, `test:m82`, `test:m83` (o "Vendeu, Pagou" não muda), `test:m97` (romaneio), `npm run test:docs-api`, `npx tsc --noEmit`, `npm run lint`.
- [ ] **Step 5: Commit** (sessão principal): "Empório: frete cobrado do cliente e origem da venda (Q244, Q245, Q246, Q248): o faturamento segue sendo os itens; o recibo vale itens mais frete; nasce a conta a pagar Frete de entrega".

---

### Task 3: A conta do frete no A pagar e o frete no Resultado da Loja

**Files:**
- Modify: `src/lib/actions/emporio-despesas.ts` (`filtroDoEmporio` l.1463-1478 e as constantes `SO_DO_EMPORIO`/`SEM_AS_DUAS_FORMAS` logo acima; `acharContaDoEmporio` l.1561-1582; `viewDaConta` l.1418-1445; `corrigirDespesaAction` l.1584 em diante)
- Modify: `src/lib/actions/emporio-resultado.ts` (`margemDaJanela` l.107-188; a saída l.465-471; a visão somada l.495-505)
- Modify: `src/app/(dashboard)/emporio/_components/resultado-mes.tsx` (depois da linha das fixas, l.132-150, antes de "= Resultado" l.153)
- Modify: `src/app/(public)/docs/api/endpoints.ts` (l.1291, rota do Resultado; a entrada do A pagar)
- Test: `scripts/m102-emporio-frete-ecommerce.test.ts` (seções 3 e 4)

**Interfaces:**
- Consumes: a conta "Frete de entrega" da Task 2 (`FinancialEntry` expense, `category === CATEGORIA_FRETE`, `related_id` = venda).
- Produces:
  - `ContaAPagarView.origin` ganha o valor `"frete"`; a view ganha `sale_id: string | null` e `sale_number: number | null` (preenchidos só no frete). `can_correct` é verdadeiro para o frete pendente sem pagamento (a transportadora pode cobrar diferente do cotado).
  - `listarContasAPagarAction` e `contarContasAPagarAction` incluem a conta do frete cuja venda existe e está `concluida`; `pagarDespesasAction` e `corrigirDespesaAction` a aceitam.
  - `ResultadoDaLojaView` (tipo da saída de `lerResultadoAction`, l.60-100) ganha `freight: { received: number; paid: number; difference: number }`: `received` = soma de `freight_amount` das vendas `concluida` do mês (por `sold_at`), `paid` = soma das contas "Frete de entrega" das vendas do mês com `status !== "cancelled"` (o valor da conta, pago ou pendente, porque o Resultado é por competência), `difference = received - paid`. `result` passa a ser `margin - losses - fixed_expenses + freight.difference`. A visão somada (`stores`) traz o mesmo por loja. `variable_expenses` não inclui o frete.

- [ ] **Step 1: Escrever os testes**, seção 3 "Resultado" e 4 "A pagar":
  - loja com uma venda de itens 100 e frete 20 no mês: `lerResultadoAction` devolve `sales === 100`, `variable_expenses` sem o frete, `freight.received === 20`, `freight.paid === 20`, `freight.difference === 0`, e `result === margin - losses - fixed_expenses + freight.difference` (recalculado no teste);
  - depois de `corrigirDespesaAction(conta do frete, { amount: 25 })`: `freight.paid === 25`, `difference === -5`, `result` cai 5;
  - `listarContasAPagarAction(db, ator, { establishment_id })` traz a conta com `origin === "frete"`, `sale_number` igual ao `number` da venda, `can_correct === true`; `contarContasAPagarAction` a conta;
  - `pagarDespesasAction` paga a conta (status `paid`); depois dela, `can_correct === false`;
  - a conta do frete de uma venda cancelada (pendente, portanto `cancelled`) não aparece com `status: "pending"`;
  - isolamento: o tenant B não vê a conta nem a venda (`NOT_FOUND` em `lerVendaAction`; lista vazia).
- [ ] **Step 2: Rodar** `test:m102`: as seções 3 e 4 FALHAM (conta não listada, `freight` indefinido).
- [ ] **Step 3: Implementar** `emporio-despesas.ts` (o `OR` de `filtroDoEmporio` ganha `{ category: CATEGORIA_FRETE, related_id: { in: vendasVivas } }`, com `vendasVivas` = `emporioSale.findMany({ where: { id: { in: ids }, status: "concluida" } })` sobre as candidatas `SEM_AS_DUAS_FORMAS`; `acharContaDoEmporio` aceita a conta do frete cuja venda existe; `INCLUDE_CONTA` traz o necessário para `sale_number`, ou um `findFirst` na venda pelo `related_id`), depois `emporio-resultado.ts` (a consulta das vendas seleciona `freight_amount`; uma consulta às contas do frete por `related_id in ids`, como a das taxas de cartão em l.133-145), depois a tela e o `/docs/api`.
- [ ] **Step 4: Rodar** `test:m102` (3 e 4 verdes), `test:m83`, `test:m84`, `test:m98`, `test:m101`, `test:docs-api`, `tsc`, `lint`.
- [ ] **Step 5: Commit** (sessão principal): "Empório: a conta do frete no A pagar e a linha Frete de entrega (repasse) no Resultado da Loja (Q246, Q247)".

---

### Task 4: `editarVendaAction` e a rota de substituição

**Files:**
- Modify: `src/lib/actions/emporio-vendas.ts` (`cancelarVendaAction` l.1396-1591 dividida em duas funções; `gravarVenda` l.1062-1070 ganha `extra.replaces_sale_id`; a nova action logo depois de `cancelarVendaAction`)
- Create: `src/app/api/v1/emporio/sales/[id]/replace/route.ts`
- Modify: `src/app/(public)/docs/api/endpoints.ts` (nova entrada depois de `POST /:id/cancel`, l.984)
- Test: `scripts/m102-emporio-frete-ecommerce.test.ts` (seção 6)

**Interfaces:**
- Consumes: `prepararVenda`, `gravarVenda`, `turnoOuAborta`, `registrarNoHistorico`, `vendaPorId`, `AbortarVenda`, `ehErroUnico` (todos já em `emporio-vendas.ts`).
- Produces:
  - `async function conferirCancelamento(db, ator, id): Promise<ActionResult<VendaParaCancelar>>`: as travas de fora da transação de `cancelarVendaAction` (permissão `gestor_da_loja`, `NOT_FOUND`, `SALE_CANCELED`, `SALE_IS_EXCHANGE`, `SALE_HAS_RETURNS`), devolvendo a venda carregada com o `select` atual.
  - `async function cancelarNaTransacao(tx, ator, venda: VendaParaCancelar, motivo: string, cash_register_id: string | null | undefined): Promise<void>`: o corpo da transação atual, sem mudança de comportamento (`VENDA_EM_ACORDO`, cheques, cartão, taxas, "Vendeu, Pagou", frete, receita, saídas da gaveta).
  - `cancelarVendaAction` passa a ser `conferirCancelamento` + validação do motivo + `runSerializableTenantTransaction(cancelarNaTransacao)`; `m81`, `m82` e `m92` provam que nada mudou.
  - `export type EditarVendaInput = Omit<VenderInput, "establishment_id"> & { reason?: string | null }`.
  - `export async function editarVendaAction(db, ator, id: string, input: EditarVendaInput): Promise<ActionResult<VendaView & { replayed: boolean }>>`:
    1. `operation_key` obrigatória; replay pela chave como em `venderAction` (devolve a venda nova com `replayed: true`).
    2. `conferirCancelamento(db, ator, id)`; a loja é a da venda antiga (`establishment_id` do input é ignorado); `sold_at` padrão é o da antiga; `seller_user_id` padrão é o da antiga; `quote_id` padrão é o da antiga (a transação a libera no cancelamento e a nova a fatura de novo).
    3. `prepararVenda(db, ator, { ...input, establishment_id, sold_at, seller_user_id, quote_id })`.
    4. Transação serializável: `cancelarNaTransacao(tx, ator, venda, "Substituída pela venda nº (em edição)", input.cash_register_id)`, depois `turnoOuAborta`, `gravarVenda(tx, ator, prep, turno, { replaces_sale_id: id })`, depois `emporioSale.update` da antiga com `canceled_reason: "Substituída pela venda nº " + formatarNumero(numeroNovo) + (input.reason ? ": " + motivo : "")`, depois `registrarNoHistorico` com `action: "venda.editar"`, `target_id` = venda nova, `summary` "Substituiu a venda nº X pela nº Y na <loja> (<n> itens, total R$ T)".
    5. A mesma recuperação de corrida da chave que `venderAction` (l.1379-1389).
  - `gravarVenda` grava `replaces_sale_id: extra.replaces_sale_id ?? null`.
  - Rota `POST /api/v1/emporio/sales/[id]/replace`: guard do Empório como em `[id]/cancel/route.ts`; schema `corpoDaVendaSchema.extend({ operation_key: chaveDeOperacao, reason: z.string().trim().nullish() })`; 201 com a venda nova, 200 no replay; `apiErroDeZod` na recusa.

- [ ] **Step 1: Escrever os testes**, seção 6 "Editar":
  - venda A (itens 100, sem frete, `pix` 100, `origin` balcão). `editarVendaAction(db, gestor, A.id, { operation_key: nova, items: os mesmos, freight_amount: 20, origin: "ecommerce", payments: [pix 120] })`: `ok`; a nova tem `number > A.number`, `net_amount === 100`, `freight_amount === 20`, `total_amount === 120`, `origin === "ecommerce"`, `replaces.id === A.id`; `lerVendaAction(A.id)` devolve `status === "cancelada"`, `canceled_reason` contém "Substituída pela venda nº", `replaced_by.id` = nova;
  - estoque: as `StockMovement` `venda` de A têm `canceled_at`; as da nova não; o saldo do produto (soma das movimentações não canceladas) é o mesmo de antes da edição;
  - gaveta: um `CashMovement` `saida` `cancelamento_venda` de 100 com `sale_id` A e uma `entrada` `venda` de 120 da nova;
  - conta do frete da nova: pendente, 20; A não tem conta do frete;
  - o lançamento de receita de A está `cancelled`; o da nova vale 120 e está `paid`;
  - histórico: um `EmporioAuditLog` com `action === "venda.editar"`;
  - replay: repetir a mesma `operation_key` devolve `replayed === true` e não cria terceira venda;
  - recusas: editar a nova com pagamentos que somam 100 (frete 20): `!ok`, `VALIDATION_ERROR`, campo `payments`, e a nova segue `concluida`; editar A de novo: `SALE_CANCELED`; venda com devolução: `SALE_HAS_RETURNS`; venda de troca: `SALE_IS_EXCHANGE`; vendedor (papel `vendedor` sem gestor): `FORBIDDEN`;
  - Review Focus 3: venda em dinheiro de ontem com o turno de ontem encerrado e nenhum turno aberto hoje: editar devolve `CASH_CLOSED` (ou `CASH_REGISTER_REQUIRED`), e a venda segue `concluida` com o lançamento `pending`/`paid` como estava;
  - isolamento: o tenant B recebe `NOT_FOUND` ao editar a venda de A.
- [ ] **Step 2: Rodar** `test:m102`: a seção 6 FALHA (`editarVendaAction` não existe).
- [ ] **Step 3: Implementar** a divisão de `cancelarVendaAction`, `editarVendaAction`, o `extra` de `gravarVenda`, a rota e o `/docs/api`.
- [ ] **Step 4: Rodar** `test:m102` (6 verde), `test:m81`, `test:m82`, `test:m92`, `test:m97`, `test:m100`, `test:docs-api`, `test:isolation`, `tsc`, `lint`.
- [ ] **Step 5: Commit** (sessão principal): "Empório: editar venda cancela a antiga e registra a nova na mesma transação (Q249); cancelarVendaAction dividida em conferir e cancelar na transação".

---

### Task 5: As telas do frete e da origem (balcão, lista, detalhe, recibo)

**Files:**
- Modify: `src/app/(dashboard)/emporio/_components/venda-estado.ts` (`CorpoDaVenda` l.112; totais l.309-320; `adicionarPagamento` l.322; `montar()` l.375-466)
- Modify: `src/app/(dashboard)/emporio/_components/venda-campos.tsx` (desconto total l.528-530: o frete e a origem entram ao lado)
- Modify: `src/app/(dashboard)/emporio/_components/balcao.tsx` (envio l.410-423; resumo l.468-490; total l.775)
- Modify: `src/app/(dashboard)/emporio/vendas/page.tsx` e `_components/vendas-filtro.tsx` (filtro de origem; selo "E-commerce" e "Frete R$ X" na linha)
- Modify: `src/app/(dashboard)/emporio/vendas/[id]/page.tsx` (origem, frete e total, "Substituída pela venda nº Y" / "Substitui a venda nº X" com link)
- Modify: `src/components/emporio/impresso/papel-a4.tsx:103-114` e `papel-cupom.tsx:63-74` (linha "Frete" entre Desconto e Total; "Pedido do e-commerce" no cabeçalho quando `origem === "ecommerce"`)

**Interfaces:**
- Consumes: `VendaView` (`freight_amount`, `total_amount`, `origin`, `replaces`, `replaced_by`), `ImpressoVenda` (`frete`, `origem`), a rota GET `/sales?origin=`, `ROTULO_DA_ORIGEM`.
- Produces: `CorpoDaVenda` ganha `freight_amount: number` (0 por padrão) e `origin: OrigemDaVenda` (`balcao`); `useVenda` expõe `definirFrete(valor: number)` e `definirOrigem(o: OrigemDaVenda)`; `aPagarCent` passa a incluir `freteCent`; `montar()` põe `freight_amount` (omitido quando 0) e `origin` no corpo. Campo de frete em reais com o componente de dinheiro do kit já usado nos pagamentos (nunca `<input type="number">`); origem como par de botões ou seletor do kit, rótulos "Balcão" e "E-commerce".

- [ ] **Step 1: Implementar** o estado e os campos, o envio e o resumo do balcão (linha "Frete" e "Total com frete" quando `freight_amount > 0`), a lista, o detalhe e os impressos.
- [ ] **Step 2: Verificar** `npx tsc --noEmit`, `npm run lint`, `npm run check` (trava 15: todo campo novo do `ORDEM` do formulário com `error=` no `<Field>`; trava 7: sem `<input type="number">`).
- [ ] **Step 3: Prova viva rápida** (sessão principal, no `next dev` do clone com `npm run navegador -- emporio-f3a`): o roteiro antigo segue verde.
- [ ] **Step 4: Commit** (sessão principal): "Empório: frete e origem no balcão, na lista, no detalhe e no recibo (Q244, Q245, Q248)".

---

### Task 6: A suíte m102 escrita da spec (paralela às Tasks 1 e 2)

**Files:**
- Create: `scripts/m102-emporio-frete-ecommerce.test.ts`
- Modify: `package.json` (`"test:m102": "tsx scripts/m102-emporio-frete-ecommerce.test.ts"`, depois de `test:m101`)

**Interfaces:**
- Consumes: só a spec e os blocos **Interfaces** das Tasks 2, 3 e 4 deste plano (nomes, campos, códigos). Os módulos entram por `import()` com especificador em variável, como na `m81`, para a suíte compilar antes de as funções existirem.
- Produces: as oito seções: 1 frete na venda, 2 origem, 3 Resultado, 4 A pagar, 5 cancelar, 6 editar, 7 isolamento, 8 impressão; `check()` com contagem e saída 1 em falha; fixture com `papelDeFixture`/`vincularTodas` (`scripts/_emporio-papel.ts`); limpeza dos tenants no fim.

- [ ] **Step 1: Escrever a suíte** com as asserções das Tasks 2, 3 e 4 (copiadas de lá, não reinventadas).
- [ ] **Step 2: Rodar** contra o HEAD sem implementação: compila (`tsx` carrega) e as seções falham por função ou campo ausente, não por erro de sintaxe.
- [ ] **Step 3: Commit** junto com a Task 2 (sessão principal).

---

### Task 7: Editar na tela (balcão em modo edição e o botão no detalhe)

**Files:**
- Modify: `src/app/(dashboard)/emporio/vender/page.tsx` (query `?editar=<id>`: lê a venda com `lerVendaAction` e passa `edicao` ao `<Balcao>`)
- Modify: `src/app/(dashboard)/emporio/_components/balcao.tsx` e `venda-estado.ts` (`useVenda(inicial?)`: itens, cliente, pagamentos, frete, origem, entrega, notas e vendedor da venda; o envio em modo edição vai para `POST /api/v1/emporio/sales/<id>/replace`)
- Modify: `src/app/(dashboard)/emporio/vendas/[id]/page.tsx` (botão "Editar" ao lado de "Cancelar", com a mesma condição `podeCancelar`, l.60, levando a `/emporio/vender?editar=<id>`; aviso curto "Editar cancela esta venda e registra uma nova com outro número")

**Interfaces:**
- Consumes: a rota `/replace` (Task 4), `VendaView` completa (itens com `emporio_product_id`, `presentation_id`, `quantity`, `unit_price`; pagamentos com `kind`, `amount`, `bank_account_id`, `due_date`, `installments`).
- Produces: `Balcao` aceita `edicao?: { venda: VendaView }`; em modo edição o título diz "Editando a venda nº X", o botão de fechar diz "Salvar a venda nova", e o sucesso leva ao detalhe da venda nova.

- [ ] **Step 1: Implementar** o modo edição.
- [ ] **Step 2: Verificar** `tsc`, `lint`, `npm run check`.
- [ ] **Step 3: Commit** (sessão principal): "Empório: Editar abre o balcão preenchido e salva pela substituição (Q249)".

---

### Task 8: Roteiro de navegador, manual, docs e handoff

**Files:**
- Create: `scripts/_cenario-emporio-frete.ts` (loja, produto com preço e estoque, regra "Vendeu, Pagou" 10%, uma venda do e-commerce com frete já lançada pela action, sessão do owner), no molde de `scripts/_cenario-emporio-f3a.ts`
- Create: `scripts/navegador/emporio-frete-ecommerce.py` (cabeçalho com cenário e sessão, como `emporio-f3a.py`; passos: vender no balcão com frete 20 e origem E-commerce e conferir o total 120 e o recibo com a linha Frete; a lista filtrada por E-commerce; o detalhe com "Frete"; o A pagar com a conta "Frete de entrega"; o Resultado com a linha "Frete de entrega (repasse)"; Editar a venda do cenário, incluir frete, salvar e conferir a antiga "Substituída pela venda nº"; sabotagem: com `freight_amount` ignorado no servidor o roteiro reprova)
- Modify: `src/app/(dashboard)/manual/_conteudo/partes-tarefa-2.tsx` (`ParteDeVender` l.9-86: o frete, a origem e o "Editar"; `ParteDeDevolver` l.96: Editar ao lado de Cancelar)
- Modify: `scripts/navegador/manual-emporio.py` só se a parte do manual ganhar figura nova (opcional: sem figura nova, não mexer)
- Modify: `docs/agents/dividas.md` (2.54: relatório de faturamento por origem; 2.55: frete ao editar venda em acordo ou com devolução só por cancelar e relançar à mão), `docs/agents/current-handoff.md` (estado, branch, próximo passo, teto de 200 linhas), `docs/agents/financeiro-emporio-relatorio.md` (seção curta com as evidências)

- [ ] **Step 1: Escrever o cenário e o roteiro**; rodar `npm run navegador -- emporio-frete-ecommerce` com `TIBE_BASE="http://localhost:3000"` no `next dev` do clone: verde.
- [ ] **Step 2: Sabotar** (comentar a gravação de `freight_amount` em `gravarVenda`), rodar: reprova; desfazer; rodar: verde.
- [ ] **Step 3: Manual, dívidas, relatório, handoff.**
- [ ] **Step 4: Gates finais** (sessão principal): `npm run check`, `tsc`, `lint`, `npm run build`, `test:isolation`, `test:m102`, `npm run test:all -- --sem-redis` (URLs inline), `migrate diff` vazio.
- [ ] **Step 5: Commit** (sessão principal): "Empório: roteiro do frete e do e-commerce nos dois sentidos, manual e handoff".

---

## Ondas (orquestrar-ondas)

| onda | tarefas | agentes | depende de |
|---|---|---|---|
| 1 | Task 1 (schema), Task 6 (suíte da spec) | `servidor-dados` (Sonnet), `prova-suite` (Sonnet) | nada |
| 2 | Task 2 (vender, cancelar, leitura, rota, impressão) | `servidor-acao` (Sonnet) | 1 |
| 3 | Task 3 (A pagar, Resultado), Task 4 (editar), Task 5 (telas do frete) | `servidor-acao` x2, `tela-pagina` (Sonnet) | 2 |
| 4 | Task 7 (editar na tela), Task 8 (roteiro, manual, docs) | `tela-pagina`, `prova-viva` (Sonnet) | 3 |

Revisão: um revisor Sonnet por onda (diff da onda inteira), não por tarefa. A sessão principal commita uma tarefa por vez.
