---
tipo: armadilha
data: 2026-08-31
tags: [ui, design-system, contraste, catraca]
origem: f1eb54a
---

# O portão de contraste aprovou uma pílula invisível, porque o texto continuava legível

## O que aconteceu

O alias depreciado `tibe.light` aponta para `--superficie-afundada`, que é
**exatamente o fundo do painel**. Toda pílula ou cartão que ainda usa
`bg-tibe-light` sobre a página fica invisível: sobra o texto solto, sem a
pílula em volta.

O `scripts/check-contraste.ts` aprovava, e continuaria aprovando para sempre.
Não por bug: ele confere **25 pares de token** (texto sobre fundo) contra WCAG
2.1 AA, e o par continuava passando. O texto estava legível. O que sumiu foi a
forma.

## Por que importa

**O portão compara pares de token, nunca o uso do token.** Essa é a diferença
entre "as cores deste par têm contraste" e "este elemento aparece na tela".
Nenhuma conferência estática deste projeto olhava a segunda pergunta.

Um caso foi corrigido (as pílulas de "Perfis ativos" em Configurações). Os que
restam estão em hover de tabela, foco de select e menus, onde o efeito é só um
realce fraco, e no site público e auth.

## Como aplicar

- Ao mexer em token, pergunte **onde ele é usado**, não só se o par passa.
- Um alias que aponta para uma superfície é candidato a invisibilidade sempre
  que for usado como fundo sobre aquela mesma superfície.
- Este é o tipo de defeito que só a validação ao vivo pega: ver
  [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]].

## Relacionado

- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
- [[trava-so-vale-depois-de-voce-a-ver-falhar]]
