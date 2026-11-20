---
tipo: licao
data: 2026-11-20
tags: [suite, fixture, emporio, boleto, agendado]
origem: 9ae0d0ec, scripts/m128-emporio-sobras-sem-agromax.test.ts
---

# O teste que monta o dado direto no banco aprova o que a action nunca grava

## O que aconteceu

Em 20/11/2026, a ficha do cliente passou a marcar como "Agendado" o
recebimento com data futura. Para o boleto, a leitura decidia pelo `paid_at`. A
seção 2 da `m128` criou o boleto com `cru.emporioBoleto.create({ ... paid_at:
meioDia(amanha) })` e ficou verde. O revisor da tarefa aprovou.

O juiz achou o furo: `pagarBoletoAction` grava `paid_at` = o instante do clique
e põe a data escolhida em `paid_on`. Nenhum boleto pago pela tela tem `paid_at`
no futuro. Em produção, o boleto pago com "Data em que caiu" = amanhã ficaria
sem o selo e somaria no "Recebido", contradizendo o Caixa, que já mostrava
certo.

Com o teste trocado para pagar pela própria action, o defeito apareceu na
primeira rodada: `scheduled` falso e Recebido de R$ 45 em vez de R$ 15.

## Por que importa

O teste não testou o sistema: testou um formato de dado que só ele produzia.
A leitura e o teste nasceram da mesma suposição ("o futuro está no
`paid_at`"), então os dois concordavam entre si e discordavam da escrita real.
A revisão por tarefa não pega isso, porque olha o diff da leitura, e o diff
está coerente.

## Como aplicar

- **Fixture de leitura nasce pela action de escrita**, sempre que ela existe.
  `cru.<model>.create` só para o que nenhuma action grava (dado legado,
  estado impossível de alcançar pela tela).
- Quando uma leitura nova decide por uma coluna, confira quem grava essa
  coluna, e com que valor, antes de escrever o teste.
- Se o teste precisar de um valor que a action não produz, o teste está
  dizendo que a leitura olha o campo errado.

## Relacionado

- [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
- [[zero-defeito-na-suite-pode-ser-cegueira-da-suite]]
