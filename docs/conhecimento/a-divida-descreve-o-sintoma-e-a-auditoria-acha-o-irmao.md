---
tipo: licao
data: 2026-09-14
tags: [dividas, auditoria, escopo, tarefas, confinamento]
origem: 918874e, b8de4df
---

# A dívida descreve o sintoma que alguém viu, e ler o código acha o irmão dele

## O que aconteceu

Duas vezes no mesmo dia, a leitura do código antes de corrigir achou um defeito
da MESMA raiz que o texto da dívida não mencionava.

1. **Dívida 2.14:** "recorrência mensal nos dias 29 a 31 deriva". A causa era a
   próxima ocorrência partir da data da atual. Lendo `postponeTaskAction`, a
   mesma causa aparecia num caminho muito mais usado: **adiar deslocava a série
   inteira**. "Toda segunda" adiada para terça virava "toda terça" para sempre.
   A correção pedida pela dívida (uma coluna `recurrence_day`) teria resolvido
   o dia 31 e deixado o adiar quebrado.
2. **Dívida 2.8:** "faltam quatro destinos de saída e a despesa avulsa". A
   auditoria de `closeStay` mostrou que a venda do lote **gravava só a
   receita**, sem negociação nem comprador, contra o §19 do documento do
   cliente. Fechar a dívida pelo texto teria entregue sete destinos com a venda
   ainda fora de Negociações.

## Por que importa

A dívida é escrita por quem tropeçou num sintoma, com o custo estimado para
aquele sintoma. Implementar o que ela diz fecha o item na lista e deixa o irmão
vivo, agora sem registro nenhum, porque o item "foi resolvido".

Nos dois casos o irmão era **maior** que o sintoma registrado: adiar é gesto
diário, e o dia 31 é raro; a venda aparecer em Negociações é o §19 inteiro.

## Como aplicar

- Antes de desenhar a correção de uma dívida, leia a **causa** no código e
  procure todo caminho que passa por ela, não só o que a dívida cita.
- Ao trazer as perguntas ao usuário, diga o que a auditoria achou além do
  texto. As duas decisões de hoje só foram certas porque o achado veio junto.
- Na correção, prefira a forma que cobre a causa (a âncora da série) à que
  cobre o sintoma (o dia do mês).

## Relacionado

- [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]
- [[portao-mede-a-relacao-que-lhe-deram]]
