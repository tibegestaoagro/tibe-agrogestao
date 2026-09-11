---
tipo: armadilha
data: 2026-09-11
tags: [validacao-viva, validacao, estoque, modulo-36]
origem: e3493ab
---

# Dado herdado inválido trava o caminho novo, e a suíte não vê porque ela cria dado bom

## O que aconteceu

O botão "Add à lista de compra", no alerta de estoque baixo, não fazia nada.
Nenhuma mensagem, nenhum item criado. Pela rede:

```
422 {"code":"UNIDADE_INVALIDA","message":"Unidade desconhecida","field":"unit"}
```

A função lia a unidade do PRODUTO e a passava adiante para criar o item. O
produto tinha `kg` gravado, e o vocabulário fechado do estoque tem
`quilograma`. A validação do item recusava a unidade do próprio cadastro.

## Por que nenhuma suíte pegou

Porque toda suíte deste módulo cria produto com unidade válida. Quem escreve um
teste escreve o dado certo: é o reflexo de quem conhece as regras. O produto
torto veio de um script de cenário antigo, escrito antes de o vocabulário
existir.

**É exatamente esse o dado que existe em cliente de verdade**: cadastro feito
antes de uma regra, importado de planilha, ou digitado por alguém que escreveu
a abreviação. A suíte cega também não pega, porque ela é cega para a
implementação, não para o bom senso.

## A regra que fica

Quando um caminho novo LÊ um campo de um registro antigo e o revalida, ele
precisa tolerar o que não passa:

| campo lido de outro registro | o que fazer se for inválido |
|---|---|
| opcional no destino | ignorar, e seguir sem ele |
| obrigatório no destino | recusar **com mensagem que diz o que está errado no CADASTRO** |

O que não pode é o que aconteceu: recusar com uma mensagem sobre um campo que o
produtor não digitou, num botão que ele clicou.

```ts
unit: isStockUnit(produto.unit) ? produto.unit : null,
```

## Como achar antes

Só clicando, com dado que não foi você que criou. O banco de dev deste projeto
acumula cenários de meses, e é mais parecido com o de um cliente do que
qualquer fixture. Ver [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]].
