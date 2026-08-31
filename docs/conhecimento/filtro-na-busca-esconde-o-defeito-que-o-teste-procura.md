---
tipo: licao
data: 2026-08-31
tags: [teste, financeiro, rebanho, portao]
origem: 237d548
---

# Filtro na busca esconde o defeito que o teste procura

## O que aconteceu

`cancelStay` procurava as contas a pagar da estadia assim:

```ts
where: { related_module: "rebanho", related_id: stayId }
```

A cobrança do confinamento nasce em `related_module: "confinamento"`, então o
cancelamento **não achava nada** e a despesa continuava `pending` para sempre:
seguia em Contas a pagar, seguia pesando na DRE e seguia gerando alerta de
vencimento.

O teste que deveria pegar isso existia, e passava. Ele era:

```ts
const contas = await db.financialEntry.findMany({
  where: { related_module: "rebanho", related_id: id },
});
check("a conta a pagar pendente some", contas.length === 0);
```

**O mesmo filtro, do mesmo jeito.** Uma conta viva em outro módulo não saía dali
como conta órfã: saía como "zero contas". O teste aprovava o defeito.

## Por que importa

Quando o teste repete o filtro da consulta que ele testa, ele deixa de ser um
segundo par de olhos e vira um espelho. E o modo de falha é o pior possível: um
✅ verde afirmando exatamente o que está errado.

Isto é o mesmo defeito de categoria de
[[portao-mede-a-relacao-que-lhe-deram]], agora numa suíte em vez de num portão.

## Como aplicar

**Busque largo, afirme estreito.** O filtro fica na asserção, não no `where`:

```ts
const contas = await db.financialEntry.findMany({ where: { related_id: id } });
check("a conta some, em modulo NENHUM", contas.length === 0,
      contas.map((c) => `${c.related_module}/${c.status}`).join(","));
```

O detalhe do `check` também mudou: em vez de `String(contas.length)`, ele
imprime `confinamento/pending`, que **nomeia o defeito** em vez de dizer que o
número não bateu.

E do lado do código: se a chave já identifica sozinha (aqui `related_id` é um
cuid, e só a cobrança da própria estadia nasce com ele), **não filtre por mais
nada**. Derivar o módulo de um mapa (`COBRANCA[stay.type]`) foi tentado e é
pior: o mapa muda com o tempo, a conta gravada ontem guarda o valor de ontem, e
o cancelamento passaria a perder as contas antigas daquele tipo.

## Relacionado

- [[portao-mede-a-relacao-que-lhe-deram]]
- [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]
- [[fixture-de-rebanho-precisa-de-situacao-e-dono]]
