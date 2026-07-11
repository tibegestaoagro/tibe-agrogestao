# Configuração de provider WhatsApp pelo Painel da Plataforma

**Data:** 2026-07-11 · **Status:** aprovado pelo usuário (design), aguardando implementação

## Contexto e objetivo

A API oficial do WhatsApp (Meta Cloud API) está em fase de aprovação (Meta
Business Manager / Salvy ainda não provisionados). Para testar o agente
WhatsApp **agora**, o usuário decidiu subir a **Evolution API** (protocolo
não-oficial, self-host no Railway) em paralelo, e migrar para a Meta quando a
aprovação sair.

Objetivo desta feature: a troca Evolution ↔ Meta deve ser feita **pelo Painel
da Plataforma (`/plataforma`)**, com 1 clique, sem redeployar nada e sem
reconfigurar o N8N.

### Mudança arquitetural deliberada

Hoje o CLAUDE.md diz "o Tibé nunca fala direto com a Meta Cloud API; o N8N é o
único intermediário". **Esta feature quebra essa regra de propósito** (decisão
do usuário, 2026-07-11): o **envio** de mensagem passa a ser feito pelo
próprio Tibé, através de um novo endpoint interno que o N8N chama. O Tibé
decide internamente (pela config do painel) se entrega via Evolution ou Meta.

O **recebimento** (webhook de mensagem chegando) **não muda**: continua
batendo no N8N (não existe `/api/webhooks/whatsapp` no Tibé, e continua não
existindo). Meta e Evolution têm payloads de entrada diferentes — o Node 1/2
do N8N precisa de um branch por provider de qualquer forma. Ou seja: a troca
1-clique vale para a metade de **saída** do fluxo; a entrada exige o workflow
N8N ter os dois formatos mapeados (feito uma única vez).

## Modelo de dados

Novo model Prisma `WhatsAppProviderConfig` — **fora** de
`TENANT_SCOPED_MODELS` (config global da plataforma, não pertence a tenant;
mesma categoria estrutural de `PlatformUser`/`SubscriptionStatusLog`).

```prisma
enum WhatsAppProvider {
  evolution
  meta_cloud_api
}

model WhatsAppProviderConfig {
  id                    String            @id @default(cuid())
  provider              WhatsAppProvider  @unique
  active                Boolean           @default(false)
  credentials_encrypted String            // JSON criptografado (AES-256-GCM)
  updated_at            DateTime          @updatedAt
  created_at            DateTime          @default(now())
}
```

- **Um registro por provider** (`@unique`), os dois podem existir em paralelo
  — configurar a Meta depois não apaga a Evolution.
- **No máximo 1 `active: true`** por vez. Invariante garantida por transação
  na ativação (`updateMany({ active: false })` + `update({ active: true })`
  no mesmo `$transaction`) — não por constraint de banco (Postgres não tem
  "unique where true" sem partial index; um partial unique index
  `WHERE active` na migração é bem-vindo como defesa extra, mas a transação é
  a fonte de verdade).
- `credentials_encrypted`: JSON serializado e criptografado. Formato por
  provider:
  - `evolution`: `{ "base_url": "...", "api_key": "...", "instance": "..." }`
  - `meta_cloud_api`: `{ "access_token": "...", "phone_number_id": "..." }`

### Criptografia (novo `src/lib/crypto-config.ts`)

- AES-256-GCM via `node:crypto`, chave de env var nova **`CONFIG_ENCRYPTION_KEY`**
  (32 bytes, base64) — adicionar ao `.env.example`, `.env` local e Vercel.
- Formato armazenado: `iv.ciphertext.authTag` (base64url, separados por ponto
  — mesmo estilo do `report-token.ts`).
- `encryptConfig(obj): string` / `decryptConfig(str): obj`. Sem a env var →
  erro claro (`SERVER_MISCONFIGURED`), igual padrão dos outros secrets.

## Envio de mensagem (novo `src/lib/whatsapp-send.ts`)

Função única `sendWhatsAppMessage(to: string, text: string)`:

1. Lê o `WhatsAppProviderConfig` com `active: true` (client base — exceção
   documentada, config de plataforma).
2. Nenhum ativo → `ActionResult` de erro `NO_PROVIDER_ACTIVE` (não lança).
3. Descriptografa credenciais e despacha:
   - **Evolution:** `POST {base_url}/message/sendText/{instance}` com header
     `apikey: {api_key}`, body `{ "number": to, "text": text }`.
   - **Meta:** `POST https://graph.facebook.com/v21.0/{phone_number_id}/messages`
     com `Authorization: Bearer {access_token}`, body padrão
     `{ messaging_product: "whatsapp", to, type: "text", text: { body: text } }`.
4. Retorna `ActionResult<{ provider, message_id? }>` — falha da API externa
   vira `ok: false` com o corpo de erro resumido, nunca exceção não tratada.

## Endpoints

### `GET/PUT /api/platform/whatsapp-config` — guardPlatform({ requireMasterAdmin: true })

- **GET**: lista as duas configs (existentes). Credenciais **mascaradas** —
  devolve só os últimos 4 caracteres de cada campo sensível
  (`"api_key": "•••• abcd"`) + `active`, `updated_at`. Nunca devolve o valor
  íntegro.
- **PUT**: body `{ provider, credentials }` (Zod por provider). Upsert do
  registro com credenciais criptografadas. Não mexe em `active`.

### `POST /api/platform/whatsapp-config/[provider]/activate` — master_admin

Transação: desativa todos, ativa o `provider` da URL. 404 se o provider ainda
não tem config salva. Resposta: estado novo das duas configs (mascarado).

Desativar tudo (nenhum ativo): `POST .../deactivate` **não existe** — YAGNI.
Estado inicial (nenhum registro) já significa "nenhum ativo"; depois de ativar
um, sempre haverá um ativo. Se surgir necessidade real, adiciona-se depois.

### `POST /api/internal/whatsapp/send-message` — requireInternalSecret

Chamado pelo N8N (substitui o node de envio direto Meta/Evolution no
workflow). Body: `{ "to": "+55...", "text": "..." }` (Zod). Chama
`sendWhatsAppMessage`. Erros: `NO_PROVIDER_ACTIVE` → 503;
falha do provider → 502 com `{ error: { code: "PROVIDER_ERROR", message } }`.

`alert-delivery.ts` (M4) **não muda** neste escopo — continua via
`N8N_ALERT_WEBHOOK_URL`. Unificar depois é possível, mas fora do escopo
(YAGNI; o fluxo de alertas ainda nem está ativo sem N8N).

## UI — `/plataforma/configuracoes/whatsapp`

Nova página no route group `(painel)`, seguindo o padrão visual dark do M6:

- Card por provider (Evolution / Meta Cloud API): estado (ativo/configurado/
  não configurado), campos mascarados, botão "Editar" (Sheet client-side,
  mesmo padrão dos formulários do M6), botão "Ativar" (com confirmação).
- Visível/acessível só para `master_admin` — página redireciona `equipe` para
  `/plataforma/tenants` (mesmo padrão da página de KPIs).
- Item novo na sidebar do `(painel)`, seção configurações.

## Permissões

Tudo `master_admin` (rotas com `requireMasterAdmin: true`, página com
redirect) — precedente do M6 (força-status, equipe). `equipe` não vê nem lê.

## Testes (`scripts/m7-whatsapp-config.test.ts`, `npm run test:m7`)

Mesma convenção dos módulos anteriores (actions/lib direto, rotas atrás de
sessão não são invocáveis):

1. `encryptConfig`/`decryptConfig` roundtrip; decrypt com chave errada falha.
2. Upsert de config Evolution → registro criado, `credentials_encrypted` não
   contém o valor em claro.
3. Ativar Evolution → `active: true`; ativar Meta em seguida → Evolution
   `active: false`, Meta `active: true` (invariante de 1 ativo).
4. Ativar provider sem config → falha 404/NOT_FOUND.
5. `sendWhatsAppMessage` sem provider ativo → `NO_PROVIDER_ACTIVE`.
6. `sendWhatsAppMessage` com Evolution ativa apontando para um servidor mock
   local (ou URL inválida) → despacho monta URL/headers certos (mock) ou
   retorna `PROVIDER_ERROR` sem lançar (URL inválida).
7. Rota `send-message` sem `x-internal-secret` → 401 (rota header-gated é
   invocável direto, igual testes M3/M4).

## Documentação a atualizar

- **CLAUDE.md / AGENTS.md**: seção do agente WhatsApp — registrar o desvio
  deliberado ("envio agora é do Tibé via provider configurável; N8N deixa de
  chamar Meta/Evolution direto no envio"), o novo model fora de
  `TENANT_SCOPED_MODELS`, a env var `CONFIG_ENCRYPTION_KEY`.
- **docs/n8n-whatsapp-workflow.md**: Node 6 (e os envios de
  `suggested_reply` dos branches) passam a chamar
  `POST /api/internal/whatsapp/send-message` em vez da Meta Cloud API.
- **/docs/api** (página pública): adicionar os 3 endpoints novos ao array
  `Endpoint[]`.

## Fora do escopo (explícito)

- Deploy da Evolution API / N8N no Railway (infra externa, roteiro separado
  já discutido — passos 1-2 do plano da conversa).
- Webhook de entrada no Tibé (continua no N8N).
- Migrar `alert-delivery.ts` para `sendWhatsAppMessage`.
- Config por tenant (é global de plataforma — 1 número WhatsApp para o
  produto inteiro, modelo atual do PRD).
