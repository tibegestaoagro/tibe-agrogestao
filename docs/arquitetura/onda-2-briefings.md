# Onda 2: briefings dos agentes

**Agentes desta onda: B1, B2 e B3.**

**Base:** [plano-separacao-e-mobile.md](plano-separacao-e-mobile.md)
**Decisões confirmadas pelo usuário em 01/08/2026:** resumo diário sai por
push com WhatsApp como reforço (não fica no escopo original de B3, que
previa WhatsApp); app mobile fica standalone nesta onda, sem consumir
`packages/contracts` ainda; os três agentes disparam em paralelo.

**Preparo feito antes de disparar (fora do escopo dos agentes):** o node
`Separar Respostas` do workflow n8n já foi corrigido para consolidar
respostas de múltiplas intenções numa única mensagem, em vez de uma por
assunto. Isso já está em produção e não precisa ser refeito por nenhum
agente.

---

## Regras válidas para os três agentes

1. **Trabalhe apenas nos arquivos listados em "Escopo exclusivo".** Tocar em
   arquivo de outro agente é o que quebra a paralelização.
2. **Não altere** `prisma/schema.prisma`, `src/lib/prisma.ts` ou
   `package.json` fora do que o briefing autoriza explicitamente.
3. **Leia `AGENTS.md` e `docs/agents/current-handoff.md` antes de começar.**
4. **Nunca use o caractere U+2014 (travessão)** em código, comentário, texto
   de interface, documentação ou mensagem de commit.
5. **Entregue em branch própria**, com a suíte de testes passando, e **não
   faça merge na `main`**. Integração é decisão humana.
6. **Não invente decisão de produto.** O que não estiver definido aqui,
   pergunte antes de assumir.
7. **`tenant_id` nunca vem do client.** Continua sendo resolvido no servidor
   a partir da identidade (cookie ou token). Qualquer desenho que quebre
   isso está errado, mesmo que funcione.
8. **Não edite o workflow n8n diretamente.** Se algo exigir mudança no n8n,
   documente o que precisa mudar e sinalize: a edição é feita por fora,
   depois de revisão (é estado vivo compartilhado, não arquivo do repo).

---

## Agente B1: seam de notificação (push, WhatsApp, email) e resumo diário

### Objetivo

Dar ao alerta existente um terceiro canal (push, gratuito) e construir o
resumo diário proativo por push, sem enfraquecer a garantia de comprovação
que os alertas críticos já têm por WhatsApp/email.

### Escopo exclusivo

```
src/lib/notify/**                              (novo)
src/lib/actions/alert-delivery.ts              (refatorar para usar notify())
public/sw.js                                   (AUTORIZADO: só adicionar push/notificationclick)
src/components/pwa/**                          (AUTORIZADO: só um novo componente de opt-in)
src/app/(dashboard)/layout.tsx                 (AUTORIZADO: só renderizar o opt-in)
src/app/api/v1/notifications/**                (novo: subscribe/unsubscribe)
src/app/api/internal/jobs/daily-digest/**      (novo)
scripts/m24-notificacoes.test.ts               (novo)
prisma/schema.prisma                           (AUTORIZADO: só o modelo PushSubscription)
src/lib/prisma.ts                              (AUTORIZADO: só registrar PushSubscription)
package.json                                   (AUTORIZADO: dependência web-push + @types/web-push, script test:m24)
vercel.json                                    (AUTORIZADO: só adicionar o cron do daily-digest)
.env.example                                   (AUTORIZADO: só as 3 variáveis VAPID)
```

**Proibido tocar:** `whatsapp-handlers/**`, `agent-flows.ts`,
`whatsapp-flow-bridge.ts`, `apps/mobile/**`. Pode **importar/chamar** funções
já exportadas de `financial-reports.ts`, `financial-summary.ts` e
`animals.ts` para montar o conteúdo do resumo, mas não as edite.

### Decisões já tomadas (execute, não redecida)

- **`notify(recipient, content, urgency)`** é a interface nova, em
  `src/lib/notify/`. Quem chama não escolhe canal: a política mora dentro do
  módulo. Dois níveis de urgência nesta onda:
  - **`critical`** (os 5 `AlertType` que já existem: `bill_due`,
    `trial_ending`, `low_balance`, e os demais): tenta **push E WhatsApp E
    email em paralelo**, exatamente como hoje faz WhatsApp+email. Continua
    `sent` assim que **qualquer** canal entregar. Push é aditivo aqui, não
    substitui nada: os alertas existem para comprovação (exigência explícita
    do usuário já registrada no projeto), e isso não pode enfraquecer.
  - **`digest`** (resumo diário, novo): tenta **push primeiro**; só tenta
    WhatsApp se o destinatário **não tiver nenhuma inscrição de push ativa**.
    **Não envia por email.** Um resumo diário todo dia por email é ruído,
    diferente de um alerta pontual.
  - `alert-delivery.ts` é refatorado para chamar `notify()` no lugar das
    chamadas diretas a `sendWhatsAppMessage`/`sendEmail` que já tem.
- **Destinatário de `critical` continua sendo o mesmo de hoje**
  (`findAlertRecipient`: OWNER ativo, senão ADMIN ativo). Push, porém, é por
  **inscrição**, não por usuário único: se mais de um usuário do tenant
  ativar notificação no próprio aparelho, todos recebem. Isso é uma
  consequência natural do modelo de push, não uma decisão nova a validar.
- **Modelo novo `PushSubscription`:** `tenant_id`, `user_id`, `endpoint`
  (único), `p256dh`, `auth`, `created_at`. Entra em `TENANT_SCOPED_MODELS`.
  Sem tabela de log de entrega separada: push não tem o mesmo requisito de
  comprovação que WhatsApp/email já cobrem para os alertas críticos.
- **`POST /api/v1/notifications/subscribe`** (autenticado, `guard()` padrão,
  grava a inscrição do usuário logado) e **`DELETE
  /api/v1/notifications/subscribe`** (remove pelo endpoint). Front-end: um
  componente pequeno e discreto pedindo permissão, no mesmo espírito do
  convite de instalação do PWA (dispensável, não insiste se recusado).
- **`public/sw.js`** ganha um listener de evento `push` (mostra a
  notificação do sistema) e `notificationclick` (foca/abre o painel).
  **Nenhuma mudança na política de cache existente** (continua sem cachear
  `/api/v1`).
- **Resumo diário: conteúdo.** Reaproveite as mesmas funções que
  `whatsapp-handlers/resumo.ts` já usa (`listUpcomingVaccinations`,
  `listPendingEntries`, `getBalanceAction`, contagem de `Alert` pendente),
  não duplique a query. O corpo da notificação é curto (uma notificação do
  sistema não é uma mensagem de WhatsApp): uma linha resumindo o que
  importa, que ao clicar abre o painel. Não precisa cobrir rebanho/lavoura/
  prestador com o mesmo detalhe do `resumo` interativo.
- **Resumo diário: gatilho.** Novo cron da Vercel em `vercel.json`, mesmo
  padrão de `/api/internal/jobs/generate-alerts` (autenticado por
  `CRON_SECRET`, o mesmo mecanismo, já existe). Sugestão de horário: `0 11
  * * *` (08h em Brasília), fora do horário do job de alertas. **Confirme
  antes de configurar** se o plano da Vercel do projeto comporta um segundo
  cron (o job de alertas já ocupa um); se não comportar, sinalize em vez de
  forçar.
- **Chaves VAPID:** gere com `npx web-push generate-vapid-keys` (do próprio
  pacote `web-push` que você vai instalar). Documente as 3 variáveis
  (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) em
  `.env.example`, mas **não** tem como configurar o valor real na Vercel
  sozinho: isso fica para depois da integração, o mesmo tratamento que
  `MOBILE_JWT_SECRET` recebeu na Onda 1.

### Prova de entrega

`scripts/m24-notificacoes.test.ts` demonstrando:

- inscrição de push é salva e escopada por tenant/usuário;
- um alerta `critical` chama os 3 canais e fica `sent` com qualquer um
  respondendo ok (incluindo o caso de push falhar mas WhatsApp/email
  funcionarem, como já é hoje);
- o resumo diário tenta push e só cai para WhatsApp quando não há inscrição
  ativa, e nunca dispara email;
- o cron do resumo diário não dispara duas vezes no mesmo dia (mesmo padrão
  de lock do `generate-alerts`);
- isolamento: inscrição de um tenant nunca aparece na consulta de outro.

Validação manual (não dá para automatizar entrega real de push): registrar
uma inscrição de verdade no navegador e confirmar que a notificação chega.

---

## Agente B2: esqueleto do aplicativo mobile (Expo)

### Objetivo

Um aplicativo Expo que autentica com o token da Onda 1 e mostra dados reais
de pelo menos duas telas. Sem regra de negócio própria: é um cliente a mais
do mesmo seam que a web já usa.

### Escopo exclusivo

```
apps/mobile/**        (novo, diretório inteiro, projeto Expo próprio)
```

**Proibido tocar:** qualquer arquivo fora de `apps/mobile/`. Em particular,
**não** toque em `package.json` da raiz, `tsconfig.json` da raiz, nem crie
campo `workspaces`: nesta onda o app é standalone por decisão do usuário.

### Decisões já tomadas

- **Standalone, sem `packages/contracts`.** O app chama a API REST direto
  (`https://tibe-agrogestao.vercel.app/api/v1/...` em produção, URL
  configurável para apontar num `next dev` local durante desenvolvimento) e
  declara seus próprios tipos leves, espelhando o contrato **real** das
  rotas hoje (não uma versão idealizada). Compartilhar tipos com
  `packages/contracts` fica para quando o app tiver mais telas.
- **Scaffold:** `npx create-expo-app@latest` com template TypeScript,
  **Expo Router** para navegação (é o padrão atual do Expo, e o time já
  conhece roteamento por arquivo do Next).
- **Autenticação:** tela de login chama `POST /api/v1/auth/token` (já
  existe, da Onda 1). Guarde o refresh token com `expo-secure-store`
  (**nunca** `AsyncStorage` puro: refresh token de 30 dias em storage não
  criptografado é uma exposição real num aparelho perdido/roubado). Ao
  expirar o access token (15min), chame `POST /api/v1/auth/token/refresh` e
  substitua os dois tokens pelo par novo (uso único, com rotação: é assim
  que a API já funciona, não é uma escolha do app).
- **`tenant_id` nunca aparece no app como fonte de verdade de nada.** O
  token só carrega `user_id`; o servidor resolve o tenant. Se você sentir
  necessidade de guardar um `tenant_id` no app "só para exibir o nome da
  fazenda", busque o nome de uma rota autenticada, não derive de nada local.
- **Telas desta onda (leitura apenas):** Início (um resumo simples: nome do
  usuário/fazenda, saldo do mês), Rebanho (lista, usando o endpoint que a
  web já usa), Contas a pagar e a receber (mesma fonte de dado do `resumo`
  financeiro). Nenhuma tela de escrita nesta onda.
- **Sem push nativo nesta onda.** Fica para a Fase 2 mais adiante (Push
  nativo depende de credencial Apple/Google que ainda não foi provisionada,
  categoria de tarefa parecida com a verificação de negócio na Meta).

### Prova de entrega

- App abre no Expo Go (ou build de desenvolvimento), tela de login funciona
  contra a API real (dev local ou produção).
- Login com credencial errada mostra erro; credencial certa entra e mantém
  sessão depois de fechar e reabrir o app (refresh funcionando).
- As 3 telas mostram dado real de um tenant de teste, não mock.
- Trocar de usuário (logout/login com outra conta) nunca mistura dado de um
  tenant com o de outro.

---

## Agente B3: cadastro guiado mais curto

### Objetivo

Reduzir o número de mensagens que o cadastro assistido (`cadastrar_animal`)
troca com o cliente, sem perder a etapa de confirmação antes de salvar.

### Escopo exclusivo

```
src/lib/actions/agent-flows.ts           (alterar)
src/lib/actions/whatsapp-flow-bridge.ts  (alterar)
scripts/m21-cadastro-assistido.test.ts   (atualizar)
scripts/m22-fluxo-integracao.test.ts     (atualizar)
scripts/m25-cadastro-mais-curto.test.ts  (novo, só se algum cenário não couber nos dois acima)
```

**Proibido tocar:** `whatsapp-handlers/**` (é outro conjunto de intenções,
não faz parte do cadastro guiado), `alert-delivery.ts`, qualquer arquivo de
`apps/mobile/`. Se precisar de um `test:m25` novo em `package.json`,
adicione **só essa linha**: conflito de merge nesse arquivo com o B1 é
esperado e trivial de resolver na integração, não bloqueia o seu trabalho.

### Decisões já tomadas (execute, não redecida)

- **O que muda:** hoje o fluxo pergunta um campo por vez (brinco, depois
  raça, depois sexo), até 4 idas e vindas por animal contando a
  confirmação final. Passa a **perguntar os 3 campos numa única mensagem**
  de abertura ("Me diga o brinco, a raça e o sexo, um por linha ou separado
  por vírgula"), reduzindo o caminho feliz para 2 mensagens (pergunta única
  + confirmação).
- **Resposta parcial continua funcionando.** Se o cliente responder só um
  campo (hábito antigo, ou porque só sabe um dado agora), o fluxo cai de
  volta no comportamento atual de perguntar o que falta, campo a campo. A
  mudança é só na **pergunta de abertura**, não uma exigência nova de
  resposta.
- **A confirmação final não é removida.** É a rede de segurança contra erro
  de leitura/transcrição; encurtar mensagem não vale o risco de salvar dado
  errado sem revisão. Só a fase de coleta encurta.
- **`splitValues()` já existe e já lida com múltiplos itens numa resposta**:
  reaproveite, não recrie.
- **Multi-animal continua igual**: se o cliente disse "quero cadastrar 3
  bois", o fluxo ainda itera por `target_count`, só que cada iteração agora
  abre com a pergunta consolidada em vez de campo a campo.

### Prova de entrega

Atualize `scripts/m21-cadastro-assistido.test.ts` e
`scripts/m22-fluxo-integracao.test.ts` (ou adicione `m25` se necessário)
cobrindo:

- pergunta de abertura pede os 3 campos de uma vez;
- resposta com os 3 valores numa mensagem só (vírgula ou linha) preenche o
  item e vai direto para a confirmação (ou para o próximo item, se
  `target_count > 1`);
- resposta com só 1 ou 2 campos ainda funciona, perguntando o que falta;
- confirmação final continua obrigatória antes de salvar;
- as duas regressões já corrigidas nesta sessão continuam cobertas: "macho"
  por áudio com pontuação sobrando, e mensagem com múltiplos campos
  colados sem separador continua sendo rejeitada com pedido de
  esclarecimento (não deve ser silenciosamente absorvida no brinco).

---

## Ponto de integração da Onda 2

A Onda 3 só começa quando: um alerta crítico **e** o resumo diário chegam
por push no navegador sem depender do WhatsApp, o aplicativo mobile
autentica com token real e mostra dado real em pelo menos duas telas, e o
cadastro guiado reduz o caminho feliz para 2 mensagens sem perder a
confirmação final.

Até lá, nada é integrado na `main`.
