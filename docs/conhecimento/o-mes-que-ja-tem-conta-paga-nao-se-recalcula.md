---
tipo: licao
data: 2026-11-08
tags: [emporio, financeiro, despesa-fixa, rateio, juiz]
origem: docs/superpowers/plans/2026-11-08-emporio-financeiro-entrega-4.md
---

# O mês que já tem conta paga não se recalcula: o juiz achou o mesmo buraco três vezes

## O que aconteceu

Na entrega 4 do financeiro do Empório (rateio automático da despesa fixa,
08/11/2026), o juiz Opus reprovou três rodadas seguidas (7, 6 e 6 de 10) com
variações de um defeito só: um mês em que alguma loja já tinha pago a sua
parte era recalculado por cima da conta paga, e a soma do mês passava do
valor do modelo (1.250 para um modelo de 1.000). Primeiro na troca de manual
para automático com uma conta futura paga; corrigido, apareceu no mês
corrente; corrigido, apareceu em qualquer edição seguinte do modelo, até
renomear. A quarta rodada aprovou com 9/10 depois da regra geral: em modelo
automático, mês com conta paga é fechado para toda edição e para o gatilho.

## Por que importa

Cada rodada do juiz custou meia hora e um ciclo inteiro de correção, commit,
suíte e re-julgamento, porque a correção foi feita no sintoma apontado (um
caminho de edição) e não na regra (o estado "já pagou"). O rateio automático
redistribui o valor inteiro do modelo entre todas as lojas, então qualquer
caminho que recalcula um mês com pagamento grava dinheiro a mais, e o
`test:m83` do rateio manual (partes fixas por loja) não pega isso.

## Como aplicar

Ao mexer em algo que recalcula ocorrências, parcelas ou partes já gravadas,
pergunte primeiro "e se uma delas já foi paga?" e escreva a regra pelo estado
(mês fechado, parcela paga), não pelo caminho que chegou nela. Ponha o caso
"já pagou" na suíte antes de pedir o juiz: a m101 ganhou os checks (a), (a2),
(a3) e (f) só depois das reprovações.

## Relacionado

- [[assercao-pode-passar-com-o-defeito-plantado]]
- [[escrever-a-licao-nao-impede-repeti-la]]
