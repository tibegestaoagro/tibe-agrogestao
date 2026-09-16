---
tipo: armadilha
data: 2026-09-16
tags: [agente-whatsapp, avaliacao, openai, ambiente]
origem: scripts/avaliacao/limite.ts
---

# O teto de tokens por minuto da conta reprova o modelo, e o sintoma parece defeito dele

## O que aconteceu

Na primeira rodada da avaliação da Fase 3, o `gpt-4o-mini` terminou com **99 das
337 mensagens em erro**, todas em cerca de 1 segundo, em blocos, a partir do
caso 143. A leitura fácil seria "o modelo falhou"; a nota dele despencou por
isso.

A sonda mostrou outra coisa: a conta tem teto de **200 mil tokens por minuto** e
10 mil requisições por dia **por modelo**. Com quatro mensagens em paralelo, cada
uma fazendo duas ou três chamadas de alguns milhares de tokens, o teto estoura em
segundos e a API devolve 429.

A correção foi esperar o tempo que a própria resposta informa ("try again in
1.2s") e repetir, em vez de contar como falha, mais baixar a concorrência de 4
para 2. Na rodada seguinte, o mesmo modelo teve **1 falha**.

## Por que importa

Um limite da conta reprova qualquer modelo por igual e passa despercebido: o erro
é rápido, silencioso e some no meio de centenas de casos. A comparação entre
modelos fica sem sentido.

## Como aplicar

- Avaliação em lote espera no 429; falha de modelo é o que sobra depois disso.
- Erro rápido em bloco, no meio de uma sequência, é limite, não qualidade. Uma
  chamada de sonda mostra `x-ratelimit-limit-tokens` e `-requests`.
- Um modelo de raciocínio gasta tokens de saída invisíveis no prompt, e eles
  contam no mesmo teto.

## Relacionado

- [[prompt-antes-de-modelo-o-barato-passa-o-caro-erra-igual]]
- [[turbopack-nao-cria-processo-quando-a-maquina-esta-cheia]]
