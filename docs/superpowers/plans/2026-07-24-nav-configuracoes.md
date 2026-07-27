# Navegação Configurações > Integrações > WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar do painel da plataforma reduz a KPIs/Tenants/Configurações; Configurações abre cards (Equipe, Integrações); Integrações abre card (WhatsApp), que leva à página já existente.

**Architecture:** 2 páginas server novas, cada uma listando cards (link estilizado), com o mesmo guard `getPlatformSessionUser`/`isMasterAdmin` já usado em `equipe/page.tsx` e `whatsapp/page.tsx`. Sidebar edita 1 arquivo.

**Tech Stack:** Next.js 14 App Router, Tailwind (dark theme já estabelecido no M6).

**Spec:** `docs/superpowers/specs/2026-07-24-nav-configuracoes-integracoes-design.md`

## Global Constraints

- Comentários em português.
- Dark theme: `bg-gray-950`/`bg-gray-900`, `border-gray-800`, accent `emerald-600` — mesma paleta das páginas existentes do painel.
- `guardPlatform`/`getPlatformSessionUser` já existem — não recriar.
- `/plataforma/configuracoes/whatsapp` e `/plataforma/configuracoes/equipe` **não mudam de path nem de conteúdo** — só a navegação até eles muda.
- Commits: português, footer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (heredoc).
- `npx tsc --noEmit` e `npm run build` devem passar limpo ao final.

---

### Task 1: Página `/plataforma/configuracoes` com cards

**Files:**
- Create: `src/app/plataforma/(painel)/configuracoes/page.tsx`

**Interfaces:**
- Consumes: `getPlatformSessionUser`, `isMasterAdmin` de `@/lib/platform-context`.
- Produces: página server, sem export reusado por outras tasks.

- [ ] **Step 1: Criar a página**

Criar `src/app/plataforma/(painel)/configuracoes/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformSessionUser, isMasterAdmin } from "@/lib/platform-context";

/**
 * Hub de configurações da plataforma (spec 2026-07-24) — só master_admin.
 * Agrupa Equipe e Integrações (antes itens soltos na sidebar).
 */
export default async function PlatformConfiguracoesPage() {
  const platformUser = await getPlatformSessionUser();
  if (!platformUser) redirect("/plataforma/login");
  if (!isMasterAdmin(platformUser.role)) redirect("/plataforma/tenants");

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold text-white">Configurações</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/plataforma/configuracoes/equipe"
          className="block rounded-lg border border-gray-800 bg-gray-900 p-5 transition hover:border-gray-700 hover:bg-gray-800/50"
        >
          <h2 className="font-semibold text-white">Equipe</h2>
          <p className="mt-1 text-sm text-gray-400">
            Gerenciar administradores e equipe da plataforma.
          </p>
        </Link>
        <Link
          href="/plataforma/configuracoes/integracoes"
          className="block rounded-lg border border-gray-800 bg-gray-900 p-5 transition hover:border-gray-700 hover:bg-gray-800/50"
        >
          <h2 className="font-semibold text-white">Integrações</h2>
          <p className="mt-1 text-sm text-gray-400">
            Provedores externos conectados ao Tibé.
          </p>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/plataforma/(painel)/configuracoes/page.tsx"
git commit -m "$(cat <<'EOF'
Nav: página /plataforma/configuracoes com cards Equipe e Integrações

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Página `/plataforma/configuracoes/integracoes` com card WhatsApp

**Files:**
- Create: `src/app/plataforma/(painel)/configuracoes/integracoes/page.tsx`

**Interfaces:**
- Consumes: mesmas de Task 1.
- Produces: nenhum export consumido por tasks seguintes.

- [ ] **Step 1: Criar a página**

Criar `src/app/plataforma/(painel)/configuracoes/integracoes/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformSessionUser, isMasterAdmin } from "@/lib/platform-context";

/** Lista de integrações externas (spec 2026-07-24) — só master_admin. */
export default async function PlatformIntegracoesPage() {
  const platformUser = await getPlatformSessionUser();
  if (!platformUser) redirect("/plataforma/login");
  if (!isMasterAdmin(platformUser.role)) redirect("/plataforma/tenants");

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold text-white">Integrações</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/plataforma/configuracoes/whatsapp"
          className="block rounded-lg border border-gray-800 bg-gray-900 p-5 transition hover:border-gray-700 hover:bg-gray-800/50"
        >
          <h2 className="font-semibold text-white">WhatsApp</h2>
          <p className="mt-1 text-sm text-gray-400">
            Evolution API ou Meta Cloud API.
          </p>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/plataforma/(painel)/configuracoes/integracoes/page.tsx"
git commit -m "$(cat <<'EOF'
Nav: página /plataforma/configuracoes/integracoes com card WhatsApp

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Atualizar sidebar

**Files:**
- Modify: `src/app/plataforma/(painel)/layout.tsx`

**Interfaces:**
- Consumes: nenhuma nova.
- Produces: nenhuma.

- [ ] **Step 1: Ler o arquivo atual**

Ler `src/app/plataforma/(painel)/layout.tsx` (já existe, ~62 linhas) para
confirmar o bloco exato a substituir antes de editar.

- [ ] **Step 2: Substituir os links de Equipe/WhatsApp por um único link Configurações**

No bloco `{masterAdmin && (...)}` que hoje contém os links "Equipe" e
"WhatsApp" (adicionado no M7), substituir por:

```tsx
          {masterAdmin && (
            <Link href="/plataforma/configuracoes" className="block rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800 hover:text-white">
              Configurações
            </Link>
          )}
```

Remover os dois `<Link>` antigos (Equipe e WhatsApp) inteiramente — só esse
um link novo fica no lugar deles.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/plataforma/(painel)/layout.tsx"
git commit -m "$(cat <<'EOF'
Nav: sidebar reduzida a KPIs/Tenants/Configurações

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Verificação end-to-end (dev server + curl)

**Files:** nenhum novo.

- [ ] **Step 1: Subir dev server contra Docker local**

```powershell
docker start tibe-pg
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run dev
```

- [ ] **Step 2: Confirmar as 4 rotas respondem**

```bash
curl -s -o /dev/null -w "configuracoes: %{http_code}\n" http://localhost:3000/plataforma/configuracoes
curl -s -o /dev/null -w "integracoes: %{http_code}\n" http://localhost:3000/plataforma/configuracoes/integracoes
curl -s -o /dev/null -w "whatsapp: %{http_code}\n" http://localhost:3000/plataforma/configuracoes/whatsapp
curl -s -o /dev/null -w "equipe: %{http_code}\n" http://localhost:3000/plataforma/configuracoes/equipe
```

Esperado: todas `307` (redirect pra `/plataforma/login`, sem sessão — é o
comportamento correto, mesma coisa que as páginas antigas já faziam).

- [ ] **Step 3: Build de produção**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run build
```

Esperado: build limpo.

- [ ] **Step 4: Parar o dev server**

```bash
netstat -ano | grep ":3000.*LISTENING" | awk '{print $5}' | head -1 | xargs -r taskkill //F //PID
```

Nenhum commit nesta task (só verificação).
