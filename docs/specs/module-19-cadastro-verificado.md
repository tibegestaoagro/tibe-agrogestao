# Módulo 19: Cadastro público verificado em 4 etapas

**Status:** especificado, decisões fechadas com o usuário em 2026-07-30.
Implementação a seguir. Todas as ambiguidades foram resolvidas em entrevista,
então **não é necessário perguntar de novo** o que está decidido aqui.

---

## 1. Objetivo

Hoje `/criar-conta` cria a conta num único passo, com senha digitada pelo
usuário, **sem verificar email nem telefone**. Nada garante que os contatos
existem. Isso quebra a promessa central do produto: os alertas de vencimento
saem por WhatsApp e email, e o usuário exigiu que esses avisos sejam
defensáveis ("judicialmente é importante").

O cadastro passa a ter 4 etapas, com os dois canais verificados **antes** de a
conta existir, e a senha deixa de ser digitada no cadastro: passa a ser
temporária, enviada pelos canais já verificados, com troca obrigatória.

## 2. Fluxo decidido

1. **Etapa 1, formulário:** nome da empresa, nome do responsável, email,
   CPF/CNPJ, WhatsApp. O plano continua vindo do card clicado em `/planos`
   (`/criar-conta?plan=campo|fazenda|grupo`). Duplicidade de documento e email
   é checada **aqui**, para o usuário não verificar o WhatsApp e só depois
   descobrir que o CPF já existe.
2. **Etapa 2, verificar WhatsApp:** código de 6 dígitos. Aos 2 minutos aparece
   a opção de corrigir o número e reenviar. A mensagem pede para salvar o
   número como contato, para as mensagens seguintes chegarem bem.
3. **Etapa 3, verificar email:** mesmo mecanismo, com aviso de conferir spam e
   lixo eletrônico. Também permite corrigir o endereço e reenviar.
4. **Etapa 4, conclusão:** `Tenant` e `User` são criados, uma senha temporária
   é enviada pelos **dois** canais, e o usuário entra no painel já autenticado,
   caindo na troca obrigatória de senha.

## 3. Decisões fechadas (não reabrir sem pedir)

1. **Os dois canais são obrigatórios.** Sem WhatsApp e email verificados, não
   existe conta. Corrigir o destino e reenviar é ilimitado dentro do limite de
   taxa; adiar a verificação não é uma opção, porque contas com email não
   confirmado são exatamente o problema que motivou o módulo.
2. **`Tenant` e `User` só nascem no fim.** Entre as etapas os dados ficam em
   `PendingSignup` (tabela nova). Criar o tenant antes contaminaria os KPIs do
   painel da plataforma (todo cadastro abandonado viraria trial no funil e no
   churn) e travaria o CPF/CNPJ do dono real com "já existe uma conta".
3. **`PendingSignup` expira e é varrido.** Cadastro abandonado não vira lead:
   o usuário foi explícito que contato não validado não serve para disparo,
   então guardar nome, CPF e telefone de quem nunca virou cliente é passivo de
   LGPD sem contrapartida.
4. **Dois campos de nome** (empresa e responsável), não um. Planos maiores vão
   liberar equipe, e `User.name` mais telefone por usuário são carga estrutural:
   é assim que `resolve-contact` descobre **quem** está falando no WhatsApp e
   aplica a permissão da role certa.
5. **Código:** 6 dígitos, guardado com hash, validade de **10 minutos**,
   máximo **5 tentativas** por código. O botão de corrigir o destino aparece
   aos **2 minutos**. São dois cronômetros diferentes de propósito: amarrar os
   dois no mesmo valor faria quem digita devagar perder um código válido.
6. **Limite de envio é requisito de segurança, não otimização.** A rota dispara
   WhatsApp para qualquer número digitado, **sem login**. Sem limite ela vira
   ferramenta de perturbação (enfileirar o número de um desafeto) e custo de
   envio. Limitar por destino e por origem da requisição.
7. **Senha temporária enviada pelos dois canais** e devolvida na resposta da
   conclusão, para o login automático. O usuário nunca precisa digitá-la nesse
   momento. Precedente: `createTenantManuallyAction` já devolve `temp_password`.
8. **Troca obrigatória sem "senha atual".** As duas verificações acabaram de
   provar posse dos canais; pedir a temporária em seguida é a mesma prova duas
   vezes, só com atrito. Usa a página `/trocar-senha` que já existe e já está
   ligada ao `session-gate` (não vira modal: menos peça nova, e uma modal
   fechada por engano não pode virar bypass).
9. **Troca voluntária, depois, no perfil: com "senha atual".** Aí o campo
   protege de verdade, porque o cenário é uma sessão aberta num computador
   destravado.
10. **Retomar de onde parou.** Fechou o navegador na etapa 3 e voltou com o
    mesmo CPF/CNPJ enquanto o cadastro pendente ainda é válido: cai direto na
    etapa que faltava, sem refazer o WhatsApp.
11. **Sessão: `maxAge` de 7 dias** nas duas instâncias NextAuth (tenant e
    plataforma), substituindo o default herdado de 30 dias. **Sem "manter
    conectado"**: a promessa de "fechou a aba, pede senha" não se sustenta
    (cookie de sessão morre com o navegador, não com a aba, e o "continuar de
    onde parei" do Chrome restaura), quase não se aplica no celular, que é onde
    o usuário está, e exigiria código customizado na parte mais sensível do
    app. Fica como rodada própria se ainda fizer falta.
12. **O `POST /api/v1/signup` de um passo deixa de existir.** Manter dois
    caminhos públicos de criação de tenant, um deles sem verificação, anularia
    o módulo.

## 4. Regra de escrita permanente

Nunca use o caractere U+2014 (travessão) em código, comentário, texto de
interface, resposta do agente, documentação ou mensagem de commit. Use dois
pontos, vírgula ou parênteses.

## 5. Modelo de dados

`PendingSignup` (novo). **Fora de `TENANT_SCOPED_MODELS`**, e isso é
estrutural, não esquecimento: o tenant ainda não existe quando a linha é
criada. Mesma categoria de `PlatformUser` e `WhatsAppProviderConfig`. Todo
acesso usa o client base, sempre pelo `id` da própria linha (nunca por email ou
telefone vindos do client sem code).

Campos: `id`, `company_name`, `owner_name`, `owner_email`, `document`, `phone`,
`plan`, UTM (`utm_source`, `utm_medium`, `utm_campaign`),
`whatsapp_code_hash`, `whatsapp_code_expires_at`, `whatsapp_attempts`,
`whatsapp_verified_at`, `email_code_hash`, `email_code_expires_at`,
`email_attempts`, `email_verified_at`, `created_at`, `expires_at`.

`document` tem índice único parcial? **Não**: dois cadastros pendentes com o
mesmo documento são possíveis em corrida, e a checagem de duplicidade real
acontece contra `Tenant` na etapa 1 e de novo na conclusão. A retomada busca o
pendente mais recente e não vencido.

## 6. Superfície HTTP

Todas públicas (sem sessão, por natureza), contrato `{ data, meta }` /
`{ error }`.

- `POST /api/v1/signup/start`: valida, checa duplicidade contra `Tenant`/`User`,
  cria (ou retoma) o `PendingSignup`, dispara o código de WhatsApp. Devolve o
  estado das etapas. O `id` vai num **cookie httpOnly**, nunca na URL nem no
  corpo, para não vazar no histórico do navegador nem em log de referrer.
- `POST /api/v1/signup/verify`: `{ channel: "whatsapp" | "email", code }`.
  Quando o **segundo** canal é verificado, cria `Tenant` + `User`
  (`must_change_password: true`), envia a senha temporária pelos dois canais,
  limpa o `PendingSignup` e devolve `{ email, temp_password }` para o login
  automático.
- `POST /api/v1/signup/resend`: `{ channel, destination? }`. Com `destination`,
  corrige o número ou o email antes de reenviar. Só é permitido para um canal
  **ainda não verificado**.
- `GET /api/v1/signup/state`: estado das etapas, para as páginas renderizarem o
  passo certo na retomada.

Erros: `INVALID_CODE` (código errado, expirado ou canal inexistente, sem
diferenciar), `TOO_MANY_ATTEMPTS`, `RATE_LIMITED`, `DUPLICATE_DOCUMENT`,
`DUPLICATE_EMAIL`, `SIGNUP_EXPIRED`.

## 7. Páginas

- `/criar-conta`: etapa 1 (existe, perde os campos de senha).
- `/criar-conta/whatsapp`: etapa 2.
- `/criar-conta/email`: etapa 3.

As três precisam estar cobertas por `PUBLIC_PREFIXES` em `auth.config.ts`,
senão o middleware redireciona para `/login` antes de renderizar (mesma
armadilha já documentada para `/docs` e `/sitemap.xml`). Servidor decide o
passo pelo cookie; sem cookie válido, volta para a etapa 1.

## 8. Tasks, na ordem

1. `PendingSignup` no schema + migração (local primeiro, Neon só com
   autorização). Registrar a exceção de isolamento em `CLAUDE.md`/`AGENTS.md`.
2. `src/lib/actions/signup-flow.ts`: `startSignupAction`,
   `verifySignupCodeAction`, `resendSignupCodeAction`, `getSignupStateAction`,
   `purgeExpiredSignups`. Toda a regra vive aqui, rotas são wrappers finos.
3. Rotas do item 6, com rate limit (`checkLoginRateLimit` com escopos novos).
4. Páginas do item 7, com o contador de 2 minutos e a correção de destino.
5. Envio: reusar `sendWhatsAppMessage` e `sendEmail`. Template novo de código
   de verificação nos dois canais, e o de senha temporária na conclusão.
6. `maxAge: 7 dias` em `auth.config.ts` e `platform-auth.config.ts`.
7. Troca voluntária de senha com "senha atual" na área de configurações.
8. Purga de `PendingSignup` vencido no cron diário que já existe.
9. Remover `POST /api/v1/signup`, atualizar `/docs/api` e o teste `m5` que o
   usa.
10. `scripts/m19-cadastro-verificado.test.ts` + `npm run test:m19`.

## 9. Critérios de aceitação

1. Não existe caminho público que crie `Tenant` sem os dois canais verificados.
2. Cadastro abandonado não cria `Tenant` nem trava o CPF/CNPJ, e desaparece na
   purga.
3. Código errado, expirado e canal inexistente devolvem a mesma resposta.
4. Estourar o limite de tentativas invalida o código, não a conta.
5. Reenvio e correção de destino respeitam o limite por destino e por origem.
6. O usuário chega ao painel autenticado e **não consegue** navegar sem trocar
   a senha temporária.
7. Sessão expira em 7 dias nas duas instâncias.
8. Nenhum travessão introduzido.
