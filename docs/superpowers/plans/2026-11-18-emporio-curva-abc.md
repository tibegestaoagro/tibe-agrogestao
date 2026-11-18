# Empório: curva ABC e paginação dos orçamentos (frente H) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o Relatórios ganha a curva ABC de produtos e de clientes (faturamento ou lucro bruto, por loja e período), e a lista de Orçamentos ganha paginação (20, 40, 80, 100), números de página e a ordem crescente ou decrescente, sem o corte silencioso em 200.

**Architecture:** sem migração. Uma action nova `curvaAbcAction` em `emporio-relatorios.ts`, que reaproveita a agregação de `relatorioDeVendasAction` (a mesma seleção de vendas e o mesmo desconto do devolvido; extraia o miolo comum em vez de copiar) e acrescenta o agrupamento por cliente, o custo e a classificação; rota `GET /api/v1/emporio/reports/abc`. `listarOrcamentosAction` ganha `page`, `per_page`, `order` e o `total`; a rota `GET /api/v1/emporio/quotes` repassa e devolve em `meta`. Telas: seção "Curva ABC" no Relatórios; paginação na lista de Orçamentos.

**Tech Stack:** Next.js 16, Prisma 7, Zod 4, suítes `tsx`, roteiro Python.

**Spec:** `docs/superpowers/specs/2026-11-18-emporio-curva-abc-design.md` (Q362 a Q365 e as respostas da revisão)

## Global Constraints

- Nunca travessão (U+2014). Edição só com Edit/Write; nada de heredoc com escape.
- Sem migração.
- Faturamento = soma do `total` das linhas de venda (concluídas, a nova da troca inclusa, menos o devolvido no período, que vai à venda ORIGINAL), a mesma base do `por_produto`. Frete e crédito do franqueado fora.
- Lucro = faturamento menos `unit_cost` x `base_qty` (o custo devolvido sai com a devolução). Custo estimado ou provisório marca "custo estimado"; `unit_cost` nulo entra como zero e marca "sem custo". Nome na tela: "Lucro (venda menos custo)".
- Classes: ordenar por medida desc (empate por nome); só itens com medida > 0 entram no acumulado; classe A enquanto o acumulado ANTES do item < 80%, B enquanto < 95%, C depois; medida <= 0 vai ao fim, classe C. Total <= 0: sem classes, aviso "Sem vendas positivas no período".
- Clientes: o Consumidor final e as vendas com `customer_id` nulo ficam fora da curva, somados numa linha à parte. "Número de vendas" do cliente não conta a venda nova da troca.
- Permissão: a mesma do Relatórios (lojas visíveis); `measure=profit` exige a permissão do Resultado, senão 403.
- Orçamentos: `per_page` em {20, 40, 80, 100} (padrão 20; outro valor: 422 em `per_page`), `page` >= 1 (além da última: devolve a última), `order` `desc` (padrão) ou `asc`, ordem por `number`; `meta: { total, page, per_page }`; `limit` antigo aceito quando `page` não vem.
- Recusas com `fail(..., field)` e `apiErroDeZod`; `/docs/api` atualizado.
- Suíte nova: `test:m124` (`scripts/m124-emporio-curva-abc.test.ts`), com entrada no `package.json`.

## Review Focus

1. **Curva e relatório com o mesmo total:** a soma da curva de produtos é igual à soma do `por_produto` no mesmo período e loja. Teste na Task 2.
2. **Devolução de venda anterior ao período:** desconta do produto e do cliente da venda original. Teste na Task 2.
3. **O item que cruza o corte de 80%:** fica em A; com um item só, ele é A. Teste na Task 2.
4. **Página 1 em ordem crescente começa no orçamento nº 1**, e a busca por número acha um orçamento antigo. Teste na Task 2 e na Task 5.
5. **Venda de loja que a pessoa não vê** não entra na curva dela. Teste na Task 2.

---

### Task 1: servidor (`servidor-acao`)

**Files:** Modify `src/lib/actions/emporio-relatorios.ts` (miolo comum extraído; `curvaAbcAction`), Create `src/app/api/v1/emporio/reports/abc/route.ts`, Modify `src/lib/actions/emporio-orcamentos.ts` (`listarOrcamentosAction`), `src/app/api/v1/emporio/quotes/route.ts` (GET), `src/app/(public)/docs/api/endpoints.ts`.

**Interfaces (produz):**
- `curvaAbcAction(db, ator, input: { from: string; to: string; establishment_id?: string; kind: "products" | "customers"; measure: "revenue" | "profit" }): Promise<ActionResult<CurvaAbc>>`
- `type CurvaAbc = { periodo: { from: string; to: string }; kind; measure; total: number; classes: { classe: "A" | "B" | "C"; count: number; amount: number; share_pct: number }[]; itens: { posicao: number; id: string; name: string; quantity?: number; base_unit?: string; sales_count?: number; amount: number; share_pct: number; cumulative_pct: number; classe: "A" | "B" | "C"; cost_estimated: boolean; cost_missing: boolean }[]; fora_da_curva?: { label: string; amount: number; sales_count: number } }` (`fora_da_curva` só em `customers`; `classes` vazio quando `total <= 0`)
- `GET /api/v1/emporio/reports/abc?from&to&establishment_id&kind&measure`, guard igual ao de `reports/sales`
- `listarOrcamentosAction(db, ator, f: { establishment_id?; q?; situacao?; limit?; page?: number; per_page?: number; order?: "asc" | "desc" }): Promise<ActionResult<{ linhas: OrcamentoLinha[]; total: number; page: number; per_page: number }>>` (ajuste quem chama hoje: a página de Orçamentos e a rota)
- `GET /api/v1/emporio/quotes` aceita `page`, `per_page`, `order` e devolve `meta: { total, page, per_page }`

- [ ] Implementar; `tsc`, `check`, `test:isolation`, `test:docs-api`; rodar as suítes que usam o relatório de vendas e os orçamentos (`grep -l "reports/sales\|listarOrcamentos\|emporio/quotes" scripts/m*.test.ts`) e relatar.
- [ ] Commit (sessão principal).

### Task 2: suíte `test:m124` (`prova-suite`, em paralelo à Task 1, escrita da spec)

**Files:** Create `scripts/m124-emporio-curva-abc.test.ts`; Modify `package.json`.

- [ ] Seções:
  1. classes com números redondos: 5 produtos com 50, 30, 10, 6 e 4 (total 100): pelo acumulado ANTES do item (0, 50, 80, 90, 96): A = 50 e 30, B = 10 e 6, C = 4; um item só é A; empate ordenado por nome; produto com tudo devolvido (medida 0) no fim, classe C, fora do acumulado; total zero sem classes.
  2. faturamento: soma da curva de produtos igual à soma do `por_produto` de `relatorioDeVendasAction` no mesmo período e loja; devolução no período de venda anterior desconta do produto e do cliente originais; troca: itens da venda nova entram, mas ela não conta no `sales_count` do cliente; frete e crédito do franqueado fora.
  3. lucro: faturamento menos custo; linha com `unit_cost` nulo marca `cost_missing`; custo provisório marca `cost_estimated`; 403 em `measure=profit` para quem não vê o Resultado.
  4. clientes: Consumidor final e venda sem cliente em `fora_da_curva`, fora dos itens; soma dos itens + `fora_da_curva` = total do faturamento.
  5. lojas: com `establishment_id`, só a loja; sem, a soma das visíveis; Gestor de uma loja não vê a outra; outro tenant isolado; período inválido e mais de 366 dias recusados como no relatório.
  6. orçamentos: 45 orçamentos; `per_page` 20 dá 3 páginas (20, 20, 5) com `total` 45; `order=asc` página 1 começa no menor número; página 99 devolve a última; `per_page=30` 422 em `per_page`; filtro de situação e busca com `total` certo; busca pelo número de um orçamento antigo acha; `limit` antigo sem `page` continua funcionando.
- [ ] Vermelha antes da Task 1 (relatar), verde depois. Commit (sessão principal).

### Task 3: curva ABC no Relatórios (`tela-pagina`)

**Files:** `src/app/(dashboard)/emporio/relatorios/page.tsx`, Create `src/app/(dashboard)/emporio/relatorios/_components/curva-abc.tsx`.

- [ ] Seção "Curva ABC" com abas Produtos e Clientes e seletor "Faturamento | Lucro (venda menos custo)" (o seletor só para quem pode ver lucro), usando o período e a loja da página (estado na URL, como os filtros que já existem); resumo das classes no alto; a linha à parte do Consumidor final nos Clientes; tabela com posição, nome, quantidade ou nº de vendas, valor, participação, acumulado e a classe em selo (A, B, C), com "custo estimado" e "sem custo" quando houver; aviso de total sem vendas positivas; tabela rolando dentro do cartão no celular.
- [ ] `check`, `tsc`, `lint`; relatar; commit pela sessão principal.

### Task 4: paginação dos Orçamentos (`tela-pagina`, em paralelo à Task 3)

**Files:** `src/app/(dashboard)/emporio/orcamentos/page.tsx` e os componentes de `orcamentos/_components/` que o filtro usa.

- [ ] "Por página" (20, 40, 80, 100) e "Ordem" (Mais recentes primeiro, Mais antigos primeiro) junto dos filtros; "Mostrando X a Y de N"; Anterior, números com reticências (1 ... 4 5 6 ... 12) e Próxima; tudo na URL (`pagina`, `por_pagina`, `ordem`); mudar filtro, busca, ordem ou tamanho volta à página 1; nada de `<input type="number">`.
- [ ] `check`, `tsc`, `lint`; relatar; commit pela sessão principal.

### Task 5: roteiro `emporio-curva-abc` (`prova-viva`)

**Files:** Create `scripts/_cenario-emporio-curva-abc.ts` (prefixo próprio, `--limpar`) e `scripts/navegador/emporio-curva-abc.py`.

- [ ] No navegador: a curva de produtos com as classes e os percentuais certos para um cenário de valores conhecidos; trocar para Lucro; Clientes com a linha do Consumidor final; filtro de loja; a curva somando o mesmo que o "por produto" da página; 390 px sem rolagem horizontal. Orçamentos com 45 do cenário: 20 por página, ir à página 3, trocar para 40, ordem crescente começando no menor número, busca por um antigo, e voltar à página 1 ao mudar o filtro.
- [ ] Provado nos dois sentidos (sabotar o corte de classe e o `skip` da paginação, ver falhar, restaurar). Relatar sem commitar.

### Task 6: fechamento (sessão principal)

- [ ] Manual: a curva ABC no Relatórios e a paginação nos Orçamentos.
- [ ] `test:all`, juiz (`prova-juiz`, sonnet), correções provadas nos dois sentidos, dívida da paginação das outras listas, handoff, push da branch.
- [ ] Pedir ao usuário o merge com push (sem migração nesta frente).
