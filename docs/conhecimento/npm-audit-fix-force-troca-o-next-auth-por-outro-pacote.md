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

## Relacionado

- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
- [[o-preview-da-vercel-escreve-em-producao]]
