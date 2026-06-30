# Spec: Módulo 0, Setup e infraestrutura multi-tenant

**Dependências:** nenhuma
**Pré-requisito para:** todos os outros módulos
**Agente responsável:** agente de infraestrutura e configuração
**Fase do contrato:** Fase 1 (Semanas 1 e 2)

---

## Objetivo

Criar a base do projeto Tibé com estrutura de pastas, schema multi-tenant, autenticação, isolamento de dados por tenant e deploy automático funcionando antes de qualquer funcionalidade de negócio.

---

## Tasks

### 0.1 Repositório e projeto Next.js

- Criar repositório no GitHub: `tibe-agrogestao` (privado)
- Inicializar Next.js 14 com App Router, TypeScript e Tailwind CSS via `create-next-app`
- Configurar alias de imports `@/` apontando para `src/`
- Configurar `.gitignore` excluindo `.env*`, `node_modules`, `.next`
- Criar branch `main` como branch de produção
- Criar arquivo `.env.example` com todas as variáveis listadas no PRD seção 10.2

### 0.2 Banco de dados e Prisma

- Conectar projeto ao Neon.tech (projeto `tibe-agrogestao`, banco `neondb`, já provisionado)
- Instalar Prisma
- Criar `prisma/schema.prisma` com todos os modelos definidos no PRD seção 4
- Executar `prisma migrate dev` para criar as tabelas
- Criar cliente Prisma singleton em `lib/prisma.ts`
- Validar conexão com o banco via script de teste

### 0.3 Middleware de isolamento multi-tenant

- Criar `lib/tenant-context.ts` com função `getCurrentTenantId()` que resolve o `tenant_id` a partir da sessão NextAuth ativa no servidor
- Criar Prisma Client Extension (ou middleware `$use`) que injeta automaticamente `where: { tenant_id: ctx.tenantId }` em todas as queries de modelos que possuem a coluna `tenant_id`
- O middleware deve cobrir as operações: `findMany`, `findFirst`, `findUnique`, `update`, `updateMany`, `delete`, `deleteMany`, `create` (injeta `tenant_id` automaticamente no create)
- Modelos sem `tenant_id` (ex: `Vaccine` se for catálogo global) ficam fora do escopo do middleware
- Criar teste automatizado simples que confirma: criar dois tenants, criar registro em cada um, consultar como tenant A e validar que o registro do tenant B nunca aparece

### 0.4 Autenticação com NextAuth v5

- Instalar NextAuth v5
- Configurar provider de credenciais (email e senha) com bcrypt
- Sessão NextAuth deve carregar `tenant_id` e `role` do usuário autenticado
- Criar middleware de proteção de rotas em `middleware.ts`
- Criar layout de autenticação em `app/(auth)/layout.tsx`
- Criar página de login em `app/(auth)/login/page.tsx`
- Implementar lógica de redirect após login: se usuário não tem `TenantProfile` ativo, redireciona para onboarding; senão, vai direto ao dashboard
- Criar seed inicial com o tenant Da Mata Sementes e usuário owner via `prisma/seed.ts`

### 0.5 Onboarding bifurcado (seleção de perfil)

- Criar página `app/(dashboard)/onboarding/page.tsx`
- Exibida apenas se o tenant não tem nenhum `TenantProfile` ativo
- Pergunta: "Sua empresa trabalha com fazenda, prestação de serviço, ou os dois?"
- Opções: Fazenda, Prestador de Serviço, Ambos
- Ao confirmar, criar o(s) `TenantProfile` correspondente(s)
- Tenant pode ativar o profile que faltava depois, em Configurações, sem precisar refazer o onboarding completo

### 0.6 Estrutura de roles e permissões

- Criar enum de roles no schema Prisma: `OWNER`, `ADMIN`, `OPERADOR`, `VISUALIZADOR`
- Criar helper `lib/permissions.ts` com funções:
  - `canAccess(role, module)` retorna boolean
  - `requireRole(role)` para proteger server actions
- Criar componente `<PermissionGate role="admin">` para proteger elementos na UI
- Implementar redirecionamento automático quando usuário tenta acessar rota sem permissão

### 0.7 Layout base da aplicação

- Criar layout principal do dashboard em `app/(dashboard)/layout.tsx`
- Sidebar com navegação pelos módulos ativos do tenant (oculta módulo Rebanho/Lavoura se o `TenantProfile` fazenda não está ativo; oculta Prestador se esse profile não está ativo)
- Header com nome do usuário, tenant atual, role e botão de logout
- Página inicial do dashboard com indicadores básicos por perfil ativo

### 0.8 Deploy na Vercel

- Importar repositório `tibe-agrogestao` na Vercel
- Confirmar integração Neon ↔ Vercel já instalada na conta (gera branch de banco automática por PR)
- Configurar variáveis de ambiente de produção na Vercel
- Validar auto-deploy via push na branch `main`
- Validar que cada Pull Request gera preview deployment com banco de dados isolado (branch do Neon)

---

## Contratos de API

### POST /api/auth/login
```json
Request:
{
  "email": "string",
  "password": "string"
}

Response 200:
{
  "data": {
    "user": {
      "id": "string",
      "name": "string",
      "email": "string",
      "role": "OWNER | ADMIN | OPERADOR | VISUALIZADOR",
      "tenant_id": "string"
    }
  }
}

Response 401:
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email ou senha inválidos"
  }
}
```

### POST /api/v1/tenant/profiles
```json
Request:
{
  "profile_type": "fazenda | prestador"
}

Response 201:
{
  "data": {
    "id": "string",
    "profile_type": "fazenda | prestador",
    "active": true,
    "created_at": "ISO8601"
  }
}
```

---

## Critérios de aceitação

- Login com credenciais válidas redireciona para o dashboard correto por role
- Login com credenciais inválidas exibe mensagem de erro
- Acesso a rota protegida sem sessão redireciona para login
- Tenant sem nenhum `TenantProfile` ativo é redirecionado para onboarding no primeiro login
- Usuário do tenant A jamais visualiza, edita ou deleta um registro do tenant B em nenhum endpoint, validado por teste automatizado
- Operador acessando configurações de usuários é redirecionado
- Push na branch `main` dispara deploy automático na Vercel
- Pull Request gera preview deployment com banco Neon isolado, sem afetar dados de produção
- Tenant pode ativar um segundo profile (ex: já tinha fazenda, ativa prestador) sem perder dados existentes
