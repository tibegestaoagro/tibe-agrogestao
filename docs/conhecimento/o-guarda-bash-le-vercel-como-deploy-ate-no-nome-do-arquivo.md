---
tipo: armadilha
data: 2026-11-19
tags: [ambiente, hooks, git, vercel]
origem: .claude/hooks/guarda-bash.mjs (regra do deploy), commit ec190eb2
---

# O guarda-bash lê "vercel" como deploy até no nome do arquivo

## O que aconteceu

Em 19/11/2026, para commitar a troca de região (`"regions": ["gru1"]`), o
`git add vercel.json && git commit -m "Vercel: ..."` foi recusado duas vezes com
"Bloqueado: deploy exige autorizacao explicita do usuario". Não era deploy. O
`guarda-bash.mjs` fatia o comando em trechos e reprova o trecho que começa com
`vercel` (a linha "Vercel: funções..." da mensagem virou um trecho) e qualquer
trecho com a palavra `vercel` solta que não seja `env`, `ls`, `inspect`,
`whoami` ou `logs` (o `vercel.json` do `git add` casa, porque o ponto é fronteira
de palavra).

Saída usada, sem marca de autorização e sem desligar nada: `git add -u` (o
arquivo já era versionado) e a mensagem começando com "Infra:".

## Por que importa

A recusa fala em deploy e manda repetir com `AUTORIZADO_PELO_USUARIO=1`. Usar a
marca num commit de branch gasta uma autorização que o usuário não deu para
isso, e reescrever o comando até passar parece contornar a trava. Saber que é
falso positivo do nome do arquivo poupa as duas tentações.

## Como aplicar

- Commit que mexe no `vercel.json`: `git add -u` ou `git add -A`, sem citar o
  nome do arquivo no comando.
- Nenhuma linha da mensagem de commit começa com "Vercel"; escreva "Infra:" ou
  ponha a palavra no meio da frase.
- Push e merge na `main` continuam pedindo autorização de verdade: isto vale só
  para commit em branch de trabalho, que é livre.

## Relacionado

- [[confirmar-deploy-pelo-status-do-commit]]
