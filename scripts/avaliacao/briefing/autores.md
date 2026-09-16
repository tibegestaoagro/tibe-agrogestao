# Briefing dos autores de casos de avaliação

## O que é isto

O Tibé é um sistema de gestão de fazenda. O produtor rural fala com ele pelo
WhatsApp, por texto ou áudio transcrito: conta o que aconteceu ("morreram 2
vacas"), pergunta ("quanto tenho de sal?") e responde às perguntas do
assistente. Um modelo de linguagem lê cada mensagem e decide QUAL pedido é e
QUAIS dados ela traz. Vamos comparar modelos com casos escritos por você.

Você não tem acesso ao código e **não deve abrir nada em `src/`**. Leia só:

- `scripts/avaliacao/briefing/fazenda.md`: a fazenda onde as conversas
  acontecem (fazendas, pastos, rebanho, estoque, pessoas). Use esses nomes.
- `scripts/avaliacao/briefing/catalogo.md`: os pedidos que o assistente
  entende (as "intenções") e os campos de cada um.

## O formato

Cada autor escreve UM arquivo JSON em `scripts/avaliacao/casos/`, contendo um
array de casos. Há dois tipos.

### Mensagem

Uma mensagem sozinha, sem conversa antes, e o que o modelo deveria entender dela.

```json
{
  "id": "prod-001",
  "autor": "produtor",
  "tipo": "mensagem",
  "texto": "comprei 20 bezerros do João do Leilão por 60 mil, pago dia 10",
  "esperado": [
    {
      "intent": "registrar_negocio_gado",
      "campos": {
        "tipo": "compra",
        "itens": [{ "categoria": "bezerros", "quantidade": 20 }],
        "contato": "João do Leilão",
        "valor": 60000,
        "vencimento": "dia 10"
      }
    }
  ],
  "nota": "opcional: por que o caso existe"
}
```

- `esperado` é a lista de pedidos **na ordem em que aparecem na mensagem**.
  Uma mensagem com duas ações ("vendi 10 bois e morreram 2 vacas") tem dois
  pedidos. Uma ação só, mesmo com vários detalhes ("comprei ... por 60 mil,
  pago dia 10"), é UM pedido.
- `intent` é o nome exato do catálogo. Se a mensagem não é nada que o
  assistente faça ("bom dia, tudo bem?", "qual a previsão do tempo?"), use
  `"ambigua"` sem campos.
- `campos`: coloque **só os campos que a mensagem disse**. Não preencha o que
  o produtor não falou. Os nomes são os do catálogo daquela intenção.
  - número: escreva como número JSON (`20`, `60000`, `1.5`), mesmo que a
    mensagem diga "60 mil", "duas" ou "1,5".
  - data: escreva como o produtor falou (`"dia 10"`, `"ontem"`, `"20/10"`);
    nunca converta para outra forma.
  - texto: o essencial, sem preposição (`"Pasto da Baixada"`, não
    `"no Pasto da Baixada"`).
  - sim/não: `true` ou `false`.
  - lista: array de objetos com os subcampos do catálogo.
- Na dúvida sobre um campo, deixe-o fora: campo esperado errado reprova um
  modelo que acertou.

### Conversa

Várias mensagens seguidas do mesmo produtor. O assistente responde entre elas
(você não escreve as respostas dele); para cada passo, diga se ele pode gravar
algo no sistema.

```json
{
  "id": "conv-001",
  "autor": "conversa",
  "tipo": "conversa",
  "passos": [
    { "texto": "morreram duas novilhas no Pasto da Sede", "grava": "pode" },
    { "texto": "de 13 a 24 meses", "grava": "pode" },
    { "texto": "sim", "grava": "deve" },
    { "texto": "quantos animais eu tenho agora?", "grava": "nao" }
  ]
}
```

A regra do `grava` é a mais importante deste trabalho, porque "gravar o que o
produtor não pediu" é o erro que reprova um modelo:

- `"nao"`: o passo NÃO pode gravar nada. Pergunta, consulta, recusa ("não",
  "deixa pra lá", "cancela"), correção antes de confirmar, conversa fiada,
  "sim" solto sem nada perguntado antes.
- `"pode"`: o passo pede um registro ou responde uma pergunta do assistente.
  O assistente pode gravar ou pode perguntar antes; os dois estão certos.
- `"deve"`: só um "sim"/"pode"/"confirma" logo depois de o assistente, pelo
  seu roteiro, ter mostrado o que vai gravar. Se você não tem certeza de que
  houve essa confirmação na conversa, use `"pode"`.

Coisas que você precisa saber sobre como o assistente se comporta:

- Compra e venda de gado, lançamento de dinheiro e cadastro pedem
  confirmação ("sim") antes de gravar.
- Uso de estoque ("usei 2 sacas de sal mineral") pode gravar direto, mas **só
  se a fazenda for dita**: esta montagem tem duas fazendas, e sem a fazenda o
  assistente pergunta qual é.
- Categoria ambígua ("novilha" pode ser de várias idades) faz o assistente
  perguntar a idade antes.
- Quando existem duas fazendas possíveis e o produtor não disse qual, o
  assistente pergunta; nunca escolhe.

## Estilo

- Português do Brasil, como produtor rural escreve no WhatsApp: frase curta,
  abreviação ("vc", "qto", "pq"), sem acento às vezes, número em algarismo ou
  por extenso, nome do pasto como a pessoa chama.
- Varie: não repita o mesmo molde trocando só o número.
- Cubra TODOS os domínios do catálogo, não só rebanho.
- Ids com o prefixo do seu autor e três dígitos (`prod-001`, `aud-001`,
  `cli-001`, `adv-001`, `conv-001`), sem repetir.

## A encomenda de cada autor

| autor | arquivo | casos | foco |
|---|---|---|---|
| produtor | `produtor.json` | 90 mensagens | fala comum de fazenda, todos os domínios, uma ou duas ações por mensagem |
| audio | `audio.json` | 60 mensagens | transcrição de áudio: sem pontuação, sem acento às vezes, número por extenso, "é... tipo assim", frase longa, repetição |
| cliente | `cliente.json` | 40 mensagens | frases de exemplo dos documentos do cliente em `docs/` (procure por exemplos de mensagem de WhatsApp nas specs e documentos de módulo; não leia `src/`), com a origem no campo `nota` |
| adversarial | `adversarial.json` | 30 mensagens e 25 conversas | recusa, correção no meio ("não, eram 30"), sim fora de hora, pergunta que parece registro, duas ações misturadas, valor dito duas vezes, fazenda não dita, pedido fora do que o assistente faz |
| conversa | `conversa.json` | 35 conversas | 3 a 6 passos: pedido, resposta curta à pergunta do assistente, confirmação, outro assunto no meio, recusa no fim |

## Antes de entregar

Rode `npm run avaliacao:validar` na raiz do projeto e corrija até não sobrar
erro no seu arquivo. O validador confere nomes de intenção e campo contra o
catálogo.
