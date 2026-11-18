# Empório: paginação das listas e acertos da curva ABC (5.26 e 5.27) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nenhuma lista do Empório corta em silêncio: as nove da dívida 5.26 paginam no padrão da Q365, e a curva ABC fecha em 100% com o seletor de lucro decidido no servidor (5.27).

**Architecture:** sem migração. Cada action ganha `page`/`per_page`/`order` e o `total`, mantendo o `limit` antigo quando `page` não vem; as rotas devolvem `meta: { total, page, per_page }`. As telas usam o componente `paginacao.tsx` (completo ou compacto). A curva distribui o arredondamento pelo maior resto e uma função de leitura diz se o ator vê o lucro.

**Tech Stack:** Next.js 16, Prisma 7, Zod 4, suítes `tsx`, roteiro Python.

**Spec:** `docs/superpowers/specs/2026-11-18-emporio-paginacao-listas-design.md` (Q366, Q367)

## Global Constraints

- Nunca travessão (U+2014). Edição só com Edit/Write. Sem migração.
- `per_page` em {20, 40, 80, 100}, padrão 20 (outro: 422 em `per_page`); `page` >= 1, além da última devolve a última; `order` `desc` (padrão) ou `asc`; `count` e `findMany` sob o MESMO `where`.
- Sem `page` e com `limit`: o comportamento antigo (a tela inicial do Empório usa). Sem nenhum dos dois: página 1 de 20.
- Rotas: linhas em `data`, `meta: { total, page, per_page }`; `/docs/api` atualizado.
- Recusas com `fail(..., field)` e `apiErroDeZod`.
- Curva: `share_pct` dos itens e das classes somam exatamente 100,00 (maior resto em centésimos); a classe continua decidida pelos inteiros.
- Suíte nova: `test:m125` (`scripts/m125-emporio-paginacao-listas.test.ts`).

## Review Focus

1. **Tela que chamava a action sem `page`** (tela inicial, ficha do fornecedor, Despesas, A pagar, Franqueado): continua mostrando o mesmo. Teste na Task 2 e na Task 5.
2. **Duas listas paginadas na mesma tela (Caixa):** mudar a página de uma não mexe na outra. Teste na Task 5.
3. **Filtro + página:** a contagem respeita o filtro (status, loja, fornecedor). Teste na Task 2.
4. **Curva com três itens iguais:** 33,34 + 33,33 + 33,33 = 100,00. Teste na Task 2.
5. **Suíte antiga lendo a lista como array:** ajustada só no formato, sem afrouxar. Conferido pelo juiz.

---

### Task 1: servidor (`servidor-acao`)

**Files:** `src/lib/actions/emporio-vendas.ts` (`listarVendasAction`), `emporio-compras.ts` (`listarComprasAction`), `emporio-transferencias.ts` (`listarTransferenciasAction`), `emporio-producao.ts` (`listarProducoesAction`), `emporio-aprovacoes.ts` (`listarPedidosDePagamentoAction`, só se cortar em silêncio), `emporio-antecipacao.ts` (`listarAntecipacoesAction`), `emporio-turno.ts` (`listarEntregasAction`), `emporio-caixa.ts` (`lerCaixaAction` só nos movimentos; `listarConferenciasAction`), `emporio-relatorios.ts` (maior resto; `podeVerLucroAction`), as rotas de cada uma, todos os chamadores em `src/`, `src/app/(public)/docs/api/endpoints.ts`.

**Interfaces (produz):**
- Para as listas simples: `opts` ganha `page?: number; per_page?: number; order?: "asc" | "desc"` e o retorno vira `ActionResult<{ linhas: T[]; total: number; page: number; per_page: number }>` (o `T` de hoje). Ajuste TODOS os chamadores em `src/` (telas e rotas) para ler `.linhas`, sem mudar o que mostram (as telas novas vêm nas Tasks 3 e 4).
- `lerCaixaAction`: `opts` ganha `mov_page?`, `mov_per_page?` (o resto igual); `CaixaView` ganha `movimentos_total: number`, `movimentos_page: number`, `movimentos_per_page: number`. Sem `mov_page`, o comportamento de hoje.
- `podeVerLucroAction(db, ator): Promise<boolean>` em `emporio-relatorios.ts` (a mesma checagem do `measure=profit`).
- Curva: `share_pct` e `classes[].share_pct` pelo maior resto; `cumulative_pct` acumula os `share_pct` arredondados.
- Rotas: `page`, `per_page`, `order` na query (e `mov_page`, `mov_per_page` na do caixa); `meta: { total, page, per_page }`.

- [ ] Implementar; `tsc`, `check`, `test:isolation`, `test:docs-api`; rodar as suítes que chamam essas actions ou rotas (`grep -l "<nome da action>\|<rota>" scripts/m*.test.ts`) e relatar cada uma (as que lerem o array antigo vão falhar: relatar quais e onde; não editar `scripts/`).
- [ ] Commit (sessão principal), depois de ajustar as suítes antigas.

### Task 2: suíte `test:m125` (`prova-suite`, em paralelo à Task 1)

**Files:** Create `scripts/m125-emporio-paginacao-listas.test.ts`; Modify `package.json`.

- [ ] Para cada lista (vendas, compras, transferências, produções, antecipações, entregas, conferências e os movimentos do caixa; pedidos de pagamento só se a Task 1 a paginar): 45 registros numa loja própria (ou o mínimo que a fixture permitir para passar de uma página), `per_page` 20 dá 20/20/5 com `total` certo, `order=asc` começa no mais antigo, página 99 devolve a última, `per_page=30` 422 em `per_page`, filtro com `total` certo, `limit` sem `page` igual ao de antes, outro tenant total 0; pela rota, `meta`.
- [ ] Curva: três itens iguais somam 100,00 nos itens e nas classes; 50/30/10/6/4 continua A/A/B/B/C; `podeVerLucroAction` verdadeiro para Dono, Gerente geral, Gestor da loja e Financeiro, falso para Vendedor e Caixa.
- [ ] Vermelha antes da Task 1 (relatar), verde depois. Commit (sessão principal).

### Task 3: telas das listas principais e da curva (`tela-pagina`)

**Files:** `src/app/(dashboard)/emporio/vendas/page.tsx`, `compras/page.tsx`, `transferencias/page.tsx`, `financeiro/aprovacoes/page.tsx` (se paginada) e os filtros delas; `relatorios/page.tsx` e `_components/curva-abc.tsx` (seletor pelo `podeVerLucroAction`).

- [ ] Paginação completa como em `orcamentos/page.tsx` (seletores "Por página" e "Ordem", barra embaixo, URL `pagina`/`por_pagina`/`ordem`, filtro volta à página 1). `check`, `tsc`, `lint`; relatar; commit pela sessão principal.

### Task 4: telas das listas dentro de outras telas (`tela-pagina`, em paralelo à Task 3)

**Files:** `src/app/(dashboard)/emporio/produtos/[id]/page.tsx` (produções), `financeiro/receber/page.tsx` (antecipações), `caixa/page.tsx` (entregas e movimentos), e o `paginacao.tsx` se precisar de variante compacta.

- [ ] Paginação compacta (de 20 em 20, sem seletor), cada lista com o próprio parâmetro na URL (`pagina_prod`, `pagina_ant`, `pagina_ent`, `pagina_mov`), preservando os outros parâmetros da página. `check`, `tsc`, `lint`; relatar; commit pela sessão principal.

### Task 5: roteiro `emporio-paginacao-listas` (`prova-viva`)

**Files:** Create `scripts/_cenario-emporio-paginacao-listas.ts` e `scripts/navegador/emporio-paginacao-listas.py`.

- [ ] No navegador: Vendas e Compras com 45 (20 por página, página 3, 40 por página, ordem crescente, filtro volta à página 1); produções na ficha do produto paginando; no Caixa, mudar a página dos movimentos não mexe na das entregas; a tela inicial do Empório igual; a curva com três itens iguais mostrando 100,00% no resumo; o Vendedor não vê o seletor de lucro; 390 px sem rolagem horizontal.
- [ ] Provado nos dois sentidos (sabotar um `skip`, o parâmetro próprio do Caixa e o maior resto). Relatar sem commitar.

### Task 6: fechamento (sessão principal)

- [ ] Manual (onde as listas são descritas), figuras só as que mudarem, `test:all`, juiz, correções, dívidas 5.26 e 5.27 fechadas no `dividas.md`, handoff, push da branch, pedir o merge ao usuário.
