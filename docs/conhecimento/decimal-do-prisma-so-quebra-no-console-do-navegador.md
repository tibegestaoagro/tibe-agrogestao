---
tipo: armadilha
data: 2026-09-02
tags: [next, prisma, ui, validacao-viva]
origem: src/app/(dashboard)/servicos/page.tsx
---

# Passar a linha crua do Prisma para um Client Component só quebra no console do navegador

## O que aconteceu

A tela `/servicos` fazia `db.property.findMany()` e `db.pasture.findMany()` sem
`select`, e passava o resultado inteiro para `<ServiceJobForm>`, que é
`"use client"`. As duas tabelas têm `area_hectares` como `Decimal`, e o React 19
recusa serializar isso:

```
Only plain objects can be passed to Client Components from Server Components.
Decimal objects are not supported.
```

Estava assim desde a fase 33.2 (01/09) e sobreviveu a `npx tsc --noEmit`,
`npm run lint`, `npm run check` com as 15 conferências, e às suítes `m58` e
`m59`. A página **renderizava**, o formulário **abria**, e o serviço era
registrado normalmente. O único sinal era o contador "2 Issues" do overlay de
desenvolvimento do Next, no canto da tela, que só existe em `next dev` e só
aparece para quem abre o navegador.

Foi achado em 02/09, na validação viva da fase 34.1, olhando a tela.

## Por que importa

O tipo do Prisma é `Decimal`, e o TypeScript **aprova** passá-lo adiante: a prop
é tipada como a linha do Prisma, e a linha do Prisma tem `Decimal`. Não existe
erro de tipo a ser pego. A serialização é um contrato de runtime do React, e
nenhuma trava estática deste projeto olha para ele.

A consequência não é cosmética: em produção (`next build`), a mesma serialização
falha sem overlay para avisar, e o que o produtor vê depende de onde o erro
estoura. A tela que passou meses "funcionando em dev" é a que quebra no dia em
que alguém acrescenta um campo obrigatório perto dali.

## Como aplicar

**Toda consulta cujo resultado atravessa para um Client Component leva `select`
explícito.** Não é economia de query: é a lista de campos que você garante
serem serializáveis.

```ts
db.property.findMany({ select: { id: true, name: true } })
```

O cheiro a procurar numa revisão: um `findMany()` sem `select` num Server
Component cujo resultado vai direto para uma prop de componente `"use client"`.

E o cheiro no navegador: o contador de issues do overlay do Next. Ele é a única
evidência, então **abrir a tela e olhar o canto faz parte da validação**, não
só clicar nos botões.

## Relacionado

- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
- [[dev-server-servido-com-client-prisma-velho]]
