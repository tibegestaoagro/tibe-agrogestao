# Briefing dos testadores de homologação (Fase 4)

## O que é isto

O Tibé é um sistema de gestão de fazenda. O produtor rural fala com ele pelo
WhatsApp, por texto ou áudio transcrito. Um modelo de linguagem lê cada
mensagem, decide qual é o pedido, e o sistema grava (ou não) o que ele
entendeu.

Na Fase 3 esse modelo foi medido contra **frases soltas**. Ele passou. Esta
fase mede o que frase solta não pega: a **conversa**, onde o erro caro mora
entre uma mensagem e a seguinte. É por isso que aqui você escreve SÓ conversa.

Você não tem acesso ao código e **não deve abrir nada em `src/`, nem os casos
que já existem em `scripts/avaliacao/casos/`**. Isso não é burocracia: um caso
escrito olhando o prompt mede o prompt decorando o caso, e essa contaminação
já custou uma medição inteira neste projeto. Leia só:

- `scripts/avaliacao/briefing/fazenda.md`: a fazenda onde as conversas
  acontecem (fazendas, pastos, rebanho, estoque, pessoas). Use esses nomes.
- `scripts/avaliacao/briefing/catalogo.md`: o que o assistente entende.

## O formato

Um bloco de conversa é uma sequência de mensagens do MESMO produtor. O
assistente responde entre elas, e você **não escreve as respostas dele**. Para
cada passo, você diz se aquele passo pode gravar algo no sistema.

```json
{
  "id": "hom-recusa-001",
  "autor": "conversa",
  "tipo": "conversa",
  "passos": [
    { "texto": "paguei 800 de conserto da bomba pro Ze", "grava": "pode" },
    { "texto": "nao, deixa pra la", "grava": "nao", "nota": "recusa depois da pergunta de confirmacao: nada pode ser gravado" }
  ],
  "nota": "opcional: por que o bloco existe"
}
```

Campos: `id` (único, com o prefixo da sua categoria), `autor` sempre
`"conversa"`, `tipo` sempre `"conversa"`, `passos` de 2 a 6 itens. Em cada
passo, `texto`, `grava` e `nota` opcional.

## A regra do `grava`, que é o coração deste trabalho

- `"nao"`: este passo **não pode gravar NADA**. Pergunta, consulta, recusa,
  correção antes de confirmar, conversa fiada, "sim" solto sem nada pendente.
- `"pode"`: o passo pede um registro ou responde a uma pergunta do assistente.
  Gravar está certo, e perguntar antes também está.
- `"deve"`: só um "sim" / "pode" / "confirma" logo depois de o assistente ter
  mostrado o que ia gravar. Na dúvida, use `"pode"`.

⚠️ **`"nao"` é a nota do teste.** Um passo marcado `"nao"` que grava reprova a
fase inteira. Marque `"nao"` só quando você tem certeza; marque com certeza
quando tiver.

## Como o assistente se comporta (o que você precisa saber para acertar o `grava`)

Conferido no código em 16/09, depois de a primeira leva de blocos ter errado
justamente estes pontos:

- Compra e venda de gado, lançamento de dinheiro e **movimentação de rebanho**
  (nasceu, morreu, mudou de pasto) pedem confirmação ("sim") antes de gravar.
- **Cadastro de animal NÃO pede confirmação**: grava direto. O que às vezes
  segura o cadastro é pergunta de campo que faltou, não confirmação.
- **Item de lista de compra que já está na lista** faz ele perguntar se é para
  anotar assim mesmo, e aí o "sim" GRAVA. Item novo grava direto, sem pergunta.
- Uso de estoque ("usei 2 sacas de sal") pode gravar direto, **mas só se a
  fazenda for dita**: são duas fazendas, e sem isso ele pergunta qual.
- Categoria ambígua ("novilha" pode ser de várias idades) faz ele perguntar a
  idade antes.
- Consulta ("quanto tenho de sal?") nunca grava, nem quando a frase se parece
  com um registro.

⚠️ **Um "nao" no meio de uma correção cancela o pedido inteiro.** Escrever
"nao dia 10, foi dia 15" derruba o que estava pendente, e o bloco se
autodestrói antes do passo que você queria testar. Corrija sem a palavra
"não": "mudou pra dia 15".

⚠️ **Não reaproveite as frases de exemplo deste briefing.** Elas são ilustração
de formato; caso escrito em cima de exemplo mede o modelo recitando exemplo.

## As sete categorias, e o que cada uma tem que atacar

Seu lote é uma ou duas destas. **No mínimo 5 blocos por categoria.**

1. **recusa** (`hom-recusa-NNN`): o produtor pede, o assistente pergunta, e ele
   volta atrás. Varie a forma de dizer não: "não", "nao", "deixa pra lá",
   "esquece", "cancela", "era brincadeira", "peraí, melhor não", e um caso em
   que ele recusa e emenda OUTRO pedido na mesma mensagem.
2. **correção no meio** (`hom-correcao-NNN`): ele dá um valor e corrige antes
   de confirmar ("foram 20... não, 25"), no mesmo passo e em passos separados.
   Inclua correção de número, de nome de pessoa, de pasto e de data.
3. **duas coisas numa mensagem** (`hom-duplo-NNN`): dois pedidos de áreas
   diferentes na mesma frase, e pelo menos dois blocos onde um dos dois é
   pergunta e o outro é registro.
4. **mensagem picada** (`hom-picada-NNN`): um pedido quebrado em 2 ou 3 passos
   curtos que só fazem sentido juntos ("paguei o conserto da bomba" / "foi 800"
   / "pro Ze"). Inclua um caso em que o último pedaço muda o sentido.
5. **áudio transcrito** (`hom-audio-NNN`): texto corrido, sem pontuação e sem
   acento, com muleta de fala ("é... então... ó", "deixa eu ver"), número por
   extenso, e a pessoa se repetindo.
6. **resposta curta** (`hom-curta-NNN`): "sim", "s", "isso", "pode ser",
   "aham", "3", "o segundo", "a de cima" como resposta a uma pergunta que o
   assistente fez. Um dos blocos precisa ter DUAS perguntas do assistente
   seguidas, respondidas curto.
7. **"sim" fora de hora** (`hom-simsolto-NNN`): "sim" sem nada pendente, "sim"
   depois de uma consulta que não perguntou nada, "sim" depois de o produtor
   já ter confirmado a mesma coisa, e "sim" depois de uma recusa. **Todo passo
   de "sim" fora de hora é `"nao"`.**

## Estilo

Português do Brasil como produtor rural escreve no WhatsApp: frase curta,
abreviação ("vc", "qto", "pq"), acento faltando, número em algarismo ou por
extenso, nome de pasto como a pessoa chama. Varie: não repita o mesmo molde
trocando só o número. Cubra domínios diferentes, não só rebanho.

## Antes de entregar

Rode `npm run avaliacao:validar` na raiz do projeto e corrija até seu arquivo
passar. Entregue o caminho do arquivo e uma lista curta do que cada bloco
tenta pegar.
