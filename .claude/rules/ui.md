---
paths:
  - "src/components/**"
  - "src/app/(dashboard)/**"
---
<!-- Carrega sozinho ao ler um arquivo que casa com os globs acima.
     O kit feito a mao, o painel mobile-first, e a importacao que quebra o build em client component. -->

## UI

Não existe um design system de terceiros instalado via CLI: **o `npx
shadcn@latest init` trava neste ambiente** (fica esperando prompt
interativo). Os componentes em `src/components/ui/` (`button`, `input`,
`label`, `table`, `sheet`, `select`, `badge`) foram escritos à mão no estilo
shadcn (Radix primitives + `class-variance-authority` + `tailwind-merge`,
`cn()` em `src/lib/utils.ts`), com `components.json` já configurado: se um
dia rodar o CLI interativamente, ele deve reconhecer a estrutura existente.
Gráficos: Recharts v3. Cores da marca em `tailwind.config.ts`
(`tibe.primary/dark/light`), fonte Inter via `next/font/google`.

Páginas server (list/detail) buscam dados direto via `getTenantDb()`; ações de
escrita são componentes client dentro de `<Sheet>` (painel lateral), chamando
`apiPost`/`apiPatch` de `src/lib/client-api.ts` e dando `router.refresh()` no
sucesso.

**Painel do tenant é responsivo (mobile-first, deliberado: spec 2026-07-28):**
o fluxo nasce no WhatsApp, então o cliente acessa o painel majoritariamente
pelo celular, não desktop. `(dashboard)/layout.tsx` (server) calcula
`navLinks` já filtrados por perfil ativo + `canAccess(role, ...)` e passa pra
`DashboardShell` (`src/components/layout/dashboard-shell.tsx`, client):
**nunca** importe `@/lib/permissions` dentro de um client component do
dashboard: esse módulo importa `getSessionUser` de `tenant-context.ts`, que
arrasta `auth.ts` → `rate-limit.ts` → `ioredis` (módulos Node como `dns`
inexistentes no browser) e quebra o build. `DashboardShell` guarda o estado
de abrir/fechar do menu (hambúrguer no header, `md:hidden`) e repassa pra
`Sidebar` (`src/components/layout/sidebar.tsx`, client, drawer off-canvas
abaixo do breakpoint `md`, estático acima). `Table`/`Sheet`
(`src/components/ui/*`) já são responsivos por padrão (scroll horizontal e
largura total, respectivamente): não precisam de tratamento especial nas
páginas de conteúdo.

---
