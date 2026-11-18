---
tipo: armadilha
data: 2026-11-17
tags: [manual, navegador, figuras]
origem: f2a64e5, scripts/navegador/manual-emporio.py
---

# O manual regera toda figura, e a data do dia muda quase todas

## O que aconteceu

Em 17/11/2026, depois da frente B, o roteiro `manual-emporio` rodou inteiro e
deixou 72 figuras modificadas. Só duas mostravam a mudança da frente (a coluna
Estado no Caixa e o cartão "Cartão a conferir" no Hoje). As outras mudaram só
pela data, pelos números de venda e pelos valores do dia.

Na mesma rodada, duas figuras reprovaram em "marca dentro da tela": o cartão
novo no Hoje empurrou o cartão marcado para baixo da altura da figura (`hd`,
`hc`).

## Por que importa

Commitar as 72 enche o repositório (público) de imagens que não ensinam nada
novo, e esconde no diff as duas que importam. A falha de "marca dentro da tela"
parece defeito da tela, e é só o enquadramento.

## Como aplicar

- Depois do `manual-emporio`, devolva com `git checkout --` toda figura que a
  frente não mexe, e abra as que sobrarem para conferir.
- Para refazer só algumas: `FIGURAS=financeiro-hoje npm run navegador -- manual-emporio`.
- "Marca fora da tela" depois de uma tela ganhar um bloco novo: aumente `hd`
  (computador) e `hc` (celular) na chamada `figura(...)` do roteiro.

## Relacionado

- [[a-conta-do-seed-acumula-o-que-os-cenarios-deixam]]
