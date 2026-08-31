---
tipo: licao
data: 2026-08-31
tags: [qualidade, catraca, design-system, processo]
origem: fd5fda8..67a3762
---

# Um portão mede a relação que lhe deram, nunca a que importa

## O que aconteceu

Três incidentes deste projeto, com três meses de distância entre si, são o
mesmo defeito:

| # | o portão | o que ele media | o que importava |
|---|---|---|---|
| 1 | `check-contraste.ts` | o par (texto, fundo) tem contraste | o elemento **aparece** na tela |
| 2 | conferência 8 (cor crua) | `(text\|bg\|border)-` em 9 famílias | **toda** cor crua que pinta pixel |
| 3 | a mesma conferência 8 | os arquivos que a regex vê | a cobertura que a documentação **afirma** |

No primeiro, uma pílula com `bg-tibe-light` sumia contra a página e o portão
aprovava, porque o texto continuava legível.

No segundo, `divide-gray-200` e `bg-purple-100` pintavam a tela sem que nada os
contasse: a regex cobria três prefixos e nove famílias de cor.

No terceiro, o `dividas.md` §2.5 e o handoff afirmavam que o painel do tenant
estava **inteiro** em token semântico. Era falso, e a prova de que era verdade
era o silêncio de um portão que não enxergava `divide-`.

## Por que importa

O terceiro é o mais perigoso, porque **a medição virou afirmação de
documentação**. Ninguém mentiu: escreveram o que o portão dizia. O portão é que
não media aquilo.

Um portão silencioso é pior que nenhum portão, porque nenhum portão deixa a
pergunta em aberto, e um portão furado a responde errado com autoridade.

## Como aplicar

- **Ao desenhar um portão, escreva o que ele NÃO mede.** Um comentário de duas
  linhas no topo da conferência vale mais que a conferência inteira.
- **Nunca cite o resultado de um portão como cobertura**, a menos que você
  tenha lido o que ele mede. "A conferência 8 passa" não é "não há cor crua".
- Ao achar um furo, pergunte se a **categoria** do furo se repete: `divide-`
  era um prefixo faltando, e o roxo era a lista de cores. Consertar só o
  primeiro teria deixado o segundo.

## Relacionado

- [[pilula-invisivel-o-portao-compara-token-nao-uso]]
- [[trava-so-vale-depois-de-voce-a-ver-falhar]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
