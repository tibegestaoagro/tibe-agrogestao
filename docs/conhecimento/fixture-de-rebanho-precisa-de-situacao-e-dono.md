---
tipo: armadilha
data: 2026-08-31
tags: [rebanho, teste, fixture]
origem: docs/agents/current-handoff.md
---

# Fixture crua de rebanho sem to_situation e to_owner deixa o saldo invisível

## O que aconteceu

Ao montar `HerdMovement` à mão numa suíte, sem preencher `to_situation` e
`to_owner`, o saldo simplesmente não aparece. A tela parece errada, e quem
errou foi a fixture.

## Por que importa

`getPositions` agrupa por **(categoria, propriedade, situação, dono)**, e a
venda procura o gado que está **presente e próprio**. Sem os dois campos, o
agrupamento cai num balde que nada consulta: não há erro, não há exceção, só
ausência.

É o pior formato de defeito de teste, porque acusa o código de produção por um
descuido do cenário.

## Como aplicar

- Fixture de rebanho preenche `to_situation` e `to_owner`, sempre.
- Prefira os helpers de `scripts/helpers/herd.ts` a montar movimento cru.
- Regra geral: quando uma consulta agrupa por N campos, a fixture precisa dos N.
  Antes de culpar o código porque "o saldo não aparece", confira o cenário.

## Relacionado

- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
