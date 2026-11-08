# Financeiro do Empório, entrega 4: projeção, relatórios e rateio

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** quem opera o dinheiro vê o fluxo de caixa projetado em 30, 60 e 90 dias por semana (saldo de hoje, a receber, a pagar, saldo projetado), tem três relatórios (a receber por idade, a pagar por vencimento, posição de caixa por lugar), e a despesa fixa ganha três critérios automáticos de rateio (faturamento do mês anterior, área em m², funcionários) com a loja informando área e funcionários.

**Architecture:** só leitura nas duas primeiras frentes, uma migração só na terceira. A projeção e os relatórios vivem em dois arquivos novos de actions (`emporio-projecao.ts`, `emporio-relatorios-financeiro.ts`), somam o que já existe (`entradasAbertas`, `CardReceivable`, `EmporioCheck`, `listarContasAPagarAction`, `CashMovement`) por semana ou por faixa, e ganham rotas finas e duas abas na casa do financeiro. O rateio automático muda `emporio-despesas.ts`: `partesDoMes` passa a receber a base da loja (faturamento líquido do mês anterior, área ou funcionários), os critérios automáticos geram só a ocorrência do mês corrente, e um gatilho de leitura idempotente (`garantirOcorrenciasDoMes`) faz nascer a do mês seguinte no primeiro acesso daquele mês. `Establishment` ganha `area_m2` e `employees_count`.

**Tech Stack:** Next.js 16, Prisma 7 (Postgres), Zod 4, kit de UI próprio (`Table`, `Field`, `Select`, `MoneyInput`, `Badge`, `EmptyState`), suíte `tsx` em `scripts/`, roteiro de navegador em Python.

**Spec:** `docs/superpowers/specs/2026-11-07-emporio-financeiro-design.md`, seção "Entrega 4: projeção, relatórios e rateio" (Q228, Q235, Q236), mais "Como entregar" (casos da entrega 4) e "O que fica com o builder" (onde ficam os relatórios; como o gatilho de leitura se encaixa). A entrega 3 está na branch `emporio-financeiro-3`; esta nasce em `emporio-financeiro-4`, sobre ela.

## Global Constraints

- Sem travessão (U+2014) em código, doc, commit ou texto de tela.
- `tenant_id` nunca vem do client; toda query pelo client escopado. Esta entrega não cria model novo (só enum e colunas), então `TENANT_SCOPED_MODELS` não muda; `npm run test:isolation` continua verde.
- Saldo nunca gravado: o saldo de hoje, o saldo projetado, as faixas de idade e a posição por lugar são somas na leitura. A ocorrência de despesa fixa grava o valor por loja (como hoje); a base do rateio não é gravada em lugar nenhum.
- Regra de negócio em `src/lib/actions/*`; rota é wrapper fino com Zod via `apiErroDeZod` e `respostaDaAction`.
- Toda recusa com `fail(code, mensagem em português, status, field)`, `field` igual ao nome do campo da API usado no `ORDEM` da tela.
- Toda action de escrita do Empório chama `registrarNoHistorico` com chave de `ACOES_DO_HISTORICO` (conferência 19). O gatilho de leitura que faz nascer ocorrência também registra (`despesa.fixa`), com o leitor como ator e o resumo dizendo que foi automático.
- Dinheiro em centavos inteiros no servidor, em reais no contrato, no formato brasileiro na tela; nunca `<input type="number">`.
- "Hoje" é o dia de São Paulo (`hojeEmBrasilia()` de `src/lib/emporio/cartao.ts`, que devolve `Date`); meses por `src/lib/emporio/mes.ts` (`mesAtualEmBrasilia`, `somarMeses`, `primeiroDia`, `diaDoMes`).
- Suítes e cenários só com `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public"` inline. Subagente não commita.
- Nomes fixados por este plano: enum `FixedSplitKind` ganha `faturamento`, `area`, `funcionarios`; colunas `Establishment.area_m2 Decimal(10,2)?` e `Establishment.employees_count Int?`; funções puras em `src/lib/emporio/rateio.ts` e `src/lib/emporio/projecao.ts`; actions `lerFluxoProjetadoAction`, `lerAReceberPorIdadeAction`, `lerAPagarPorVencimentoAction`, `lerPosicaoPorLugarAction`, `garantirOcorrenciasDoMes`; códigos `CRITERIO_SEM_LOJAS`, `BASE_INVALIDA`; rótulos do Histórico "Área (m²)" e "Funcionários"; suíte `test:m101`; roteiro `emporio-financeiro-projecao`; cenário prefixo "Pro "; migração `20261108220000_emporio_financeiro_rateio_automatico`.

## Review Focus

1. Parcela de cartão com `expected_on` até hoje já está no saldo da conta (`saldosDasContas`); a projeção só pode somar as de `expected_on` depois de hoje, senão conta duas vezes. Teste na Task 4 ("cartão de hoje não entra na semana 1").
2. Mês da janela que já tem ocorrência de uma loja não pode receber também a estimativa do modelo para aquela loja. Teste na Task 4 ("mês com ocorrência não ganha estimativa").
3. Dois acessos simultâneos na virada do mês fazem nascer uma ocorrência só por modelo e loja (único `template_id, establishment_id, period` e `P2002` engolido). Teste na Task 3 ("gatilho em paralelo nasce uma vez").
4. Rateio por faturamento quando uma loja não vendeu no mês anterior: ela recebe zero e a view avisa; quando nenhuma vendeu, partes iguais com aviso (a despesa não some do Resultado). Teste na Task 3.
5. Editar um modelo automático recalcula só as ocorrências futuras não pagas que existem: a paga e a de mês passado ficam como estão. Teste na Task 3.

---

## Mapa de arquivos

| arquivo | responsabilidade | tarefa |
|---|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261108220000_emporio_financeiro_rateio_automatico/migration.sql` | enum e colunas novas | T1 |
| `src/lib/emporio/rateio.ts` (novo) | `ratearPorPeso`, `CRITERIOS_AUTOMATICOS`, `ehCriterioAutomatico`, `RATEIO_ROTULO_SERVIDOR` | T1 |
| `src/lib/emporio/projecao.ts` (novo) | `semanasDaJanela`, `faixaDeIdade`, `FAIXAS_DE_IDADE` | T1 |
| `src/lib/actions/emporio-catalogo.ts` | `area_m2` e `employees_count` na loja; permissão `dinheiro` só para esses dois campos; rótulos do Histórico | T1 |
| `src/app/api/v1/emporio/establishments/route.ts`, `[id]/route.ts` | Zod dos dois campos | T1 |
| `scripts/m101-emporio-financeiro-projecao.test.ts`, `package.json` | suíte da entrega, escrita da spec | T2 |
| `src/lib/actions/emporio-despesas.ts` | critérios automáticos: validação, base, nascimento só do mês corrente, gatilho, editar e renovar | T3 |
| `src/lib/actions/emporio-financeiro.ts`, `emporio-resultado.ts` | chamam `garantirOcorrenciasDoMes` na leitura; `ROTULO_ORIGEM` exportado; `faturamentoLiquidoDoMes` exportado | T3 |
| `src/app/api/v1/emporio/fixed-expenses/route.ts`, `[id]/route.ts` | Zod aceita os cinco critérios e `splits` opcional | T3 |
| `src/lib/actions/emporio-projecao.ts` (novo), `src/app/api/v1/emporio/finance/projection/route.ts` (novo) | fluxo projetado | T4 |
| `src/lib/actions/emporio-relatorios-financeiro.ts` (novo), `src/app/api/v1/emporio/finance/reports/receivables-aging/route.ts`, `payables-by-due/route.ts`, `cash-by-place/route.ts` (novos) | os três relatórios | T4 |
| `src/app/(dashboard)/emporio/_components/despesa-fixa-form.tsx`, `venda-rotulos.ts`, `emporio/despesas/page.tsx`, `_components/estabelecimento-form.tsx`, `emporio/estabelecimentos/page.tsx` | critérios na tela da despesa fixa; área e funcionários na loja | T5 |
| `src/app/(dashboard)/emporio/financeiro/projecao/page.tsx`, `financeiro/relatorios/page.tsx` (novos), `_components/financeiro-projecao.tsx`, `financeiro-relatorios.tsx` (novos), `financeiro-abas.tsx`, `emporio/relatorios/page.tsx` | as duas abas; a linha de ligação na página Relatórios | T6 |
| `scripts/_cenario-emporio-financeiro-projecao.ts`, `scripts/navegador/emporio-financeiro-projecao.py`, `scripts/navegador/manual-emporio.py`, manual (`_conteudo/*`), `public/manual/emporio/*.png` | prova viva e manual | T7 |
| `src/app/(public)/docs/api/endpoints.ts`, `docs/agents/dividas.md`, `docs/specs/module-39-meu-emporio.md`, `scripts/cenario-demonstracao-emporio.ts` | docs, dívidas, Q-table e demonstração | T8 |

---

### Task 1: schema, migração, funções puras e os dois campos da loja

**Files:**
- Modify: `prisma/schema.prisma` (enum `FixedSplitKind` em 311-315; `Establishment` em 752-811)
- Create: `prisma/migrations/20261108220000_emporio_financeiro_rateio_automatico/migration.sql`
- Create: `src/lib/emporio/rateio.ts`, `src/lib/emporio/projecao.ts`
- Modify: `src/lib/actions/emporio-catalogo.ts` (`EstablishmentInput` 187-201, `validarLoja` 204-266, `ROTULOS_LOJA` 268-282, `pegarLoja` 284-314, `editarEstabelecimentoAction` 366-430, `EstablishmentView` 96-113, `viewEstabelecimento` 134-153), `src/app/api/v1/emporio/establishments/route.ts`, `[id]/route.ts`

**Interfaces:**
- Produces (schema): `enum FixedSplitKind { percentual valor faturamento area funcionarios }`; `Establishment.area_m2 Decimal? @db.Decimal(10, 2)`, `Establishment.employees_count Int?`. A migração é `ALTER TYPE ... ADD VALUE` (três) e `ALTER TABLE "Establishment" ADD COLUMN` (duas); sem índice novo.
- Produces (`src/lib/emporio/rateio.ts`):
  - `export const CRITERIOS_AUTOMATICOS = ["faturamento", "area", "funcionarios"] as const; export type CriterioAutomatico = (typeof CRITERIOS_AUTOMATICOS)[number]; export type SplitKind = "percentual" | "valor" | CriterioAutomatico; export const ehCriterioAutomatico = (k: string): k is CriterioAutomatico => ...`.
  - `export function ratearPorPeso(totalCent: number, pesos: number[]): { partes: number[]; iguais: boolean }`: cada parte é `Math.floor(totalCent * peso / somaDosPesos)`; o resto dos centavos vai para a PRIMEIRA loja com peso maior que zero; peso zero recebe zero; se a soma dos pesos é zero, divide em partes iguais (resto na primeira) e devolve `iguais: true`. `totalCent` 0 ou lista vazia devolve partes vazias/zeros sem lançar.
  - `export const RATEIO_ROTULO_SERVIDOR: Record<SplitKind, string>` = percentual "Em percentual", valor "Em reais", faturamento "Proporcional ao faturamento", area "Por área (m²)", funcionarios "Por funcionários" (o Histórico e as mensagens usam este; a tela tem o seu em `venda-rotulos.ts`, igual).
- Produces (`src/lib/emporio/projecao.ts`):
  - `export type Semana = { numero: number; de: string; ate: string }` (dias "AAAA-MM-DD", inclusivos). `export function semanasDaJanela(hoje: Date, dias: 30 | 60 | 90): Semana[]`: a semana 1 vai de hoje a hoje+6; a seguinte começa no dia depois; a última termina em hoje+dias-1 (30 dias dá 5 semanas, a quinta com 2 dias; 60 dá 9; 90 dá 13).
  - `export const FAIXAS_DE_IDADE = ["em_dia", "1-15", "16-30", "30+"] as const; export type FaixaDeIdade = ...; export function faixaDeIdade(diasDeAtraso: number): FaixaDeIdade` (0 é `em_dia`; 1 a 15; 16 a 30; 31 em diante é `30+`).
- Produces (loja): `EstablishmentInput` e `EstablishmentView` ganham `area_m2: number | null` e `employees_count: number | null`; `validarLoja` recusa `area_m2` negativo ou acima de 999999.99 (422 `area_m2`, "Informe a área em m², de 0 a 999.999,99.") e `employees_count` negativo ou não inteiro (422 `employees_count`, "Informe o número de funcionários, inteiro, de 0 em diante."); nulo limpa. `ROTULOS_LOJA` ganha "Área (m²)" e "Funcionários". `editarEstabelecimentoAction`: a permissão fica `gestor_da_loja` como hoje, MAS quem passa em `dinheiro` e não em `gestor_da_loja` (o Financeiro) pode editar quando o patch só tem `area_m2` e/ou `employees_count` (qualquer outro campo presente: a recusa de `gestor_da_loja` de hoje). Zod das duas rotas: `area_m2: z.number().min(0).max(999999.99).nullish()`, `employees_count: z.number().int().min(0).nullish()`.

- [ ] **Step 1: Testes das funções puras** (bloco temporário `if (require.main === module)` que a T2 absorve): `ratearPorPeso(10000, [3, 1])` dá `[7500, 2500]`; `ratearPorPeso(10001, [1, 1, 1])` dá `[3335, 3333, 3333]`; `ratearPorPeso(10000, [0, 2])` dá `[0, 10000]`; `ratearPorPeso(10000, [0, 0])` dá `[5000, 5000]` com `iguais: true`; `semanasDaJanela(2026-11-08, 30)` dá 5 semanas, a primeira 08 a 14/11 e a última 06 a 07/12; `faixaDeIdade(0)` em_dia, `(15)` 1-15, `(16)` 16-30, `(31)` 30+.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar os dois módulos.**
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Schema e migração.** `migrate diff` (URL do Docker inline), conferir que o SQL não traz o `DROP INDEX` dos dois índices parciais, salvar, `npm run db:deploy` (URL inline), `npx prisma generate`; `migrate diff` de novo devolve `-- This is an empty migration.`.
- [ ] **Step 6: A loja:** input, view, validação, permissão condicional, rótulos, Zod. `npm run test:m82` ou a suíte que cobre `editarEstabelecimentoAction` (confira no `package.json`) verde.
- [ ] **Step 7: Gates.** `npm run check`, `npx tsc --noEmit`, `npm run lint`, `npm run test:isolation` (URL inline).
- [ ] **Step 8: Commit.**

### Task 2: a suíte m101, escrita da spec

**Files:**
- Create: `scripts/m101-emporio-financeiro-projecao.test.ts`
- Modify: `package.json` (`"test:m101": "tsx scripts/m101-emporio-financeiro-projecao.test.ts"`)

**Interfaces:**
- Consumes: o cabeçalho e os auxiliares da m100 (`montar`, `chamar`, `R`, `check`, `rodar`, `comBanco`, `config`, `abrirTurnoDeTeste`, `papelFinanceiro`), `V.venderAction`, `Cx.criarContaAction`, `Cx.saldoInicialCaixaAction`, `criarDespesaFixaAction`, `criarCompraAction` (conta a pagar com `due_date`), e os contratos de API desta entrega (seção "Contratos"). A suíte é escrita da spec e deste plano, sem ler a implementação; rotas que ainda não existem fazem seções ficarem vermelhas até a T4, e isso é esperado.
- Produces: `npm run test:m101` com as seções: (1) funções puras (`ratearPorPeso`, `semanasDaJanela`, `faixaDeIdade`); (2) loja: Financeiro grava área e funcionários (200) e não grava o nome (403); Vendedor 403; área negativa 422 `area_m2`; funcionários 2,5 422 `employees_count`; Histórico `estabelecimento.editar` com "Área (m²)"; (3) rateio: modelo `faturamento` de R$ 1.000,00 com duas lojas que venderam 300 e 100 no mês anterior (vendas com `sold_at` no mês anterior, uma devolução na loja 1) nasce só a ocorrência do mês corrente, 750/250 (a devolução entra na base), e a `DespesaFixaView` traz `months_ahead` 1 e as partes; modelo `area` com lojas 60 m² e 40 m² dá 600/400; modelo `funcionarios` com 3 e 1 dá 750/250; loja sem área recebe zero e `avisos` cita a loja; nenhuma loja com base dá partes iguais com aviso; `percentual` e `valor` continuam nascendo 12 meses; `garantirOcorrenciasDoMes(db, ator, mesSeguinte)` faz nascer a do mês seguinte uma vez (chamar duas vezes em paralelo: uma ocorrência por loja), com a base daquele momento; editar o modelo automático (valor 1.000 para 2.000) recalcula a ocorrência futura não paga e não toca a paga; encerrar cancela as futuras; o Resultado da Loja do mês corrente soma a ocorrência da loja pelo vencimento, igual a um modelo `valor` com a mesma parte; critério automático por quem não tem todas as lojas no alcance (Gestor de uma loja) é 403 `CRITERIO_SEM_LOJAS`; (4) projeção: saldo de hoje igual a `total_balance` do Hoje; fiado vencido e parcela de acordo vencida caem na semana 1; fiado que vence em 20 dias cai na semana 3; cartão com `expected_on` hoje NÃO entra (já está no saldo) e com `expected_on` em 10 dias entra na semana 2; cheque `recebido` com `good_for` em 40 dias entra na semana 6 do período de 60 e não aparece no de 30; conta a pagar que vence em 8 dias cai na semana 2; a ocorrência de despesa fixa que ainda não nasceu (modelo `faturamento`, mês seguinte) entra como estimativa (`estimated: true`) na semana do vencimento, e o mês que já tem ocorrência não ganha estimativa; o saldo projetado de cada semana é o anterior mais recebimentos menos pagamentos; `days` fora de 30/60/90 é 422 `days`; Vendedor 403; (5) relatórios: a receber por idade com quatro clientes, um por faixa (em dia, 10, 20 e 45 dias de atraso), totais por faixa e por cliente; a pagar por vencimento agrupa por semana e por nome, vencido marcado; posição por lugar lista gaveta, gerência e conta com saldo e o movimento do período por origem (`pagamento_despesa`, `venda`, `cartao`); filtro por loja recorta; Vendedor 403; (6) isolamento: a projeção e os relatórios de uma conta não enxergam a outra.

- [ ] **Step 1: Escrever a suíte** com os contratos abaixo.
- [ ] **Step 2: Rodar** (URL inline): a seção 1 verde; o resto vermelho por rota ou função inexistente. Registrar quais.
- [ ] **Step 3: `npm run check`** verde.
- [ ] **Step 4: Commit.**

### Task 3: o rateio automático (actions e rotas)

**Files:**
- Modify: `src/lib/actions/emporio-despesas.ts` (`validarFixa` 479-537, `partesDoMes` 539-560, `criarOcorrencia` 580-609, `criarDespesaFixaAction` 655-708, `editarDespesaFixaAction` 712-879, `renovarDespesaFixaAction` 933-980, `viewsDasFixas` 397-433, `DespesaFixaView` 372-389), `src/lib/actions/emporio-resultado.ts` (`margemDaJanela` 103-186: extrair o faturamento líquido), `src/lib/actions/emporio-financeiro.ts` (`lerResumoHojeAction` chama o gatilho), `src/app/api/v1/emporio/fixed-expenses/route.ts`, `[id]/route.ts`

**Interfaces:**
- Consumes: `ratearPorPeso`, `ehCriterioAutomatico`, `RATEIO_ROTULO_SERVIDOR` (T1); `mesAtualEmBrasilia`, `somarMeses`, `primeiroDia`, `diaDoMes`, `inicioDoMesInstante` (`src/lib/emporio/mes.ts`); `transacaoLonga`; `registrarNoHistorico`.
- Produces:
  - `export async function faturamentoLiquidoDoMes(db, lojaId: string, mes: MesCivil): Promise<number>` em `emporio-resultado.ts` (centavos: `net_amount` das vendas `concluida` com `sold_at` no mês menos as devoluções `returned_at` no mês, a mesma soma de `margemDaJanela`, que passa a chamá-la).
  - `DespesaFixaView.split_kind: SplitKind`; `splits` continua sendo `{ establishment_id, establishment_name, value }[]` e, para critério automático, traz as lojas participantes com `value` = a parte em reais da ocorrência do mês corrente (ou da estimativa com a base de agora quando ela ainda não nasceu); a view ganha `base_label: string | null` ("Faturamento de outubro/2026", "Área (m²)", "Funcionários") e `avisos: string[]` ("Loja Centro sem faturamento em outubro/2026: recebeu zero." ou "Nenhuma loja tem base: dividida em partes iguais.").
  - `validarFixa`: `split_kind` aceita os cinco valores (422 `split_kind` "Escolha como dividir entre as lojas." para outro); para critério automático, `splits` é ignorado (pode vir vazio ou ausente) e as lojas participantes são TODAS as lojas não arquivadas da conta; quem não tem todas as lojas no alcance (Gestor com vínculo) recebe `fail("CRITERIO_SEM_LOJAS", "O rateio automático divide entre todas as lojas. Só quem vê todas as lojas pode usá-lo.", 403, "split_kind")`.
  - `async function basesDasLojas(db, kind: CriterioAutomatico, lojas: { id, name, area_m2, employees_count }[], mes: MesCivil): Promise<{ pesos: number[]; base_label: string; semBase: string[] }>`: `faturamento` usa `faturamentoLiquidoDoMes(db, loja, somarMeses(mes, -1))` por loja; `area` usa `area_m2` em centésimos; `funcionarios` usa `employees_count`. `partesDoMes` ganha a variante `partesAutomaticas(totalCent, pesos)` sobre `ratearPorPeso`.
  - Nascimento: em `criarDespesaFixaAction`, critério automático gera só a ocorrência do mês `max(starts_on, mês atual)` e só se esse mês é o atual (futuro: nada nasce até chegar); `percentual` e `valor` seguem em lote de `MESES_GERADOS`. `criarOcorrencia` não muda.
  - `export async function garantirOcorrenciasDoMes(db: TenantPrismaClient, ator: Ator, mes: MesCivil = mesAtualEmBrasilia()): Promise<number>`: para cada modelo automático não encerrado com `starts_on <= mes`, para cada loja participante sem ocorrência em `mes`, calcula a base e cria a ocorrência dentro de `transacaoLonga`; `P2002` é engolido (outro leitor chegou antes); registra UMA linha `despesa.fixa` por modelo que nasceu ("A ocorrência de novembro/2026 do Aluguel nasceu pelo rateio proporcional ao faturamento: Loja Centro R$ 750,00, Loja Rodovia R$ 250,00", `changes` por loja); devolve quantas nasceram. É chamada no começo de `listarDespesasFixasAction`, `listarContasAPagarAction`, `lerResumoHojeAction`, `resultadoDaLojaAction` (via `lerVisao`) e `lerFluxoProjetadoAction` (T4), sempre com o mês atual; nunca lança (erro vai para `console.warn` e a leitura segue).
  - `editarDespesaFixaAction` com critério automático (antes ou depois da edição): recalcula com a base de agora só as ocorrências futuras não pagas que EXISTEM (a do mês corrente e, se já nasceu, a do seguinte), com as mesmas regras de hoje para a paga, a cancelada à mão e a loja que saiu (uma loja arquivada sai do rateio). Trocar de `percentual`/`valor` para automático cancela as ocorrências futuras não pagas além do mês corrente (`NOTA_SAIU_DO_RATEIO` reaproveitada com texto próprio, `NOTA_VIROU_AUTOMATICO = "Rateio passou a automático"`); trocar de automático para `percentual`/`valor` completa os 12 meses como `renovar` faz.
  - `renovarDespesaFixaAction` em modelo automático devolve `ok` com `created: 0` depois de garantir o mês corrente (não há o que renovar: a view já não marca `needs_renewal` para automático).
  - Zod das rotas: `split_kind: z.enum(["percentual", "valor", "faturamento", "area", "funcionarios"], { error: "Escolha como dividir entre as lojas." })`, `splits: z.array(splitDaDespesaSchema).optional()` (a action exige quando o critério é manual, com a mensagem de hoje).

- [ ] **Step 1: Rodar a m101 e anotar os vermelhos da seção 3.**
- [ ] **Step 2: `faturamentoLiquidoDoMes`** extraída (m84 e m83 verdes: `DATABASE_URL=... npm run test:m83`, `test:m84`).
- [ ] **Step 3: Validação, bases, nascimento do mês corrente, view.**
- [ ] **Step 4: `garantirOcorrenciasDoMes`** e as chamadas nas leituras.
- [ ] **Step 5: Editar, encerrar, renovar com critério automático.**
- [ ] **Step 6: As rotas.**
- [ ] **Step 7: m101 seções 2 e 3 verdes; m83, m84, m98, m100 verdes.** Gates.
- [ ] **Step 8: Commit.**

### Task 4: projeção e relatórios (actions e rotas)

**Files:**
- Create: `src/lib/actions/emporio-projecao.ts`, `src/lib/actions/emporio-relatorios-financeiro.ts`, `src/app/api/v1/emporio/finance/projection/route.ts`, `src/app/api/v1/emporio/finance/reports/receivables-aging/route.ts`, `reports/payables-by-due/route.ts`, `reports/cash-by-place/route.ts`
- Modify: `src/lib/actions/emporio-financeiro.ts` (exportar `ROTULO_ORIGEM` e a leitura das posições em função reaproveitável)

**Interfaces:**
- Consumes: `entradasAbertas(db, where, opts)` (caixa:91, `effective_due_date`, `open_cent`, `emporio_customer_id`, `establishment_id`), `saldosDasContas`, `saldoDaGaveta`, `saldoDaGerencia` (caixa:496-548), `listarContasAPagarAction` (despesas:1135, `FiltroDeContasAPagar` com `de`/`ate`), `garantirOcorrenciasDoMes`, `basesDasLojas`/`partesAutomaticas` (T3, exportadas para a estimativa), `semanasDaJanela`, `faixaDeIdade`, `diasDeAtraso` (`src/lib/emporio/fiado.ts:15`), `lojasDoAtor`, `exigir(db, ator, "dinheiro")`.
- Produces (`emporio-projecao.ts`):
  - `lerFluxoProjetadoAction(db, ator, input: { establishment_id?: string; days: 30 | 60 | 90 }): Promise<ActionResult<FluxoProjetadoView>>`: exige `dinheiro`; `days` fora dos três valores é 422 `days`; chama `garantirOcorrenciasDoMes`.
  - `FluxoProjetadoView = { today: string; days: 30 | 60 | 90; establishment_id: string | null; opening_balance: number; weeks: SemanaProjetadaView[]; closing_balance: number; notes: string[] }`; `SemanaProjetadaView = { numero; de; ate; receivables: { fiado: number; cards: number; checks: number; total: number }; payables: { entries: number; fixed_estimated: number; total: number }; net: number; closing_balance: number }`.
  - Regras: `opening_balance` com todas as lojas é a soma de todas as posições (gavetas, gerências e contas), igual a `HojeView.total_balance`; com `establishment_id`, é gaveta mais gerência DAQUELA loja, e `notes` diz "A conta bancária é da rede inteira e só entra em Todas as lojas." (decisão minha). A receber: `entradasAbertas` (fiado e parcelas) pelo `effective_due_date`; `CardReceivable` com `canceled_at: null` e `expected_on` DEPOIS de hoje pelo `expected_on` (as de hoje para trás já estão no saldo); `EmporioCheck` `recebido` ou `depositado` pelo `good_for`; o que venceu (ou `good_for` até hoje) cai na semana 1. A pagar: `listarContasAPagarAction` `status pending` com `ate` = fim da janela (o vencido cai na semana 1); mais a estimativa das ocorrências de modelos automáticos para os meses da janela em que a loja ainda não tem ocorrência (base de agora, `fixed_estimated`), e `notes` ganha "Despesas fixas com rateio automático dos meses seguintes são estimativa com a base de hoje." quando houver alguma. Recebível ou conta com vencimento depois da janela não entra. `closing_balance` da semana n = da semana n-1 (ou `opening_balance`) + `receivables.total` - `payables.total`.
  - Rota: `GET /api/v1/emporio/finance/projection?establishment_id=&days=` (`days` padrão 30; Zod `z.coerce.number().pipe(z.union([z.literal(30), z.literal(60), z.literal(90)]))` com mensagem "Escolha 30, 60 ou 90 dias.").
- Produces (`emporio-relatorios-financeiro.ts`), todas exigindo `dinheiro` e recortando por `lojasDoAtor`:
  - `lerAReceberPorIdadeAction(db, ator, { establishment_id?: string }): Promise<ActionResult<AReceberPorIdadeView>>`; `AReceberPorIdadeView = { today; customers: { customer_id; customer_name; phone; em_dia; "1-15"; "16-30"; "30+"; total }[]; totals: { em_dia; "1-15"; "16-30"; "30+"; total } }`: fiado e parcelas de acordo (`entradasAbertas`), por `diasDeAtraso(effective_due_date, hoje)` e `faixaDeIdade`; ordena pelo total decrescente. É um retrato de hoje: não tem filtro de período (decisão minha: idade de atraso só faz sentido em relação a hoje).
  - `lerAPagarPorVencimentoAction(db, ator, { establishment_id?: string; de: Date; ate: Date }): Promise<ActionResult<APagarPorVencimentoView>>`; período de até 366 dias (422 `ate`); `APagarPorVencimentoView = { de; ate; weeks: { de; ate; total; overdue: boolean; items: { name; total }[] }[]; by_name: { name; total; overdue_total }[]; overdue_total; total }`: contas `pending` do Empório (`listarContasAPagarAction` com `de`, `ate`, `limit: 500`), semanas de 7 dias a partir de `de`, `name` é o nome da conta (`ContaAPagarView.name`: a despesa fixa, a regra ou o fornecedor); `overdue` quando o `due_date` é antes de hoje.
  - `lerPosicaoPorLugarAction(db, ator, { establishment_id?: string; de: Date; ate: Date }): Promise<ActionResult<PosicaoPorLugarView>>`; `PosicaoPorLugarView = { de; ate; places: { kind: "gaveta" | "gerencia" | "conta"; id; name; establishment_id; balance; period: { entradas; saidas; by_origin: { origin; label; entradas; saidas }[] } }[]; total_balance }`: os lugares como `lerResumoHojeAction` monta (gavetas e gerências das lojas do alcance; contas só sem filtro de loja, pela mesma razão da projeção); o movimento do período soma `CashMovement` por `origin` e `direction` no lugar, e nas contas soma também as parcelas de cartão com `expected_on` no período como origem `cartao` ("Cartão"). `ROTULO_ORIGEM` de `emporio-financeiro.ts` passa a ser exportado e ganha `cartao`.
  - Rotas: `GET /api/v1/emporio/finance/reports/receivables-aging?establishment_id=`, `GET .../reports/payables-by-due?establishment_id=&de=&ate=`, `GET .../reports/cash-by-place?establishment_id=&de=&ate=` (`de`/`ate` "AAAA-MM-DD" pelo `diaIso` da rota do extrato; padrão: de hoje a hoje+30 no a pagar, dos últimos 30 dias a hoje na posição).

- [ ] **Step 1: Rodar a m101 e anotar os vermelhos das seções 4 e 5.**
- [ ] **Step 2: A projeção** (action e rota).
- [ ] **Step 3: Os três relatórios** (actions e rotas).
- [ ] **Step 4: m101 inteira verde; m98 e m100 verdes.** Gates.
- [ ] **Step 5: Commit.**

### Task 5: as telas do rateio e da loja

**Files:**
- Modify: `src/app/(dashboard)/emporio/_components/despesa-fixa-form.tsx` (`ORDEM` 25, `tipo` 72, `Field` "Dividir entre as lojas" 264-286, splits 288-331, validação 91-113), `venda-rotulos.ts` (`RATEIO_ROTULO` 63-66), `src/app/(dashboard)/emporio/despesas/page.tsx` (coluna Rateio 175-179, Badge Renovar 184-188), `_components/estabelecimento-form.tsx` (`LojaParaForm` 23-38, `ORDEM` 43-57), `emporio/estabelecimentos/page.tsx`

**Interfaces:**
- Consumes: `DespesaFixaView.split_kind`, `.splits`, `.base_label`, `.avisos`, `.needs_renewal`; `EstablishmentView.area_m2`, `.employees_count`; as rotas `POST/PATCH fixed-expenses` e `PATCH establishments/:id`.
- Produces:
  - `RATEIO_ROTULO` ganha as três opções com os mesmos textos de `RATEIO_ROTULO_SERVIDOR`. No formulário, com critério automático escolhido, o bloco "Parte de cada loja" some e entra o texto "Dividida entre todas as lojas ativas. Base: faturamento do mês anterior (ou área em m², ou funcionários) de cada loja, calculada quando a conta do mês nasce." e, ao editar um modelo que já tem partes calculadas, a lista das lojas com a parte do mês (só leitura). O envio manda `splits: []` para automático. A recusa `CRITERIO_SEM_LOJAS` aparece no campo `split_kind`.
  - Página Despesas: a coluna Rateio mostra o rótulo e, por loja, a parte do mês (`reaisBr`) para automático; `avisos` saem em texto de aviso abaixo (role="status"); o Badge "Renovar" não aparece para critério automático (a view já não marca).
  - Formulário da loja: campos "Área (m²)" (`MoneyInput` ou `Input` com `inputMode="decimal"` e máscara brasileira; `ORDEM` ganha `area_m2`) e "Funcionários" (`Input` com `inputMode="numeric"`; `ORDEM` ganha `employees_count`), com hint "Usados no rateio automático das despesas fixas." Na página de estabelecimentos, o Financeiro (que não passa em `gestor_da_loja`) vê o botão de editar e o formulário com só esses dois campos habilitados (os outros desabilitados), porque a action só aceita esses dois dele.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Gates** (check pega `<input type="number">`, cor crua, dinheiro fora do formato, `Field` sem `error`), tsc, lint.
- [ ] **Step 3: Commit.**

### Task 6: as telas da projeção e dos relatórios

**Files:**
- Create: `src/app/(dashboard)/emporio/financeiro/projecao/page.tsx`, `financeiro/relatorios/page.tsx`, `_components/financeiro-projecao.tsx`, `_components/financeiro-relatorios.tsx`
- Modify: `_components/financeiro-abas.tsx` (`ABAS`), `src/app/(dashboard)/emporio/relatorios/page.tsx` (uma linha de ligação)

**Interfaces:**
- Consumes: `lerFluxoProjetadoAction`, as três actions de relatório, `FinanceiroAbas`/`enderecoDaAba`, `LojaFiltro`, o `<form method="get">` de período de `ExtratoPeriodo`/`RelatoriosFiltro` como modelo, `reaisBr`.
- Produces:
  - `ABAS` ganha `{ href: "/emporio/financeiro/projecao", rotulo: "Projeção" }` e `{ href: "/emporio/financeiro/relatorios", rotulo: "Relatórios" }` depois de "Aprovações" (a barra de abas rola na horizontal no celular, sem rolagem da página).
  - `/emporio/financeiro/projecao?loja=&dias=30|60|90`: título "Financeiro: fluxo projetado", `LojaFiltro`, três botões-link "30 dias", "60 dias", "90 dias" (o atual marcado com `aria-current`), a linha "Saldo de hoje: R$ X" e a tabela por semana (colunas Semana, A receber, A pagar, Saldo ao fim), com o detalhe de a receber (fiado, cartão, cheque) e a pagar (contas, fixas estimadas com a marca "estimativa") em linha menor sob cada total; `notes` em texto abaixo da tabela; a última linha em destaque. Só leitura.
  - `/emporio/financeiro/relatorios?loja=&de=&ate=`: título "Financeiro: relatórios", `LojaFiltro`, `<form method="get">` de período (padrão: hoje a hoje+30 para a pagar; a posição mostra os últimos 30 dias até hoje quando `de`/`ate` vêm vazios), três blocos com `<h2>`: "A receber por idade" (tabela cliente x faixas, totais no rodapé, a linha diz "retrato de hoje"), "A pagar por vencimento" (tabela por semana, vencido com `Badge` "Vencido", e a lista por nome), "Posição de caixa por lugar" (tabela lugar, saldo, entradas e saídas do período, com o detalhe por origem). `EmptyState` em cada bloco vazio.
  - `emporio/relatorios/page.tsx` ganha a linha "Os relatórios do dinheiro (a receber por idade, a pagar por vencimento, posição de caixa) estão no Financeiro." com link para `/emporio/financeiro/relatorios`, só para quem `pode(papel, "dinheiro")`.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Gates.**
- [ ] **Step 3: Commit.**

### Task 7: prova viva: cenário, roteiro nos dois sentidos e manual

**Files:**
- Create: `scripts/_cenario-emporio-financeiro-projecao.ts` (prefixo "Pro "), `scripts/navegador/emporio-financeiro-projecao.py`
- Modify: `scripts/navegador/manual-emporio.py`, `src/app/(dashboard)/manual/_conteudo/figuras.ts`, `partes-tarefa-2.tsx` (despesas) e `partes-tarefa-3.tsx` (casa do financeiro), `indice.ts` se precisar
- Create: `public/manual/emporio/financeiro-projecao*.png`, `financeiro-relatorios*.png`, `despesa-rateio-automatico*.png`

**Interfaces:**
- Consumes: `_lib.py`, o cenário e o roteiro da entrega 3 como modelo (inclusive a lição: o roteiro NÃO supõe a conta do seed vazia; filtra pelo prefixo "Pro " e clica no botão do cartão certo), `figura(...)` do `manual-emporio.py` (com `rolar=` quando a marca fica abaixo da dobra), o dev server (porta 3002 do worktree `D:/Projetos/tibe-wt2`, `TIBE_BASE="http://localhost:3002"`, `npx prisma generate` no worktree ANTES de subir).
- Produces: cenário na conta do seed com lojas "Pro Loja 1" (80 m², 3 funcionários) e "Pro Loja 2" (sem área, 1 funcionário), usuários "Pro Financeiro" e "Pro Gestor" (só da Loja 1), conta "Pro Banco" com saldo, vendas concluídas no mês anterior (Loja 1 R$ 300,00, Loja 2 R$ 100,00), cliente "Pro Devedor" com fiado vencido há 20 dias e outro que vence em 20 dias, uma venda no cartão com parcela daqui a 10 dias, um cheque com `good_for` daqui a 40 dias, fornecedor "Pro Fornecedor" com conta de R$ 200,00 daqui a 8 dias. Roteiro: (1) o Financeiro grava área e funcionários da Pro Loja 2 pela tela da loja (e o Pro Gestor recebe 403 ao criar modelo `faturamento` pela API); (2) o Financeiro cria a despesa fixa "Pro Aluguel" de R$ 1.000,00 por faturamento: a lista mostra 750/250 e só o mês corrente gerado; muda para área: 1.000/0 com o aviso da Loja 2 sem área; (3) a aba Projeção em 30 dias mostra o saldo de hoje, o fiado vencido na semana 1, a conta de R$ 200,00 na semana 2, o cartão na semana 2, e em 60 dias o cheque aparece na semana 6; (4) a aba Relatórios: o Pro Devedor na faixa 16-30 e em dia, a conta de R$ 200,00 na semana certa, a Pro Banco na posição por lugar; (5) a 390 px: Projeção e Relatórios sem rolagem horizontal. Prova nos dois sentidos: com `ratearPorPeso` devolvendo partes iguais sempre (sabotagem em `rateio.ts`), o roteiro reprova no passo 2 (750/250 vira 500/500); restaurar nos dois clones. Manual: tarefas "Ver o fluxo projetado" e "Relatórios do dinheiro" (parte da casa do financeiro) e "Rateio automático da despesa fixa" (parte das despesas), figuras `financeiro-projecao`, `financeiro-relatorios`, `despesa-rateio-automatico`.

- [ ] **Step 1: Cenário e roteiro; rodar até 0 falhas.**
- [ ] **Step 2: Sabotar `rateio.ts`, rodar, ver reprovar; restaurar; rodar, 0 falhas.**
- [ ] **Step 3: Manual: texto, figuras, `FIGURAS=financeiro-projecao,financeiro-relatorios,despesa-rateio-automatico npm run navegador -- manual-emporio` (antes, `--limpar` nos cenários Cred, Fin, Aco e Pro e o cenário de demonstração montado).**
- [ ] **Step 4: Commit.**

### Task 8: docs, dívidas, spec do módulo e demonstração

**Files:**
- Modify: `src/app/(public)/docs/api/endpoints.ts`, `docs/agents/dividas.md`, `docs/specs/module-39-meu-emporio.md`, `docs/superpowers/specs/2026-11-07-emporio-financeiro-design.md` (nota das decisões), `scripts/cenario-demonstracao-emporio.ts`

- [ ] **Step 1: `/docs/api`:** as quatro rotas novas e os campos novos da loja e da despesa fixa, com exemplos reais; `npm run test:docs-api` verde.
- [ ] **Step 2: Dívidas:** a 2.29 fica (fiado descontado por expectativa); novas: gráfico do fluxo projetado (hoje é tabela); relatórios em PDF ou planilha; a conta bancária na projeção por loja (hoje só em Todas as lojas); rateio por faturamento quando a loja é nova (sem mês anterior: zero); a ocorrência automática só nasce no acesso (sem job): quem não abre o Empório no mês não tem a conta até abrir.
- [ ] **Step 3: Spec do módulo:** parágrafo da entrega 4 na seção do financeiro e as decisões do agente a confirmar com o usuário: Q239 (relatórios na casa do financeiro, não em Relatórios), Q240 (critério automático divide entre TODAS as lojas ativas e exige ver todas as lojas), Q241 (a receber por idade é retrato de hoje, sem período), Q242 (por loja, a projeção e a posição deixam a conta bancária de fora).
- [ ] **Step 4: Demonstração:** a Loja Centro com 120 m² e 4 funcionários, a Rodovia com 80 m² e 2; a "Energia elétrica" passa a `faturamento` (mantendo o Aluguel em `valor`), para o manual mostrar a parte calculada.
- [ ] **Step 5: Gates e commit.**

---

## Contratos de API desta entrega (a T2 escreve a suíte daqui)

| método e rota | quem | corpo ou query | resposta |
|---|---|---|---|
| `PATCH /api/v1/emporio/establishments/:id` | gestor_da_loja; `dinheiro` só com `area_m2` e/ou `employees_count` | `{ area_m2?: number \| null, employees_count?: number \| null, ... }` | 200 `EstablishmentView` com os dois campos; 422 `area_m2` / `employees_count`; 403 do Financeiro com outro campo |
| `POST /api/v1/emporio/fixed-expenses`, `PATCH .../:id` | gestor_da_loja ou dinheiro; automático só com todas as lojas | `split_kind` em cinco valores; `splits` opcional para automático | 201/200 `DespesaFixaView` com `base_label`, `avisos`, `months_ahead` 1 para automático; 403 `CRITERIO_SEM_LOJAS` (campo `split_kind`) |
| `GET /api/v1/emporio/finance/projection?establishment_id=&days=` | dinheiro | `days` 30, 60 ou 90 (padrão 30) | 200 `FluxoProjetadoView`; 422 `days` |
| `GET /api/v1/emporio/finance/reports/receivables-aging?establishment_id=` | dinheiro | | 200 `AReceberPorIdadeView` |
| `GET /api/v1/emporio/finance/reports/payables-by-due?establishment_id=&de=&ate=` | dinheiro | `de`/`ate` AAAA-MM-DD, até 366 dias | 200 `APagarPorVencimentoView`; 422 `ate` |
| `GET /api/v1/emporio/finance/reports/cash-by-place?establishment_id=&de=&ate=` | dinheiro | idem | 200 `PosicaoPorLugarView` |
| `GET /api/v1/emporio/fixed-expenses` | (existente) | | a leitura faz nascer a ocorrência do mês corrente dos modelos automáticos (`garantirOcorrenciasDoMes`) |

## Gates da entrega (depois da Task 8)

`npm run check`; `npx tsc --noEmit`; `npm run lint`; `npm run build`; `test:m101`; `test:isolation`; `test:all -- --sem-redis` (nenhuma suíte a menos que antes: 101); `migrate diff` vazio; roteiro `emporio-financeiro-projecao` nos dois sentidos; juiz Opus com os seis critérios; `manual-emporio`; relatório de evidências; handoff.

## Autoavaliação do plano (writing-plans)

1. **Cobertura da spec.** Fluxo projetado: por loja ou todas, 30/60/90 por semana (T4, T6); saldo de hoje (T4); a receber de fiado e parcelas pelo `due_date` efetivo, cartão pelo `expected_on`, cheque pelo `good_for`, vencido na semana 1 (T4); a pagar pelas entries pendentes e as fixas que ainda não nasceram, calculadas sem criar (T4, com `basesDasLojas` da T3); saldo projetado só leitura (T4, T6). Relatórios: os três, com filtro por loja e período (T4, T6; a idade é retrato de hoje, decisão registrada na T8), o Resultado não muda (T3 prova). Rateio: enum (T1), área e funcionários na loja por `gestor_da_loja` ou `dinheiro` (T1, T5), cálculo quando a ocorrência nasce com a base do mês anterior (T3), zero com aviso (T3, T5), centavo na primeira (T1), só o mês corrente nos automáticos e o seguinte pelo gatilho de leitura (T3), editar recalcula só as futuras não pagas (T3), a projeção estima e avisa (T4), sem `FixedExpenseSplit` nos automáticos (T3). Consequências: migração (T1), rotas (T1, T3, T4), manual (T7).
2. **Passos.** Cada passo decide uma coisa; os corpos ficam com o implementador; assinaturas, códigos e textos em Interfaces.
3. **Tipos.** `SplitKind`, `CriterioAutomatico`, `DespesaFixaView` (`base_label`, `avisos`), `FluxoProjetadoView`, `SemanaProjetadaView`, `AReceberPorIdadeView`, `APagarPorVencimentoView`, `PosicaoPorLugarView`, `EstablishmentView` (`area_m2`, `employees_count`) com os mesmos nomes nas T2 a T7.
4. **Review Focus.** Os cinco têm teste na tarefa dona (T4, T4, T3, T3, T3), listados na T2.
5. **Proporção.** O plano é menor que a seção da spec mais o código que descreve; sem transcrição de corpo.

Decisões minhas, registradas aqui, no ledger quando a execução começar e na Q-table pela T8: os relatórios ficam na casa do financeiro, com uma linha de ligação na página Relatórios; o critério automático divide entre todas as lojas ativas (sem `FixedExpenseSplit`) e por isso exige ver todas as lojas; a base zero em todas as lojas vira partes iguais com aviso (a despesa não some do Resultado); por loja, a projeção e a posição por lugar deixam a conta bancária de fora, com nota; a receber por idade é retrato de hoje; o gatilho de leitura roda nas cinco leituras do dinheiro e nunca derruba a leitura; `renovar` em modelo automático é inócuo; a tabela substitui o gráfico (dívida).
