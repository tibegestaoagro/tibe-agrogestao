# Empório: relatórios do dinheiro, exportação e limpeza. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** faturamento por origem, exportação em planilha e PDF, gráfico do fluxo projetado, custo efetivo do cartão, contas sem vencimento à vista, limpeza da 2.63 e o email do seed trocado.

**Architecture:** sem migração. As actions de relatório ganham campos aditivos; as rotas de relatório aceitam `format=csv` com um helper único de CSV brasileiro; o PDF é página de impressão no grupo `(impressao)`; o gráfico é componente de cliente com Recharts.

**Tech Stack:** Next.js 16, Prisma 7, Zod 4, Recharts, suítes `tsx` no Docker, roteiro Python.

**Spec:** `docs/superpowers/specs/2026-11-09-emporio-relatorios-e-limpeza-design.md` (Q268 a Q274).

## Global Constraints

- Invariantes do `CLAUDE.md`; nenhum campo novo no banco; respostas novas são aditivas (nenhum campo existente muda de nome ou de sentido).
- CSV (Q269): BOM `﻿` no início, separador `;`, decimal com vírgula e sem separador de milhar (`1234,56`), datas `DD/MM/AAAA`, quebra de linha `\r\n`, campo com `;`, aspas ou quebra de linha entre aspas duplas (aspas internas dobradas); `Content-Type: text/csv; charset=utf-8`; `Content-Disposition: attachment; filename="<nome>-AAAA-MM-DD.csv"`. Um helper só em `src/lib/csv.ts`, escrito com a ferramenta Write (o conteúdo tem escapes: nunca por heredoc).
- Email novo do seed: `owner@example.com`.
- Recusa por campo no campo; nenhuma cor crua (gráfico nos tokens do kit); nenhum `<input type="number">`; dinheiro em formato brasileiro.
- Subagente não commita; sem autorização de merge, push na `main` ou deploy. Sonnet implementa e revisa.

## Review Focus

1. **Valor com vírgula e campo com ponto e vírgula no CSV** (nome de cliente "Silva; Irmãos"): o campo sai entre aspas e o Excel não quebra a coluna. Teste na Task 2.
2. **Relatório de todas as lojas por origem:** a soma das linhas por origem bate com o total do relatório. Teste na Task 3.
3. **Mês sem venda no cartão:** `card_cost.pct` nulo, sem divisão por zero. Teste na Task 3.
4. **Conta pendente sem vencimento:** aparece em "Sem vencimento" na projeção e no a pagar, não some. Teste na Task 2.
5. **Papel sem permissão pede o CSV:** recebe 403 como no JSON, não um arquivo vazio. Teste na Task 2.

---

### Task 1: Email do seed (Q274)

**Files:** `prisma/seed.ts`; todo arquivo vivo com `owner@damata.com.br` (`grep -rl "owner@damata.com.br" --include=*.ts --include=*.tsx --include=*.py --include=*.md . | grep -v node_modules | grep -v docs/agents/historico | grep -v docs/superpowers/plans`), inclusive `CLAUDE.md`, `src/app/(public)/docs/setup`, os roteiros (`# sessao:`), os cenários e as suítes; um script descartável que faz `UPDATE "User" SET email = 'owner@example.com' WHERE email = 'owner@damata.com.br'` no Docker (URL inline do Docker; recusa se a URL não for `127.0.0.1:55432`).

- [ ] **Step 1:** troca mecânica (sed ou Edit, sem heredoc com escape), atualização do banco local, conferência `grep -rc "owner@damata.com.br"` só sobra no histórico e nos planos antigos.
- [ ] **Step 2:** rodar `test:m81`, `test:m103`, `test:m104`, `npm run check` e um roteiro curto (`npm run navegador -- emporio-f0`, com `next dev` de pé, se o controlador tiver subido) para ver a sessão sem senha funcionando com o email novo.
- [ ] **Step 3:** commit (sessão principal).

---

### Task 2: Planilha, contas sem vencimento (servidor)

**Files:**
- Create: `src/lib/csv.ts`
- Modify: `src/app/api/v1/emporio/finance/reports/receivables-aging/route.ts`, `payables-by-due/route.ts`, `cash-by-place/route.ts`, `src/app/api/v1/emporio/finance/projection/route.ts` (`format=csv`)
- Modify: `src/lib/actions/emporio-relatorios-financeiro.ts` e `src/lib/actions/emporio-projecao.ts` (2.50: `without_due: { count, total, entries }` no a pagar e na projeção)
- Modify: `src/app/(public)/docs/api/endpoints.ts` (as quatro rotas)

**Interfaces:**
- Produces (`src/lib/csv.ts`):
  ```ts
  export type ColunaCsv<T> = { titulo: string; valor: (linha: T) => string | number | Date | null };
  export function gerarCsv<T>(colunas: ColunaCsv<T>[], linhas: T[]): string;   // com BOM, ; , vírgula decimal, DD/MM/AAAA, \r\n
  export function respostaCsv(conteudo: string, nomeBase: string, hoje: Date): Response;
  ```
- Cada rota: com `format=csv`, mesma autenticação e mesma action; linhas: a receber por idade (cliente, loja, faixa de idade, valor, vencimento mais antigo), a pagar por vencimento (semana, conta, fornecedor ou categoria, vencimento, valor, situação, mais as sem vencimento ao fim), posição por lugar (lugar, tipo, saldo), projeção (semana, entradas, saídas, saldo projetado, mais uma linha de nota com a estimativa).
- [ ] **Step 1: Testes na m105 seções 1 e 2** (a suíte é da Task 5; prove por `tsx` descartável se ela ainda não existir): `gerarCsv` com "Silva; Irmãos", aspas, 1234.5 → `1234,50`, data → `DD/MM/AAAA`, BOM no início, `\r\n`; rota com `format=csv` devolve `text/csv` e o nome do arquivo; papel sem permissão: 403; conta pendente sem vencimento aparece em `without_due` no a pagar e na projeção, e a soma do a pagar continua igual à anterior para as contas com vencimento.
- [ ] **Step 2: Implementar.** `test:m101`, `test:docs-api`, `tsc`, `lint`.
- [ ] **Step 3: Commit** (sessão principal).

---

### Task 3: Vendas por origem, custo do cartão e limpeza da 2.63 (servidor)

**Files:**
- Modify: `src/lib/actions/emporio-relatorios.ts` (`RelatorioDeVendas.by_origin` e por loja), `src/app/api/v1/emporio/reports/sales/route.ts` só se o Zod precisar
- Modify: `src/lib/actions/emporio-resultado.ts` (`card_cost`, também em `stores[]`)
- Modify (2.63): `src/lib/emporio/cartao.ts` (tipo único da regra; função `pctEfetivoMes(custoCent, previstoCent, diasPonderados)`), `src/lib/actions/emporio-cartoes.ts` (configuração num tipo só; checagem de taxa vigente dentro da transação do arquivamento), `src/lib/actions/emporio-antecipacao.ts` (usa `pctEfetivoMes`; lista com cursor `before` e totais por loja quando filtrada), `src/lib/actions/emporio-aprovacoes.ts` (cursor com desempate por `id`)
- Modify: `src/app/(public)/docs/api/endpoints.ts` (sales, result, card-anticipations)

**Interfaces:**
- `by_origin: { origin: "balcao" | "ecommerce"; count: number; net: number; freight: number; share_pct: number }[]` (sempre as duas linhas, com zero quando não houver); `stores[].by_origin` igual.
- `card_cost: { card_sales: number; mdr: number; anticipation: number; pct: number | null }`.
- [ ] **Step 1: Testes na m105 seções 3 e 4:** duas vendas no balcão (100 e 50) e uma do e-commerce (200 com frete 30) → `by_origin` balcão 2 / 150 / 0 / 42,86 e e-commerce 1 / 200 / 30 / 57,14, e a soma bate com o total; Resultado com venda de 300 no cartão a 3,5% e antecipação de 9 → `card_cost` 300 / 10,50 / 9 / 6,5; mês sem cartão → `pct` nulo; `pctEfetivoMes` igual ao que a action devolvia antes para o caso da m104 (custo 9 sobre 300 previstos); cursor dos pedidos decididos com dois no mesmo `decided_at` não repete nem pula.
- [ ] **Step 2: Implementar.** `test:m83`, `test:m84`, `test:m100`, `test:m103`, `test:m104`, `test:docs-api`, `tsc`, `lint`.
- [ ] **Step 3: Commit** (sessão principal).

---

### Task 4: Telas

**Files:**
- Modify: `src/app/(dashboard)/emporio/relatorios/page.tsx` (bloco "Por origem": balcão e e-commerce com quantidade, valor, frete e %)
- Modify: `src/app/(dashboard)/emporio/financeiro/relatorios/page.tsx` e `projecao/page.tsx` (botões "Baixar planilha" para o CSV com os filtros atuais e "Imprimir ou salvar em PDF" para a página de impressão; "Sem vencimento" à parte)
- Create: `src/app/(impressao)/emporio/imprimir/relatorio/[tipo]/page.tsx` (tipos `a-receber`, `a-pagar`, `posicao`, `projecao`; filtros na URL; cabeçalho da loja ou "Todas as lojas", data de emissão; botão de imprimir como as outras páginas de impressão)
- Create: `src/app/(dashboard)/emporio/_components/fluxo-projetado-grafico.tsx` (Recharts, linha do saldo por semana, tokens do kit, negativo em destaque; modelo: `acompanhamento-grafico.tsx`)
- Modify: `src/app/(dashboard)/emporio/_components/resultado-mes.tsx` ("Custo do cartão: X% das vendas no cartão", com taxa e antecipação no detalhe)

- [ ] **Step 1: Implementar.** `tsc`, `lint`, `npm run check`.
- [ ] **Step 2: Commit** (sessão principal).

---

### Task 5: Suíte m105 da spec (onda 1)

**Files:** `scripts/m105-emporio-relatorios-exportacao.test.ts`; `package.json` `"test:m105"`.

- [ ] **Step 1:** escrever com as asserções dos blocos Step 1 das Tasks 2 e 3 (copiadas), módulos novos por `import()` com especificador em variável, como a `m104`; isolamento (tenant B não exporta nem lê o de A); rodar no HEAD: compila e falha por ausência.
- [ ] **Step 2: Commit** (sessão principal).

---

### Task 6: Roteiro, manual, docs

**Files:** `scripts/_cenario-emporio-relatorios.ts`, `scripts/navegador/emporio-relatorios-exportacao.py` (relatório de vendas por origem; baixar a planilha e conferir o cabeçalho e uma linha; abrir a página de impressão; gráfico do fluxo presente; "Sem vencimento"; custo do cartão no Resultado; sabotagem: `by_origin` com frete somado ao valor faz reprovar); manual (relatórios e financeiro); `docs/agents/dividas.md` (fechar 2.45, 2.46, 2.50, 2.54, 2.61; atualizar 2.63 deixando só o item do vendedor); `docs/agents/financeiro-emporio-relatorio.md`.

- [ ] **Step 1:** roteiro verde e sabotado; manual e docs. **Step 2:** gates finais e handoff (sessão principal).

---

## Ondas

| onda | tarefas | agentes (Sonnet) |
|---|---|---|
| 1 | Task 1 (sozinha nos scripts), Task 5 (arquivo novo) | `general-purpose`, `prova-suite` |
| 2 | Task 2, Task 3 | `servidor-acao` x2 (arquivos disjuntos; `endpoints.ts` em trechos diferentes, por Edit) |
| 3 | Task 4 | `tela-pagina` |
| 4 | Task 6 | `general-purpose` (papel do `prova-viva`) |

Revisão: uma revisão Sonnet da branch inteira antes da Task 6 fechar.
