---
paths:
  - "src/app/api/v1/signup/**"
  - "src/app/api/v1/password-reset/**"
  - "src/app/api/v1/auth/**"
  - "src/lib/actions/signup-flow.ts"
  - "src/lib/actions/password-reset.ts"
  - "src/app/(public)/criar-conta/**"
  - "src/app/(public)/esqueci-senha/**"
---
<!-- Carrega sozinho ao ler um arquivo que casa com os globs acima.
     As 4 etapas do cadastro verificado, por que verificar antes de criar o tenant, e as duas trocas de senha deliberadamente separadas. -->

## Signup público (`/planos` + `/criar-conta`): fora do escopo original do PRD

O PRD §12 marca "onboarding self-service completo" como **fora do MVP** (v1.1).
Ainda assim, existe hoje um fluxo de signup público real, construído a pedido
explícito do usuário para destravar testes do painel antes dos módulos
4-5-6:

- `/planos`: preços **reais** (`PLAN_PRICES` em `src/lib/asaas.ts`: campo
  R$97, fazenda R$197, grupo R$397: a mesma constante usada para criar a
  assinatura no Asaas, nunca duplique o número), cada plano linkando para
  `/criar-conta?plan=campo|fazenda|grupo`.
- `/criar-conta`: formulário completo (empresa, CNPJ/CPF, telefone,
  responsável, email, senha) → `POST /api/v1/signup` (única rota `/api/v1`
  que roda **sem sessão**, por natureza: ainda não existe usuário). Cria
  `Tenant` (status **trial**, `plan` = o card clicado, `trial_ends_at` = agora
  + `TRIAL_DAYS`: `src/lib/billing-access.ts`, 14 dias) + `User` (role
  `OWNER`) de verdade, com checagem de documento/email duplicado. O client
  faz login automático (`signIn` do NextAuth) logo em seguida e manda para
  `/dashboard`, que redireciona ao onboarding existente (sem `TenantProfile`
  ainda).
- **Sem rate limiting** (não há fila/Redis conectado a esta rota): gap
  conhecido, aceitável para uso controlado de testes, mas revisar antes de
  divulgar publicamente.
- Este fluxo continua sendo a forma **pública** de criar tenant (ver também a
  criação manual pelo painel da plataforma, descrita abaixo): o Módulo 5 não
  o substituiu (a spec 5.11 previa um trial passwordless via WhatsApp, mas
  isso exigiria N8N em produção; decisão do usuário foi manter `/criar-conta`
  como está e reusá-lo como CTA da home pública).

**Segunda exceção deliberada (spec 2026-07-24):** `master_admin` também pode
criar um `Tenant` manualmente pelo painel da plataforma (`POST /api/platform/tenants`,
botão "Criar tenant" em `/plataforma/tenants`): usado para dar acesso de teste
a equipes de cliente sem passar pelo formulário público. Reusa a mesma lógica
de `/api/v1/signup` (trial, checagem de duplicidade), mas gera senha temporária
em vez de receber uma, e marca `User.must_change_password: true`: o usuário é
obrigado a trocar a senha em `/trocar-senha` (gate em `(dashboard)/layout.tsx`
e `onboarding/page.tsx`, usa `getTenantDb()` client escopado, não o client base)
antes de acessar qualquer outra coisa. O convite de usuário do Módulo 5
(`inviteUserAction`) não tem esse gate: continua como estava.

---

## Cadastro público verificado (Módulo 19, 2026-07-30)

`/criar-conta` deixou de criar conta num passo só. Agora são 4 etapas, com
**WhatsApp e email verificados antes de `Tenant`/`User` existirem**. Spec:
[docs/specs/module-19-cadastro-verificado.md](docs/specs/module-19-cadastro-verificado.md).

- **Por que verificar antes de criar:** os alertas de vencimento saem por esses
  dois canais, e o usuário exigiu que sejam defensáveis. Além disso, criar o
  tenant antes contaminaria os KPIs do painel da plataforma (todo cadastro
  abandonado viraria trial no funil e no churn) e travaria o CPF/CNPJ do dono
  real com "já existe uma conta".
- **`PendingSignup`** (modelo novo) guarda o cadastro em andamento. **Fora de
  `TENANT_SCOPED_MODELS` por necessidade estrutural**: o tenant ainda não
  existe. Mesma categoria de `PlatformUser` e `WhatsAppProviderConfig`. Expira
  em 60 minutos e é varrido por `purgeExpiredSignups()`, chamado pelo cron
  diário que já existia: dado pessoal de quem nunca virou cliente não fica
  guardado.
- **O id do cadastro viaja em cookie httpOnly** (`src/lib/signup-cookie.ts`),
  nunca na URL: lá ele ficaria no histórico e em log de referrer, e quem
  tivesse o id poderia trocar o email de destino antes da verificação.
- **Código:** 6 dígitos com hash, validade de 10 minutos, máximo 5 tentativas.
  O botão de corrigir o destino aparece aos 2 minutos: são **dois cronômetros
  diferentes** de propósito, amarrar os dois faria quem digita devagar perder
  um código válido. Código errado, expirado e ausente respondem igual.
- **Limite de envio é segurança, não otimização:** a rota dispara WhatsApp para
  qualquer número, sem login. Limitado por destino e por origem
  (`checkLoginRateLimit`, escopos `signup-send` e `signup-start`).
- **Ordem é obrigatória** (WhatsApp, depois email) e o servidor recusa o
  contrário. Trocar o destino de um canal **derruba a verificação dele**:
  verificamos o contato, não a intenção de quem preencheu.
- **Retomada:** voltar com o mesmo CPF/CNPJ enquanto o cadastro pendente vive
  cai direto na etapa que faltava.
- **Senha:** não é mais digitada no cadastro. Na conclusão nasce uma temporária,
  enviada pelos dois canais e devolvida na resposta só para o login automático,
  com `must_change_password: true`.
- **Duas trocas de senha, deliberadamente separadas em rotas diferentes:**
  `POST /api/v1/auth/change-password` (obrigatória, **sem** senha atual, porque
  a posse dos canais acabou de ser provada) e
  `POST /api/v1/auth/change-password-self` (voluntária, **com** senha atual,
  porque aí o risco é sessão aberta em máquina destravada). Juntar as duas numa
  rota com campo opcional criaria um caminho para pular a exigência. A página
  `/configuracoes/senha` é acessível a **qualquer papel**: trocar a própria
  senha não é privilégio de Owner/Admin.
- **`POST /api/v1/signup` (um passo) foi removido.** Dois caminhos públicos de
  criação de conta, um sem verificação, anulariam o módulo.
- **`/criar-conta` virou PREFIXO** em `PUBLIC_PREFIXES` (`auth.config.ts`): as
  etapas são sub-rotas, e como caminho exato o middleware mandaria o visitante
  para `/login` no meio do cadastro. Mesma armadilha já documentada para
  `/docs` e `/sitemap.xml`.
- **Sessão de 7 dias** nas duas instâncias NextAuth, substituindo o default
  herdado de 30 dias, que nunca foi decisão. **Não** existe "manter conectado":
  a promessa de "fechou a aba, pede senha" não se sustenta (cookie de sessão
  morre com o navegador, não com a aba, e o Chrome restaura), quase não se
  aplica no celular, e exigiria código customizado na camada mais sensível.
- **`dispatchEmail()`** (`src/lib/email-send.ts`) envia **sem** gravar
  `EmailLog`, e existe só para o código de verificação, que acontece antes de
  haver tenant a que atribuir o log. Para mensagem a cliente já cadastrado use
  `sendEmail()`: lá o rastro auditável é o ponto.

---

## Recuperação de senha (arquitetura 2026-07-29)

Só para `User` de tenant (`PlatformUser` fica de fora, deliberado: conta
sensível demais pra self-service, equipe pequena da Pleno). 3 etapas, 3
páginas standalone (mesmo padrão de `/trocar-senha`/`/escolher-plano`,
fora de `(dashboard)`/`(auth)`, em `PUBLIC_PREFIXES`):

- **`/esqueci-senha`** (email + escolha do canal) → `POST
  /api/v1/password-reset/request`. Resposta **sempre genérica**
  (`{ requested: true }`), exista ou não a conta, tenha ou não telefone pro
  canal WhatsApp: proteção contra enumeração de conta. Rate limit
  (`checkLoginRateLimit`, scope `password-reset-request`, 3/hora por email)
  aplicado **antes** da busca pelo usuário, mesmo motivo. As etapas 1 e 2
  são correlacionadas pelo **email** (que o usuário já sabe), nunca pelo id
  do `PasswordResetCode`: criar esse id só quando a conta existe vazaria a
  existência dela pela presença/ausência de um `rid` na resposta.
- **`/esqueci-senha/verificar?email=`** (código de 6 dígitos, expira em 10
  minutos, máx. 5 tentativas por código) → `POST
  /api/v1/password-reset/verify`. Conta inexistente e código errado
  devolvem o **mesmo** `INVALID_CODE`, sem diferenciar. Sucesso marca
  `PasswordResetCode.verified_at` e devolve o `id` da linha (`rid`). Só
  **aqui** que o id vira referência: nesse ponto a existência da conta já
  está inerentemente provada (não dá pra validar um código de uma conta que
  não existe), não tem mais nada a esconder.
- **`/esqueci-senha/nova-senha?rid=`** (nova senha + confirmação, regra
  forte) → `POST /api/v1/password-reset/confirm`. Exige `verified_at`
  preenchido e `consumed_at` nulo (não deixa reusar o mesmo código validado
  duas vezes); zera `must_change_password` (quem provou posse do
  email/WhatsApp já pode entrar direto, sem gate adicional); redireciona
  pro `/login`.
- **`isStrongPassword()`** (`src/lib/passwords.ts`, mín. 8 caracteres +
  maiúscula + número + símbolo): aplicada aqui e em `changeOwnPasswordAction`
  (troca obrigatória da senha temporária), mas **não** aplicada no signup
  público (`/criar-conta`), decisão deliberada de escopo, não assumida.
- **`checkLoginRateLimit`** (`src/lib/rate-limit.ts`) ganhou um 3º parâmetro
  opcional (`{ windowSeconds, maxAttempts }`) pra sustentar o limite mais
  restritivo do pedido de código sem afetar o padrão dos 2 logins (10
  tentativas/15min, inalterado).
- **`test:m16`** cobre a lógica toda (código certo/errado/expirado, limite
  de tentativas, rate limit, `isStrongPassword()`, reuso de `rid` já
  consumido) sem depender de entrega real. Validado também ponta a ponta
  num navegador real (`browser-harness`): pedir código → email de verdade
  chegou → validar → nova senha → login com a senha nova funcionou.
