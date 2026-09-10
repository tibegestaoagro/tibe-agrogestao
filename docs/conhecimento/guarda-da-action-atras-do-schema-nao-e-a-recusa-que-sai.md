---
tipo: armadilha
data: 2026-09-10
tags: [api, zod, contrato, suite-cega, financeiro, modulo-35]
origem: 49d7651
---

# A guarda da action atrás do schema não é a recusa que sai pela rota

## O que aconteceu

O briefing da suíte `m62` prometia esta recusa:

| situação | code | status | field |
|---|---|---|---|
| valor zero ou negativo | `VALOR_INVALIDO` | 422 | `amount` |

A tabela foi escrita lendo a action, onde o `fail("VALOR_INVALIDO", ...)` está
mesmo. A suíte às cegas rodou contra a ROTA e devolveu outra coisa:

```
status=422 error={"code":"VALIDATION_ERROR","message":"O valor do pagamento precisa ser maior que zero","field":"amount"}
```

O schema da rota tem `z.number().positive("O valor do pagamento precisa ser
maior que zero")`, e ele recusa **antes** de a action ser chamada. Mensagem e
`field` estão certos; o `code` é o genérico de schema, porque toda recusa de
Zod deste projeto sai por `apiErroDeZod`.

## A regra que fica

Quando o schema da rota cobre a mesma condição que uma guarda da action,
**quem responde pela HTTP é sempre o schema**, e o código de negócio da action
nunca chega ao cliente por aquele caminho.

Isso não quer dizer que a guarda seja inútil: ela é o que protege quem não
passa pela rota, e o agente do WhatsApp chama as actions direto (invariante 6).
O que muda é o que se pode AFIRMAR sobre ela:

- **contrato de API** (o que o consumidor lê por `code`): o do schema.
- **contrato da action** (o que o handler do WhatsApp recebe): o da guarda.

A suíte passou a provar os dois, um de cada vez, em vez de escolher um e
declarar o outro errado.

## Como não repetir

Uma tabela de recusas escrita a partir do `fail(...)` da action descreve a
camada de baixo. Antes de mandá-la num briefing como contrato de API, confira
se o schema da rota já cobre a mesma condição: se cobre, o `code` que sai é o
do schema.

É a mesma família de [[tabela-feita-por-grep-mede-o-nome-da-variavel]]: o
levantamento mediu uma coisa e foi escrito como se medisse outra. E é a
segunda vez que a suíte cega cobra o briefing em vez do contrário, como em
[[suite-cega-cobra-mais-do-que-o-briefing-mandou]].
