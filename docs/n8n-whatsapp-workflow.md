# Guia: Workflow N8N do Agente WhatsApp (Módulo 3)

Este documento descreve, passo a passo, o workflow a ser montado no N8N (Railway)
para integrar o WhatsApp Business Cloud API (Meta) com o Tibé. Não requer alterar
código do Tibé: os endpoints já estão prontos e documentados abaixo.

> Pré-requisitos externos (fora do escopo deste guia): número Salvy ativo, conta
> Meta Business Manager verificada por CNPJ, número vinculado à API Oficial do
> WhatsApp, instância N8N publicada no Railway.

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
| `registrar_movimento` | `ear_tag`, `movement_type` (purchase\|sale\|transfer\|death), `value` (opcional), `to_property_name` (obrigatório se transfer) |
| `cadastrar_servico_ordem` | `client_name`, `service_name`, `quantity` |
| `consultar_saldo` | `period` (opcional, formato "YYYY-MM", default mês atual) |
| `consultar_animal` | `ear_tag` |
| `consultar_cliente` | `client_name` |
| `gerar_relatorio` | `tipo` (financeiro\|rebanho\|lavoura\|prestador), `period`. **Retorna "em breve"** enquanto a geração de PDF real depende do Módulo 4, ainda não implementado |
| `registrar_lancamento_financeiro` | `amount`, `category` (opcional, cai em "Outros" se fora da lista fixa), `vendor` (opcional), `description` (opcional). Disparada tanto por texto ("gastei 50 reais com ração") quanto pelo ramo de recibo por foto/PDF (seção 5). **Sempre** exige confirmação, mesmo com valor baixo — não usa o limiar de R$ 5.000. |
| `ambigua` | usar quando não for possível classificar com confiança |

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

## 5. Suporte a mídia (áudio e recibo por foto/PDF) — spec 2026-07-28

O workflow real em produção ("Tibe - Atendimento WhatsApp (Evolution)") usa
nomes de node em português, diferentes do pseudocódigo genérico da seção 1
(esta seção documenta os nomes reais). Toda a extração por IA (transcrição,
visão) acontece no N8N — o Tibé nunca recebe mídia bruta, só intenção +
parâmetros já estruturados (mesmo princípio da seção 1).

O `Normalizar e Filtrar` (Code) detecta o tipo da mensagem
(`message.conversation`/`extendedTextMessage` = texto,
`message.audioMessage` = áudio, `message.imageMessage`/`documentMessage`
com `mimetype: application/pdf` = mídia) e extrai `phone` + o base64 da
mídia quando aplicável (já chega em base64 no payload por causa do
`webhookBase64: true` configurado na instância Evolution — ver
`src/lib/evolution-client.ts#setInstanceWebhook`). Mensagens sem texto e
sem mídia suportada são descartadas (`return []`), igual já era antes desta
mudança.

**Ramo de áudio:** `É Áudio?` (IF) → `Preparar Áudio` (Code, monta o
`$binary.file` a partir do base64) → `Transcrever Áudio` (HTTP Request,
multipart/form-data pro Whisper da OpenAI, `model: whisper-1`, credencial
"OpenAI API Key") → `Interpretar Transcrição` (Code) → `Transcrição OK?`
(IF): se vazio, `Enviar - Áudio Não Entendido` (pede pra tentar de novo ou
digitar) e encerra; se ok, o texto transcrito segue pro mesmo caminho de uma
mensagem digitada.

**Ramo de recibo:** `É Mídia (Imagem/PDF)?` (IF) → `Extrair Recibo` (HTTP
Request, Chat Completions da OpenAI com `gpt-4o-mini` e `image_url` em data
URI — sem multipart, o base64 vai direto no JSON) → `Parse Extração Recibo`
(Code, valida `amount`/normaliza `category` pra uma das 7 categorias fixas
de `src/lib/category-suggestions.ts`) → `Recibo Legível?` (IF): se
`amount` não veio, `Enviar - Recibo Ilegível` (pede foto mais nítida ou
lançamento manual) e encerra; se ok, monta um `media_intent` com a intenção
`registrar_lancamento_financeiro` pronta.

**Convergência:** os três caminhos (texto, áudio transcrito, recibo legível)
se encontram em `Preparar Mensagem` (Code), que normaliza pra
`{phone, message_text, media_intent}` antes de `Resolve Contact` (nó
reaproveitado sem mudanças). Depois de `Primeiro Contato?`, o node
`Tem Intenção de Mídia?` (IF) decide: se veio de recibo, pula
`Classificar Intenção (OpenAI)` inteiramente e vai direto por
`Montar Ação de Mídia` (Code) pro `Execute Action` já existente — o LLM de
classificação de texto nunca é chamado nesse caminho, porque a visão já
extraiu a intenção estruturada. O prompt de `Classificar Intenção (OpenAI)`
também foi atualizado pra listar `registrar_lancamento_financeiro`, pro caso
de o usuário confirmar ("sim") um lançamento pendente digitando em vez de
mandar novo áudio/foto — o LLM reconstrói a intenção a partir do histórico
recente, igual já fazia para venda de animal/ordem de serviço.

Testado ponta a ponta via webhook sintético (payload Evolution simulado por
`curl`, inspecionando a execução real via `GET /api/v1/executions/:id` da
API do N8N) nos três ramos — texto (regressão), áudio (Whisper transcreveu
corretamente) e recibo (extraiu valor/categoria/fornecedor de um recibo de
teste e criou o `FinancialEntry` de verdade após "sim"). PDF usa o mesmo
ramo de imagem (mandado direto como base64 pro modelo de visão, sem
renderização de página separada) — funcionou no teste, mas vale reconfirmar
com um PDF real de nota fiscal assim que possível.

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
