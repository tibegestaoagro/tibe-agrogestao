import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";
import http from "node:http";
import crypto from "node:crypto";

exigirBancoLocal();


/**
 * Testes do Módulo 24: seam de notificação (Onda 2, agente B1: push web,
 * refatoração de alert-delivery.ts para usar notify(), resumo diário e as
 * rotas novas de inscrição).
 * Roda: `npm run test:m24` (DATABASE_URL/REDIS_URL do ambiente local).
 *
 * `globalThis.AsyncLocalStorage` precisa existir ANTES de qualquer módulo do
 * Next ser carregado, mesmo motivo documentado em m23-token-auth.test.ts:
 * por isso o resto das importações é dinâmico, dentro de main().
 */
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

// Este teste exercita o caminho de FALHA do canal de email de propósito (ver
// asserções abaixo). O `.env` real da máquina pode ter credencial de Gmail
// configurada (é um recurso já em produção, não exclusivo deste teste): sem
// isto, o teste passaria ou falharia dependendo de quem/onde roda, o que
// contradiz o propósito de um teste de regressão. Mesmo espírito do servidor
// fake do WhatsApp: força um resultado determinístico em vez de depender do
// ambiente.
delete process.env.GMAIL_SMTP_USER;
delete process.env.GMAIL_SMTP_APP_PASSWORD;
delete process.env.RESEND_API_KEY;

// O canal de push precisa de um par VAPID válido (formato ECDSA P-256) só
// para CONSEGUIR TENTAR o envio; o teste então falha de propósito, do lado
// do push service, mandando para um endpoint `.invalid`. Sem VAPID
// configurado (produção ainda não tem, ver relatório do agente B1), o canal
// nem chega a tentar (`attempted: false`), o que quebraria a asserção de
// "tentou e falhou". Par gerado uma única vez com `npx web-push
// generate-vapid-keys`, descartável, nunca usado fora deste teste.
process.env.VAPID_PUBLIC_KEY ??=
  "BBKcnCM2gVI84yGKA44HIo1QXafOfM_wn2DDH7_6K7gy1C3Xqa2lmONBr4ny38aO5J2--Ud86dMgi6H_BTdD7kI";
process.env.VAPID_PRIVATE_KEY ??= "SwcY_pj49wmUO4PHxvGw9yDMxwgLIpd85jXCcxuPA_Y";
process.env.VAPID_SUBJECT ??= "mailto:dev@tibe.com.br";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

type Json = { data?: unknown; error?: { code: string; message: string } };
async function body(res: Response): Promise<Json> {
  return (await res.json()) as Json;
}

/**
 * Servidor HTTP local fingindo a API da Evolution: dá ao canal WhatsApp um
 * caminho de SUCESSO real, sem depender de rede externa (mesmo espírito do
 * "porta fechada" em m7, só que aqui a porta responde). `requests` acumula o
 * `number` de cada chamada recebida, para o teste da rota de pending-flows
 * conferir QUEM foi de fato contactado por WhatsApp (e quem não foi, porque
 * caiu no push).
 */
function startFakeEvolutionServer(): Promise<{ server: http.Server; baseUrl: string; requests: string[] }> {
  return new Promise((resolve) => {
    const requests: string[] = [];
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(raw) as { number?: string };
          if (parsed.number) requests.push(parsed.number);
        } catch {
          // corpo não-JSON não interessa a este fake
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ key: { id: "fake-evolution-message-id" } }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, requests });
    });
  });
}

/**
 * Roda `fn()` com o relógio global fixo em `fixed`: a rota de pending-flows
 * usa `new Date()` internamente (o cron real roda a qualquer hora do dia), e
 * o teste precisa cair dentro do horário comercial (8h-18h) de forma
 * determinística, sem depender da hora real da máquina que roda a suíte.
 *
 * ⚠️ Só o `new Date()` SEM argumento vira `fixed`: `new Date(x)` continua
 * construindo a data real de `x`, via `Reflect.construct` (evita o problema
 * de espalhar argumentos num `super()` de aridade variável, que o TypeScript
 * não aceita por `Date` ter construtores sobrecarregados). Sem essa
 * distinção, toda desserialização de timestamp do Prisma (que também passa
 * por `new Date(...)`) devolveria o relógio fixo em vez do valor de verdade
 * gravado no banco, e o teste que lê `updated_at` de volta veria a hora fixa
 * em vez da data que ele mesmo gravou.
 */
async function withFixedNow<T>(fixed: Date, fn: () => Promise<T>): Promise<T> {
  const RealDate = Date;
  function FixedDate(...args: unknown[]): Date {
    if (args.length === 0) return new RealDate(fixed.getTime());
    return Reflect.construct(RealDate, args) as Date;
  }
  FixedDate.now = () => fixed.getTime();
  FixedDate.prototype = RealDate.prototype;
  (globalThis as { Date: unknown }).Date = FixedDate;
  try {
    return await fn();
  } finally {
    (globalThis as { Date: unknown }).Date = RealDate;
  }
}

function fakePushKeys() {
  return {
    endpoint: `https://push.example.invalid/${crypto.randomBytes(12).toString("hex")}`,
    p256dh: crypto.randomBytes(65).toString("base64url"),
    auth: crypto.randomBytes(16).toString("base64url"),
  };
}

async function main() {
  console.log("🔒 Módulo 24: seam de notificação (push, WhatsApp, email, resumo diário)\n");

  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { notify, saveSubscription, removeSubscription, getVapidPublicKey } = await import(
    "@/lib/notify"
  );
  const { deliverPendingAlertsForTenant, findAlertRecipient } = await import(
    "@/lib/actions/alert-delivery"
  );
  const { sendDailyDigestForTenant, sendAllDailyDigests } = await import(
    "@/app/api/internal/jobs/daily-digest/send-digest"
  );
  const { GET: dailyDigestRoute } = await import("@/app/api/internal/jobs/daily-digest/route");
  const { POST: subscribeRoute, DELETE: unsubscribeRoute } = await import(
    "@/app/api/v1/notifications/subscribe/route"
  );
  const { GET: publicKeyRoute } = await import("@/app/api/v1/notifications/public-key/route");
  const { signAccessToken } = await import("@/lib/auth-token");
  const { upsertProviderConfigAction, activateProviderAction } = await import(
    "@/lib/actions/platform-whatsapp-config"
  );
  const { getRedisConnection } = await import("@/lib/redis");
  const { withBearer } = await import("./_escopo-de-requisicao");

  function post(url: string, payload: unknown, method = "POST"): Request {
    return new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Faz `webpush.sendNotification` responder sucesso durante `fn()`, sem
   * chamada de rede real: só há um jeito de provar "push que ENTREGA pula o
   * WhatsApp" (Fase 6 Task 3, revisão de 2026-09-17), já que o `.invalid` das
   * outras inscrições fakes serve para o caminho contrário (falha garantida).
   * Restaura a função original depois, mesmo em erro.
   */
  async function withSuccessfulPush<T>(fn: () => Promise<T>): Promise<T> {
    // O namespace de um `import()` dinâmico de módulo CJS é não-extensível; o
    // `.default` é o `module.exports` de verdade (mesmo objeto, cacheado por
    // `require`, o que push.ts também importa): é nele que a mutação precisa
    // acontecer para push.ts enxergar o stub.
    const webpushModule = (await import("web-push")) as unknown as {
      default: { sendNotification: (...args: unknown[]) => Promise<unknown> };
    };
    const target = webpushModule.default;
    const original = target.sendNotification;
    target.sendNotification = async () => ({ statusCode: 201 });
    try {
      return await fn();
    } finally {
      target.sendNotification = original;
    }
  }

  const stamp = Date.now();

  async function makeTenant(label: string) {
    const tenant = await prisma.tenant.create({
      data: { name: `M24 Tenant ${label}`, document: `M24${label}${stamp}`.slice(0, 14), plan: "fazenda" },
    });
    const db = prismaForTenant(tenant.id);
    const owner = await db.user.create({
      data: scoped({
        name: `M24 Owner ${label}`,
        email: `m24-${label.toLowerCase()}-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
        phone: `55119${stamp.toString().slice(-8)}${label === "A" ? "1" : "2"}`,
      }),
    });
    return { tenant, db, owner };
  }

  await prisma.whatsAppProviderConfig.deleteMany({});
  const { server: evolutionServer, baseUrl, requests: evolutionRequests } = await startFakeEvolutionServer();

  const A = await makeTenant("A");
  const B = await makeTenant("B");
  // C: tenant sem NENHUM usuário (sem OWNER/ADMIN ativo), de propósito, para
  // testar o caso "nada a fazer" de sendDailyDigestForTenant abaixo.
  const tenantC = await prisma.tenant.create({
    data: { name: "M24 Tenant C", document: `M24C${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const C = { tenant: tenantC };
  let extraTenantIds: string[] = [];

  try {
    // ── 0. Configura o provider WhatsApp ativo apontando para o servidor fake ──
    await upsertProviderConfigAction({
      provider: "evolution",
      credentials: { base_url: baseUrl, api_key: "fake-key", instance: "m24", n8n_webhook_url: "https://n8n.example.com/webhook/m24" },
    });
    await activateProviderAction("evolution");

    // ── 1. CRUD de inscrição de push (funções diretas) ─────────────────────
    const keysA = fakePushKeys();
    const savedA = await saveSubscription({
      tenant_id: A.tenant.id,
      user_id: A.owner.id,
      endpoint: keysA.endpoint,
      p256dh: keysA.p256dh,
      auth: keysA.auth,
    });
    assert(savedA.ok, "saveSubscription cria a inscrição");

    const rowsA = await A.db.pushSubscription.findMany();
    assert(rowsA.length === 1 && rowsA[0].endpoint === keysA.endpoint, "inscrição aparece via client escopado do tenant A");
    const rowsBSeeA = await B.db.pushSubscription.findMany();
    assert(rowsBSeeA.length === 0, "tenant B não vê a inscrição de A (isolamento)");

    // Reassinar o MESMO endpoint no MESMO tenant atualiza em vez de duplicar.
    const newAuth = crypto.randomBytes(16).toString("base64url");
    const resaved = await saveSubscription({
      tenant_id: A.tenant.id,
      user_id: A.owner.id,
      endpoint: keysA.endpoint,
      p256dh: keysA.p256dh,
      auth: newAuth,
    });
    assert(resaved.ok, "reassinar o mesmo endpoint funciona (upsert)");
    const rowsAafterResave = await A.db.pushSubscription.findMany();
    assert(
      rowsAafterResave.length === 1 && rowsAafterResave[0].auth === newAuth,
      "reassinar atualiza a linha existente, não duplica",
    );

    // Mesmo endpoint sob OUTRO tenant: rejeitado com erro claro (409), sem
    // realocação silenciosa (o client base não é usado para isso: ver
    // comentário em push-subscriptions.ts).
    const conflict = await saveSubscription({
      tenant_id: B.tenant.id,
      user_id: B.owner.id,
      endpoint: keysA.endpoint,
      p256dh: keysA.p256dh,
      auth: keysA.auth,
    });
    assert(
      !conflict.ok && conflict.code === "ENDPOINT_IN_USE" && conflict.status === 409,
      "endpoint já inscrito em outro tenant é rejeitado (ENDPOINT_IN_USE, 409), não realocado silenciosamente",
    );

    // Remoção: só o dono (tenant+usuário certos) consegue.
    const removedByB = await removeSubscription({
      tenant_id: B.tenant.id,
      user_id: B.owner.id,
      endpoint: keysA.endpoint,
    });
    assert(removedByB === false, "tenant B não consegue remover a inscrição de A");
    assert((await A.db.pushSubscription.findMany()).length === 1, "inscrição de A continua intacta após tentativa de B");

    const removedByOwner = await removeSubscription({
      tenant_id: A.tenant.id,
      user_id: A.owner.id,
      endpoint: keysA.endpoint,
    });
    assert(removedByOwner === true, "o próprio dono remove a inscrição");
    assert((await A.db.pushSubscription.findMany()).length === 0, "inscrição removida de fato");
    const removedAgain = await removeSubscription({
      tenant_id: A.tenant.id,
      user_id: A.owner.id,
      endpoint: keysA.endpoint,
    });
    assert(removedAgain === false, "remover de novo é idempotente (nada a remover, sem erro)");

    // ── 2. Rotas HTTP de inscrição (POST/DELETE /api/v1/notifications/subscribe) ──
    const tokenA = signAccessToken(A.owner.id);
    const keysHttp = fakePushKeys();

    let res: Response = await withBearer(tokenA, () =>
      subscribeRoute(post("http://localhost/api/v1/notifications/subscribe", {
        endpoint: keysHttp.endpoint,
        keys: { p256dh: keysHttp.p256dh, auth: keysHttp.auth },
      })),
    );
    assert(res.status === 201, "POST /notifications/subscribe responde 201");
    const rowsAfterHttp = await A.db.pushSubscription.findMany();
    assert(
      rowsAfterHttp.length === 1 && rowsAfterHttp[0].user_id === A.owner.id,
      "a rota grava a inscrição para o usuário do token, tenant resolvido no servidor",
    );

    res = await withBearer(null, () =>
      subscribeRoute(post("http://localhost/api/v1/notifications/subscribe", {
        endpoint: keysHttp.endpoint,
        keys: { p256dh: keysHttp.p256dh, auth: keysHttp.auth },
      })),
    );
    assert(res.status === 401, "POST /notifications/subscribe sem Authorization -> 401");

    res = await withBearer(tokenA, () =>
      subscribeRoute(post("http://localhost/api/v1/notifications/subscribe", { endpoint: "" })),
    );
    assert(res.status === 422, "POST /notifications/subscribe com corpo inválido -> 422 VALIDATION_ERROR");

    res = await withBearer(tokenA, () => publicKeyRoute());
    const pk = await body(res);
    assert(
      res.status === 200 && (pk.data as { vapid_public_key: string | null })?.vapid_public_key === getVapidPublicKey(),
      "GET /notifications/public-key devolve a mesma chave pública que o servidor usa para assinar",
    );

    res = await withBearer(tokenA, () =>
      unsubscribeRoute(post("http://localhost/api/v1/notifications/subscribe", { endpoint: keysHttp.endpoint }, "DELETE")),
    );
    assert(res.status === 200, "DELETE /notifications/subscribe responde 200");
    assert((await A.db.pushSubscription.findMany()).length === 0, "inscrição removida via rota HTTP");

    // ── 3. notify() urgency "critical": push+email sempre, WhatsApp quando o push NÃO ENTREGOU ──
    // Fase 6 Task 3, revisada em 2026-09-17: diferente do "digest" (onde
    // EXISTÊNCIA de inscrição decide o fallback), no crítico quem decide é a
    // ENTREGA. É uma tentativa só, sobre prazo e dinheiro: duplicar o aviso é
    // mais barato que silenciar por causa de uma inscrição de push morta que
    // ninguém ainda reportou.
    const fakeSub = fakePushKeys();
    await saveSubscription({
      tenant_id: A.tenant.id,
      user_id: A.owner.id,
      endpoint: fakeSub.endpoint,
      p256dh: fakeSub.p256dh,
      auth: fakeSub.auth,
    });

    // Caso 1 (discrimina a revisão): A tem push configurado E inscrito, mas a
    // ENTREGA falha de verdade (endpoint .invalid, sent: 0, failed: 1).
    // Diferente do "digest", isso NÃO basta para pular o WhatsApp: aqui quem
    // decide é a entrega, não a existência da inscrição.
    const criticalPushFalhouDeVerdade = await notify(
      { tenant_id: A.tenant.id, user_id: A.owner.id, phone: A.owner.phone, email: A.owner.email },
      {
        pushTitle: "Teste",
        pushBody: "corpo de teste",
        whatsappText: "mensagem de teste M24",
        email: { subject: "Teste M24", html: "<p>teste</p>" },
      },
      "critical",
    );
    assert(criticalPushFalhouDeVerdade.push.subscriptions === 1, "tenant A tem 1 inscrição de push ativa");
    assert(
      criticalPushFalhouDeVerdade.push.attempted === true &&
        criticalPushFalhouDeVerdade.push.ok === false &&
        criticalPushFalhouDeVerdade.push.sent === 0 &&
        criticalPushFalhouDeVerdade.push.failed === 1,
      "push tentado e a entrega falhou de verdade (endpoint .invalid, sent: 0, failed: 1)",
    );
    assert(
      criticalPushFalhouDeVerdade.whatsapp.attempted === true && criticalPushFalhouDeVerdade.whatsapp.ok === true,
      "inscrição existe mas a entrega FALHOU: alerta crítico tenta WhatsApp mesmo assim (diferente do digest)",
    );
    assert(criticalPushFalhouDeVerdade.email.attempted === true && criticalPushFalhouDeVerdade.email.ok === false, "email sempre tentado no crítico, mesmo com push existente; falha aqui por falta de credencial local");
    assert(criticalPushFalhouDeVerdade.delivered === true, "delivered=true: o WhatsApp entregou");

    const emailLogs = await A.db.emailLog.findMany({ where: { type: "alert" } });
    assert(emailLogs.some((l) => l.status === "failed"), "tentativa de email falha grava EmailLog mesmo assim (rastro auditável)");

    // Caso 1b (confere que a razão original da mudança não se perdeu): push
    // que ENTREGA de verdade (sent >= 1) segue pulando o WhatsApp.
    await withSuccessfulPush(async () => {
      const criticalPushEntregou = await notify(
        { tenant_id: A.tenant.id, user_id: A.owner.id, phone: A.owner.phone, email: A.owner.email },
        {
          pushTitle: "Teste",
          pushBody: "corpo de teste",
          whatsappText: "mensagem de teste M24 (push entregou)",
          email: { subject: "Teste M24", html: "<p>teste</p>" },
        },
        "critical",
      );
      assert(criticalPushEntregou.push.ok === true, "desta vez o push ENTREGA de verdade (sendNotification stubado com sucesso)");
      assert(
        criticalPushEntregou.whatsapp.attempted === false,
        "push que entrega segue pulando o WhatsApp: essa era a razão original da Task 3, e não pode se perder",
      );
      assert(criticalPushEntregou.email.attempted === true, "email continua sempre tentado, mesmo com push entregando");
      assert(criticalPushEntregou.delivered === true, "delivered=true: o push entregou");
    });

    // Caso 1c: nada entrega (push falha de verdade, sem telefone para
    // WhatsApp, email sem credencial local) -> delivered=false.
    const criticalNadaEntrega = await notify(
      { tenant_id: A.tenant.id, user_id: A.owner.id, phone: null, email: A.owner.email },
      {
        pushTitle: "Teste",
        pushBody: "corpo de teste",
        whatsappText: "mensagem de teste M24 (nada entrega)",
        email: { subject: "Teste M24", html: "<p>teste</p>" },
      },
      "critical",
    );
    assert(criticalNadaEntrega.push.ok === false, "push falha de verdade nesta chamada também");
    assert(criticalNadaEntrega.whatsapp.attempted === false, "sem telefone, WhatsApp nem é tentado (mesmo com push falho)");
    assert(criticalNadaEntrega.email.ok === false, "email falha por falta de credencial local");
    assert(criticalNadaEntrega.delivered === false, "delivered=false: nenhum canal entregou de fato");

    // Caso 2: B não tem NENHUMA inscrição de push. WhatsApp é tentado, como hoje.
    const criticalSemPush = await notify(
      { tenant_id: B.tenant.id, user_id: B.owner.id, phone: B.owner.phone, email: B.owner.email },
      {
        pushTitle: "Teste",
        pushBody: "corpo de teste",
        whatsappText: "mensagem de teste M24 (B, sem push)",
        email: { subject: "Teste M24", html: "<p>teste</p>" },
      },
      "critical",
    );
    assert(criticalSemPush.push.subscriptions === 0, "tenant B não tem inscrição de push ativa");
    assert(
      criticalSemPush.whatsapp.attempted === true && criticalSemPush.whatsapp.ok === true,
      "sem inscrição de push, alerta crítico tenta WhatsApp e entrega (servidor fake local)",
    );
    assert(criticalSemPush.email.attempted === true, "email sempre tentado no crítico, com ou sem push");
    assert(criticalSemPush.delivered === true, "delivered=true: WhatsApp entregou");

    // Caso 3: A tem inscrição, mas VAPID está incompleta. Canal que não pode
    // entregar conta como inexistente: WhatsApp é tentado mesmo com inscrição.
    const savedVapidSubjectCritical = process.env.VAPID_SUBJECT;
    delete process.env.VAPID_SUBJECT;
    try {
      const criticalVapidIncompleta = await notify(
        { tenant_id: A.tenant.id, user_id: A.owner.id, phone: A.owner.phone, email: A.owner.email },
        {
          pushTitle: "Teste",
          pushBody: "corpo de teste",
          whatsappText: "mensagem de teste M24 (VAPID incompleta)",
          email: { subject: "Teste M24", html: "<p>teste</p>" },
        },
        "critical",
      );
      assert(criticalVapidIncompleta.push.configurado === false, "push.configurado=false quando VAPID está incompleta");
      assert(
        criticalVapidIncompleta.whatsapp.attempted === true && criticalVapidIncompleta.whatsapp.ok === true,
        "inscrição viva + VAPID incompleta: alerta crítico cai para WhatsApp em vez de silenciar",
      );
      assert(criticalVapidIncompleta.delivered === true, "entregue via WhatsApp quando o push não pode ser configurado");
    } finally {
      process.env.VAPID_SUBJECT = savedVapidSubjectCritical;
    }

    // ── 4. Alerta crítico real: deliverPendingAlertsForTenant marca "sent" (tenant sem push, via WhatsApp) ──
    const alert = await B.db.alert.create({
      data: scoped({ alert_type: "bill_due", message: "Conta de teste M24 vence hoje", status: "pending" }),
    });
    const delivered = await deliverPendingAlertsForTenant(B.tenant.id);
    assert(delivered.sent === 1, "deliverPendingAlertsForTenant entrega 1 alerta");
    const alertAfter = await B.db.alert.findFirst({ where: { id: alert.id } });
    assert(alertAfter?.status === "sent" && alertAfter.sent_at !== null, "alerta passa para status 'sent' (WhatsApp entregou, tenant sem push)");

    const recipient = await findAlertRecipient(B.db);
    assert(recipient?.id === B.owner.id, "findAlertRecipient (exportado) resolve o OWNER ativo");

    // ── 5. notify() urgency "digest": existência de inscrição decide o fallback, não sucesso ──
    // B não tem NENHUMA inscrição de push: cai para WhatsApp.
    const digestNoPush = await notify(
      { tenant_id: B.tenant.id, user_id: B.owner.id, phone: B.owner.phone, email: B.owner.email },
      { pushTitle: "Resumo", pushBody: "resumo de teste", whatsappText: "Resumo de teste M24" },
      "digest",
    );
    assert(digestNoPush.push.subscriptions === 0, "tenant B não tem inscrição de push ativa");
    assert(digestNoPush.whatsapp.attempted === true && digestNoPush.whatsapp.ok === true, "sem inscrição -> digest cai para WhatsApp, e funciona");
    assert(digestNoPush.email.attempted === false, "digest NUNCA tenta email, mesmo tendo caído para WhatsApp");
    assert(digestNoPush.delivered === true, "digest de B foi entregue (via WhatsApp)");

    // A TEM inscrição de push (ainda que a entrega falhe): NÃO cai para WhatsApp.
    const digestWithDeadPush = await notify(
      { tenant_id: A.tenant.id, user_id: A.owner.id, phone: A.owner.phone, email: A.owner.email },
      { pushTitle: "Resumo", pushBody: "resumo de teste", whatsappText: "Resumo de teste M24 (A)" },
      "digest",
    );
    assert(digestWithDeadPush.push.subscriptions === 1, "tenant A tem 1 inscrição de push ativa (mesmo que a entrega falhe)");
    assert(digestWithDeadPush.push.ok === false, "a entrega desta inscrição falha de verdade (endpoint .invalid)");
    assert(
      digestWithDeadPush.whatsapp.attempted === false,
      "existência de inscrição (não sucesso de entrega) barra o fallback para WhatsApp: não tenta, mesmo o push tendo falhado",
    );
    assert(digestWithDeadPush.email.attempted === false, "digest nunca tenta email");
    assert(digestWithDeadPush.delivered === false, "sem nenhum canal ter entregado de fato, delivered=false");

    // ── 5b. VAPID incompleta: canal que não pode entregar é inexistente, não "tentado e falhou" ──
    // O defeito armado: A já tem inscrição viva (seção 3) e VAPID some do
    // ambiente. Antes da correção, nem push nem WhatsApp eram tentados e o
    // resumo diário sumia sem erro.
    const savedVapidSubject = process.env.VAPID_SUBJECT;
    delete process.env.VAPID_SUBJECT;
    try {
      assert(getVapidPublicKey() === null, "sem VAPID_SUBJECT a chave pública não é servida (convite não aparece)");

      const digestVapidIncompleta = await notify(
        { tenant_id: A.tenant.id, user_id: A.owner.id, phone: A.owner.phone, email: A.owner.email },
        { pushTitle: "Resumo", pushBody: "resumo de teste", whatsappText: "Resumo de teste M24 (VAPID incompleta)" },
        "digest",
      );
      assert(digestVapidIncompleta.push.configurado === false, "push.configurado=false quando VAPID está incompleta");
      assert(
        digestVapidIncompleta.whatsapp.attempted === true && digestVapidIncompleta.delivered === true,
        "inscrição viva + VAPID incompleta cai para WhatsApp em vez de sumir sem entregar",
      );
    } finally {
      process.env.VAPID_SUBJECT = savedVapidSubject;
    }

    // ── 6. sendDailyDigestForTenant / sendAllDailyDigests ──────────────────
    const sentB = await sendDailyDigestForTenant(B.tenant.id);
    assert(sentB === true, "sendDailyDigestForTenant(B) entrega (fallback WhatsApp, sem inscrição de push)");

    const sentC = await sendDailyDigestForTenant(C.tenant.id);
    assert(sentC === false, "tenant sem OWNER/ADMIN ativo: sendDailyDigestForTenant devolve false, sem lançar");

    const allDigests = await sendAllDailyDigests();
    assert(allDigests.tenants >= 3, `sendAllDailyDigests varre todos os tenants trial/active (obtido: ${allDigests.tenants})`);

    // ── 7. Rota do resumo diário (disparada pelo N8N, não pela Vercel Cron): auth + lock diário ──
    const noAuthDigest = await dailyDigestRoute(new Request("http://localhost/api/internal/jobs/daily-digest"));
    assert(noAuthDigest.status === 401, "rota do resumo sem x-internal-secret -> 401");

    const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET!;
    const digestReq = () =>
      dailyDigestRoute(
        new Request("http://localhost/api/internal/jobs/daily-digest", {
          headers: { "x-internal-secret": INTERNAL_SECRET },
        }),
      );
    const firstDigestRun = await (await digestReq()).json();
    const secondDigestRun = await (await digestReq()).json();
    assert(!firstDigestRun.data.skipped, "1ª chamada do dia do resumo executa (não fica skipped)");
    assert(secondDigestRun.data.skipped === true, "2ª chamada do MESMO dia é pulada (lock funcionando, chave própria)");

    const today = new Date().toISOString().slice(0, 10);
    await getRedisConnection().del(`tibe:digest:generated:${today}`);

    // ── 8. POST /api/internal/whatsapp/pending-flows passa pelo seam notify() ──
    // Achado da Fase 6 (Task 4): a rota chamava sendWhatsAppMessage direto.
    // 1ª correção usou urgência "digest" (push quando existe, WhatsApp quando
    // não), mas o texto do lembrete ("...responda cancelar") pede resposta
    // dentro do fio de WhatsApp já aberto: uma notificação do sistema não
    // tem como responder. Urgência certa é "conversa": WhatsApp SEMPRE, push
    // NUNCA (nem tentado), independente de o tenant ter inscrição ativa.
    const { startFlow } = await import("@/lib/actions/agent-flows");
    const { POST: pendingFlowsRoute } = await import(
      "@/app/api/internal/whatsapp/pending-flows/route"
    );

    const D = await makeTenant("D"); // tem inscrição de push ativa
    const E = await makeTenant("E"); // sem nenhuma inscrição de push
    extraTenantIds = [D.tenant.id, E.tenant.id];
    const phoneD = `551190${stamp.toString().slice(-6)}1`;
    const phoneE = `551190${stamp.toString().slice(-6)}2`;
    await D.db.user.update({ where: { id: D.owner.id }, data: { phone: phoneD } });
    await E.db.user.update({ where: { id: E.owner.id }, data: { phone: phoneE } });

    const pushD = fakePushKeys();
    await saveSubscription({
      tenant_id: D.tenant.id,
      user_id: D.owner.id,
      endpoint: pushD.endpoint,
      p256dh: pushD.p256dh,
      auth: pushD.auth,
    });

    // notify() direto, urgência "conversa": push nunca é sequer tentado,
    // mesmo com inscrição ativa (diferente de "digest", onde a existência da
    // inscrição barra o WhatsApp). WhatsApp é o único canal, sempre.
    evolutionRequests.length = 0;
    const conversaResult = await notify(
      { tenant_id: D.tenant.id, user_id: D.owner.id, phone: phoneD, email: D.owner.email },
      { pushTitle: "Teste", pushBody: "corpo de teste", whatsappText: "mensagem de teste conversa" },
      "conversa",
    );
    assert(conversaResult.push.attempted === false, "urgência 'conversa' nunca tenta push, mesmo com inscrição ativa");
    assert(
      conversaResult.whatsapp.attempted === true && conversaResult.whatsapp.ok === true,
      "urgência 'conversa' sempre tenta WhatsApp, e funciona (servidor fake local)",
    );
    assert(conversaResult.email.attempted === false, "urgência 'conversa' nunca tenta email");
    assert(conversaResult.delivered === true, "delivered = resultado do WhatsApp (único canal tentado)");

    // Cadastro de animal abandonado nos dois tenants (mesma origem do
    // lembrete: ver agent-flows.ts / m21).
    await startFlow(D.db, D.owner.id, "cadastrar_animal", 1);
    await startFlow(E.db, E.owner.id, "cadastrar_animal", 1);
    const agoraLembrete = new Date();
    agoraLembrete.setHours(10, 0, 0, 0);
    const antigoLembrete = new Date(agoraLembrete.getTime() - 45 * 60_000);
    await D.db.agentFlowState.updateMany({
      where: { user_id: D.owner.id },
      data: { updated_at: antigoLembrete },
    });
    await E.db.agentFlowState.updateMany({
      where: { user_id: E.owner.id },
      data: { updated_at: antigoLembrete },
    });

    evolutionRequests.length = 0;
    const pendingFlowsRes = await withFixedNow(agoraLembrete, () =>
      pendingFlowsRoute(
        new Request("http://localhost/api/internal/whatsapp/pending-flows", {
          method: "POST",
          headers: { "x-internal-secret": INTERNAL_SECRET },
        }),
      ),
    );
    assert(pendingFlowsRes.status === 200, "POST /pending-flows responde 200");

    assert(
      evolutionRequests.includes(phoneD),
      "tenant COM inscrição de push ativa recebe o lembrete por WhatsApp mesmo assim (urgência 'conversa')",
    );
    assert(
      evolutionRequests.includes(phoneE),
      "tenant sem inscrição de push também recebe o lembrete por WhatsApp",
    );
  } finally {
    evolutionServer.close();
    await prisma.whatsAppProviderConfig.deleteMany({});
    await prisma.tenant.deleteMany({ where: { id: { in: [A.tenant.id, B.tenant.id, C.tenant.id, ...extraTenantIds] } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ Módulo 24: 0 falhas.");
  else console.error(`❌ Módulo 24: ${failures} falha(s).`);
}

main()
  .then(async () => {
    const { prisma } = await import("@/lib/prisma");
    const { getRedisConnection } = await import("@/lib/redis");
    await prisma.$disconnect();
    await getRedisConnection().quit();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("❌ Erro inesperado:", err);
    const { prisma } = await import("@/lib/prisma");
    const { getRedisConnection } = await import("@/lib/redis");
    await prisma.$disconnect();
    await getRedisConnection().quit();
    process.exit(1);
  });
