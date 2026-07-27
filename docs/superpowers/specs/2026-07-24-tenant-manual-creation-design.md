# Criação manual de tenant + troca obrigatória de senha

**Data:** 2026-07-24 · **Status:** aprovado (missão loop-goal, decisões via AskUserQuestion na conversa)

## Contexto e objetivo

Hoje a **única** forma de criar um `Tenant` é o signup público (`/criar-conta`
→ `POST /api/v1/signup`), documentado em CLAUDE.md como fonte única
deliberada. Este spec introduz uma **segunda fonte, deliberada**: o
`master_admin` cria tenants de teste manualmente pelo painel da plataforma,
para dar acesso a equipes de cliente validarem o produto antes/durante o
processo comercial — sem passar pelo formulário público. **CLAUDE.md e
AGENTS.md precisam ser atualizados** para documentar essa segunda exceção
(tarefa da implementação, não só nota).

Decisões fechadas na conversa: tenant nasce em **trial (14 dias)**, plano tem
um valor padrão editável no formulário (não trava nada — cliente muda depois
via `/configuracoes/assinatura`, fluxo que já existe). Senha temporária com
**troca obrigatória no primeiro login** — mecanismo novo, só se aplica a esse
fluxo (convite de usuário do M5 continua como está, sem troca forçada).

## Design

### Schema: `User.must_change_password`

```prisma
model User {
  ...
  must_change_password Boolean @default(false)
  ...
}
```

Migração: `ALTER TABLE "User" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;`

### Action `createTenantManuallyAction` (`src/lib/actions/platform-tenants.ts`, adicionar)

Reusa a lógica de `POST /api/v1/signup` (mesma checagem de documento/email
duplicado, mesmo `TRIAL_DAYS`), mas:
- `plan` vem do form com default `"fazenda"` (meio-termo dos 3 planos) —
  campo obrigatório no schema Zod da rota, mas o formulário já vem
  preenchido com esse valor, editável.
- `password` não vem do form — é **gerada** (`generateTempPassword()`,
  reusar a mesma função de `src/lib/actions/users.ts` — mover para um lugar
  compartilhado tipo `src/lib/passwords.ts` se ainda não for exportável, para
  não duplicar).
- `User` nasce com `must_change_password: true`.

```ts
export async function createTenantManuallyAction(params: {
  company_name: string;
  document: string;
  phone: string;
  plan: TenantPlan;
  owner_name: string;
  owner_email: string;
}): Promise<ActionResult<{ tenant_id: string; email: string; temp_password: string }>>
```

### Endpoint `POST /api/platform/tenants` (adicionar em `src/app/api/platform/tenants/route.ts`)

`guardPlatform({ requireMasterAdmin: true })`. Zod: `company_name, document,
phone, plan (enum), owner_name, owner_email`. Chama a action acima. Resposta
201 com `temp_password` (mostrada 1x, mesmo padrão do convite de equipe).

### UI — `/plataforma/tenants` (adicionar)

Botão **"Criar tenant"** no topo da lista (mesmo lugar/estilo do botão
"Convidar membro" em Equipe). Componente client
`src/components/platform/create-tenant-form.tsx` — mesmo padrão de
`invite-team-form.tsx` (inline expand, mostra `temp_password` uma vez após
criar, com aviso "repasse manualmente, só aparece aqui"). Campos: nome da
empresa, CNPJ/CPF, telefone, plano (select campo/fazenda/grupo, default
fazenda), nome do responsável, email do responsável.

### Troca obrigatória de senha

**Action** `changeOwnPasswordAction` (novo `src/lib/actions/auth-self.ts`):
```ts
export async function changeOwnPasswordAction(
  db: TenantPrismaClient,
  userId: string,
  newPassword: string,
): Promise<ActionResult<{ id: string }>>
```
Valida `newPassword.length >= 8` (mesma regra do signup), hash com bcrypt,
`update({ where: { id: userId }, data: { password_hash, must_change_password: false } })`.

**Endpoint** `POST /api/v1/auth/change-password` — só sessão (`getSessionUser`),
**não** usa `guard()` (não é ação de módulo, não precisa checar billing —
usuário precisa conseguir trocar a senha mesmo se a conta estiver
`read_only`/`blocked`). Zod `{ new_password: string.min(8) }`.

**Página** `src/app/trocar-senha/page.tsx` — mesmo padrão de
`src/app/onboarding/page.tsx` (fora do route group `(dashboard)`, sessão
própria): se não há sessão → `/login`; se `must_change_password` for
`false` → `/dashboard`. Form client simples (campo senha + confirmação,
`apiPost` pro endpoint acima, no sucesso `router.push("/dashboard")` +
`router.refresh()`).

**Gates de entrada** (onde checar `must_change_password`, precisa de dado
fresco do banco — `SessionUser`/JWT não carrega esse campo, então cada gate
faz uma query pontual, mesmo padrão de `tenant.findUnique` já existente no
dashboard layout):
- `src/app/(dashboard)/layout.tsx` — logo após `if (!user) redirect("/login")`,
  antes da checagem de `profiles.length`: se `must_change_password`,
  `redirect("/trocar-senha")`.
- `src/app/onboarding/page.tsx` — mesma checagem, no mesmo ponto (session
  existe mas ainda não decidiu profiles/dashboard).

## Fora do escopo

- Convite de usuário (M5) não muda — continua sem troca forçada.
- Não adiciona um fluxo de "esqueci minha senha" — fora do escopo deste
  spec.
- `plan` do tenant criado manualmente não vira cobrança automática — o
  tenant só entra na régua de cobrança quando alguém (o próprio cliente,
  via `/configuracoes/assinatura`) assinar de verdade.
