---
tipo: armadilha
data: 2026-09-16
tags: [agente, whatsapp, conversa, financeiro]
---

# Índice de lista não sobrevive a dois turnos

O agente mostra uma lista numerada e pergunta qual. O produtor responde "1". Se
o que foi guardado entre as duas mensagens for o **número**, e a lista for
relida na volta, qualquer linha nova reordena tudo e o "1" passa a apontar para
outra coisa.

Na Fase 5 isso virou gravação de dinheiro errada, reproduzida em banco pela
revisão:

```
1. R$ 300,00 vence 20/09    2. R$ 500,00 vence 05/10
"1"   ->  "conta de R$ 300,00, confirma?"
          [uma conta de R$ 9.000 vencendo 18/09 é faturada pelo painel]
"sim" ->  quitou a de R$ 9.000. A de R$ 300 continuou pendente.
```

A janela é o TTL do pendente (15 minutos) e basta alguém usar o painel no meio.

## A regra

**Pine a identidade, nunca a posição.** O que vai para o pendente é o `id` do
que foi mostrado, e a volta seguinte executa por ele, relendo o registro e
recusando quando o estado mudou ("essa conta mudou, me diga de novo").

⚠️ **Corrigir num ponto não corrige na conversa.** A primeira correção pinou o
`entry_id` no momento da confirmação, e o deslocamento apenas mudou de lugar:
passou a acontecer entre a LISTA e a escolha, porque ali ainda se guardava o
número. Toda pergunta que oferece opções precisa pinar a lista que ofereceu, e
não só a escolha final. No mesmo arquivo, a lista de PESSOAS já era pinada e a
de CONTAS não: a assimetria era o sinal.

Ver [[quem-pergunta-precisa-guardar-o-pedido]], que é a versão mais antiga desta
lição, e [[zero-defeito-na-suite-pode-ser-cegueira-da-suite]]: nenhum caso de
teste achava isto, porque todos montavam o cenário e só depois conversavam. O
defeito exige que algo mude NO MEIO.
