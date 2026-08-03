import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
import http from "node:http";
import crypto from "node:crypto";

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

/** Servidor HTTP local fingindo a API da Evolution: dá ao canal WhatsApp um caminho de SUCESSO real, sem depender de rede externa (mesmo espírito do "porta fechada" em m7, só que aqui a porta responde). */
function startFakeEvolutionServer(): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      req.on("data", () => {});
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ key: { id: "fake-evolution-message-id" } }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
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
  const { requestAsyncStorage } = await import(
    "next/dist/client/components/request-async-storage.external"
  );

  function withBearer<T>(token: string | null, fn: () => Promise<T>): Promise<T> {
    const store = {
      headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
      cookies: { get: () => undefined, getAll: () => [], has: () => false },
      mutableCookies: { get: () => undefined, getAll: () => [], has: () => false, set: () => {} },
      draftMode: { isEnabled: false },
    } as unknown as Parameters<typeof requestAsyncStorage.run>[0];
    return requestAsyncStorage.run(store, fn);
  }

  function post(url: string, payload: unknown, method = "POST"): Request {
    return new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
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
  const { server: evolutionServer, baseUrl } = await startFakeEvolutionServer();

  const A = await makeTenant("A");
  const B = await makeTenant("B");
  // C: tenant sem NENHUM usuário (sem OWNER/ADMIN ativo), de propósito, para
  // testar o caso "nada a fazer" de sendDailyDigestForTenant abaixo.
  const tenantC = await prisma.tenant.create({
    data: { name: "M24 Tenant C", document: `M24C${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const C = { tenant: tenantC };

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

    // ── 3. notify() urgency "critical": push falha, WhatsApp funciona, email falha ──
    const fakeSub = fakePushKeys();
    await saveSubscription({
      tenant_id: A.tenant.id,
      user_id: A.owner.id,
      endpoint: fakeSub.endpoint,
      p256dh: fakeSub.p256dh,
      auth: fakeSub.auth,
    });

    const criticalResult = await notify(
      { tenant_id: A.tenant.id, user_id: A.owner.id, phone: A.owner.phone, email: A.owner.email },
      {
        pushTitle: "Teste",
        pushBody: "corpo de teste",
        whatsappText: "mensagem de teste M24",
        email: { subject: "Teste M24", html: "<p>teste</p>" },
      },
      "critical",
    );
    assert(criticalResult.push.attempted === true && criticalResult.push.ok === false, "push tentado e falhou (endpoint .invalid, sem push service real)");
    assert(criticalResult.whatsapp.attempted === true && criticalResult.whatsapp.ok === true, "WhatsApp tentado e funcionou (servidor fake local)");
    assert(criticalResult.email.attempted === true && criticalResult.email.ok === false, "email tentado e falhou (sem credencial Gmail/Resend configurada localmente)");
    assert(criticalResult.delivered === true, "delivered=true: basta UM canal responder ok (aqui, o WhatsApp)");

    const emailLogs = await A.db.emailLog.findMany({ where: { type: "alert" } });
    assert(emailLogs.some((l) => l.status === "failed"), "tentativa de email falha grava EmailLog mesmo assim (rastro auditável)");

    // ── 4. Alerta crítico real: deliverPendingAlertsForTenant marca "sent" mesmo com push falho ──
    const alert = await A.db.alert.create({
      data: scoped({ alert_type: "bill_due", message: "Conta de teste M24 vence hoje", status: "pending" }),
    });
    const delivered = await deliverPendingAlertsForTenant(A.tenant.id);
    assert(delivered.sent === 1, "deliverPendingAlertsForTenant entrega 1 alerta");
    const alertAfter = await A.db.alert.findFirst({ where: { id: alert.id } });
    assert(alertAfter?.status === "sent" && alertAfter.sent_at !== null, "alerta passa para status 'sent' (WhatsApp entregou, mesmo com push falho)");

    const recipient = await findAlertRecipient(A.db);
    assert(recipient?.id === A.owner.id, "findAlertRecipient (exportado) resolve o OWNER ativo");

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

    // ── 6. sendDailyDigestForTenant / sendAllDailyDigests ──────────────────
    const sentB = await sendDailyDigestForTenant(B.tenant.id);
    assert(sentB === true, "sendDailyDigestForTenant(B) entrega (fallback WhatsApp, sem inscrição de push)");

    const sentC = await sendDailyDigestForTenant(C.tenant.id);
    assert(sentC === false, "tenant sem OWNER/ADMIN ativo: sendDailyDigestForTenant devolve false, sem lançar");

    const allDigests = await sendAllDailyDigests();
    assert(allDigests.tenants >= 3, `sendAllDailyDigests varre todos os tenants trial/active (obtido: ${allDigests.tenants})`);

    // ── 7. Rota de cron do resumo diário: auth + lock diário ──────────────
    const noAuthDigest = await dailyDigestRoute(new Request("http://localhost/api/internal/jobs/daily-digest"));
    assert(noAuthDigest.status === 401, "rota de cron do resumo sem Authorization -> 401");

    const CRON_SECRET = process.env.CRON_SECRET!;
    const digestReq = () =>
      dailyDigestRoute(
        new Request("http://localhost/api/internal/jobs/daily-digest", {
          headers: { Authorization: `Bearer ${CRON_SECRET}` },
        }),
      );
    const firstDigestRun = await (await digestReq()).json();
    const secondDigestRun = await (await digestReq()).json();
    assert(!firstDigestRun.data.skipped, "1ª chamada do dia do cron de resumo executa (não fica skipped)");
    assert(secondDigestRun.data.skipped === true, "2ª chamada do MESMO dia é pulada (lock funcionando, chave própria)");

    const today = new Date().toISOString().slice(0, 10);
    await getRedisConnection().del(`tibe:digest:generated:${today}`);
  } finally {
    evolutionServer.close();
    await prisma.whatsAppProviderConfig.deleteMany({});
    await prisma.tenant.deleteMany({ where: { id: { in: [A.tenant.id, B.tenant.id, C.tenant.id] } } });
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
