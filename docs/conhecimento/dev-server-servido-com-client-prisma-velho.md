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

## O que NÃO era

Perdi tempo com duas hipóteses erradas antes de olhar o log, e as duas ficam
registradas para ninguém repetir:

- Não era a conversão de tipo do `delegates()`
  (`src/lib/prisma-delegates.ts`): ela é só de tipo, o objeto em runtime é o
  mesmo.
- Não era o número de relações do schema: tirar cinco relações e regerar
  manteve o erro idêntico.

Relacionado: [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]],
[[turbopack-nao-cria-processo-quando-a-maquina-esta-cheia]].
