---
tipo: referencia
data: 2026-09-14
tags: [deploy, vercel, github, producao]
origem: rodadas de merge de 2026-09-14
---

# O status do commit no GitHub diz quando o deploy da Vercel terminou, sem tocar produção

## O que aconteceu

Em 2026-09-14 foram quatro deploys seguidos. Sondar produção em laço com `curl`
é proibido neste projeto (a proteção anti-bot da Vercel bloqueou tudo quando
isso foi feito), e ler cedo demais no navegador mostra a versão ANTERIOR: no
primeiro deploy do dia, o `start_url` lido ainda era `/dashboard` um minuto
depois do push.

A Vercel publica o andamento como **status do commit** no GitHub. Ler esse
status consulta a API do GitHub, não a aplicação:

```
sha=$(git rev-parse HEAD)
gh api repos/tibegestaoagro/tibe-agrogestao/commits/$sha/statuses \
  --jq '[.[]|select(.context|test("Vercel"))][0]|"\(.state) \(.description)"'
```

Devolve `pending Vercel is deploying your app` e depois
`success Deployment has completed`. Nos deploys do dia levou de 1 a 3 minutos.

## Por que importa

É o jeito de esperar o deploy terminar num laço de 30 segundos sem disparar a
mitigação da Vercel e sem adivinhar quanto tempo esperar. Um `failure` aparece
ali também, antes de alguém descobrir pela tela.

⚠️ **`success` diz que a Vercel publicou, não que o código novo está servindo o
que se espera.** Continue confirmando pela impressão digital no navegador, como
o `CLAUDE.md` manda: a rota nova no `/docs/api`, ou o token do `globals.css`.

## Como aplicar

1. Depois do push na `main`, faça o laço acima até `success` ou `failure`.
2. Só então abra o navegador e leia a impressão digital da mudança.

## Relacionado

- [[next-dev-mais-cookie-valida-o-servidor-sem-navegador]]
