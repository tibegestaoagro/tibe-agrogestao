---
paths:
  - "src/lib/asaas.ts"
  - "src/lib/billing-access.ts"
  - "src/lib/actions/billing.ts"
  - "src/lib/actions/cancellation-sweep.ts"
  - "src/app/api/webhooks/asaas/**"
  - "src/app/api/v1/billing/**"
---
<!-- Carrega sozinho ao ler um arquivo que casa com os globs acima.
     Por que cartao redireciona (PCI), por que a assinatura nasce overdue, e a regua de cancelamento com janela de 60 dias. -->

## Cobrança e billing (Módulo 5)

- **Cliente Asaas** (`src/lib/asaas.ts`): `access_token` no header (sem
  prefixo Bearer), sandbox vs produção por `ASAAS_ENV`. `AsaasNotConfiguredError`
  quando `ASAAS_API_KEY` não está setada: nunca chegou a ser testado contra o
  Asaas de verdade neste ambiente (sem chave de sandbox própria), então
  qualquer bug de integração real só aparece quando a chave existir.
- **PIX e boleto ficam dentro do painel; cartão de crédito redireciona ao
  checkout hospedado do Asaas.** Decisão deliberada (não é limitação): o
  usuário queria tudo no painel (público brasileiro desconfia de sair do site
  para pagar), mas processar cartão dentro do próprio backend exigiria
  certificação PCI-DSS **SAQ-D** (pesada); redirecionar para o checkout do
  Asaas mantém o Tibé em **SAQ-A** (leve), porque o dado de cartão nunca toca
  o servidor do Tibé. `subscribeAction` (`src/lib/actions/billing.ts`) devolve
  um de três formatos (`SubscribeResult`): `pix` (QR + copia-cola), `boleto`
  (linha digitável), ou `redirect` (URL da fatura Asaas, só para cartão).
- **`Subscription.status` nasce `"overdue"`, mesmo numa assinatura nova**:
  não é bug. `next_due_date` fica no futuro (gerado pelo Asaas), e
  `billing-access.ts` dá carência automática enquanto isso, então o tenant não
  é bloqueado no intervalo entre criar a assinatura e o primeiro webhook de
  pagamento confirmar.
- **`POST /api/webhooks/asaas`** (autenticação por token no header
  `asaas-access-token`, comparado com `ASAAS_WEBHOOK_TOKEN`): processa
  `PAYMENT_CONFIRMED` (→ `Subscription.status: active` + `Tenant.status:
  active` + busca `next_due_date` fresco no Asaas), `PAYMENT_OVERDUE` (→
  `overdue`), `PAYMENT_DELETED` (→ `canceled`); outros eventos e assinaturas
  não rastreadas são reconhecidos com `200 { processed: false }`, nunca erro
  (o Asaas não deve reenviar por causa de eventos fora do nosso escopo).
- **Cancelamento tem régua própria** (spec 2026-08-04): quem cancela não é
  inadimplente, pagou o que devia e escolheu sair. Acesso **total até
  `next_due_date`**, depois **leitura por `ARCHIVE_WINDOW_DAYS` (60) dias**,
  depois **bloqueio**. A leitura na janela é deliberada: portabilidade do
  próprio dado é direito do titular na LGPD, não cortesia. `Subscription`
  ganhou `canceled_at` porque `next_due_date` sozinho não ancora quem cancela
  **já vencido** (aí a janela começa no cancelamento, não num vencimento que
  já passou): `getCancellationWindow()` faz esse `max` e é função **pura**,
  testável sem esperar 60 dias. **A fase é sempre calculada das datas, nunca
  lida de um campo que o cron preenche**: um cron atrasado não pode decidir
  acesso. `sweepCanceledSubscriptions()` (`cancellation-sweep.ts`, roda no
  cron diário) só reflete a fase em `Tenant.archived_at` para o painel da
  plataforma enxergar, e **desfaz** o arquivamento de quem reativou.
  **Passados os 60 dias nada é apagado**: o tenant fica bloqueado e aparece em
  destaque em `/plataforma/tenants` como pendente de decisão humana (decisão
  do usuário: apagar cliente é irreversível, e automatizar isso significa que
  um erro de data apaga a fazenda de alguém sem ninguém no circuito).
  Os três pontos que mudam status (`cancelSubscriptionAction`, webhook do
  Asaas, `forceSubscriptionStatusAction`) usam `subscriptionStatusData()`,
  que grava e **limpa** a data: sem isso, reativar deixaria arquivamento
  fantasma. Testes: `npm run test:m31`.
- **Acesso por nível de cobrança** (`src/lib/billing-access.ts`,
  `getBillingAccess(tenantId)`): três níveis: `full` / `read_only` /
  `blocked`: pela mesma régua de dias, tanto para assinatura em atraso
  (`next_due_date`) quanto para trial vencido sem assinatura
  (`trial_ends_at`, `TRIAL_DAYS = 14`): **< 5 dias → full; 5–15 → read_only;
  ≥ 15 → blocked**. `guard()` aplica em toda rota de API (bloqueia escrita em
  `read_only`, tudo em `blocked`, exceto `opts.skipBillingCheck: true`: usado
  só pelas próprias rotas `/api/v1/billing/*`, que precisam continuar
  acessíveis para o tenant conseguir regularizar). O layout do dashboard
  aplica a mesma regra a nível de página, redirecionando para
  `/configuracoes/assinatura` quando bloqueado.
- **`x-pathname` via middleware**: `middleware.ts` foi reestruturado da forma
  `export const { auth: middleware } = NextAuth(authConfig)` para a forma de
  função de ordem superior (`auth((req) => { ... res.headers.set("x-pathname",
  ...) ...})`) só para conseguir propagar o pathname atual para o layout do
  dashboard (Node runtime, com Prisma) sem duplicar lógica de auth no Edge.
  **Isso silenciosamente desligou `authConfig.callbacks.authorized`**: nessa
  forma o next-auth chama a função de ordem superior incondicionalmente e
  descarta o resultado de `authorized` (confirmado no código-fonte do pacote,
  função `handleAuth`). O middleware não bloqueava nada por sessão de tenant;
  quem protegia era só o `redirect()` de cada página. Corrigido em 2026-08-01
  chamando `authConfig.callbacks.authorized` explicitamente dentro da função,
  com `req.auth` (já resolvido pelo próprio next-auth). Se precisar adicionar
  outro header/side-effect no middleware, é aqui que entra: mas qualquer nova
  forma de HOF precisa preservar essa chamada explícita.
- **`AlertType.trial_ending`** (extensão aditiva ao enum, spec 5.8 não previa
  no PRD original): dispara quando `trial_ends_at` está a ≤ 2 dias e o tenant
  não tem `Subscription` nenhuma. `related_id` é o próprio `tenant_id` (o
  trial só vence uma vez, então é naturalmente idempotente sem precisar de um
  identificador sintético como o `low_balance` da semana ISO).
