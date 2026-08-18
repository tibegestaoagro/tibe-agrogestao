---
paths:
  - "src/lib/actions/financial*.ts"
  - "src/lib/actions/alert*.ts"
  - "src/lib/financial.ts"
  - "src/lib/email-*.ts"
  - "src/app/api/v1/financial*/**"
  - "src/app/(dashboard)/financeiro/**"
---
<!-- Carrega sozinho ao ler um arquivo que casa com os globs acima.
     Regime contabil, idempotencia de alerta, PDF sem storage e o canal de email. -->

## Financeiro e Alertas (Módulo 4)

- **Lançamentos manuais** (`POST /api/v1/financial-entries`) sempre nascem
  `related_module: geral`. `PATCH` (edição completa) só é permitido nesses:
  editar um lançamento gerado por outro módulo (venda de animal, insumo,
  ordem faturada) é bloqueado (`NOT_EDITABLE`) para não descolar do dado de
  origem; "marcar como pago" funciona em qualquer lançamento, de qualquer
  origem. Lógica em `src/lib/actions/financial-entries.ts`.
- **Regime contábil**: DRE (`getDre`) é por **competência**: todos os
  lançamentos do período por `due_date`, pago ou não. Fluxo de caixa
  (`getCashFlow`) é por **caixa**: só `status: paid`, agrupado por
  `paid_at`. Os dois em `src/lib/actions/financial-reports.ts`.
- **PDF sem R2**: `src/lib/reports/generate-financial-pdf.ts` (pdf-lib, gera
  na hora, nunca armazena) atrás de um link assinado por HMAC com expiração
  (`src/lib/reports/report-token.ts`, reusa `INTERNAL_API_SECRET` como
  chave): funciona sem sessão (necessário para quem clica vindo do
  WhatsApp). `GET /api/v1/financial/report/link` (sessão, gera o link) →
  `GET /api/v1/financial/report?token=` (público, serve o PDF). Trocar pelo
  R2 real no futuro não deve exigir mudar quem consome o link.
- **Alertas** (`src/lib/actions/alerts.ts`): idempotência por
  `(alert_type, related_module, related_id)`: inclusive `low_balance`, que
  usa a **semana ISO** como `related_id` sintético (resolve "no máximo 1 por
  semana" com o mesmo mecanismo dos outros tipos, sem regra especial).
- **BullMQ real** (Redis Cloud já provisionado), mas **sem worker
  persistente**: decisão do módulo, não há onde hospedar um processo 24/7
  hoje. `GET /api/internal/jobs/generate-alerts` (disparado 1x/dia pela
  Vercel Cron, `vercel.json`, autenticado por `CRON_SECRET` que a Vercel
  injeta sozinha) roda a geração **síncrona** dentro da própria requisição.
  A `Queue` do BullMQ registra um histórico auditável (uso real, mas só de
  bookkeeping); a idempotência "não rodar 2x no mesmo dia" é um lock simples
  no Redis (`SET NX`), não o estado interno do job: mais robusto sem um
  Worker para gerenciá-lo. Ver `getRedisConnectionOptions()` acima.
- **Envio por WhatsApp + email** (`src/lib/actions/alert-delivery.ts`,
  arquitetura 2026-07-29): WhatsApp mesmo padrão do Módulo 3 (Tibé chama
  `N8N_ALERT_WEBHOOK_URL`, outbound); email é tentado em paralelo, sempre
  (ver seção Email abaixo). Um alerta vira `sent` assim que **qualquer um**
  dos 2 canais entregar: sem isso, um alerta que só falha no WhatsApp (ex:
  `N8N_ALERT_WEBHOOK_URL` não configurada, gap conhecido) ficaria `pending`
  pra sempre e reenviaria o mesmo email todo dia no cron.

---

## Email (arquitetura 2026-07-29)

Canal adicional ao WhatsApp, não substituto: boas-vindas e alertas passam a
sair também por email, pensado para não depender só do WhatsApp em avisos
que precisam de comprovação de envio (fatura em atraso, fim de trial), uma
exigência explícita do usuário por motivo de defensabilidade.

- **`EMAIL_PROVIDER=gmail_smtp|resend`** (`.env`, default `gmail_smtp`):
  Gmail SMTP em desenvolvimento/início de produção (`GMAIL_SMTP_USER` +
  `GMAIL_SMTP_APP_PASSWORD`, uma "Senha de app" do Google, não a senha da
  conta); Resend guardado pronto (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`)
  pra quando o domínio próprio (`tibe.com.br`, ainda não registrado) tiver
  um remetente verificado. Troca é só a env var + redeploy, sem UI: decisão
  do usuário, essa troca só acontece uma vez.
- **`src/lib/email-send.ts`**: `sendEmail()` nunca lança (sempre devolve
  `{ok}`) e **sempre grava uma linha em `EmailLog`**, sucesso ou falha. Esse é o
  rastro auditável que o usuário pediu, não dá pra confiar só no retorno da
  função. `src/lib/email-templates.ts`: HTML simples escrito à mão (sem
  react-email nem outra lib de template), cores da marca
  (`tailwind.config.ts`).
- **Pontos de disparo**: `createTenantManuallyAction` e
  `resendWelcomeMessageAction` (`platform-tenants.ts`) disparam email junto
  com o WhatsApp que já existe; `POST /api/v1/signup` ganhou email de
  boas-vindas que não tinha equivalente nenhum antes (nunca teve WhatsApp);
  `deliverPendingAlertsForTenant`/`deliverAllPendingAlerts`
  (`alert-delivery.ts`) disparam email para os 5 tipos de `AlertType`, sem
  filtro. **Exceção deliberada**: `resendWelcomeMessageAction` continua
  exigindo `Tenant.phone` (falha inteira sem telefone, nem tenta o email), pois
  não foi relaxado nesta rodada porque o propósito da action é reenviar
  *pelo WhatsApp*; se precisar que o email funcione independente de
  telefone aqui também, é uma decisão de produto nova, não assumida.
- **Sem tabela de log pra boas-vindas além do `EmailLog`**: `Alert.status`/
  `sent_at` já cobre alertas; boas-vindas nunca teve persistência de
  tentativa nem por WhatsApp, continua assim (só o `EmailLog` novo).
- **Sem teste de entrega real**: `test:m15` cobre a falha graciosa (sem
  credencial configurada) e a lógica de quem recebe o quê; validação de
  entrega de verdade é manual, depois que a credencial do Gmail/Resend
  estiver preenchida no `.env`.
