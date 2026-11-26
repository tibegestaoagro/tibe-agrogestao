---
tipo: armadilha
data: 2026-11-26
tags: [validacao, cenario, datas, fuso, emporio]
origem: 89cbc1f8
---

# O cenário com data relativa muda de mês conforme o dia em que roda, e o teste do dia aprova o fuso errado

## O que aconteceu

Em 26/11/2026, na passada dos roteiros da onda 2 de UX do Empório, o roteiro
da projeção do financeiro reprovou sem mudança na tela. O cenário
`scripts/_cenario-emporio-financeiro-projecao.ts` vendia o fiado vencido "há
25 dias" e esperava a venda no mês anterior. A partir do dia 26, 25 dias atrás
cai no mês corrente, e o roteiro passou a ver outro número. Ele passava do dia
1 ao 25 e falhava do 26 ao fim do mês. A correção ancora a data no calendário:
dia 15 do mês anterior.

Na mesma onda, o juiz achou o par desta falha na suíte `m131`: o Início
contava "vendas de hoje" e "do mês", e a suíte continuava verde se o dia fosse
calculado em UTC em vez do horário de São Paulo. As vendas de teste eram
criadas no meio do dia, onde os dois fusos dão a mesma data. Só a venda entre
0h e 3h da manhã (horário de São Paulo) separa os dois, e ela não existia. O
roteiro `scripts/navegador/emporio-ux-onda2.py` tinha o mesmo vício ao
calcular o mês anterior, e passou a usar o fuso -3.

## Por que importa

Os dois defeitos passam em quase toda rodada e falham num pedaço do mês ou do
dia. Quem roda no dia 10 vê verde e entrega. Quem roda no dia 27 vê vermelho
sem mudança de código e procura defeito na tela. E o defeito real de fuso fica
escondido em produção até a primeira venda depois da meia-noite, que no balcão
de uma loja com turno estendido é comum.

## Como aplicar

- Cenário que precisa de "mês anterior" ou "mês corrente": monte a data pelo
  calendário (dia 15 do mês anterior, dia 1 do mês), nunca por "há N dias".
- Tela ou suíte que agrupa por dia ou por mês: crie pelo menos um registro
  entre 0h e 3h de São Paulo, e um no último dia do mês. É o caso que
  discrimina o UTC do fuso certo.
- No roteiro em Python, calcule hoje e o mês com o fuso -3, não com o relógio
  da máquina.
- Roteiro que falha sem mudança de código: olhe o dia do mês antes de olhar a
  tela.

## Relacionado

- [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]
- [[a-conta-do-seed-acumula-o-que-os-cenarios-deixam]]
- [[media-de-periodo-precisa-dividir-dia-a-dia]]
