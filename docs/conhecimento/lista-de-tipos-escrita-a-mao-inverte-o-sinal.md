---
tipo: armadilha
data: 2026-09-02
tags: [typescript, enum, negociacoes, financeiro, leite, modulo-32]
origem: validacao ao vivo da fase 3 da Area Leite
---

# Lista de tipos escrita à mão inverte o sinal do dinheiro

## O que aconteceu

`ehVenda` decidia de que lado o dinheiro entra assim:

```ts
return tipo === "venda_gado" || tipo === "venda_produto" || tipo === "evento";
```

O tipo novo `venda_leite` caiu no `false` **sem o `tsc` reclamar**. A situação
do negócio passou a procurar uma DESPESA num negócio cujo lançamento é receita,
não achou nada, e a tela de Negociações mostrou, para uma venda de R$ 1.200,00
gravada corretamente:

```
VALOR: sem dinheiro        SITUAÇÃO: Sem venda
```

O banco estava certo o tempo todo. Quem estava errado era a **leitura**.

## Por que a suíte não pegou

A suíte da fase 3 provava a ESCRITA: a `Negotiation` nasceu, o lançamento é
`income`, `paid`, R$ 1.200, sob `related_module: leite`. Tudo verdade, e nada
disso passa por `ehVenda`.

O que faltava era uma asserção sobre o que a TELA lê. Ela existe agora
(`recebe_dinheiro`, `situacao`, `totais.principal` na `m54`), e foi escrita
depois do defeito, não antes.

## É a TERCEIRA vez neste mesmo ponto

O sinal já inverteu aqui em 28/08 com o leilão (a tela dizia "Quitada" e somava
custos numa venda) e no mesmo dia com a permuta (dizia "A pagar" numa troca em
que o produtor recebeu). Os comentários das duas correções estão no arquivo, e
mesmo assim a terceira aconteceu, porque a estrutura continuava sendo uma lista
de comparações.

## A regra

**Decisão por TIPO de enum se escreve como `Record<Enum, ...>`, nunca como
cadeia de `===`.** Com o `Record`, o tipo novo não compila até alguém decidir
o valor dele. É a mesma lição de
[[record-string-e-onde-o-enum-cresce-sem-avisar]], aplicada a um `boolean` em
vez de a um rótulo: ali o sintoma era o nome cru na tela, aqui é o dinheiro no
lado errado, que é pior porque parece um número plausível.

Onde isso vive: `DINHEIRO_ENTRA_POR_TIPO` em
`src/lib/actions/negotiations.ts`.

Relacionado: [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]].
