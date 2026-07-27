# Conectar Evolution via QR code direto no painel

**Data:** 2026-07-24 · **Status:** aprovado (missão loop-goal, decisões via AskUserQuestion na conversa)

## Contexto e objetivo

Hoje, parear um número na Evolution API exige abrir o Manager da própria
Evolution (`<base_url>/manager`) fora do Tibé. Objetivo: o card Evolution em
`/plataforma/configuracoes/whatsapp` ganha um botão que cria/reusa a
instância e mostra o QR code **dentro do painel do Tibé**, sem precisar abrir
o Manager nunca mais.

## Design

### Novo módulo `src/lib/evolution-client.ts`

Wrapper fino sobre a Evolution API, usando as credenciais já salvas em
`WhatsAppProviderConfig` (descriptografadas via `decryptConfig`). Funções:

- `getInstanceStatus(creds): Promise<{ state: "open" | "connecting" | "close" | "not_found" }>`
  — `GET {base_url}/instance/connectionState/{instance}`, header `apikey`.
  404 do Evolution vira `"not_found"` (instância ainda não existe).
- `createInstance(creds): Promise<{ qrcode_base64: string | null; state: string }>`
  — `POST {base_url}/instance/create`, body
  `{ instanceName: creds.instance, qrcode: true, integration: "WHATSAPP-BAILEYS" }`.
  Resposta inclui `qrcode.base64` quando não conectado ainda.
- `connectInstance(creds): Promise<{ qrcode_base64: string | null; state: string }>`
  — `GET {base_url}/instance/connect/{instance}`. Se já existe e não está
  conectada, devolve novo QR (`response.base64` ou `response.qrcode.base64`
  — testar contra a instância real e usar o campo que vier populado).
  Se já `state: "open"`, `qrcode_base64: null`.

Todas as três chamadas tratam erro de rede/HTTP como
`ActionResult`-like (não lançam) — mesmo padrão de `whatsapp-send.ts`.

### Endpoint `POST /api/platform/whatsapp-config/evolution/connect`

`guardPlatform({ requireMasterAdmin: true })`. Sem body. Fluxo:
1. Busca config `evolution` salva; 404 `NOT_FOUND` se não configurada.
2. `getInstanceStatus` — se `not_found`, chama `createInstance`; senão chama
   `connectInstance`.
3. Devolve `{ state, qrcode_base64 }`.

### Endpoint `GET /api/platform/whatsapp-config/evolution/status`

`guardPlatform({ requireMasterAdmin: true })`. Chama `getInstanceStatus` e
devolve `{ state }` — usado pelo polling do client.

### UI — `whatsapp-provider-card.tsx` (só o card Evolution)

Quando `configured && !active` OU `configured && active` mas
`connectionState !== "open"` (card precisa saber o estado de conexão, não só
"tem credencial salva" — a página server passa isso junto, uma chamada a
`getInstanceStatus` no carregamento da página):

- Botão **"Conectar"** → chama `POST .../evolution/connect`, mostra o
  `qrcode_base64` retornado como `<img src="data:image/png;base64,...">` numa
  área destacada do card.
- Enquanto o QR está visível, poll a cada 3s em
  `GET .../evolution/status` (client-side, `setInterval`, limpo no
  unmount/fechar). Quando `state === "open"`, para o poll, esconde o QR,
  mostra "Conectado ✅" e `router.refresh()`.
- Timeout do poll: 2 minutos sem conectar → para de pollar, mostra "QR
  expirado, tente novamente" com botão pra gerar um novo.

### Página server (`whatsapp/page.tsx`)

Para o provider `evolution` (só esse — Meta não tem esse conceito), chama
`getInstanceStatus` (se configurado) e passa `connectionState` como prop
extra pro card, além do que já passa hoje (`configured`, `active`,
`credentialsMasked`).

## Fora do escopo

- Meta Cloud API não tem fluxo de QR (autenticação é por token da Meta
  Business Manager) — o botão "Conectar" só aparece no card Evolution.
- Desconectar/deslogar a instância pelo painel — fora do escopo, fica pro
  Manager da Evolution se precisar.
