# Empório, entrega 2: caixa com turno. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda loja passa a ter caixas numerados (gavetas físicas) com turno aberto e encerrado, sangria e malote que esperam o gerente confirmar, o lugar "Com a gerência", o papel Caixa na Equipe e o relatório do encerramento em A4 e na bobina.

**Architecture:** Três tabelas novas (`CashRegister`, `CashSession`, `CashHandover`) e colunas novas em `CashMovement`, `CashCount` e `EmporioSale`. O saldo continua sendo soma de `CashMovement`: o do caixa filtra por `cash_register_id`, o da gaveta da loja continua por `establishment_id` (soma dos caixas), e o da gerência por `manager_establishment_id`, um terceiro lugar no mesmo CHECK. Toda operação de dinheiro da gaveta resolve o turno aberto por uma função só (`resolverTurno`) dentro da transação serializável que já existe. O relatório reaproveita a casca de impressão da entrega 1.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Postgres 17, Zod 4, Tailwind com `print:`.

**Spec:** `docs/superpowers/specs/2026-11-04-emporio-orcamento-caixa-impressao-design.md`, seção "Entrega 2: caixa com turno". Spec do módulo: `docs/specs/module-39-meu-emporio.md` (as decisões desta entrega entram a partir da **Q150**).

## Global Constraints

- As oito invariantes do `CLAUDE.md`. Em especial: o saldo nunca é gravado (turno, caixa e gerência são soma de `CashMovement`); migração antes do push; nunca travessão (U+2014); nada de heredoc para escrever arquivo; regra de negócio em `src/lib/actions`, rota fina.
- Todo model novo com `tenant_id` entra em `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts`); `npm run test:isolation` reprova se esquecer.
- Ordem action, rota, tela. Rota nova documentada em `src/app/(public)/docs/api/endpoints.ts` (`npm run test:docs-api`). Origem nova do Meu Dia em `packages/contracts/src/meu-dia.ts`.
- Toda escrita do Empório chama `registrarNoHistorico` (conferência 19 do `npm run check`); permissão sai de `src/lib/emporio/papel.ts` (`pode`, `exigir`).
- Toda escrita de dinheiro roda em `runSerializableTenantTransaction` (`src/lib/financial.ts`) e é idempotente por `operation_key` (busca antes; violação de único devolve o gravado com `replayed: true`), como `conferirGavetaAction`.
- Recusa de campo sai com `field` (4º parâmetro de `fail`) e o nome do campo na API; Zod por `apiErroDeZod`.
- Suíte nova: `test:m92` (`scripts/m92-emporio-turno.test.ts`), escrita da spec e vista falhando antes. Comando sempre com as URLs locais inline:
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m92`
- Migração local: `migrate diff` com a URL do Docker inline, SQL salvo à mão, `db:deploy` com a URL do Docker inline. **Nunca no Neon** nesta branch. Remover do SQL gerado os `DROP INDEX` de `WhatsAppProviderConfig_one_active` e `AnimalBatch_tenant_ear_tag_key`.
- Subagente não commita: deixa no working tree e relata os arquivos.

### Valores fixados por este plano (decisões do controlador sobre o que a spec deixou ao builder)

| o quê | valor |
|---|---|
| nome do caixa | `Caixa <number>`, `number` sequencial por loja, a partir de 1 |
| um turno aberto por caixa | coluna `CashSession.open_register_id String? @unique`, igual ao `cash_register_id` enquanto aberto e nula ao encerrar (Postgres aceita vários nulos) |
| lugar "Com a gerência" | `CashMovement.manager_establishment_id`; o CHECK `CashMovement_exactly_one_place` passa a exigir exatamente um de `establishment_id`, `bank_account_id`, `manager_establishment_id` |
| origens novas de `CashMovementOrigin` | `sangria`, `malote`, `reforco`, `entrega_gerencia` |
| `CashCountKind` | `abertura`, `livre`, `encerramento` (default `livre`) |
| `CashHandoverKind` | `sangria`, `malote` |
| papel novo | `EmporioRole.caixa`; `PapelEmporio` ganha `"caixa"` |
| diferença na entrega ao gerente | fica em `CashHandover.difference` e vira lançamento "Diferença de caixa" como na conferência (Q93): despesa se faltou, receita se sobrou |
| chave `transferir_caixa` | sai de `EMPORIO_KEYS`; a migração a tira de `User.emporio_keys` |
| transferência (Q92) | não sai nem entra na gaveta; vale entre contas bancárias e a gerência de uma loja. Saindo da gerência: `gestor_da_loja` daquela loja. Saindo de conta: `conta` (como hoje) |
| saldo inicial (implantação) | uma vez por caixa (`cash_register_id`) e uma vez pela gerência de cada loja; conta bancária como hoje |
| a venda exige turno | sempre, qualquer forma de pagamento, para o relatório do turno ter todas as vendas |

### Recusas (código, status, `field`, mensagem exata)

| código | status | field | mensagem |
|---|---|---|---|
| `CASH_CLOSED` | 409 | `cash_register_id` | `Nenhum caixa aberto nesta loja. Abra o caixa com o troco inicial.` |
| `CASH_REGISTER_REQUIRED` | 422 | `cash_register_id` | `Há mais de um caixa aberto. Escolha o caixa.` |
| `SESSION_ALREADY_OPEN` | 409 | `cash_register_id` | `Este caixa já está aberto.` |
| `SESSION_CLOSED` | 409 | (nenhum) | `Este turno já foi encerrado.` |
| `NOT_SESSION_OWNER` | 403 | (nenhum) | `Só quem abriu o caixa ou o gestor da loja encerra este turno.` |
| `INSUFFICIENT_CASH` | 409 | `amount` (sangria), `reinforcement` (abertura) | `Não há dinheiro suficiente para isso.` (sangria e reforço; a de hoje continua nos outros lugares) |
| `MALOTE_TOO_BIG` | 422 | `malote_amount` | `O malote não pode passar do que foi contado.` |
| `HANDOVER_ALREADY_CONFIRMED` | 409 | (nenhum) | `Esta entrega já foi confirmada.` |
| `DRAWER_TRANSFER` | 422 | `from` ou `to` | `A gaveta vai ao gerente pela sangria ou pelo malote.` |
| justificativa | 422 | `justification` | a mesma da conferência de hoje |

## Review Focus

1. **O encerramento não bater** porque um lançamento de dinheiro caiu fora do turno (anti-objetivo da spec): fiado recebido, devolução, cancelamento, diferença da troca e despesa paga da gaveta, cada um com dinheiro, num turno que depois encerra com contado = esperado e diferença zero. Teste na Task 4.
2. **O balcão travar** com o caixa fechado ou com dois caixas abertos e quem fatura não ter aberto nenhum: a venda tem que pedir abrir ou escolher, nunca ficar sem saída. Teste na Task 4 (recusas com `field`) e no roteiro da Task 8.
3. **Duas aberturas simultâneas do mesmo caixa** (dois cliques, dois aparelhos): só uma vale, a outra recebe `SESSION_ALREADY_OPEN`. Teste com `Promise.all` na Task 3.
4. **Turno que passa da meia-noite:** continua valendo, a venda de depois da meia-noite cai nele, e o Meu Dia avisa "aberto desde". Teste na Task 3 (abrir com `opened_at` de ontem pelo banco).
5. **Dado de outra conta ou de outra loja:** o Caixa da Loja 1 não abre, lê nem encerra caixa da Loja 2, e nada de uma conta aparece na outra. Teste na Task 3 e na Task 2.

---

### Task 1: Schema, migração e o saldo por caixa

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/prisma.ts` (`TENANT_SCOPED_MODELS`)
- Create: `prisma/migrations/20261105120000_emporio_caixa_turno/migration.sql`
- Modify: `src/lib/actions/emporio-caixa.ts` (saldos), `src/lib/actions/emporio-catalogo.ts` (`criarEstabelecimentoAction` cria o Caixa 1)
- Create: `scripts/m92-emporio-turno.test.ts`; Modify: `package.json` (`test:m92`)

**Interfaces:**
- Produces (schema):
  - `CashRegister { id, tenant_id, establishment_id, number Int, created_by_user_id String?, created_at }`, `@@unique([tenant_id, establishment_id, number])`, `onDelete` igual ao de `CashCount` para a loja.
  - `CashSession { id, tenant_id, establishment_id, cash_register_id, open_register_id String? @unique, operation_key String, opened_by_user_id, opened_at DateTime, opening_expected Decimal(14,2), opening_counted Decimal(14,2), reinforcement Decimal(14,2) @default(0), closed_at DateTime?, closed_by_user_id String?, close_operation_key String?, closing_expected Decimal(14,2)?, closing_counted Decimal(14,2)?, malote_amount Decimal(14,2)? }`, `@@unique([tenant_id, operation_key])`, `@@unique([tenant_id, close_operation_key])`, `@@index([tenant_id, establishment_id, closed_at])`.
  - `CashHandover { id, tenant_id, establishment_id, cash_register_id, cash_session_id, kind CashHandoverKind, amount Decimal(14,2), operation_key String, notes String?, created_by_user_id, created_at, confirmed_at DateTime?, confirmed_by_user_id String?, confirm_operation_key String?, received_amount Decimal(14,2)?, difference Decimal(14,2)?, confirm_notes String? }`, `@@unique([tenant_id, operation_key])`, `@@unique([tenant_id, confirm_operation_key])`, `@@index([tenant_id, establishment_id, confirmed_at])`.
  - `CashMovement` + `cash_register_id String?`, `cash_session_id String?`, `manager_establishment_id String?`, `cash_handover_id String?` (com relações e índices `[tenant_id, cash_register_id]`, `[tenant_id, cash_session_id]`, `[tenant_id, manager_establishment_id]`).
  - `CashCount` + `cash_register_id String?`, `cash_session_id String?`, `kind CashCountKind @default(livre)`.
  - `EmporioSale` + `cash_session_id String?` (índice `[tenant_id, cash_session_id]`).
  - Enums da tabela de valores acima.
- Produces (código, em `src/lib/actions/emporio-caixa.ts`):
  - `saldoDoCaixa(db: TenantDb, cashRegisterId: string): Promise<number>`
  - `saldoDaGerencia(db: TenantDb, establishmentId: string): Promise<number>`
  - `saldoDaGaveta` continua igual (soma por `establishment_id`) e passa a ser, por construção, a soma dos caixas da loja.

- [ ] **Step 1: m92, seção 1 (falhando).** Casos:
  - `criarEstabelecimentoAction` cria a loja com exatamente um `CashRegister` de `number = 1`.
  - Depois de uma `entrada` de 50 no Caixa 1 e de 20 num Caixa 2 da mesma loja (criados direto pelo client escopado), `saldoDoCaixa` dá 50 e 20, e `saldoDaGaveta` dá 70.
  - `saldoDaGerencia` soma só os movimentos com `manager_establishment_id`, e não entra em `saldoDaGaveta`.
  - O CHECK recusa movimento com dois lugares preenchidos (gaveta e gerência).
  - Dois `CashSession` abertos com o mesmo `open_register_id` violam o único; com `open_register_id` nulo (encerrados) convivem.
  - Isolamento: o tenant B não vê `CashRegister`, `CashSession` nem `CashHandover` do A.
- [ ] **Step 2:** Rodar `test:m92` e ver falhar (tabelas inexistentes).
- [ ] **Step 3: schema e migração.** Gerar com `migrate diff` (URL do Docker inline) e completar à mão, no fim do SQL:
  - recriar o CHECK `CashMovement_exactly_one_place` com os três lugares;
  - criar um `CashRegister` `number = 1` para cada `Establishment` existente (id gerado no SQL, como o backfill da entrega 1 fez com `ROW_NUMBER`);
  - preencher `cash_register_id` de todo `CashMovement` e `CashCount` com `establishment_id` não nulo, com o Caixa 1 da loja;
  - `UPDATE "User" SET emporio_keys = array_remove(emporio_keys, 'transferir_caixa')`.
  Nenhuma coluna nova é NOT NULL: o código antigo continua funcionando na janela do deploy.
- [ ] **Step 4:** `criarEstabelecimentoAction` cria o Caixa 1 na mesma transação. `saldoDoCaixa` e `saldoDaGerencia` no padrão de `saldoDaGaveta` (groupBy por direção, em centavos). Modelos novos em `TENANT_SCOPED_MODELS`.
- [ ] **Step 5:** Aplicar no Docker local, rodar `test:m92`, `test:isolation`, `test:m81`, `test:m82` e ver verdes. Reiniciar o `next dev` é com a sessão principal.
- [ ] **Step 6:** Relatar os arquivos (o controlador commita).

### Task 2: O papel Caixa

**Files:**
- Modify: `src/lib/emporio/papel.ts`, `src/lib/emporio/paginas.ts`, `src/lib/actions/emporio-equipe.ts`, `src/app/(dashboard)/emporio/equipe/_components/funcao.ts`, `src/app/(dashboard)/emporio/equipe/_components/equipe-form.tsx`, a listagem de vendas (`listarVendasAction` e a página `/emporio/vendas`), o ponto do limite de desconto do Vendedor em `src/lib/actions/emporio-vendas.ts`
- Test: `scripts/m92-emporio-turno.test.ts` (seção 2), o teste do menu (`nav-build`) e `scripts/navegador/emporio-cliente-menu.py` se ele listar papéis

**Interfaces:**
- Consumes: `EmporioRole.caixa` (Task 1).
- Produces: `PapelEmporio` com `"caixa"`. `pode(c, "vendedor_da_loja", loja)` é verdadeiro para o Caixa nas lojas dele; `pode(c, "chave:*")` é sempre falso para ele; `pode(c, "gestor_da_loja")` e `pode(c, "conta")` falsos. Nova ação `AcaoEmporio` `"fora_do_caixa"`: verdadeira para todo papel com Empório, menos o Caixa.

- [ ] **Step 1: m92, seção 2 (falhando).**
  - `cadastrarMembroAction` aceita `emporio_role: "caixa"` com `establishment_ids` (obrigatórias, como o Vendedor) e recusa `emporio_keys` não vazias para ele (422 no `field` `emporio_keys`).
  - Para um Caixa da Loja 1: `pode(c,"vendedor_da_loja",loja1)` verdadeiro, com `loja2` falso; `pode(c,"chave:devolver_trocar",loja1)` falso; `pode(c,"gestor_da_loja",loja1)` falso.
  - `paginasVisiveis` do Caixa é exatamente `/emporio`, `/emporio/vender`, `/emporio/vendas`, `/emporio/fiado`, `/emporio/caixa`.
  - `devolverAction`, `cancelarVendaAction`, `pagarDespesasAction` e a leitura do estoque recusam o Caixa com 403.
  - `listarVendasAction` para o Caixa devolve só as vendas de hoje (fuso de São Paulo) das lojas dele, mesmo pedindo um período maior.
  - Desconto acima de `max_discount_pct` da loja é recusado para o Caixa como é para o Vendedor.
  - `EMPORIO_KEYS` não tem mais `transferir_caixa`.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar. O Caixa é `soDaLoja` como o Vendedor. Em `PAGINAS_DO_EMPORIO`, Produtos, Estoque, Compras, Transferências e Lojas passam de `exige: null` para `exige: "fora_do_caixa"`; as páginas e as actions de leitura correspondentes recusam o Caixa (a página redireciona para `/emporio`). A Equipe ganha a função "Caixa" com o mesmo bloco de lojas do Vendedor e sem chaves. Procure todo `papel === "vendedor"` (e afins) em `src/lib` e `src/app/(dashboard)/emporio` e decida, caso a caso, se o Caixa entra; relate a lista.
- [ ] **Step 4:** `test:m92`, `test:m87`, `test:m90`, `test:isolation`, `tsc`, `check` verdes.
- [ ] **Step 5:** Relatar os arquivos.

### Task 3: Caixas, turno, sangria, encerramento e a gerência (actions, rotas, Meu Dia)

**Files:**
- Create: `src/lib/actions/emporio-turno.ts`
- Modify: `src/lib/actions/emporio-caixa.ts` (`conferirGavetaAction`, `transferirCaixaAction`, `saldoInicialCaixaAction`, `lerCaixaAction`), `src/lib/emporio/historico.ts`, `src/lib/actions/emporio-meu-dia.ts`, `packages/contracts/src/meu-dia.ts`, `src/app/(public)/docs/api/endpoints.ts`
- Create (rotas, todas com `guardEmporio` e `respostaDaAction`):
  - `src/app/api/v1/emporio/cash/registers/route.ts` (GET `?establishment_id=`, POST `{ establishment_id }`)
  - `src/app/api/v1/emporio/cash/sessions/route.ts` (GET `?establishment_id=&status=open|closed`, POST abrir)
  - `src/app/api/v1/emporio/cash/sessions/[id]/route.ts` (GET)
  - `src/app/api/v1/emporio/cash/sessions/[id]/withdrawals/route.ts` (POST sangria)
  - `src/app/api/v1/emporio/cash/sessions/[id]/close/route.ts` (POST)
  - `src/app/api/v1/emporio/cash/handovers/route.ts` (GET `?establishment_id=&status=pending|confirmed`)
  - `src/app/api/v1/emporio/cash/handovers/[id]/confirm/route.ts` (POST)
- Test: m92 seção 3; ajustar `scripts/m82-*.test.ts` (transferência e conferência), `scripts/m85-*.test.ts` (Meu Dia) e `scripts/m89-*.test.ts` (Histórico)

**Interfaces:**
- Consumes: Task 1 (tabelas, saldos) e Task 2 (papel).
- Produces (em `emporio-turno.ts`):
  - `resolverTurno(tx, ator, establishmentId: string, pedido: string | undefined, modo: "exige" | "se_houver")`, devolvendo `{ ok: true, turno: { id, cash_register_id } | null }` ou a recusa no formato de `ActionResult` (use os tipos que `runSerializableTenantTransaction` e `exigir` já usam para a transação e o ator). Regra: com `pedido`, ele tem que ser um caixa daquela loja com turno aberto (senão `CASH_CLOSED`); sem `pedido`, nenhum aberto dá `CASH_CLOSED` (ou `null` no modo `se_houver`), um aberto é ele, vários abertos é o que o ator abriu, e sem esse dá `CASH_REGISTER_REQUIRED` (ou `null` no modo `se_houver`).
  - `listarCaixasAction(db, user, establishmentId)`: `{ id, number, nome: "Caixa N", saldo, turno_aberto: { id, aberto_por, aberto_em } | null }[]`.
  - `criarCaixaAction(db, user, { establishment_id })`: `gestor_da_loja`; `number = max + 1`.
  - `abrirTurnoAction(db, user, { operation_key, cash_register_id, counted, justification?, reinforcement? })`: `vendedor_da_loja` (o Caixa incluso). Na transação: se houver `reinforcement > 0`, exige saldo da gerência da loja (`INSUFFICIENT_CASH` no `reinforcement`) e grava `saida` da gerência e `entrada` no caixa com origem `reforco`; `opening_expected = saldoDoCaixa` depois do reforço; grava `CashCount kind abertura` e, com diferença, exige justificativa e faz o ajuste como a conferência de hoje (movimento `conferencia` e lançamento "Diferença de caixa"); grava o `CashSession` com `open_register_id = cash_register_id` (único violado vira `SESSION_ALREADY_OPEN`).
  - `sangriaAction(db, user, sessionId, { operation_key, amount, notes? })`: turno aberto; `amount <= saldoDoCaixa` (senão `INSUFFICIENT_CASH` no `amount`); grava `CashHandover kind sangria` e `saida` do caixa com origem `sangria`, `cash_handover_id` e `cash_session_id`.
  - `conferirGavetaAction` passa a receber `cash_register_id` (obrigatório na rota) e a exigir turno aberto naquele caixa; grava `CashCount kind livre` com `cash_session_id`. A regra de diferença não muda.
  - `encerrarTurnoAction(db, user, sessionId, { operation_key, counted, justification?, malote_amount })`: quem abriu, ou `gestor_da_loja`, ou qualquer `vendedor_da_loja` quando nenhum usuário da loja tem o papel Caixa (senão `NOT_SESSION_OWNER`); `closing_expected = saldoDoCaixa`; `CashCount kind encerramento` com a regra de diferença; `malote_amount <= counted` (senão `MALOTE_TOO_BIG`); com malote maior que zero, `CashHandover kind malote` e `saida` origem `malote`; grava `closed_at`, `closed_by_user_id`, `closing_*`, `malote_amount` e `open_register_id = null`. Turno já encerrado: `SESSION_CLOSED`.
  - `confirmarEntregaAction(db, user, handoverId, { operation_key, received_amount, notes? })`: `gestor_da_loja` da loja da entrega; `entrada` na gerência (`manager_establishment_id`) com origem `entrega_gerencia` e o valor recebido; `difference = received_amount - amount`; diferença diferente de zero exige `notes` (422 no `field` `notes`) e gera o lançamento "Diferença de caixa"; já confirmada: `HANDOVER_ALREADY_CONFIRMED`.
  - `listarEntregasAction(db, user, { establishment_id?, status })` e `lerTurnoAction(db, user, sessionId)`.
  - `transferirCaixaAction`: origem ou destino na gaveta dá `DRAWER_TRANSFER` (no `field` `from` ou `to`); passa a aceitar a gerência de uma loja como origem ou destino (forma do payload: estender o atual de forma aditiva, por exemplo `from_kind: "conta" | "gerencia"`, e documentar).
  - `saldoInicialCaixaAction`: aceita `cash_register_id` (uma vez por caixa) e a gerência de uma loja (uma vez, `gestor_da_loja`).
  - Histórico: chaves novas `caixa.criar` "Criou um caixa", `caixa.abrir` "Abriu o caixa", `caixa.sangria` "Fez uma sangria", `caixa.encerrar` "Encerrou o caixa", `caixa.confirmar_entrega` "Confirmou o dinheiro recebido"; `caixa.transferir` passa a "Transferiu dinheiro".
  - Meu Dia: sai o aviso Q110 ("caixa não conferido"). Entram `emporio_turno:<sessionId>` "Caixa N da <loja> aberto desde <dd/mm>" (turno com `opened_at` antes do início de hoje em São Paulo, para quem tem `vendedor_da_loja` na loja) e `emporio_entrega:<lojaId>` "R$ X aguardando o gerente na <loja>" (soma das entregas pendentes, para quem tem `gestor_da_loja`). Origens novas no contrato.

- [ ] **Step 1: m92, seção 3 (falhando).**
  - Abrir com contado igual ao esperado: turno aberto, `CashCount kind abertura` com diferença zero, nenhum lançamento.
  - Abrir com contado diferente sem justificativa: 422 no `justification`; com justificativa: ajuste e "Diferença de caixa".
  - Abrir com reforço de 100 e gerência com 60: `INSUFFICIENT_CASH` no `reinforcement`; com gerência 200: gerência cai 100, caixa sobe 100.
  - Duas aberturas do mesmo caixa em `Promise.all`: exatamente uma ok, a outra `SESSION_ALREADY_OPEN`.
  - Sangria de 30 com 50 no caixa: caixa 20, uma entrega pendente de 30, gerência sem mudança; sangria de 80: `INSUFFICIENT_CASH` no `amount`.
  - Encerrar com contado 120, esperado 120, malote 100: entrega pendente de 100, caixa fica 20, `open_register_id` nulo; malote 130: `MALOTE_TOO_BIG`; encerrar de novo: `SESSION_CLOSED`.
  - Loja com um usuário Caixa: o Vendedor que não abriu recebe `NOT_SESSION_OWNER`; o Gestor encerra. Loja sem Caixa: outro Vendedor encerra.
  - Confirmar entrega de 100 recebendo 100: gerência +100; recebendo 95 sem `notes`: 422; com `notes`: gerência +95, `difference = -5`, lançamento de despesa de 5; confirmar de novo: `HANDOVER_ALREADY_CONFIRMED`. O Vendedor e o Caixa recebem 403.
  - Transferência saindo da gaveta: `DRAWER_TRANSFER` no `from`; da gerência para uma conta: gerência cai, conta sobe.
  - Turno aberto ontem (ajustar `opened_at` pelo banco): `lerMeuDia` traz "aberto desde"; entrega pendente traz o aviso para o Gestor e não para o Vendedor; o aviso Q110 não existe mais.
  - Caixa da Loja 1 tentando abrir, sangrar ou encerrar caixa da Loja 2: 403; tenant B não lê turno do A pela rota (404).
  - Cada rota nova responde pelo handler chamado direto (padrão da m81), com 401 sem sessão.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar actions, rotas, Histórico, Meu Dia, contrato e `endpoints.ts`. Ajustar m82, m85 e m89 ao que mudou de propósito (transferência da gaveta, aviso Q110, conferência por caixa), sem afrouxar o que elas provam do resto.
- [ ] **Step 4:** `test:m92`, `test:m82`, `test:m85`, `test:m89`, `test:isolation`, `test:docs-api`, `tsc`, `check` verdes.
- [ ] **Step 5:** Relatar os arquivos.

### Task 4: Todo dinheiro da gaveta cai no turno

**Files:**
- Modify: `src/lib/actions/emporio-vendas.ts` (`venderAction`/`gravarVenda`, `cancelarVendaAction`, `devolverAction`/`gravarDevolucao`, `trocarAction`), `src/lib/actions/emporio-caixa.ts` (`receberFiadoAction`), `src/lib/actions/emporio-despesas.ts` (`pagarDespesasAction`), as rotas e schemas Zod correspondentes (campo opcional `cash_register_id`), `endpoints.ts`
- Create: `scripts/_emporio-turno.ts` (`abrirTurnoDeTeste(db, user, establishmentId, counted?)`, travado por `exigirBancoLocal()`)
- Modify: as suítes e cenários que vendem ou mexem na gaveta: `scripts/m81-*`, `m82-*`, `m83-*`, `m85-*`, `m86-*`, `m87-*`, `m89-*`, `m90-*`, `m91-*`, `scripts/_cenario-emporio-f3b.ts`, `_cenario-emporio-f4a.ts`, `_cenario-emporio-f4b.ts`, `_cenario-emporio-f5.ts`, `_cenario-emporio-f6b.ts`, `scripts/cenario-demonstracao-emporio.ts` (e todo outro chamador que o `grep` de `venderAction|receberFiadoAction|devolverAction|trocarAction|cancelarVendaAction|pagarDespesasAction` achar)

**Interfaces:**
- Consumes: `resolverTurno` (Task 3), `abrirTurnoAction` (Task 3).
- Produces: todo `CashMovement` com `establishment_id` passa a nascer com `cash_register_id` e `cash_session_id`; `EmporioSale.cash_session_id` sempre preenchido em venda nova. Payloads ganham `cash_register_id?: string`.

Regras, por operação (todas dentro da transação que já existe):
- **Venda:** `resolverTurno(..., "exige")` sempre; grava `cash_session_id` na venda e `cash_register_id` e `cash_session_id` no movimento de dinheiro. O PIX vai à conta como hoje, com `cash_session_id`.
- **Fiado recebido:** com parte em dinheiro, `"exige"`; só PIX, `"se_houver"`. O movimento leva o turno quando houver.
- **Cancelamento:** se a venda tem entrada em dinheiro a espelhar, `"exige"` e a saída espelho sai do turno resolvido (não necessariamente do caixa original); sem dinheiro, nada muda.
- **Devolução em dinheiro** e **diferença da troca devolvida em dinheiro:** `"exige"`.
- **Despesa paga da gaveta** (`from` = loja): `"exige"`; `INSUFFICIENT_CASH` passa a comparar com `saldoDoCaixa` do turno resolvido.

- [ ] **Step 1: m92, seção 4 (falhando).**
  - Venda sem turno aberto: `CASH_CLOSED` no `cash_register_id`, nenhuma venda nem movimento gravados.
  - Dois turnos abertos, vendedor que não abriu nenhum e sem `cash_register_id`: `CASH_REGISTER_REQUIRED`; com `cash_register_id`: cai naquele turno.
  - Venda em PIX com turno aberto: `cash_session_id` preenchido na venda, nenhum movimento na gaveta.
  - **O anti-objetivo:** num turno aberto com troco 100, venda em dinheiro 50, fiado recebido em dinheiro 30, devolução em dinheiro 10, cancelamento de uma venda em dinheiro de 20 feita no mesmo turno, troca com diferença devolvida de 5, despesa paga da gaveta de 15, sangria de 40. Encerrar com contado = 100 + 50 + 30 + 20 - 10 - 20 - 5 - 15 - 40 = 110: diferença zero, nenhum lançamento "Diferença de caixa", e todo `CashMovement` com `establishment_id` dessa loja tem `cash_session_id` desse turno.
  - Cancelar, em outro turno, uma venda em dinheiro de um turno já encerrado: a saída cai no turno aberto agora.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar as regras. Atualizar suítes e cenários para abrirem o turno antes de vender (`abrirTurnoDeTeste`), sem tirar nenhuma conferência que elas faziam. Quem tinha número de saldo esperado mantém o número: o troco de abertura entra pelo saldo inicial ou pelo contado igual ao esperado, nunca como dinheiro novo.
- [ ] **Step 4:** `test:all -- --sem-redis` inteiro verde (com as URLs locais inline). Rodar `npm run seed:demo` e o `cenario-demonstracao-emporio` no banco local e ver que terminam.
- [ ] **Step 5:** Relatar os arquivos.

### Task 5: O relatório do encerramento

**Files:**
- Create: `src/lib/actions/emporio-relatorio-turno.ts` (`lerRelatorioDoTurnoAction`), `src/app/api/v1/emporio/cash/sessions/[id]/report/route.ts` (GET), `src/app/(impressao)/emporio/imprimir/turno/[id]/page.tsx` (`?formato=a4|cupom`), `src/components/emporio/impresso/relatorio-turno-a4.tsx`, `src/components/emporio/impresso/relatorio-turno-cupom.tsx`
- Modify: `endpoints.ts`; m92 seção 5

**Interfaces:**
- Consumes: Tasks 1, 3 e 4; da entrega 1, `lerConfiguracoesAction` (largura da bobina, logo), `TamanhoDaBobina`, `BotaoImprimir`, `LogoDoPapel` e a casca `(impressao)/layout.tsx` (com os gates).
- Produces: `RelatorioTurno = { loja: { nome, documento, endereco, telefone }, caixa: string, operador: string, encerrado_por: string | null, aberto_em: string, encerrado_em: string | null, troco_inicial: number, reforco: number, vendas_por_forma: { forma: string; valor: number }[], fiado_recebido: { forma: string; valor: number }[], sangrias: { em: string; valor: number; confirmada: boolean }[], devolucoes_dinheiro: number, cancelamentos_dinheiro: number, despesas_dinheiro: number, esperado: number | null, contado: number | null, diferenca: number | null, justificativa: string | null, malote: number | null, troco_que_ficou: number | null, largura_bobina: 80 | 58 }`. Turno ainda aberto sai com os campos do encerramento nulos e a faixa "TURNO ABERTO".

- [ ] **Step 1: m92, seção 5 (falhando).** Sobre o turno do anti-objetivo da Task 4:
  - `troco_inicial` 100.
  - `vendas_por_forma` com Dinheiro 70 (a de 50 e a de 20 cancelada depois: toda venda do turno entra aqui, e o cancelamento sai na linha própria, para o esperado fechar) e mais a linha de cada outra forma, com os rótulos de `venda-rotulos`.
  - `fiado_recebido` Dinheiro 30.
  - Uma sangria de 40.
  - `devolucoes_dinheiro` 15 (10 da devolução mais 5 da troca), `cancelamentos_dinheiro` 20, `despesas_dinheiro` 15.
  - `esperado` 110, `contado` 110, `diferenca` 0, `malote` e `troco_que_ficou` iguais aos do encerramento.
  - Vendedor de outra loja: 404. Turno aberto: campos do encerramento nulos.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar a action, a rota e a página nos dois formatos, no mesmo estilo dos papéis da entrega 1 (preto sobre branco, "sem valor fiscal" não se aplica: é relatório interno; título "FECHAMENTO DE CAIXA"). O botão Imprimir é classe, nunca estilo inline com `display` (lição da entrega 1).
- [ ] **Step 4:** `test:m92`, `test:docs-api`, `tsc`, `check` verdes.
- [ ] **Step 5:** Relatar os arquivos.

### Task 6: A tela do Caixa e os caixas nas Configurações

**Files:**
- Modify: `src/app/(dashboard)/emporio/caixa/page.tsx` e `src/app/(dashboard)/emporio/_components/` (formulários novos abaixo; `conferir-gaveta-form` passa a mandar `cash_register_id`; `transferir-caixa-form` sem a gaveta, com a gerência; `saldo-inicial-form` por caixa e pela gerência)
- Create: `abrir-turno-form.tsx`, `sangria-form.tsx`, `encerrar-turno-form.tsx`, `confirmar-entrega-form.tsx` em `src/app/(dashboard)/emporio/_components/`
- Modify: `src/app/(dashboard)/emporio/configuracoes/page.tsx` (no cartão de cada loja: a lista dos caixas e o botão "Novo caixa", para quem edita a loja)

**Interfaces:**
- Consumes: as rotas da Task 3 e da Task 5.

O que a tela mostra, por loja visível: cada caixa com o saldo e o estado (fechado, ou aberto por quem, desde quando), e as ações:
- caixa fechado: Abrir (contado, justificativa quando o contado difere do esperado, reforço opcional);
- caixa aberto: Sangria, Conferir e Encerrar (contado, justificativa, malote, com o troco que fica calculado na tela);
- depois de encerrar: o link para o relatório (A4 e bobina) e o caixa volta a "fechado".

Para quem tem `gestor_da_loja`: "Com a gerência" (saldo) e "Aguardando o gerente" (entregas pendentes, com Confirmar). O Caixa vê só os caixas das lojas dele.

- [ ] **Step 1:** Implementar seguindo a receita do painel de escrita (`FormSheet`, `Field`, `useErrosDeFormulario`, `ORDEM` com o nome do campo na API, `err.doServidor(res)`), com `prefixoDeId` por caixa (um painel por linha).
- [ ] **Step 2:** `tsc`, `check` (as conferências 10, 15 e 18 em especial), `lint` verdes.
- [ ] **Step 3:** Relatar os arquivos. A prova viva é da Task 8.

### Task 7: O balcão abre o caixa, e as outras telas escolhem o caixa

**Files:**
- Modify: o balcão (`src/app/(dashboard)/emporio/vender/**`), os painéis de cancelar, devolver e trocar, o recebimento de fiado e o pagamento de despesa em `src/app/(dashboard)/emporio/`

**Interfaces:**
- Consumes: `GET /cash/registers` (estado dos caixas), `POST /cash/sessions` (abrir), o `cash_register_id` opcional dos payloads (Task 4) e as recusas `CASH_CLOSED` e `CASH_REGISTER_REQUIRED`.

Regras de tela:
- **Balcão:** ao finalizar, se a loja escolhida não tem caixa aberto, a tela pede o troco inicial (contado) e abre o caixa ali mesmo, sem sair do balcão, e segue com a venda. Com um caixa só na loja, ele vem escolhido; com vários fechados, escolhe-se qual abrir. Com mais de um aberto e nenhum do usuário, o balcão mostra a escolha do caixa antes de finalizar. A recusa `CASH_CLOSED` ou `CASH_REGISTER_REQUIRED` vinda do servidor reabre essa escolha (nunca fica só o rodapé).
- **Cancelar, devolver, trocar, receber fiado e pagar despesa:** quando a operação vai mexer em dinheiro e a loja tem mais de um caixa aberto, aparece o campo "Caixa"; com nenhum aberto, a tela diz para abrir o caixa e leva à tela do Caixa.

- [ ] **Step 1:** Implementar, no kit e na receita do painel de escrita.
- [ ] **Step 2:** `tsc`, `check`, `lint` verdes.
- [ ] **Step 3:** Relatar os arquivos.

### Task 8: Roteiro do navegador, spec e handoff

**Files:**
- Create: `scripts/_cenario-emporio-turno.ts` (a partir do f6b: duas lojas, Loja 1 com um usuário Caixa e um Vendedor, Loja 2 sem Caixa, o produto da F6b com preço), `scripts/navegador/emporio-turno.py`
- Modify: `docs/specs/module-39-meu-emporio.md` (Q150 em diante: as decisões desta entrega, inclusive as do controlador na tabela de valores, e as revisões de Q35, Q92, Q93, Q110 e do desvio "a gaveta é a loja" da F3a), `docs/agents/current-handoff.md`

O roteiro, passo a passo:
1. O Caixa entra: o menu tem só Início, Vender, Vendas, Fiado e Caixa; Estoque pela URL volta ao `/emporio`.
2. No balcão, com o caixa fechado: finalizar pede o troco, abre o caixa e registra a venda em dinheiro.
3. Na tela do Caixa: sangria de um valor, conferência sem diferença, encerramento com malote; o caixa volta a fechado.
4. O relatório do encerramento abre em A4 e na bobina; o PDF da bobina (`Page.printToPDF` com `preferCSSPageSize`) tem uma página só com a largura configurada, e nada sobra acima do papel na mídia de impressão.
5. O Gestor entra: o Meu Dia mostra o dinheiro aguardando o gerente; confirma a sangria com o valor certo e o malote com diferença e observação; "Com a gerência" mostra a soma.
6. Na Loja 2 (sem Caixa), o Vendedor abre e outro Vendedor encerra.
7. Celular (390 px): a tela do Caixa sem rolagem horizontal.

- [ ] **Step 1:** Escrever o cenário e o roteiro.
- [ ] **Step 2:** Com o `next dev` reiniciado (client do Prisma novo), rodar e ver verde.
- [ ] **Step 3:** Desfazer de propósito uma regra que o roteiro guarda (por exemplo, a venda deixar de abrir o caixa no balcão) e ver o roteiro reprovar; restaurar.
- [ ] **Step 4:** Spec e handoff; `check` verde.
- [ ] **Step 5:** Relatar os arquivos.
