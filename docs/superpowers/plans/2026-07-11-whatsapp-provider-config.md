# WhatsApp Provider Config (Evolution/Meta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Painel `/plataforma` configura e ativa o provider de envio WhatsApp (Evolution API ou Meta Cloud API); N8N passa a chamar um único endpoint interno do Tibé para enviar mensagens.

**Architecture:** Novo model `WhatsAppProviderConfig` (global de plataforma, fora de `TENANT_SCOPED_MODELS`) guarda credenciais criptografadas (AES-256-GCM) dos dois providers em paralelo, com no máximo 1 ativo (transação + partial unique index). `sendWhatsAppMessage()` lê o ativo e despacha para a API certa. 3 endpoints novos (2 de plataforma master_admin, 1 interno header-gated) + página de config no painel.

**Tech Stack:** Next.js 14 App Router, Prisma 7 (`@prisma/adapter-pg`), Zod, `node:crypto` (AES-256-GCM), teste via script `tsx` (convenção do projeto, sem framework).

**Spec:** `docs/superpowers/specs/2026-07-11-whatsapp-provider-config-design.md`

## Global Constraints

- **Idioma:** comentários de código e mensagens de erro em português (convenção do projeto).
- **Testes rodam contra Docker local**, nunca Neon: prefixe todo comando de teste com `DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"`. Se o container não estiver de pé: `docker start tibe-pg`.
- **Migração**: fluxo Prisma 7 do projeto — gerar SQL com `migrate diff`, salvar manualmente em `prisma/migrations/<timestamp>_nome/migration.sql`, aplicar com `npm run db:deploy`. NUNCA `prisma migrate dev`.
- **Model novo NÃO entra** em `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts`) — é config de plataforma.
- **Client Prisma base** (`prisma`) é permitido nos arquivos novos deste plano (config de plataforma, mesma categoria de `PlatformUser`) — registrar a exceção no CLAUDE.md (Task 7).
- **Contrato de API**: sucesso `{ data, meta }`, erro `{ error: { code, message } }` — helpers `apiOk`/`apiError` de `src/lib/api.ts`.
- **Actions** retornam `ActionResult<T>` (`src/lib/actions/types.ts`: `ok()`/`fail()`), nunca lançam para fluxo esperado.
- **Commits**: mensagem em português, footer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (heredoc).
- **`npx tsc --noEmit` não pega erro de lint JSX** — a Task 8 roda `npm run build` obrigatoriamente.

---

### Task 1: Schema, migração e chave de criptografia

**Files:**
- Modify: `prisma/schema.prisma` (enum + model no final do arquivo)
- Create: `prisma/migrations/20260711120000_whatsapp_provider_config/migration.sql`
- Modify: `.env.example` (+1 var), `.env` (+1 var, valor dev)

**Interfaces:**
- Produces: model Prisma `whatsAppProviderConfig` (client: `prisma.whatsAppProviderConfig`), enum TS `WhatsAppProvider` (`"evolution" | "meta_cloud_api"`, importável de `@/generated/prisma/enums`), env var `CONFIG_ENCRYPTION_KEY`.

- [ ] **Step 1: Adicionar enum e model ao schema**

No final de `prisma/schema.prisma`, após o model `SubscriptionStatusLog`:

```prisma
// ─────────────────────────────────────────────────────────────
// Config de provider WhatsApp (spec 2026-07-11) — GLOBAL da plataforma,
// fora de TENANT_SCOPED_MODELS (mesma categoria de PlatformUser). Os dois
// providers podem existir configurados em paralelo; no máximo 1 active
// (garantido por transação na ativação + partial unique index na migração).
// credentials_encrypted = JSON criptografado com AES-256-GCM
// (src/lib/crypto-config.ts, chave em CONFIG_ENCRYPTION_KEY).
// ─────────────────────────────────────────────────────────────

enum WhatsAppProvider {
  evolution
  meta_cloud_api
}

model WhatsAppProviderConfig {
  id                    String           @id @default(cuid())
  provider              WhatsAppProvider @unique
  active                Boolean          @default(false)
  credentials_encrypted String
  updated_at            DateTime         @updatedAt
  created_at            DateTime         @default(now())
}
```

- [ ] **Step 2: Gerar client e conferir o diff da migração**

```powershell
npx prisma generate
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Esperado: SQL com `CREATE TYPE "WhatsAppProvider"` e `CREATE TABLE "WhatsAppProviderConfig"`.

- [ ] **Step 3: Salvar a migração manualmente**

Criar `prisma/migrations/20260711120000_whatsapp_provider_config/migration.sql`:

```sql
-- Config de provider WhatsApp (Evolution/Meta) — global da plataforma.
CREATE TYPE "WhatsAppProvider" AS ENUM ('evolution', 'meta_cloud_api');

CREATE TABLE "WhatsAppProviderConfig" (
    "id" TEXT NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "credentials_encrypted" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppProviderConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppProviderConfig_provider_key" ON "WhatsAppProviderConfig"("provider");

-- Defesa extra além da transação de ativação: no máximo 1 linha com active=true.
CREATE UNIQUE INDEX "WhatsAppProviderConfig_one_active" ON "WhatsAppProviderConfig"("active") WHERE "active";
```

- [ ] **Step 4: Aplicar no Docker local**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run db:deploy
```

Esperado: `Applying migration 20260711120000_whatsapp_provider_config` … `All migrations have been successfully applied.`

- [ ] **Step 5: Env var nova**

Em `.env.example`, junto dos outros secrets:

```
# Chave AES-256-GCM (32 bytes, base64) para criptografar credenciais de
# provider WhatsApp no banco. Gere com:
# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CONFIG_ENCRYPTION_KEY=
```

Em `.env` (local, gitignored), gerar valor real:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

e adicionar `CONFIG_ENCRYPTION_KEY="<valor gerado>"`.

- [ ] **Step 6: Typecheck e commit**

```bash
npx tsc --noEmit
git add prisma/schema.prisma prisma/migrations/20260711120000_whatsapp_provider_config/migration.sql .env.example
git commit -m "$(cat <<'EOF'
Schema: WhatsAppProviderConfig (config de provider WhatsApp da plataforma)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `crypto-config.ts` (AES-256-GCM)

**Files:**
- Create: `src/lib/crypto-config.ts`
- Create: `scripts/m7-whatsapp-config.test.ts` (início do script; cresce nas tasks seguintes)
- Modify: `package.json` (script `test:m7`)

**Interfaces:**
- Consumes: env `CONFIG_ENCRYPTION_KEY` (Task 1).
- Produces: `encryptConfig(obj: unknown): string`, `decryptConfig<T = unknown>(encrypted: string): T` — formato `iv.ciphertext.authTag` em base64url. Ambas lançam `Error` se a env var faltar/for inválida ou o payload estiver corrompido (config é pré-requisito de servidor, não fluxo de usuário — exceção é o comportamento certo aqui; quem converte para `ActionResult` é a camada de cima).

- [ ] **Step 1: Escrever o teste que falha**

Criar `scripts/m7-whatsapp-config.test.ts`:

```ts
import "dotenv/config";
import { encryptConfig, decryptConfig } from "@/lib/crypto-config";

/**
 * Testes do provider WhatsApp configurável (spec 2026-07-11): criptografia,
 * upsert/ativação de config, despacho de envio.
 * Roda: `npm run test:m7` (DATABASE_URL do Docker local).
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
  console.log("🔒 M7 — Provider WhatsApp configurável\n");

  // ── crypto-config ────────────────────────────────────────────
  const original = { base_url: "https://evo.example.com", api_key: "chave-secreta-123", instance: "tibe" };
  const encrypted = encryptConfig(original);
  assert(typeof encrypted === "string" && encrypted.split(".").length === 3, "encryptConfig devolve formato iv.ciphertext.authTag");
  assert(!encrypted.includes("chave-secreta-123"), "ciphertext não contém o valor em claro");

  const roundtrip = decryptConfig<typeof original>(encrypted);
  assert(roundtrip.api_key === original.api_key && roundtrip.instance === original.instance, "roundtrip encrypt→decrypt preserva o objeto");

  let tamperFailed = false;
  try {
    const [iv, ct, tag] = encrypted.split(".");
    decryptConfig(`${iv}.${ct.slice(0, -2)}xx.${tag}`);
  } catch {
    tamperFailed = true;
  }
  assert(tamperFailed, "payload adulterado é rejeitado (GCM auth tag)");

  console.log(failures === 0 ? "\n✅ M7: 0 falhas." : `\n❌ M7: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Em `package.json`, depois de `test:m6`:

```json
    "test:m7": "tsx scripts/m7-whatsapp-config.test.ts"
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m7
```

Esperado: FALHA — `Cannot find module '@/lib/crypto-config'`.

- [ ] **Step 3: Implementar**

Criar `src/lib/crypto-config.ts`:

```ts
import crypto from "node:crypto";

/**
 * Criptografia em repouso das credenciais de provider WhatsApp
 * (WhatsAppProviderConfig.credentials_encrypted). AES-256-GCM com chave em
 * CONFIG_ENCRYPTION_KEY (32 bytes, base64). Formato armazenado:
 * `iv.ciphertext.authTag` (base64url — mesmo estilo do report-token.ts).
 *
 * Lança Error quando a chave falta/é inválida ou o payload está corrompido —
 * isso é misconfiguração de servidor, não fluxo de usuário; a camada de cima
 * (action/rota) converte para o erro HTTP adequado.
 */

function getKey(): Buffer {
  const b64 = process.env.CONFIG_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      "CONFIG_ENCRYPTION_KEY não configurada — necessária para criptografar credenciais de provider (veja .env.example).",
    );
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("CONFIG_ENCRYPTION_KEY inválida — precisa ter exatamente 32 bytes em base64.");
  }
  return key;
}

export function encryptConfig(obj: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(obj), "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptConfig<T = unknown>(encrypted: string): T {
  const [ivB64, ctB64, tagB64] = encrypted.split(".");
  if (!ivB64 || !ctB64 || !tagB64) {
    throw new Error("Credencial criptografada em formato inválido.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf-8")) as T;
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m7
```

Esperado: 4 ✅, `M7: 0 falhas.`

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto-config.ts scripts/m7-whatsapp-config.test.ts package.json
git commit -m "$(cat <<'EOF'
M7: crypto-config (AES-256-GCM) para credenciais de provider WhatsApp

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Actions de config (upsert, ativação, máscara)

**Files:**
- Create: `src/lib/actions/platform-whatsapp-config.ts`
- Modify: `scripts/m7-whatsapp-config.test.ts` (novos asserts)

**Interfaces:**
- Consumes: `encryptConfig` (Task 2), `prisma.whatsAppProviderConfig` (Task 1), `ok`/`fail`/`ActionResult` de `@/lib/actions/types`.
- Produces:
  - `type EvolutionCredentials = { base_url: string; api_key: string; instance: string }`
  - `type MetaCredentials = { access_token: string; phone_number_id: string }`
  - `upsertProviderConfigAction(params: { provider: WhatsAppProvider; credentials: EvolutionCredentials | MetaCredentials }): Promise<ActionResult<{ provider: WhatsAppProvider }>>`
  - `activateProviderAction(provider: WhatsAppProvider): Promise<ActionResult<{ provider: WhatsAppProvider }>>` — `fail("NOT_FOUND", …, 404)` se não configurado
  - `maskCredentials(credentials: Record<string, string>): Record<string, string>` — cada valor vira `"•••• " + últimos 4 chars` (valor com ≤4 chars vira só `"••••"`)

- [ ] **Step 1: Adicionar asserts que falham**

Em `scripts/m7-whatsapp-config.test.ts`, adicionar aos imports:

```ts
import { prisma } from "@/lib/prisma";
import {
  upsertProviderConfigAction,
  activateProviderAction,
  maskCredentials,
} from "@/lib/actions/platform-whatsapp-config";
```

Dentro de `main()`, após o bloco crypto-config (limpeza antes e depois para o teste ser re-rodável):

```ts
  // ── actions de config ────────────────────────────────────────
  await prisma.whatsAppProviderConfig.deleteMany({});

  const up1 = await upsertProviderConfigAction({
    provider: "evolution",
    credentials: { base_url: "https://evo.example.com", api_key: "evo-key-9876", instance: "tibe" },
  });
  assert(up1.ok, "upsert de config Evolution funciona");

  const row = await prisma.whatsAppProviderConfig.findUnique({ where: { provider: "evolution" } });
  assert(!!row && !row.credentials_encrypted.includes("evo-key-9876"), "credencial no banco não está em claro");
  assert(!!row && row.active === false, "config recém-criada nasce inativa");

  const actMissing = await activateProviderAction("meta_cloud_api");
  assert(!actMissing.ok && actMissing.status === 404, "ativar provider sem config é rejeitado (404)");

  const act1 = await activateProviderAction("evolution");
  assert(act1.ok, "ativar Evolution funciona");

  await upsertProviderConfigAction({
    provider: "meta_cloud_api",
    credentials: { access_token: "meta-token-4321", phone_number_id: "5511999" },
  });
  await activateProviderAction("meta_cloud_api");

  const all = await prisma.whatsAppProviderConfig.findMany({ orderBy: { provider: "asc" } });
  const evo = all.find((c) => c.provider === "evolution");
  const meta = all.find((c) => c.provider === "meta_cloud_api");
  assert(!!evo && evo.active === false, "ativar Meta desativa Evolution (invariante de 1 ativo)");
  assert(!!meta && meta.active === true, "Meta fica ativa");

  const masked = maskCredentials({ api_key: "evo-key-9876", pin: "12" });
  assert(masked.api_key === "•••• 9876", "maskCredentials preserva só os últimos 4");
  assert(masked.pin === "••••", "valor curto é totalmente mascarado");
```

E antes do `console.log` final:

```ts
  await prisma.whatsAppProviderConfig.deleteMany({});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m7
```

Esperado: FALHA — `Cannot find module '@/lib/actions/platform-whatsapp-config'`.

- [ ] **Step 3: Implementar**

Criar `src/lib/actions/platform-whatsapp-config.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { encryptConfig } from "@/lib/crypto-config";
import type { WhatsAppProvider } from "@/generated/prisma/enums";

/**
 * Config de provider WhatsApp (spec 2026-07-11) — ações do painel da
 * plataforma, só master_admin (recorte aplicado nas rotas via guardPlatform).
 * Usa o client base: config GLOBAL de plataforma, não pertence a tenant
 * (mesma categoria de PlatformUser — exceção documentada no CLAUDE.md).
 */

export type EvolutionCredentials = { base_url: string; api_key: string; instance: string };
export type MetaCredentials = { access_token: string; phone_number_id: string };

export async function upsertProviderConfigAction(params: {
  provider: WhatsAppProvider;
  credentials: EvolutionCredentials | MetaCredentials;
}): Promise<ActionResult<{ provider: WhatsAppProvider }>> {
  const credentials_encrypted = encryptConfig(params.credentials);
  await prisma.whatsAppProviderConfig.upsert({
    where: { provider: params.provider },
    update: { credentials_encrypted },
    create: { provider: params.provider, credentials_encrypted },
  });
  return ok({ provider: params.provider });
}

export async function activateProviderAction(
  provider: WhatsAppProvider,
): Promise<ActionResult<{ provider: WhatsAppProvider }>> {
  const config = await prisma.whatsAppProviderConfig.findUnique({ where: { provider } });
  if (!config) {
    return fail("NOT_FOUND", "Configure as credenciais deste provider antes de ativá-lo", 404);
  }
  // Invariante "no máximo 1 ativo": desativa todos e ativa o alvo na mesma
  // transação (o partial unique index da migração é só defesa extra).
  await prisma.$transaction([
    prisma.whatsAppProviderConfig.updateMany({ data: { active: false } }),
    prisma.whatsAppProviderConfig.update({ where: { provider }, data: { active: true } }),
  ]);
  return ok({ provider });
}

/** Máscara para exibição: nunca devolver credencial íntegra ao client. */
export function maskCredentials(credentials: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(credentials).map(([k, v]) => [k, v.length > 4 ? `•••• ${v.slice(-4)}` : "••••"]),
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m7
```

Esperado: todos ✅ (crypto + config), `M7: 0 falhas.`

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/platform-whatsapp-config.ts scripts/m7-whatsapp-config.test.ts
git commit -m "$(cat <<'EOF'
M7: actions de config de provider (upsert, ativação transacional, máscara)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `whatsapp-send.ts` (despacho Evolution/Meta)

**Files:**
- Create: `src/lib/whatsapp-send.ts`
- Modify: `scripts/m7-whatsapp-config.test.ts`

**Interfaces:**
- Consumes: `decryptConfig` (Task 2), tipos de credencial (Task 3), `prisma.whatsAppProviderConfig`.
- Produces: `sendWhatsAppMessage(to: string, text: string): Promise<ActionResult<{ provider: string; message_id: string | null }>>` — `fail("NO_PROVIDER_ACTIVE", …, 503)` sem ativo; `fail("PROVIDER_ERROR", …, 502)` em falha HTTP/rede do provider (nunca lança).

- [ ] **Step 1: Adicionar asserts que falham**

Import novo no teste:

```ts
import { sendWhatsAppMessage } from "@/lib/whatsapp-send";
```

No fim de `main()` (antes da limpeza final), o banco está com os dois configs da Task 3 (Meta ativa). Adicionar:

```ts
  // ── whatsapp-send ────────────────────────────────────────────
  await prisma.whatsAppProviderConfig.deleteMany({});

  const noProvider = await sendWhatsAppMessage("+5511999990000", "olá");
  assert(!noProvider.ok && noProvider.code === "NO_PROVIDER_ACTIVE", "envio sem provider ativo devolve NO_PROVIDER_ACTIVE");

  // Evolution apontando para porta fechada: precisa devolver PROVIDER_ERROR
  // sem lançar exceção (o fetch falha na conexão).
  await upsertProviderConfigAction({
    provider: "evolution",
    credentials: { base_url: "http://127.0.0.1:9", api_key: "x", instance: "t" },
  });
  await activateProviderAction("evolution");
  const unreachable = await sendWhatsAppMessage("+5511999990000", "olá");
  assert(!unreachable.ok && unreachable.code === "PROVIDER_ERROR", "provider inalcançável vira PROVIDER_ERROR, sem exceção");
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m7
```

Esperado: FALHA — `Cannot find module '@/lib/whatsapp-send'`.

- [ ] **Step 3: Implementar**

Criar `src/lib/whatsapp-send.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decryptConfig } from "@/lib/crypto-config";
import type { EvolutionCredentials, MetaCredentials } from "@/lib/actions/platform-whatsapp-config";

/**
 * Envio de mensagem WhatsApp pelo provider ATIVO (spec 2026-07-11).
 * Desvio deliberado da regra "N8N é o único intermediário" (CLAUDE.md): o
 * envio agora é do Tibé — o N8N chama POST /api/internal/whatsapp/send-message
 * e este módulo decide se entrega via Evolution ou Meta, pela config do
 * painel da plataforma. O RECEBIMENTO continua no N8N (payloads de entrada
 * diferem por provider; não existe /api/webhooks/whatsapp no Tibé).
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string,
): Promise<ActionResult<{ provider: string; message_id: string | null }>> {
  const config = await prisma.whatsAppProviderConfig.findFirst({ where: { active: true } });
  if (!config) {
    return fail(
      "NO_PROVIDER_ACTIVE",
      "Nenhum provider de WhatsApp ativo — configure em /plataforma/configuracoes/whatsapp",
      503,
    );
  }

  try {
    if (config.provider === "evolution") {
      const creds = decryptConfig<EvolutionCredentials>(config.credentials_encrypted);
      const res = await fetch(
        `${creds.base_url.replace(/\/+$/, "")}/message/sendText/${creds.instance}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: creds.api_key },
          body: JSON.stringify({ number: to, text }),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return fail("PROVIDER_ERROR", `Evolution respondeu ${res.status}: ${body.slice(0, 300)}`, 502);
      }
      const json = (await res.json().catch(() => ({}))) as { key?: { id?: string } };
      return ok({ provider: "evolution", message_id: json.key?.id ?? null });
    }

    // meta_cloud_api
    const creds = decryptConfig<MetaCredentials>(config.credentials_encrypted);
    const res = await fetch(`https://graph.facebook.com/v21.0/${creds.phone_number_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.access_token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return fail("PROVIDER_ERROR", `Meta respondeu ${res.status}: ${body.slice(0, 300)}`, 502);
    }
    const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[] };
    return ok({ provider: "meta_cloud_api", message_id: json.messages?.[0]?.id ?? null });
  } catch (e) {
    return fail("PROVIDER_ERROR", e instanceof Error ? e.message : "Falha ao contactar o provider", 502);
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m7
```

Esperado: todos ✅, `M7: 0 falhas.`

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp-send.ts scripts/m7-whatsapp-config.test.ts
git commit -m "$(cat <<'EOF'
M7: sendWhatsAppMessage — despacho pelo provider ativo (Evolution/Meta)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Rotas HTTP (config, activate, send-message)

**Files:**
- Create: `src/app/api/platform/whatsapp-config/route.ts`
- Create: `src/app/api/platform/whatsapp-config/[provider]/activate/route.ts`
- Create: `src/app/api/internal/whatsapp/send-message/route.ts`
- Modify: `scripts/m7-whatsapp-config.test.ts` (teste da rota interna — header-gated é invocável direto, convenção M3/M4; rotas de plataforma ficam atrás de sessão e são cobertas pelas actions já testadas + `tsc`)

**Interfaces:**
- Consumes: `guardPlatform` (`@/lib/platform-guard`), `requireInternalSecret` (`@/lib/internal-guard`), actions das Tasks 3-4, `apiOk`/`apiError` (`@/lib/api`), `decryptConfig`/`maskCredentials`.
- Produces: endpoints `GET/PUT /api/platform/whatsapp-config`, `POST /api/platform/whatsapp-config/[provider]/activate`, `POST /api/internal/whatsapp/send-message` (contratos abaixo).

- [ ] **Step 1: Rota de config (GET mascarado / PUT upsert)**

Criar `src/app/api/platform/whatsapp-config/route.ts`:

```ts
import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { prisma } from "@/lib/prisma";
import { decryptConfig } from "@/lib/crypto-config";
import {
  upsertProviderConfigAction,
  maskCredentials,
} from "@/lib/actions/platform-whatsapp-config";

/**
 * GET/PUT /api/platform/whatsapp-config (spec 2026-07-11) — só master_admin.
 * GET devolve credenciais SEMPRE mascaradas (últimos 4 chars); o valor
 * íntegro nunca sai do servidor.
 */

const putSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("evolution"),
    credentials: z.object({
      base_url: z.string().trim().url(),
      api_key: z.string().trim().min(1),
      instance: z.string().trim().min(1),
    }),
  }),
  z.object({
    provider: z.literal("meta_cloud_api"),
    credentials: z.object({
      access_token: z.string().trim().min(1),
      phone_number_id: z.string().trim().min(1),
    }),
  }),
]);

export async function GET() {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const configs = await prisma.whatsAppProviderConfig.findMany({ orderBy: { provider: "asc" } });
  return apiOk(
    configs.map((c) => ({
      provider: c.provider,
      active: c.active,
      credentials_masked: maskCredentials(decryptConfig<Record<string, string>>(c.credentials_encrypted)),
      updated_at: c.updated_at.toISOString(),
    })),
  );
}

export async function PUT(request: Request) {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const json = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await upsertProviderConfigAction(parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
```

- [ ] **Step 2: Rota de ativação**

Criar `src/app/api/platform/whatsapp-config/[provider]/activate/route.ts`:

```ts
import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { activateProviderAction } from "@/lib/actions/platform-whatsapp-config";

/** POST /api/platform/whatsapp-config/:provider/activate — só master_admin. */

const providerSchema = z.enum(["evolution", "meta_cloud_api"]);

export async function POST(
  _request: Request,
  { params }: { params: { provider: string } },
) {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const parsed = providerSchema.safeParse(params.provider);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "provider deve ser 'evolution' ou 'meta_cloud_api'", 422);
  }

  const result = await activateProviderAction(parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
```

- [ ] **Step 3: Rota interna de envio**

Criar `src/app/api/internal/whatsapp/send-message/route.ts`:

```ts
import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { requireInternalSecret } from "@/lib/internal-guard";
import { sendWhatsAppMessage } from "@/lib/whatsapp-send";

/**
 * POST /api/internal/whatsapp/send-message (spec 2026-07-11) — chamado pelo
 * N8N no lugar de falar direto com Meta/Evolution. O Tibé decide o provider
 * pela config do painel (troca 1-clique, sem mexer no N8N).
 */

const schema = z.object({
  to: z.string().trim().min(8),
  text: z.string().min(1),
});

export async function POST(request: Request) {
  const auth = requireInternalSecret(request);
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await sendWhatsAppMessage(parsed.data.to, parsed.data.text);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
```

- [ ] **Step 4: Teste da rota interna (invocável direto)**

No teste, import:

```ts
import { POST as sendMessageRoute } from "@/app/api/internal/whatsapp/send-message/route";
```

Após o bloco whatsapp-send (o Evolution "porta fechada" ainda está ativo), adicionar:

```ts
  // ── rota interna send-message ────────────────────────────────
  process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "test-secret";

  const noAuth = await sendMessageRoute(
    new Request("http://test/api/internal/whatsapp/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "+5511999990000", text: "oi" }),
    }),
  );
  assert(noAuth.status === 401, "send-message sem x-internal-secret devolve 401");

  const badBody = await sendMessageRoute(
    new Request("http://test/api/internal/whatsapp/send-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET!,
      },
      body: JSON.stringify({ to: "+5511999990000" }),
    }),
  );
  assert(badBody.status === 422, "send-message sem text devolve 422");

  const provErr = await sendMessageRoute(
    new Request("http://test/api/internal/whatsapp/send-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET!,
      },
      body: JSON.stringify({ to: "+5511999990000", text: "oi" }),
    }),
  );
  assert(provErr.status === 502, "falha do provider vira 502 PROVIDER_ERROR na rota");
```

- [ ] **Step 5: Rodar teste completo + typecheck**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m7
npx tsc --noEmit
```

Esperado: todos ✅ e typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/platform/whatsapp-config src/app/api/internal/whatsapp/send-message scripts/m7-whatsapp-config.test.ts
git commit -m "$(cat <<'EOF'
M7: rotas de config de provider (plataforma) e send-message (interna)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: UI — página `/plataforma/configuracoes/whatsapp`

**Files:**
- Create: `src/app/plataforma/(painel)/configuracoes/whatsapp/page.tsx`
- Create: `src/components/platform/whatsapp-provider-card.tsx`
- Modify: `src/app/plataforma/(painel)/layout.tsx` (link na sidebar)

**Interfaces:**
- Consumes: `getPlatformSessionUser`/`isMasterAdmin` (`@/lib/platform-context`), `prisma`, `decryptConfig`, `maskCredentials`, `apiPut`/`apiPost` de `@/lib/client-api` (conferir se `apiPut` existe em `src/lib/client-api.ts`; se não existir, adicionar lá seguindo o padrão exato de `apiPost` — mesmo shape de retorno).
- Produces: página server + card client. Sem contrato para tasks seguintes.

- [ ] **Step 1: Componente client do card**

Criar `src/components/platform/whatsapp-provider-card.tsx` (padrão visual/estado de `invite-team-form.tsx` — inline expand, sem Sheet):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPut } from "@/lib/client-api";

type Provider = "evolution" | "meta_cloud_api";

const PROVIDER_LABEL: Record<Provider, string> = {
  evolution: "Evolution API (não-oficial)",
  meta_cloud_api: "Meta Cloud API (oficial)",
};

const FIELDS: Record<Provider, { key: string; label: string; type?: string }[]> = {
  evolution: [
    { key: "base_url", label: "URL base (ex: https://evo.up.railway.app)" },
    { key: "api_key", label: "API key", type: "password" },
    { key: "instance", label: "Nome da instância" },
  ],
  meta_cloud_api: [
    { key: "access_token", label: "Access token", type: "password" },
    { key: "phone_number_id", label: "Phone Number ID" },
  ],
};

/** Card de config de um provider WhatsApp (spec 2026-07-11) — só master_admin. */
export default function WhatsAppProviderCard({
  provider,
  configured,
  active,
  credentialsMasked,
}: {
  provider: Provider;
  configured: boolean;
  active: boolean;
  credentialsMasked: Record<string, string> | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const missing = FIELDS[provider].some((f) => !values[f.key]?.trim());
    if (missing) return setError("Preencha todos os campos.");
    setLoading(true);
    setError(null);
    const res = await apiPut<{ provider: string }>("/api/platform/whatsapp-config", {
      provider,
      credentials: values,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setEditing(false);
    setValues({});
    router.refresh();
  }

  async function activate() {
    if (!window.confirm(`Ativar ${PROVIDER_LABEL[provider]} como provider de envio?`)) return;
    setLoading(true);
    setError(null);
    const res = await apiPost<{ provider: string }>(
      `/api/platform/whatsapp-config/${provider}/activate`,
      {},
    );
    setLoading(false);
    if (!res.ok) return setError(res.message);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">{PROVIDER_LABEL[provider]}</h2>
          <span
            className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
              active
                ? "bg-emerald-500/15 text-emerald-300"
                : configured
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-gray-600/20 text-gray-400"
            }`}
          >
            {active ? "Ativo" : configured ? "Configurado (inativo)" : "Não configurado"}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
          >
            {editing ? "Cancelar" : configured ? "Editar" : "Configurar"}
          </button>
          {configured && !active && (
            <button
              type="button"
              onClick={activate}
              disabled={loading}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              Ativar
            </button>
          )}
        </div>
      </div>

      {!editing && credentialsMasked && (
        <dl className="mt-4 space-y-1">
          {Object.entries(credentialsMasked).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-sm">
              <dt className="text-gray-500">{k}:</dt>
              <dd className="font-mono text-gray-300">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {editing && (
        <div className="mt-4 space-y-3">
          {FIELDS[provider].map((f) => (
            <div key={f.key}>
              <label className="block text-xs text-gray-400">{f.label} *</label>
              <input
                type={f.type ?? "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
              />
            </div>
          ))}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="button"
            onClick={save}
            disabled={loading}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? "Salvando..." : "Salvar credenciais"}
          </button>
        </div>
      )}
      {!editing && error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Conferir/adicionar `apiPut` em `src/lib/client-api.ts`**

Ler o arquivo. Se `apiPut` não existir, adicionar seguindo exatamente o shape de `apiPost` (mesmo tipo de retorno), só trocando `method: "PUT"`.

- [ ] **Step 3: Página server**

Criar `src/app/plataforma/(painel)/configuracoes/whatsapp/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getPlatformSessionUser, isMasterAdmin } from "@/lib/platform-context";
import { prisma } from "@/lib/prisma";
import { decryptConfig } from "@/lib/crypto-config";
import { maskCredentials } from "@/lib/actions/platform-whatsapp-config";
import WhatsAppProviderCard from "@/components/platform/whatsapp-provider-card";

/**
 * Config de provider WhatsApp (spec 2026-07-11) — só master_admin.
 * Decripta + mascara no servidor; o client nunca recebe credencial íntegra.
 */
export default async function WhatsAppConfigPage() {
  const platformUser = await getPlatformSessionUser();
  if (!platformUser) redirect("/plataforma/login");
  if (!isMasterAdmin(platformUser.role)) redirect("/plataforma/tenants");

  const configs = await prisma.whatsAppProviderConfig.findMany();
  const byProvider = new Map(configs.map((c) => [c.provider, c]));

  const providers = ["evolution", "meta_cloud_api"] as const;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">WhatsApp</h1>
        <p className="mt-1 text-sm text-gray-400">
          Provider usado pelo Tibé para ENVIAR mensagens (o recebimento continua no N8N).
          Trocar de provider aqui não exige alterar o workflow do N8N.
        </p>
      </div>

      {providers.map((p) => {
        const config = byProvider.get(p);
        return (
          <WhatsAppProviderCard
            key={p}
            provider={p}
            configured={!!config}
            active={config?.active ?? false}
            credentialsMasked={
              config
                ? maskCredentials(decryptConfig<Record<string, string>>(config.credentials_encrypted))
                : null
            }
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Link na sidebar**

Em `src/app/plataforma/(painel)/layout.tsx`, dentro do bloco `{masterAdmin && (...)}` existente do link "Equipe", transformar em fragment com os dois links (Equipe + WhatsApp):

```tsx
          {masterAdmin && (
            <>
              <Link href="/plataforma/configuracoes/equipe" className="block rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800 hover:text-white">
                Equipe
              </Link>
              <Link href="/plataforma/configuracoes/whatsapp" className="block rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800 hover:text-white">
                WhatsApp
              </Link>
            </>
          )}
```

- [ ] **Step 5: Verificação manual (dev server + browser)**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run dev
```

No browser (real — regra do projeto: página autenticada não funciona via `next start`+cookie jar): login em `http://localhost:3000/plataforma/login`, abrir Configurações → WhatsApp, salvar credenciais Evolution de teste, ver máscara, ativar, conferir badge "Ativo". Parar o server depois.

- [ ] **Step 6: Typecheck e commit**

```bash
npx tsc --noEmit
git add "src/app/plataforma/(painel)/configuracoes/whatsapp" src/components/platform/whatsapp-provider-card.tsx "src/app/plataforma/(painel)/layout.tsx" src/lib/client-api.ts
git commit -m "$(cat <<'EOF'
M7: página de config de provider WhatsApp no painel da plataforma

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Documentação

**Files:**
- Modify: `CLAUDE.md`, `AGENTS.md` (seção do agente WhatsApp + lista de exceções do client base + env vars)
- Modify: `docs/n8n-whatsapp-workflow.md` (Node 6 e envios de suggested_reply)
- Modify: `src/app/(public)/docs/api/page.tsx` (3 endpoints novos no array)

**Interfaces:**
- Consumes: contratos definidos nas Tasks 5.
- Produces: docs coerentes com o código (regra do projeto: endpoint novo SEMPRE entra em /docs/api).

- [ ] **Step 1: CLAUDE.md**

Na seção "O agente WhatsApp (Módulo 3)", adicionar bullet:

```markdown
- **Envio de mensagem agora é do Tibé** (spec 2026-07-11, desvio deliberado da
  regra "N8N é o único intermediário", aprovado pelo usuário): o N8N chama
  `POST /api/internal/whatsapp/send-message` e o Tibé entrega pelo provider
  ATIVO em `WhatsAppProviderConfig` (Evolution API não-oficial OU Meta Cloud
  API — configurável em `/plataforma/configuracoes/whatsapp`, só master_admin,
  credenciais AES-256-GCM com `CONFIG_ENCRYPTION_KEY`). O RECEBIMENTO continua
  no N8N (payloads de entrada diferem por provider; segue não existindo
  `/api/webhooks/whatsapp`). Despacho em `src/lib/whatsapp-send.ts`.
```

Na lista de exceções do client base (seção de isolamento), adicionar antes de "Qualquer uso novo":

```markdown
  `WhatsAppProviderConfig` (spec 2026-07-11) — config GLOBAL de plataforma
  (rotas master_admin + `sendWhatsAppMessage`), mesma categoria estrutural de
  `PlatformUser`, fora de `TENANT_SCOPED_MODELS`,
```

- [ ] **Step 2: AGENTS.md**

Replicar as duas mudanças acima com a mesma redação (arquivos são espelhos).

- [ ] **Step 3: n8n-whatsapp-workflow.md**

Substituir a instrução do Node 6 (e dos envios de `suggested_reply` nos branches) de "envia via Meta Cloud API" para:

```markdown
### Node 6 — HTTP Request: send-message (Tibé)

O N8N NÃO chama mais a Meta Cloud API (nem a Evolution) diretamente para
enviar. Envie qualquer resposta via Tibé:

```
POST {{TIBE_BASE_URL}}/api/internal/whatsapp/send-message
Headers: x-internal-secret: {{TIBE_INTERNAL_SECRET}}
Body: { "to": "{{ $json.phone }}", "text": "{{ $json.reply_text }}" }
```

O Tibé decide o provider (Evolution ou Meta) pela config do painel
(`/plataforma/configuracoes/whatsapp`) — trocar de provider não exige
alterar este workflow. Erros: 503 = nenhum provider ativo; 502 = o provider
recusou/falhou (mensagem detalhada em `error.message`).
```

Nota: com isso, `META_WHATSAPP_TOKEN`/`META_WHATSAPP_PHONE_ID` saem da tabela de credenciais do N8N (ficam no painel do Tibé); `META_WHATSAPP_VERIFY_TOKEN` continua (verificação do webhook de ENTRADA é do N8N).

- [ ] **Step 4: /docs/api**

Em `src/app/(public)/docs/api/page.tsx`: no grupo "Rotas internas", adicionar após execute-action:

```ts
      {
        method: "POST",
        path: "/api/internal/whatsapp/send-message",
        auth: "Header x-internal-secret",
        description:
          "Envia uma mensagem WhatsApp pelo provider ativo (Evolution ou Meta Cloud API, configurado no painel da plataforma). O N8N usa esta rota em vez de falar com o provider diretamente.",
        request: `{ "to": "+5511999990000", "text": "Peso registrado com sucesso." }`,
        response: `200
{ "data": { "provider": "evolution", "message_id": "BAE5..." }, "meta": {} }`,
      },
```

Criar grupo novo "Painel da plataforma — WhatsApp" (ou adicionar ao grupo de rotas de plataforma existente, se houver) com os dois endpoints master_admin:

```ts
      {
        method: "GET",
        path: "/api/platform/whatsapp-config",
        auth: "Sessão de plataforma · master_admin",
        description: "Lista as configs de provider (credenciais sempre mascaradas — últimos 4 caracteres).",
        response: `200
{ "data": [ { "provider": "evolution", "active": true, "credentials_masked": { "api_key": "•••• 9876" }, "updated_at": "2026-07-11T12:00:00.000Z" } ], "meta": {} }`,
      },
      {
        method: "PUT",
        path: "/api/platform/whatsapp-config",
        auth: "Sessão de plataforma · master_admin",
        description: "Cria/atualiza as credenciais de um provider (criptografadas em repouso). Não altera qual está ativo.",
        request: `{ "provider": "evolution", "credentials": { "base_url": "https://evo.up.railway.app", "api_key": "...", "instance": "tibe" } }`,
        response: `200
{ "data": { "provider": "evolution" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/platform/whatsapp-config/{provider}/activate",
        auth: "Sessão de plataforma · master_admin",
        description: "Ativa o provider (e desativa o outro, transacional). 404 se ainda não configurado.",
        response: `200
{ "data": { "provider": "meta_cloud_api" }, "meta": {} }`,
      },
```

(Conferir a estrutura real de grupos do arquivo antes de inserir — se não existir grupo de rotas `/api/platform`, criar um com `note` explicando a sessão de plataforma separada.)

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md AGENTS.md docs/n8n-whatsapp-workflow.md "src/app/(public)/docs/api/page.tsx"
git commit -m "$(cat <<'EOF'
M7: documentação — provider configurável, send-message, /docs/api

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Regressão completa e build

**Files:** nenhum novo (só correções se algo quebrar).

- [ ] **Step 1: Suite completa contra Docker local**

```powershell
docker start tibe-pg
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"
npm run test:isolation; npm run test:m1; npm run test:m2; npm run test:m3; npm run test:m4; npm run test:m5; npm run test:m6; npm run test:m7
```

Esperado: `0 falhas` em todas. (Se `test:m4` falhar em "1ª chamada do dia executa": lock diário no Redis compartilhado — reexecutar; o próprio teste limpa a chave.)

- [ ] **Step 2: Build de produção (lint incluso)**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run build
```

Esperado: build limpo, sem erro de lint (`react/no-unescaped-entities` é o suspeito usual em JSX com aspas).

- [ ] **Step 3: Commit final (se houve correção)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
M7: ajustes de regressão/build

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Pós-implementação (deploy — exige confirmação do usuário)

Fora das tasks (ações de produção, cada uma confirmada com o usuário antes):

1. `CONFIG_ENCRYPTION_KEY` nova na Vercel (gerar valor de produção próprio, ≠ dev).
2. Migração no Neon: `npm run db:deploy` com a URL Direct (o `.env` já aponta pra ela) — **confirmar com o usuário antes**.
3. `git push` (deploy automático) — **só quando o usuário pedir**.
4. Roteiro de infra externa (Railway: Evolution + N8N) segue em paralelo — não bloqueia este código; sem provider configurado, `send-message` devolve 503 `NO_PROVIDER_ACTIVE` por design.
