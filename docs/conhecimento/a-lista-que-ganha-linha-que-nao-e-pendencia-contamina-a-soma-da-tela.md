---
tipo: licao
data: 2026-11-17
tags: [emporio, juiz, soma, lista]
origem: 57c8527, 3683fcb
---

# A lista que ganha linha que não é pendência contamina a soma que a tela faz por conta própria

## O que aconteceu

Na frente B do Empório (conferir o cartão, 17/11/2026), o primeiro juiz pediu que
a parcela conferida de dia passado continuasse no A receber, para o botão
Desfazer não sumir. A correção acrescentou à consulta as conferidas dos últimos
7 dias. A suíte conferiu que elas não entravam em nenhuma faixa do `summary` da
action, e passou.

O segundo juiz achou o furo: o componente `cartoes-a-receber.tsx` somava
sozinho o rodapé "Total a receber" sobre a lista inteira. Uma parcela de
R$ 1.000,00 conferida ontem, e já na conta, aparecia como dinheiro a receber. A
mesma soma já contava as atrasadas e as a conferir, que também já tinham caído
na conta.

## Por que importa

A action e a suíte guardavam a soma oficial, e a tela tinha uma segunda soma
que ninguém conferia. Toda linha nova na lista muda essa segunda soma em
silêncio: o Financeiro leria um "a receber" maior que o real.

## Como aplicar

- Quando uma lista passar a carregar linhas que não são pendência (histórico
  recente, linha para desfazer, linha só informativa), procure TODA soma feita
  sobre ela, também nos componentes de tela (`grep -n "reduce"` no componente
  que recebe a lista).
- Soma de tela filtra pelo estado (`status === "prevista"`), não pela presença
  na lista.
- A conferência do valor do rodapé vai para o roteiro de navegador, porque a
  suíte só enxerga a resposta da rota.

## Relacionado

- [[zero-defeito-na-suite-pode-ser-cegueira-da-suite]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
