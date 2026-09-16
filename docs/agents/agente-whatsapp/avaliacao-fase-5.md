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
| `fase-5f` | consulta unificada, e as duas correções de gravação | 91,7% | 96,4% | 0 |
| `fase-5g` | **igual à `fase-5f`**, rodada de novo | **97,2%** | 96,6% | 0 |

Custo da fase: US$ 0,39. Acumulado do programa: US$ 5,54 de US$ 30.

⚠️ **`fase-5f` e `fase-5g` são a MESMA configuração**, medida duas vezes: 91,7%
e 97,2%. Cinco pontos e meio de diferença sem nenhuma mudança de código. É a
prova mais direta de que, com 36 pedidos, a nota individual de uma rodada não
decide nada: o que decide é a faixa e a regressão.

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
| 50 casos inéditos (`forademostra.json`) | 97,7% intenção, 95,7% campos | **97,7% e 98,3%, aprovado** | igual em intenção, melhor em campos |
| 221 casos em comum com a rodada `r2b` | 94,2% (226/240) | 93,8% (225/240) | **um pedido de diferença** |

A linha de cima é a medição que vale, feita depois de TODAS as mudanças da
fase (domínios reescritos, consulta unificada, e as duas correções de
gravação): o conjunto guardado da Fase 3, que nenhum ajuste desta fase viu.

⚠️ **A primeira comparação que eu fiz não valia**: cruzei uma rodada de 351
casos (partição inteira) com uma de 221 (só a partição de ajuste) e a tabela
acusou queda de 91,8% para 88,3% num dos autores. Conjuntos diferentes, número
sem sentido. A comparação acima só usa os casos que existem nos dois lados.

**Zero gravação indevida em todas as rodadas**, incluindo as de regressão.

## O que a revisão independente achou depois disso tudo

Com as suítes verdes e a medição feita, a revisão final **reprovou o merge** com
dois defeitos de gravação em dinheiro, os dois reproduzidos em banco:

1. **O "sim" quitava a conta que o produtor não leu.** O pendente guardava o
   ÍNDICE da lista, não o lançamento, e reindexava na hora do "sim". Uma conta
   nova daquele cliente, faturada pelo painel no meio da conversa, reordenava a
   lista: o produtor leu "conta de R$ 300, confirma?" e o sistema quitou uma de
   R$ 9.000.
2. **Nome repetido baixava a conta do outro cliente.** Com dois "João" e só um
   deles com conta em aberto, não havia lista para desambiguar, e a mensagem
   nomeava um enquanto o sistema pagava o outro.

Os dois estão corrigidos, com teste que falha antes, passando pelo turno
inteiro. Mais quatro achados menores, incluindo uma **suíte vermelha que
ninguém tinha visto porque o plano esqueceu `test:m67` da lista de comandos**:
a catraca que registra cada store de pendência estava acusando o arquivo novo.

⚠️ **A lição da Fase 4 se repetiu com outra roupa.** Lá, 60 blocos de conversa
não alcançavam o estado que expunha a gravação indevida. Aqui, 40 casos de
avaliação e uma suíte de 67 checagens não alcançavam nenhum dos dois, porque
os dois dependem de algo mudar ENTRE a pergunta e o "sim", e nenhum caso fazia
isso. Conjunto de casos mede o que ele monta.

## O que fica aberto

- "acabei de pagar o Zé Carlos" (pagamento sem valor, verbo fora do passado
  simples) sai `ambigua` em parte das rodadas. Tentei corrigir com exemplo novo
  e piorou o conjunto: fica registrado em `dividas.md`, para uma rodada com
  conjunto maior.
- As três intenções ficam **inertes em produção** até a Fase 7 trocar o fluxo:
  o classificador do n8n segue congelado, e quem emite intenção nova é a rota
  de turno. Já são nove nesse estado.
