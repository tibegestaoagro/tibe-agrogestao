# Workflow fino da homologação (Fase 4)

> Montagem feita pelo agente `n8n-fluxo` em 2026-09-16, a partir do export real
> de `UAAA96aJFiiFsQCL` (produção, ativo, 37 nós) e da cópia `ctGOlY9OXZWfjeby`
> (homologação, inativa, era um clone idêntico de produção até esta rodada).
> **Aplicado na cópia em 16/09** (`PUT /api/v1/workflows/ctGOlY9OXZWfjeby`,
> resposta 200; a leitura de volta confirma 25 nós, `active: false`, sem
> `pinData`, webhook em `homologacao`, com `Chamar Turno` e sem
> `Execute Action`). Produção conferida no mesmo minuto e **intocada**: 37 nós,
> ativa, `updatedAt` de 15/09.
>
> O JSON não entra no repositório porque carrega a chave da instância da
> Evolution, e o repositório é público: ele fica no scratchpad da sessão, e a
> fonte da verdade é a própria cópia no n8n.

## O que muda de verdade

O workflow fino para de classificar e executar: ele só transporta a mensagem
já filtrada, consolidada e (quando é mídia) pré-processada, chama **uma** rota
do Tibé (`POST /api/internal/whatsapp/turno`) e devolve cada mensagem da
resposta pelo mesmo `send-message` de sempre. A classificação por LLM, a
execução da intenção e a composição da resposta (que hoje moram em quatro nós
de produção) passam a acontecer dentro do Tibé, em `executarTurno`
(`src/lib/actions/turno.ts`).

O caminho do webhook muda de `atendimento` (produção) para `homologacao`
(nunca `atendimento-homologacao`, que era o caminho herdado do clone antigo da
cópia, nem `atendimento`, que é produção).

## Os 25 nós, em ordem, o que cada um consome e produz

| # | Nó | Tipo | Consome | Produz |
|---|---|---|---|---|
| 1 | `Webhook` | Webhook, `POST /webhook/homologacao` | corpo bruto da Evolution | o mesmo corpo, repassado |
| 2 | `Guarda da Entrada` | Code | `body.instance`, `body.apikey`, `body.data.key.remoteJid` | descarta (lista vazia) se a instância/chave não bater ou se for grupo/`status@broadcast`; senão repassa o item |
| 3 | `Normalizar e Filtrar` | Code | `body.event`, `body.data` | `{phone, type, message_text \| message_id}`. **Mudança da Fase 4:** o `message_id` (`data.key.id`) agora é preservado também para mensagem de texto; a produção descarta esse campo no ramo de texto |
| 4 | `É Áudio?` | If | `type` | roteia para o ramo de áudio ou segue para o de mídia |
| 5 | `Buscar Mídia (Áudio)` | HTTP (Tibé `/fetch-media`) | `message_id` | base64 e mimetype do áudio |
| 6 | `Preparar Áudio` | Code | base64 do passo 5 | item com binário `file` (ogg) |
| 7 | `Transcrever Áudio` | HTTP (OpenAI `whisper-1`) | binário `file` | texto transcrito |
| 8 | `Interpretar Transcrição` | Code | resposta do Whisper | `{phone, transcription}` |
| 9 | `Transcrição OK?` | If | `transcription` | segue para `Preparar Mensagem` ou para o aviso de falha |
| 10 | `Enviar - Áudio Não Entendido` | HTTP (Tibé `/send-message`) | telefone | mensagem fixa de áudio não entendido (nó terminal, fora do turno) |
| 11 | `É Mídia (Imagem/PDF)?` | If | `type` | roteia para o ramo de recibo ou direto para `Preparar Mensagem` |
| 12 | `Buscar Mídia (Recibo)` | HTTP (Tibé `/fetch-media`) | `message_id` | base64 e mimetype da imagem/PDF |
| 13 | `Extrair Recibo` | HTTP (OpenAI visão) | base64 da imagem | JSON com `amount`, `category`, `vendor`, `description` |
| 14 | `Parse Extração Recibo` | Code | resposta da OpenAI | `{phone, media_intent: {intent, parameters} \| null}` |
| 15 | `Recibo Legível?` | If | `media_intent` | segue para `Preparar Mensagem` ou para o aviso de recibo ilegível |
| 16 | `Enviar - Recibo Ilegível` | HTTP (Tibé `/send-message`) | telefone | mensagem fixa de recibo ilegível (nó terminal, fora do turno) |
| 17 | `Preparar Mensagem` | Code | item do ramo de texto, áudio ou recibo | `{phone, message_text \| null, media_intent \| null, message_id}`. **Mudança da Fase 4:** carrega `message_id` em todo ramo, lido de `Normalizar e Filtrar` por referência de nó (funciona nos três ramos porque todos descendem da mesma execução) |
| 18 | `Buffer Append` | HTTP (Tibé `/buffer`, op `append`) | `phone`, `message_text` | token de sequência no Redis |
| 19 | `Aguardar Fragmentos` | Wait, 12 s | nada | segue depois da espera |
| 20 | `Buffer Flush` | HTTP (Tibé `/buffer`, op `flush`) | `phone`, token | fragmentos consolidados (`ready`, `message_text`) |
| 21 | `Deve Responder?` | If | `data.ready` | só a execução vencedora segue; as outras terminam mudas |
| 22 | `Consolidar Mensagem` | Code | fragmentos do flush + `Preparar Mensagem` | `{phone, message_text, media_intent, message_id}`. **Mudança da Fase 4:** repassa `message_id` |
| 23 | `Chamar Turno` (**novo**) | HTTP (Tibé `POST /api/internal/whatsapp/turno`) | `phone`, `message_text`, `media_intent`, `message_id` | corpo `{telefone, texto, provider_message_id, recibo}`; `texto` vai vazio e `recibo` vai preenchido quando existe `media_intent` (recibo por foto/PDF); resposta `{data: {mensagens: [{texto, pode_humanizar, report_url}], replay}}` |
| 24 | `Separar Mensagens do Turno` (**novo**) | Code | `data.mensagens` da resposta do turno | um item por mensagem, com o telefone (lido de `Consolidar Mensagem` por referência de nó, porque a resposta do turno não carrega telefone) |
| 25 | `Enviar Respostas` (nó `Enviar - Resposta` da produção, renomeado e generalizado) | HTTP (Tibé `/send-message`) | um item por mensagem | `POST /send-message` para cada mensagem; quando a mensagem tem `report_url`, ele é concatenado ao texto com uma linha em branco, do mesmo jeito que `Separar Respostas` fazia em produção |

## O que sai, e por quê

O plano cita dez nós que saem para o Tibé: `Resolve Contact`, `Identificado?`,
`Primeiro Contato?`, `Classificar Intenção (OpenAI)`, `Parse Resposta LLM`,
`Execute Action`, `Separar Respostas`, `Deve Humanizar?`, `Humanizar (OpenAI)`,
`Validar Numeros`. Todos saem, de fato: são exatamente a camada de
inteligência e execução que `executarTurno` assumiu.

**A montagem real remove mais quatro, por consequência direta dos dez
primeiros, e isso diverge do texto do plano (que fala em "dez nós a
menos").** Registro aqui porque a divergência é sobre CONTAGEM de nós, não
sobre arquitetura, e prefiro deixar explícito a ter um nó morto na cópia:

- `Enviar - Não Identificado` e `Enviar - Saudação`: existiam para responder
  duas saídas específicas de `Resolve Contact`/`Identificado?`/`Primeiro
  Contato?`. `executarTurno` já devolve essas duas mensagens (contato não
  identificado, primeiro contato) dentro do mesmo formato `{mensagens: [...]}`
  que qualquer outro turno devolve, então elas saem pelo `Enviar Respostas`
  genérico. Manter os dois nós órfãos, sem nada os alimentando, seria lixo no
  workflow.
- `Tem Intenção de Mídia?` e `Montar Ação de Mídia`: existiam para desviar a
  intenção de mídia direto para `Execute Action`, sem passar pelo classificador
  de texto. Com `Execute Action` removido, e com `executarTurno` decidindo
  isso sozinho a partir do campo `recibo` do corpo (`entenderPedidos`, em
  `src/lib/actions/turno.ts`: `if (e.recibo) return [...]`), os dois nós
  perdem a função.

Total: **14 nós saem, 2 nós são novos** (`Chamar Turno`, `Separar Mensagens do
Turno`), e o nó de envio final é reaproveitado (renomeado de `Enviar -
Resposta` para `Enviar Respostas`, mesma credencial, mesma URL, corpo
generalizado). 37 (produção) − 14 + 2 = 25, a contagem do JSON montado.

## O caso da recusa

Não muda em relação à Fase 2 (`docs/superpowers/plans/2026-09-15-agente-whatsapp-fase-2-turno.md`)
e à Fase 3: quem decide se "não, deixa pra lá" cancela é `executarIntencao`
dentro do Tibé, pelo texto literal da mensagem (`detectConfirmation`), nunca
por parâmetro remontado pelo classificador. O workflow fino não introduz
nenhuma lógica de confirmação nova: ele só transporta `texto` cru para o
turno e devolve o que o turno mandar. O achado de 2026-08-18 (classificador
não remonta parâmetros literalmente) continua endereçado do mesmo jeito,
porque a classificação em si migrou de dentro do n8n para dentro do Tibé, e lá
`entenderPedidos`/`executarIntencao` seguem as mesmas regras testadas em
`scripts/m68-agente-turno.test.ts`.

## A pendência do `provider_message_id`

Fecha com esta montagem: `Normalizar e Filtrar` preserva `message_id` também
no texto, e ele atravessa `Preparar Mensagem` e `Consolidar Mensagem` até
virar `provider_message_id` no corpo de `Chamar Turno`. Continua valendo a
ressalva já registrada na auditoria (`docs/agents/agente-whatsapp/auditoria-n8n-2026-09-14.md`,
achado D7): o id que chega ao turno é o da mensagem que **venceu o buffer**
(a execução cujo flush devolveu `ready: true`), não de cada fragmento
individual. Isso é suficiente para a idempotência do turno inteiro
(`${wamid}#turno` em `executarTurno`), que é o que a pendência descrita em
`docs/agents/pendencias-do-usuario.md` pede.

## O que não foi resolvido aqui, de propósito

- **R5 do audit (mídia atravessa o buffer e pode se perder)** continua como
  estava em produção: o plano da Fase 4 pediu Buffer/Wait/Flush/Consolidar
  "como na produção, sem mudança", e é isso que a montagem faz.
- **Humanização (R7)** sai do fluxo por completo nesta cópia: não há mais
  `Humanizar (OpenAI)` nem `Deve Humanizar?`. `executarTurno` já devolve um
  campo `pode_humanizar` por mensagem, mas nada no Tibé nem no n8n fino chama
  um modelo para reescrever ainda; toda mensagem sai literal. Se uma fase
  futura quiser humanizar, o lugar é dentro do Tibé (a recomendação R7 da
  auditoria), não de volta no n8n.
- **O `pinData` de produção não foi removido de produção** (a API pública não
  aceita apagá-lo; segue exigindo o editor, como a auditoria já registrava). A
  cópia montada aqui simplesmente não leva `pinData`.

## Como aplicar

1. Revisar `homologacao-fino.json` no scratchpad da sessão.
2. Colar no editor do n8n (import) ou `PUT /api/v1/workflows/ctGOlY9OXZWfjeby`,
   com a cópia continuando **inativa**.
3. Rodar `npm run wa -- --homologacao estado` para confirmar que o alvo
   responde (depende da Task 5 do plano, que ainda cria a flag `--homologacao`
   no banco de provas).
