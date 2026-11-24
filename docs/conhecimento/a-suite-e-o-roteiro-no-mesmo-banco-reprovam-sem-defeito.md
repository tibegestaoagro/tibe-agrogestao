---
tipo: armadilha
data: 2026-11-23
tags: [validacao, testes, navegador, banco-local, paralelo]
origem: rodada do Next 16.4.6 (d91f9f1c a 93eb9bde)
---

# A suíte inteira e o roteiro de navegador no mesmo banco, ao mesmo tempo, reprovam sem defeito

## O que aconteceu

Em 23/11/2026, para ganhar tempo, o `npm run test:all` e os roteiros de
navegador rodaram juntos no mesmo Postgres do Docker. Duas reprovações, nenhuma
de código:

- a `m92` caiu com `TransactionWriteConflict` (Prisma com adapter-pg): duas
  transações escreviam ao mesmo tempo, uma da suíte e outra do cenário do
  roteiro. Rodada sozinha, passou;
- o roteiro `emporio-franqueado` deu 14 falhas em cascata a partir de "o
  orçamento é salvo". A lista de lojas estava cheia das lojas que as suítes
  criavam e apagavam. Repetido sozinho, passou com 0 falha.

## Por que importa

O sintoma parece regressão da mudança em teste (aqui, uma troca de versão do
Next). Sem repetir isolado, a conclusão seria "o Next novo quebrou o
orçamento", e viria uma investigação de defeito que não existe.

## Como aplicar

- Rode o `test:all` e os roteiros em sequência, não juntos. Se rodar junto por
  pressa, toda falha precisa ser repetida isolada antes de virar defeito.
- `TransactionWriteConflict` numa suíte que passa sozinha é concorrência, não
  regra de negócio.
- O mesmo vale para dois roteiros ao mesmo tempo, ou para um agente rodando
  suíte enquanto outro roda roteiro.

## Relacionado

- [[agentes-da-mesma-onda-veem-o-plantio-um-do-outro]]
- [[a-conta-do-seed-acumula-o-que-os-cenarios-deixam]]
- [[a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador]]
