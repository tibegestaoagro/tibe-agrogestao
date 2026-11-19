---
tipo: armadilha
data: 2026-11-19
tags: [producao, prisma, vercel, neon, desempenho]
origem: 0d8e1955 (transação de 30 s), ec190eb2 (região gru1), scripts/m126-emporio-transacao-na-distancia.test.ts
---

# A transação que passa local cai em produção pela distância até o banco

## O que aconteceu

Em 18/11/2026 a Central do Milho tentou trocar o fiado de uma venda por débito e
leu "Erro interno. Se precisar de suporte, informe o código a5571e34". O código
só existe no log da Vercel, que esta sessão não lê. O banco de produção contou
a história: **nenhuma venda substituída em toda a produção**, nem da Agromax. A
edição de venda (Q249) nunca tinha funcionado lá, com a suíte e o roteiro de
navegador verdes desde o dia em que nasceu.

A causa: a Vercel, sem `regions` no `vercel.json`, roda em `iad1` (EUA), e o Neon
está em `sa-east-1` (São Paulo). Cada consulta custa uns 120 ms de ida e volta.
A edição cancela a venda antiga e grava a nova numa transação interativa só,
com umas 60 consultas, e o Prisma encerra transação interativa aos **5 s**
(padrão): "A query cannot be executed on an expired transaction". No banco local
a mesma transação leva 150 ms.

A reprodução local veio de pôr um atraso em cada consulta, trocando
`pg.Client.prototype.query` antes de importar o Prisma: com 120 ms, o mesmo erro,
idêntico. A venda normal levava 3,4 s nessa distância: passava, sem folga.

Correção: `transactionOptions: { timeout: 30_000, maxWait: 10_000 }` no client
base (`src/lib/prisma.ts`, vale também para os escopados por tenant) e
`"regions": ["gru1"]` no `vercel.json`. Conferido depois do deploy com
`X-Vercel-Id: gru1::gru1::...` numa única chamada à API.

## Por que importa

Nenhuma prova local enxerga latência: suíte, `tsc`, roteiro e juiz rodam com o
banco a 1 ms. Toda operação que cresce em consultas dentro de uma transação
(venda com muitas linhas, edição, cancelamento, despesa fixa de 12 meses) está a
um passo do mesmo erro, e o cliente vê só "Erro interno".

## Como aplicar

- "Erro interno" com código só em produção, e o fluxo passa local: suspeite de
  tempo antes de suspeitar de dado. Conte no banco de produção (só leitura) se a
  operação já deu certo alguma vez.
- Para reproduzir, injete atraso no `pg.Client.prototype.query` (a suíte `m126`
  mostra como, ligando o atraso só no trecho medido) em vez de procurar a
  diferença de dados.
- Transação nova com laço de consultas: rode a `m126` ou meça com o atraso. A
  região `gru1` tirou a distância de hoje, mas o limite de 30 s é a rede.
- O `transactionOptions` mora no client base: não espalhe `timeout` por chamada
  (a `transacaoLonga` de `emporio-despesas.ts` é anterior a isso).

## Relacionado

- [[confirmar-deploy-pelo-status-do-commit]]
- [[o-ci-estourou-a-memoria-do-node-com-o-projeto-maior]]
