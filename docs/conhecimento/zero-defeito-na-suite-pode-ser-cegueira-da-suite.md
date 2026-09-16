---
tipo: licao
data: 2026-09-16
tags: [agente, avaliacao, teste, whatsapp]
---

# Zero defeito em cinco rodadas pode ser cegueira do conjunto

Na Fase 4 do agente, 60 blocos de conversa escritos por cinco testadores sem
contexto rodaram cinco vezes contra o modelo, sempre com **zero gravação
indevida**, que era o critério eliminatório da fase. A revisão independente
então reproduziu, em banco, uma gravação indevida de verdade:

```
>> usei 2 sacas
<< Qual produto? (Ração / Sal)
>> nem precisei do sal afinal
<< ✅ Anotei: 2 sacas de Sal usadas. Restam 18 sacas.
```

O produtor negou, e o uso foi gravado.

**Por que o conjunto não achava:** o defeito exige um passo marcado "não pode
gravar" chegando com uma pergunta de campo do uso de estoque em aberto. Dos 14
blocos que citavam estoque, **todos** os passos eram "pode". A combinação
necessária não existia em nenhum dos 60, e nenhuma quantidade de rodadas a
criaria.

O uso de estoque é a única intenção que grava sem pedir "sim"
([[a-porta-fraca-nao-pode-alcancar-quem-grava-sem-confirmar]]), então ele era o
único caso capaz de mostrar o problema, e era justamente o que faltava.

## O que fazer com isso

Quando um conjunto de casos aprovar um critério de segurança, pergunte **qual
combinação de estados ele nunca monta**, antes de comemorar o número. Aqui a
pergunta certa era: "algum caso chega com pendente aberto de um handler que
grava sem confirmar?". A resposta era não, e daria para saber disso sem rodar
nada.

Vale também o inverso do [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]:
lá o caso que discrimina é o da ponta que falta; aqui o ESTADO que discrimina
é o da ponta que falta.

E foi por isso que a revisão independente valeu o custo dela inteira: ela não
mede o que o conjunto mede, ela procura o que o conjunto não alcança.
