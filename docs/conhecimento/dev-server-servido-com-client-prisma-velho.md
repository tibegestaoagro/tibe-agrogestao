---
tipo: armadilha
data: 2026-09-02
tags: [prisma, next, dev, turbopack, leite, modulo-32]
origem: validacao ao vivo da fase 2 da Area Leite
---

# O `next dev` serve o client Prisma que existia quando ele subiu

## O que aconteceu

Model novo no `schema.prisma`, `prisma generate` rodado, `tsc` limpo, suíte da
fase 2 **verde com 47 asserções**. A primeira chamada à rota nova, contra o
servidor de desenvolvimento, devolveu:

```
500 INTERNAL_ERROR
TypeError: Cannot read properties of undefined (reading 'findMany')
    at getMilkPositions (...)
```

`db.milkMovement` era `undefined`. A mesma linha, chamada por `tsx` na suíte,
funcionava.

## Por que

O `next dev` já estava no ar quando o `prisma generate` rodou. O bundle dele
carregava o client gerado ANTES do model existir, e nesse client a delegate
`milkMovement` simplesmente não existe. O Turbopack não reconstrói
`src/generated/prisma` por conta própria: para ele é código-fonte que não mudou
de forma que dispare invalidação.

**Reiniciar o servidor resolveu**, e o número certo apareceu na primeira
tentativa.

## Como reconhecer

O sintoma engana porque parece erro de lógica. Três sinais de que é isto:

1. A suíte passa e a rota falha, no MESMO código.
2. O erro é `undefined` lendo um método de delegate (`findMany`, `create`), e
   não um erro de dado.
3. O model envolvido é novo naquela sessão.

## A regra

**Depois de `prisma generate`, reinicie o `next dev` antes de validar rota
nova.** Vale para `db:deploy` também, quando ele vem junto de model novo.

## ⚠️ Reiniciar nem sempre basta: o cache do Next também guarda

Em 2026-09-02, na fase 3, o mesmo erro voltou com o servidor **recém-iniciado**,
e desta vez o sintoma foi outro:

```
PrismaClientValidationError
Invalid `prisma.milkMovement.findMany()` invocation:
  negotiation_id: null
  ~~~~~~~~~~~~~~
```

A coluna existia no schema, no banco e no client gerado (o `tsc` passava e o
script `tsx` funcionava), e mesmo assim o servidor não a conhecia: o cache de
compilação em `.next` guardava uma cópia antiga do client.

**Apagar `.next` inteiro e subir de novo resolveu.** Quando o reinício não
resolver, é este o passo seguinte, e não procurar erro na lógica.

## O que NÃO era

Perdi tempo com duas hipóteses erradas antes de olhar o log, e as duas ficam
registradas para ninguém repetir:

- Não era a conversão de tipo do `delegates()`
  (`src/lib/prisma-delegates.ts`): ela é só de tipo, o objeto em runtime é o
  mesmo.
- Não era o número de relações do schema: tirar cinco relações e regerar
  manteve o erro idêntico.

## 2026-09-14: voltou com colunas novas, e o sintoma foi a página inteira

Duas colunas acrescentadas a `Task` (`recurrence_anchor`, `completed_at`),
`db:deploy` e `prisma generate` rodados, suíte verde. O `/meu-dia` no `next dev`
que já estava no ar respondeu **500 com a tela genérica "This page couldn't
load"**, sem apontar Prisma em lugar nenhum da página. Reiniciar o servidor
resolveu na primeira tentativa.

A regra desta nota já existia, e a sessão só a lembrou depois do 500: é o caso
de [[escrever-a-licao-nao-impede-repeti-la]]. Vale como terceiro sinal de
reconhecimento: **500 genérico em página que usa o model migrado, logo depois de
migração, é reinício de servidor antes de ser defeito.**

Relacionado: [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]],
[[turbopack-nao-cria-processo-quando-a-maquina-esta-cheia]].
