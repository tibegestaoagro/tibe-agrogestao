---
tipo: armadilha
data: 2026-10-19
tags: [agente, whatsapp, conversa, pendencia, permuta]
origem: 10a1c8d
---

# A resposta guardada como texto perde o contexto na terceira volta, e o teste de duas voltas passa

## O que aconteceu

Na permuta pelo WhatsApp, "3 novilhas" é ambíguo (fêmea de 8 a 12, 13 a 24 ou
25 a 36 meses). A correção de 16/10 passou a perguntar a faixa e a guardar as
candidatas no pendente. O teste encenava duas voltas e passava:

```
"troquei 5 bezerros por 3 novilhas e vou dar 2000"  ->  qual a idade?
"13 a 24 meses"                                      ->  já pagou ou vai pagar depois?
```

No aparelho, em 19/10, a terceira volta quebrou:

```
"dia 30"  ->  "13 a 24 meses" pode ser mais de uma categoria. São machos ou fêmeas?
```

O lado tinha sido guardado como o TEXTO juntado, "3 13 a 24 meses", e as
candidatas foram apagadas logo depois de resolver. Na volta seguinte o handler
relia o texto do zero, e "13 a 24 meses" sozinho serve para macho e para fêmea.
A informação que fechava a ambiguidade ("novilha" é fêmea) morava só nas
candidatas.

## Por que importa

Todo handler daqui relê o pedido guardado a cada volta. Se o que se guarda é a
frase, e não o que ela resolveu, cada pergunta nova reabre uma dúvida que o
produtor já respondeu: ele lê isso como o assistente esquecendo a própria
pergunta. O teste de duas voltas não vê, porque a releitura acontece na
terceira.

Na mesma rodada, o vizinho: a resposta "Bezerros" a uma pergunta sobre "5 B's
erros" (áudio transcrito errado) virava a DESCRIÇÃO "Bezerros", e a permuta
seria gravada sem tirar nenhum animal do rebanho. Só a confirmação mostrando
"Entregou: Bezerros" denunciaria.

## Como aplicar

- **Resolvido, regrave na forma canônica.** O lado de gado da permuta passou a
  ser guardado como `<quantidade> <category_id>` (por exemplo `3 femea_13_24`),
  que se lê sozinho sem candidatas. Vale para qualquer campo que uma pergunta
  fechou: guarde o id, não a frase.
- **O teste de uma pergunta encadeada tem três voltas:** a frase, a resposta da
  primeira pergunta, e a resposta de uma pergunta SEGUINTE (vencimento,
  fazenda, pasto). É na terceira que o pendente é relido sem o contexto que
  morava fora dele.
- Resposta curta a uma pergunta sobre um lado mantém o que a frase guardada já
  tinha (a quantidade), e só quando com isso o lado vira gado.

## Relacionado

- [[quem-pergunta-precisa-guardar-o-pedido]]: a versão de duas voltas desta lição.
- [[indice-de-lista-nao-sobrevive-a-dois-turnos]]: pinar a identidade, nunca a posição.
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
