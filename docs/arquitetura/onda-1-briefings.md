# Onda 1: briefings dos agentes

**Agentes desta onda: A1, A2 e A3.** O A4 (sistema de design) foi movido para a
Onda 3, ver seção no fim deste documento.

**Base:** [plano-separacao-e-mobile.md](plano-separacao-e-mobile.md)
**Decisões confirmadas pelo usuário em 31/07/2026:**
separação por contrato (não por deploy), aplicativo sem regra de negócio
própria (espelho do web), e ordem fundação → PWA → aplicativo → produto.

---

## Regras válidas para os três agentes

1. **Trabalhe apenas nos arquivos listados em "Escopo exclusivo".** Tocar em
   arquivo de outro agente é o que quebra a paralelização.
2. **Não altere** `prisma/schema.prisma`, `package.json` ou
   `src/lib/prisma.ts` sem que o briefing autorize explicitamente. São recursos
   globais e serializados.
3. **Leia `AGENTS.md` e `docs/agents/current-handoff.md` antes de começar.**
4. **Nunca use o caractere U+2014 (travessão)** em código, comentário, texto de
   interface, documentação ou mensagem de commit.
5. **Entregue em branch própria**, com a suíte de testes passando, e **não faça
   merge na `main`**. Integração é decisão humana.
6. **Não invente decisão de produto.** O que não estiver definido aqui, pergunte
   antes de assumir.
7. **`tenant_id` nunca vem do client.** Continua sendo resolvido no servidor a
   partir da identidade. Qualquer desenho que quebre isso está errado, mesmo que
   funcione.

---

## Agente A1: identidade por token (caminho crítico)

### Objetivo

Permitir que o aplicativo autentique nas rotas `/api/v1/*` **já existentes**,
sem criar rotas paralelas e sem alterar nenhuma delas.

### Escopo exclusivo

```
src/lib/auth-token.ts                (novo)
src/lib/tenant-context.ts            (alterar getSessionUser)
src/app/api/v1/auth/token/**         (novo)
scripts/m23-token-auth.test.ts       (novo)
prisma/schema.prisma                 (AUTORIZADO: só o modelo RefreshToken)
src/lib/prisma.ts                    (AUTORIZADO: só registrar RefreshToken)
```

**Proibido tocar:** qualquer rota de negócio, `session-gate.ts`, handlers do
WhatsApp, `auth.config.ts` (a sessão web não muda).

### Decisões já tomadas (execute, não redecida)

- **Access token:** JWT, validade de **15 minutos**, assinado com segredo
  próprio (`MOBILE_JWT_SECRET`), **nunca** reusando `NEXTAUTH_SECRET`.
- **Refresh token:** opaco (não JWT), validade de **30 dias**, guardado com
  hash no banco, **uso único com rotação**: ao renovar, o antigo é invalidado e
  um novo é emitido.
- **Conteúdo do access token:** `user_id` e nada mais que seja usado como
  autoridade. **`tenant_id` não vai no token**, e se for incluído por
  conveniência, não pode ser lido como fonte de verdade: o tenant continua sendo
  resolvido no servidor a partir do `user_id`. Essa é a regra mais importante do
  projeto.
- **Modelo novo `RefreshToken`:** `tenant_id`, `user_id`, `token_hash`,
  `expires_at`, `revoked_at`, `created_at`. Entra em `TENANT_SCOPED_MODELS`.
- **Rotas:** `POST /api/v1/auth/token` (email e senha, devolve o par),
  `POST /api/v1/auth/token/refresh`, `POST /api/v1/auth/token/revoke`.
- **Rate limit** no login por token, reusando `checkLoginRateLimit` com escopo
  novo. A rota é pública e é alvo de força bruta.
- **O gate de sessão continua valendo.** Um usuário com `must_change_password`
  autentica, mas `guard()` segue barrando as rotas de negócio, exatamente como
  hoje. Não crie exceção.

### O seam

`getSessionUser()` passa a resolver identidade por **dois adapters**: cabeçalho
`Authorization: Bearer` primeiro, cookie de sessão depois. Os dois devolvem o
**mesmo** `SessionUser`. Nada além dessa função deve saber que existe token.

### Prova de entrega

`scripts/m23-token-auth.test.ts` demonstrando:

- login com senha correta devolve os dois tokens; senha errada não devolve nada;
- access token válido autentica uma rota `/api/v1` existente **sem alterá-la**;
- token expirado é recusado;
- refresh devolve par novo e **invalida o anterior** (uso único);
- refresh já usado é recusado;
- revogação derruba o acesso;
- token de um tenant não alcança dado de outro (isolamento);
- usuário com `must_change_password` autentica mas é barrado pelo gate.

---

## Agente A2: pacote de contratos

### Objetivo

Criar a fonte única de verdade dos formatos de entrada e saída da API, para o
aplicativo consumir com segurança de tipo, sem geração de código.

### Escopo exclusivo

```
packages/contracts/**        (novo, diretório inteiro)
tsconfig.json                (AUTORIZADO: só adicionar o path alias)
```

**Proibido tocar:** qualquer arquivo em `src/`. Nesta onda o pacote **apenas
declara** os contratos; a troca das rotas para usarem esses schemas vem depois,
para não colidir com A1.

### Decisões já tomadas

- **Sem dependências além do `zod`.** Nada de Prisma, nada de Next, nada de
  servidor. Se o pacote precisar de qualquer um deles, o desenho está errado.
- **Escopo desta onda:** autenticação, financeiro (lançamentos e pendências),
  alertas e usuários.
- **Rebanho fica de fora de propósito.** O modelo muda na Onda 3 (categoria e
  quantidade), e extrair contrato antes garante retrabalho.
- **Formato de envelope** já existente vira tipo genérico:
  `ApiOk<T> = { data: T; meta: Record<string, unknown> }` e
  `ApiError = { error: { code: string; message: string } }`.
- **Nomes seguem o contrato atual**, não uma versão idealizada. Se hoje o campo
  é `ear_tag`, continua `ear_tag`. Renomear é mudança de contrato e não está
  autorizada.

### Prova de entrega

- O pacote compila sozinho, sem o Next.
- Um arquivo de exemplo demonstra inferência de tipo a partir dos schemas.
- Uma verificação simples prova que os schemas aceitam os payloads reais
  documentados em `/docs/api`, e recusam os inválidos.

---

## Agente A3: aplicativo instalável (PWA)

### Objetivo

Tornar o painel web instalável na tela inicial, preparando o terreno para push
gratuito na Onda 2.

### Escopo exclusivo

```
src/app/manifest.ts          (novo)
public/icons/**              (novo)
public/sw.js                 (novo)
src/components/pwa/**        (novo)
src/app/layout.tsx           (AUTORIZADO: só registrar o service worker)
```

**Proibido tocar:** rotas, actions, autenticação.

### Decisões já tomadas

- **Cores da marca:** `#2E7D32` (primária) e `#1B5E20` (escura), já definidas em
  `tailwind.config.ts`. Ícones gerados a partir delas; se precisar de arte
  definitiva, sinalize e siga com um provisório.
- **Nome de instalação:** "Tibé". Nome curto: "Tibé".
- **O service worker desta onda cuida apenas de recursos estáticos e da tela de
  offline.** **Não** faça cache de resposta de `/api/v1`. Guardar resposta
  autenticada em cache do navegador é risco de vazamento entre usuários no mesmo
  aparelho, e não vale o ganho.
- **Push não entra nesta onda.** Entra na Onda 2, junto com o seam de
  notificação. Deixe o terreno pronto, sem implementar.
- **Convite de instalação discreto**, dispensável e que não reaparece depois de
  recusado.

### Prova de entrega

- Auditoria de PWA do navegador reconhece o aplicativo como instalável.
- Instala em Android e abre em tela cheia.
- Com a rede desligada, uma tela de offline aparece em vez de erro do navegador.
- Nenhuma resposta de API aparece no cache.

---

## Sistema de design: adiado para a Onda 3

O usuário enviou a identidade visual em `docs/idVisual/` (logo e mockup de
dashboard) e pediu a adopção do shadcn. **Decidiu-se aplicar isso na Onda 3**,
com o argumento de que visual novo sobre rotas que ainda vão mudar é retrabalho.

Registrado para quem for executar depois:

- **A paleta muda.** Hoje o sistema usa `#2E7D32` e `#1B5E20`. A identidade nova
  é mais escura e inclui **laranja como cor de ação**, que hoje não existe.
  Valores estimados do JPEG: verde escuro `#12321F`, verde médio `#5A9E2F`,
  laranja `#F07A1F`, fundo `#F7F6F2`. Pedir os valores exatos da marca antes de
  fixar tokens.
- **`npx shadcn@latest init` trava neste ambiente** esperando prompt interativo
  (registrado no `CLAUDE.md`). Usar as flags não interativas; se ainda travar,
  seguir manualmente, que foi como os componentes atuais nasceram.
- **O mockup mostra a navegação do documento do cliente** (Início, Minha
  Fazenda, Meu Dia, Calculadora Pecuária, Fazenda em Números, WhatsApp), não a
  atual. Reestruturar navegação é mudança de produto e pertence às tarefas de
  rebanho e áreas novas, não ao agente de design.

## Ponto de integração da Onda 1

A Onda 2 só começa quando: **o aplicativo autentica com token e lê uma rota
protegida real**, o pacote de contratos compila isolado, e o painel instala como
aplicativo.

Até lá, nada é integrado na `main`.
