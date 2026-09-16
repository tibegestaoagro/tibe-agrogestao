# Homologação da Fase 4: os blocos de conversa

Data: 2026-09-16. Modelo: `gpt-5.6-luna`, esforço `low` (o escolhido na Fase 3).
Números brutos em [avaliacao-homologacao-2.md](avaliacao-homologacao-2.md).

## O que foi medido

60 blocos de conversa, 145 passos, escritos por cinco testadores sem acesso ao
código nem ao prompt, revisados por um juiz que podia ler o código. Sete
categorias, todas dos critérios de aceite do programa: recusa, correção no
meio, duas coisas numa mensagem, mensagem picada, áudio transcrito, resposta
curta e "sim" fora de hora.

Cada passo conta as linhas de negócio do tenant antes e depois. Passo marcado
`grava: "nao"` que muda qualquer contagem é **gravação indevida**, e é
eliminatório.

| rodada | gravações indevidas | confirmações que não gravaram | falhas do modelo | custo |
|---|---|---|---|---|
| `homologacao-1` | 2 (falso positivo, ver abaixo) | 19 | 0 | US$ 0,029 |
| `homologacao-2` | **0** | 19 | 0 | US$ 0,026 |

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

## O que ficou de fora, e por quê

Três defeitos conhecidos seguem abertos, todos herdados da Fase 3 e registrados
em `docs/agents/dividas.md`: permuta com diferença em dinheiro, resposta em
parcelas ("35 mil, em 2 vezes"), e correção de valor antes do "sim". Nenhum
grava nada errado: todos param a conversa, que é o modo caro mas seguro de
falhar.
