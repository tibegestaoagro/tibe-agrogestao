# Criação manual de tenant + troca obrigatória de senha: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** master_admin cria um Tenant novo (trial, senha temporária) direto de `/plataforma/tenants`; o usuário criado é forçado a trocar a senha no primeiro login antes de acessar qualquer outra coisa.

**Architecture:** Reusa a lógica de `POST /api/v1/signup` (mesma checagem de duplicidade, mesmo `TRIAL_DAYS`) numa nova action de plataforma. Novo campo `User.must_change_password` + gate nos dois pontos de entrada pós-login (`(dashboard)/layout.tsx`, `onboarding/page.tsx`) redirecionando pra uma página nova `/trocar-senha`.

**Tech Stack:** Next.js 14, Prisma 7, bcryptjs, Zod.

**Spec:** `docs/superpowers/specs/2026-07-24-tenant-manual-creation-design.md`

## Global Constraints

- Comentários e mensagens de erro em português.
- Testes contra Docker local: `DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"`.
- Migração: `migrate diff` → salvar SQL manual em `prisma/migrations/<timestamp>_nome/migration.sql` → `npm run db:deploy`. Nunca `prisma migrate dev`.
- Convite de usuário existente (M5, `inviteUserAction`) **não muda**: continua sem troca forçada.
- Commits: português, footer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (heredoc).
- `npx tsc --noEmit` e `npm run build` limpos ao final.

---

### Task 1: Schema `must_change_password` + `generateTempPassword` compartilhado

**Files:**
- Modify: `prisma/schema.prisma` (model `User`)
- Create: `prisma/migrations/20260724150000_user_must_change_password/migration.sql`
- Create: `src/lib/passwords.ts`
- Modify: `src/lib/actions/users.ts` (usar a função compartilhada em vez da local)

**Interfaces:**
- Produces: campo `User.must_change_password: boolean` (client Prisma: `user.must_change_password`); `generateTempPassword(): string` exportada de `@/lib/passwords`.

- [ ] **Step 1: Adicionar o campo ao schema**

Em `prisma/schema.prisma`, no model `User`, adicionar (perto de `active`):

```prisma
  active                Boolean  @default(true)
  must_change_password  Boolean  @default(false)
```

- [ ] **Step 2: Gerar client e conferir o diff**

```powershell
npx prisma generate
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

⚠️ Esse comando também vai sugerir um `DROP INDEX "WhatsAppProviderConfig_one_active"`: é drift conhecido e documentado no CLAUDE.md (índice parcial não representável no schema). **NÃO inclua esse DROP** na migração salva no Step 3: só a parte referente a `must_change_password`.

- [ ] **Step 3: Salvar a migração**

Criar `prisma/migrations/20260724150000_user_must_change_password/migration.sql`:

```sql
-- Troca obrigatória de senha no primeiro login (tenants criados manualmente
-- pelo painel da plataforma: spec 2026-07-24).
ALTER TABLE "User" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 4: Aplicar no Docker local**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run db:deploy
```

Esperado: `Applying migration 20260724150000_user_must_change_password` … sucesso.

- [ ] **Step 5: Extrair `generateTempPassword` compartilhada**

Criar `src/lib/passwords.ts`:

```ts
import crypto from "node:crypto";

/** Senha temporária: 10 caracteres alfanuméricos, fáceis de digitar/ditar por telefone. */
export function generateTempPassword(): string {
  return crypto.randomBytes(8).toString("base64url").slice(0, 10);
}
```

Em `src/lib/actions/users.ts`:
1. Remover a função local `generateTempPassword` (linhas ~13-16).
2. Remover o import `import crypto from "node:crypto";` se não for mais usado em nenhum outro lugar do arquivo (confira antes de remover).
3. Adicionar `import { generateTempPassword } from "@/lib/passwords";` no topo.

O resto do arquivo (`inviteUserAction` etc.) não muda: só troca de onde vem a função.

- [ ] **Step 6: Typecheck + regressão M5 (usa inviteUserAction)**

```powershell
npx tsc --noEmit
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m5
```

Esperado: typecheck limpo, `test:m5` 0 falhas (confirma que mover a função não quebrou o convite de usuário existente).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260724150000_user_must_change_password/migration.sql src/lib/passwords.ts src/lib/actions/users.ts
git commit -m "$(cat <<'EOF'
Schema: User.must_change_password + generateTempPassword compartilhada

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Action + rota + UI de criação manual de tenant

**Files:**
- Modify: `src/lib/actions/platform-tenants.ts` (adicionar `createTenantManuallyAction`)
- Modify: `src/app/api/platform/tenants/route.ts` (adicionar `export async function POST`)
- Create: `src/components/platform/create-tenant-form.tsx`
- Modify: `src/app/plataforma/(painel)/tenants/page.tsx` (adicionar o botão/form no topo)
- Create: `scripts/m10-tenant-manual.test.ts`
- Modify: `package.json` (script `test:m10`)

**Interfaces:**
- Consumes: `TRIAL_DAYS` (`@/lib/billing-access`), `generateTempPassword` (`@/lib/passwords`, Task 1), `prisma`/`prismaForTenant`/`scoped` (`@/lib/prisma`), `guardPlatform` (`@/lib/platform-guard`), `apiPost` (`@/lib/client-api`).
- Produces: `createTenantManuallyAction(params: { company_name: string; document: string; phone: string; plan: "campo"|"fazenda"|"grupo"; owner_name: string; owner_email: string }): Promise<ActionResult<{ tenant_id: string; email: string; temp_password: string }>>`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `scripts/m10-tenant-manual.test.ts`:

```ts
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { createTenantManuallyAction } from "@/lib/actions/platform-tenants";

/**
 * Testes de criação manual de tenant pelo painel (spec 2026-07-24).
 * Roda: `npm run test:m10`
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
  console.log("🔒 M10: Criação manual de tenant\n");

  const doc = `M10${Date.now()}`.slice(0, 14);
  const email = `m10-${Date.now()}@teste.local`;

  const result = await createTenantManuallyAction({
    company_name: "M10 Tenant Manual",
    document: doc,
    phone: "22999990000",
    plan: "fazenda",
    owner_name: "Owner M10",
    owner_email: email,
  });
  assert(result.ok, "criação manual funciona");
  if (!result.ok) {
    console.log(failures === 0 ? "\n✅ M10: 0 falhas." : `\n❌ M10: ${failures} falha(s).`);
    process.exit(1);
  }

  assert(!!result.data.temp_password && result.data.temp_password.length >= 8, "devolve senha temporária");

  const tenant = await prisma.tenant.findUnique({ where: { id: result.data.tenant_id } });
  assert(!!tenant && tenant.status === "trial", "tenant nasce em status trial");
  assert(!!tenant?.trial_ends_at, "trial_ends_at preenchido");

  const user = await prisma.user.findUnique({ where: { email } });
  assert(!!user && user.role === "OWNER", "user nasce OWNER");
  assert(user?.must_change_password === true, "user nasce com must_change_password=true");

  const dup = await createTenantManuallyAction({
    company_name: "M10 Duplicado",
    document: doc,
    phone: "22999990001",
    plan: "campo",
    owner_name: "Outro",
    owner_email: `outro-${Date.now()}@teste.local`,
  });
  assert(!dup.ok && dup.code === "DUPLICATE_DOCUMENT", "documento duplicado é rejeitado");

  // limpeza
  if (tenant) await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});

  console.log(failures === 0 ? "\n✅ M10: 0 falhas." : `\n❌ M10: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Em `package.json`, adicionar ao final da lista de scripts de teste: `"test:m10": "tsx scripts/m10-tenant-manual.test.ts"`.

- [ ] **Step 2: Rodar e ver falhar**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m10
```

Esperado: FALHA: `createTenantManuallyAction` não existe ainda.

- [ ] **Step 3: Implementar a action**

Em `src/lib/actions/platform-tenants.ts`, adicionar (mantendo o que já existe no arquivo: `forceSubscriptionStatusAction`: intocado):

```ts
import bcrypt from "bcryptjs";
import { prismaForTenant, scoped } from "@/lib/prisma";
import { generateTempPassword } from "@/lib/passwords";
import { TRIAL_DAYS } from "@/lib/billing-access";
import type { TenantPlan } from "@/generated/prisma/enums";

/**
 * Criação manual de tenant pelo painel da plataforma (spec 2026-07-24):
 * SEGUNDA exceção deliberada à regra "signup público é a única forma de
 * criar tenant" (a primeira é o próprio /criar-conta). Usada para dar acesso
 * de teste a equipes de cliente sem passar pelo formulário público. Reusa a
 * mesma lógica de POST /api/v1/signup (checagem de duplicidade, TRIAL_DAYS),
 * mas gera a senha em vez de recebê-la, e marca must_change_password.
 */
export async function createTenantManuallyAction(params: {
  company_name: string;
  document: string;
  phone: string;
  plan: TenantPlan;
  owner_name: string;
  owner_email: string;
}): Promise<ActionResult<{ tenant_id: string; email: string; temp_password: string }>> {
  const document = params.document.replace(/\D/g, "");
  if (document.length < 11) {
    return fail("VALIDATION_ERROR", "CNPJ ou CPF inválido", 422);
  }

  const [dupDoc, dupEmail] = await Promise.all([
    prisma.tenant.findUnique({ where: { document } }),
    prisma.user.findUnique({ where: { email: params.owner_email } }),
  ]);
  if (dupDoc) return fail("DUPLICATE_DOCUMENT", "Já existe uma conta com esse CNPJ/CPF", 409);
  if (dupEmail) return fail("DUPLICATE_EMAIL", "Já existe uma conta com esse email", 409);

  const trial_ends_at = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const tenant = await prisma.tenant.create({
    data: {
      name: params.company_name,
      document,
      phone: params.phone,
      email: params.owner_email,
      plan: params.plan,
      status: "trial",
      trial_ends_at,
    },
  });

  const temp_password = generateTempPassword();
  try {
    const password_hash = await bcrypt.hash(temp_password, 10);
    await prismaForTenant(tenant.id).user.create({
      data: scoped({
        name: params.owner_name,
        email: params.owner_email,
        password_hash,
        role: "OWNER",
        phone: params.phone,
        must_change_password: true,
      }),
    });
  } catch (e) {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    if ((e as { code?: string }).code === "P2002") {
      return fail("DUPLICATE_EMAIL", "Já existe uma conta com esse email", 409);
    }
    throw e;
  }

  return ok({ tenant_id: tenant.id, email: params.owner_email, temp_password });
}
```

Nota: `prisma` (client base) já deve estar importado no topo do arquivo
(usado por `forceSubscriptionStatusAction`): confira antes de duplicar o
import.

- [ ] **Step 4: Rodar e ver passar**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m10
```

Esperado: todos ✅, `M10: 0 falhas.`

- [ ] **Step 5: Rota POST**

Em `src/app/api/platform/tenants/route.ts`, adicionar (o `GET` existente
fica intocado): no topo do arquivo, adicionar aos imports:

```ts
import { z } from "zod";
import { apiError } from "@/lib/api";
import { createTenantManuallyAction } from "@/lib/actions/platform-tenants";
```

E ao final do arquivo:

```ts
const createSchema = z.object({
  company_name: z.string().trim().min(1),
  document: z.string().trim().min(11),
  phone: z.string().trim().min(8),
  plan: z.enum(["campo", "fazenda", "grupo"]),
  owner_name: z.string().trim().min(1),
  owner_email: z.string().trim().email(),
});

/** POST /api/platform/tenants (spec 2026-07-24): só master_admin. */
export async function POST(request: Request) {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await createTenantManuallyAction(parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data, {}, { status: 201 });
}
```

`apiOk` já está importado no topo do arquivo (usado pelo `GET`): não duplicar.

- [ ] **Step 6: UI: form + botão**

Criar `src/components/platform/create-tenant-form.tsx` (mesmo padrão de
`invite-team-form.tsx`):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client-api";

type Plan = "campo" | "fazenda" | "grupo";
const PLAN_LABEL: Record<Plan, string> = { campo: "Campo", fazenda: "Fazenda", grupo: "Grupo" };

/** Criação manual de tenant pelo painel (spec 2026-07-24): só master_admin. */
export default function CreateTenantForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<Plan>("fazenda");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function submit() {
    if (!companyName || !document || !phone || !ownerName || !ownerEmail) {
      return setError("Preencha todos os campos.");
    }
    setLoading(true);
    setError(null);
    const res = await apiPost<{ temp_password: string }>("/api/platform/tenants", {
      company_name: companyName,
      document,
      phone,
      plan,
      owner_name: ownerName,
      owner_email: ownerEmail,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setTempPassword(res.data.temp_password);
    router.refresh();
  }

  function close() {
    setOpen(false);
    setCompanyName("");
    setDocument("");
    setPhone("");
    setPlan("fazenda");
    setOwnerName("");
    setOwnerEmail("");
    setTempPassword(null);
    setError(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
      >
        Criar tenant
      </button>
    );
  }

  return (
    <div className="rounded-md border border-gray-700 bg-gray-900 p-4">
      {tempPassword ? (
        <div className="space-y-3">
          <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-300">
            Tenant criado. Repasse estas credenciais manualmente: a senha só aparece aqui uma vez.
            No primeiro login, o usuário será obrigado a trocar a senha.
          </p>
          <p className="text-sm text-gray-300">
            Email: <span className="font-mono">{ownerEmail}</span>
          </p>
          <p className="text-sm text-gray-300">
            Senha temporária: <span className="font-mono">{tempPassword}</span>
          </p>
          <button
            type="button"
            onClick={close}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
          >
            Fechar
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400">Nome da empresa *</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">CNPJ/CPF *</label>
            <input
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">Telefone *</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">Plano *</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as Plan)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            >
              {(Object.keys(PLAN_LABEL) as Plan[]).map((p) => (
                <option key={p} value={p}>
                  {PLAN_LABEL[p]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">Editável depois pelo próprio cliente na assinatura.</p>
          </div>
          <div>
            <label className="block text-xs text-gray-400">Nome do responsável *</label>
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">Email do responsável *</label>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {loading ? "Criando..." : "Criar"}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

Em `src/app/plataforma/(painel)/tenants/page.tsx`: ler o arquivo inteiro
primeiro. Adicionar `import CreateTenantForm from "@/components/platform/create-tenant-form";`
no topo, e renderizar `<CreateTenantForm />` próximo ao `<TenantFilters />`
existente (mesmo container/linha de topo da página, sem quebrar o layout de
filtros já existente).

- [ ] **Step 7: Typecheck + regressão**

```powershell
npx tsc --noEmit
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m10; npm run test:m6
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions/platform-tenants.ts src/app/api/platform/tenants/route.ts src/components/platform/create-tenant-form.tsx "src/app/plataforma/(painel)/tenants/page.tsx" scripts/m10-tenant-manual.test.ts package.json
git commit -m "$(cat <<'EOF'
Tenant manual: action, rota e form no painel da plataforma

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Troca obrigatória de senha (action, rota, página)

**Files:**
- Create: `src/lib/actions/auth-self.ts`
- Create: `src/app/api/v1/auth/change-password/route.ts`
- Create: `src/app/trocar-senha/page.tsx`
- Create: `src/app/trocar-senha/change-password-form.tsx`
- Modify: `scripts/m10-tenant-manual.test.ts`

**Interfaces:**
- Consumes: `getSessionUser` (`@/lib/tenant-context`), `getTenantDb`, `ok`/`fail`/`ActionResult`.
- Produces: `changeOwnPasswordAction(db: TenantPrismaClient, userId: string, newPassword: string): Promise<ActionResult<{ id: string }>>`.

- [ ] **Step 1: Adicionar teste que falha**

Em `scripts/m10-tenant-manual.test.ts`, adicionar import:

```ts
import bcrypt from "bcryptjs";
import { changeOwnPasswordAction } from "@/lib/actions/auth-self";
import { prismaForTenant } from "@/lib/prisma";
```

Antes da limpeza final (antes de `if (tenant) await prisma.tenant.delete...`), adicionar:

```ts
  // ── troca obrigatória de senha ───────────────────────────────
  if (user) {
    const db = prismaForTenant(user.tenant_id);
    const changeResult = await changeOwnPasswordAction(db, user.id, "novaSenha123");
    assert(changeResult.ok, "changeOwnPasswordAction funciona");

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    assert(updated?.must_change_password === false, "must_change_password vira false após trocar");

    const passwordOk = updated ? await bcrypt.compare("novaSenha123", updated.password_hash) : false;
    assert(passwordOk, "nova senha bate no hash salvo");

    const shortResult = await changeOwnPasswordAction(db, user.id, "curta");
    assert(!shortResult.ok, "senha curta (<8) é rejeitada");
  }
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m10
```

Esperado: FALHA: `Cannot find module '@/lib/actions/auth-self'`.

- [ ] **Step 3: Implementar a action**

Criar `src/lib/actions/auth-self.ts`:

```ts
import bcrypt from "bcryptjs";
import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Troca de senha pelo próprio usuário (spec 2026-07-24): usada no fluxo de
 * troca obrigatória no primeiro login (tenants criados manualmente pelo
 * painel). Zera must_change_password ao trocar.
 */
export async function changeOwnPasswordAction(
  db: TenantPrismaClient,
  userId: string,
  newPassword: string,
): Promise<ActionResult<{ id: string }>> {
  if (newPassword.length < 8) {
    return fail("VALIDATION_ERROR", "A senha deve ter ao menos 8 caracteres", 422);
  }
  const password_hash = await bcrypt.hash(newPassword, 10);
  const user = await db.user.update({
    where: { id: userId },
    data: { password_hash, must_change_password: false },
  });
  return ok({ id: user.id });
}
```

- [ ] **Step 4: Rota**

Criar `src/app/api/v1/auth/change-password/route.ts`:

```ts
import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { changeOwnPasswordAction } from "@/lib/actions/auth-self";

/**
 * POST /api/v1/auth/change-password (spec 2026-07-24): só sessão, sem
 * guard() de módulo/billing (usuário precisa trocar a senha mesmo com a
 * conta em read_only/blocked).
 */
const schema = z.object({ new_password: z.string().min(8) });

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError(...ApiErrors.UNAUTHORIZED);

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "A senha deve ter ao menos 8 caracteres", 422);
  }

  const db = await getTenantDb();
  const result = await changeOwnPasswordAction(db, user.id, parsed.data.new_password);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
```

- [ ] **Step 5: Página + form**

Criar `src/app/trocar-senha/change-password-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (password.length < 8) return setError("A senha deve ter ao menos 8 caracteres.");
    if (password !== confirm) return setError("As senhas não coincidem.");
    setLoading(true);
    setError(null);
    const res = await fetch("/api/v1/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: password }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return setError(body?.error?.message ?? "Falha ao trocar a senha.");
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-gray-700">Nova senha</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-700">Confirmar nova senha</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="w-full rounded-md bg-tibe-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {loading ? "Salvando..." : "Definir nova senha"}
      </button>
    </div>
  );
}
```

Criar `src/app/trocar-senha/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import ChangePasswordForm from "./change-password-form";

/**
 * Troca obrigatória de senha (spec 2026-07-24): só para usuários com
 * must_change_password=true (tenants criados manualmente pelo painel).
 * Mesmo padrão de src/app/onboarding/page.tsx: fora do route group
 * (dashboard), sessão própria, fora do fluxo normal se não se aplicar.
 */
export default async function TrocarSenhaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.must_change_password) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-tibe-light px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-tibe-dark">Defina sua nova senha</h1>
        <p className="mt-2 text-gray-600">
          Por segurança, você precisa trocar a senha temporária antes de continuar.
        </p>
        <div className="mt-6">
          <ChangePasswordForm />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Rodar e ver passar**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m10
```

Esperado: todos ✅.

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/actions/auth-self.ts src/app/api/v1/auth/change-password src/app/trocar-senha scripts/m10-tenant-manual.test.ts
git commit -m "$(cat <<'EOF'
Troca obrigatória de senha: action, rota, página /trocar-senha

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Gates de entrada (dashboard layout + onboarding)

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `prisma` (já importado em ambos os arquivos).
- Produces: nenhuma nova.

- [ ] **Step 1: Gate no dashboard layout**

Ler `src/app/(dashboard)/layout.tsx` inteiro primeiro. Logo após
`if (!user) redirect("/login");` e ANTES de `const profiles = await getActiveProfiles();`,
adicionar:

```tsx
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { must_change_password: true },
  });
  if (dbUser?.must_change_password) redirect("/trocar-senha");
```

`prisma` já está importado no arquivo (usado mais abaixo pro nome do
tenant): não duplicar o import.

- [ ] **Step 2: Gate no onboarding**

Ler `src/app/onboarding/page.tsx` inteiro primeiro. Logo após
`if (!user) redirect("/login");` e ANTES de `const profiles = await getActiveProfiles();`,
adicionar o mesmo bloco do Step 1 (precisa importar `prisma` de `@/lib/prisma`
no topo do arquivo, se ainda não estiver importado).

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/layout.tsx" src/app/onboarding/page.tsx
git commit -m "$(cat <<'EOF'
Troca obrigatória de senha: gate no dashboard e no onboarding

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Documentação + regressão completa + build

**Files:**
- Modify: `CLAUDE.md`, `AGENTS.md`

**Interfaces:** nenhuma nova.

- [ ] **Step 1: Atualizar CLAUDE.md**

Na seção "Signup público (`/planos` + `/criar-conta`): fora do escopo
original do PRD", adicionar um parágrafo ao final:

```markdown
**Segunda exceção deliberada (spec 2026-07-24):** `master_admin` também pode
criar um `Tenant` manualmente pelo painel da plataforma
(`POST /api/platform/tenants`, botão "Criar tenant" em `/plataforma/tenants`),
usado para dar acesso de teste a equipes de cliente sem passar pelo
formulário público. Reusa a mesma lógica de `/api/v1/signup` (trial,
checagem de duplicidade), mas gera senha temporária em vez de receber uma, e
marca `User.must_change_password: true`: o usuário é obrigado a trocar a
senha em `/trocar-senha` (gate em `(dashboard)/layout.tsx` e
`onboarding/page.tsx`) antes de acessar qualquer outra coisa. O convite de
usuário do Módulo 5 (`inviteUserAction`) não tem esse gate: continua como
estava.
```

- [ ] **Step 2: Replicar em AGENTS.md**

Mesma informação, adaptada ao estilo prosa do arquivo (mesmo padrão das
outras seções espelhadas).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "$(cat <<'EOF'
Docs: segunda exceção de criação de tenant (painel) + troca obrigatória

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Regressão completa + build

**Files:** nenhum novo.

- [ ] **Step 1: Suite completa**

```powershell
docker start tibe-pg
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"
npm run test:isolation; npm run test:m1; npm run test:m2; npm run test:m3; npm run test:m4; npm run test:m5; npm run test:m6; npm run test:m7; npm run test:m9; npm run test:m10
```

Esperado: `0 falhas` em todas.

- [ ] **Step 2: Build**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run build
```

- [ ] **Step 3: Commit final (só se houve correção)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Tenant manual: ajustes de regressão/build

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
