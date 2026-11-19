---
tipo: licao
data: 2026-11-18
tags: [emporio, listas, paginacao, validacao-viva]
origem: 77cf2ca (Q365), 58e077fc (Q366)
---

# A lista que corta em silêncio faz o cliente achar que o dado sumiu

## O que aconteceu

Em 18/11/2026 a Agromax mandou um print da lista de Orçamentos terminando no nº
38 e perguntou se dava para "resgatar" os de baixo. Nada tinha sumido: o Neon
tinha os 247, do 1 ao 247, sem buraco. A action fazia `take: 200` sem contar o
total e a tela não dizia que tinha cortado; com o filtro padrão escondendo os
faturados e os cancelados, o 200º mais recente caiu justo no 38.

O mesmo corte estava em mais nove listas (Vendas, Compras, Transferências,
produções, antecipações, entregas, movimentos e conferências do caixa, e os
pendentes das Aprovações), todas com 200 ou 100 e sem aviso. Nenhuma suíte
pegava, porque as fixtures nunca passavam do teto, e a conta real levou duas
semanas para chegar lá.

## Por que importa

O cliente não lê "corte": lê **perda de dado**, e a primeira reação é perder a
confiança no sistema e pedir resgate. O defeito não aparece em teste nenhum
enquanto o volume é de demonstração, e aparece de uma vez na conta que mais usa.

A paginação certa tem duas armadilhas que só a revisão achou:
- **Ordem sem desempate final por `id`** (`sold_at`, `created_at`): dois
  registros com o mesmo carimbo podem trocar de lugar entre a consulta da
  página 2 e a da 3, e um aparece duas vezes enquanto o outro some na emenda.
- **Filtro feito na tela depois de paginar** (as entregas eram filtradas pela
  loja do gestor depois do `take`): o "de N" conta o que a pessoa não vê, e a
  página vem com menos linhas.

## Como aplicar

- Lista nova do Empório nasce paginada pelo helper `src/lib/emporio/paginacao.ts`
  (`lerPagina`, `recortar`) e pelo componente
  `src/app/(dashboard)/emporio/_components/paginacao.tsx`: `count` e `findMany`
  sob o MESMO `where`, `skip`/`take`, "Mostrando X a Y de N".
- Todo `orderBy` de lista paginada termina em `{ id: ordem }`.
- Filtro de permissão vai no `where`, nunca num `.filter` depois da consulta.
- Antes de culpar perda de dado, conte no banco (leitura no Neon é livre) e
  compare com o teto da action: `grep -n "take: " src/lib/actions/`.
- A fixture da suíte de uma lista precisa passar de uma página (45 registros
  com `per_page` 20 deram 20/20/5).

## Relacionado

- [[a-lista-que-ganha-linha-que-nao-e-pendencia-contamina-a-soma-da-tela]]
- [[assercao-pode-passar-com-o-defeito-plantado]]
