# Conectar Evolution via QR direto no painel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Card Evolution em `/plataforma/configuracoes/whatsapp` cria/reusa a instância e mostra o QR code na própria tela do Tibé, com poll de status até conectar.

**Architecture:** Novo módulo `evolution-client.ts` (wrapper HTTP sobre a Evolution API, credenciais já salvas em `WhatsAppProviderConfig`), 2 rotas novas em `/api/platform/whatsapp-config/evolution/*`, e o card client existente ganha estado de QR + polling.

**Tech Stack:** Next.js 14, `node:fetch` nativo, Tailwind (dark theme já estabelecido).

**Spec:** `docs/superpowers/specs/2026-07-24-evolution-qr-connect-design.md`

## Global Constraints

- Comentários e mensagens de erro em português.
- `WhatsAppProviderConfig` client base é permitido (config de plataforma, exceção já documentada).
- Testes contra Docker local: `DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"`.
- Instância Evolution real de produção já existe (`Atendimento`, `evolution-api-production-7c41.up.railway.app`) — pode ser usada para teste live de verificação, mas **NÃO force reconexão/desconexão de um número já pareado em uso real** — os testes de `connect`/`create` contra ela devem ser só leitura de status (`connectionState`), nunca disparar um novo QR nela.
- Commits: português, footer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (heredoc).
- `npx tsc --noEmit` e `npm run build` limpos ao final.

---

### Task 1: `src/lib/evolution-client.ts`

**Files:**
- Create: `src/lib/evolution-client.ts`
- Create: `scripts/m9-evolution-qr.test.ts`
- Modify: `package.json` (script `test:m9`)

**Interfaces:**
- Consumes: `EvolutionCredentials` (`@/lib/actions/platform-whatsapp-config`).
- Produces:
  - `type EvolutionInstanceState = "open" | "connecting" | "close" | "not_found"`
  - `getInstanceStatus(creds: EvolutionCredentials): Promise<{ state: EvolutionInstanceState }>`
  - `createInstance(creds: EvolutionCredentials): Promise<{ state: string; qrcode_base64: string | null }>`
  - `connectInstance(creds: EvolutionCredentials): Promise<{ state: string; qrcode_base64: string | null }>`
  - Nenhuma das três lança para erro de rede/HTTP — sempre devolve um objeto (erro vira `state: "close"`, log no console, sem exceção). Isso porque quem chama (rotas da Task 2) precisa de resposta sempre, não `try/catch` genérico.

- [ ] **Step 1: Escrever o teste que falha**

Criar `scripts/m9-evolution-qr.test.ts`:

```ts
import "dotenv/config";
import { getInstanceStatus, createInstance, connectInstance } from "@/lib/evolution-client";

/**
 * Testes do cliente Evolution (spec 2026-07-24) — contra credenciais
 * inválidas/inalcançáveis (não bate na Evolution real de produção pra não
 * arriscar desconectar um número em uso).
 * Roda: `npm run test:m9`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

async function main() {
  console.log("🔒 M9 — Evolution client (QR)\n");

  const badCreds = { base_url: "http://127.0.0.1:9", api_key: "x", instance: "inexistente" };

  const status = await getInstanceStatus(badCreds);
  assert(status.state === "close" || status.state === "not_found", "getInstanceStatus com host inalcançável não lança, devolve state degradado");

  const created = await createInstance(badCreds);
  assert(created.qrcode_base64 === null, "createInstance com host inalcançável não lança, qrcode null");

  const connected = await connectInstance(badCreds);
  assert(connected.qrcode_base64 === null, "connectInstance com host inalcançável não lança, qrcode null");

  console.log(failures === 0 ? "\n✅ M9: 0 falhas." : `\n❌ M9: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Em `package.json`, após `test:m8` (ou `test:m7` se `m8` não existir ainda neste ponto — confira a lista atual e adicione ao final):

```json
    "test:m9": "tsx scripts/m9-evolution-qr.test.ts"
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m9
```

Esperado: FALHA — `Cannot find module '@/lib/evolution-client'`.

- [ ] **Step 3: Implementar**

Criar `src/lib/evolution-client.ts`:

```ts
import type { EvolutionCredentials } from "@/lib/actions/platform-whatsapp-config";

/**
 * Wrapper fino sobre a Evolution API (spec 2026-07-24) — usado só pelo fluxo
 * de conexão via QR direto no painel. Nunca lança: erro de rede/HTTP vira
 * um estado degradado (state "close"/"not_found", qrcode null), porque quem
 * chama sempre precisa devolver uma resposta HTTP normal ao client.
 */

export type EvolutionInstanceState = "open" | "connecting" | "close" | "not_found";

function baseUrl(creds: EvolutionCredentials): string {
  return creds.base_url.replace(/\/+$/, "");
}

export async function getInstanceStatus(
  creds: EvolutionCredentials,
): Promise<{ state: EvolutionInstanceState }> {
  try {
    const res = await fetch(`${baseUrl(creds)}/instance/connectionState/${creds.instance}`, {
      headers: { apikey: creds.api_key },
    });
    if (res.status === 404) return { state: "not_found" };
    if (!res.ok) return { state: "close" };
    const json = (await res.json()) as { instance?: { state?: string } };
    const state = json.instance?.state;
    if (state === "open" || state === "connecting") return { state };
    return { state: "close" };
  } catch {
    return { state: "close" };
  }
}

/** Extrai o QR code da resposta da Evolution, tolerando os dois formatos conhecidos. */
function extractQrcode(json: unknown): string | null {
  const j = json as { qrcode?: { base64?: string }; base64?: string };
  return j.qrcode?.base64 ?? j.base64 ?? null;
}

export async function createInstance(
  creds: EvolutionCredentials,
): Promise<{ state: string; qrcode_base64: string | null }> {
  try {
    const res = await fetch(`${baseUrl(creds)}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: creds.api_key },
      body: JSON.stringify({
        instanceName: creds.instance,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });
    if (!res.ok) return { state: "close", qrcode_base64: null };
    const json = await res.json();
    const j = json as { instance?: { state?: string } };
    return { state: j.instance?.state ?? "connecting", qrcode_base64: extractQrcode(json) };
  } catch {
    return { state: "close", qrcode_base64: null };
  }
}

export async function connectInstance(
  creds: EvolutionCredentials,
): Promise<{ state: string; qrcode_base64: string | null }> {
  try {
    const res = await fetch(`${baseUrl(creds)}/instance/connect/${creds.instance}`, {
      headers: { apikey: creds.api_key },
    });
    if (!res.ok) return { state: "close", qrcode_base64: null };
    const json = await res.json();
    const j = json as { instance?: { state?: string } };
    return { state: j.instance?.state ?? "connecting", qrcode_base64: extractQrcode(json) };
  } catch {
    return { state: "close", qrcode_base64: null };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m9
```

Esperado: 3 ✅, `M9: 0 falhas.`

- [ ] **Step 5: Commit**

```bash
git add src/lib/evolution-client.ts scripts/m9-evolution-qr.test.ts package.json
git commit -m "$(cat <<'EOF'
QR Evolution: evolution-client.ts (status/create/connect)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rotas `connect` e `status`

**Files:**
- Create: `src/app/api/platform/whatsapp-config/evolution/connect/route.ts`
- Create: `src/app/api/platform/whatsapp-config/evolution/status/route.ts`

**Interfaces:**
- Consumes: `getInstanceStatus`, `createInstance`, `connectInstance` (Task 1); `guardPlatform` (`@/lib/platform-guard`); `decryptConfig` (`@/lib/crypto-config`); `EvolutionCredentials` (`@/lib/actions/platform-whatsapp-config`).
- Produces: `POST /api/platform/whatsapp-config/evolution/connect` → `{ state, qrcode_base64 }`; `GET /api/platform/whatsapp-config/evolution/status` → `{ state }`.

- [ ] **Step 1: Rota connect**

Criar `src/app/api/platform/whatsapp-config/evolution/connect/route.ts`:

```ts
import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { prisma } from "@/lib/prisma";
import { decryptConfig } from "@/lib/crypto-config";
import type { EvolutionCredentials } from "@/lib/actions/platform-whatsapp-config";
import { getInstanceStatus, createInstance, connectInstance } from "@/lib/evolution-client";

/**
 * POST /api/platform/whatsapp-config/evolution/connect (spec 2026-07-24) —
 * só master_admin. Cria a instância na Evolution se ainda não existir, ou
 * pede um QR novo se existir mas não estiver conectada.
 */
export async function POST() {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const config = await prisma.whatsAppProviderConfig.findUnique({ where: { provider: "evolution" } });
  if (!config) {
    return apiError("NOT_FOUND", "Configure as credenciais da Evolution antes de conectar", 404);
  }
  const creds = decryptConfig<EvolutionCredentials>(config.credentials_encrypted);

  const current = await getInstanceStatus(creds);
  const result =
    current.state === "not_found" ? await createInstance(creds) : await connectInstance(creds);

  return apiOk(result);
}
```

- [ ] **Step 2: Rota status**

Criar `src/app/api/platform/whatsapp-config/evolution/status/route.ts`:

```ts
import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { prisma } from "@/lib/prisma";
import { decryptConfig } from "@/lib/crypto-config";
import type { EvolutionCredentials } from "@/lib/actions/platform-whatsapp-config";
import { getInstanceStatus } from "@/lib/evolution-client";

/** GET /api/platform/whatsapp-config/evolution/status — usado pelo polling do card. */
export async function GET() {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const config = await prisma.whatsAppProviderConfig.findUnique({ where: { provider: "evolution" } });
  if (!config) return apiError("NOT_FOUND", "Evolution não configurada", 404);

  const creds = decryptConfig<EvolutionCredentials>(config.credentials_encrypted);
  const result = await getInstanceStatus(creds);
  return apiOk(result);
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/platform/whatsapp-config/evolution
git commit -m "$(cat <<'EOF'
QR Evolution: rotas connect (cria/reusa instância) e status (polling)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: UI do card — QR + polling

**Files:**
- Modify: `src/components/platform/whatsapp-provider-card.tsx`
- Modify: `src/app/plataforma/(painel)/configuracoes/whatsapp/page.tsx`

**Interfaces:**
- Consumes: `getInstanceStatus` (Task 1, chamado só na página server, não no client), `apiPost`/`apiGet` de `@/lib/client-api` (**confira se `apiGet` existe** — se não, adicione espelhando `apiPost`, só GET sem body).
- Produces: nenhuma nova interface consumida por outras tasks.

- [ ] **Step 1: Página server passa `connectionState` pro card Evolution**

Editar `src/app/plataforma/(painel)/configuracoes/whatsapp/page.tsx` — importar
`getInstanceStatus` e `decryptConfig`/`EvolutionCredentials`, e dentro do
`.map`, quando `p === "evolution" && config`, calcular o estado:

```tsx
import { getInstanceStatus } from "@/lib/evolution-client";
import type { EvolutionCredentials } from "@/lib/actions/platform-whatsapp-config";
```

Dentro do map (trocar o `return` existente por uma função async — a página
já é `async`, então dá pra fazer `await Promise.all` antes do JSX em vez de
`.map` async; reescrever o corpo da função assim):

```tsx
  const providers = ["evolution", "meta_cloud_api"] as const;

  const cards = await Promise.all(
    providers.map(async (p) => {
      const config = byProvider.get(p);
      let connectionState: "open" | "connecting" | "close" | "not_found" | null = null;
      if (p === "evolution" && config) {
        const creds = decryptConfig<EvolutionCredentials>(config.credentials_encrypted);
        connectionState = (await getInstanceStatus(creds)).state;
      }
      return {
        provider: p,
        configured: !!config,
        active: config?.active ?? false,
        credentialsMasked: config
          ? maskCredentials(decryptConfig<Record<string, string>>(config.credentials_encrypted))
          : null,
        connectionState,
      };
    }),
  );
```

E no JSX, trocar `{providers.map((p) => { ... })}` por:

```tsx
      {cards.map((c) => (
        <WhatsAppProviderCard key={c.provider} {...c} />
      ))}
```

- [ ] **Step 2: Confirmar/adicionar `apiGet` em `src/lib/client-api.ts`**

Ler o arquivo. Se `apiGet` não existir, adicionar espelhando `apiPost` (mesmo
tipo de retorno `ApiResult<T>`), só GET sem body.

- [ ] **Step 3: Atualizar o card client**

Editar `src/components/platform/whatsapp-provider-card.tsx`:

1. Prop nova: `connectionState: "open" | "connecting" | "close" | "not_found" | null` (só relevante quando `provider === "evolution"`).
2. Estado novo: `const [qrcode, setQrcode] = useState<string | null>(null);` e `const [polling, setPolling] = useState(false);`.
3. Função `connect()`:

```tsx
  async function connect() {
    setLoading(true);
    setError(null);
    const res = await apiPost<{ state: string; qrcode_base64: string | null }>(
      "/api/platform/whatsapp-config/evolution/connect",
      {},
    );
    setLoading(false);
    if (!res.ok) return setError(res.message);
    if (res.data.qrcode_base64) {
      setQrcode(res.data.qrcode_base64);
      startPolling();
    } else if (res.data.state === "open") {
      router.refresh();
    }
  }

  function startPolling() {
    setPolling(true);
    let elapsed = 0;
    const interval = setInterval(async () => {
      elapsed += 3000;
      const res = await apiGet<{ state: string }>("/api/platform/whatsapp-config/evolution/status");
      if (res.ok && res.data.state === "open") {
        clearInterval(interval);
        setPolling(false);
        setQrcode(null);
        router.refresh();
        return;
      }
      if (elapsed >= 120000) {
        clearInterval(interval);
        setPolling(false);
        setError("QR expirado. Tente conectar novamente.");
      }
    }, 3000);
  }
```

4. Import `apiGet` junto de `apiPost`/`apiPut` no topo do arquivo.
5. No JSX, dentro do card, quando `provider === "evolution" && configured && connectionState !== "open"`, mostrar um botão **"Conectar"** (mesmo estilo do botão "Ativar") que chama `connect()`. Quando `qrcode` estiver setado, mostrar:

```tsx
          {qrcode && (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-md border border-gray-700 bg-gray-950 p-4">
              <img src={qrcode} alt="QR code para conectar o WhatsApp" className="h-56 w-56" />
              <p className="text-xs text-gray-400">
                {polling ? "Escaneie no WhatsApp — aguardando conexão..." : "QR expirado."}
              </p>
            </div>
          )}
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/plataforma/(painel)/configuracoes/whatsapp/page.tsx" src/components/platform/whatsapp-provider-card.tsx src/lib/client-api.ts
git commit -m "$(cat <<'EOF'
QR Evolution: card mostra QR code e faz poll até conectar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Verificação (dev server, build, live status check)

**Files:** nenhum novo.

- [ ] **Step 1: Regressão + build**

```powershell
docker start tibe-pg
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"
npm run test:m9
npm run build
```

- [ ] **Step 2: Confirmar a rota `status` funciona contra a Evolution real (só leitura)**

Isso valida o parsing de resposta real da Evolution sem arriscar nada — só
lê o estado da instância já conectada `Atendimento`, não chama `connect`
nem `create` nela.

```bash
DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public" npx tsx -e "
import { getInstanceStatus } from './src/lib/evolution-client';
getInstanceStatus({ base_url: 'https://evolution-api-production-7c41.up.railway.app', api_key: 'PEDIR_AO_USUARIO_SE_NAO_TIVER', instance: 'Atendimento' }).then(r => console.log(r));
"
```

Se a API key não estiver disponível no ambiente do agente, pule este passo
e registre como "não verificado — precisa da API key da Evolution" no
relatório da task; não é bloqueante (Task 1 já cobre o client com testes
próprios).

Nenhum commit nesta task (só verificação).
