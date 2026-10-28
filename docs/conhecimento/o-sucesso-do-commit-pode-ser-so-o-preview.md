---
tipo: armadilha
data: 2026-10-28
tags: [deploy, vercel, git]
origem: c58c5f1
---

# O "success" do commit pode ser só o deploy de Preview

## O que aconteceu

Em 28/10/2026, no deploy da F3a do Empório, a branch `emporio-f3` foi
empurrada com o commit final `c58c5f1` e, segundos depois, a `main` foi
avançada para o mesmo commit e empurrada. O status do commit no GitHub
(`commits/<sha>/status`) passou de `pending` a `success` em 30 segundos, mas
o `/docs/api` de produção continuava sem as rotas novas, mesmo recarregado
sem cache. A API de deployments mostrou o motivo: o único deploy do
`c58c5f1` era `Preview`. O de `Production` só apareceu alguns minutos depois.

Na F2b o mesmo fluxo funcionou porque a branch tinha sido empurrada minutos
antes da `main`, e não segundos.

## Por que importa

O status do commit não diz qual ambiente. Ler o "success" do Preview como
deploy de produção é declarar no ar um código que ainda não está, logo depois
de uma migração no Neon: o banco já tem o schema novo e o app ainda é o velho.

## Como aplicar

- Confirme o deploy pela API de deployments, filtrando o ambiente:
  `gh api "repos/tibegestaoagro/tibe-agrogestao/deployments?environment=Production&per_page=1"`,
  e confira que o `sha` é o do push. Só então leia o status desse deploy.
- Depois, a impressão digital no navegador (`/docs/api` ou um token), como
  manda o `CLAUDE.md`.
- Para não cair nisso, não empurre a branch com o commit final logo antes do
  push na `main`: ou empurre a branch antes, ou só a `main`.

## Relacionado

- [[o-preview-da-vercel-escreve-em-producao]]
