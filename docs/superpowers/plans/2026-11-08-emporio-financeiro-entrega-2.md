# Financeiro do Empório, entrega 2: crédito e cobrança do fiado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o fiado passa a ter vencimento sempre, limite por cliente e por conta, bloqueio automático por atraso ou por limite, liberação pontual do Gestor para uma venda, ficha de crédito do cliente e a lista de cobrança com o botão do WhatsApp.

**Architecture:** a regra de crédito vive em `src/lib/actions/emporio-credito.ts` (estado de crédito do cliente, limite e prazo, liberação, cobrança) e em funções puras de `src/lib/emporio/fiado.ts` (vencimento efetivo, dia fixo do mês, dias de atraso, mensagem de cobrança). `venderAction` consulta esse estado antes de gravar uma venda com fiado. O vencimento do fiado antigo é regra de leitura dentro de `entradasAbertas`, nunca `UPDATE`. A casa do financeiro ganha a aba Cobrança; a ficha do cliente ganha a seção de crédito; Configurações ganha a seção Fiado.

**Tech Stack:** Next.js 16, Prisma 7 (Postgres), Zod 4, kit de UI próprio (`FormSheet`, `Field`, `MoneyInput`, `useErrosDeFormulario`), suíte `tsx` em `scripts/`, roteiro de navegador em Python (`scripts/navegador/_lib.py`).

**Spec:** `docs/superpowers/specs/2026-11-07-emporio-financeiro-design.md`, seção "Entrega 2: crédito e cobrança" (Q219, Q223, Q224, Q225), mais "Como entregar" (casos da entrega 2) e "O que fica com o builder". A entrega 1 está na branch `emporio-financeiro-1`; esta entrega nasce em `emporio-financeiro-2`, sobre ela.

## Global Constraints

- Sem travessão (U+2014) em código, doc, commit ou texto de tela. O hook de escrita bloqueia.
- `tenant_id` nunca vem do client; toda query pelo client escopado; model novo com `tenant_id` entra em `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts`).
- Saldo nunca gravado: o que o cliente deve é a soma das entradas abertas (`entradasAbertas`), sempre.
- Regra de negócio em `src/lib/actions/*`; rota é wrapper fino com Zod via `apiErroDeZod` e `respostaDaAction`.
- Toda recusa com `fail(code, mensagem em português, status, field)`, e o `field` é o nome do campo da API que a tela usa no `ORDEM`.
- Toda action de escrita do Empório chama `registrarNoHistorico` com chave de `ACOES_DO_HISTORICO` (conferência 19 do `npm run check`).
- Nenhum `UPDATE` em dado existente para o vencimento do fiado antigo: regra de leitura (spec, Q223).
- Dia e hora: "hoje" é o dia de São Paulo (`hojeEmBrasilia()` de `src/lib/emporio/cartao.ts`, meia-noite UTC do dia de SP). Datas de vencimento se comparam por dia, nunca por instante do servidor.
- Dinheiro em tela no formato brasileiro (`R$ 1.234,56`), nunca `<input type="number">` (conferências 7 e 16).
- Suítes e cenários só com a URL do Docker inline: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public"` (127.0.0.1). Nunca a URL do `.env`.
- Subagente não commita; a sessão principal commita por tarefa.
- Nomes fixados por este plano (o builder não inventa outros): campos `fiado_due_days`, `fiado_block_after_days`, `fiado_default_limit`, `fiado_collection_message` (conta); `fiado_due_days`, `fiado_due_day`, `fiado_limit` (cliente); model `EmporioCreditRelease`; códigos `FIADO_BLOQUEADO`, `LIMITE_EXCEDIDO`, `LIBERACAO_JA_EXISTE`, `SEM_FIADO_VENCIDO`; chaves do Histórico `fiado.limite`, `fiado.prazo`, `fiado.liberar`, `fiado.cobrar`; suíte `test:m99`; roteiro `emporio-financeiro-credito`; migração `20261108120000_emporio_financeiro_credito`.

## Review Focus

1. Venda mista (fiado + dinheiro no mesmo pagamento): o limite conta só a parte fiado, e o bloqueio por atraso recusa a venda inteira com `field: payments`. Teste na Task 4 (caso "venda mista: só a parte fiado entra no limite").
2. Liberação válida com limite zero: a spec diz que a liberação passa pelos dois; limite zero e atraso ao mesmo tempo, com liberação, vende. Teste na Task 4 ("liberação passa pelo atraso e pelo limite zero").
3. Validade da liberação é o fim do dia de São Paulo, não o fim do dia UTC: criada às 23h30 de SP ainda vale às 23h50 de SP (02h50 UTC do dia seguinte). Teste na Task 4 com `valid_until` gravado e lido por `fimDoDiaEmSaoPaulo`.
4. Dia fixo do mês em mês curto: cliente com `fiado_due_day` 31 comprando em 2026-02-10 vence em 2026-02-28; comprando em 2026-01-31 vence em 2026-02-28 (o dia da venda não conta). Teste na Task 1 (função pura) e na Task 3 (venda).
5. Telefone com zero de operadora, DDI e máscara: `"+55 (34) 99876-1234"`, `"034 99876 1234"` e `"(34) 99876-1234"` viram `5534998761234`; `"9876-1234"` (sem DDD) vira `null` e a tela diz o que falta. Teste na Task 1 (função pura) e na Task 4 (lista de cobrança).

---

## Mapa de arquivos

| arquivo | responsabilidade | tarefa |
|---|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261108120000_emporio_financeiro_credito/migration.sql` | campos novos e o model `EmporioCreditRelease` | T1 |
| `src/lib/prisma.ts` | `TENANT_SCOPED_MODELS` ganha `emporioCreditRelease` | T1 |
| `src/lib/emporio/fiado.ts` (novo) | funções puras: vencimento efetivo, dia fixo do mês, dias de atraso, mensagem de cobrança | T1 |
| `src/lib/emporio/telefone.ts` | `telefoneParaWhatsApp` | T1 |
| `src/lib/emporio/historico.ts` | quatro chaves novas | T1 |
| `scripts/m99-emporio-financeiro-credito.test.ts`, `package.json` | suíte da entrega, escrita da spec | T2 |
| `src/lib/actions/emporio-credito.ts` (novo) | `estadoDeCredito`, `lerCreditoDoClienteAction`, `definirCreditoDoClienteAction`, `liberarFiadoAction`, `listarCobrancaAction`, `registrarCobrancaAction` | T3, T4 |
| `src/lib/actions/emporio-configuracoes.ts`, `src/app/api/v1/emporio/settings/route.ts`, `settings/fiado/route.ts` (novo) | configurações do fiado | T3 |
| `src/lib/actions/emporio-caixa.ts` | `entradasAbertas` com vencimento efetivo; `listarFiadoAction` com o dia de SP | T3 |
| `src/lib/actions/emporio-financeiro.ts` | `lerResumoHojeAction` lê o fiado pelo vencimento efetivo | T3 |
| `src/lib/actions/emporio-vendas.ts` | vencimento sugerido; bloqueio; consumo da liberação | T3 (sugestão), T4 (bloqueio) |
| `src/app/api/v1/emporio/customers/[id]/credit/route.ts`, `credit/releases/route.ts`, `collections/route.ts`, `src/app/api/v1/emporio/finance/collections/route.ts` | rotas novas | T3, T4 |
| `src/app/(dashboard)/emporio/configuracoes/*` | seção Fiado | T5 |
| `src/app/(dashboard)/emporio/clientes/[id]/page.tsx`, `clientes/_components/credito-*.tsx` (novos) | seção de crédito da ficha | T5 |
| `src/app/(dashboard)/emporio/_components/balcao.tsx`, `venda-campos.tsx`, `venda-estado.ts` | aviso de crédito e atalho na recusa | T5 |
| `src/app/(dashboard)/emporio/financeiro/cobranca/page.tsx` (novo), `_components/financeiro-abas.tsx`, `_components/financeiro-cobranca.tsx` (novo) | aba Cobrança | T6 |
| `scripts/_cenario-emporio-financeiro-credito.ts`, `scripts/navegador/emporio-financeiro-credito.py`, `scripts/navegador/manual-emporio.py`, manual (`src/app/(dashboard)/manual/_conteudo/*`), `public/manual/emporio/*.png` | prova viva e manual | T7 |
| `src/app/(public)/docs/api/endpoints.ts`, `docs/agents/dividas.md`, `scripts/cenario-demonstracao-emporio.ts` | docs e demonstração | T8 |

---

### Task 1: schema, migração e as funções puras do fiado

**Files:**
- Modify: `prisma/schema.prisma` (models `EmporioSettings` ~1342, `EmporioCustomer` ~3485; model novo perto de `EmporioCustomer`)
- Create: `prisma/migrations/20261108120000_emporio_financeiro_credito/migration.sql`
- Modify: `src/lib/prisma.ts` (`TENANT_SCOPED_MODELS`)
- Create: `src/lib/emporio/fiado.ts`
- Modify: `src/lib/emporio/telefone.ts`
- Modify: `src/lib/emporio/historico.ts` (`ACOES_DO_HISTORICO`)

**Interfaces:**
- Produces (schema): `EmporioSettings.fiado_due_days Int @default(30)`, `fiado_block_after_days Int @default(15)`, `fiado_default_limit Decimal(14,2)?`, `fiado_collection_message String?`. `EmporioCustomer.fiado_due_days Int?`, `fiado_due_day Int?`, `fiado_limit Decimal(14,2)?`. Model `EmporioCreditRelease { id String @id @default(cuid()); tenant_id String; customer_id String; establishment_id String; released_by_user_id String; reason String; valid_until DateTime; consumed_sale_id String? @unique; consumed_at DateTime?; created_at DateTime @default(now()) }` com relações `tenant` (Cascade), `customer` (Restrict), `establishment` (Restrict), `released_by` (Restrict), `consumed_sale` (SetNull), índice `@@index([tenant_id, customer_id, valid_until])`, mapeado em `emporio_credit_releases` se o schema mapeia nomes (siga o padrão dos vizinhos).
- Produces (`src/lib/emporio/fiado.ts`):
  - `export const DIA_MS = 86_400_000`
  - `export function diaUtc(d: Date): number` (meia-noite UTC do dia de `d`, em ms)
  - `export function diasDeAtraso(vencimento: Date, hoje: Date): number` (0 se não venceu; senão `(diaUtc(hoje) - diaUtc(vencimento)) / DIA_MS`)
  - `export function proximoDiaDoMes(base: Date, dia: number): Date` (a primeira data estritamente depois do dia de `base` cujo dia do mês é `min(dia, último dia daquele mês)`; devolve meia-noite UTC)
  - `export function somarDias(base: Date, dias: number): Date` (meia-noite UTC de `base` mais `dias`)
  - `export type RegraDePrazo = { kind: "dias"; value: number; source: "cliente" | "conta" } | { kind: "dia_do_mes"; value: number; source: "cliente" }`
  - `export function regraDePrazo(cliente: { fiado_due_days: number | null; fiado_due_day: number | null }, conta: { fiado_due_days: number }): RegraDePrazo` (dia fixo do cliente vence dias do cliente, que vence a conta)
  - `export function sugerirVencimento(regra: RegraDePrazo, vendaEm: Date): Date`
  - `export function vencimentoEfetivo(entrada: { due_date: Date | null; sold_at: Date; fiado_due_date: Date | null }, prazoPadraoDias: number): Date` (se `fiado_due_date` é nulo, o fiado é antigo sem data própria: `somarDias(sold_at, prazoPadraoDias)`; senão `due_date ?? fiado_due_date`)
  - `export const MENSAGEM_DE_COBRANCA_PADRAO = "Olá, {nome}! Aqui é da {loja}. Consta um fiado de {valor} vencido há {dias} dias. Pode nos ajudar a acertar? Obrigado!"`
  - `export function mensagemDeCobranca(modelo: string | null, dados: { nome: string; valor: string; dias: number; loja: string }): string` (troca `{nome}`, `{valor}`, `{dias}`, `{loja}`; modelo nulo usa o padrão)
- Produces (`src/lib/emporio/telefone.ts`): `export function telefoneParaWhatsApp(texto: string | null | undefined): string | null` (só dígitos; tira o zero de operadora na frente do DDD; 10 ou 11 dígitos ganham `55`; 12 ou 13 começando por `55` ficam; qualquer outra coisa é `null`).
- Produces (histórico): chaves `fiado.limite`, `fiado.prazo`, `fiado.liberar`, `fiado.cobrar` em `ACOES_DO_HISTORICO`, com rótulos em português no padrão das vizinhas.

- [ ] **Step 1: Escrever os casos das funções puras na suíte**

A Task 2 (suíte) é paralela e escreve a seção 1 da m99 com estes casos; esta tarefa escreve um teste rápido local em `scripts/_fiado.spot.ts`? Não: use a própria m99 quando ela existir. Até lá, prove com `npx tsx -e` (ver Step 4). Casos que a função tem de cumprir:

```ts
proximoDiaDoMes(new Date("2026-02-10T12:00:00Z"), 31)  // 2026-02-28
proximoDiaDoMes(new Date("2026-01-31T12:00:00Z"), 31)  // 2026-02-28
proximoDiaDoMes(new Date("2026-03-10T12:00:00Z"), 10)  // 2026-04-10 (o dia da venda não conta)
proximoDiaDoMes(new Date("2026-03-09T12:00:00Z"), 10)  // 2026-03-10
sugerirVencimento({ kind: "dias", value: 30, source: "conta" }, new Date("2026-11-08T15:00:00Z")) // 2026-12-08
vencimentoEfetivo({ due_date: new Date("2026-10-01T00:00:00Z"), sold_at: new Date("2026-10-01T14:00:00Z"), fiado_due_date: null }, 30) // 2026-10-31
vencimentoEfetivo({ due_date: new Date("2026-10-20T00:00:00Z"), sold_at: new Date("2026-10-01T14:00:00Z"), fiado_due_date: new Date("2026-10-20T00:00:00Z") }, 30) // 2026-10-20
diasDeAtraso(new Date("2026-10-20T00:00:00Z"), new Date("2026-11-08T00:00:00Z")) // 19
diasDeAtraso(new Date("2026-11-09T00:00:00Z"), new Date("2026-11-08T00:00:00Z")) // 0
telefoneParaWhatsApp("+55 (34) 99876-1234") // "5534998761234"
telefoneParaWhatsApp("034 99876 1234")      // "5534998761234"
telefoneParaWhatsApp("(34) 3222-1234")      // "553432221234"
telefoneParaWhatsApp("9876-1234")           // null
telefoneParaWhatsApp(null)                  // null
mensagemDeCobranca(null, { nome: "Zé", valor: "R$ 30,00", dias: 19, loja: "Loja 1" }) // contém "Zé", "R$ 30,00", "19 dias" e "Loja 1"
```

- [ ] **Step 2: Schema e migração**

Edite o `schema.prisma` com os campos e o model do bloco Interfaces. Gere o SQL:

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Salve em `prisma/migrations/20261108120000_emporio_financeiro_credito/migration.sql`, removendo qualquer `DROP INDEX` dos dois índices parciais (`WhatsAppProviderConfig_one_active`, `AnimalBatch_tenant_ear_tag_key`) se aparecerem. Aplique:

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run db:deploy
```

Esperado: a migração aplicada e um segundo `migrate diff` vazio. `npx prisma generate` se o `db:deploy` não gerar o client.

- [ ] **Step 3: `TENANT_SCOPED_MODELS` e `npm run test:isolation`**

Acrescente `emporioCreditRelease` à lista. Rode:

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:isolation
```

Esperado: verde. (Antes de acrescentar, a suíte tem de reprovar: confira uma vez.)

- [ ] **Step 4: As funções puras e o histórico**

Escreva `src/lib/emporio/fiado.ts` e `telefoneParaWhatsApp` com as assinaturas do bloco Interfaces. Prove os casos do Step 1 com `npx tsx -e` importando os módulos (ou um arquivo temporário fora do repo), e cole a saída no relatório. Acrescente as quatro chaves do Histórico.

- [ ] **Step 5: Gates**

```
npm run check
npx tsc --noEmit
```

Esperado: 0 falhas, 0 erros.

- [ ] **Step 6: Relatar** os arquivos tocados e a saída do Step 4 (a sessão principal commita).

---

### Task 2: a suíte m99, escrita da spec

**Files:**
- Create: `scripts/m99-emporio-financeiro-credito.test.ts`
- Modify: `package.json` (`"test:m99": "tsx scripts/m99-emporio-financeiro-credito.test.ts"`)

**Interfaces:**
- Consumes: o molde da `scripts/m98-emporio-financeiro-casa.test.ts` (`montar`, `chamar`, `rodar`, `comBanco`, `check`, tokens por papel, `papelFinanceiro`, `vincularTodas`, `abrirTurnoDeTeste`); os contratos de API das Tasks 3 e 4 (copiados abaixo, para a suíte nascer antes do código); as funções puras da Task 1.
- Produces: `npm run test:m99`, 7 seções, vermelha até as Tasks 3 e 4 chegarem (a seção 1 fica verde com a Task 1).

Contratos que a suíte exercita (a autoridade é a spec; estes são os nomes que as Tasks 3 e 4 implementam):

- `GET /api/v1/emporio/settings` devolve também `fiado_due_days`, `fiado_block_after_days`, `fiado_default_limit` (number | null), `fiado_collection_message` (string | null) e `fiado_collection_message_effective` (string).
- `PATCH /api/v1/emporio/settings/fiado` corpo `{ fiado_due_days?, fiado_block_after_days?, fiado_default_limit?: number | null, fiado_collection_message?: string | null }`; exige `dinheiro`; 200 com a view das configurações; 422 com `field` do campo inválido (dias 1 a 365; limite >= 0; mensagem até 500).
- `GET /api/v1/emporio/customers/:id/credit` (quem passa em `vendedor_da_loja` ou `dinheiro`) devolve `CreditoView`:
  `{ customer_id, customer_name, phone, phone_whatsapp: string | null, limit: number | null, limit_source: "cliente" | "conta" | "nenhum", due_rule: { kind: "dias" | "dia_do_mes", value: number, source: "cliente" | "conta" }, suggested_due_date: string (AAAA-MM-DD, para uma venda hoje), owed_total: number, owed_by_store: [{ establishment_id, establishment_name, owed, overdue }], overdue_total: number, oldest_overdue: { due_date: string, days: number } | null, block_after_days: number, status: "em_dia" | "bloqueado_por_atraso" | "no_limite", available: number | null, releases: [{ id, establishment_id, establishment_name, released_by_name, reason, valid_until, consumed_sale_id, created_at }], last_charged_at: string | null }`.
- `PATCH /api/v1/emporio/customers/:id/credit` corpo `{ fiado_limit?: number | null, fiado_due_days?: number | null, fiado_due_day?: number | null }`; exige `dinheiro`; 200 com `CreditoView`; 422 `field: fiado_due_day` quando dias e dia vêm juntos; limite negativo 422 `field: fiado_limit`; dia fora de 1 a 31 422 `field: fiado_due_day`.
- `POST /api/v1/emporio/customers/:id/credit/releases` corpo `{ establishment_id, reason, operation_key? }`; exige `gestor_da_loja` na loja (Dono e Gerente geral passam); 201 `{ data: release }`; motivo com menos de 3 caracteres 422 `field: reason`; segunda liberação válida no mesmo dia para o mesmo cliente e loja 409 `LIBERACAO_JA_EXISTE` `field: establishment_id`.
- `POST /api/v1/emporio/sales` com fiado: 409 `FIADO_BLOQUEADO` `field: payments` quando o cliente tem fiado vencido há mais dias que `fiado_block_after_days` em qualquer loja; 409 `LIMITE_EXCEDIDO` `field: payments` quando há limite e `owed_total + parte fiado > limite` (limite 0 recusa qualquer fiado); uma liberação válida para o cliente na loja da venda passa pelos dois e sai consumida (`consumed_sale_id` = venda); venda sem `due_date` no fiado grava `due_date` sugerido (venda > cliente > conta) na entry e no `EmporioSalePayment`.
- `GET /api/v1/emporio/finance/collections?establishment_id=&faixa=` (`faixa` em `1-15`, `16-30`, `31-60`, `60+`, opcional); exige `dinheiro`; devolve `CobrancaView { message_template: string, customers: [{ customer_id, customer_name, phone, phone_whatsapp: string | null, whatsapp_url: string | null, message: string, overdue_total, oldest_days, stores: [{ establishment_id, establishment_name, overdue }], last_charged_at: string | null }] }`, ordenado por `oldest_days` decrescente; `whatsapp_url` é `https://wa.me/<phone_whatsapp>?text=<message codificada>` ou `null`.
- `POST /api/v1/emporio/customers/:id/collections` corpo `{ establishment_id?: string | null, message?: string }`; exige `dinheiro`; 201 `{ data: { charged_at } }`; cliente sem fiado vencido 422 `SEM_FIADO_VENCIDO` `field: customer_id`; grava `fiado.cobrar` no Histórico.

- [ ] **Step 1: Escrever a suíte com as sete seções**

Cada seção monta o próprio tenant com `montar` (um por seção ou um para todas, como a m98), lojas L1 e L2, usuários owner, gestor de L1 (`gestorL1`), gestor de L2, vendedor de L1, caixa com turno em L1, financeiro. Clientes criados por Prisma com `phone` variado. Vendas de fixture por `venderAction` direto (como a seção 5 da m98) ou pela rota de vendas; fiado antigo "sem data" por Prisma: entry income pendente de `CATEGORIA_VENDAS` com `due_date = sold_at`, venda com `EmporioSalePayment` fiado com `due_date: null`.

Seção 1, funções puras (importa `@/lib/emporio/fiado` e `@/lib/emporio/telefone`): os casos listados na Task 1, Step 1, um `check` por linha.

Seção 2, configurações do fiado: GET traz os padrões (30, 15, null, null, mensagem padrão em `fiado_collection_message_effective`); Financeiro muda para 20 dias, 10 de bloqueio, limite padrão 500 e mensagem com `{nome}` (200, e o GET reflete); Gestor recebe 403; `fiado_due_days: 0` 422 `field: fiado_due_days`; `fiado_default_limit: -1` 422 `field: fiado_default_limit`; o Histórico tem `configuracoes.editar` com `changes` citando o campo.

Seção 3, vencimento: (a) venda fiado com `due_date` informado grava esse dia na entry e no sale payment; (b) sem `due_date`, cliente com `fiado_due_days: 10` vence venda mais 10; (c) sem `due_date`, cliente com `fiado_due_day: 10` e venda em 2026-03-09 vence 2026-03-10, venda em 2026-03-10 vence 2026-04-10 (use `sold_at` na venda); (d) sem nada, vence venda mais o padrão da conta (20, da seção 2, ou 30 num tenant limpo); (e) fiado antigo sem data (fixture Prisma, venda há 40 dias, padrão 30): `listarFiadoAction`/`GET /api/v1/emporio/receivables` (ou a rota do fiado que a m98 usa) mostra `due_date` = venda mais 30 e `overdue: true` com 10 dias; mudar o padrão para 60 faz o mesmo fiado deixar de estar vencido, sem `UPDATE` (confira `due_date` cru da entry inalterado por Prisma); (f) `GET .../credit` traz `suggested_due_date` pela mesma ordem; (g) `owed_total` do cliente não muda com o prazo (soma igual antes e depois de mudar o padrão).

Seção 4, bloqueio e limite: (a) cliente com fiado vencido há 20 dias em L1 e `fiado_block_after_days` 15: fiado em L2 recusa 409 `FIADO_BLOQUEADO` `field: payments`, mensagem contém "vencido há 20 dias"; venda em L2 só em dinheiro para o mesmo cliente passa (201); (b) vencido há 10 dias não bloqueia; (c) limite padrão 500, cliente deve 450: fiado de 100 recusa `LIMITE_EXCEDIDO` com a mensagem citando o limite e quanto cabe (50); fiado de 50 passa; (d) cliente com `fiado_limit: 1000` e padrão 500 devendo 600: fiado de 100 passa (o do cliente vence); (e) `fiado_limit: 0`: qualquer fiado recusa, com a mensagem "não compra fiado"; (f) venda mista (fiado 60 + dinheiro 100) com 450 devidos e limite 500: recusa (60 passa dos 50 que cabem); fiado 50 + dinheiro 110 passa; (g) `GET .../credit` do cliente bloqueado traz `status: "bloqueado_por_atraso"` e `oldest_overdue.days` 20; do cliente no limite traz `status: "no_limite"` e `available` 0 ou negativo; (h) devolução com `abater_fiado` reduz `owed_total` e volta a caber (se `devolverAction` for simples de chamar na fixture; senão, registre que ficou de fora).

Seção 5, liberação: (a) gestor de L2 liberando em L1: 403; gestor de L1 em L1: 201 com `valid_until` no fim do dia de SP (hora UTC 02:59:59.999 do dia seguinte, ou 03:59 no horário de verão que não existe mais: confira só que é o fim do dia de SP com `fimDoDiaEmSaoPaulo`); (b) segunda liberação no mesmo dia: 409 `LIBERACAO_JA_EXISTE`; (c) com a liberação, a venda fiado do cliente bloqueado em L1 passa (201) e a liberação sai com `consumed_sale_id` = a venda; (d) a segunda venda fiado recusa de novo `FIADO_BLOQUEADO`; (e) liberação em L1 não vale para venda em L2 (409); (f) cliente com `fiado_limit: 0` e atraso, com liberação: vende; (g) o Histórico tem `fiado.liberar` com o motivo; `GET .../credit` lista a liberação em `releases` com `consumed_sale_id`; (h) vendedor (sem ser gestor) tentando liberar: 403; Dono: 201.

Seção 6, cobrança: clientes "Cob Mais" (vencido há 40 dias, telefone `(34) 99876-1234`, L1 e L2), "Cob Menos" (vencido há 5 dias, telefone `+55 34 3222-1234`), "Cob Semtel" (vencido há 10 dias, sem telefone), "Cob Em dia" (fiado a vencer). (a) `GET /finance/collections` pelo Financeiro traz os três vencidos na ordem Mais, Semtel, Menos e não traz Em dia; (b) `whatsapp_url` do Mais começa com `https://wa.me/5534998761234?text=` e o texto decodificado contém o nome e o valor em formato brasileiro; (c) Semtel tem `phone_whatsapp` e `whatsapp_url` nulos; (d) `faixa=31-60` traz só Mais; `establishment_id=L2` traz só quem deve em L2; (e) `POST .../collections` do Mais: 201, e o GET seguinte traz `last_charged_at` preenchido; do Em dia: 422 `SEM_FIADO_VENCIDO`; Gestor: 403; (f) a mensagem usa o modelo da conta quando definido (`{nome}` trocado).

Seção 7, isolamento: Financeiro de B lendo `/credit` do cliente de A: 404; definindo limite: 404; liberando: 404; cobrando: 404; `finance/collections` de B não lista cliente de A; a limpeza não deixa tenant para trás.

- [ ] **Step 2: Registrar no `package.json` e rodar**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m99
```

Esperado agora: a seção 1 verde (se a Task 1 já entrou) e as outras vermelhas por rota inexistente ou 404, sem erro de TypeScript fora dos imports das rotas que ainda não existem (`npx tsc --noEmit` pode acusar TS2307 só nesses imports; liste-os no relatório).

- [ ] **Step 3: `npm run check`** (a conferência de suíte sem entrada no `package.json` e a de `npm run` citado) 0 falhas.

- [ ] **Step 4: Relatar** o número de checks por seção e os TS2307 restantes.

---

### Task 3: vencimento efetivo, sugestão de vencimento, configurações e crédito do cliente (actions e rotas)

**Files:**
- Create: `src/lib/actions/emporio-credito.ts`
- Modify: `src/lib/actions/emporio-caixa.ts` (`entradasAbertas` ~75-117, `listarFiadoAction` ~119-183, `EntradaAberta`, `FiadoEntradaView`)
- Modify: `src/lib/actions/emporio-financeiro.ts` (`lerResumoHojeAction`, o fiado que vence hoje ~165)
- Modify: `src/lib/actions/emporio-vendas.ts` (`prepararVenda` ~679-860, `gravarVenda` ~1092-1111)
- Modify: `src/lib/actions/emporio-configuracoes.ts`, `src/app/api/v1/emporio/settings/route.ts`
- Create: `src/app/api/v1/emporio/settings/fiado/route.ts`, `src/app/api/v1/emporio/customers/[id]/credit/route.ts`
- Modify: `src/app/(dashboard)/emporio/fiado/page.tsx` só se a coluna Vencimento precisar do campo novo (ver Step 3)

**Interfaces:**
- Consumes: Task 1 (`fiado.ts`, `telefone.ts`, campos do schema, chaves do Histórico).
- Produces:
  - `entradasAbertas(db, where, opts?: { prazoPadraoDias?: number })` devolve `EntradaAberta` com o campo novo `effective_due_date: Date` (regra `vencimentoEfetivo`; a função lê `fiado_due_days` das configurações da conta uma vez quando `opts` não traz). `FiadoEntradaView.due_date` passa a ser o efetivo (ISO) e `overdue` passa a usar `hojeEmBrasilia()`; `oldest_due_date` idem. Isso fecha a dívida 2.35 (fuso).
  - `lerConfiguracoesDoFiado(db): Promise<{ fiado_due_days: number; fiado_block_after_days: number; fiado_default_limit: number | null; fiado_collection_message: string | null }>` em `emporio-credito.ts` (cria a linha de settings com os padrões se não existir, como `lerConfiguracoesAction` já faz).
  - `estadoDeCredito(db, customerId: string, opts?: { lojasVisiveis?: Set<string> | null }): Promise<EstadoDeCredito>` em `emporio-credito.ts`, com `EstadoDeCredito = { customer: { id, name, phone, fiado_limit, fiado_due_days, fiado_due_day }, settings, limit: number | null, limit_source, due_rule: RegraDePrazo, owed_cent: number, overdue_cent: number, oldest_overdue: { due_date: Date; days: number } | null, by_store: Map<string, { owed_cent; overdue_cent }>, blocked_by_delay: boolean, available_cent: number | null }`. "Bloqueado por atraso" = `oldest_overdue.days > settings.fiado_block_after_days`. O saldo é de TODAS as lojas (spec: o cliente é um só), independentemente das lojas visíveis do ator.
  - `lerCreditoDoClienteAction(db, ator, customerId): Promise<ActionResult<CreditoView>>` (exige `["vendedor_da_loja", "dinheiro"]`; 404 se o cliente não é do tenant ou é o Consumidor final).
  - `definirCreditoDoClienteAction(db, ator, customerId, input: { fiado_limit?: number | null; fiado_due_days?: number | null; fiado_due_day?: number | null }): Promise<ActionResult<CreditoView>>` (exige `dinheiro`; Histórico `fiado.limite` quando o limite muda e `fiado.prazo` quando o prazo muda, com `changes` antes/depois, `target_type: "cliente"`, `target_id`; mudar nada não grava).
  - `salvarConfiguracoesDoFiadoAction(db, ator, input: { fiado_due_days?: number; fiado_block_after_days?: number; fiado_default_limit?: number | null; fiado_collection_message?: string | null }): Promise<ActionResult<EmporioSettingsView>>` em `emporio-configuracoes.ts` (exige `dinheiro`; Histórico `configuracoes.editar` com `diferencas`). `EmporioSettingsView` ganha os cinco campos do contrato da Task 2.
  - `venderAction`: com fiado e sem `due_date`, grava o vencimento sugerido (`regraDePrazo` + `sugerirVencimento` sobre `sold_at`) na entry e no `EmporioSalePayment` (que deixa de ficar nulo em venda nova). A `VendaView` passa a trazer `fiado_due_date` (ISO | null) se ainda não traz o vencimento (confira; se já traz, não duplique).
  - Rotas: `PATCH /api/v1/emporio/settings/fiado`; `GET` e `PATCH /api/v1/emporio/customers/[id]/credit`; `GET /api/v1/emporio/settings` com os campos novos.

- [ ] **Step 1: Rodar a m99 (seções 2 e 3) para ver vermelho**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m99
```

- [ ] **Step 2: `emporio-credito.ts` com `lerConfiguracoesDoFiado`, `estadoDeCredito`, `lerCreditoDoClienteAction`, `definirCreditoDoClienteAction`**

`estadoDeCredito` usa `entradasAbertas(db, { emporio_customer_id: customerId })` sem filtro de loja, agrupa por `establishment_id`, calcula vencido com `vencimentoEfetivo` e `diasDeAtraso(…, hojeEmBrasilia())`. `CreditoView` sai do estado mais as liberações (`emporioCreditRelease` das últimas 10 do cliente, com nome de quem liberou e da loja) e `last_charged_at` (último `emporioAuditLog` com `action: "fiado.cobrar"` e `target_id` = cliente). Valores em reais (number com 2 casas), como as outras views.

- [ ] **Step 3: `entradasAbertas` com `effective_due_date`, `listarFiadoAction` no dia de SP, `lerResumoHojeAction` pelo efetivo**

Em `entradasAbertas`, carregue junto com `sold_at` o `due_date` do `EmporioSalePayment` de `kind: "fiado"` da venda (`fiado_due_date`). O "fiado que vence hoje" do `HojeView` passa a filtrar pelas entradas abertas com `effective_due_date` no dia, em vez da query crua por `due_date`. A tela `/emporio/fiado` continua mostrando `due_date` da view (agora o efetivo). Prove com a seção 3 (e) e (g) da m99 e com `test:m98` e `test:m83` (a m83 cobre fiado antigo).

- [ ] **Step 4: Sugestão de vencimento em `venderAction`**

Em `prepararVenda`, quando há pagamento `fiado` sem `due_date`: carregue o cliente (já carregado para a validação de Consumidor final) com os campos de prazo e as configurações; `due_date = sugerirVencimento(regraDePrazo(cliente, settings), sold_at)`. Em `gravarVenda`, o `EmporioSalePayment` fiado grava sempre o `due_date` resolvido. Prove com a seção 3 (a) a (d).

- [ ] **Step 5: Configurações do fiado**

`salvarConfiguracoesDoFiadoAction` com as validações do contrato (dias 1 a 365, `field` de cada um; limite >= 0; mensagem até 500). `lerConfiguracoesAction` devolve os cinco campos (`fiado_collection_message_effective` = `mensagemDeCobranca` do modelo? Não: é o modelo cru efetivo, `fiado_collection_message ?? MENSAGEM_DE_COBRANCA_PADRAO`, sem trocar marcadores). Rota `settings/fiado/route.ts` com Zod (`apiErroDeZod`). Prove com a seção 2.

- [ ] **Step 6: Rotas do crédito do cliente** (`customers/[id]/credit/route.ts`, GET e PATCH), Zod com `fiado_limit: z.number().min(0).nullish()`, `fiado_due_days: z.number().int().min(1).max(365).nullish()`, `fiado_due_day: z.number().int().min(1).max(31).nullish()`. A exclusão mútua (dias e dia juntos) é regra da action, `field: fiado_due_day`.

- [ ] **Step 7: Gates**

```
npm run check
npx tsc --noEmit
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m99   # seções 1, 2, 3 e a parte do crédito da 7 verdes
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m98
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m83
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m79
```

Esperado: tudo verde; a m99 ainda vermelha nas seções 4, 5 e 6 (Task 4).

- [ ] **Step 8: Relatar** arquivos e o resumo das suítes.

---

### Task 4: bloqueio, liberação e cobrança (actions e rotas)

**Files:**
- Modify: `src/lib/actions/emporio-credito.ts` (acrescenta `liberarFiadoAction`, `listarCobrancaAction`, `registrarCobrancaAction`, `liberacaoValida`)
- Modify: `src/lib/actions/emporio-vendas.ts` (`prepararVenda`: o bloqueio; `gravarVenda`: o consumo da liberação)
- Create: `src/app/api/v1/emporio/customers/[id]/credit/releases/route.ts`, `src/app/api/v1/emporio/customers/[id]/collections/route.ts`, `src/app/api/v1/emporio/finance/collections/route.ts`

**Interfaces:**
- Consumes: Task 3 (`estadoDeCredito`, `lerConfiguracoesDoFiado`), Task 1 (`telefoneParaWhatsApp`, `mensagemDeCobranca`, chaves do Histórico).
- Produces:
  - `liberacaoValida(db, customerId, establishmentId, agora: Date): Promise<{ id: string } | null>` (não consumida, `valid_until >= agora`, da loja).
  - `liberarFiadoAction(db, ator, customerId, input: { establishment_id: string; reason: string; operation_key?: string }): Promise<ActionResult<LiberacaoView>>` (exige `gestor_da_loja` na loja: `exigir(db, ator, "gestor_da_loja", "liberar fiado", establishment_id)`; `reason` 3 a 300 caracteres, `field: reason`; `valid_until = fimDoDiaEmSaoPaulo(agora)` (há `inicioDoDiaEmSaoPaulo` em `src/lib/dia-calendario.ts`; crie o par se faltar); 409 `LIBERACAO_JA_EXISTE` `field: establishment_id` se já há uma válida; Histórico `fiado.liberar`, `establishment_id` da loja, `target_type: "cliente"`, `target_id`, summary "Liberou fiado para {nome}: {motivo}"). `LiberacaoView = { id, customer_id, establishment_id, establishment_name, released_by_name, reason, valid_until, consumed_sale_id, created_at }`.
  - Em `prepararVenda`, quando há fiado e o cliente não é o Consumidor final: `estado = estadoDeCredito(db, customer_id)`; `liberacao = liberacaoValida(db, customer_id, establishment_id, agora)`; sem liberação: se `estado.blocked_by_delay` → `fail("FIADO_BLOQUEADO", "Cliente com fiado vencido há N dias. Peça a liberação ao gestor.", 409, "payments")`; senão se `estado.limit !== null` e `estado.owed_cent + fiadoCent > limitCent` → `fail("LIMITE_EXCEDIDO", limite 0 ? "Este cliente não compra fiado: o limite dele é zero." : "O limite de fiado do cliente é R$ X e ele já deve R$ Y: cabem R$ Z.", 409, "payments")`. Com liberação, nada é checado e `PagamentoPreparado`/o preparo carrega `credit_release_id`. Em `gravarVenda`, `updateMany({ where: scoped({ id: credit_release_id, consumed_sale_id: null }), data: { consumed_sale_id: venda.id, consumed_at: agora } })`; se `count === 0` (consumida entre o preparo e a gravação), lance erro que a transação reverta e a action devolva `fail("FIADO_BLOQUEADO", …, 409, "payments")`.
  - `listarCobrancaAction(db, ator, opts: { establishment_id?: string; faixa?: "1-15" | "16-30" | "31-60" | "60+" }): Promise<ActionResult<CobrancaView>>` (exige `dinheiro`; parte de `listarFiadoAction` com o vencimento efetivo; `oldest_days` = `diasDeAtraso` do vencido mais antigo; `stores` só com `overdue > 0`; `message` = `mensagemDeCobranca(modelo, { nome, valor: formato brasileiro do `overdue_total`, dias, loja: nome da loja com o vencido mais antigo })`; `whatsapp_url` com `encodeURIComponent(message)`; filtro por loja = clientes com vencido naquela loja (o total mostrado continua sendo o da loja filtrada); `faixa` sobre `oldest_days`).
  - `registrarCobrancaAction(db, ator, customerId, input: { establishment_id?: string | null; message?: string }): Promise<ActionResult<{ charged_at: string }>>` (exige `dinheiro`; 422 `SEM_FIADO_VENCIDO` `field: customer_id` se `overdue_cent === 0`; Histórico `fiado.cobrar` com summary "Cobrou {nome} pelo WhatsApp: R$ X vencido há N dias" e `establishment_id` quando informado).
  - Rotas: `POST customers/[id]/credit/releases` (201), `POST customers/[id]/collections` (201), `GET finance/collections` (`guardEmporio("read")`, Zod da query).

- [ ] **Step 1: Rodar a m99 e ver as seções 4, 5 e 6 vermelhas**

- [ ] **Step 2: O bloqueio em `prepararVenda` e o consumo em `gravarVenda`** (seção 4 e 5 (c), (d), (e), (f))

- [ ] **Step 3: `liberarFiadoAction` e a rota** (seção 5)

- [ ] **Step 4: `listarCobrancaAction`, `registrarCobrancaAction` e as duas rotas** (seção 6)

- [ ] **Step 5: Gates**

```
npm run check
npx tsc --noEmit
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m99   # TODA verde
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m80   # vendas
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m81
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m96   # escolha do cliente
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m97   # pedido para entrega (venda)
```

Esperado: tudo verde. Se uma suíte antiga vender fiado para um cliente de fixture com dívida vencida, ela passa a ser recusada: ajuste a fixture (data da dívida ou liberação), nunca a regra, e diga no relatório.

- [ ] **Step 6: Relatar.**

---

### Task 5: as telas do crédito (configurações, ficha do cliente, balcão)

**Files:**
- Modify: `src/app/(dashboard)/emporio/configuracoes/page.tsx`
- Create: `src/app/(dashboard)/emporio/configuracoes/_components/fiado-form.tsx`
- Modify: `src/app/(dashboard)/emporio/clientes/[id]/page.tsx`
- Create: `src/app/(dashboard)/emporio/clientes/_components/credito-do-cliente.tsx`, `credito-form.tsx`, `liberar-fiado-form.tsx`
- Modify: `src/app/(dashboard)/emporio/_components/balcao.tsx`, `venda-campos.tsx`, `venda-estado.ts`

**Interfaces:**
- Consumes: `lerCreditoDoClienteAction`, `definirCreditoDoClienteAction`, `liberarFiadoAction`, `salvarConfiguracoesDoFiadoAction`, `lerConfiguracoesAction` e as rotas (Tasks 3 e 4); `pode(papel, "dinheiro")`, `pode(papel, "gestor_da_loja", lojaId)`; o padrão `ORDEM` + `useErrosDeFormulario` + `FormSheet` + `Field` de `configuracoes-form.tsx`.
- Produces: três telas que mostram toda recusa do servidor no campo certo (`ORDEM` com os nomes da API).

- [ ] **Step 1: Configurações, seção "Fiado"**

Na página, depois de "Cabeçalho das lojas", uma seção "Fiado" com `<dl>` (Prazo padrão: N dias; Bloqueia com: N dias de atraso; Limite padrão: R$ X ou "Sem limite de valor"; Mensagem de cobrança: o texto efetivo) e o botão "Mudar" que abre `FiadoForm` (`FormSheet`, `ORDEM = ["fiado_due_days", "fiado_block_after_days", "fiado_default_limit", "fiado_collection_message"] as const`, `MoneyInput` no limite com a opção de deixar vazio = sem limite, textarea na mensagem com a dica "Use {nome}, {valor}, {dias} e {loja}", `apiPatch("/api/v1/emporio/settings/fiado", …)`, `err.doServidor(res)`). Quem vê o botão: `pode(papel, "dinheiro")`. A página já é visível para `["gestor_da_loja", "dinheiro"]`.

- [ ] **Step 2: Ficha do cliente, seção "Fiado e crédito"**

Depois de "Resumo" (ou no lugar certo da ordem visual), `CreditoDoCliente` (componente servidor ou cliente, dados de `lerCreditoDoClienteAction` chamada na page) com: situação em `Badge` ("Em dia", "Bloqueado: fiado vencido há N dias", "No limite"); limite ("R$ X, do cliente" / "R$ X, padrão da conta" / "Sem limite de valor"); prazo ("30 dias depois da venda, padrão da conta" / "todo dia 10"); "Deve R$ X" com a tabela por loja (loja, em aberto, vencido); vencido mais antigo (data e dias); liberações recentes (data, loja, quem, motivo, "usada na venda" com link `/emporio/vendas/:id` ou "válida até hoje" ou "venceu"); "Cobrado pela última vez em …". Botões: "Limite e prazo" (`pode(papel, "dinheiro")`) abre `CreditoForm` (`ORDEM = ["fiado_limit", "fiado_due_days", "fiado_due_day"]`, um seletor "Prazo" com as opções "Padrão da conta", "Dias depois da venda", "Dia fixo do mês" que mostra o campo certo e manda o outro como `null`; `apiPatch("/api/v1/emporio/customers/:id/credit")`); "Liberar fiado hoje" (visível se o ator passa em `gestor_da_loja` em alguma loja visível, ou em `conta`) abre `LiberarFiadoForm` (`ORDEM = ["establishment_id", "reason"]`, `Select` de loja só com as lojas em que ele passa, `apiPost(".../credit/releases")`; sucesso recarrega a ficha e mostra "Liberado até o fim do dia. O Caixa pode fechar a venda."). O Consumidor final não tem a seção.

- [ ] **Step 3: Balcão**

(a) Quando a venda tem cliente (não Consumidor final) e um pagamento `fiado`, o balcão busca `GET /api/v1/emporio/customers/:id/credit` uma vez por cliente e mostra, abaixo da linha do fiado, uma linha de aviso: "Fiado em aberto: R$ X" + (limite ? " de R$ L" : "") + (status bloqueado ? " · Bloqueado: vencido há N dias" : status no_limite ? " · No limite" : ""), e no campo "Vence em (opcional)" vazio a dica "Sem data, vence em dd/mm/aaaa" com `suggested_due_date`. A busca não bloqueia a venda: a recusa de verdade é do servidor.
(b) Na recusa do servidor com código `FIADO_BLOQUEADO` ou `LIMITE_EXCEDIDO` (leia `error.code` do corpo antes de `err.doServidor(res)`), além da mensagem no campo `payments`, renderize abaixo um `Link` "Abrir a ficha do cliente para o gestor liberar" para `/emporio/clientes/:id` e o texto "Ou troque a forma de pagamento." O Caixa não digita senha de ninguém nesta tela.
Onde a tela monta `payments` (`venda-estado.ts:445`), nada muda: o `due_date` continua opcional.

- [ ] **Step 4: Gates**

```
npm run check
npx tsc --noEmit
npm run lint
```

Esperado: 0 falhas, 0 erros, nenhum warning novo. Abra as três telas no `next dev` (porta que estiver livre) a 390 px e a 1280 px e cole no relatório o que viu (não é a prova viva, que é a Task 7; é a conferência de quem fez).

- [ ] **Step 5: Relatar.**

---

### Task 6: a aba Cobrança da casa do financeiro

**Files:**
- Modify: `src/app/(dashboard)/emporio/_components/financeiro-abas.tsx` (item `{ href: "/emporio/financeiro/cobranca", rotulo: "Cobrança" }` depois de "A receber")
- Create: `src/app/(dashboard)/emporio/financeiro/cobranca/page.tsx`, `src/app/(dashboard)/emporio/_components/financeiro-cobranca.tsx`
- Modify: `scripts/nav-build.test.ts` só se a aba entrar no menu lateral (não entra: é aba, não página do menu)

**Interfaces:**
- Consumes: `listarCobrancaAction`, `registrarCobrancaAction` e as rotas (Task 4); `FinanceiroAbas`, `LojaFiltro`, o molde de `financeiro/receber/page.tsx`.
- Produces: `/emporio/financeiro/cobranca?loja=&faixa=`.

- [ ] **Step 1: A página**, no molde de `receber/page.tsx`: `veAPagina(papel, "/emporio/financeiro")`, filtro de loja, filtro de faixa (links ou `Select` que muda `?faixa=`), `listarCobrancaAction`, `EmptyState` "Ninguém com fiado vencido" quando vazio.

- [ ] **Step 2: `FinanceiroCobranca`** (cliente): tabela (cartões a 390 px) com cliente, vencido (formato brasileiro), "há N dias", lojas, telefone formatado (`formatarTelefone`), "Cobrado em dd/mm" quando houver, e o botão "Cobrar no WhatsApp". O botão abre um painel (`FormSheet`, `ORDEM = ["message"]`) com a mensagem já montada num textarea editável e o botão "Abrir o WhatsApp": ao confirmar, `apiPost("/api/v1/emporio/customers/:id/collections", { establishment_id: loja filtrada ou null, message })` e, com 201, `window.open("https://wa.me/<phone_whatsapp>?text=" + encodeURIComponent(message), "_blank", "noopener")` e a linha ganha "Cobrado em hoje". Sem telefone: o botão vira o texto "Sem telefone no cadastro" com `Link` "Completar em Clientes" para a ficha; o painel não abre. A mensagem padrão vem de `message` da view (já com os marcadores trocados).

- [ ] **Step 3: Gates** (`check`, `tsc`, `lint`) e a tela aberta a 390 px sem rolagem horizontal.

- [ ] **Step 4: Relatar.**

---

### Task 7: prova viva: cenário, roteiro nos dois sentidos e manual

**Files:**
- Create: `scripts/_cenario-emporio-financeiro-credito.ts`, `scripts/navegador/emporio-financeiro-credito.py`
- Modify: `scripts/navegador/manual-emporio.py`, `src/app/(dashboard)/manual/_conteudo/partes-tarefa-2.tsx` (`ParteDeFiado`), `_conteudo/figuras.ts` (`PapelDaFigura` ganha `"financeiro"` se uma figura precisar; senão use "dono"), `_conteudo/indice.ts` (resumo do slug `fiado` cita limite e cobrança), `_conteudo/partes-funcao.tsx` (o que o Gestor libera e o que o Financeiro define, uma linha cada)
- Create: `public/manual/emporio/fiado-credito.png`, `fiado-credito-celular.png`, `financeiro-cobranca.png`, `financeiro-cobranca-celular.png`

**Interfaces:**
- Consumes: tudo das Tasks 3 a 6; o molde de `scripts/_cenario-emporio-financeiro-casa.ts` (prefixo, `limpar`, idempotência, conta do seed) e de `scripts/navegador/emporio-financeiro-casa.py` (cabeçalho `# cenario:` e `# sessao:`; helpers de `_lib.py`).
- Produces: `npm run navegador -- emporio-financeiro-credito` verde, e reprovado uma vez com a regra desfeita.

- [ ] **Step 1: O cenário** (prefixo "Cred "): lojas "Cred Loja 1" e "Cred Loja 2"; `cred-gestor@teste.local` (Gestor da Loja 1), `cred-caixa@teste.local` (Caixa da Loja 1 com turno aberto), `cred-casa@teste.local` (Financeiro); clientes "Cred Bloqueado" (telefone `(34) 99876-1234`, fiado de R$ 80,00 vencido há 20 dias na Loja 2), "Cred Limite" (limite próprio R$ 100,00, deve R$ 80,00 na Loja 1, em dia), "Cred Semtel" (sem telefone, R$ 25,00 vencido há 10 dias); configurações da conta com prazo 30, bloqueio 15, limite padrão nulo; produto "Cred Ração" com preço e estoque na Loja 1. Idempotente.

- [ ] **Step 2: O roteiro**, 8 passos:
  1. Financeiro abre Configurações, vê a seção Fiado com os padrões, muda o limite padrão para R$ 500,00 e a mensagem com `{nome}`; a `<dl>` reflete.
  2. Caixa abre Vender na Loja 1, escolhe "Cred Bloqueado", item "Cred Ração" R$ 30,00, "+ Fiado": a linha de aviso diz "Bloqueado: vencido há 20 dias"; confirma: a recusa aparece no campo Pagamento com "vencido há 20 dias" e o link para a ficha; `confere` que a venda não foi gravada (`GET /api/v1/emporio/sales` não tem a venda nova).
  3. Gestor abre a ficha de "Cred Bloqueado", vê "Bloqueado", clica "Liberar fiado hoje", escolhe Loja 1, motivo "Vai pagar sexta"; a ficha mostra a liberação válida.
  4. Caixa confirma a mesma venda de novo: fecha (201); nova venda fiado para o mesmo cliente: recusa de novo (liberação consumida); a ficha mostra a liberação "usada na venda".
  5. Caixa vende fiado R$ 30,00 para "Cred Limite": recusa "cabem R$ 20,00"; muda para R$ 20,00: fecha. Confere que o "Vence em" vazio mostrou a dica com a data (30 dias).
  6. Financeiro abre Cobrança: ordem "Cred Bloqueado" (20 dias, R$ 80,00) e "Cred Semtel" (10 dias); "Cred Limite" não aparece; o link do WhatsApp do Bloqueado tem `wa.me/5534998761234` e o texto com "Cred Bloqueado" e "R$ 80,00"; Semtel mostra "Sem telefone no cadastro".
  7. Financeiro clica "Cobrar no WhatsApp" do Bloqueado e confirma no painel (`window.open` interceptado por `js` para não abrir aba: redefina `window.open` para guardar a URL e `confere` a URL guardada); a linha mostra "Cobrado em"; a ficha do cliente mostra a data.
  8. Celular a 390 px: a aba Cobrança sem rolagem horizontal; o painel de cobrar abre e fecha.

  Rode com o `next dev` que estiver de pé (`TIBE_BASE` se não for a 3000). Depois desfaça a regra de propósito: em `estadoDeCredito`, force `blocked_by_delay = false`; o roteiro tem de reprovar no passo 2; desfaça e rode de novo verde. Cole as três saídas no relatório.

- [ ] **Step 3: Manual**: em `ParteDeFiado`, uma terceira `Tarefa` "Limite, bloqueio e liberação" (para que serve; passos: o Financeiro define prazo e limite em Configurações ou na ficha; a venda fiado é recusada quando o cliente está vencido há mais de N dias ou passa do limite; o Gestor libera na ficha, para uma venda, até o fim do dia; problemas: "O Caixa não libera, e não digita a senha do gestor") com `<Figura id="fiado-credito" />`, e uma quarta "Cobrar fiado vencido" (a aba Cobrança da casa do Financeiro; o botão abre o WhatsApp do aparelho com o texto da conta; fica registrado quando cobrou) com `<Figura id="financeiro-cobranca" />`. Em `figuras.ts`, as duas figuras com legenda, alt e marcas. Em `manual-emporio.py`, `figura("fiado-credito", "dono", "/emporio/clientes/<id de um cliente da demonstração com fiado>", …)` e `figura("financeiro-cobranca", "dono", "/emporio/financeiro/cobranca", …)`; se a demonstração não tem fiado vencido, a Task 8 acrescenta um (coordene: a Task 8 roda antes do `manual-emporio`). Rode `npm run navegador -- manual-emporio`, guarde só as quatro PNGs novas e restaure as outras com `git checkout --`.

- [ ] **Step 4: `npm run check`, `npx tsc --noEmit`** e relatar.

---

### Task 8: docs, dívidas e demonstração

**Files:**
- Modify: `src/app/(public)/docs/api/endpoints.ts` (as seis rotas novas e os campos novos de `settings` e de `sales`)
- Modify: `docs/agents/dividas.md` (2.35 fechada: o "vencido" passou a ser o dia de SP nos dois lugares; dívida nova: "Pedir liberação" sem fila própria: hoje o Caixa avisa o Gestor fora do sistema e o Gestor libera na ficha; se a Agromax pedir, a liberação vira pedido com aviso ao Gestor)
- Modify: `docs/specs/module-39-meu-emporio.md` (na tabela de decisões, se Q219/Q223/Q224/Q225 têm coluna "entrega", marque a 2 como feita; senão, uma linha no histórico de entregas)
- Modify: `scripts/cenario-demonstracao-emporio.ts` (um cliente da demonstração com limite próprio e prazo, um fiado vencido há 20 dias com telefone, para o manual e para a demonstração)

- [ ] **Step 1: endpoints.ts** e `DATABASE_URL=... npm run test:docs-api` verde.
- [ ] **Step 2: dividas.md e a spec do módulo.**
- [ ] **Step 3: cenário de demonstração** rodando contra o Docker sem erro (`DATABASE_URL=... npx tsx scripts/cenario-demonstracao-emporio.ts` ou o comando que o arquivo documenta).
- [ ] **Step 4: `npm run check`** e relatar.

---

## Gates da entrega (depois da Task 8)

```
npm run check
npx tsc --noEmit
npm run lint
npm run build
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m99
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:isolation
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:all -- --sem-redis
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
npm run navegador -- emporio-financeiro-credito
npm run navegador -- manual-emporio
```

Esperado: 0 falhas; 0 erros; build ok; m99 verde; isolamento verde; `test:all` com as 98 de antes mais a m99; o diff vazio (ou só os dois `DROP INDEX` dos índices parciais); roteiros verdes.

Depois: juiz (`prova-juiz`, Opus) sobre o range `emporio-financeiro-1..HEAD` com a rubrica do contrato de missão (os seis critérios), e a onda final dos achados menores.

## Autoavaliação do plano (writing-plans)

- Cobertura da spec: Vencimento (Q223) → T1 (funções), T3 (venda, leitura, configurações); Limite (Q219, Q224) → T3 (campos, action), T4 (bloqueio); Bloqueio → T4; Liberação → T4 (action), T5 (ficha, balcão); Ficha de crédito → T3 (view), T5; Lista de cobrança (Q225) → T4 (action), T6 (aba), T3 (mensagem nas configurações); Consequências (migração, contrato, manual) → T1, T8, T7. Os nove casos de "Como entregar" da entrega 2 estão nas seções 3 a 6 da m99 (T2).
- Tipos: `RegraDePrazo` (T1) usada em T3 (`regraDePrazo`, `sugerirVencimento`, `due_rule` da `CreditoView`); `EstadoDeCredito` (T3) consumido por T4 (`prepararVenda`, cobrança); `CreditoView`/`CobrancaView` com os mesmos nomes em T2, T3, T4, T5, T6; `fiado_due_date` em `EntradaAberta` (T3) vem do `EmporioSalePayment.due_date` (fato do código, schema:1413).
- Review Focus: os cinco itens têm teste nomeado em T1, T3 e T4.
- Proporção: o plano fixa nomes, contratos e casos; corpos de função só onde a assinatura não decide (dia fixo do mês, telefone, bloqueio).
