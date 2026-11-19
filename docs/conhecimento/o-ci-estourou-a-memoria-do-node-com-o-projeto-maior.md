---
tipo: armadilha
data: 2026-11-18
tags: [ci, ambiente, typescript, deploy]
origem: 58e077fc (falhou), 06c7d346 (corrigido)
---

# O CI estourou a memória do Node com o projeto maior, e o tsc local continuava limpo

## O que aconteceu

Em 18/11/2026, o merge da paginação das listas (`58e077fc`) foi para produção
(Vercel verde, `/docs/api` atualizado), mas o job "Conferencia estatica" do CI
reprovou. Não era tipo errado: o `npx tsc --noEmit` morreu com "JavaScript heap
out of memory" (exit 134) perto dos 2 GB, o limite padrão do Node no runner. No
merge anterior, minutos antes, a mesma etapa tinha passado: o projeto cresceu
o bastante (suítes grandes como a `m125`) para cruzar o teto. Localmente o
`tsc` passava, porque a máquina tem outro limite.

A primeira correção pôs `NODE_OPTIONS` só no passo do Type-check, e o passo
seguinte (Build, `next build`) estourou do mesmo jeito. A que ficou põe
`NODE_OPTIONS: --max-old-space-size=6144` no `env` do job estático inteiro
(`.github/workflows/ci.yml`).

Na mesma correção, um `Edit` falhou porque o bloco de `env` aparece em dois jobs
do arquivo, e o `Edit` seguinte, mandado na mesma rodada, aplicou: o commit saiu
**sem** a configuração em lugar nenhum. Só o diff mostrou.

## Por que importa

O deploy da Vercel não depende do CI, então a produção sobe e o CI fica vermelho
na `main` sem ninguém olhar, e a próxima reprovação de verdade se esconde atrás
desta. A mensagem de OOM aparece como "Type-check" reprovado, o que faz pensar em
erro de tipo.

## Como aplicar

- Depois de todo merge, confira o status do commit no GitHub (Vercel E os jobs
  do CI), não só o deploy: `gh api repos/<dono>/<repo>/commits/<sha>/check-runs`.
- "heap out of memory" no CI é limite de memória, não código: a correção é o
  `NODE_OPTIONS` no job, e o passo seguinte do mesmo job provavelmente precisa
  também.
- Correção de CI se prova no push da branch (o CI roda nela) antes de pedir o
  merge.
- Quando um `Edit` falha numa rodada com vários, rode `git diff` antes do commit:
  o que passou pode ter desfeito metade da mudança.

## Relacionado

- [[confirmar-deploy-pelo-status-do-commit]]
