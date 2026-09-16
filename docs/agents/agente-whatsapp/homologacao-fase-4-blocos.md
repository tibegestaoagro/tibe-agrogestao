# Homologação da Fase 4: os blocos de conversa

Data: 2026-09-16. Modelo: `gpt-5.6-luna`, esforço `low` (o escolhido na Fase 3).
Números brutos em [avaliacao-homologacao-5.md](avaliacao-homologacao-5.md).

## O que foi medido

60 blocos de conversa, 145 passos, escritos por cinco testadores sem acesso ao
código nem ao prompt, revisados por um juiz que podia ler o código. Sete
categorias, todas dos critérios de aceite do programa: recusa, correção no
meio, duas coisas numa mensagem, mensagem picada, áudio transcrito, resposta
curta e "sim" fora de hora.

Cada passo conta as linhas de negócio do tenant antes e depois. Passo marcado
`grava: "nao"` que muda qualquer contagem é **gravação indevida**, e é
eliminatório.

| rodada | gravações indevidas | confirmações que não gravaram | passos com frase de desistência | custo |
|---|---|---|---|---|
| `homologacao-1` | 2 (falso positivo, ver abaixo) | 19 | não medido | US$ 0,029 |
| `homologacao-2` | **0** | 19 | 41 de 145 | US$ 0,026 |
| `homologacao-3` (pergunta atômica) | 0 | 19 | 45 de 145 | US$ 0,029 |
| `homologacao-4` (interseção de candidatas) | 0 | 19 | 43 de 145 | US$ 0,027 |
| `homologacao-5` (ambígua com pergunta aberta) | 0 | 19 | 39 de 145 | US$ 0,026 |

Total gasto na fase: US$ 0,14. O acumulado do programa foi de US$ 4,93 para
US$ 5,07, de um teto de US$ 30.

## As duas "gravações indevidas" da primeira rodada eram do medidor, não do agente

Os dois blocos eram de despesa de energia, e o passo que só perguntou "confirma
o lançamento?" contava **26 linhas novas**. As 26 são as categorias financeiras
padrão: `provisionDefaults` as cria na primeira listagem
(`src/lib/actions/financial-categories.ts`), e quem lista primeiro é o handler
do financeiro. Categoria é catálogo, não fato da fazenda.

Corrigido na fazenda de avaliação, que agora semeia as 26 na montagem. Provado
nos dois sentidos: o mesmo passo passou de 26 linhas novas para 0, e a rodada
inteira foi de 2 gravações indevidas para 0.

⚠️ **O medidor errou para o lado caro**: acusou o agente de gravar o que ele
não gravou. Se tivesse errado para o outro lado, a fase teria passado com um
defeito real dentro.

## As 19 confirmações que não gravaram, lidas uma a uma

Este número **não reprova** (decisão da Fase 3: o gabarito de `deve` não é
confiável). Lendo os 19:

**Onze são gabarito otimista, e o agente agiu certo.** O testador marcou
`deve` num "sim" que respondia a uma pergunta de campo faltando, não a uma
confirmação. O agente ainda precisava da categoria, do valor, da fazenda ou da
idade, e perguntar ali é o comportamento correto. Quatro deles ("não tenho
nenhum serviço esperando confirmação") são o caso em que o produtor responde
"sim" a uma pergunta que não era de sim ou não.

**Três são o defeito conhecido de correção de valor antes do "sim"**, herdado
da Fase 3 e deliberadamente fora de escopo: "isso, 35 mesmo, pode confirmar"
não é lido como confirmação porque tem dígito, e dígito bloqueia o "sim" de
propósito (`src/lib/actions/confirmation.ts`), para "não, foram 30" nunca
virar um "sim".

**Um é conectivo na frente:** "e isso, pode confirmar" não casa, porque a lista
de confirmação compara o começo da mensagem e "e" não está nela.

**Quatro são um defeito de verdade, e ele foi corrigido nesta fase:** a
pergunta que pede duas coisas.

## O defeito que a fase achou: a pergunta que se repete

Reproduzido duas vezes, em blocos de autores diferentes:

```
>> vendi uns novilha pro joao do leilao por 12 mil
<< Quantos animais e de qual categoria?
>> 13 a 24
<< Quantos animais e de qual categoria?     (repetiu)
>> sim
<< Não estou conseguindo entender essa parte. Tente mandar tudo numa frase só...
```

A causa não é o modelo: `classificarResposta` lê "13 a 24" certo, como
`{"tipo":"responde","valor":"13 a 24"}`. A causa é o descompasso entre a
pergunta e o cursor. A pergunta pede quantidade **e** categoria, mas o cursor
guarda um campo só (`aguardando: "categoria"`), e a resposta inteira é jogada
nesse campo. O handler não resolve "13 a 24" como categoria e pergunta de novo.
Na terceira volta, a trava de laço desiste.

No segundo caso o prejuízo é maior: a resposta trazia a quantidade (25) e o
valor (75 mil), e os dois se perderam no mesmo funil de um campo.

## As três correções, e o que elas NÃO moveram

Três defeitos foram achados e corrigidos nesta fase, cada um com teste que
falhou antes (`scripts/m68-agente-turno.test.ts`, seção 7b):

1. **A pergunta composta** (`2fde4c6`): "Quantos animais e de qual categoria?"
   contra um cursor que guarda um campo só. Virou uma pergunta de cada vez, e
   número por extenso passou a ser lido também na resposta a um campo pendente.
2. **A memória de candidata** (`b6bbfe7`): a lista de opções que o agente
   acabava de mostrar era escrita na metadata do `ask` e **nunca lida em lugar
   nenhum do repositório**. Agora a resposta cruza com as opções oferecidas, e
   "novilha" mais "13 a 24" fecha em fêmea de 13 a 24 meses. De brinde, o
   pendente passou a guardar o rótulo resolvido, não o termo ambíguo.
3. **Ambígua com pergunta em aberto** (`afb6e1f`): a classificação normal não
   sabe que existe uma pergunta pendente, então uma resposta que trouxesse mais
   do que o campo pedido saía `ambigua` e o produtor ouvia "não entendi" logo
   depois de ter respondido certo.

⚠️ **E ainda assim a taxa de desistência quase não se mexeu: 41 de 145 passos
antes, 39 depois**, e ela subiu no meio do caminho. As três correções
destravaram conversas específicas (as duas reproduções fecham agora), não a
média. Reportar só as correções, sem este número, seria contar meia verdade.

Onde as 39 estão, por categoria de bloco:

| categoria | passos com frase de desistência |
|---|---|
| "sim" fora de hora | 9 de 17 |
| mensagem picada | 10 de 26 |
| correção no meio | 7 de 24 |
| duas coisas numa mensagem | 5 de 20 |
| áudio transcrito | 5 de 20 |
| recusa | 3 de 21 |
| resposta curta | 0 de 17 |

**Nove delas são o comportamento CERTO:** em "sim" fora de hora, recusar é o
que se espera, e a frase genérica é a recusa.

**Dez são artefato da medição, não do agente:** os blocos de mensagem picada
mandam cada pedaço como um turno separado, e o agente vê "foi no posto"
sozinho. Em produção isso não acontece: o buffer de 12 segundos do n8n junta os
pedaços ANTES de chamar a rota de turno (nó `Consolidar Mensagem`, antes de
`Chamar Turno`). O aparato mede o turno, não o buffer, e por isso mede o pior
caso. Medir o caminho real é a rodada de ponta a ponta pelo webhook.

As vinte restantes espalham-se por correção, duplo e áudio, sem um padrão único
que valha uma quarta volta de correção nesta fase.

## Ponta a ponta pelo n8n (16/09, com autorização do usuário)

A cópia `ctGOlY9OXZWfjeby` foi ativada, exercitada e desativada na mesma
sessão. O caminho é o real: webhook, guarda da entrada, normalização, buffer de
12 segundos, consolidação, `POST /api/internal/whatsapp/turno` e envio pelo
`send-message` do Tibé. Tudo no tenant de PROVAS, com o telefone de provas.

| prova | resultado |
|---|---|
| mensagem que pede confirmação | "Comprar 20 bezerros por R$ 60.000,00?" (veio da rota de turno, não do `execute-action`) |
| recusa ("nao, deixa pra la") | "Tudo bem, não registrei nada." Nada gravado |
| "sim" fora de hora | frase genérica, **nada gravado** |
| mensagem picada (3 pedaços em ~3 s) | os três viraram UM pedido: "Comprar 15 bezerros por R$ 45.000,00, vendedor Ze Carlos". Uma resposta só |
| **idempotência**: "sim" que GRAVA, mandado duas vezes com o mesmo `message_id` | negociações **2 para 3**, nunca 4. Uma confirmação só chegou ao produtor |

A prova de idempotência é a que mais importa, porque é a única do roteiro que
passa pelo caminho de escrita: a mensagem repetida pelo provider não grava duas
vezes, e o `message_id` do texto (que a produção descarta e a cópia preserva) é
o que sustenta isso.

⚠️ **Defeito cosmético achado aqui:** o resumo sai "Vendedor: do Ze Carlos",
com a preposição colada ao nome. Não afeta o que é gravado. Registrado em
`docs/agents/dividas.md`.

## O que ficou de fora, e por quê

Três defeitos conhecidos seguem abertos, todos herdados da Fase 3 e registrados
em `docs/agents/dividas.md`: permuta com diferença em dinheiro, resposta em
parcelas ("35 mil, em 2 vezes"), e correção de valor antes do "sim". Nenhum
grava nada errado: todos param a conversa, que é o modo caro mas seguro de
falhar.
