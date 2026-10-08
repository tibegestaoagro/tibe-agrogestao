---
tipo: licao
data: 2026-10-08
tags: [agente-whatsapp, llm, avaliacao, schema]
origem: docs/agents/agente-whatsapp/avaliacao-fase-8.md
---

# A nota da avaliação não vê campo a mais, e uma intenção nova pode mexer nos campos das vizinhas

## O que aconteceu

Na Fase 8 (E6), a intenção `consultar_pastos` entrou no registro do rebanho em
segundo lugar e com um campo `pasto`, que já existia no negócio de gado. A
versão passou nos 53 casos novos e na regressão em intenção. Só a queda de
campos da regressão levou a uma sonda direta: a mesma mensagem, 8 a 12 vezes,
com e sem a mudança.

- "comprei quinze garrote... pago dia quinze" passou a sair `pago: true` em
  11 de 12 chamadas (1 de 12 sem a mudança): compra a prazo gravada como paga.
  O pontuador só confere os campos que o caso espera, e nenhum caso esperava
  `pago`. Campo a mais e errado não perde ponto.
- "morreu uma novilha... eh pera, foram duas" saía com todos os campos nulos em
  6 de 8. A ordem da lista decide a ordem do schema, e o campo novo subiu para
  o começo.

Intenção no fim da lista e campo com nome próprio (`qual_pasto`) zeraram os
dois.

## Por que importa

Mudança de prompt aprovada pela nota pode piorar justamente o campo que grava
dinheiro, e nada na tabela mostra isso. A regressão tem de comparar o que sai,
não só se o que se esperava saiu.

## Como aplicar

- Intenção nova vai para o FIM da lista do domínio, e com campo de nome que não
  colide com o de outra intenção, a menos que o sentido seja o mesmo.
- Quando os campos da regressão caem, sondar os casos que caíram contra o
  registro sem a mudança (`git stash` dos arquivos de `intencoes/`), contando
  também os campos que o caso não espera.

## Relacionado

- [[campo-homonimo-no-dominio-herda-a-descricao-da-primeira-intencao]]
- [[a-etapa-de-dominio-decide-o-que-a-extracao-pode-responder]]
- [[filtro-na-busca-esconde-o-defeito-que-o-teste-procura]]
