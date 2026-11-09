# Empório, taxas de cartão, entrega 1: adquirente, bandeira, parcelas e vigência. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a taxa de cartão do Empório deixa de ser uma por loja e forma e passa a ser uma tabela por adquirente, bandeira, modalidade e faixa de parcelas, com vigência; a venda congela a linha usada e registra adquirente e bandeira; a tela vai para Configurações.

**Architecture:** `CardFeeRule` dá lugar a `CardAcquirer` (cadastro da conta) e `CardFeeRate` (linhas com vigência e faixa). Uma função pura `resolverTaxa` em `src/lib/emporio/cartao.ts` escolhe a linha (bandeira exata vence `qualquer`, faixa mais estreita vence) e é usada pelo servidor (`prepararVenda`) e pelo balcão (prévia). O pagamento de cartão grava `acquirer_id`, `brand`, `fee_fixed_amount` e `fee_rate_id`; o recebível copia adquirente e bandeira. As actions antigas de regra viram wrappers sobre a tabela nova, para os doze scripts que as chamam não quebrarem; os onze que escrevem `cardFeeRule` direto passam a usar um helper de cenário.

**Tech Stack:** Next.js 16, Prisma 7, Zod 4, suítes `tsx` no Docker, roteiro Python no Chrome de testes.

**Spec:** `docs/superpowers/specs/2026-11-09-emporio-taxas-de-cartao-design.md` (Q250 a Q258 mais as oito decisões do construtor; a tabela do módulo em `docs/specs/module-39-meu-emporio.md`).

## Global Constraints

- Invariantes do `CLAUDE.md`: `tenant_id` nunca do client; model novo com `tenant_id` entra em `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts`); nenhum saldo gravado; action, rota, tela; `FinancialEntry` só por `createLinkedEntry`; toda action de escrita do Empório chama `registrarNoHistorico`; sem travessão; sem heredoc com escape.
- Migração só no Docker (URL inline `postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public`); remover os dois `DROP INDEX` parciais do SQL gerado. **A migração carrega os dados** (`CardFeeRule` para `CardFeeRate` com a adquirente "Maquininha") antes de derrubar a tabela antiga.
- Enum `CardBrand`: `visa_master`, `elo`, `hipercard`, `amex`, `outra`, `qualquer`. Na venda, `qualquer` é recusado.
- Resolução (Q252 e decisão 2): linhas da loja, adquirente e modalidade vigentes em `sold_at` (`valid_from <= dia(sold_at)` e (`valid_to` nulo ou `>= dia(sold_at)`)) cuja faixa contém `installments` (1 no débito e no crédito à vista); entre elas, bandeira exata vence `qualquer`; depois a faixa mais estreita (`to - from` menor); empate restante: a de `valid_from` mais recente.
- Fallbacks na action (decisão 9, registrada neste plano e levada à spec): `brand` ausente resolve só entre linhas `qualquer`; `acquirer_id` ausente usa a única adquirente com linha vigente na loja; se houver mais de uma, recusa `VALIDATION_ERROR` campo `acquirer_id` "Escolha a adquirente"; sem linha, recusa `VALIDATION_ERROR` campo `payments` com a combinação ("Sem taxa de crédito parcelado em 5x para Elo na Stone: cadastre em Configurações").
- `fee_amount = round(valor × fee_pct / 100) + fee_fixed` (centavos), uma vez por pagamento; a divisão em parcelas segue `dividirEmParcelas` (resto na 1ª).
- Sobreposição (decisão 3): mesma loja, adquirente, modalidade e bandeira exata; faixas que se cruzam e vigências que se cruzam ao mesmo tempo: `VALIDATION_ERROR` 409 campo `valid_from`.
- Linhas migradas: `valid_from` 2020-01-01, `valid_to` nulo, bandeira `qualquer`, faixa 1 a 1 (débito e crédito à vista) ou 2 a 12 (parcelado).
- Dinheiro em formato brasileiro; recusa por campo no campo (`error=` no `<Field>`); nenhuma cor crua; nenhum `<input type="number">`.
- Subagente não commita; não recebe autorização de merge, push na `main`, deploy nem Neon. Modelos: Sonnet implementa e revisa; sem juiz Opus.

## Review Focus

1. **Venda em 3x com linha Elo 2 a 12 e linha `qualquer` 3 a 3:** Elo em 3x usa a linha Elo (bandeira vence faixa). Teste na Task 2 (`resolverTaxa`) e na Task 3 (venda).
2. **Troca de taxa no meio do mês com venda retroativa:** venda datada de ontem usa a linha vigente ontem, não a de hoje. Teste na Task 3.
3. **Editar uma venda antiga em cartão feita antes desta entrega** (pagamento sem adquirente e bandeira): a edição resolve na tabela com a linha migrada ("desde sempre") e grava adquirente "Maquininha" e bandeira; não recusa. Teste na Task 3.
4. **Remover ou editar linha já usada por uma venda:** recusa 409 `RATE_IN_USE`; "Nova vigência" é o caminho. Teste na Task 2.
5. **Loja com duas adquirentes e API sem `acquirer_id`:** recusa pedindo a adquirente, em vez de escolher uma em silêncio. Teste na Task 3.

---

### Task 1: Schema, migração com carga, constantes e `resolverTaxa`

**Files:**
- Modify: `prisma/schema.prisma` (`CardFeeRule` l.1467-1488 sai; `CardKind` l.327; `EmporioSalePayment` l.1440-1466; `CardReceivable` l.1493-1520; relações em `Tenant`, `Establishment`, `BankAccount`)
- Create: `prisma/migrations/20261109180000_emporio_adquirente_e_taxas_de_cartao/migration.sql`
- Modify: `src/lib/prisma.ts:70` (`TENANT_SCOPED_MODELS`: `CardAcquirer`, `CardFeeRate`; tirar `CardFeeRule`)
- Modify: `src/lib/emporio/cartao.ts` (constantes, tipos e `resolverTaxa`)
- Test: `scripts/m103-emporio-taxas-cartao.test.ts` seção 1 (unitária de `resolverTaxa`, sem banco)

**Interfaces:**
- Produces (schema):
  ```prisma
  enum CardBrand { visa_master elo hipercard amex outra qualquer }
  /// Q250: adquirente da conta (Stone, Cielo...). Parâmetros de comportamento entram nas entregas 2 e 3.
  model CardAcquirer { id, tenant_id, name String, archived_at DateTime?, updated_by_user_id String?, created_at, updated_at; fee_rates CardFeeRate[]; sale_payments EmporioSalePayment[]; receivables CardReceivable[]; @@unique([tenant_id, name]) @@index([tenant_id]) }
  /// Q252: linha da tabela de taxas, com faixa de parcelas e vigência.
  model CardFeeRate { id, tenant_id, establishment_id, acquirer_id, brand CardBrand, kind CardKind, installments_from Int, installments_to Int, fee_pct Decimal @db.Decimal(5,2), fee_fixed Decimal @default(0) @db.Decimal(14,2), days Int, bank_account_id, valid_from DateTime @db.Date, valid_to DateTime? @db.Date, updated_by_user_id String?, created_at, updated_at; relações tenant/establishment (Cascade)/acquirer (Restrict)/bank_account (Restrict); sale_payments EmporioSalePayment[]; @@index([tenant_id, establishment_id, acquirer_id, kind]) }
  ```
  `EmporioSalePayment` ganha `acquirer_id String?`, `brand CardBrand?`, `fee_fixed_amount Decimal? @db.Decimal(14,2)`, `fee_rate_id String?` (relações `acquirer` e `fee_rate`, `onDelete: Restrict`). `CardReceivable` ganha `acquirer_id String?` e `brand CardBrand?` (relação `acquirer`, Restrict).
- Produces (SQL, na ordem): enum; `CardAcquirer`; `CardFeeRate`; colunas novas; **carga:** um `INSERT INTO "CardAcquirer"` por `tenant_id` distinto em `CardFeeRule` com `name = 'Maquininha'`; um `INSERT INTO "CardFeeRate"` por linha de `CardFeeRule` (`brand = 'qualquer'`, `installments_from/to` = 1/1 ou 2/12 conforme `kind`, `valid_from = DATE '2020-01-01'`, `valid_to = NULL`, `fee_fixed = 0`, demais colunas copiadas, `id` por `gen_random_uuid()::text` ou `md5(...)`); depois `DROP TABLE "CardFeeRule"`. Os ids de `CardAcquirer` e `CardFeeRate` são gerados no SQL (o `cuid()` é do client, não do banco).
- Produces (`src/lib/emporio/cartao.ts`):
  ```ts
  export const BANDEIRAS = ["visa_master", "elo", "hipercard", "amex", "outra"] as const;   // as da venda
  export type Bandeira = (typeof BANDEIRAS)[number];
  export const ROTULO_DA_BANDEIRA: Record<Bandeira | "qualquer", string> = { visa_master: "Visa/Master", elo: "Elo", hipercard: "Hipercard", amex: "Amex", outra: "Outra", qualquer: "Qualquer bandeira" };
  export const VIGENCIA_DESDE_SEMPRE = "2020-01-01";
  export type LinhaDeTaxa = { id: string; acquirer_id: string; brand: Bandeira | "qualquer"; kind: "debito" | "credito_vista" | "credito_parcelado"; installments_from: number; installments_to: number; fee_pct: number; fee_fixed: number; days: number; bank_account_id: string; valid_from: string; valid_to: string | null };
  /** Decisão 2 e Q252. `dia` é AAAA-MM-DD em Brasília. Devolve null sem linha. Não consulta banco: recebe as linhas da loja. */
  export function resolverTaxa(linhas: LinhaDeTaxa[], q: { acquirer_id: string; brand: Bandeira; kind: LinhaDeTaxa["kind"]; installments: number; dia: string }): LinhaDeTaxa | null;
  /** Os ids das adquirentes com alguma linha vigente em `dia` (para o fallback e para o balcão). */
  export function adquirentesComTaxa(linhas: LinhaDeTaxa[], dia: string): string[];
  export function taxaDoPagamentoCent(valorCent: number, linha: Pick<LinhaDeTaxa, "fee_pct" | "fee_fixed">): number;  // round(valor*pct/100) + centavos(fee_fixed)
  ```
  `liquidoDoCartaoCent` do balcão (`venda-estado.ts:71`) passa a chamar `taxaDoPagamentoCent` (Task 5).

- [ ] **Step 1: Escrever a seção 1 da m103** (unitária, sem banco; `exigirBancoLocal` fica para as seções com banco): com cinco linhas (Elo 2-12 a 3,5%; `qualquer` 3-3 a 2,9%; `qualquer` 2-12 a 4%; `visa_master` 1-1 crédito à vista a 2,5% com `valid_to` ontem; `visa_master` 1-1 crédito à vista a 2,7% desde hoje): Elo 3x hoje → a linha Elo (bandeira vence faixa); Visa/Master 3x → `qualquer` 3-3 (faixa estreita vence); Visa/Master 5x → `qualquer` 2-12; Visa/Master crédito à vista ontem → 2,5%, hoje → 2,7%; Hipercard 7x → `qualquer` 2-12; outra adquirente → null; `taxaDoPagamentoCent(10000, {fee_pct: 2.5, fee_fixed: 0.3})` → 280; `adquirentesComTaxa` com uma adquirente sem linha vigente não a lista.
- [ ] **Step 2: Rodar** `npx tsx scripts/m103-emporio-taxas-cartao.test.ts` (seção 1): FALHA (função ausente).
- [ ] **Step 3: Schema, migração com carga, `TENANT_SCOPED_MODELS`, `cartao.ts`.** Aplicar no Docker (antes, criar duas `CardFeeRule` de teste no banco local para ver a carga acontecer e conferir no `psql`/Prisma Studio que viraram linhas da "Maquininha"), `npx prisma generate`.
- [ ] **Step 4: Verificar** `migrate diff` vazio (fora os dois índices), `tsc` (vai acusar `cardFeeRule` nos usos antigos: é esperado até as Tasks 2 a 4; liste-os no relatório), seção 1 da m103 verde, `test:isolation` verde.
- [ ] **Step 5: Commit** (sessão principal): "Empório: adquirente e tabela de taxas de cartão com vigência (schema, migração com carga da regra antiga, resolverTaxa)".

---

### Task 2: Actions e rotas de adquirente e de taxa; wrappers de compatibilidade

**Files:**
- Create: `src/lib/actions/emporio-cartoes.ts`
- Create: `src/app/api/v1/emporio/card-acquirers/route.ts`, `card-acquirers/[id]/route.ts`, `card-fee-rates/route.ts`, `card-fee-rates/[id]/route.ts`, `card-fee-rates/[id]/renew/route.ts`
- Delete: `src/app/api/v1/emporio/card-fee-rules/route.ts` e `[id]/route.ts`
- Modify: `src/lib/actions/emporio-caixa.ts` l.1328-1445 (`listarRegrasCartaoAction`, `definirRegraCartaoAction`, `removerRegraCartaoAction` viram wrappers, marcados `@deprecated`, sobre `emporio-cartoes.ts`)
- Modify: `src/lib/actions/emporio-primeiros-passos.ts:87` (lê `cardFeeRate` vigente da loja)
- Modify: `src/app/(public)/docs/api/endpoints.ts` (tirar `card-fee-rules`, entrar as cinco rotas)
- Test: `scripts/m103-emporio-taxas-cartao.test.ts` seções 2 (adquirente), 3 (taxas e sobreposição), 4 (wrappers)

**Interfaces:**
- Produces (`emporio-cartoes.ts`):
  - `AdquirenteView = { id, name, archived_at: string | null, rates_count: number }`.
  - `listarAdquirentesAction(db, ator, opts?: { incluir_arquivadas?: boolean })`: qualquer papel do Empório lê.
  - `criarAdquirenteAction(db, ator, { name })`, `editarAdquirenteAction(db, ator, id, { name })`, `arquivarAdquirenteAction(db, ator, id)` e `reativarAdquirenteAction`: papel `dono` ou `gerente_geral` (`exigirUma(db, ator, ["conta"], ...)` ou o equivalente que `papel.ts` oferece para "é da conta"; leia `exigir`/`pode`); nome duplicado (sem caixa) → `VALIDATION_ERROR` 409 campo `name`; arquivar com linha vigente → `VALIDATION_ERROR` 409 "Encerre as taxas desta adquirente antes de arquivar".
  - `TaxaView = LinhaDeTaxa & { establishment_id, acquirer_name, bank_account_name, in_use: boolean, updated_by_name }`.
  - `listarTaxasAction(db, ator, { establishment_id?, acquirer_id?, vigentes_em?: Date, incluir_encerradas?: boolean })`: `lojaVisivel`; sem `establishment_id`, todas as lojas visíveis.
  - `CriarTaxaInput = { establishment_id, acquirer_id, brand: Bandeira | "qualquer", kind, installments_from, installments_to, fee_pct, fee_fixed?, days, bank_account_id, valid_from: Date, valid_to?: Date | null }`; `criarTaxaAction(db, ator, input)`: `gestor_da_loja`; validações: faixa 1-1 fora do parcelado, 2 a 12 no parcelado, `from <= to`, pct 0 a 100, fixed >= 0, days 0 a 120, conta ativa, adquirente ativa, `valid_to >= valid_from`; sobreposição (Global Constraints) → 409 `valid_from`.
  - `novaVigenciaAction(db, ator, id, { valid_from: Date; ...campos opcionais que mudam })`: encerra a linha `id` em `valid_from - 1 dia` (se `valid_from <= valid_from` da antiga: 422), cria a nova copiando o resto; se a antiga já tinha `valid_to` anterior, 422. Transação única.
  - `editarTaxaAction(db, ator, id, input parcial)` e `removerTaxaAction(db, ator, id)`: recusam `RATE_IN_USE` 409 quando existe `EmporioSalePayment.fee_rate_id = id`; `removerTaxaAction` numa linha usada vira "encerrar hoje" só se o chamador passar `{ encerrar: true }` (campo `valid_to` = ontem).
  - Todas as de escrita: `registrarNoHistorico` (`cartao.adquirente.criar|editar|arquivar`, `cartao.taxa.criar|renovar|editar|remover`).
  - Wrappers em `emporio-caixa.ts`: `definirRegraCartaoAction(db, ator, { establishment_id, kind, fee_pct, days, bank_account_id })` acha ou cria a adquirente "Maquininha" da conta, e cria ou **edita no lugar** a linha `qualquer` da faixa padrão vigente (`valid_from` desde sempre), ou cria se não há; `listarRegrasCartaoAction` devolve as linhas `qualquer` da faixa padrão no formato antigo (`RegraCartaoView` com `kind`, `fee_pct`, `days`, `bank_account_id`); `removerRegraCartaoAction` remove a linha se não usada, senão encerra. Comentário `@deprecated`: "usada pelos cenários e suítes antigos; tela e rota usam emporio-cartoes.ts".
- Rotas: guard do Empório como `card-fee-rules` tinha; Zod com `apiErroDeZod`; `GET /card-acquirers`, `POST /card-acquirers`, `PATCH /card-acquirers/:id` (`name`, `archived: boolean`), `GET /card-fee-rates` (query `establishment_id`, `acquirer_id`, `vigentes_em`, `incluir_encerradas`), `POST /card-fee-rates`, `PATCH /card-fee-rates/:id`, `DELETE /card-fee-rates/:id` (`?encerrar=1`), `POST /card-fee-rates/:id/renew`.

- [ ] **Step 1: Escrever as seções 2, 3 e 4 da m103** (com banco, dois tenants): criar adquirente "Stone", duplicada → 409 `name`; criar linhas (Visa/Master crédito parcelado 2-6 a 3,5% e 7-12 a 4,2%; sobreposição 3-8 → 409 `valid_from`; mesma faixa com bandeira Elo → ok, não é sobreposição); `novaVigenciaAction` a partir do dia 1 do mês que vem: a antiga ganha `valid_to` = último dia deste mês e a nova nasce; `editarTaxaAction` em linha usada (depois de uma venda na Task 3; aqui, simular setando `fee_rate_id` num pagamento criado direto no banco) → `RATE_IN_USE`; arquivar adquirente com linha vigente → 409; `listarTaxasAction` do tenant B não vê as de A; wrappers: `definirRegraCartaoAction` numa loja sem nada cria "Maquininha" e a linha `qualquer` 2-12 e `listarRegrasCartaoAction` a devolve no formato antigo; chamar de novo com outro pct edita no lugar (uma linha só).
- [ ] **Step 2: Rodar** `DATABASE_URL=... npm run test:m103`: as seções 2 a 4 FALHAM (módulo ausente).
- [ ] **Step 3: Implementar** actions, wrappers, primeiros passos, rotas, `/docs/api`.
- [ ] **Step 4: Rodar** `test:m103` (1 a 4 verdes), `test:m82` (usa o wrapper e a rota antiga: a rota antiga saiu, então a m82 é ajustada na Task 4; aqui só o wrapper), `test:docs-api`, `test:isolation`, `tsc`, `lint`.
- [ ] **Step 5: Commit** (sessão principal): "Empório: adquirentes e taxas de cartão com vigência (actions, rotas, wrappers da regra antiga)".

---

### Task 3: A venda congela adquirente, bandeira e linha; leitura e recibo

**Files:**
- Modify: `src/lib/actions/emporio-vendas.ts` (`VendaPagamentoInput` l.452-461; `PagamentoPreparado.cartao` l.506-513; `prepararVenda` bloco do cartão ~l.820-870; `gravarVenda` cartão ~l.1180-1260; `VendaPagamentoView` l.142-152 e `montarVendas`)
- Modify: `src/lib/emporio/venda-schema.ts:24-39` (`pagamentoDeVendaSchema`: `acquirer_id: z.string().nullish()`, `brand: z.enum(BANDEIRAS).nullish()`)
- Modify: `src/lib/actions/emporio-impressao.ts` (pagamento do recibo com bandeira e adquirente)
- Modify: `src/lib/actions/emporio-financeiro.ts` e `emporio-caixa.ts` onde listam `cardReceivable` para "a receber do cartão" e extrato (acrescentar `acquirer_name` e `brand` na view)
- Modify: `src/app/(public)/docs/api/endpoints.ts` (POST `/sales` e `/replace`: campos do pagamento; GET: campos da view)
- Test: `scripts/m103-emporio-taxas-cartao.test.ts` seções 5 (venda) e 6 (edição e retroativa)

**Interfaces:**
- Consumes: `resolverTaxa`, `adquirentesComTaxa`, `taxaDoPagamentoCent`, `BANDEIRAS` (Task 1); `listarTaxasAction` ou leitura direta de `cardFeeRate` da loja (Task 2).
- Produces: `VendaPagamentoInput` ganha `acquirer_id?: string | null; brand?: Bandeira | null`; `prepararVenda` carrega uma vez as linhas vigentes da loja em `sold_at` e, por pagamento de cartão, aplica os fallbacks das Global Constraints e `resolverTaxa`; `PagamentoPreparado.cartao` ganha `acquirer_id`, `brand`, `fee_fixed_amount`, `fee_rate_id`; `gravarVenda` grava os quatro em `EmporioSalePayment` e `acquirer_id`/`brand` em cada `CardReceivable`; `VendaPagamentoView` ganha `acquirer_id`, `acquirer_name`, `brand`, `fee_fixed_amount`, `fee_rate_id` (nulos nas vendas antigas); `ImpressoVenda.pagamentos[]` ganha `bandeira` e `adquirente` (rótulos); views de a receber do cartão ganham `acquirer_name` e `brand`.

- [ ] **Step 1: Escrever as seções 5 e 6 da m103:** loja com Stone (Visa/Master parcelado 2-6 a 3,5%, 7-12 a 4,2%; Elo 2-12 a 4,5%; débito `qualquer` 1-1 a 1,5% com `fee_fixed` 0,10; crédito à vista Visa/Master 2,5%): venda 300 em 3x Visa/Master → `fee_pct 3.5`, `fee_amount 10.5`, 3 recebíveis com `brand visa_master` e `acquirer_id` Stone, líquidos 96,50 + 96,50 + 96,50 (confira a divisão pela regra atual); venda 300 em 3x Elo → 4,5%; débito 100 → `fee_amount 1.6` (1,5% + 0,10); venda 7x Visa/Master → 4,2%; venda 3x sem `brand` → recusa `VALIDATION_ERROR` campo `payments` com "informe a bandeira" (não há linha `qualquer` para parcelado nesta loja); venda com `brand: "qualquer"` → recusa campo `payments`; loja com duas adquirentes com linha vigente e pagamento sem `acquirer_id` → recusa campo `acquirer_id`; venda sem `acquirer_id` em loja com uma só → ok e `acquirer_id` preenchido; `lerVendaAction` traz os campos; `lerImpressoDaVendaAction` traz "Visa/Master" e "Stone"; cancelar cancela os recebíveis como antes.
  Seção 6: linha Visa/Master 3x muda hoje por `novaVigenciaAction` (3,5% → 3,9% desde hoje): venda datada de ontem → 3,5%, de hoje → 3,9%; venda antiga gravada direto com pagamento sem adquirente (simule a venda pré-entrega: crie pela action e depois anule `acquirer_id`/`brand`/`fee_rate_id` no banco) editada por `editarVendaAction` com `brand` informado → ok, a nova tem `acquirer_id` e `brand`; `editarTaxaAction` na linha usada pela venda → `RATE_IN_USE`.
- [ ] **Step 2: Rodar** `test:m103`: 5 e 6 FALHAM.
- [ ] **Step 3: Implementar** na ordem: schema Zod; `prepararVenda`; `gravarVenda`; views; impressão; a receber; `/docs/api`.
- [ ] **Step 4: Rodar** `test:m103` (1 a 6 verdes), `test:m81`, `test:m82` (ainda com a regra antiga via wrapper: a Task 4 a atualiza; se a m82 falhar só pela rota removida, anote), `test:m97`, `test:m98`, `test:m102`, `test:docs-api`, `tsc`, `lint`.
- [ ] **Step 5: Commit** (sessão principal): "Empório: a venda no cartão congela adquirente, bandeira, taxa fixa e a linha usada (Q254); recibo e a receber mostram adquirente e bandeira".

---

### Task 4: Suíte m103 da spec (onda 1) e os scripts antigos (onda 2)

**Files:**
- Create: `scripts/m103-emporio-taxas-cartao.test.ts` (as oito seções: 1 `resolverTaxa`, 2 adquirente, 3 taxas, 4 wrappers, 5 venda, 6 edição e vigência, 7 isolamento, 8 impressão; `package.json` `"test:m103"`)
- Create: `scripts/_cartao-cenario.ts` com `taxaPadraoDeCenario(prisma, { tenant_id, establishment_id, kind, fee_pct, days, bank_account_id, user_id })`: acha ou cria a adquirente "Maquininha" do tenant e grava a linha `qualquer` da faixa padrão com `valid_from` desde sempre, em `cardFeeRate` (substitui `prisma.cardFeeRule.create/upsert` nos cenários)
- Modify (batch, troca mecânica de `prisma.cardFeeRule.*` pelo helper ou pela action): `scripts/_cenario-emporio-f3b.ts`, `_cenario-emporio-f4a.ts`, `_cenario-emporio-financeiro-acordo.ts`, `_cenario-emporio-financeiro-casa.ts`, `_cenario-emporio-financeiro-credito.ts`, `_cenario-emporio-financeiro-projecao.ts`, `cenario-demonstracao-emporio.ts`, `m82-emporio-f3b.test.ts` (23 usos; os da rota `card-fee-rules` passam para `card-fee-rates` com o corpo novo), `m83-emporio-f4a.test.ts`, `m84-emporio-f4b.test.ts`, `m85-emporio-f5.test.ts`
- Modify: limpezas dos cenários que apagam `cardFeeRule` passam a apagar `cardFeeRate` e `cardAcquirer` do tenant/loja

**Interfaces:**
- Consumes: Tasks 1 e 2 (schema e actions). A parte "suíte da spec" (seções 1 a 8) é escrita na onda 1 só dos briefs das Tasks 1 a 3; a parte "scripts antigos" roda na onda 2, depois da Task 1.

- [ ] **Step 1 (onda 1): Escrever a m103** com as asserções das Tasks 1, 2 e 3 (copiadas), módulos por `import()` com especificador em variável; registrar o script; rodar contra o HEAD: compila e falha por ausência.
- [ ] **Step 2 (onda 2): O helper e a troca nos onze scripts.** Rodar `test:m82`, `test:m83`, `test:m84`, `test:m85`, `test:m98`, `test:m99`, `test:m100`, `test:m101` (URLs inline): verdes. `npm run check` (suíte em disco com entrada no `package.json`).
- [ ] **Step 3: Commits** (sessão principal): a suíte com a Task 1; os scripts: "Cenários e suítes do Empório passam a escrever a tabela de taxas nova pelo helper de cenário".

---

### Task 5: Telas: Configurações (adquirentes e taxas), Caixa sem as taxas, balcão com adquirente e bandeira, detalhe e recibo

**Files:**
- Create: `src/app/(dashboard)/emporio/configuracoes/_components/cartoes-secao.tsx` (seção "Cartões: adquirentes e taxas"), `adquirente-form.tsx`, `taxa-cartao-form.tsx` (criar e "Nova vigência"), `taxas-cartao-lista.tsx` (por adquirente e loja, vigentes e encerradas, "em uso")
- Modify: `src/app/(dashboard)/emporio/configuracoes/page.tsx` (nova seção depois de "Alçada de pagamento", l.180-200)
- Modify: `src/app/(dashboard)/emporio/caixa/page.tsx` l.29-30 e l.470-520 (sai o bloco de regras; entra uma linha "As taxas de cartão ficam em Configurações" com link); Delete: `_components/regra-cartao-form.tsx`, `regra-cartao-remover.tsx`
- Modify: `src/app/(dashboard)/emporio/_components/venda-estado.ts` (l.71 `liquidoDoCartaoCent` passa a usar `resolverTaxa` e `taxaDoPagamentoCent` sobre as linhas vigentes da loja carregadas por `GET /card-fee-rates?establishment_id=&vigentes_em=`; pagamento de cartão ganha `acquirer_id` e `brand`; `montar()` os manda), `venda-campos.tsx` (por pagamento de cartão: seletor de adquirente quando há mais de uma, botões de bandeira, prévia "taxa X%, líquido R$ Y, 1ª parcela em DD/MM"), `balcao.tsx` (carrega as linhas em vez de `card-fee-rules`)
- Modify: `src/app/(dashboard)/emporio/vendas/[id]/page.tsx` (pagamento com bandeira e adquirente), `src/components/emporio/impresso/papel-a4.tsx` e `papel-cupom.tsx` (bandeira e adquirente na linha do pagamento), a tela do a receber do cartão em `/emporio/financeiro` (coluna bandeira e adquirente)
- Modify: `src/app/(dashboard)/emporio/_components/primeiros-passos*.tsx` se o texto do passo citar "regra de cartão no Caixa" (passa a apontar Configurações)

**Interfaces:**
- Consumes: rotas da Task 2; `VendaPagamentoView` da Task 3; `resolverTaxa`, `BANDEIRAS`, `ROTULO_DA_BANDEIRA` (Task 1, importáveis no cliente: `cartao.ts` não importa nada de servidor; se importar `dia-calendario`, confira que é puro).
- Produces: `CorpoDaVenda.payments[]` com `acquirer_id` e `brand`; sem adquirente com linha vigente na loja, o botão de cartão mostra "Cadastre a taxa em Configurações" e não envia.

- [ ] **Step 1: Implementar** Configurações, Caixa, balcão, detalhe, impressos, financeiro.
- [ ] **Step 2: Verificar** `tsc`, `lint`, `npm run check` (trava 15: `error=` em cada campo do `ORDEM` dos formulários novos; trava 7; cores).
- [ ] **Step 3: Commit** (sessão principal): "Empório: adquirentes e taxas de cartão em Configurações, bandeira e adquirente no balcão, no detalhe e no recibo (Q255, Q258)".

---

### Task 6: Roteiro de navegador, manual, docs e handoff

**Files:**
- Create: `scripts/_cenario-emporio-cartoes.ts` (loja, produto, conta bancária, adquirente Stone com linhas Visa/Master 2-6 e 7-12, Elo 2-12, débito `qualquer`; uma segunda adquirente arquivável; sessão do owner), `scripts/navegador/emporio-cartoes.py` (Configurações: criar adquirente, criar taxa, sobreposição recusada no campo, nova vigência; Caixa sem o bloco de taxas; balcão: venda 3x Elo com prévia 4,5% e recibo com "Elo" e "Stone"; detalhe; a receber do cartão com bandeira; sabotagem: `resolverTaxa` ignorando a bandeira faz o roteiro reprovar)
- Modify: `src/app/(dashboard)/manual/_conteudo/partes-tarefa-2.tsx` (venda no cartão: adquirente e bandeira) e a parte de Configurações/Caixa que fala da taxa (grep "taxa de cartão" em `_conteudo/`)
- Modify: `docs/agents/dividas.md` (2.25 parcialmente fechada: taxa por parcelas sai; antecipação fica; 2.28 destravada: adquirente é Stone; nova 2.56: taxa por parcela no recebível e dia útil, entrega 2; 2.57: antecipação, entrega 3; 2.58: extrato Stone, entrega 4), `docs/agents/financeiro-emporio-relatorio.md`, `docs/agents/current-handoff.md` (sessão principal)

- [ ] **Step 1: Cenário e roteiro** verdes no `next dev` do clone; sabotagem reprova; desfazer.
- [ ] **Step 2: Manual, dívidas, relatório.**
- [ ] **Step 3: Gates finais** (sessão principal): `check`, `tsc`, `lint`, `build`, `test:isolation`, `test:m103`, `test:all -- --sem-redis`, `migrate diff` vazio; handoff.
- [ ] **Step 4: Commit** (sessão principal).

---

## Ondas

| onda | tarefas | agentes (Sonnet) | depende de |
|---|---|---|---|
| 1 | Task 1 (schema, migração, `resolverTaxa`), Task 4 parte 1 (suíte da spec) | `servidor-acao` (faz o papel do `servidor-dados`), `prova-suite` | nada |
| 2 | Task 2 (actions, rotas, wrappers), Task 4 parte 2 (scripts antigos) | `servidor-acao`, `general-purpose` | 1 |
| 3 | Task 3 (venda), Task 5 parte 1 (Configurações e Caixa) | `servidor-acao`, `tela-pagina` | 2 |
| 4 | Task 5 parte 2 (balcão, detalhe, recibo, financeiro), Task 6 | `tela-pagina`, `general-purpose` (papel do `prova-viva`) | 3 |

Revisão: um revisor Sonnet por onda (ondas 2 e 3 juntas, se o tempo apertar) e um na branch inteira. A sessão principal commita uma tarefa por vez.
