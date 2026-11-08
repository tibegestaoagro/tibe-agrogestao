# Financeiro do Empório, entrega 1: a casa do financeiro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o papel Financeiro e a casa `/emporio/financeiro`, fazer a conta da compra se pagar dentro do Empório com o dinheiro saindo de um lugar, e tirar o Empório do `/financeiro` do Tibé.

**Architecture:** Nada de tabela nova de dinheiro: tudo continua `FinancialEntry` + `FinancialPayment` + `CashMovement`, com o Empório marcado por `related_module: emporio` e `establishment_id`. O papel novo entra no enum `EmporioRole` e na matriz única de `papel.ts` com uma ação nova, `dinheiro`, que **soma** às ações existentes (helper `exigirUma`). A casa é um conjunto de páginas sob `/emporio/financeiro` que leem actions novas em `emporio-financeiro.ts` e reaproveitam as de caixa e despesas.

**Tech Stack:** Next.js 16 (App Router), Prisma 7, Postgres, Zod 4, kit de UI do projeto (`src/components/ui/`), suítes em `tsx` chamando route handlers.

**Spec:** `docs/superpowers/specs/2026-11-07-emporio-financeiro-design.md` (seção "Entrega 1" e decisões Q215, Q221, Q222, Q231, Q232, Q237).

## Global Constraints

- `tenant_id` nunca vem do client; toda query usa `getTenantDb()`/client escopado; model novo com `tenant_id` entra em `TENANT_SCOPED_MODELS` (nesta entrega não há model novo).
- O saldo nunca é gravado: todo dinheiro que sai ou entra é um `CashMovement` com exatamente um lugar (gaveta, conta ou gerência).
- Regra de negócio em `src/lib/actions/*`; rota é wrapper fino; recusa do Zod por `apiErroDeZod`; `fail()` com `field` em toda recusa de campo; mensagens em português.
- Toda action de escrita do Empório chama `registrarNoHistorico` (conferência 19 do `npm run check`); ação nova entra em `ACOES_DO_HISTORICO` (`src/lib/emporio/historico.ts`).
- Nunca travessão (U+2014) em código, doc ou commit. Nunca heredoc com escape no shell.
- Migração: SQL gerado por `prisma migrate diff` com a URL do Docker inline, salvo em `prisma/migrations/<timestamp>_<nome>/migration.sql`, aplicado com `db:deploy` no Docker. Não aplique os dois `DROP INDEX` dos índices parciais. Nada no Neon.
- Dinheiro em tela no formato brasileiro (`brl`), nunca `<input type="number">`, cores por token.
- O Financeiro paga e recebe **só pela conta bancária**; o Gestor continua pagando da gaveta (turno aberto) e da conta; `dinheiro` soma, não substitui (spec, "O papel Financeiro").
- O Financeiro não passa em `vendedor_da_loja`, `fatura_na_loja`, `gestor_da_loja` nem em chave; passa em `fora_do_caixa` e `dinheiro`; lê tudo, sem botão de escrever.
- Subagente não commita: deixa no working tree e relata; a sessão principal commita.

## Review Focus

1. **Cliente só da loja (Gestor) pagando conta da compra de OUTRA loja pela conta bancária:** `pagarDespesasAction` precisa recusar como hoje recusa despesa de loja fora do alcance (404 `Estabelecimento`). Teste em Task 3.
2. **Compra à vista com `paid_from` de gaveta e turno fechado:** recusa `CASH_CLOSED` (a que `resolverTurno` já devolve), nada gravado (transação). Teste em Task 3.
3. **Financeiro recebendo fiado em dinheiro:** recusa 422 `kind`, e por Pix na conta Pix da loja ou na conta informada: aceito, `CashMovement` na conta, sem turno. Teste em Task 5.
4. **Entry do Empório pelo `/financeiro` do Tibé por quem é OWNER:** recusa `ENTRY_DO_EMPORIO` em pagar, marcar pago, adiar e cancelar, inclusive pela rota `PATCH /api/v1/financial-entries/:id/pay`. Teste em Task 4.
5. **Conta da compra cancelada (`EmporioPurchase.canceled_at`):** não aparece em contas a pagar pendentes e não se paga. Teste em Task 3.

---

## Arquivos

- Modificar: `prisma/schema.prisma` (enums `EmporioRole`, `CashMovementOrigin`), nova pasta em `prisma/migrations/`.
- Modificar: `src/lib/emporio/papel.ts`, `src/lib/emporio/paginas.ts`, `src/lib/emporio/paginas-do-so-da-loja.ts`, `src/lib/emporio/historico.ts`.
- Modificar: `src/lib/actions/emporio-equipe.ts` e a tela `src/app/(dashboard)/emporio/equipe/`.
- Modificar: `src/app/(dashboard)/layout.tsx`, `src/proxy.ts`, `src/app/(dashboard)/meu-dia/page.tsx`.
- Modificar: `src/lib/actions/emporio-despesas.ts`, `src/lib/actions/emporio-compras.ts`, `src/lib/actions/emporio-caixa.ts`, rotas em `src/app/api/v1/emporio/payables/`, `purchases/`, `receivables/`.
- Modificar: `src/lib/actions/financial-payments.ts`, `src/lib/actions/financial-entries.ts`, `src/lib/financial-area.ts`, `src/app/(dashboard)/financeiro/page.tsx` (e remover `area-filtro.tsx`), `src/app/(dashboard)/dashboard/page.tsx`.
- Criar: `src/lib/actions/emporio-financeiro.ts`; rotas `src/app/api/v1/emporio/finance/today/route.ts`, `receivables/route.ts`, `statement/route.ts`; páginas `src/app/(dashboard)/emporio/financeiro/page.tsx`, `pagar/page.tsx`, `receber/page.tsx`, `caixa/page.tsx`; componentes em `src/app/(dashboard)/emporio/_components/financeiro-*.tsx`.
- Criar: `scripts/m98-emporio-financeiro-casa.test.ts` (`npm run test:m98`), `scripts/_cenario-emporio-financeiro-casa.ts`, `scripts/navegador/emporio-financeiro-casa.py`.
- Modificar: `src/app/(public)/docs/api/endpoints.ts`, `docs/agents/dividas.md`, `docs/specs/module-39-meu-emporio.md`, manual (`src/app/(dashboard)/manual/_conteudo/`), `scripts/cenario-demonstracao-emporio.ts`, `prisma/seed-demo*` (o que `seed:demo` usa para compra à vista), `package.json`.

---

### Task 1: O papel Financeiro no schema e na matriz

**Files:**
- Modify: `prisma/schema.prisma` (enum `EmporioRole` linha 58; enum `CashMovementOrigin` linha 266)
- Create: `prisma/migrations/<timestamp>_emporio_financeiro_papel/migration.sql`
- Modify: `src/lib/emporio/papel.ts`
- Modify: `src/lib/actions/emporio-equipe.ts`, `src/app/(dashboard)/emporio/equipe/_components/*` (o select de função)
- Modify: `scripts/_emporio-papel.ts` (fixture)

**Interfaces:**
- Produces: `EmporioRole.financeiro`; `CashMovementOrigin.pagamento_compra`.
- Produces: `PapelEmporio` inclui `"financeiro"`; `AcaoEmporio` inclui `"dinheiro"`; `pode(c, "dinheiro")` é verdadeiro para `dono`, `gerente_geral`, `financeiro`; para o `financeiro`, `pode` é falso em `conta`, `gestor_da_loja`, `vendedor_da_loja`, `fatura_na_loja` e toda `chave:*`, e verdadeiro em `fora_do_caixa`.
- Produces: `exigirUma(db, ator, acoes: AcaoEmporio[], oQue?, lojaId?)`: nulo se alguma passa; senão a recusa da PRIMEIRA ação da lista.
- Produces: `recusaDe("dinheiro", oQue?)`: `FORBIDDEN` 403, "Só o financeiro, o gerente geral e o dono podem fazer isso." (com `oQue`: `Só o financeiro, o gerente geral e o dono podem ${oQue}.`).
- Produces: o contexto do `financeiro` em `carregar`: `{ papel: "financeiro", lojas: null, chaves: new Set(), soDaLoja: true }`.
- Produces: em `emporio-equipe.ts`, `FUNCOES` inclui `"financeiro"`; `NOME_DA_FUNCAO.financeiro = "financeiro"`; a função não exige `establishment_ids` (como `gerente_geral`); `roleDaFuncao("financeiro") === "OPERADOR"`; a recusa de função inválida diz "Escolha a função: gerente geral, financeiro, gestor, vendedor ou caixa."
- Produces: `scripts/_emporio-papel.ts` exporta `papelFinanceiro(): { emporio_role: "financeiro", emporio_only: true }`.

- [ ] **Step 1: Mudar os dois enums no schema**

`EmporioRole` ganha `financeiro` com comentário de uma linha (Q215). `CashMovementOrigin` ganha `pagamento_compra` ("compra à vista ou entrada da parcelada, Q221").

- [ ] **Step 2: Gerar e aplicar a migração no Docker**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```
Salvar em `prisma/migrations/<timestamp>_emporio_financeiro_papel/migration.sql` SEM os `DROP INDEX` de `WhatsAppProviderConfig_one_active` e `AnimalBatch_tenant_ear_tag_key`. Depois:
```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run db:deploy
npx prisma generate
```
Esperado: migração aplicada; um novo `migrate diff` devolve só os dois drops.

- [ ] **Step 3: `papel.ts`**

Adicionar `"financeiro"` a `PapelEmporio`; o ramo em `carregar` (antes do `findMany` de vínculos); `"dinheiro"` em `AcaoEmporio` com doc de uma linha; em `pode`: `if (acao === "dinheiro") return conta || c.papel === "financeiro";` logo depois da linha de `conta`, e `if (c.papel === "financeiro") return acao === "fora_do_caixa";` antes de `if (conta) return true;` (lembre que `fora_do_caixa` já foi tratado acima; ordene para o financeiro cair em falso nas demais). Frase em `FRASES.dinheiro` e o ramo com `oQue` em `recusaDe`. Exportar `exigirUma`.

- [ ] **Step 4: `emporio-equipe.ts` e o select da tela**

`FUNCOES`, `NOME_DA_FUNCAO`, `roleDaFuncao`, a condição de lojas (`funcao !== "gerente_geral" && funcao !== "financeiro"`), a mensagem. No select da tela de Equipe, a opção "Financeiro" com a descrição "Cuida do dinheiro de todas as lojas: paga, recebe, concilia e cobra. Não vende nem mexe em catálogo ou equipe."

- [ ] **Step 5: Fixture**

`papelFinanceiro()` em `scripts/_emporio-papel.ts`.

- [ ] **Step 6: `npx tsc --noEmit` e `npm run check`**

Esperado: 0 erros, 0 falhas.

---

### Task 2: A casa no menu, o destino do Financeiro e a entrada depois do login

**Files:**
- Modify: `src/lib/emporio/paginas.ts`
- Modify: `src/lib/emporio/paginas-do-so-da-loja.ts`
- Modify: `src/app/(dashboard)/layout.tsx`, `src/proxy.ts`
- Modify: `src/app/(dashboard)/meu-dia/page.tsx`
- Create: `src/app/(dashboard)/emporio/financeiro/page.tsx` (por ora, só o título "Financeiro" e um texto "Em construção nesta entrega"; a Task 6 preenche)

**Interfaces:**
- Produces: `PAGINAS_DO_EMPORIO[].exige: AcaoEmporio | AcaoEmporio[] | null` (lista = passa se alguma passa). Entradas: Clientes `["vendedor_da_loja", "dinheiro"]`; Despesas, Resultado, Relatórios, Histórico, Configurações `["gestor_da_loja", "dinheiro"]`; nova `{ href: "/emporio/financeiro", rotulo: "Financeiro", exige: "dinheiro" }` logo depois de Caixa.
- Produces: `destinoDoSoDaLoja(c: PapelContexto): string` em `paginas-do-so-da-loja.ts`: `"/emporio/financeiro"` para `financeiro`, `DESTINO_DO_SO_DA_LOJA` para os demais. O layout e o proxy usam a função.
- Produces: `/meu-dia` redireciona o `financeiro` para `/emporio/financeiro` (é a entrada depois do login, que manda todos para `/meu-dia`).

- [ ] **Step 1: `paginas.ts`**: `exige` aceita lista; `veAPagina` trata os três casos; adicionar a página e trocar as cinco entradas.
- [ ] **Step 2: `destinoDoSoDaLoja`** e os dois usos (`layout.tsx` linha ~54, `proxy.ts` linha ~151).
- [ ] **Step 3: `/meu-dia`**: `papelDoEmporio` e `redirect` quando `papel === "financeiro"`.
- [ ] **Step 4: página placeholder** em `/emporio/financeiro` (exige `dinheiro` via `exigir`, senão 404 como as outras páginas fazem).
- [ ] **Step 5: `npx tsc --noEmit`, `npm run check`**.

---

### Task 3: A conta da compra se paga dentro do Empório (lacuna 2.26)

**Files:**
- Modify: `src/lib/actions/emporio-despesas.ts` (`viewDaConta`, `INCLUDE_CONTA`, `SO_DO_EMPORIO`, `listarContasAPagarAction`, `acharContaDoEmporio`, `pagarDespesasAction`; novas `adiarVencimentoContaAction`, `cancelarContaAction`)
- Modify: `src/lib/actions/emporio-compras.ts` (`CompraInput.payment.paid_from`, `criarCompraAction`)
- Modify: `src/lib/emporio/historico.ts` (`despesa.adiar`, `despesa.cancelar`)
- Modify: rotas `src/app/api/v1/emporio/payables/pay/route.ts` (já existe), criar `payables/[id]/due-date/route.ts` (PATCH) e `payables/[id]/cancel/route.ts` (POST); `purchases/route.ts` (schema Zod do body)
- Modify: `src/app/(dashboard)/emporio/_components/compra-form.tsx` (lugar do dinheiro na compra à vista/entrada), `contas-a-pagar.tsx` e `pagar-contas-form.tsx` (origem "compra", botões adiar e cancelar)

**Interfaces:**
- Consumes: `CashMovementOrigin.pagamento_compra`, `exigirUma` (Task 1).
- Produces: `ContaAPagarView.origin: "vendeu_pagou" | "despesa_fixa" | "compra"`, campos novos `purchase_id: string | null`, `supplier_name: string | null`. Para a compra, `name` é o nome do fornecedor ou "Compra sem fornecedor".
- Produces: `SO_DO_EMPORIO` ganha a terceira forma: entry cuja `related_id` é de uma `EmporioPurchase` com `canceled_at: null`. Como `FinancialEntry` não tem relação com `EmporioPurchase`, resolver por consulta em duas etapas (ids das compras do tenant não canceladas) ou por `related_id: { in: [...] }`: builder escolhe, com índice em mente (há `related_id` indexado?). A view carrega o fornecedor da compra.
- Produces: `pagarDespesasAction` exige `exigirUma(["gestor_da_loja", "dinheiro"])`; quando o ator NÃO passa em `gestor_da_loja` (é Financeiro) e `from.establishment_id` veio preenchido: `fail("VALIDATION_ERROR", "O Financeiro paga pela conta bancária; o dinheiro da gaveta é com a loja.", 422, "from")`. A conta da compra entra no fluxo igual às outras (payment, status, `CashMovement` saída `pagamento_despesa`).
- Produces: `adiarVencimentoContaAction(db, ator, { entry_id, due_date })`: `exigirUma(["gestor_da_loja","dinheiro"])`; conta não pendente: `fail("NOT_PENDING", "Só é possível adiar o vencimento de uma conta pendente.", 422, "due_date")`; data inválida: 422 `due_date`; grava `due_date` e `despesa.adiar` no Histórico. Rota `PATCH /api/v1/emporio/payables/:id/due-date` body `{ due_date: string }`.
- Produces: `cancelarContaAction(db, ator, { entry_id, reason })`: mesma permissão; conta com pagamento: `fail("ENTRY_HAS_PAYMENTS", "Esta conta já tem pagamento registrado.", 422)`; conta da despesa fixa ou do vendeu-pagou pode ser cancelada; conta da compra: cancelar a conta não cancela a compra; grava `status: cancelled`, `notes` recebe o motivo, Histórico `despesa.cancelar`. Rota `POST /api/v1/emporio/payables/:id/cancel` body `{ reason: string }` (obrigatório, 422 `reason`).
- Produces: `CompraInput.payment.paid_from?: { establishment_id?: string | null; bank_account_id?: string | null; cash_register_id?: string | null }`. Regras em `criarCompraAction` quando há parte paga (à vista com total > 0, ou entrada > 0): sem `paid_from` ou com os dois/nenhum lugar: `fail("VALIDATION_ERROR", "Diga de onde saiu o dinheiro da compra: a gaveta da loja ou uma conta.", 422, "paid_from")`; `establishment_id` diferente da loja da compra: 422 `paid_from` "O dinheiro da gaveta sai da loja da compra."; gaveta: `resolverTurno(tx, ator, loja, cash_register_id, "exige")` (recusa `CASH_CLOSED` como hoje no caixa) e saldo da gaveta/caixa suficiente senão `INSUFFICIENT_CASH` 409; conta: `exigirUma(["gestor_da_loja","dinheiro"], "pagar da conta bancária", loja.id)` (o Vendedor com chave recebe 403), conta existente e não arquivada, saldo (`saldosDasContas`) suficiente senão `INSUFFICIENT_CASH` 409. Cria o `CashMovement` saída, `origin: pagamento_compra`, com `financial_payment_id` do pagamento que `createLinkedEntry` criou (se `createLinkedEntry` não devolve o id do pagamento, buscar `financialPayment.findFirst({ where: { entry_id } })` dentro da transação). Compra a prazo e compra de propriedade: nada muda.
- Produces: no histórico da compra (`compra.criar`), `changes` registra o lugar de onde saiu o dinheiro (`dinheiro()` helper).

- [ ] **Step 1: Suíte da task (TDD)**: no arquivo `scripts/m98-emporio-financeiro-casa.test.ts` (criado pela Task 7 em paralelo; se ainda não existir, crie a Seção 3 nele com o cabeçalho padrão de `m97`): casos "compra a prazo aparece em payables com origin compra e supplier_name", "pagar pela conta cria CashMovement saída na conta e fecha a entry", "Financeiro pagando da gaveta recebe 422 from", "compra à vista sem paid_from 422 paid_from", "compra à vista da gaveta com turno fechado CASH_CLOSED e nada gravado", "compra à vista da conta pelo Vendedor com chave 403", "compra à vista da conta pelo Gestor cria CashMovement pagamento_compra", "adiar vencimento e cancelar conta com e sem pagamento", "compra cancelada some de payables pendentes". Rodar: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m98`. Esperado: falha nos casos da Seção 3.
- [ ] **Step 2: Implementar em `emporio-despesas.ts`** (view, filtro, pagar, adiar, cancelar) e em `historico.ts`.
- [ ] **Step 3: Implementar em `emporio-compras.ts`** (`paid_from`).
- [ ] **Step 4: Rotas** (Zod: `paid_from` opcional no body da compra; as duas rotas novas; `apiErroDeZod`).
- [ ] **Step 5: Telas**: `compra-form.tsx` mostra "De onde saiu o dinheiro" (gaveta da loja / conta) quando à vista ou com entrada, e o caixa do turno quando gaveta; `contas-a-pagar.tsx` mostra origem "Compra" com o fornecedor e os botões "Adiar" e "Cancelar" (com motivo); `pagar-contas-form.tsx` esconde a opção gaveta quando o ator não passa em `gestor_da_loja`.
- [ ] **Step 6: Rodar `test:m98` Seção 3** (verde), `npm run test:m83` e `test:m79` (despesas e compras de antes, sem regressão), `tsc`, `check`.

---

### Task 4: O Empório fora do `/financeiro` do Tibé

**Files:**
- Modify: `src/lib/actions/financial-payments.ts` (`registrarPagamentoAction`), `src/lib/actions/financial-entries.ts` (`markEntryPaidAction`, `postponeEntryDueDateAction`, `cancelEntryAction`)
- Modify: `src/lib/financial-area.ts`, `src/lib/actions/financial-summary.ts`, `src/lib/actions/financial-reports.ts`, `src/lib/reports/*` (onde `area` é lida)
- Modify: `src/app/(dashboard)/financeiro/page.tsx` (remover o seletor), delete `src/app/(dashboard)/financeiro/area-filtro.tsx`, `src/app/(dashboard)/dashboard/page.tsx`
- Modify: `src/app/(public)/docs/api/endpoints.ts` (nota do `area`)
- Modify: `docs/agents/dividas.md` (2.26 e 2.27)

**Interfaces:**
- Produces: `ehDoEmporio(entry: { establishment_id: string | null; related_module: string }): boolean` em `src/lib/financial.ts` (true se `establishment_id` ou `related_module === "emporio"`).
- Produces: as quatro actions do Tibé recusam entry do Empório com `fail("ENTRY_DO_EMPORIO", "Esta conta é do Empório: pague, adie ou cancele em Meu Empório > Financeiro.", 422)` antes de qualquer outra checagem (depois do 404).
- Produces: `lerArea` continua aceitando os três valores (e vazio) sem erro, mas `filtroDeArea` devolve SEMPRE `{ establishment_id: null, ...propriedade }`; `areaPermitida` devolve sempre `"fazenda"`. O tipo `AreaFinanceira` fica para o contrato não quebrar. Comentário de topo do arquivo explica a Q222.
- Produces: `/financeiro` sem o seletor e sem ler `tibe:financeiro:area`; o Painel igual.
- Produces: `endpoints.ts`: nas seis rotas, a descrição do `area` diz "aceito e ignorado desde 07/11/2026: o Financeiro do Tibé é só da fazenda; o Empório tem o seu em /api/v1/emporio/finance".
- Produces: `dividas.md`: a linha 2.26 perde o terceiro item (conta do Empório paga sem sair de lugar) e ganha "fechado em 07/11/2026 (entrega 1 do financeiro do Empório)" no texto; a 2.27 vira "não vai existir: decisão Q222 de 07/11/2026, o Empório tem financeiro próprio" (siga o formato que o arquivo usa para dívida fechada; leia o cabeçalho dele).

- [ ] **Step 1: Casos na Seção 4 de `test:m98`**: OWNER chamando `PATCH /api/v1/financial-entries/:id/pay` numa entry do Empório recebe 422 `ENTRY_DO_EMPORIO`; `POST .../payments`, `PATCH .../postpone` (ou o nome real da rota de adiar), `cancel` idem; `GET /api/v1/financial-entries?area=emporio` devolve só lançamentos sem `establishment_id` (ou seja, nenhum do Empório); `GET /api/v1/financial/dre?area=tudo` não soma o Empório. Rodar; esperado: falha.
- [ ] **Step 2: Implementar** as recusas e o filtro; remover o seletor; ajustar o Painel.
- [ ] **Step 3: Docs**: `endpoints.ts`, `dividas.md`.
- [ ] **Step 4: Rodar** `test:m98` Seção 4, `npm run test:m84` (F4b, que testava o filtro de área: os casos que pediam `emporio` precisam ser atualizados para a regra nova, não apagados), `npm run test:docs-api`, `npm run test:m4` com Redis local (resumo), `tsc`, `check`.

---

### Task 5: As actions e rotas da casa

**Files:**
- Create: `src/lib/actions/emporio-financeiro.ts`
- Modify: `src/lib/actions/emporio-caixa.ts` (`receberFiadoAction`, `lerCaixaAction`, `listarContasAction`/`criarContaAction`/`editarContaAction`/`saldoInicial*` para `exigirUma(["conta","dinheiro"])`; `definirContaPixAction`, `definirRegraCartaoAction`, `removerRegraCartaoAction` para `exigirUma(["gestor_da_loja","dinheiro"])`)
- Modify: `src/lib/actions/emporio-despesas.ts` (as actions de despesa fixa e regra variável para `exigirUma(["gestor_da_loja","dinheiro"])`; `listarContasAPagarAction` idem), `src/lib/actions/emporio-clientes.ts` (`lerFicha`, `buscarClientesAction`, listagem: leitura com `exigirUma(["vendedor_da_loja","dinheiro"])`), `src/lib/actions/emporio-configuracoes.ts` (`salvarConfiguracoesAction` segue `conta`; nada muda nesta entrega)
- Create: `src/app/api/v1/emporio/finance/today/route.ts`, `finance/receivables/route.ts`, `finance/statement/route.ts`

**Interfaces:**
- Produces, em `emporio-financeiro.ts`:
  - `resumoHojeAction(db, ator, { establishment_id? }): ActionResult<HojeView>`, exige `dinheiro`. `HojeView = { positions: { kind: "gaveta" | "gerencia" | "conta"; id: string; name: string; establishment_id: string | null; balance: number }[]; total_balance: number; payables_due: { count: number; total: number; items: ContaAPagarView[] }; receivables_due: { fiado: { count: number; total: number }; checks: { count: number; total: number }; cards: { count: number; total: number } }; overdue_fiado: { customers: number; total: number } }`. Regras: `positions` vem de `saldoDaGaveta` por loja ativa, `saldoDaGerencia` por loja, `saldosDasContas` por conta não arquivada; com `establishment_id`, só a gaveta e a gerência daquela loja, mais as contas (a conta é de todas). `payables_due`: `listarContasAPagarAction` pendentes com `due_date <= hoje` (fim do dia local). `receivables_due.fiado`: entries de `entradasAbertas` com `due_date <= hoje` (count = clientes distintos); `checks`: `EmporioCheck` `status in (recebido, depositado)` com `good_for <= hoje`; `cards`: `CardReceivable` não cancelado com `expected_on` hoje. `overdue_fiado`: de `listarFiadoAction` (`overdue_amount > 0`).
  - `contasAReceberAction(db, ator, { establishment_id? }): ActionResult<{ fiado: ClienteFiadoView[]; checks: ChequeView[]; cards: CartaoAReceberView[] }>`, exige `dinheiro`; `CartaoAReceberView = { id, sale_id, establishment_id, establishment_name, bank_account_id, bank_account_name, installment, installments, gross_amount, net_amount, expected_on: string, received: boolean }` onde `received = expected_on <= hoje` (regra atual de `saldosDasContas`).
  - `extratoDaContaAction(db, ator, { bank_account_id, de: Date, ate: Date }): ActionResult<ExtratoView>`, exige `exigirUma(["gestor_da_loja","dinheiro"])`. `ExtratoView = { account: { id, name, bank }; opening_balance: number; lines: { kind: "movimento" | "cartao"; id: string; occurred_on: string; direction: "entrada" | "saida"; amount: number; origin: string; establishment_id: string | null; establishment_name: string | null; description: string }[]; closing_balance: number }`. `lines` = `CashMovement` da conta no período (`occurred_at`) mais `CardReceivable` da conta com `expected_on` no período e não cancelado (kind `cartao`, direction `entrada`, amount `net_amount`, origin `"cartao"`, description "Cartão NSU... parcela i/n" ou "Cartão, parcela i/n"); ordenadas por data; `opening_balance` = saldo antes de `de` (mesma regra de `saldosDasContas`, limitada à data); `closing_balance = opening + entradas - saídas`. Período máximo 92 dias (422 `ate`).
- Produces: `receberFiadoAction` exige `exigirUma(["vendedor_da_loja","dinheiro"], "receber fiado", loja)`; quando o ator não passa em `vendedor_da_loja` na loja e `kind === "dinheiro"`: `fail("VALIDATION_ERROR", "O Financeiro recebe pela conta bancária; o dinheiro é no caixa da loja.", 422, "kind")`. Por Pix, sem turno (`se_houver` já faz isso).
- Produces: rotas `GET /api/v1/emporio/finance/today?establishment_id=`, `GET /api/v1/emporio/finance/receivables?establishment_id=`, `GET /api/v1/emporio/finance/statement?bank_account_id=&de=&ate=` (datas ISO `YYYY-MM-DD`; faltando `bank_account_id` 422), todas com `guard` + `exigir` como as rotas do Empório fazem.

- [ ] **Step 1: Casos na Seção 5 de `test:m98`**: Financeiro lê `today` com as três posições e os totais certos num cenário com gaveta, gerência, conta, uma conta a pagar vencida, um fiado vencido, um cheque bom para hoje e um cartão para hoje; filtro por loja tira a gaveta da outra loja mas mantém a conta; Financeiro recebe fiado por Pix (CashMovement na conta, sem turno) e é recusado em dinheiro (422 `kind`); `statement` lista o movimento e a parcela de cartão com saldo de abertura e fechamento batendo; Vendedor recebe 403 em `today`; Financeiro lê a ficha do cliente (200) e não cria cliente (403); Financeiro cria conta bancária (201) e define Pix da loja (200); Gestor continua definindo Pix (200). Rodar; esperado: falha.
- [ ] **Step 2: Implementar** `emporio-financeiro.ts` e as mudanças de permissão.
- [ ] **Step 3: Rotas**.
- [ ] **Step 4: Rodar** `test:m98` Seção 5, `test:m81`, `test:m82` (caixa), `test:m95` (clientes), `tsc`, `check`.

---

### Task 6: As páginas da casa

**Files:**
- Modify: `src/app/(dashboard)/emporio/financeiro/page.tsx` (Hoje)
- Create: `src/app/(dashboard)/emporio/financeiro/pagar/page.tsx`, `receber/page.tsx`, `caixa/page.tsx`
- Create: `src/app/(dashboard)/emporio/_components/financeiro-abas.tsx` (subnavegação Hoje / A pagar / A receber / Posição de caixa, preservando `?loja=`), `financeiro-hoje.tsx`, `financeiro-receber.tsx`, `financeiro-extrato.tsx`, `loja-filtro.tsx` (o seletor `?loja=` com "Todas as lojas", extraído do padrão de `vendas-filtro.tsx` se ainda não houver um genérico)
- Modify: `src/app/(dashboard)/emporio/page.tsx` (cartão "Financeiro" para quem vê a página)

**Interfaces:**
- Consumes: Task 5 (actions, chamadas direto da Server Component com `getTenantDb()` e o usuário da sessão, como as páginas do Empório fazem) e Task 3 (`contas-a-pagar.tsx`, `pagar-contas-form.tsx`, `receber-fiado-form.tsx`).
- Produces: páginas exigindo `dinheiro` (404 para quem não passa, igual às outras páginas do Empório). Hoje: quatro blocos como cartões, cada um com link para a aba que resolve; "Esperando aprovação" e "Sem carimbo" NÃO existem nesta entrega. A pagar: `contas-a-pagar.tsx` com o filtro de loja e o formulário de pagar (origem só conta para o Financeiro). A receber: três seções (fiado por cliente com o botão de receber por Pix; cheques em carteira; cartões a receber por data). Posição de caixa: a tabela das posições e, ao escolher uma conta (`?conta=`), o extrato do período (`?de=&ate=`, padrão últimos 30 dias) com as linhas de `extratoDaContaAction`.
- Produces: a 390 px nada rola na horizontal; dinheiro com `brl`; cores por token; sem `<input type="number">`.

- [ ] **Step 1: Implementar as páginas e componentes.**
- [ ] **Step 2: `npm run build`** (as páginas novas compilam), `npm run lint`, `npm run check` (conferências 8 a 12 e 15 a 18 pegam token, input number, recusa engolida).
- [ ] **Step 3: Abrir no `next dev` como Financeiro** (cookie por `scripts/_sessao-cookie.ts`, nunca senha) e conferir as quatro abas com o cenário da Task 8. Relatar o que viu.

---

### Task 7: A suíte `test:m98` (escrita da spec, em paralelo às Tasks 3 a 5)

**Files:**
- Create: `scripts/m98-emporio-financeiro-casa.test.ts`
- Modify: `package.json` (`"test:m98": "tsx scripts/m98-emporio-financeiro-casa.test.ts"`)

**Interfaces:**
- Consumes: todos os contratos das Tasks 1 a 5 (rotas, códigos, campos) e o padrão das suítes (`m97`: `_env-local`, `exigirBancoLocal`, `check`, dois tenants, cookies de sessão por `_sessao-cookie` ou o helper que `m97` usa, fixtures de `_emporio-papel.ts`).
- Produces: seções: 1 papel (matriz `pode` para `financeiro`, página visível, `exigirUma`); 2 equipe (cadastrar Financeiro sem loja; função inválida); 3 compra e contas a pagar (Task 3); 4 `/financeiro` do Tibé (Task 4); 5 casa (Task 5); 6 isolamento (o Financeiro do tenant A não vê nada do tenant B em `today`, `receivables`, `statement`, `payables`).

- [ ] **Step 1: Escrever a suíte** a partir deste plano e da spec, sem ler a implementação. Cada `check` com nome que diga a regra.
- [ ] **Step 2: Rodar** `DATABASE_URL=... npm run test:m98`; esperado antes das Tasks 3 a 5: as seções 3 a 5 reprovam, a 1 e a 2 passam depois da Task 1.

---

### Task 8: Cenário, roteiro de navegador e manual

**Files:**
- Create: `scripts/_cenario-emporio-financeiro-casa.ts` (duas lojas, uma conta bancária com saldo inicial, um Gestor, um Caixa com turno aberto numa loja, um Financeiro `fin@teste.local`, uma compra a prazo vencida, um fiado vencido, um cheque bom para hoje, um cartão para hoje)
- Create: `scripts/navegador/emporio-financeiro-casa.py`
- Modify: `scripts/cenario-demonstracao-emporio.ts` (um usuário Financeiro; as compras à vista com `paid_from`), o seed de demonstração que cria compras à vista
- Modify: manual do Empório (`src/app/(dashboard)/manual/_conteudo/`): parte "Financeiro das lojas" (o papel, a casa, pagar a compra, o aviso sobre o saldo das compras à vista antigas) e a parte de Compras (de onde saiu o dinheiro)
- Modify: `docs/specs/module-39-meu-emporio.md` (tabela de decisões: Q214 a Q237, copiadas da spec), `docs/agents/dividas.md` (as sete dívidas novas da spec)

**Interfaces:**
- Consumes: Tasks 1 a 6.
- Produces: roteiro que (1) entra como Financeiro e cai em `/emporio/financeiro` com os quatro blocos; (2) não vê "Vender" nem "Equipe" no menu e não abre `/dashboard` (volta para a casa); (3) paga a conta da compra pela conta e vê o saldo da conta cair no extrato; (4) tenta pagar da gaveta e não tem a opção; (5) recebe um fiado por Pix e vê a linha no extrato; (6) como Gestor, lança compra à vista da gaveta com turno aberto e vê o movimento no Caixa; (7) como OWNER, o `/financeiro` do Tibé não lista a conta do Empório e não tem o seletor de área; (8) a 390 px sem rolagem horizontal. Nos dois sentidos: o roteiro precisa REPROVAR com `ehDoEmporio` devolvendo sempre falso (passo 7) ou com a rota `today` devolvendo zero (passo 1): rode uma vez quebrado, registre, desfaça.
- Produces: `manual-emporio` regravado onde a parte nova entra; PNGs que não mudaram restaurados com `git checkout`.

- [ ] **Step 1: Cenário e roteiro**; rodar `npm run navegador -- emporio-financeiro-casa` (com `npm run dev` de pé; porta 3001 e `TIBE_BASE` se a 3000 estiver ocupada). Esperado: verde; depois quebrado de propósito: vermelho; desfeito: verde.
- [ ] **Step 2: Demonstração e seed**; rodar `npm run seed:demo` e `npx tsx scripts/cenario-demonstracao-emporio.ts` contra o Docker. Esperado: terminam sem erro.
- [ ] **Step 3: Manual, spec e dívidas**; `npm run navegador -- manual-emporio`; `npm run check`.

---

## Gates da entrega (depois da Task 8)

```
npm run check
npx tsc --noEmit
npm run lint
npm run build
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m98
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:isolation
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:all -- --sem-redis
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```
Esperado: 0 falhas; 0 erros; build ok; m98 verde; isolamento verde; `test:all` com todas as suítes de antes verdes mais a m98; o diff com só os dois `DROP INDEX` dos índices parciais.

Depois: juiz (`prova-juiz`, Opus) sobre o range `emporio-financeiro-spec..HEAD` com a rubrica do contrato de missão.
