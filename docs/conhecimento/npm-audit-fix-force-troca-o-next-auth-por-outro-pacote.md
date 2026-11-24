---
tipo: armadilha
data: 2026-10-27
tags: [dependencias, seguranca, next-auth, npm]
origem: seguranca-next-zod, seguranca-prisma, seguranca-nodemailer (26/10)
---

# O npm audit fix --force troca o next-auth por outro pacote de 2018

## O que aconteceu

Em 26/10 o `npm audit` acusava 19 vulnerabilidades. Para o `next-auth`
(5.0.0-beta.32), a correção que ele propunha era `next-auth@1.12.1`, marcada
como "semver major". Não é uma versão nova: é um pacote de 2018, feito sobre
Express e Passport, que só compartilha o nome. O `next-auth` não tinha
advisory próprio; aparecia só porque depende do nodemailer.

O caminho seguro foi um passo por branch: next e zod, depois prisma mais
`npm audit fix` sem `--force`, e por fim nodemailer 10 com `overrides`. O
audit chegou a 0 sem nenhum `--force`.

## Por que importa

`--force` aplica a "correção" sem perguntar. O login inteiro (as duas
instâncias NextAuth) quebraria, e como merge na `main` é deploy, quebraria em
produção. O audit, depois disso, mostraria menos alertas: o número melhora
enquanto o sistema para.

## Como aplicar

- Nunca `npm audit fix --force` neste projeto.
- Quando o audit propuser semver major, confira no registro (`npm view
  <pacote>@<versao> time`) se a versão é mais nova ou só tem número menor.
- Alerta herdado de dependência (o pacote não tem advisory próprio) se resolve
  na dependência: aqui, `"overrides": { "nodemailer": "$nodemailer" }`.
- Ao subir o next-auth, tire o `overrides` se a versão nova já aceitar o
  nodemailer instalado.
- `prisma@latest` aponta para release candidate da 8: suba por versão exata.

## Acréscimo de 2026-11-23: o audit propôs o Prisma 6, e o `overrides` resolveu na mesma família

O `npm audit` acusou um ReDoS na biblioteca `effect`, que o `@prisma/config`
prende em 3.20.0. A "correção" proposta era `prisma@6.12.0`, semver major para
trás, o que quebraria o Prisma 7 do projeto. A versão corrigida da `effect` é
3.22.1 em diante, na mesma família 3. Solução:
`"overrides": { "effect": "3.22.5" }` no `package.json`. O audit foi a 0.

Conferido antes do merge: `prisma validate`, `prisma generate`,
`migrate status`, `migrate diff` vazio, `test:drift`, `test:isolation`, uma
suíte do Empório e o build. No mesmo dia, o Next subiu de 16.4.3 para 16.4.6
por versão exata (7 avisos fechados, só os pacotes do Next mudaram no lock).

- Quando o audit propuser descer uma major, procure a dependência de onde vem o
  alerta (`npm ls <pacote>`) e veja se existe versão corrigida na mesma família.
- Ao subir o Prisma, confira se o `@prisma/config` novo já traz a `effect`
  corrigida, e tire o override se trouxer.

## Relacionado

- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
- [[o-preview-da-vercel-escreve-em-producao]]
