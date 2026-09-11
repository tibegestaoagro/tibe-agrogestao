---
tipo: armadilha
data: 2026-09-10
tags: [teste, suite, data, mao-de-obra, previsao-rolante]
origem: e5e0be9
---

# A asserção pode passar com o defeito plantado, e ninguém percebe

## O que aconteceu

A `m57` acusava duas falhas. A leitura óbvia era defeito de produto: as
mensagens diziam "o ciclo é ancorado no VENCIMENTO" e "pagar ATRASADO não pula
um mês", e o valor recebido vinha um mês à frente do esperado. Cheguei a
afirmar ao usuário que o trabalhador perdia uma competência na previsão.

Estava errado. **Eram dois defeitos no TESTE, e nenhum no produto.**

## Defeito 1: data absoluta num teste cujo dado nasce de `new Date()`

As asserções comparavam contra `"2026-10-05"` e `"2026-11-05"` escritos na mão.
A previsão que elas medem nasce em `criarTrabalhador`, que chama
`garantirPrevisao(tx, worker, new Date())`.

O teste foi escrito na janela de 1 a 4 de setembro, quando a próxima data de
pagamento dia 5 caía em setembro. **No dia 5 ele apodreceu**: a previsão passou
a nascer em outubro, e tudo deslocou exatamente um mês.

Cheirou a defeito de produto porque o deslocamento era coerente e a mensagem do
teste era sobre regra de negócio.

**Sinal para reconhecer:** falha que aparece sem ninguém ter mexido no módulo,
e cujo valor recebido difere do esperado por um período redondo (um mês, uma
semana, um dia).

## Defeito 2: a asserção nunca discriminou nada

O mais sério, e só apareceu porque **plantei o defeito de propósito** antes de
confiar na correção. Troquei a âncora para a data do pagamento:

```ts
const ancora = quando;              // em vez de: previsao.due_date ?? quando
```

E a asserção **passou assim mesmo**.

O motivo é aritmético: o ciclo é mensal no dia 5, e o teste pagava com **quinze
dias** de atraso. Partindo do vencimento (05/10) ou do pagamento (20/10), a
próxima data com dia 5 é 05/11 nos dois casos. As duas âncoras coincidem.

Só um atraso que **ultrapassa o vencimento seguinte** separa os casos. Com
quarenta dias:

```
❌ a próxima parte do vencimento, não do dia em que pagou
   -> venceu 2026-10-05, pagou 2026-11-14, proxima 2026-12-05
```

A asserção existia desde que a fase 33.1 foi escrita e nunca protegeu nada.

## Por que importa além da m57

O padrão rolante da Mão de Obra é o que o usuário decidiu reusar em **dois
lugares novos**: conta recorrente na fase 35.2 do Financeiro (decisão 22) e
tarefa recorrente no Meu Dia (decisão 25).

Sem ter plantado o defeito, eu teria copiado para dois módulos uma regra cuja
garantia era decorativa, e as três cópias passariam verdes com a âncora errada.

## O que fazer

1. **Esperado derivado, nunca escrito na mão**, quando o dado nasce de `new
   Date()`. Calcule a partir do que existe: aqui, o vencimento anterior.
2. **Plantar o defeito é obrigatório**, e não é cerimônia. É o único jeito de
   saber se a asserção mede o que a frase dela promete. Ver
   [[trava-so-vale-depois-de-voce-a-ver-falhar]] e
   [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]], do qual este
   caso é a variante mais traiçoeira: aqui o teste passava antes e depois de
   PLANTAR o defeito, não de corrigi-lo.
3. **Escolha o caso que separa os ramos.** Uma asserção sobre "qual das duas
   âncoras" precisa de entrada em que as duas âncoras dão respostas
   diferentes. Quinze dias não servia; quarenta serve.
4. **Desconfie da própria conclusão rápida.** Ver
   [[filtro-na-busca-esconde-o-defeito-que-o-teste-procura]], que é o mesmo
   erro por outro caminho: acreditar no que o teste diz sem conferir o que ele
   mede.
