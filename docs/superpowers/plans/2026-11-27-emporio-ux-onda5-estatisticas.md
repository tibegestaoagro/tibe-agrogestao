# Onda 5 da UX do Empório: Estatísticas, os números num lugar só

> **Para agentes:** execute com a skill `orquestrar-ondas` (subagentes por time, a sessão principal commita) ou `superpowers:subagent-driven-development`. Os passos usam caixas (`- [ ]`) para acompanhar.

**Objetivo:** juntar Relatórios, Relatórios do dinheiro, Resultado e Projeção numa tela só, **Estatísticas** (`/emporio/estatisticas`), com:
- um filtro de período e loja no topo;
- cinco abas: Visão geral · Vendas · Dinheiro · Resultado · Relatórios para imprimir;
- a comparação com o mês anterior;
- a folha e a planilha para os relatórios de Vendas e de Resultado.

Os quatro endereços antigos passam a redirecionar.

**Arquitetura:**
- Os blocos que já existem mudam de lugar, e a regra de cada um não muda.
- No servidor entram três leituras novas, todas aditivas:
  - `por_dia` no relatório de vendas;
  - `compararVendasAction`, a comparação com o mês anterior;
  - `resultadoPorLojaAction`, o resultado do mês loja por loja, dentro do alcance de quem pede.

  Cada uma tem a sua rota.
- As planilhas novas usam o mesmo `gerarCsv` e `respostaCsv` das que já existem. As folhas novas usam a mesma página de impressão e o mesmo estilo A4.
- As regras pequenas vão para um arquivo puro, testado pela suíte `m134`: o período da tela, o mês anterior, o texto da comparação, a aba da URL, o endereço novo de cada endereço antigo, o dia do ponto de equilíbrio e a soma dos resultados.

Não há migração.

**Stack:** Next.js 16 (App Router), React 19, componentes do Empório, Recharts (os gráficos que já existem), roteiros Python em `scripts/navegador/`.

**Spec:** [2026-11-24-emporio-ux-design.md](../specs/2026-11-24-emporio-ux-design.md), §5.10 (Q396), §5.11 (Q397), §6 ("Na onda 5, Estatísticas deixa de ser grupo e vira item"), §7, §8. Mockup: `docs/superpowers/specs/mockups/2026-11-24-emporio-ux/estatisticas.html`.

## Restrições globais

- **Invariantes do `CLAUDE.md`:**
  - tenant escopado (1);
  - sem travessão (4);
  - sem heredoc com escape (5);
  - regra de negócio só em `src/lib/actions/` (6);
  - merge e push na `main` só com autorização na conversa (7);
  - suíte verde não é validação (8).
- **Ordem de entrega:** action, depois rota, só então tela (T1 e T2 antes de T4 a T6).
- **"O Caixa não vê."** Cada aba e cada cartão mantém a permissão do bloco de origem:
  - Vendas e Resultado: `gestor_da_loja` ou `dinheiro`;
  - Dinheiro: `dinheiro`.

  Nenhuma action existente muda de permissão.
- **Alcance de lojas:** "quem só alcança algumas lojas (`lojasDoAtor`) vê só elas, e 'Todas' quer dizer 'todas as minhas lojas'". Vale para a Visão geral, as abas, as planilhas e as folhas.
- **"Nenhum link salvo, do manual ou do e-mail, caia em página vazia"** (§5.11).
- **CSV no formato das que já existem:** `;`, vírgula decimal, data DD/MM/AAAA (`src/lib/csv.ts`).
- **O que não muda:**
  - kit e tokens (`components/ui/`, `globals.css`);
  - nada em `prisma/`;
  - o manual (onda 7). O texto defasado dele vai para a lista da onda 7, no handoff.
- **Nada se escreve na conta Da Mata.**
- **`npm run check` limpo.** Isso inclui:
  - a conferência 20: título pelo `CabecalhoDaTela`, com o (i);
  - a conferência do dinheiro no formato brasileiro.

## Decisões de quem constrói (o desenho deixa abertas)

Estas são minhas, como planejador. Vão ao usuário junto com o plano.

1. **Endereço e abas.**
   - A tela é `/emporio/estatisticas`, com `?aba=`: `geral` (padrão), `vendas`, `dinheiro`, `resultado` e `imprimir`.
   - Aba sem permissão, ou com valor desconhecido, cai em `geral`.
   - A aba Dinheiro só aparece com `dinheiro`.
2. **O filtro do topo.**
   - Atalhos de período: `Hoje · 7 dias · Este mês · Mês passado · Escolher datas`, gravados em `?de=&ate=`. "7 dias" vai de hoje menos 6 a hoje.
   - Loja: `?loja=`. Sem o parâmetro, vale "Todas as minhas lojas". O seletor só aparece com mais de uma loja ao alcance.
   - Período padrão: Este mês, do dia 1 ao último dia, como o `periodoDaUrl` já faz.
   - Período inválido, `de` depois de `ate`, ou mais de 366 dias (o limite do relatório de vendas) volta a Este mês com o aviso "Período inválido. Mostrando este mês.".
   - "Esta semana" sai **só desta tela**. As outras telas continuam com o `PeriodoFiltro` de hoje.
3. **O que obedece ao período, aba por aba.**
   - **Vendas:** todos os blocos.
   - **Resultado:** é por mês, e usa **o mês da data final** do período. "Mês passado" mostra o mês passado; Hoje, 7 dias e Este mês mostram o mês corrente. Se o período pega mais de um mês, a aba diz "O resultado é por mês: mostrando <mês>.".
   - **Dinheiro:**
     - Posição de caixa segue o período;
     - A receber por idade, A pagar por vencimento e Fluxo projetado olham de hoje para a frente e ignoram o período. Cada um diz isso no seu (i);
     - A pagar mostra os próximos 30 dias;
     - o Fluxo mantém os botões 30, 60 e 90 dias (`?dias=`).

   **Troca a avisar:** hoje, os Relatórios do dinheiro deixam escolher datas para o A pagar. Na tela nova, ele fica nos próximos 30 dias.
4. **Visão geral: três cartões, cada um com "Ver vendas ›", "Ver dinheiro ›" ou "Ver resultado ›"**, que leva à aba com o mesmo filtro.
   - **Vendas** (`gestor_da_loja` ou `dinheiro`):
     - o total do período, sem as devoluções, como a aba Vendas;
     - "8% acima de outubro, no mesmo período", "abaixo de" ou "igual a". Sem venda no período anterior: "Sem vendas em outubro, no mesmo período";
     - barras por dia;
     - "Produto que mais vendeu" (o maior total);
     - "Melhor vendedor" (o maior total, sem contar "Sem vendedor");
     - "Produtos parados no período" (quantidade).
   - **Dinheiro** (só `dinheiro`):
     - "em caixa e nas contas agora": o saldo de hoje do fluxo projetado (`opening_balance`);
     - "A receber" (`totals.total` do a receber por idade);
     - "dos quais vencido": a soma das faixas `1-15`, `16-30` e `30+`;
     - "A pagar nos próximos 30 dias" (`total` do a pagar de hoje a hoje mais 30);
     - "Saldo previsto em 30 dias" (`closing_balance` do fluxo de 30 dias).
   - **Resultado** (`gestor_da_loja` ou `dinheiro`), do mês da decisão 3:
     - "R$ X de resultado em <mês>, margem de Y%", com `result` e `margin_pct`, os mesmos números da aba Resultado;
     - ponto de equilíbrio: "atingido no dia N", "faltam R$ X" ou a mensagem de `break_even.message`;
     - resultado de cada loja, quando houver mais de uma;
     - "Vendas com margem negativa" (quantidade).

   **Troca a avisar:** o mockup diz "lucro" e calcula a margem como lucro sobre vendas. Usei "resultado" e a margem que a tela Resultado já mostra, para os dois lugares não darem números diferentes.
5. **Resultado com "Todas" para quem alcança só algumas lojas.**
   - A action de hoje recusa `all` para essa pessoa.
   - A aba mostra a soma das lojas dela (vendas, margem, despesas fixas e resultado) e a tabela "Loja por loja". Os números vêm de `resultadoPorLojaAction`.
   - A aba diz ainda: "Escolha uma loja para ver o mês detalhado (ponto de equilíbrio, acompanhamento e custo do cartão)."
   - Quem alcança todas as lojas continua vendo a visão somada de hoje (`all`).
6. **Relatórios para imprimir**, por assunto. Cada um tem "Imprimir ou PDF" (nova aba) e "Planilha":
   - **Vendas** (novos):
     - Curva ABC de produtos (a medida da tela; lucro só para quem pode ver o lucro);
     - Vendas por vendedor;
     - Produtos parados.
   - **Dinheiro** (os quatro que existem):
     - A receber por idade;
     - A pagar por vencimento;
     - Posição de caixa;
     - Fluxo projetado.
   - **Resultado** (novo): Resultado do mês por loja, com as colunas Loja, Vendas, Margem, Despesas fixas, Perdas e Resultado.

   **Troca a avisar:** o mockup diz "vendas, custo, despesas e lucro". O custo sozinho não existe na visão por loja, e a margem já o desconta.

   Todos usam o período e a loja do topo, com a regra da decisão 3.
7. **Os endereços antigos redirecionam:**

   | antigo | novo |
   |---|---|
   | `/emporio/relatorios?de&ate&loja&abc&medida` | `/emporio/estatisticas?aba=vendas`, com os mesmos parâmetros |
   | `/emporio/resultado?loja&mes` | `?aba=resultado&de=<dia 1 do mês>&ate=<último dia do mês>`, mais `loja` (o `all` vira sem loja) |
   | `/emporio/financeiro/relatorios?loja&de&ate` | `?aba=dinheiro`, com os mesmos parâmetros |
   | `/emporio/financeiro/projecao?loja&dias` | `?aba=dinheiro`, com os mesmos parâmetros |

   As folhas `/emporio/imprimir/relatorio/<tipo>` e as rotas `/api/v1/...` que existem não mudam de endereço.
8. **Menu e Início.**
   - O grupo "Estatísticas" vira o item "Estatísticas", com `["gestor_da_loja","dinheiro"]`.
   - Saem do menu Relatórios, Resultado, Projeção e "Relatórios do dinheiro" (o provisório da onda 4).
   - O atalho "Estatísticas" do Início aponta para `/emporio/estatisticas`.
   - No `paginas.ts`, `/emporio/relatorios` e `/emporio/resultado` saem, e `/emporio/estatisticas` entra.
9. **A barra por dia** (`por_dia`) é a venda concluída no dia dela, menos a devolução no dia dela. A soma de `por_dia` é igual ao total do período. O dia é o calendário de Brasília.
10. **A folha Curva ABC** respeita a mesma regra do lucro da tela: sem `podeVerLucroAction`, sai por faturamento.

## Review Focus

1. **Quem alcança uma loja só abre a Visão geral com "Todas":** vê só a loja dela, nos três cartões e nas planilhas, sem 403 e sem a outra loja (T1, caso no `m134`; T7, passo do Gestor).
2. **O Gestor sem Dinheiro abre `?aba=dinheiro`:** cai na Visão geral, sem o cartão Dinheiro. A rota do CSV do dinheiro continua recusando (T4, T7).
3. **O mês anterior com dia que não existe:** 31/03 volta para 28/02 ou 29/02, e não para 03/03 (T1, `periodoDoMesAnterior`).
4. **`/emporio/resultado?mes=2026-02&loja=all`, um link salvo:** abre a aba Resultado de fevereiro, com Todas (T1, `enderecoDaEstatistica`; T7).
5. **Período de 400 dias pela URL:** volta a Este mês com o aviso, e não dá erro 422 cru na tela (T1, `periodoDasEstatisticas`; T7).

---

## Arquivos e quem faz o quê

| tarefa | agente | arquivos | depende de |
|---|---|---|---|
| T1 leituras e regras puras | `servidor-acao` | `src/lib/emporio/estatisticas.ts` (novo), `src/lib/actions/emporio-relatorios.ts`, `src/lib/actions/emporio-resultado.ts`, `scripts/m134-emporio-estatisticas.test.ts` (novo), `package.json` | nenhuma |
| T2 rotas e planilhas | `servidor-acao` | `src/app/api/v1/emporio/reports/sales/route.ts`, `src/app/api/v1/emporio/reports/sales/comparison/route.ts` (novo), `src/app/api/v1/emporio/reports/abc/route.ts`, `src/app/api/v1/emporio/result/stores/route.ts` (novo), `src/lib/emporio/csv-estatisticas.ts` (novo), `scripts/m134-emporio-estatisticas.test.ts`, o registro do `/docs/api` que o `test:docs-api` confere | T1 |
| T3 folhas para imprimir | `tela-pagina` | `src/app/(impressao)/emporio/imprimir/relatorio/[tipo]/page.tsx`, `src/components/emporio/impresso/relatorio-financeiro-a4.tsx`, `src/components/emporio/impresso/relatorio-estatisticas-a4.tsx` (novo) | T1 |
| T4 a tela, o filtro, as abas, o menu e os redirecionamentos | `tela-pagina` | `src/app/(dashboard)/emporio/estatisticas/page.tsx` (novo), `_components/estatisticas-filtro.tsx` (novo), `_components/estatisticas-vendas.tsx` (novo), `_components/estatisticas-dinheiro.tsx` (novo), `_components/estatisticas-resultado.tsx` (novo), `relatorios/page.tsx`, `resultado/page.tsx`, `financeiro/relatorios/page.tsx`, `financeiro/projecao/page.tsx`, `_components/relatorios-filtro.tsx` e `_components/resultado-filtro.tsx` (apagar), `_components/relatorios-blocos.tsx`, `relatorios/_components/curva-abc.tsx`, `_components/financeiro-relatorios.tsx`, `_components/financeiro-projecao.tsx`, `_components/resultado-*.tsx`, `src/app/(dashboard)/emporio/page.tsx`, `src/lib/emporio/paginas.ts`, `src/lib/emporio/menu.ts`, `scripts/m130-emporio-menu-agrupado.test.ts`, `scripts/m133-emporio-dinheiro.test.ts`, `scripts/nav-build.test.ts` | T1 e T2 |
| T5 Visão geral | `tela-pagina` | `_components/estatisticas-visao-geral.tsx` (novo), `estatisticas/page.tsx` | T4 |
| T6 Relatórios para imprimir | `tela-pagina` | `_components/estatisticas-imprimir.tsx` (novo), `estatisticas/page.tsx` | T3 e T5 |
| T7 cenário e roteiro | `prova-viva` | `scripts/_cenario-emporio-ux-onda5.ts` (novo), `scripts/navegador/emporio-ux-onda5.py` (novo) | T6 |
| T8 fim de onda | sessão principal e `prova-viva` | os roteiros `emporio-*` que o `textos-defasados` e a passada apontarem | T7 e o juiz |

`_components/` é `src/app/(dashboard)/emporio/_components/`.

**Ondas:**
1. T1;
2. T2;
3. T3 e T4, em paralelo (os arquivos não se cruzam);
4. T5;
5. T6;
6. T7;
7. juiz (`prova-juiz`, do commit do plano até o T7);
8. T8.

---

### T1: leituras e regras puras

**Arquivos:** os da tabela.

**Interfaces que produz:**
```ts
// src/lib/emporio/estatisticas.ts (puro, sem banco)
export type AbaDaEstatistica = "geral" | "vendas" | "dinheiro" | "resultado" | "imprimir";
export function abaDaEstatistica(v: string | undefined, podeDinheiro: boolean): AbaDaEstatistica;
export type PeriodoDasEstatisticas = { de: string; ate: string; invalido: boolean };
export function periodoDasEstatisticas(sp: { de?: string; ate?: string }, hoje: Date): PeriodoDasEstatisticas;
export function atalhosDasEstatisticas(hoje: Date): { id: "hoje" | "7dias" | "mes" | "mes_passado"; rotulo: string; de: string; ate: string }[];
export function periodoDoMesAnterior(de: string, ate: string): { de: string; ate: string };
export function textoDaComparacao(atualCent: number, anteriorCent: number, deAnterior: string, ateAnterior: string): string;
export function mesDoPeriodo(ate: string): string; // "AAAA-MM"
export function periodoPegaMaisDeUmMes(de: string, ate: string): boolean;
export function diaDoEquilibrio(dias: { date: string; cumulative: number | null }[], ponto: number | null): number | null;
export function somarResultados(lojas: { sales: number; margin: number; fixed_expenses: number; losses: number; result: number }[]): { sales: number; margin: number; margin_pct: number | null; fixed_expenses: number; losses: number; result: number };
export function enderecoDaEstatistica(antigo: "/emporio/relatorios" | "/emporio/resultado" | "/emporio/financeiro/relatorios" | "/emporio/financeiro/projecao", sp: Record<string, string | undefined>): string;
```
```ts
// src/lib/actions/emporio-relatorios.ts
// RelatorioDeVendas ganha (aditivo):
por_dia: { date: string; total: number }[]; // todo dia do período, zero incluído
export type ComparacaoDeVendas = { atual: { from: string; to: string; total: number }; anterior: { from: string; to: string; total: number }; variacao_pct: number | null };
export async function compararVendasAction(db: TenantPrismaClient, ator: Ator, input: RelatorioDeVendasInput): Promise<ActionResult<ComparacaoDeVendas>>;
```
```ts
// src/lib/actions/emporio-resultado.ts
export type ResultadoPorLojaView = { month: string; lojas: LojaDoResultadoView[]; total: ReturnType<typeof somarResultados> };
export async function resultadoPorLojaAction(db: TenantPrismaClient, ator: Ator, input: { month: string; establishment_id?: string }): Promise<ActionResult<ResultadoPorLojaView>>;
```

**Regras:**
- `compararVendasAction` usa a mesma permissão e o mesmo `carregarVendasDoPeriodo` do `relatorioDeVendasAction`, sem as devoluções, nos dois períodos. A `variacao_pct` vem do `variacaoDoMes` de `src/lib/emporio/inicio.ts`.
- `resultadoPorLojaAction` passa pelo `lerVisao`, com a mesma permissão.
  - Quem alcança todas as lojas e não manda loja: `resultadoDaLojaAction` com `all`, devolvendo os `stores`.
  - Quem alcança algumas lojas: uma chamada por loja ao alcance, cada uma no formato `LojaDoResultadoView`.
  - Com `establishment_id`: só aquela loja, se estiver no alcance. Fora dele, a mesma recusa de hoje.
- `textoDaComparacao`: "N% acima de <mês>, no mesmo período", "N% abaixo de <mês>, no mesmo período", "Igual a <mês>, no mesmo período" ou "Sem vendas em <mês>, no mesmo período".
  - `<mês>` é o nome do mês de `deAnterior`, em minúsculas.
  - Se `deAnterior` e `ateAnterior` caem em meses diferentes, troca "<mês>" por "o mês anterior".

- [ ] **Passo 1: escrever o `m134` com os casos puros** (falham sem o arquivo):
  - `periodoDoMesAnterior("2026-11-01","2026-11-27")` dá `{de:"2026-10-01", ate:"2026-10-27"}`;
  - `("2026-03-31","2026-03-31")` dá `{de:"2026-02-28", ate:"2026-02-28"}`;
  - `("2028-03-29","2028-03-31")` dá `{de:"2028-02-29", ate:"2028-02-29"}`;
  - `("2026-01-01","2026-01-31")` dá `{de:"2025-12-01", ate:"2025-12-31"}`;
  - `textoDaComparacao(108_00, 100_00, "2026-10-01","2026-10-27")` dá `"8% acima de outubro, no mesmo período"`; `(90_00, 100_00, ...)` dá `"10% abaixo de outubro, no mesmo período"`; `(100_00, 0, ...)` dá `"Sem vendas em outubro, no mesmo período"`;
  - `periodoDasEstatisticas({de:"2026-01-01", ate:"2027-02-05"}, hoje)` dá `invalido: true` e Este mês; `({de:"2026-11-10", ate:"2026-11-01"})` também; `({})` dá Este mês com `invalido: false`;
  - `atalhosDasEstatisticas` com hoje = 27/11/2026: os rótulos são `["Hoje","7 dias","Este mês","Mês passado"]`, e 7 dias vai de `2026-11-21` a `2026-11-27`;
  - `abaDaEstatistica("dinheiro", false)` dá `"geral"`; `("xyz", true)` dá `"geral"`; `("imprimir", false)` dá `"imprimir"`;
  - `diaDoEquilibrio([{date:"2026-11-01",cumulative:50},{date:"2026-11-02",cumulative:120}], 100)` dá `2`; com o ponto `null`, dá `null`; sem dia que chegue, dá `null`;
  - `somarResultados` de duas lojas soma vendas, margem, despesas fixas, perdas e resultado. `margin_pct` é a margem total sobre as vendas totais, com 1 casa (`null` sem vendas);
  - `enderecoDaEstatistica`:
    - `("/emporio/resultado", {mes:"2026-02", loja:"all"})` dá `"/emporio/estatisticas?aba=resultado&de=2026-02-01&ate=2026-02-28"`;
    - `("/emporio/relatorios", {de:"2026-11-01", ate:"2026-11-10", loja:"L1", abc:"clientes", medida:"lucro"})` mantém os cinco parâmetros com `aba=vendas`;
    - `("/emporio/financeiro/projecao", {dias:"60", loja:"L1"})` dá `aba=dinheiro&loja=L1&dias=60`;
    - `mes` inválido é ignorado.
- [ ] **Passo 2:** rodar `npm run test:m134` (com as URLs locais do `CLAUDE.md`) e ver FALHAR.
- [ ] **Passo 3:** implementar `src/lib/emporio/estatisticas.ts`. Registrar `test:m134` no `package.json`.
- [ ] **Passo 4: casos com banco no `m134`** (dois tenants, como as outras suítes do Empório):
  - a soma do `por_dia` é igual a `por_loja` somado, com uma devolução no meio do período;
  - um dia sem venda aparece com zero;
  - `compararVendasAction` dá `anterior.total` igual ao das vendas plantadas no mês anterior, e `variacao_pct` certa;
  - `resultadoPorLojaAction` para um gestor de uma loja só, sem loja, devolve só a loja dele. Para o dono, devolve as duas, e o total é igual à soma;
  - o Caixa recebe 403 nas duas actions novas;
  - o tenant B não vê as vendas do A.
- [ ] **Passo 5:** implementar as três mudanças de action e rodar `test:m134`, `test:m105`, `test:m124` e `test:m131` (todas verdes).
- [ ] **Passo 6:** a sessão principal commita: "Onda 5 da UX do Empório (T1): leituras das Estatísticas".

### T2: rotas e planilhas

**Interfaces que consome:** as do T1.

**Interfaces que produz:**
- `GET /api/v1/emporio/reports/sales/comparison?from&to&establishment_id`, que devolve `ComparacaoDeVendas`.
- `GET /api/v1/emporio/reports/sales?...&format=csv&relatorio=vendedores|parados`, que devolve CSV. Sem `format`, o JSON de hoje (já com `por_dia`).
- `GET /api/v1/emporio/reports/abc?...&format=csv`, que devolve CSV com as colunas Classe, Nome, Valor, % e % acumulado.
- `GET /api/v1/emporio/result/stores?month&establishment_id&format=csv`, que devolve JSON (`ResultadoPorLojaView`) ou CSV (Loja, Vendas, Margem, Despesas fixas, Perdas, Resultado, mais a linha Total).
- `src/lib/emporio/csv-estatisticas.ts`: `csvDosVendedores(r: RelatorioDeVendas)`, `csvDosParados(r: RelatorioDeVendas)`, `csvDaCurvaAbc(c: CurvaAbc)` e `csvDoResultadoPorLoja(v: ResultadoPorLojaView)`, todas com `gerarCsv`.
- Nomes de arquivo (`respostaCsv`): `vendas-por-vendedor`, `produtos-parados`, `curva-abc`, `resultado-por-loja`.

- [ ] **Passo 1: no `m134`, chamar cada rota com um `Request` construído**, como o `m105` faz. Conferir:
  - o cabeçalho `text/csv`;
  - a primeira linha com os títulos;
  - "1.234,50" com vírgula;
  - a data DD/MM/AAAA;
  - 401 sem sessão;
  - 403 para o Caixa;
  - o tenant B sem as linhas do A.
- [ ] **Passo 2:** ver FALHAR.
- [ ] **Passo 3:** implementar. As rotas são finas (invariante 6). Registrar as duas rotas novas onde o `test:docs-api` confere.
- [ ] **Passo 4:** `test:m134`, `test:m105`, `test:docs-api` e `test:isolation` verdes.
- [ ] **Passo 5:** commit: "Onda 5 da UX do Empório (T2): rotas e planilhas de Vendas e Resultado".

### T3: folhas para imprimir

**Interfaces que consome:** `relatorioDeVendasAction`, `curvaAbcAction`, `podeVerLucroAction` e `resultadoPorLojaAction`.

**O que faz:**
- `[tipo]/page.tsx` ganha os tipos `curva-abc`, `vendedores`, `parados` e `resultado`, além dos quatro de hoje.
- **Permissão por tipo:**
  - os quatro do dinheiro continuam exigindo `veAPagina(papel, "/emporio/financeiro")`;
  - os novos exigem `veAPagina(papel, "/emporio/estatisticas")`;
  - sem permissão, `notFound()`, como hoje.
- **Parâmetros:**
  - os novos de Vendas leem `de`, `ate`, `loja` e (só a ABC) `medida`;
  - o `resultado` lê `mes` (`AAAA-MM`) e `loja`.
- **Estilo:** `relatorio-financeiro-a4.tsx` exporta o CSS A4 (hoje é uma constante interna), e `relatorio-estatisticas-a4.tsx` usa o mesmo CSS. Títulos:
  - "Curva ABC de produtos";
  - "Vendas por vendedor";
  - "Produtos parados";
  - "Resultado do mês por loja".

  O topo diz o período (ou o mês) e a loja ("Todas as minhas lojas" sem loja).

- [ ] **Passo 1:** implementar.
- [ ] **Passo 2:** `npx tsc --noEmit` e `npm run check` limpos.
- [ ] **Passo 3:** abrir as quatro folhas no `next dev` (Chrome de testes), com o dono e com um gestor, e com o Caixa (que recebe 404).
- [ ] **Passo 4:** commit: "Onda 5 da UX do Empório (T3): folhas de Vendas e Resultado".

### T4: a tela, o filtro, as abas, o menu e os redirecionamentos

**Interfaces que consome:**
- as do T1: `abaDaEstatistica`, `periodoDasEstatisticas`, `atalhosDasEstatisticas`, `mesDoPeriodo`, `periodoPegaMaisDeUmMes`, `somarResultados`, `enderecoDaEstatistica`, `resultadoPorLojaAction`;
- `AbasDaTela({rotulo, abas, atual})`, de `_components/abas-da-tela.tsx`.

**O que faz:**
- **`estatisticas/page.tsx`:**
  - `CabecalhoDaTela` com o título "Estatísticas" e o (i), sem caminho (é item do menu);
  - `veAPagina(papel, "/emporio/estatisticas")`, e senão `redirect("/emporio")`;
  - o filtro;
  - `AbasDaTela` com o rótulo "Abas das Estatísticas" e os rótulos "Visão geral", "Vendas", "Dinheiro", "Resultado" e "Relatórios para imprimir";
  - só a aba aberta busca dados;
  - o link de cada aba preserva `de`, `ate` e `loja`.
- **`estatisticas-filtro.tsx`:**
  - os chips de `atalhosDasEstatisticas`, com o mesmo estilo do `PeriodoFiltro` (copie as classes `CHIP*`);
  - "Escolher datas" com De e Até (formulário GET);
  - o Select de loja com "Todas as minhas lojas";
  - preserva a `aba`;
  - com `invalido`, mostra o aviso da decisão 2.
- **`estatisticas-vendas.tsx`:** os blocos de hoje da tela Relatórios (`RelatoriosBlocos` e `CurvaAbcSecao`), na mesma ordem. Os links internos da Curva ABC (`abc`, `medida`) passam a apontar para `/emporio/estatisticas?aba=vendas&...`.
- **`estatisticas-dinheiro.tsx`** (só com `dinheiro`), nesta ordem:
  1. A receber por idade;
  2. A pagar por vencimento (de hoje a hoje mais 30);
  3. Posição de caixa por lugar (no período);
  4. Fluxo projetado (os botões 30, 60 e 90 apontam para `?aba=dinheiro&dias=`).

  O (i) de cada bloco que ignora o período diz "Olha de hoje para a frente e não usa o período escolhido.". Os botões de planilha e de impressão que já existem continuam junto de cada bloco.
- **`estatisticas-resultado.tsx`:** os componentes `resultado-*` de hoje, com o mês de `mesDoPeriodo(ate)`.
  - Uma loja: o mês detalhado.
  - "Todas" e quem alcança todas: a visão `all` de hoje.
  - "Todas" e quem alcança algumas lojas: a decisão 5.
  - Mais de um mês no período: o aviso da decisão 3.
- **As quatro páginas antigas** viram `redirect(enderecoDaEstatistica(...))`, como `despesas/page.tsx` fez na onda 4.
- **Arquivos que somem:** `relatorios-filtro.tsx` e `resultado-filtro.tsx`. O `localStorage` da loja do balcão deixa de valer no Resultado (a loja vem da URL).
- **Menu, `paginas.ts` e Início:** como a decisão 8. Ajustar `m130`, `m133` e `nav-build`:
  - o dono e o gestor têm o item "Estatísticas";
  - o vendedor e o Caixa, não;
  - não sobra nenhum dos quatro itens antigos.
- **Placeholders:** as abas Visão geral e Relatórios para imprimir ficam com um `EmptyState` provisório ("Em construção"), trocado no T5 e no T6, que são da mesma onda.

- [ ] **Passo 1:** ajustar `m130`, `m133` e `nav-build` para o menu novo, e ver FALHAR.
- [ ] **Passo 2:** implementar.
- [ ] **Passo 3:** `test:m130`, `test:m133`, `test:nav`, `tsc` e `npm run check` limpos.
- [ ] **Passo 4:** no `next dev`, abrir os quatro endereços antigos e conferir que caem na aba certa.
- [ ] **Passo 5:** commit: "Onda 5 da UX do Empório (T4): a tela Estatísticas, com Vendas, Dinheiro e Resultado".

### T5: Visão geral

**Interfaces que consome:**
- `compararVendasAction`, `relatorioDeVendasAction` (`por_dia`, `por_produto`, `por_vendedor`, `parados`);
- `lerAReceberPorIdadeAction`, `lerAPagarPorVencimentoAction`, `lerFluxoProjetadoAction` (dias 30);
- `resultadoDaLojaAction` ou `resultadoPorLojaAction` (decisão 5), `vendasComMargemNegativaAction`;
- `textoDaComparacao`, `diaDoEquilibrio`.

**O que faz:** os três cartões da decisão 4, numa grade (uma coluna no celular, três a partir de `lg`).
- Cada cartão só busca dados se a pessoa pode vê-lo.
- As barras por dia usam Recharts, como o `acompanhamento-grafico`.
- O dinheiro sai em `reaisBr`.

- [ ] **Passo 1:** implementar `estatisticas-visao-geral.tsx` e tirar o placeholder.
- [ ] **Passo 2:** `tsc` e `npm run check` limpos.
- [ ] **Passo 3:** no `next dev`, conferir os números com a aba de origem, com o dono, o gestor e o financeiro, a 1280 e a 390 px.
- [ ] **Passo 4:** commit: "Onda 5 da UX do Empório (T5): Visão geral".

### T6: Relatórios para imprimir

**O que faz:** a lista da decisão 6, em três seções (Vendas, Dinheiro e Resultado), cada uma só para quem pode.
- Cada relatório é uma linha: o título, uma frase (as do mockup) e os dois botões.
- **"Imprimir ou PDF"** abre `/emporio/imprimir/relatorio/<tipo>?...` em nova aba.
- **"Planilha"** baixa da rota do T2 ou da rota de hoje.
- **Os parâmetros:**
  - Vendas leva `de`, `ate`, `loja` e, na ABC, a `medida`;
  - Dinheiro leva a regra da decisão 3;
  - Resultado leva `mes` e `loja`.

  A montagem dos endereços é o mesmo `consulta` do `relatorio-acoes.tsx`.

- [ ] **Passo 1:** implementar `estatisticas-imprimir.tsx` e tirar o placeholder.
- [ ] **Passo 2:** `tsc` e `npm run check` limpos.
- [ ] **Passo 3:** no `next dev`, baixar as oito planilhas e abrir as oito folhas com o dono. Com o gestor, só as de Vendas e de Resultado.
- [ ] **Passo 4:** commit: "Onda 5 da UX do Empório (T6): Relatórios para imprimir".

### T7: cenário e roteiro `emporio-ux-onda5`

**Arquivos:** `scripts/_cenario-emporio-ux-onda5.ts` (prefixo "U5 ", travado por `exigirBancoLocal()`) e `scripts/navegador/emporio-ux-onda5.py` (cabeçalho com o cenário e as sessões: dono, gestor de uma loja só, financeiro e caixa).

**Cenário:**
- duas lojas;
- vendas no mês corrente e no mesmo trecho do mês anterior, com totais redondos para a comparação ("X% acima de ...");
- uma devolução;
- um produto parado;
- um vendedor que vende mais;
- uma venda com margem negativa;
- fiado vencido e a vencer;
- uma conta a pagar nos próximos 30 dias.

**Passos que o roteiro confere:**
1. **Menu:** o dono e o gestor têm o item "Estatísticas", e nenhum dos quatro antigos. O Caixa, abrindo `/emporio/estatisticas`, volta a `/emporio`.
2. **Dono, Visão geral:**
   - os três cartões;
   - o total de vendas igual ao da aba Vendas;
   - o texto da comparação exato;
   - o melhor vendedor e o produto do cenário;
   - "dos quais vencido" igual ao do fiado vencido.
3. **Filtro:**
   - "Mês passado" muda o total e põe o Resultado no mês passado;
   - "7 dias" grava `de` e `ate` certos;
   - a loja preserva a aba;
   - `?de=2025-01-01&ate=2026-11-27` mostra o aviso e Este mês.
4. **Gestor de uma loja:**
   - sem a aba Dinheiro nem o cartão Dinheiro;
   - `?aba=dinheiro` cai na Visão geral;
   - os números só da loja dele;
   - em Resultado com "Todas", a soma e "Loja por loja" só com a loja dele (ou o mês detalhado, se ele só tem uma loja).
5. **Endereços antigos:** os quatro da decisão 7, incluindo `/emporio/resultado?mes=<mês passado>&loja=all`, caem na aba e no período certos.
6. **Relatórios para imprimir:**
   - os oito com o dono e os quatro com o gestor;
   - a folha "Vendas por vendedor" abre com o vendedor do cenário;
   - a planilha começa com a linha de títulos e usa vírgula decimal (lida pelo `fetch` na página).
7. **Celular (390 px):** a Visão geral e as abas sem rolagem lateral.
8. **Fotos** (só com `TIBE_FOTOS`): Visão geral, Vendas, Dinheiro, Resultado e Imprimir, a 1280 e a 390 px.

- [ ] **Passo 1:** escrever o cenário e o roteiro. Rodar até ficar verde.
- [ ] **Passo 2: provar nos dois sentidos, plantando três defeitos**, um por vez, e vendo o roteiro FALHAR:
  - (a) `abaDaEstatistica` aceitando `dinheiro` sem permissão;
  - (b) a comparação sem descontar a devolução;
  - (c) o redirecionamento do `/emporio/resultado` perdendo o `mes`.

  Desfazer cada um.
- [ ] **Passo 3:** a sessão principal commita: "Onda 5 da UX do Empório (T7): cenário e roteiro emporio-ux-onda5".

### Juiz

`prova-juiz` com a spec (§5.10, §5.11, §6) e o range do commit do plano até o T7. Os achados importantes são corrigidos e commitados antes do T8.

### T8: fim de onda (rotina do `orquestrar-ondas`, seção 3)

- [ ] `npm run textos-defasados`. Corrigir os roteiros e as suítes para a tela nova, conferindo no desenho que a mudança foi intencional. O manual vai para a lista da onda 7.
- [ ] Rodar todos os roteiros `emporio-*`, cada um com o seu cenário, com o `next dev` de `--disable-source-maps` e `--max-old-space-size=4096`. Os vermelhos são corrigidos, ou entram no relatório com a causa.
- [ ] `test:all` com as URLs locais.
- [ ] Atualizar `docs/agents/current-handoff.md` (a onda 5 na branch, as decisões e a lista da onda 7). Commitar e enviar na branch.
- [ ] Relatório ao usuário com as fotos, e pedir autorização para o merge.
