---
tipo: armadilha
data: 2026-11-10
tags: [testes, redis, suites]
origem: scripts/m108-emporio-boleto-e-titular.test.ts
---

# A suíte que importa a rota de token não encerra sozinha

## O que aconteceu

A `m108` imprimia "passaram", fechava o Prisma com `$disconnect` e ficava
pendurada até o `timeout` matar o processo (saída 124, quatro minutos).
A rota de token (`/api/v1/auth/token`) abre o Redis do limitador de
tentativas, e essa conexão segura o processo. As suítes antigas terminam com
`process.exit(falhas === 0 ? 0 : 1)`; a nova, escrita por um subagente, usava
`process.exitCode`. Depois do `process.exit` ela terminou em 4 segundos.

## Por que importa

Suíte que não encerra trava o `npm run test:all` e parece lenta ou presa, e
um subagente que roda em segundo plano deixa o processo vivo e a tarefa
"esperando trabalho próprio".

## Como aplicar

- Suíte nova termina com `process.exit(falhas === 0 ? 0 : 1)` e
  `main().catch(... process.exit(1))`. Ponha isso no briefing de quem escreve.
- Suíte que passa e não volta: procure conexão aberta (Redis) antes de culpar
  o banco.

## Relacionado

- [[briefing-de-suite-cega-precisa-carregar-o-contrato]]
