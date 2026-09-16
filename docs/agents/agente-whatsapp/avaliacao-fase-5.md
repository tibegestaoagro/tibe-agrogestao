# Fase 5: as três intenções novas, medidas

Data: 2026-09-16. Modelo: `gpt-5.6-luna`, esforço `low`.

## O que foi medido

40 casos escritos por um autor sem acesso ao código, cobrindo as **três
intenções novas** (`registrar_recebimento`, `consultar_recebimento`,
`agendar_pagamento_trabalhador`) e as **três vizinhas antigas** que se parecem
com elas (`registrar_lancamento_financeiro`, `consultar_saldo`,
`registrar_pagamento_trabalhador`), mais seis casos de fronteira em que a
diferença é uma palavra ("vou pagar o Pedro" contra "paguei o Pedro").

O alvo não era "o agente entende?", e sim **"ele escolhe a vizinha errada?"**,
que é o erro caro do classificador e o que suíte verde não mede.

| rodada | o que mudou | intenção | campos | gravação indevida |
|---|---|---|---|---|
| `fase-5` | primeira medição | **44,4%** | 96,4% | 0 |
| `fase-5b` | descrições de domínio corrigidas | 77,8% | 97,9% | 0 |
| `fase-5c` | dois gabaritos errados corrigidos, fronteira do "vizinho" | **97,2%** | 96,6% | 0 |
| `fase-5d` | exemplo novo em `registrar_pagamento_trabalhador` | 91,7% | 96,4% | 0 |
| `fase-5e` | exemplo revertido (igual à `fase-5c`) | **94,4%** | 96,5% | 0 |

Custo da fase: US$ 0,21. Acumulado do programa: US$ 5,37 de US$ 30.

## O defeito que a medição achou, e nenhuma suíte acharia

As três intenções nasceram **inalcançáveis**, com 44,4% de acerto. A causa não
era o modelo: era conflito no registro de domínios
(`src/lib/agente/intencoes/index.ts`).

- `prestador` dizia, textualmente, que cuidava de "quanto um cliente deve ou já
  pagou". A etapa de domínio mandava "o João já pagou?" para lá, e ali
  `consultar_recebimento` não existe: sobrava `consultar_cliente`.
- `financeiro` dizia receita "**avulsa**", o que exclui quitação de conta de
  cliente: "a Santa Fé pagou 800 da gradagem" saía `ambigua`.
- `conversa` reivindicava "a relação de contas a pagar ou a receber".
- `mao_de_obra` só falava de pagamento **já feito**.

⚠️ **É a mesma classe de defeito da Fase 3**, que já tem nota no cofre
(`a-etapa-de-dominio-decide-o-que-a-extracao-pode-responder`): a etapa de
domínio decide quais intenções a extração sequer vê. Declarar a intenção não a
torna alcançável. **Escrever a lição não impediu repeti-la**, e desta vez o
plano é que deveria ter mandado revisar os domínios junto com as intenções.

Corrigidas as quatro descrições: **44,4% para 94-97%**.

## Duas honestidades sobre esse número

**1. Dois gabaritos estavam errados, não o agente.** "Quem ainda tá devendo pra
mim?", sem citar ninguém, é o resumo de contas a receber, não a consulta de um
cliente (que exige um contato). Os dois casos foram corrigidos, com a nota
dizendo por quê.

**2. A mesma configuração medida duas vezes deu 97,2% e 94,4%.** São 36 pedidos:
um caso vale 2,8 pontos, e a variância do modelo é de ±3. Parte do "ganho" na
margem era sorte. A tentativa de melhorar mais (um exemplo novo no registro)
**piorou para 91,7%** e foi revertida.

⚠️ **O gate por intenção é ruidoso neste tamanho.** `registrar_pagamento_trabalhador`
tem 6 casos: um erro derruba para 83% e reprova o limite de 85%. O limite foi
desenhado na Fase 3 para um conjunto de 337 casos, e num lote de 40 ele mede
ruído tanto quanto mede o agente.

## A regressão: mexer nos domínios não quebrou o que já existia

Mexer em descrição de domínio afeta **toda** mensagem, então a pergunta certa
não é "as intenções novas funcionam?", e sim "o que já funcionava continua?".

| conjunto | antes (Fase 3) | agora | leitura |
|---|---|---|---|
| 50 casos inéditos (`forademostra.json`) | 97,7% intenção, 95,7% campos | 95,5% e 96,5%, **aprovado** | dentro da variância |
| 221 casos em comum com a rodada `r2b` | 94,2% (226/240) | 93,8% (225/240) | **um pedido de diferença** |

⚠️ **A primeira comparação que eu fiz não valia**: cruzei uma rodada de 351
casos (partição inteira) com uma de 221 (só a partição de ajuste) e a tabela
acusou queda de 91,8% para 88,3% num dos autores. Conjuntos diferentes, número
sem sentido. A comparação acima só usa os casos que existem nos dois lados.

**Zero gravação indevida em todas as rodadas**, incluindo as de regressão.

## O que fica aberto

- "acabei de pagar o Zé Carlos" (pagamento sem valor, verbo fora do passado
  simples) sai `ambigua` em parte das rodadas. Tentei corrigir com exemplo novo
  e piorou o conjunto: fica registrado em `dividas.md`, para uma rodada com
  conjunto maior.
- As três intenções ficam **inertes em produção** até a Fase 7 trocar o fluxo:
  o classificador do n8n segue congelado, e quem emite intenção nova é a rota
  de turno. Já são nove nesse estado.
