---
tipo: licao
data: 2026-11-11
tags: [emporio, estoque, custo-medio, diagnostico, datas]
origem: src/lib/emporio/datas.ts
---

# O custo médio que parecia errado era a compra carimbada ao meio-dia

## O que aconteceu

A Agromax relatou que o produto acabou, foi reposto mais caro e o sistema
mostrou "a média dos dois". A conta do custo médio estava certa (com saldo
zero ela recomeça pelo custo da compra). Em 10/11 o diagnóstico foi "a compra
foi lançada antes da contagem", e virou três decisões de tela (Q293 a Q295)
que o cliente depois recusou.

O diagnóstico estava errado. Em 11/11, a mesma leitura em produção, agora
comparando `created_at` com `occurred_at`, mostrou: a contagem foi lançada às
14:13 e a compra às 14:16, na ordem certa. Mas a contagem grava a hora exata,
e a compra gravava só o dia, carimbado ao meio-dia (a tela manda
`AAAA-MM-DDT12:00`). No livro-razão a compra ficou ANTES da contagem e se
misturou com 3.883 kg que não existiam. Antes do meio-dia a ordem sai certa,
e por isso a simulação do cliente "funcionava".

## Por que importa

- A leitura de 10/11 ordenou por `occurred_at` e concluiu sobre a ordem em
  que as PESSOAS agiram. Quem diz a ordem das pessoas é o `created_at`.
- Um lançamento com data escolhida (só o dia) e outro com a hora exata não se
  ordenam entre si dentro do mesmo dia. Qualquer regra que dependa da ordem
  (custo médio que zera, saldo num instante) quebra em silêncio, e só na
  parte da tarde.
- A conclusão errada custou uma entrega inteira de tela, depois desfeita.

## Como aplicar

- Queixa de custo ou de saldo: liste as movimentações com `occurred_at` E
  `created_at` lado a lado. Se a ordem das duas colunas diverge, o defeito é
  de carimbo, não de processo nem de fórmula.
- Entrada com data escolhida pelo usuário: data de hoje vira a hora do
  lançamento (`momentoDaEntrada`, Q298). Data de outro dia fica como veio.
- No SQL, `occurred_at` é `timestamp` sem fuso, em UTC: para Brasília, use
  `(col at time zone 'UTC') at time zone 'America/Sao_Paulo'`. Um
  `col at time zone 'America/Sao_Paulo'` direto SOMA 3 horas em vez de subtrair.

## Relacionado

- [[somar-em-vez-de-gravar-tem-um-preco-no-dia-um]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
