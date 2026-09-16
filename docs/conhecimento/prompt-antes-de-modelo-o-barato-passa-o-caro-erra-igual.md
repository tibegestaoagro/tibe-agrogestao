---
tipo: licao
data: 2026-09-16
tags: [agente-whatsapp, avaliacao, llm, custo]
origem: docs/agents/agente-whatsapp/avaliacao-fase-3-r1.md
---

# Quando os seis modelos erram no mesmo lugar, o defeito é do prompt

## O que aconteceu

A primeira rodada da avaliação da Fase 3 mediu seis modelos da OpenAI contra 337
casos. **Nenhum passou**, e a distância entre o mais caro e o mais barato era
pequena perto do preço: `gpt-5.6-terra` 79,6% de intenção a US$ 2,54 por mil
mensagens, contra `gpt-4o-mini` 60,1% a US$ 0,32. Zero gravação indevida em
todos.

A tabela de erros mais frequentes tinha a mesma frase errando **nos seis
modelos**: "vacinei o brinco 1234, custou 35" virava dois pedidos, um deles um
lançamento financeiro que ninguém pediu; "quero o relatório do rebanho" virava
"não entendi".

Três iterações de ajuste de prompt depois, o `gpt-5.6-luna` saiu de 73,4% para
93,4% na partição de ajuste, e fez 97,7% na medição limpa, passando o modelo
caro por um décimo do preço.

## Por que importa

Trocar de modelo é a reação cara e imediata; ela compra alguns pontos. Corrigir
a instrução compra dezenas, e vale para todos os modelos ao mesmo tempo,
inclusive para o que vier depois.

## Como aplicar

- Antes de subir de modelo, olhe se o erro se repete em todos. Erro comum é
  prompt; erro que só o barato comete é modelo.
- Meça o custo por mil mensagens, não o preço por token: com prompt grande e
  duas etapas, a diferença de preço por token vira outra coisa na conta final.
- Guarde a rodada sem ajuste nenhum: ela é a linha de base que mostra se o
  ranking mudou depois.

## Relacionado

- [[ajustar-prompt-olhando-o-relatorio-inteiro-contamina-a-nota]]
- [[a-etapa-de-dominio-decide-o-que-a-extracao-pode-responder]]
