# Guia: Workflow N8N do Agente WhatsApp (Módulo 3)

Este documento descreve, passo a passo, o workflow a ser montado no N8N (Railway)
para integrar o WhatsApp Business Cloud API (Meta) com o Tibé. Não requer alterar
código do Tibé: os endpoints já estão prontos e documentados abaixo.

> Pré-requisitos externos (fora do escopo deste guia): número Salvy ativo, conta
> Meta Business Manager verificada por CNPJ, número vinculado à API Oficial do
> WhatsApp, instância N8N publicada no Railway.

---

## 0. Estado atual (auditado em 2026-07-30)

- Instância n8n: Railway, `https://n8n-production-3d80.up.railway.app`.
- Workflow **"Tibe - Atendimento WhatsApp (Evolution)"**, id `UAAA96aJFiiFsQCL`,
  **ativo**, 27 nós, apontando para `https://tibe-agrogestao.vercel.app`.
- Webhook de produção: `/webhook/atendimento` (POST), com a Evolution
  configurada para `messages.upsert`.
- Execuções reais com sucesso (auditadas 20 de 20 no histórico).
- Classificação com OpenAI `gpt-4o-mini`; transcrição com `whisper-1`;
  extração de recibo por visão no mesmo `gpt-4o-mini`.

⚠️ **O prompt do classificador é estado vivo dentro do n8n, não do
repositório.** Ao adicionar uma intenção nova ou mudar o vocabulário de
escopos do `resumo`, atualizar o nó `Classificar Intenção (OpenAI)` na
instância, senão a feature fica pronta no Tibé e **inalcançável pelo
WhatsApp**. Foi o que aconteceu com o Módulo 17: `registrar_previsao_vacina`,
`contas_a_pagar` e `ordens_a_faturar` só entraram no prompt em 2026-07-30,
dias depois de o código ir a produção. **Aconteceu de novo com o Módulo 25**:
`registrar_lote_animal` ficou pronto no código desde 2026-08-03 e só foi
notado e corrigido no prompt em 2026-08-04, junto da entrada do Módulo 27
(`criar_tarefa`). A partir de 2026-08-04 o payload enviado ao classificador
também inclui `current_date` (`$now.toISODate()`), necessário pra `criar_tarefa`
interpretar datas relativas ("quinta", "amanhã") de verdade: sem isso o
modelo não tem como saber que dia é hoje.

**Alertas não passam pelo n8n** (mudança de 2026-07-30): o Tibé envia direto
pelo provider ativo (`sendWhatsAppMessage`). O n8n cuida apenas do sentido de
ENTRADA. A variável `N8N_ALERT_WEBHOOK_URL` deixou de existir.

**Duas rotinas agendadas menores, fora deste workflow principal** (n8n como
gatilho de cron, não de conversa): "Tibe - Lembrete de cadastro abandonado"
(Schedule Trigger a cada 15min, chama `POST
/api/internal/whatsapp/pending-flows`) e "Tibe - Resumo diario" (Schedule
Trigger diário às 11h UTC/08h Brasília, chama `GET
/api/internal/jobs/daily-digest`, Onda 2/3). As duas usam a credencial
`httpHeaderAuth` "Tibe Internal Secret" (`x-internal-secret` contra
`INTERNAL_API_SECRET`), o mesmo padrão de toda rota `/api/internal/*`. O
resumo diário nasceu pensado pra Vercel Cron (`vercel.json`), mas foi movido
pro n8n em 2026-08-03: o plano da Vercel do projeto não era verificável pelo
usuário, e o n8n já resolvia exatamente esse tipo de rotina sem essa dúvida.
Só `/api/internal/jobs/generate-alerts` continua na Vercel Cron (já
comprovadamente funciona lá, sem motivo pra mudar).

---

## 0.1 Armadilhas confirmadas em produção (2026-07-30)

Duas coisas quebraram o agente neste dia. Ambas custam minutos se você souber,
e horas se não souber.

**1. Credencial da OpenAI: use o tipo PREDEFINIDO, não Header Auth genérica.**
O nó `Transcrever Áudio` é a única chamada `multipart/form-data` do workflow, e
com "Generic Credential Type / Header Auth" o n8n **não injetava** o header de
autorização nela: a OpenAI respondia "You didn't provide an API key" (erro de
header AUSENTE, diferente de "Incorrect API key provided", que seria chave
errada). Os nós JSON com a mesma credencial funcionavam normalmente, o que faz o
problema parecer de credencial quando não é. Solução: `Authentication:
Predefined Credential Type` + `Credential Type: OpenAi`, nos três nós de LLM
(`Classificar Intenção`, `Transcrever Áudio`, `Extrair Recibo`).

**2. Editar o prompt pela API exige validar a SINTAXE, não só o conteúdo.**
O campo `jsonBody` do nó de classificação é uma expression do n8n
(`={{ JSON.stringify({...}) }}`), ou seja, **código JavaScript**. Um texto
inserido com uma quebra de linha REAL dentro da string derruba a expression
inteira com `invalid syntax`, e aí nenhuma requisição chega a sair (o erro
aparece com qualquer credencial, o que despista). Separador de linha dentro do
prompt tem que ser a sequência de escape de dois caracteres, nunca um newline.

**Portanto: antes de qualquer PUT que mexa nesse campo, valide.** Conferir que os
termos novos "aparecem no texto" NÃO é validação: presença de conteúdo não é
validade sintática. Extraia o miolo entre `={{` e `}}` e rode:

```bash
node --check arquivo-com-a-expression.js
```

E releia o workflow da API depois de escrever, revalidando o que ficou no ar.
Guarde sempre o JSON original antes do PUT: foi o que permitiu reverter rapido.

---

## 0.2 Buffer de mensagens e multi-intenção (2026-07-30)

**Buffer.** O produtor escreve picado ("oi" / "tudo bom?" / "me diz..."), e sem
buffer cada fragmento virava uma execução completa, com uma chamada de LLM e uma
resposta cada. A janela de **12 segundos** vive no Tibé
(`POST /api/internal/whatsapp/buffer`, `src/lib/actions/whatsapp-buffer.ts`), não
em nós do n8n: o Redis já está configurado lá, a regra fica versionada e
testável (`npm run test:m20`), e o n8n segue orquestrador fino.

Cadeia no workflow, entre `Preparar Mensagem` e `Resolve Contact`:
`Buffer Append` → `Aguardar Fragmentos` (Wait 12s) → `Buffer Flush` →
`Deve Responder?` (IF) → `Consolidar Mensagem`.

A corrida é decidida por **contador, não por timestamp**: cada fragmento
incrementa um token e só processa quem carrega o último; as outras execuções
morrem em silêncio. Timestamp empataria em mensagens quase simultâneas, que é
exatamente o caso comum aqui.

⚠️ **`Consolidar Mensagem` passou a ser a fonte do texto**, no lugar de
`Preparar Mensagem`. As referências `$('Preparar Mensagem')` de
`Classificar Intenção`, `Execute Action`, `Tem Intenção de Mídia?` e
`Montar Ação de Mídia` foram repontadas. Quem esquecer disso ao editar vai
classificar o ÚLTIMO FRAGMENTO em vez da mensagem inteira, e o bug é silencioso.

**Recibo por foto também passa pelo buffer** (decisão revista na implementação):
o desvio exigiria um ramo extra e mais religação, com ganho pequeno. O custo é
uma espera de 12s antes de processar a foto.

**Multi-intenção.** O prompt devolve `intents: []`, o `Parse Resposta LLM` emite
**um item por intenção** (o n8n roda o `Execute Action` uma vez para cada, sem
nó de loop) e o `Separar Respostas` manda **uma mensagem por assunto**. Teto de
3 intenções por mensagem, para transcrição confusa não virar cinco chamadas.
Se qualquer ação pedir confirmação, ela responde sozinha: misturar a pergunta
de sim/não com outras respostas quebraria o fluxo de confirmação.

**Armadilha do ambiente:** ao editar esses campos por script, barras invertidas
em heredoc podem ser colapsadas, virando quebra de linha REAL dentro da string
JS e derrubando a expression. Monte os escapes com `chr(92)` e valide com
`node --check` antes e depois do PUT (ver seção 0.1).

---

## 1. Arquitetura

```
WhatsApp do produtor
        ↓
Meta Business Cloud API → Webhook N8N
        ↓
[N8N] Node 1: Webhook trigger (recebe evento bruto da Meta)
        ↓
[N8N] Node 2: Normaliza payload (extrai phone, texto da mensagem)
        ↓
[N8N] Node 3: HTTP Request → POST /api/internal/whatsapp/resolve-contact (Tibé)
        ↓
   identified=false? ──→ [N8N] Envia meta.suggested_reply via Tibé (send-message) → FIM
        ↓ identified=true
   first_contact=true? ──→ [N8N] Envia meta.suggested_reply (saudação) via Tibé (send-message) → FIM
        ↓ (conversa normal)
[N8N] Node 4: Chamada ao LLM (mensagem + contexto + histórico) → classifica intenção
        ↓
[N8N] Node 5: HTTP Request → POST /api/internal/whatsapp/execute-action (Tibé)
        ↓
[N8N] Node 6: HTTP Request → POST /api/internal/whatsapp/send-message (Tibé)
        ↓
[N8N] Error Trigger: em qualquer falha das etapas 3-6, envia mensagem de fallback
```

Toda a "inteligência" de identificar tenant/usuário e executar a ação vive no
Tibé. O N8N é só orquestração: recebe da Meta, chama o LLM, chama o Tibé, e
manda a resposta de volta.

---

## 2. Credenciais/variáveis a configurar no N8N

| Nome | Uso |
|---|---|
| `TIBE_BASE_URL` | URL da aplicação (ex: `https://tibe-agrogestao.vercel.app`) |
| `TIBE_INTERNAL_SECRET` | Mesmo valor de `INTERNAL_API_SECRET` do Tibé: vai no header `x-internal-secret` (resolve-contact, execute-action e agora também send-message) |
| `META_WHATSAPP_VERIFY_TOKEN` | Usado na verificação do webhook (challenge): segue existindo porque o RECEBIMENTO continua no N8N mesmo com o envio migrado para o Tibé |
| Credencial do LLM escolhido | Ex: Anthropic ou OpenAI: **ainda não decidido**; o node de LLM é o único ponto do workflow que precisa dessa chave. Nenhum código do Tibé depende dela. |

> `META_WHATSAPP_TOKEN` e `META_WHATSAPP_PHONE_ID` **saíram** desta tabela
> (spec 2026-07-11): o envio de mensagens não é mais responsabilidade do N8N,
> então essas credenciais agora vivem só no painel do Tibé
> (`/plataforma/configuracoes/whatsapp`), criptografadas em
> `WhatsAppProviderConfig`. `META_WHATSAPP_VERIFY_TOKEN` continua aqui porque
> a verificação do webhook de ENTRADA é feita pelo N8N, não pelo Tibé.

---

## 3. Node a node

### Node 1: Webhook (Trigger)

- Configure dois métodos no mesmo path do N8N:
  - `GET`: responde ao desafio de verificação da Meta. A Meta chama com
    `?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`. Verifique se
    `hub.verify_token` bate com `META_WHATSAPP_VERIFY_TOKEN` e responda com o
    valor de `hub.challenge` em texto puro.
  - `POST`: recebe o payload de mensagens da Meta.
- No **Meta App Dashboard**, registre esse endpoint do N8N (não o do Tibé) como
  Webhook URL do produto WhatsApp.

### Node 2: Normalizar payload (Function/Set)

Extraia do payload da Meta (formato `entry[0].changes[0].value.messages[0]`):
- `phone` = `messages[0].from`
- `message_text` = `messages[0].text.body`

### Node 3: HTTP Request: resolve-contact

```
POST {{TIBE_BASE_URL}}/api/internal/whatsapp/resolve-contact
Headers: x-internal-secret: {{TIBE_INTERNAL_SECRET}}
Body: { "phone": "{{ $json.phone }}" }
```

Resposta relevante:
```json
{
  "data": { "identified": true, "tenant_id": "...", "user_id": "...", "role": "...", "active_profiles": [...] },
  "meta": { "first_contact": false, "suggested_reply": null, "recent_history": [...] }
}
```

**Branch 1**: `data.identified === false`: envie `meta.suggested_reply` via
Tibé (Node 6: send-message, abaixo) e encerre o workflow.

**Branch 2**: `meta.first_contact === true`: envie `meta.suggested_reply`
(saudação já pronta) via Tibé (Node 6: send-message) e encerre: ou, se
preferir, prossiga para já processar a primeira mensagem também (opcional).

**Branch 3**: conversa normal: siga para o Node 4.

### Node 4: Chamada ao LLM

Envie ao LLM escolhido:
- A mensagem do usuário (`message_text`)
- `data.active_profiles` (contexto do tenant)
- `meta.recent_history` (últimas 5 interações, já vem do resolve-contact)
- A lista de intenções e parâmetros esperados (seção 4 abaixo)

Peça ao LLM para responder em **JSON estrito**:
```json
{ "intent": "cadastrar_animal", "parameters": { "ear_tag": "1234", "breed": "Nelore", "sex": "male" } }
```

> **Confirmação ("sim"/"não"):** quando o histórico mostra que o bot fez uma
> pergunta de confirmação, e a mensagem atual do usuário é uma resposta simples
> ("sim", "confirmo", "não", "cancela"), o LLM deve **reconstruir a intenção e os
> parâmetros originais** (a partir do histórico) e adicionar `"confirmed": true`
> (ou `false`) ao JSON de saída. O Tibé também interpreta "sim"/"não" no campo
> `message_text` como uma rede de segurança adicional, mas o ideal é que o LLM
> já resolva isso via contexto.

### Node 5: HTTP Request: execute-action

```
POST {{TIBE_BASE_URL}}/api/internal/whatsapp/execute-action
Headers: x-internal-secret: {{TIBE_INTERNAL_SECRET}}
Body:
{
  "tenant_id": "{{ resolve-contact.data.tenant_id }}",
  "user_id": "{{ resolve-contact.data.user_id }}",
  "intent": "{{ llm.intent }}",
  "parameters": {{ llm.parameters }},
  "message_text": "{{ $json.message_text }}",
  "confirmed": {{ llm.confirmed }}
}
```

Resposta:
```json
{ "data": { "reply_text": "...", "requires_confirmation": false, "auxiliary_data": {}, "report_url": null } }
```

### Node 6: HTTP Request: send-message (Tibé)

O N8N NÃO chama mais a Meta Cloud API (nem a Evolution) diretamente para
enviar. Envie qualquer resposta via Tibé:

```
POST {{TIBE_BASE_URL}}/api/internal/whatsapp/send-message
Headers: x-internal-secret: {{TIBE_INTERNAL_SECRET}}
Body: { "to": "{{ $json.phone }}", "text": "{{ $json.reply_text }}" }
```

O Tibé decide o provider (Evolution ou Meta) pela config do painel
(`/plataforma/configuracoes/whatsapp`): trocar de provider não exige
alterar este workflow. Erros: 503 = nenhum provider ativo; 502 = o provider
recusou/falhou (mensagem detalhada em `error.message`).

### Node de erro (Error Trigger / try-catch)

Envolva os Nodes 3–6 num bloco de tratamento de erro. Em qualquer falha, envie
uma mensagem de fallback amigável (sem detalhes técnicos), por exemplo:

> "Desculpe, tive um problema para processar sua mensagem. Tente novamente em
> instantes ou entre em contato com o suporte."

---

## 4. Intenções suportadas (para o prompt do LLM)

| Intenção | Parâmetros esperados |
|---|---|
| `cadastrar_animal` | `ear_tag`, `breed`, `sex` (male\|female), `property_name` (opcional) |
| `registrar_peso` | `ear_tag`, `weight` (kg) |
| `registrar_vacina` | `ear_tag`, `vaccine_name`, `cost` (opcional) |
| `registrar_previsao_vacina` | `ear_tag`, `vaccine_name`, `cost`, `due_date` (opcional, formato `YYYY-MM-DD`; sem data, o Tibé usa o próximo vencimento calculado). Use quando o usuário informar um valor previsto para uma vacina futura, inclusive ao responder à oferta feita pelo `resumo:rebanho`. Nessa resposta curta, reconstrua `ear_tag` e `vaccine_name` pelo `recent_history`. |
| `registrar_movimento` | `ear_tag`, `movement_type` (purchase\|sale\|transfer\|death), `value` (opcional), `to_property_name` (obrigatório se transfer) |
| `cadastrar_servico_ordem` | `client_name`, `service_name`, `quantity` |
| `consultar_saldo` | `period` (opcional, formato "YYYY-MM", default mês atual). **É do FINANCEIRO**, não do rebanho: "qual meu saldo" fala de dinheiro. Para "quantos animais tenho", use `consultar_rebanho`. |
| `consultar_animal` | `ear_tag` |
| `consultar_rebanho` | `categoria` (opcional), `fazenda` (opcional). Módulo 30, §13.1 e §13.2. Sem `categoria`, responde o total geral do rebanho. Com `categoria`, responde só aquela faixa. Ex: "Quantos animais tenho?" e "Quantas fêmeas de 13 a 24 meses eu tenho?" |
| `registrar_movimentacao_rebanho` | `movement_type` (obrigatório: `saldo_inicial`\|`nascimento`\|`compra`\|`venda`\|`morte`\|`transferencia_pasto`\|`transferencia_fazenda`\|`mudanca_categoria`\|`ajuste`), `itens` (lista de `{categoria, quantidade}`) ou, para um item só, `categoria` + `quantidade`. Opcionais: `fazenda`, `pasto` (ou `pasto_origem`), `pasto_destino`, `categoria_destino` (obrigatório em `mudanca_categoria`), `fazenda_destino` (obrigatório em `transferencia_fazenda`), `valor`. Módulo 30, §13.3 a §13.7. **Sempre** exige confirmação, independente de valor: não usa o limiar de R$ 5.000, porque aqui o risco é o saldo do rebanho ficar errado, não o financeiro. |
| `registrar_negocio_gado` [1] | `tipo` (obrigatório: `compra`\|`venda`), `categoria` + `quantidade` (ou `itens`, lista de `{categoria, quantidade}`), `valor`. Opcionais: `fazenda`, `vendedor` ou `comprador` (o contato é criado com só o nome, §4), `vencimento` ("para pagar dia 10"), `data` (a data do negócio, se não for hoje), `parcelas` (número), `pago` (booleano), e os custos do §15: `frete`, `comissao`, `taxa_leilao`, `taxa_feira`, `carregamento`, `descarregamento`, `guia_transporte`, `exames`, `vacinas`, `pedagio`, `outros`. Módulo 31, §18. **Sempre** exige confirmação, independente de valor: um negócio grava rebanho E financeiro numa tacada, e desfazer exige cancelar a negociação inteira. |
| `consultar_cliente` | `client_name` |
| `gerar_relatorio` | `tipo` (financeiro\|rebanho\|lavoura\|prestador), `period`. **Retorna "em breve"** enquanto a geração de PDF real depende do Módulo 4, ainda não implementado |
| `registrar_lancamento_financeiro` | `amount`, `category` (opcional, cai em "Outros" se fora da lista fixa), `vendor` (opcional), `description` (opcional). Disparada tanto por texto ("gastei 50 reais com ração") quanto pelo ramo de recibo por foto/PDF (seção 5). **Sempre** exige confirmação, mesmo com valor baixo: não usa o limiar de R$ 5.000. |
| `ajuda` | `topic` (opcional: nome de uma das intenções acima; omitido para pergunta geral tipo "o que você faz?"). Usada quando o usuário pergunta COMO usar um recurso, não tenta executá-lo. Resposta é texto fixo (nunca gerado pela LLM), tabela `HELP_TEXT` em `whatsapp-router.ts`. |
| `resumo` | `scope` opcional. Nível 1: `rebanho`/`lavoura`/`prestador`/`financeiro`. Sob `prestador`: `clientes`/`agendamentos`/`ordens_a_faturar`. Escopos financeiros disponíveis em qualquer perfil: `contas_a_pagar` e `contas_a_receber`. `contas_a_pagar` lista despesas pendentes; `contas_a_receber` lista receitas pendentes de `FinancialEntry`; `ordens_a_faturar` lista ordens concluídas ainda não faturadas. Use quando o usuário quer consultar agenda, contas ou o que já está cadastrado. Sem `scope` claro, o assistente pergunta a categoria em vez de despejar tudo: funil de até 2 perguntas, reconstruído do `recent_history` a cada turno. Se o histórico mostra que já perguntou e a resposta não resolveu, o LLM deve classificar como `ambigua` em vez de perguntar de novo. |
| `ambigua` | usar quando não for possível classificar com confiança. Com `ajuda`/`resumo` cobrindo "como faço"/"o que eu tenho", sobra pra isso o que realmente foge do escopo. |

**[1] Empate com `registrar_movimentacao_rebanho`, resolvido em código, não no
prompt.** "Comprei 20 bezerros por 60 mil" satisfaz as duas intenções: a do
rebanho aceita `movement_type: "compra"` com `valor` e já grava movimento mais
lançamento financeiro. O prompt não precisa acertar essa escolha, e não deve
ser o único a decidi-la: `desempatarIntencao()`, em
`src/lib/actions/whatsapp-router.ts`, converte **compra ou venda COM valor** em
`registrar_negocio_gado` antes de qualquer checagem de permissão. Compra e
venda **sem** valor continuam no rebanho, que é a correção de livro-razão sem
dinheiro envolvido. A regra é função pura e testada em `test:m36`, e vale numa direção só:
`registrar_movimentacao_rebanho` com valor **vira** negócio, mas
`registrar_negocio_gado` sem valor **não** volta para o rebanho, e nesse caso
o assistente fica pedindo o valor. Por isso: mande `registrar_negocio_gado`
apenas quando a frase tiver valor em dinheiro; sem valor, mande
`registrar_movimentacao_rebanho`.

### 4.0. Por que o classificador é `gpt-4o-mini` com `temperature: 0`

Medido em 2026-08-06, contra os 4 casos que falharam em teste real e com o
`recent_history` contaminado que causou o bug (histórico cheio de
`nascimento`), 3 rodadas cada:

| Configuração | Acertos |
|---|---|
| **`gpt-4o-mini` (o que está no ar)** | **12/12** |
| `gpt-4o-mini` + `temperature: 0` | 12/12 |
| `gpt-4.1` | 9/12 |
| `gpt-5-mini` | 12/12 |
| `gpt-5.1` | 9/12 |

**O modelo nunca foi o gargalo: o prompt era.** O que consertou foi mover o
mapa de verbo para tipo (`tenho` = `saldo_inicial`, `nasceram` = `nascimento`)
para DENTRO da descrição da intenção, que é onde o modelo decide o parâmetro.
Antes essa regra vivia só na seção de regras do rodapé e era ignorada.

**Os modelos mais fortes se saíram PIOR**, e de um jeito específico: acertaram
o sentido mas devolveram o formulário fora do formato (`movement_type` em
outro lugar). O formato está descrito em prosa, e modelo mais forte se sente
mais livre para reestruturar. Trocar de modelo aqui exigiria antes trocar o
`response_format: json_object` por um JSON Schema estrito.

`temperature: 0` foi adicionado porque classificação estruturada não deve ser
aleatória: o nó rodava no default 1.0. Não mudou acerto no teste, mas torna o
comportamento reprodutível quando for preciso depurar.

### 4.1. Rebanho: a pergunta de faixa de idade (Módulo 30, §14)

O produtor usa nome popular, e vários deles servem a mais de uma faixa:
"novilha" pode ser fêmea de 8 a 12, 13 a 24 ou 25 a 36 meses; "garrote" idem
no macho. O documento do cliente fecha o §14 com **"o sistema não deverá
escolher uma categoria sem confirmação"**, então o Tibé responde com a
pergunta e as faixas candidatas, e **não registra nada**:

```
Usuário: Passe 20 novilhas do Pasto da Sede para o Pasto da Baixada.
Tibé:    "novilhas" pode ser mais de uma categoria. Qual é a idade aproximada?
         - Fêmea - 8 a 12 meses
         - Fêmea - 13 a 24 meses
         - Fêmea - 25 a 36 meses
```

⚠️ **Duas perguntas penduradas confundem o classificador** (achado em teste
real, 2026-08-05). O produtor deixou a pergunta da faixa sem resposta, mudou de
assunto ("nasceram 4 machos e 3 fêmeas"), e no dia seguinte respondeu a faixa:
o classificador misturou as duas e devolveu um nascimento de 4 bezerros,
perdendo as 3 bezerras. Duas regras no prompt cobrem isso: a pergunta pendente
é **sempre a mais recente**, e pergunta de outro dia **não revive**. Enquanto o
histórico for o único estado, isso é mitigação, não garantia: a solução
definitiva seria guardar a pergunta pendente com prazo, decisão ainda não
tomada.

**O que o LLM precisa fazer no turno seguinte:** quando a mensagem do usuário
for só a faixa ("13 a 24 meses", "as de 13 a 24"), reemita
`registrar_movimentacao_rebanho` **com todos os parâmetros originais**
(`movement_type`, `quantidade`, `pasto_origem`, `pasto_destino`...),
reconstruídos do `recent_history`, trocando apenas `categoria` pela faixa que
o usuário escolheu. Não existe estado de conversa novo no banco para isso: é
o mesmo mecanismo do funil do `resumo`.

### 4.2. Rebanho: quando o pasto citado não tem saldo

O pasto faz parte da identidade da posição. Se o rebanho foi cadastrado sem
separar por pasto, "morreram 2 vacas no Pasto da Baixada" não acha nada lá. O
Tibé **não** move do outro pasto sozinho: responde onde os animais estão e
devolve a escolha, mesmo princípio do §14.

```
Usuário: Morreram duas vacas no Pasto da Baixada.
Tibé:    Não encontrei Fêmea - acima de 36 meses no Pasto da Baixada.
         Você tem 45 em sem pasto informado. Registro por lá?
```

**Turno seguinte:** um "sim", ou uma resposta que nomeia o lugar ("do Pasto da
Sede", "sem pasto mesmo"), deve reemitir `registrar_movimentacao_rebanho` com
os parâmetros originais do histórico, ajustando `pasto` (ou omitindo-o, quando
a resposta for "sem pasto"). Mesma mecânica da faixa de idade.

Quando a categoria não tem saldo em lugar nenhum, a resposta é outra: a
mensagem literal do documento do cliente, "Existem apenas N animais nesta
categoria. Revise a quantidade informada."

Termos que resolvem sozinhos, sem pergunta: `bezerro`, `bezerra`, `vaca`,
`boi`, `touro`, e os rótulos oficiais. Plural funciona (`vacas`, `bezerros`,
`bois`). A lista de apelidos é `CATEGORY_ALIASES` em
`src/lib/herd/categories.ts`, e é ela que manda: se um termo novo aparecer no
uso real, adicione lá, não no prompt.

⚠️ **`registrar_lote_animal` é o caminho ANTIGO** e escreve num modelo que o
saldo do rebanho não lê mais. Para qualquer quantidade de rebanho, use
`registrar_movimentacao_rebanho`. O antigo segue existindo só enquanto a
migração dos consumidores não termina.

Na classificação operacional, diferencie os pedidos pelo dado solicitado:
`registrar_vacina` registra uma aplicação realizada;
`registrar_previsao_vacina` registra o custo futuro de uma vacina;
`resumo:contas_a_receber` consulta receitas financeiras pendentes; e
`resumo:ordens_a_faturar` consulta trabalho concluído que ainda precisa virar
fatura. Frases como "minhas contas a pagar deste mês" devem resultar em
`{"intent":"resumo","parameters":{"scope":"contas_a_pagar"}}`.

O Tibé já trata, de forma **totalmente automática** (o LLM não precisa se
preocupar com isso):
- Validação de permissão por role (Visualizador não executa ações de escrita).
- Validação de perfil ativo do tenant (fazenda/prestador).
- Confirmação obrigatória para venda de animal ou ordem de serviço acima de
  **R$ 5.000** (o Tibé já retorna `requires_confirmation: true` e o texto de
  confirmação pronto: o LLM só precisa reenviar a mesma intenção com
  `confirmed: true` quando o usuário concordar).
- Pedidos de esclarecimento quando faltam dados obrigatórios (ex: mais de uma
  propriedade e nenhuma especificada): o Tibé já devolve a pergunta pronta em
  `reply_text`, incluindo as opções em `auxiliary_data` quando aplicável.

---

## 5. Suporte a mídia (áudio e recibo por foto/PDF): spec 2026-07-28

O workflow real em produção ("Tibe - Atendimento WhatsApp (Evolution)") usa
nomes de node em português, diferentes do pseudocódigo genérico da seção 1
(esta seção documenta os nomes reais). Toda a extração por IA (transcrição,
visão) acontece no N8N: o Tibé nunca recebe mídia bruta, só intenção +
parâmetros já estruturados (mesmo princípio da seção 1).

O `Normalizar e Filtrar` (Code) detecta o tipo da mensagem
(`message.conversation`/`extendedTextMessage` = texto,
`message.audioMessage` = áudio, `message.imageMessage`/`documentMessage`
com `mimetype: application/pdf` = mídia) e extrai `phone` + `message_id`
(`data.key.id`). **Não tenta ler base64 inline do payload do webhook**:
descoberto em teste real (2026-07-28) que `webhookBase64: true` não é
confiável pra áudio/imagem na Evolution API em produção (o campo
simplesmente não vem, mesmo configurado: comportamento documentado em
vários issues do projeto Evolution). Em vez disso, um node HTTP novo,
`Buscar Mídia (Áudio)`/`Buscar Mídia (Recibo)`, chama
`POST /api/internal/whatsapp/fetch-media` (Tibé, credencial "Tibe Internal
Secret") logo depois de `É Áudio?`/`É Mídia (Imagem/PDF)?`, passando o
`message_id`: o Tibé busca e decripta a mídia sob demanda via
`/chat/getBase64FromMediaMessage` da própria Evolution
(`src/lib/whatsapp-media.ts`) e devolve `{data: {base64, mimetype}}`.
Mensagens sem texto e sem mídia suportada são descartadas (`return []`).

**Ramo de áudio:** `É Áudio?` (IF) → `Buscar Mídia (Áudio)` → `Preparar
Áudio` (Code, monta o `$binary.file` a partir de `$json.data.base64`) →
`Transcrever Áudio` (HTTP Request, multipart/form-data pro Whisper da
OpenAI, `model: whisper-1`, credencial "OpenAI API Key") → `Interpretar
Transcrição` (Code) → `Transcrição OK?` (IF): se vazio, `Enviar - Áudio Não
Entendido` (pede pra tentar de novo ou digitar) e encerra; se ok, o texto
transcrito segue pro mesmo caminho de uma mensagem digitada.

**Ramo de recibo:** `É Mídia (Imagem/PDF)?` (IF) → `Buscar Mídia (Recibo)` →
`Extrair Recibo` (HTTP Request, Chat Completions da OpenAI com
`gpt-4o-mini` e `image_url` em data URI a partir de `$json.data.base64`/
`$json.data.mimetype`: sem multipart, o base64 vai direto no JSON) →
`Parse Extração Recibo` (Code, valida `amount`/normaliza `category` pra uma
das 7 categorias fixas de `src/lib/category-suggestions.ts`) → `Recibo
Legível?` (IF): se `amount` não veio, `Enviar - Recibo Ilegível` (pede foto
mais nítida ou lançamento manual) e encerra; se ok, monta um `media_intent`
com a intenção `registrar_lancamento_financeiro` pronta.

**Convergência:** os três caminhos (texto, áudio transcrito, recibo legível)
se encontram em `Preparar Mensagem` (Code), que normaliza pra
`{phone, message_text, media_intent}` antes de `Resolve Contact` (nó
reaproveitado sem mudanças). Depois de `Primeiro Contato?`, o node
`Tem Intenção de Mídia?` (IF) decide: se veio de recibo, pula
`Classificar Intenção (OpenAI)` inteiramente e vai direto por
`Montar Ação de Mídia` (Code) pro `Execute Action` já existente: o LLM de
classificação de texto nunca é chamado nesse caminho, porque a visão já
extraiu a intenção estruturada. O prompt de `Classificar Intenção (OpenAI)`
também foi atualizado pra listar `registrar_lancamento_financeiro`, pro caso
de o usuário confirmar ("sim") um lançamento pendente digitando em vez de
mandar novo áudio/foto: o LLM reconstrói a intenção a partir do histórico
recente, igual já fazia para venda de animal/ordem de serviço.

Testado ponta a ponta via webhook sintético (payload Evolution simulado por
`curl`, inspecionando a execução real via `GET /api/v1/executions/:id` da
API do N8N) nos três ramos, incluindo com um **áudio real** mandado pelo
usuário no WhatsApp de verdade (reprocessado via `message_id` real depois
do fix do `fetch-media`: Whisper transcreveu perfeitamente uma fala de 12
segundos). O ramo de recibo foi validado ponta a ponta (extraiu
valor/categoria/fornecedor de um recibo de teste e criou o `FinancialEntry`
de verdade após "sim") **antes** da mudança pra `fetch-media`: como esse
node é idêntico em estrutura pro áudio e pro recibo (mesmo endpoint, só
muda o `message_id`), e já foi provado funcionando com mídia real no ramo
de áudio, a composição deveria funcionar igual pro recibo, mas **ainda não
foi reconfirmada com uma foto real** depois dessa mudança específica (não
dá mais pra testar com payload sintético, já que `fetch-media` precisa de
um `message_id` que exista de verdade na Evolution). PDF usa o mesmo ramo
de imagem (mandado direto como base64 pro modelo de visão, sem renderização
de página separada): ainda não testado com um PDF real.

---

## 6. Checklist de teste manual (após montar o workflow)

- [ ] Enviar mensagem de um número não cadastrado → recebe orientação, nenhuma ação executada
- [ ] Enviar mensagem de um número recém-vinculado a um usuário → recebe saudação personalizada
- [ ] "cadastra o boi 1234, nelore, macho" → animal criado corretamente
- [ ] "vendi o boi 1234 por 8000 reais" → pede confirmação; "sim" confirma e cria o lançamento financeiro
- [ ] "quanto o cliente João me deve" → retorna valor pendente correto
- [ ] Usuário com role Visualizador tenta cadastrar algo → é bloqueado
- [ ] Derrubar a rota do Tibé propositalmente (ex: secret errado) → workflow retorna mensagem de erro amigável, sem detalhes técnicos
- [ ] Mandar um áudio real perguntando algo simples → resposta correta, igual texto
- [ ] Mandar uma foto real de nota/recibo → pede confirmação com valor/categoria certos; "sim" cria o lançamento
- [ ] Mandar uma foto ilegível/embaçada → pede foto mais nítida, sem criar lançamento nenhum
- [ ] "como eu cadastro um animal?" → recebe o texto de ajuda certo (tabela `HELP_TEXT`), sem tentar cadastrar nada
- [ ] "me mostra o que eu tenho" (tenant com os 2 perfis) → pergunta a categoria (Rebanho/Lavoura/Prestador/Financeiro); responder "prestador" pergunta o nível 2 (Clientes/Agendamentos/Contas a receber); responder "clientes" mostra o dado real
- [ ] Responder algo solto no meio do funil de `resumo` (ex: "não sei") → assistente para de perguntar e explica o que pode fazer (`ambigua`), em vez de insistir
- [ ] **Classificação por LLM não é 100% determinística**: em teste real, "me mostra o que eu tenho" caiu em `ambigua` na primeira tentativa e em `resumo` corretamente na segunda, mesma frase: não é um bug de código (confirmado via `recent_history` limpo), é variação normal do modelo. Se acontecer ocasionalmente em produção, o novo texto de `ambigua` já convida a tentar de novo ("pergunte 'o que você faz?'"), então o impacto é baixo.
