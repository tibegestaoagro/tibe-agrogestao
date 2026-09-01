---
tipo: licao
data: 2026-09-02
tags: [leite, relatorio, media, periodo, modulo-32]
origem: docs/specs/module-32-area-leite.md
---

# Média de período divide dia a dia, não total pelo divisor de hoje

## O que aconteceu

A Área Leite precisa da média por vaca (§10 do documento do cliente): litros
produzidos dividido por vacas em lactação. Num dia só é trivial. Num período,
existem duas contas plausíveis, e uma delas está errada quase sempre:

| conta | fórmula | o que acontece |
|---|---|---|
| ingênua | `litros do período / vacas de HOJE` | erra em todo período em que o rebanho leiteiro mudou de tamanho |
| honesta | `litros / soma, dia a dia, das vacas daquele dia` | é litros por vaca/dia, e degrada certo para o caso de um dia |

O rebanho leiteiro muda **todo mês**: vaca pare, vaca seca. Então a conta
ingênua não erra de vez em quando, ela erra por padrão.

O caso que separa as duas, e que virou asserção na `m52`: dia 1 com 450 litros
e 30 vacas, dia 2 com 900 litros e 60 vacas. A conta honesta dá
`1350 / (30 + 60) = 15`, que é a produtividade real dos dois dias. A ingênua dá
`1350 / 60 = 22,5` por dia, que não aconteceu em nenhum dos dois.

## O que fazer

**Toda média de período com denominador que varia no tempo se calcula dia a
dia**, e não com o denominador de uma ponta. Vale para litros por vaca, e valeria
igual para custo por cabeça confinada ou consumo por animal.

E o dia sem denominador conhecido sai dos **dois** lados da divisão. Deixá-lo só
no numerador infla a média sem que nada tenha sido produzido a mais. A tela
mostra quantos dias entraram na conta (`6 de 31 dias entraram na conta`), porque
uma média sobre um pedaço do período precisa dizer que é sobre um pedaço.

## Onde isso vive

`mediaPorVaca`, em `src/lib/actions/milk-production.ts`, e as seções 1 e 8 da
`scripts/m52-leite.test.ts`.

Relacionado: [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]],
[[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]].
