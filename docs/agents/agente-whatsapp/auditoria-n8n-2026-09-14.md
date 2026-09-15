# Auditoria técnica: agente WhatsApp no n8n (produção)

> **Estado em 2026-09-15.** Esta auditoria descreve o fluxo como estava em
> 14/09 e foi mantida fora do repositório até a correção da entrada. Corrigidos
> desde então: a entrada sem autenticação (nó `Guarda da Entrada` em produção,
> 15/09), a confirmação pela primeira palavra, a idempotência por intenção e a
> mensagem com vários pedidos que dava a resposta da primeira à segunda (Fase 1,
> `docs/superpowers/plans/2026-09-14-agente-whatsapp-fase-1-fundacao.md`).
> Continuam valendo os demais achados, que as Fases 2 a 7 tratam
> (`docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md`).
> O `pinData` do Webhook ainda está no workflow de produção: a API pública do
> n8n não aceita apagá-lo, e a limpeza é pelo editor.

Data: 2026-09-14. Escopo: somente leitura. Material auditado:

- Export do workflow `UAAA96aJFiiFsQCL` "Tibe - Atendimento WhatsApp (Evolution)" (36 nós, ativo, `versionCounter` 70, `updatedAt` 2026-08-18), `uh9iZyhD4pxv7MNR` "Tibe - Resumo diario" e `DJhnAcPgUWByPaCq` "Tibe - Lembrete de cadastro abandonado".
- `docs/n8n-whatsapp-workflow.md`, `docs/agents/banco-de-provas-whatsapp.md`, `.claude/rules/whatsapp.md`.
- Rotas `src/app/api/internal/whatsapp/*` e `src/app/api/internal/jobs/daily-digest/*`, mais as libs que elas chamam (`whatsapp-buffer.ts`, `confirmation.ts`, `whatsapp-send.ts`, `whatsapp-media.ts`, `notify/`, `agent-flows.ts`, `whatsapp-handlers/shared.ts` e `financeiro.ts`).

Convenção: "confirmado" significa lido no JSON ou no código; "a confirmar" significa inferência sobre comportamento de runtime (n8n, Evolution, OpenAI) que não dá para provar só lendo.

---

## 1. O fluxo como ele é hoje

### 1.1 Diagrama

```
Evolution (messages.upsert)
  |
  v
[Webhook]  POST /webhook/atendimento, sem autenticação, responde 200 na hora (responseMode padrão)
  |
  v
[Normalizar e Filtrar] (Code)
  descarta se event != messages.upsert, se fromMe, se sem remoteJid
  phone = remoteJid.split('@')[0]
  texto (conversation | extendedTextMessage.text) -> {phone, type:'text', message_text}   <- SEM message_id
  audioMessage                                    -> {phone, type:'audio', message_id}
  imageMessage | documentMessage pdf              -> {phone, type:'media', message_id}
  qualquer outro tipo                              -> [] (execução termina muda)
  |
  v
[É Áudio?] --sim--> [Buscar Mídia (Áudio)] POST Tibé /fetch-media {message_id}
  |                   -> [Preparar Áudio] (monta binário ogg a partir do base64)
  |                   -> [Transcrever Áudio] OpenAI whisper-1, multipart, sem language/prompt
  |                   -> [Interpretar Transcrição] {phone, transcription}
  |                   -> [Transcrição OK?] --não--> [Enviar - Áudio Não Entendido] (FIM)
  |                                         --sim--> Preparar Mensagem
  |não
  v
[É Mídia (Imagem/PDF)?] --sim--> [Buscar Mídia (Recibo)] POST Tibé /fetch-media
  |                               -> [Extrair Recibo] OpenAI gpt-4o-mini visão, image_url data URI
  |                               -> [Parse Extração Recibo] amount numérico? categoria em lista fixa de 7
  |                               -> [Recibo Legível?] --não--> [Enviar - Recibo Ilegível] (FIM)
  |                                                    --sim--> Preparar Mensagem (media_intent pronto)
  |não
  v
[Preparar Mensagem] (Code) -> {phone, message_text | null, media_intent | null}
  |
  v
[Buffer Append] POST Tibé /buffer {op:'append', phone, message_text}  -> token (INCR no Redis)
  |
  v
[Aguardar Fragmentos] Wait 12 s
  |
  v
[Buffer Flush] POST Tibé /buffer {op:'flush', phone, token}
  |
  v
[Deve Responder?] data.ready --false--> (FIM mudo: outra execução mais nova vai processar)
  |true
  v
[Consolidar Mensagem] message_text = fragmentos unidos por ". "; media_intent = o DESTA execução
  |
  v
[Resolve Contact] POST Tibé /resolve-contact {phone}
  |
  v
[Identificado?] --não--> [Enviar - Não Identificado] send-message com meta.suggested_reply (FIM)
  |sim
  v
[Primeiro Contato?] --sim--> [Enviar - Saudação] (FIM: a mensagem que o produtor mandou é descartada)
  |não
  v
[Tem Intenção de Mídia?] --sim--> [Montar Ação de Mídia] {intent: registrar_lancamento_financeiro, parameters, confirmed:null}
  |não                                   |
  v                                      |
[Classificar Intenção (OpenAI)]          |
  gpt-4o-mini, temperature 0, json_object|
  system: ~12.200 caracteres, 23 intenções
  user: {current_date, message_text, active_profiles, recent_history (5 linhas)}
  |                                      |
  v                                      |
[Parse Resposta LLM] (Code)              |
  JSON inválido -> ambigua               |
  intents[] -> até 3 itens (o 4º some)   |
  |                                      |
  v                                      v
[Execute Action] POST Tibé /execute-action, UMA chamada por item (em paralelo, a confirmar)
  corpo: {tenant_id, user_id, intent, parameters, message_text (consolidado), confirmed}
  |      <- NÃO envia provider_message_id
  v
[Separar Respostas] (Code)
  se ALGUM item tem requires_confirmation: devolve SÓ esse item (os outros textos são descartados)
  senão: junta todos os reply_text (+ report_url) com linha em branco; humanizar = nenhum é
         cadastro_assistido*, clarification_requested ou confirmação
  sem texto nenhum: "Nao consegui responder agora. Pode tentar de novo?"
  |
  v
[Deve Humanizar?] --não--> [Enviar - Resposta]
  |sim
  v
[Humanizar (OpenAI)] gpt-4o-mini, temperature 0.4, timeout 12 s, onError=continueRegularOutput
  |
  v
[Validar Numeros] (Code) descarta a reescrita se o CONJUNTO de números mudou
  |
  v
[Enviar - Resposta] POST Tibé /send-message {to: phone, text}
```

### 1.2 O que cada nó faz de verdade (o que não é óbvio pelo nome)

| Nó | Comportamento real |
|---|---|
| Webhook | `httpMethod: POST`, `path: atendimento`, `options: {}`. Sem `authentication`, sem `responseMode` explícito: devolve 200 antes de processar, então a Evolution nunca sabe se deu certo. |
| Normalizar e Filtrar | Só entende o formato Evolution. Não confere `body.instance` nem `body.apikey`. Não descarta grupo (`@g.us`), `status@broadcast` nem `@lid`. Não lê `messageTimestamp` (mensagem antiga reemitida é tratada como nova). Não lê legenda de imagem (`imageMessage.caption`). Para texto, joga fora o `data.key.id`. |
| Buscar Mídia (Áudio/Recibo) | Chama o Tibé, que busca na Evolution por `/chat/getBase64FromMediaMessage` com as credenciais do provider ativo. Só funciona com provider `evolution` (422 `NOT_SUPPORTED` com Meta). |
| Transcrever Áudio | `whisper-1`, sem `language: pt` e sem `prompt` de vocabulário (Nelore, brinco, arroba, novilha). |
| Extrair Recibo | Manda o base64 como `image_url`. Para PDF isso vira `data:application/pdf;base64,...` dentro de `image_url`. Sem `temperature`. |
| Parse Extração Recibo | Aceita `amount` só se `typeof === 'number'`. `"1.234,56"` como string vira "ilegível". Categoria fora de 7 nomes fixos vira `Outros`. |
| Buffer Append/Flush | Lógica no Tibé (`whatsapp-buffer.ts`): `INCR` de sequência, `RPUSH` do texto (se não vazio), TTL 300 s, no máximo 20 fragmentos. Flush só devolve texto ao dono do último token e apaga as chaves. Mídia não entra na lista; ela só existe dentro da execução que a trouxe. |
| Consolidar Mensagem | Texto vem do Redis; `media_intent` vem de `$('Preparar Mensagem')` da execução vencedora. Mídia de execução perdedora é perdida. |
| Resolve Contact | Cria `WhatsAppContact` na primeira vez que acha um `User` ativo com aquele telefone (efeito colateral numa consulta). Devolve `recent_history` com as 5 últimas linhas de `AgentConversationLog` (entrada e saída misturadas). |
| Classificar Intenção | 23 intenções descritas (o `INTENTS` do Tibé tem 55). Payload do usuário leva o histórico cru. `response_format: json_object` (sem schema). Modelo por alias `gpt-4o-mini`, sem snapshot fixo. |
| Parse Resposta LLM | Fallback robusto para `ambigua`. Corta em 3 intenções sem avisar o produtor. |
| Execute Action | O Tibé confere `tenant_id` contra o dono do `user_id` (403 se divergir), faz replay por `provider_message_id` quando vier (não vem), grava log de entrada e saída por item, roteia. `confirmed` final = `confirmed === true` do LLM OU `detectConfirmation(message_text) === 'yes'`. |
| Separar Respostas | Consolidou em uma mensagem por turno ("Onda 2"). Confirmação pendente fala sozinha e cala os demais itens. |
| Humanizar + Validar Numeros | Reescreve tom de respostas finais, consultas, cancelamentos e erros (`:ok`, `:cancelado`, `:falhou`, `resumo:*`, `gerar_relatorio:financeiro` com URL). O texto logado no Tibé é o ORIGINAL, o que o produtor lê é o reescrito. |
| Enviar - * | Todos passam por `/send-message` do Tibé, credencial "Tibe Internal Secret", URL `https://tibe-agrogestao.vercel.app` fixa em 9 nós. |

Configuração do workflow principal (`settings`): só `executionOrder: v1` e `callerPolicy`. **Não há `errorWorkflow`, `executionTimeout`, nem política de gravação de execução.** Nenhum nó tem `retryOnFail`. Só `Humanizar (OpenAI)` tem `onError` e `timeout`.

---

## 2. Divergências entre documentação e workflow real

| # | Documentação diz | Workflow real | Onde |
|---|---|---|---|
| D1 | 27 nós | 36 nós | `n8n-whatsapp-workflow.md` §0 |
| D2 | Webhook com `GET` de verificação da Meta (`hub.verify_token`), payload `entry[0].changes[0].value.messages[0]`, variável `META_WHATSAPP_VERIFY_TOKEN` | Só `POST`, formato Evolution, nenhuma verificação, nenhuma autenticação | §1, §2, §3 Node 1 e 2 |
| D3 | "Error Trigger: em qualquer falha das etapas 3 a 6, envia mensagem de fallback"; checklist "derrubar a rota do Tibé retorna mensagem amigável" | Não existe error workflow nem saída de erro ligada. Falha = execução vermelha e silêncio para o produtor | §1, §3 "Node de erro", §6 |
| D4 | Variáveis `TIBE_BASE_URL` e `TIBE_INTERNAL_SECRET`; LLM "ainda não decidido" | URL fixa em cada nó; segredo como credencial "Tibe Internal Secret"; OpenAI já em uso | §2 |
| D5 | `Separar Respostas` manda "uma mensagem por assunto" | Junta tudo numa mensagem; se houver confirmação, manda só ela e descarta as outras respostas | §0.2 |
| D6 | "Preparar Mensagem normaliza antes de Resolve Contact (nó reaproveitado sem mudanças)" | Entre os dois há Buffer Append, Wait, Buffer Flush, Deve Responder? e Consolidar Mensagem | §5 "Convergência" (texto anterior ao buffer) |
| D7 | "O n8n ainda não manda `provider_message_id`... passar adiante é edição de um nó" | É mais que um nó: `Normalizar e Filtrar` descarta o id em mensagens de texto, o id não atravessa o buffer (a execução vencedora carrega vários fragmentos), e a restrição `@@unique([tenant_id, provider_message_id])` de `AgentRequest` faria o 2º e o 3º item de uma multi-intenção receberem a resposta do 1º como "replay" | `.claude/rules/whatsapp.md`, comentário em `execute-action/route.ts` |
| D8 | Categoria do recibo cai na "lista fixa de `category-suggestions.ts`" | O handler agora usa as categorias do banco do tenant e cai em "Outras despesas"; o n8n ainda força `Outros`, nome que pode não existir no tenant | `whatsapp.md`, §5; `financeiro.ts` |
| D9 | `gerar_relatorio`: "Retorna em breve" | `financeiro` devolve `report_url` real (a própria `whatsapp.md` diz isso) | §4 tabela |
| D10 | Contrato de `registrar_negocio_gado` inclui `vacinas`, `pedagio`; `registrar_movimentacao_rebanho` aceita `categoria` + `quantidade` para item único | O prompt não lista `vacinas` nem `pedagio` e só descreve `itens: [...]` | §4 tabela x nó Classificar |
| D11 | Credencial de áudio "OpenAI API Key" | Os 3 nós de OpenAI usam a predefinida "OpenAi API_Key Assistente Tibe" e ainda carregam uma referência órfã `httpHeaderAuth` "OpenAI API Key" | §5 |
| D12 | Provider trocável "em 1 clique" no painel, "sem mexer no n8n" | A ENTRADA só entende Evolution (`Normalizar`), e `fetch-media` recusa Meta. Trocar para Meta derruba o recebimento inteiro | `whatsapp.md`, §3 Node 6 |
| D13 | Banco de provas "não existe cópia do fluxo" e roda no n8n de produção | Correto, e é também a prova de D2: `scripts/whatsapp-e2e.ts` posta payload sintético sem cabeçalho nenhum e o fluxo aceita | `banco-de-provas-whatsapp.md` |

---

## 3. Riscos e defeitos

Ordenados por severidade. Cada item: evidência, consequência concreta, correção sugerida.

### R1. Webhook público sem autenticação escreve em qualquer fazenda. ALTA

- **Evidência.** Nó `Webhook`: `{"httpMethod":"POST","path":"atendimento","options":{}}`, sem `authentication`. `Normalizar e Filtrar` não confere `body.apikey` nem `body.instance`. A URL completa da instância está em `docs/n8n-whatsapp-workflow.md` §0, e o repositório é público. `scripts/whatsapp-e2e.ts` prova que um POST sem cabeçalho, com `instance: "banco-de-provas"` inventado, roda o fluxo inteiro.
- **Consequência.** Quem souber o telefone de um produtor (telefone não é segredo) posta `{"event":"messages.upsert","data":{"key":{"remoteJid":"<telefone>@s.whatsapp.net","fromMe":false},"message":{"conversation":"usei 40 sacas de sal"}}}` e o Tibé grava no estoque daquele tenant (`registrar_uso_estoque` não pede confirmação). Para os que pedem, basta um segundo POST com "sim" 12 s depois. O endurecimento de `execute-action` (tenant conferido pelo `user_id`) não ajuda, porque quem fornece o `user_id` é o próprio `resolve-contact`. Efeito secundário: POST com telefones aleatórios faz o Tibé mandar "Este número não está cadastrado" para qualquer número a partir do número comercial, o que com Evolution (API não oficial) é o caminho mais curto para banimento do número.
- **Correção.** Mínimo imediato, sem mudar a Evolution: primeiro nó confere `body.apikey` e `body.instance` contra valores guardados em credencial e descarta o resto. Melhor: autenticação por cabeçalho no Webhook (se a versão da Evolution permitir cabeçalho customizado no webhook, a confirmar) ou caminho com segmento aleatório longo. Tirar a URL da instância da documentação pública. Limitar "não cadastrado" a uma resposta por número a cada 24 h (SET NX no Redis, dentro de `resolve-contact`).

### R2. Nenhuma idempotência: mensagem repetida grava de novo. ALTA

- **Evidência.** `Execute Action` `jsonBody`: `{ tenant_id, user_id, intent, parameters, message_text, confirmed }`, sem `provider_message_id`. `Normalizar e Filtrar` devolve `{ phone, type: 'text', message_text }` para texto, sem o id. O Tibé loga `SEM_CHAVE_DE_IDEMPOTENCIA` a cada chamada. Nada no fluxo descarta evento repetido nem mensagem antiga (`messageTimestamp` ignorado).
- **Consequência.** Qualquer reentrega do mesmo `messages.upsert` (reconexão da instância Evolution/Baileys que reemite mensagens recentes, reenvio do webhook, reprocessamento manual de execução no painel do n8n) grava de novo a venda, o lançamento ou a saída de estoque. Com R3, o próprio produtor vira fonte de duplicata: ele não recebe resposta e repete a frase.
- **Armadilha para quando for corrigir.** Mandar o `wamid` "como está" quebra a multi-intenção: `AgentRequest` tem `@@unique([tenant_id, provider_message_id])` e a rota procura `findFirst({ where: { provider_message_id } })` antes de executar. O 2º e o 3º item da mesma mensagem receberiam a resposta do 1º como replay e nunca executariam. E o buffer junta vários `wamid` numa execução só.
- **Correção.** (a) Deduplicar na ENTRADA: `Normalizar` extrai `message_id` e `messageTimestamp` para todo tipo; `buffer append` recebe o id e faz `SET NX tibe:wa-seen:<wamid>` com TTL de 24 h, devolvendo `duplicate: true`; um IF encerra. Descartar também mensagem com mais de N minutos. (b) Na execução: o flush devolve os ids dos fragmentos; a chave enviada ao `execute-action` é `<último wamid>:<índice da intenção>` (ou o Tibé compõe a partir de `provider_message_id` + `intent_index`). (c) Só depois disso ligar retry no `Execute Action`.

### R3. Falha em qualquer serviço deixa o produtor sem resposta, e induz duplicata. ALTA

- **Evidência.** Nenhum nó com `retryOnFail`. Nenhum `onError` fora do humanizador. `settings` sem `errorWorkflow`. HTTP Request sem `timeout` explícito em todos os nós exceto o humanizador. Nós que podem falhar: OpenAI (429, 500, timeout), Vercel (cold start, 504, `maxDuration`), Neon, Redis, Evolution (via `send-message` 502 e `fetch-media` 502), e respostas 4xx do próprio Tibé (403, 404, 422), que o HTTP Request trata como erro.
- **Consequência concreta, por ponto de falha.**
  - `Resolve Contact`, `Buffer *` ou `Classificar Intenção` falham: nada foi gravado e o produtor fica sem resposta nenhuma, sem saber se deve repetir.
  - `Execute Action` com 3 itens, um deles falha: os outros já gravaram, o nó inteiro falha, `Separar Respostas` não roda, e o produtor não fica sabendo de nada do que foi gravado.
  - `Enviar - Resposta` falha (Evolution fora, 502): a ação JÁ foi gravada e logada. O produtor não recebe o "Registrado", repete a frase, e sem R2 corrigido grava duas vezes.
  - Execução pendurada (OpenAI ou Vercel sem responder): sem timeout, a execução fica aberta até a conexão cair; nenhuma mensagem sai (a confirmar o limite efetivo da instância).
- **Correção.** Ver §5.4: retry nos nós de rede idempotentes já (Resolve, Buffer, Classificar, Humanizar, Enviar), retry no Execute Action só depois de R2; `continueErrorOutput` com as saídas ligadas a um único "Enviar - Falha técnica" ("Não consegui registrar agora. Nada foi gravado, pode mandar de novo em alguns minutos." ou, depois do Execute Action, "Pode ter sido registrado; confira no aplicativo antes de repetir."); um error workflow para avisar o operador; `timeout` explícito em cada HTTP.

### R4. Multi-intenção: respostas descartadas e confirmação que o produtor não vê. ALTA

- **Evidência.** `Parse Resposta LLM` emite até 3 itens; `Execute Action` roda um por item (HTTP Request v4.2 sem a opção Batching dispara os itens em paralelo, a confirmar em execução real). `Separar Respostas`: `const pend = items.find((i) => i.json.data.requires_confirmation); if (pend) return [{ ... data: pend.json.data }]`.
- **Consequências.**
  1. "Usei 2 sacas de sal e comprei 20 bezerros por 60 mil": o uso de estoque é gravado (não pede confirmação) e a compra pede. O produtor só lê a pergunta da compra. Não fica sabendo que o sal foi baixado, e tende a repetir.
  2. "Comprei 20 bezerros por 60 mil e 10 sacas de sal por 1.200": as duas pedem confirmação, as duas ficam pendentes no Redis (TTL 15 min), só a primeira é mostrada. No "sim", quem decide é a data de cada pendência (`comMemoria`), e com as duas chamadas em paralelo a ordem de gravação não é determinística. O "sim" pode confirmar justamente a que o produtor não viu. Validar no banco de provas antes de afirmar a frequência.
  3. As chamadas paralelas do mesmo usuário competem pelo mesmo estado (pendências, `AgentFlowState`, log de conversa). Cada item grava 2 linhas de log, então uma mensagem com 3 intenções ocupa 6 linhas e empurra para fora do `recent_history` (5 linhas) a pergunta anterior do assistente.
  4. A 4ª intenção some sem aviso.
- **Correção.** Batching com 1 item por vez no `Execute Action` (ordem determinística) já reduz 2 e 3. A correção de fundo é mover a composição para o Tibé: uma rota que recebe a lista de intenções, executa em sequência e devolve UM texto ("Registrei a saída de 2 sacas de sal. Sobre a compra de 20 bezerros por R$ 60.000,00: confirma?"), com a regra "no máximo uma confirmação aberta por turno" em código testável. Avisar quando cortar intenções.

### R5. Buffer engole mídia e desordena fragmentos. ALTA

- **Evidência.** `Preparar Mensagem` manda `message_text: null` para recibo; `Buffer Append` com texto vazio só incrementa o token; `Consolidar Mensagem` usa `media_intent` da execução vencedora; execuções perdedoras morrem em `Deve Responder?` sem saída. Transcrição e extração acontecem ANTES do buffer.
- **Consequências.**
  - Três fotos de nota mandadas em sequência: só a última vira lançamento. As outras duas somem, sem mensagem. Dado financeiro perdido em silêncio.
  - Foto e depois texto ("essa é a nota do sal") em menos de 12 s: a execução do texto vence, a foto é perdida.
  - Texto e depois foto: a foto vence, o classificador é pulado (`Tem Intenção de Mídia?`), o texto só entra como `message_text` no log e na detecção de sim/não (ver R6).
  - Áudio e texto seguidos: o áudio passa por fetch-media e Whisper (vários segundos) antes do append, então "vendi 5 bois" (áudio) + "por 20 mil" (texto) chega ao classificador como "por 20 mil. vendi 5 bois".
  - Mensagem que chega 1 s depois de um flush abre outra janela e roda em paralelo com a execução anterior, que ainda não logou a resposta. O classificador da segunda não vê o contexto da primeira.
- **Correção.** Mídia precisa entrar no buffer como item (guardar `{tipo, message_id}` na lista, processar mídia DEPOIS do flush, na ordem da chegada) ou ficar fora do buffer (processada sozinha, sem cancelar nem ser cancelada). A primeira preserva ordem e várias fotos; a segunda é a menor mudança. Um lock por telefone enquanto a execução vencedora não termina resolve a corrida do último caso.

### R6. "ok", "isso", "pode" no começo da frase gravam sem confirmação; "para" cancela. MÉDIA

Defeito do lado do Tibé, disparado pelo formato de texto que o fluxo manda.

- **Evidência.** `confirmation.ts`: `YES_WORDS` inclui `"ok"`, `"isso"`, `"pode"`, `"s"`; casa `t === w || t.startsWith(w + ' ')` depois de tirar pontuação. `NO_WORDS` inclui `"para"`, `"n"`. `execute-action`: `confirmed = parsed.data.confirmed === true || detectConfirmation(message_text) === 'yes'`, aplicado a TODA intenção, sem olhar se havia pergunta pendente. `confirmFlow` (`shared.ts`) não tem memória: com `confirmed` verdadeiro, devolve `null` e o handler grava. Usado por `registrar_lancamento_financeiro`, `cadastrar_servico_ordem`, `registrar_movimento`, tarefas e lista de compra.
- **Consequências.** "Ok, gastei 300 de ração" ou "Isso aqui foi 300 de ração" grava o lançamento sem a confirmação que a regra diz ser obrigatória. Foto de recibo com "pode lançar" digitado dentro dos 12 s (R5) grava o valor lido por visão sem mostrar, anulando a regra "recibo sempre confirma, a visão erra mais". O buffer amplia: "Pode. Vendi o boi 1234 por 8000" vira "pode vendi o boi..." e confirma de saída. No sentido oposto, "Para pagar dia 10, comprei 20 bezerros" é lido como recusa e responde "não registrei nada".
- **Correção.** Só considerar o sinal de texto quando existir pendência de confirmação para aquele usuário, e só se a mensagem inteira for curta (sim/não e poucas palavras). Tirar `"para"`, `"n"`, `"isso"` e `"pode"` do casamento por prefixo.

### R7. Humanizador pode distorcer o que `Validar Numeros` não vê. MÉDIA

- **O que `Validar Numeros` protege.** Extrai sequências `[0-9]+(?:[.,][0-9]+)*`, remove `.` e `,`, e descarta a reescrita se aparecer um número que não existia ou sumir um que existia. Pega: número inventado, arredondado (`1.234,56` para `1.235`), removido. Também cobre falha do humanizador (erro e resposta vazia caem no texto original).
- **O que ele não protege (todas passam na trava):**
  - **Associação entre números.** A comparação é por conjunto, sem ordem e sem contagem. "Sal R$ 1.200 vence 10/09; vacina R$ 800 vence 15/09" pode virar os valores trocados entre itens. "20 bezerros por R$ 60.000" para "60.000 bezerros por R$ 20" também passa. Repetição some sem aviso ("3 de 3").
  - **Escala.** Separadores são apagados antes de comparar: "R$ 1.200" e "R$ 12,00" viram ambos `1200`.
  - **Palavras que carregam o dado.** Nome de contraparte ("João" para "Joaquim"), categoria ("Fêmea" para "Macho"), unidade ("450 kg" para "450 arrobas"), verbo ("comprou" para "vendeu"), data por extenso ("amanhã").
  - **Negação.** Cancelamentos (`:cancelado`) são humanizáveis: "Tudo bem, não registrei nada." pode sair afirmativo sem nenhum número mudar.
  - **Link.** `Separar Respostas` cola `report_url` no texto ANTES do humanizador; letras do token assinado podem mudar sem mudar dígito, e o link quebra.
  - **Opções de funil.** `resumo:aguardando_escopo` é humanizável; "Rebanho / Lavoura / Prestador / Financeiro" pode virar outras palavras. O produtor responde o que leu, mas o `recent_history` guarda o texto original.
- **Consequência estrutural.** O que fica em `AgentConversationLog` (e alimenta o classificador no turno seguinte) é o texto original, não o que o produtor viu. Toda reescrita cria uma divergência entre a conversa real e o contexto do modelo.
- **Custo e latência.** 1 chamada extra (1 a 3 s) em quase toda resposta final.
- **Correção.** Com o WhatsApp virando canal de entrada, a resposta é um recibo ("Registrado: saída de 2 sacas de sal da Fazenda A"). Recibo deve ser determinístico. Recomendação: desligar o humanizador e investir nos textos fixos do Tibé. Se ficar, restringir a `:ok` de consultas sem lista, nunca com URL e nunca em `:cancelado` ou `resumo:*`, e comparar números como sequência ordenada com o formato original.

### R8. Segredo e dado pessoal dentro do workflow (`pinData`). MÉDIA

- **Evidência.** `pinData.Webhook[0].json.body` guarda um payload real de 2026-07-30 com o campo `apikey` da instância Evolution, o telefone real do remetente, `pushName`, `sender` (número comercial), `instanceId`, e em `message.audioMessage` a `url`, `mediaKey` e `directPath` da mídia. Credenciais aparecem só por referência (id e nome), o que está correto.
- **Consequência.** Qualquer export, backup ou cópia do workflow leva a chave da Evolution junto; com o repositório público, um export versionado por engano é vazamento imediato. Quem tem acesso de leitura ao n8n lê a chave. `pinData` não afeta execução de produção, então não há ganho em manter.
- **Correção.** Apagar o `pinData`; rotacionar a chave da Evolution na próxima rodada de segurança; se o workflow for versionado no repositório (§5.5), uma conferência no `npm run check` que reprove `pinData` não vazio e campos `apikey`.
- Menor: todas as rotas internas usam o mesmo segredo compartilhado ("Tibe Internal Secret"). Quem o tiver manda WhatsApp para qualquer número (`send-message`) e baixa qualquer mídia por id (`fetch-media`).

### R9. Classificador: 23 de 55 intenções, contradições internas e estado vivo sem versão. MÉDIA

- **Evidência.** O system prompt tem ~12.200 caracteres e descreve 23 intenções; `INTENTS` tem 55. Fica fora do alcance do WhatsApp: evento (2), permuta, confinamento (4), leite (4), mão de obra (3), diária e serviço contratado (2), serviço de máquina (5), lista de compra (4), calculadoras (4), meu dia/amanhã/semana (3).
- **Contradições no texto atual:**
  - Frase de formato quebrada: "Responda SEMPRE em JSON estrito, sem texto fora do JSON, QUANDO HOUVER UM CADASTRO GUIADO EM ANDAMENTO: ... \nno formato:". Um parágrafo foi inserido no meio da instrução de formato.
  - "Resposta curta durante cadastro guiado = `ambigua`" contra "resposta curta de faixa de idade = reemitir a MESMA intenção de rebanho com todos os parâmetros". A mesma forma de mensagem tem duas regras opostas.
  - `resumo` usa "quantos animais eu tenho" como exemplo; `consultar_rebanho` usa "quantos animais tenho?".
  - `cadastrar_animal` pede `count`, que não está na assinatura da intenção.
  - A lista de `topic` de `ajuda` cita 12 intenções.
- **Consequências.** Intenção pronta no Tibé é inalcançável (já aconteceu 2 vezes, documentado). A regra "reconstrua a MESMA intenção e os MESMOS parâmetros a partir do histórico" é exatamente o mecanismo que o próprio projeto provou não ser literal (achado de 2026-08-18), e ela continua sendo a instrução principal para confirmação e para respostas curtas. O Tibé já guarda a pendência em Redis para 11 domínios (`*-pending.ts`), então a reconstrução pelo modelo é redundante e arriscada. Um modelo sem snapshot (`gpt-4o-mini`) pode mudar de comportamento sem aviso quando o alias for movido.
- **Correção.** §5.

### R10. PDF de nota é recusado pela OpenAI, e trocar para Meta derruba a entrada. MÉDIA

- **Evidência.** `Normalizar` aceita `documentMessage` com `application/pdf`; `Extrair Recibo` o envia como `image_url` com `data:application/pdf;base64,...`. A API de chat aceita imagens em `image_url`; PDF vai por outro tipo de parte de conteúdo (a confirmar com um PDF real, a doc do projeto admite "ainda não testado"). Sem `onError`, o nó falha e o produtor não recebe nada. `fetch-media` devolve 422 com provider Meta, e `Normalizar` não entende o payload da Meta.
- **Consequência.** Nota fiscal em PDF (formato comum de NF-e encaminhada) termina em silêncio. Quem trocar o provider no painel da plataforma para Meta, como a interface sugere, para de receber qualquer mensagem.
- **Correção.** Tratar PDF como parte de arquivo ou responder "mande uma foto da nota"; documentar no painel que a entrada é só Evolution enquanto não houver o ramo Meta.

### R11. Grupos, `@lid`, broadcast e tipos não suportados. MÉDIA

- **Evidência.** `phone = remoteJid.split('@')[0]` sem checar o sufixo. O `pinData` já mostra `addressingMode: "lid"` e `remoteJidAlt`.
- **Consequências.** Mensagem de grupo em que o número comercial esteja vira "telefone" do grupo, cai em "não identificado" e tenta responder ao id do grupo. Quando o WhatsApp mandar um contato com `remoteJid` terminado em `@lid` (migração para identificadores sem telefone, a confirmar o ritmo), o produtor cadastrado passa a ouvir "não está cadastrado". `status@broadcast` vira `phone: "status"`, reprovado pelo `buffer` (mínimo 8), e a execução falha. Vídeo, figurinha, localização, contato, reação e mensagem temporária (encapsulada em `ephemeralMessage`, a confirmar como a Evolution entrega) terminam sem resposta.
- **Correção.** Aceitar só `@s.whatsapp.net`; para `@lid`, usar `remoteJidAlt`; responder uma vez "por aqui eu entendo texto, áudio e foto de nota" para os tipos não suportados.

### R12. Primeira mensagem descartada. BAIXA

`Primeiro Contato?` verdadeiro manda só a saudação. "Vendi 20 bois por 50 mil", se for a primeira mensagem, é ignorada e o produtor precisa repetir. Um POST forjado (R1) também consome a saudação de um usuário real. Correção: saudação e depois seguir para a classificação.

### R13. Áudio e recibo: qualidade de extração. BAIXA

Whisper sem `language: "pt"` e sem `prompt` com vocabulário do domínio erra raça, categoria e números falados. Whisper é conhecido por inventar frase em áudio silencioso ("Legendas pela comunidade Amara.org"), que o `Transcrição OK?` aceita porque não é vazio (o classificador tende a devolver `ambigua`). `amount` como string ("1.234,56") vira "ilegível" em vez de ser lido por `lerDinheiro`. Legenda da foto é ignorada. Base64 de áudio e imagem fica gravado nas execuções do n8n se a instância salvar execuções de sucesso (dado sensível e volume de banco).

### R14. Latência fixa de 12 s em toda mensagem. BAIXA

Um "sim" isolado espera a janela inteira. Resposta típica documentada: 20 a 30 s. Janela adaptativa (encerrar antes quando a mensagem é curta e existe pendência de confirmação) reduz sem perder o ganho do buffer.

### R15. Custo de tokens por mensagem. BAIXA (hoje)

Estimativa com preço de tabela do `gpt-4o-mini` (US$ 0,15 por 1M de entrada, US$ 0,60 por 1M de saída) e `whisper-1` (US$ 0,006 por minuto). Conferir a tabela vigente.

| Chamada | Tokens aproximados | Custo por chamada |
|---|---|---|
| Classificar (system ~3.000 a 3.800 + histórico e mensagem 300 a 1.500; saída ~80) | ~4.500 entrada | ~US$ 0,0007 |
| Humanizar (~150 a 400 entrada, ~150 saída) | ~500 | ~US$ 0,0001 |
| Recibo por visão (foto ~1024x768 no `gpt-4o-mini` conta ~25 mil tokens de imagem) | ~25.000 | ~US$ 0,004 |
| Áudio de 30 s | | ~US$ 0,003 |

Texto: ~US$ 0,0008 por turno. O custo não é o problema hoje; o problema de levar o prompt único a 55 intenções é acerto e manutenção (o prompt passaria de 8 a 9 mil tokens, com mais regras cruzadas). O system prompt é estático e maior que 1.024 tokens, então se beneficia do cache automático de prefixo da OpenAI desde que o conteúdo variável continue na mensagem do usuário, como está hoje. Cada fragmento picado é uma execução do n8n com Wait; em volume, isso pesa mais na instância do que em tokens.

### Achados colaterais do lado do Tibé (fora do n8n, mas no mesmo caminho)

- `isBusinessHour` em `agent-flows.ts` usa `now.getHours()`; na Vercel o fuso é UTC, então "8h às 18h" vira 5h às 15h de Brasília. Lembrete de cadastro abandonado pode sair às 5h.
- `sendPushToTenant` envia para TODAS as inscrições de push do tenant; o resumo diário (com "saldo do mês") chega a qualquer usuário inscrito, inclusive `VISUALIZADOR` e `OPERADOR`, embora o destinatário escolhido seja o OWNER/ADMIN.

---

## 4. Workflows "Resumo diario" e "Lembrete de cadastro abandonado"

### 4.1 O que fazem

| | Resumo diario | Lembrete de cadastro abandonado |
|---|---|---|
| Gatilho | Schedule, cron `0 11 * * *` | Schedule, a cada 15 min |
| Chamada | `GET /api/internal/jobs/daily-digest` | `POST /api/internal/whatsapp/pending-flows` |
| O que o Tibé faz | Lock diário no Redis (`tibe:digest:generated:<data UTC>`); para cada tenant trial/active, monta resumo (saldo do mês, contas vencidas/a pagar, a receber, vacinas em 7 dias, alertas pendentes) e chama `notify(..., "digest")`: push para as inscrições do tenant; WhatsApp só se o tenant não tiver NENHUMA inscrição; nunca email | Para cada tenant, apaga fluxos expirados e, para `AgentFlowState` parado há 30 min ou mais, sem lembrete anterior e em "horário comercial", marca `reminded_at` e manda por WhatsApp "Oi! Vi que seu cadastro ficou pela metade... responda cancelar" |
| Tratamento de erro | Nenhum retry. Se a rota devolver 500 o lock é liberado, mas ninguém tenta de novo; se a função estourar o tempo depois de pegar o lock, o dia fica sem resumo | Nenhum. Um tenant com erro conta `failed` e segue |
| Configuração | `saveDataSuccessExecution: all`, `saveDataErrorExecution: all` | só `callerPolicy`; resto no padrão da instância (96 execuções por dia) |

**Fuso do resumo (a confirmar).** O nome diz "8h (Brasilia)" assumindo que `0 11 * * *` é UTC. O Schedule Trigger usa o fuso do workflow ou da instância (`GENERIC_TIMEZONE`), e o workflow não define fuso. Se a instância no Railway não tiver `GENERIC_TIMEZONE=UTC` ou `America/Sao_Paulo`, o padrão do n8n é `America/New_York`, e o resumo sai às 12h ou 13h de Brasília. Conferir a variável no Railway ou o horário real das execuções.

### 4.2 O que muda se alertas saírem pelo aplicativo

1. **Nenhum dos dois workflows decide canal.** Os dois só acordam o Tibé. A troca de canal é no Tibé: em `notify()` (tirar o fallback WhatsApp do `digest`, e tirar o WhatsApp do `critical`, que hoje manda push, WhatsApp e email em paralelo) e em `pending-flows` (trocar `sendWhatsAppMessage` por push ou por nada).
2. **Resumo diário.** Vira só push. Consequências a decidir: tenant sem nenhuma inscrição de push deixa de receber resumo (hoje recebe por WhatsApp), então vale medir quantos tenants ativos estão nessa situação antes de desligar; e o push hoje vai para todos os aparelhos do tenant, o que expõe saldo a perfis que não deveriam vê-lo. Com isso, o n8n só serve de relógio para uma rotina diária. A rotina de alertas já roda na Vercel Cron (`vercel.json`) e existe um worker BullMQ (`npm run worker`); juntar o resumo à rotina diária existente elimina este workflow e o fuso ambíguo.
3. **Lembrete de cadastro abandonado.** É diferente de alerta: é continuação de uma conversa que o produtor começou no WhatsApp. Duas saídas coerentes com "WhatsApp só entrada":
   - **Desligar.** O cadastro guiado expira sozinho (`expires_at`), e o produtor retoma quando quiser. Menor esforço, zero mensagem proativa. Recomendado.
   - **Mover para push** ("Seu cadastro de 5 animais ficou pela metade"), com o clique abrindo o app. Só faz sentido se o app tiver onde continuar o cadastro, o que hoje não existe: o estado está no fluxo conversacional.
   Mensagem proativa por Evolution (não oficial) é o tipo de envio que mais expõe o número a bloqueio; com a API oficial da Meta, fora da janela de 24 h exigiria modelo aprovado. Os dois pontos favorecem desligar.
4. **Precisa de agendamento a cada 15 min?** Se o lembrete for desligado, não. Se virar push, a Vercel Cron diária não serve; o worker BullMQ com job repetível serve, e o n8n continua servindo.
5. **O que continua saindo por WhatsApp mesmo assim.** A resposta do agente (recibo e perguntas), e os envios transacionais que não passam por `notify()`: código de redefinição de senha (`password-reset.ts`), cadastro verificado (`signup-flow.ts`), boas-vindas (`whatsapp-welcome.ts`) e ações da plataforma (`platform-tenants.ts`). A rota `send-message` e o provider continuam necessários.
6. **Consultas pelo WhatsApp.** Se o canal é de entrada, decidir se `consultar_*`, `resumo` e `consultar_meu_dia` continuam respondendo por WhatsApp ou devolvem um link para o app. Isso muda o número de intenções que o classificador precisa cobrir (§5).

---

## 5. Recomendações de estrutura para 55 intenções

Objetivo: cobrir as 55 sem um prompt único de 9 mil tokens, sem regressão nas 23 atuais, e com o prompt versionado junto do handler.

### 5.1 Tirar do modelo o que o código já sabe

Antes de classificar, três atalhos determinísticos, todos baseados em estado que o Tibé já guarda:

1. **Existe pendência para este usuário?** O Tibé tem pendência em Redis para 11 domínios e `AgentFlowState` para o cadastro guiado. `resolve-contact` passa a devolver `meta.pending = { intent, aguardando: "confirmacao" | "<campo>", expires_at }` (extensão aditiva).
2. **A mensagem é resposta curta a essa pendência** (sim/não, uma opção listada, um valor)? Então não vai ao classificador: vai direto ao `execute-action` com a intenção da pendência, e o Tibé aplica só o campo perguntado. Isso elimina a instrução "reconstrua os mesmos parâmetros do histórico", que é a origem do defeito de parâmetro não literal, e elimina R6 (confirmação só vale com pendência).
3. **Mídia** segue com intenção montada fora do classificador, como hoje.

O que sobra para o modelo é só "pedido novo".

### 5.2 Classificação em dois estágios

```
[Estágio 1: Roteador de domínio]  prompt curto (~800 tokens), JSON Schema estrito
  entrada: mensagem, perfis ativos
  saída:   { pedidos: [ { dominio, trecho } ] }      <- divide multi-intenção aqui
  domínios: rebanho | negocio | estoque | financeiro | confinamento | leite |
            mao_de_obra | servico_maquina | lista_compra | calculadora |
            agenda | consulta | ajuda | fora_de_escopo
  |
  v  (um item por pedido, em sequência)
[Estágio 2: Extrator do domínio]  prompt do domínio (3 a 8 intenções, ~1.000 a 2.000 tokens)
  response_format: json_schema com enum das intenções DO domínio e schema de parâmetros
  saída: { intent, parameters }
```

Por que dois estágios e não um prompt maior:
- Cada extrator vê só as intenções que competem entre si (as três de lactação, as quatro do confinamento), onde os exemplos de verbo realmente importam. O teste de 2026-08-06 mostrou que o acerto veio de pôr o mapa verbo para tipo DENTRO da descrição da intenção; isso escala por domínio, não num texto único.
- `json_schema` estrito com `enum` fecha a porta para intenção inventada e parâmetro fora do lugar (o motivo documentado para os modelos maiores terem se saído pior). Também permite trocar de modelo depois.
- Mudança em leite não reabre o prompt de rebanho: a regressão fica contida no domínio.
- Custo por turno fica próximo do atual (roteador pequeno + um extrator), e o cache de prefixo continua valendo por prompt.
- Fixar o modelo por snapshot, não por alias.

### 5.3 Onde fica o prompt: no repositório, servido pelo Tibé

Hoje o prompt é "estado vivo no n8n" e a documentação registra duas vezes a mesma falha (handler pronto, intenção inalcançável). A correção estrutural é um registro por intenção no Tibé, ao lado de `INTENTS`:

- Cada intenção declara: domínio, descrição, exemplos (frase e parâmetros esperados), e o schema de parâmetros, idealmente o mesmo Zod que o handler usa (Zod 4 gera JSON Schema nativamente).
- `GET /api/internal/whatsapp/classifier-config?stage=router|<dominio>` monta o prompt e o schema a partir do registro. O n8n busca e repassa à OpenAI. A chave do LLM continua no n8n, como a arquitetura decidiu.
- Uma conferência no `npm run check` reprova intenção de `INTENTS` sem entrada no registro, no padrão de catraca do projeto. É o que teria impedido os casos do Módulo 17 e do Módulo 25.
- Alternativa que exige decisão do usuário, porque muda uma decisão de arquitetura documentada: fazer a classificação inteira dentro do Tibé (`/api/internal/whatsapp/interpret`), com a chave do LLM no ambiente do Tibé. Simplifica teste e versionamento ainda mais, e reduz o n8n a transporte.

### 5.4 Nós e subworkflows

Workflow principal, curto e quase só chamadas:

```
Webhook (autenticado)
 -> Normalizar e Validar (instância, apikey, sufixo do JID, timestamp, extrai wamid para todo tipo)
 -> Buffer Append (com wamid; devolve duplicate) -> IF duplicado: FIM
 -> Wait (janela) -> Buffer Flush (devolve fragmentos em ordem, com tipo e wamid) -> IF não pronto: FIM
 -> Resolve Contact (com meta.pending)
 -> Switch: não identificado | primeiro contato (saúda e SEGUE) | normal
 -> [Sub] Interpretar mensagem   (mídia, pendência, roteador, extratores)  -> lista de intenções
 -> [Sub] Executar e responder   (Execute Actions em lote no Tibé, send-message)
 -> saídas de erro de todos os HTTP -> Enviar - Falha técnica
```

Subworkflows (Execute Workflow Trigger com entradas tipadas "Define Below"; o de mídia recebe binário, então usa passthrough):

| Subworkflow | Entrada | Saída | Observação |
|---|---|---|---|
| `Transcrever áudio` | message_id | `{ ok, texto }` | whisper com `language: pt` e `prompt` de vocabulário |
| `Ler nota fiscal` | message_id, legenda | `{ ok, intent, parameters }` | imagem e PDF tratados separadamente |
| `Classificar pedido` | texto, perfis, pendência | `{ intents: [...] }` | roteador + extrator; testável sozinho com dado fixado |
| `Executar e responder` | tenant, user, intents, wamids, phone | `{ ok }` | uma chamada ao Tibé que executa em sequência e compõe o texto |
| `Avisar operador` (error workflow) | contexto do Error Trigger | | canal diferente do WhatsApp (email); configurado em Workflow Settings |

Configuração por nó:

| Nó | retryOnFail | onError | timeout |
|---|---|---|---|
| Resolve Contact, Buffer, fetch-media | 3 tentativas, 2 s | saída de erro para Falha técnica | 10 s |
| OpenAI (roteador, extrator, whisper, visão) | 3 tentativas, 5 s | saída de erro para Falha técnica | 30 s (whisper 60 s) |
| Execute Actions | **só depois da idempotência (R2)**; então 2 tentativas | saída de erro para "pode ter sido registrado, confira no app" | 25 s |
| send-message | 2 tentativas | error workflow | 10 s |

Configuração em um nó Set "Config" no início (URL base do Tibé, nome da instância), em vez de URL fixa em cada nó. Isso é o que permite ter um workflow de homologação idêntico apontando para outro alvo.

### 5.5 Como testar antes de promover

1. **Workflow versionado.** Exportar os workflows para o repositório sem `pinData`, com credenciais só por referência. Conferência automática: `node --check` em toda expressão `={{ }}` (a armadilha documentada no §0.1), `pinData` vazio, nenhum campo `apikey`, nenhuma URL fixa fora do nó Config.
2. **Conjunto de avaliação do classificador.** Arquivo de casos `{ mensagem, perfis, pendência?, esperado: { intent, parameters } }`, montado a partir dos exemplos das specs e de frases reais de `AgentConversationLog` (anonimizadas). Um script chama a OpenAI com o MESMO prompt servido pelo Tibé (não é cópia do fluxo: é o mesmo artefato) e mede acerto por intenção, matriz de confusão por domínio e campos obrigatórios. Porta de promoção: nenhuma intenção das 23 atuais cai, e as novas passam do limiar combinado. Rodar 3 vezes por caso, como no teste de 2026-08-06.
3. **Workflow de homologação.** Cópia exata do principal, com outro caminho de webhook e o nó Config apontando para um preview da Vercel com banco de branch (Neon) e Redis próprio. `npm run wa roteiro` roda contra ele. Os roteiros cobrem os riscos deste relatório: duplicata do mesmo wamid, multi-intenção com confirmação, três fotos seguidas, foto com texto, "ok, gastei 300", "para pagar dia 10", falha forçada do Tibé (segredo errado) esperando a mensagem de falha.
4. **Modo sombra em produção.** Por uma semana, o subworkflow novo roda em paralelo ao classificador atual sem executar nada (disparo sem espera), gravando as duas saídas. Divergências viram casos no conjunto de avaliação. Só então troca.
5. **Liberação por domínio.** Ligar as 32 intenções novas em ondas (leite, confinamento, mão de obra, serviço de máquina, lista, agenda, calculadora, evento e permuta), cada onda com sua avaliação e sua passada no aparelho, como o CLAUDE.md exige.

### 5.6 Ordem sugerida

1. R1 (autenticar webhook) e R8 (apagar `pinData`): mudança pequena, risco grande.
2. R3 parcial: retry e saída de erro nos nós idempotentes, mensagem de falha ao produtor, error workflow.
3. R2: deduplicação na entrada e chave de idempotência composta; depois retry no Execute Action.
4. R6 (Tibé): confirmação por texto só com pendência.
5. R4 e R5: execução em lote no Tibé e mídia fora do buffer.
6. Desligar o humanizador (R7).
7. Registro de intenções, prompt servido pelo Tibé, dois estágios, avaliação e modo sombra; só então as 32 intenções novas.
