---
tipo: licao
data: 2026-09-14
tags: [financeiro, vencimento, leite, negociacoes, confinamento]
origem: 74bbe29
---

# Vencimento padrão igual à data do fato faz a conta nascer vencida

## O que aconteceu

O fechamento do leite a prazo, sem data de recebimento, usava como vencimento o
`occurred_at` da venda, que num fechamento é o **fim do período já passado**.
Todo fechamento nascia "Vencido" sem o produtor ter errado nada. Achado na tela
em 2026-09-02 e decidido em 2026-09-14: a data passou a ser obrigatória.

Não foi a primeira vez. `createCattleNegotiation` e a negociação de produto já
tinham corrigido o mesmo desenho antes (os comentários "a conta vence HOJE, não
na data do negócio" em `src/lib/actions/negotiations.ts` e
`src/lib/actions/product-negotiations.ts`), porque um registro retroativo
("comprei semana passada, ainda não paguei") nascia vencido e disparava o
alerta `bill_due` na criação.

## Por que importa

`due_date ?? occurred_at` parece o padrão natural, e é certo só quando o fato é
de hoje. Todo fluxo que registra algo **depois** que aconteceu (fechamento de
período, lançamento retroativo, encerramento de lote) transforma esse padrão
em conta atrasada no instante da criação: tela vermelha, alerta falso e a
situação da negociação dizendo "Vencida".

Cada módulo novo que cria conta a receber ou a pagar repete a tentação, e a
correção de um não protege o outro.

## Como aplicar

Ao escrever fluxo que cria conta em aberto, responda antes: **a data do fato
pode estar no passado?**

- Se pode, e o vencimento importa para o produtor, **exija a data** e recuse no
  campo `due_date` (foi o que o leite e o custo avulso do confinamento fizeram).
- Se a data é secundária, o padrão é **hoje**, nunca a data do fato.
- Nunca `due_date ?? occurred_at` em conta pendente.

## Relacionado

- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
- [[copia-repetida-nao-quer-dizer-copia-identica]]
