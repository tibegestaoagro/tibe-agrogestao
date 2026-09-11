---
tipo: licao
data: 2026-09-11
tags: [whatsapp, conversa, pendencia, suite-cega, modulo-36]
origem: d686887
---

# Quem pergunta pelo WhatsApp precisa guardar o pedido, e isso só falha na segunda volta

## O que aconteceu

O handler novo da Lista de Compra perguntava antes de remover um item:

```
produtor: tira o arame da lista
Tibé:     quer tirar 2 rolos de arame da sua Lista de Compra?
produtor: sim
Tibé:     o que você quer tirar da lista?
```

O handler exigia a descrição em toda chamada, e na volta da confirmação o
classificador não a remanda. Cada volta, isolada, funcionava. A conversa, não.

Os **outros nove domínios** deste projeto guardam o pedido no Redis
(`pending-store.ts`), e é exatamente por isso. Este nasceu sem, porque a
pergunta era "simples": um sim ou não.

## Por que a suíte comum não pegaria

Porque testar um handler é testar uma volta. O defeito mora **entre** duas
voltas, e só aparece quando o teste encena a conversa inteira: a pergunta, e
depois a resposta, com os parâmetros que o classificador realmente manda na
segunda (que é quase nada).

Foi a `m63`, escrita às cegas a partir do contrato, que encenou. O briefing
dizia "remover pergunta antes e só remove com a confirmação", e ela escreveu as
duas voltas porque era isso que estava escrito, sem saber que o handler não
aguentava.

## A regra que fica

**Toda pergunta feita pelo agente precisa guardar o que ela está perguntando.**
O pedido guardado manda sobre a remontagem do classificador: da mensagem
seguinte aproveita-se só a resposta.

O teste correspondente tem duas chamadas, não uma:

```ts
const perguntou = await rotear("remover_item_lista", { descricao: "arame" });
// e a segunda volta com parametros VAZIOS, que e o que chega de verdade
const removeu = await rotear("remover_item_lista", {}, { confirmed: true });
```

⚠️ Passar a descrição de novo na segunda chamada **esconde o defeito**. Foi a
diferença entre o diagnóstico certo e "funciona aqui".

Ver [[contrato-incompleto-diverge-entre-agentes-paralelos]] e
[[briefing-de-suite-cega-precisa-carregar-o-contrato]]: o que salvou aqui foi o
briefing descrever a CONVERSA, e não a função.
