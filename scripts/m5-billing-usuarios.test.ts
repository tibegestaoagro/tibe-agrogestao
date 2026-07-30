import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { getBillingAccess, TRIAL_DAYS } from "@/lib/billing-access";
import { inviteUserAction, updateUserRoleAction, setUserActiveAction } from "@/lib/actions/users";
import { generateAllAlerts } from "@/lib/actions/alerts";
import { POST as webhookAsaas } from "@/app/api/webhooks/asaas/route";
import { createTenantWithOwner } from "@/lib/actions/tenants";

/**
 * Testes do Módulo 5: níveis de acesso por cobrança (billing-access), webhook
 * do Asaas (eventos + isolamento cross-tenant), trial_ends_at no signup,
 * ações de gestão de usuários + isolamento, e o alerta trial_ending.
 * Roda: `npm run test:m5`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN ?? "dev-asaas-webhook-token";
const DAY = 86_400_000;

async function main() {
  console.log("🔒 Módulo 5: Billing, webhook Asaas e usuários\n");

  const tenantA = await prisma.tenant.create({
    data: { name: "M5 Tenant A", document: "M5A000000001", plan: "fazenda", status: "trial" },
  });
  const tenantB = await prisma.tenant.create({
    data: { name: "M5 Tenant B", document: "M5B000000002", plan: "fazenda", status: "trial" },
  });
  const dbA = prismaForTenant(tenantA.id);
  const dbB = prismaForTenant(tenantB.id);
  const createdTenantIds = [tenantA.id, tenantB.id];

  try {
    // ── billing-access: trial sem assinatura ──────────────────────
    assert(
      (await getBillingAccess(tenantA.id)) === "full",
      "tenant trial sem trial_ends_at rastreado não bloqueia (fallback seguro)",
    );

    await prisma.tenant.update({ where: { id: tenantA.id }, data: { trial_ends_at: new Date(Date.now() + 3 * DAY) } });
    assert((await getBillingAccess(tenantA.id)) === "full", "trial ainda não vencido -> full");

    await prisma.tenant.update({ where: { id: tenantA.id }, data: { trial_ends_at: new Date(Date.now() - 2 * DAY) } });
    assert((await getBillingAccess(tenantA.id)) === "full", "trial vencido há 2 dias (< 5) -> full");

    await prisma.tenant.update({ where: { id: tenantA.id }, data: { trial_ends_at: new Date(Date.now() - 7 * DAY) } });
    assert((await getBillingAccess(tenantA.id)) === "read_only", "trial vencido há 7 dias (5-15) -> read_only");

    await prisma.tenant.update({ where: { id: tenantA.id }, data: { trial_ends_at: new Date(Date.now() - 20 * DAY) } });
    assert((await getBillingAccess(tenantA.id)) === "blocked", "trial vencido há 20 dias (>=15) -> blocked");

    // ── billing-access: com Subscription ───────────────────────────
    const sub = await dbA.subscription.create({
      data: scoped({ plan: "fazenda", status: "active", next_due_date: new Date(Date.now() + 30 * DAY) }),
    });
    assert((await getBillingAccess(tenantA.id)) === "full", "assinatura active -> full, independente do trial vencido");

    await dbA.subscription.update({ where: { id: sub.id }, data: { status: "overdue", next_due_date: new Date(Date.now() - 8 * DAY) } });
    assert((await getBillingAccess(tenantA.id)) === "read_only", "assinatura overdue há 8 dias -> read_only");

    await dbA.subscription.update({ where: { id: sub.id }, data: { status: "canceled" } });
    assert((await getBillingAccess(tenantA.id)) === "blocked", "assinatura canceled -> blocked sempre");

    await dbA.subscription.delete({ where: { id: sub.id } });

    // ── webhook Asaas: autenticação ─────────────────────────────────
    const webhookReq = (body: unknown, token: string | null) =>
      new Request("http://localhost/api/webhooks/asaas", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { "asaas-access-token": token } : {}),
        },
        body: JSON.stringify(body),
      });

    const noTokenRes = await webhookAsaas(webhookReq({ event: "PAYMENT_CONFIRMED" }, "token-errado"));
    assert(noTokenRes.status === 401, "webhook com token errado -> 401");

    // Subscription rastreada, vinculada ao tenant B (para checar isolamento).
    const subB = await dbB.subscription.create({
      data: scoped({
        plan: "fazenda",
        status: "overdue",
        asaas_subscription_id: "sub_m5_test_b",
      }),
    });

    const unknownSubRes = await webhookAsaas(
      webhookReq({ event: "PAYMENT_CONFIRMED", payment: { subscription: "sub_desconhecida" } }, WEBHOOK_TOKEN),
    );
    const unknownSubBody = await unknownSubRes.json();
    assert(
      unknownSubRes.status === 200 && unknownSubBody.data.processed === false,
      "evento para subscription não rastreada é reconhecido sem erro (processed: false)",
    );

    const confirmedRes = await webhookAsaas(
      webhookReq({ event: "PAYMENT_CONFIRMED", payment: { subscription: "sub_m5_test_b", value: 197 } }, WEBHOOK_TOKEN),
    );
    assert(confirmedRes.status === 200, "PAYMENT_CONFIRMED autenticado -> 200");
    const subBAfterConfirm = await dbB.subscription.findFirst({ where: { id: subB.id } });
    assert(subBAfterConfirm?.status === "active", "PAYMENT_CONFIRMED atualiza Subscription.status para active");
    const tenantBAfterConfirm = await prisma.tenant.findUnique({ where: { id: tenantB.id } });
    assert(tenantBAfterConfirm?.status === "active", "PAYMENT_CONFIRMED também ativa o Tenant");

    await webhookAsaas(webhookReq({ event: "PAYMENT_OVERDUE", payment: { subscription: "sub_m5_test_b" } }, WEBHOOK_TOKEN));
    const subBAfterOverdue = await dbB.subscription.findFirst({ where: { id: subB.id } });
    assert(subBAfterOverdue?.status === "overdue", "PAYMENT_OVERDUE atualiza status para overdue");

    await webhookAsaas(webhookReq({ event: "PAYMENT_DELETED", payment: { subscription: "sub_m5_test_b" } }, WEBHOOK_TOKEN));
    const subBAfterDeleted = await dbB.subscription.findFirst({ where: { id: subB.id } });
    assert(subBAfterDeleted?.status === "canceled", "PAYMENT_DELETED atualiza status para canceled");

    // Isolamento: eventos sobre a subscription de B nunca tocam A.
    assert((await dbA.subscription.findFirst({})) === null, "eventos do webhook para B não criam/alteram nada em A");

    // ── criação de conta: trial_ends_at é definido corretamente ──────
    // A rota POST /api/v1/signup de um passo deixou de existir (Módulo 19):
    // o cadastro público agora exige WhatsApp e email verificados. O seam
    // compartilhado continua sendo o mesmo, então é ele que testamos aqui.
    const created = await createTenantWithOwner({
      company_name: "M5 Signup Co",
      document: "52998224725", // CPF válido de teste
      phone: "22999998888",
      plan: "campo",
      plan_confirmed: true,
      owner_name: "Dono Teste",
      owner_email: "m5-signup-owner@test.local",
      password: "senha12345",
      must_change_password: false,
    });
    assert(created.ok, "createTenantWithOwner cria a conta");
    const createdTenantId = created.ok ? created.data.tenant_id : "";
    if (createdTenantId) createdTenantIds.push(createdTenantId);
    const signupTenant = await prisma.tenant.findUnique({ where: { id: createdTenantId } });
    const daysUntilTrialEnd = signupTenant?.trial_ends_at
      ? Math.round((signupTenant.trial_ends_at.getTime() - Date.now()) / DAY)
      : null;
    assert(
      daysUntilTrialEnd === TRIAL_DAYS,
      `trial_ends_at fica ${TRIAL_DAYS} dias à frente (obtido: ${daysUntilTrialEnd})`,
    );

    // ── usuários: convite, duplicidade, role, desativação, isolamento ─
    const invite = await inviteUserAction(dbA, tenantA.id, {
      name: "Operador A",
      email: "m5-operador-a@test.local",
      role: "OPERADOR",
    });
    assert(invite.ok && invite.data.temp_password.length > 0, "inviteUserAction cria usuário com senha temporária");
    const userAId = invite.ok ? invite.data.id : "";

    const dupInvite = await inviteUserAction(dbA, tenantA.id, {
      name: "Outro",
      email: "m5-operador-a@test.local",
      role: "OPERADOR",
    });
    assert(!dupInvite.ok && dupInvite.code === "DUPLICATE_EMAIL", "convite com email já usado (global) é rejeitado");

    const roleUpdate = await updateUserRoleAction(dbA, userAId, "ADMIN");
    assert(roleUpdate.ok, "updateUserRoleAction promove o usuário");
    const userAAfterRole = await dbA.user.findFirst({ where: { id: userAId } });
    assert(userAAfterRole?.role === "ADMIN", "role persistida corretamente");

    const ownerB = await dbB.user.create({
      data: scoped({ name: "Owner B", email: "m5-owner-b@test.local", password_hash: "x", role: "OWNER", active: true }),
    });
    const cannotDeactivateOwner = await setUserActiveAction(dbB, tenantB.id, ownerB.id, false);
    assert(
      !cannotDeactivateOwner.ok && cannotDeactivateOwner.code === "CANNOT_DEACTIVATE_OWNER",
      "setUserActiveAction bloqueia desativar um OWNER",
    );

    const crossTenantRole = await updateUserRoleAction(dbB, userAId, "VISUALIZADOR");
    assert(
      !crossTenantRole.ok && crossTenantRole.code === "NOT_FOUND",
      "tenant B não consegue alterar role de usuário do tenant A (isolamento)",
    );
    assert((await dbB.user.findMany()).length === 1, "listagem de usuários de B não inclui o usuário de A");

    // ── alerta trial_ending ────────────────────────────────────────
    await prisma.tenant.update({
      where: { id: tenantA.id },
      data: { status: "trial", trial_ends_at: new Date(Date.now() + 1 * DAY) },
    });
    const gen1 = await generateAllAlerts();
    assert(gen1.alertsCreated >= 1, `geração cria ao menos 1 alerta no lote (obtido: ${gen1.alertsCreated})`);
    const trialAlertsA = await dbA.alert.findMany({ where: { alert_type: "trial_ending" } });
    assert(trialAlertsA.length === 1, "tenant A (trial vencendo em 1 dia, sem assinatura) recebe alerta trial_ending");

    const gen2 = await generateAllAlerts();
    const trialAlertsAAfter2 = await dbA.alert.findMany({ where: { alert_type: "trial_ending" } });
    assert(trialAlertsAAfter2.length === 1, "trial_ending não duplica numa 2ª geração no mesmo estado");
    void gen2;

    // Tenant com assinatura ativa não recebe trial_ending mesmo com trial vencendo.
    await prisma.tenant.update({
      where: { id: tenantB.id },
      data: { status: "trial", trial_ends_at: new Date(Date.now() + 1 * DAY) },
    });
    await dbB.subscription.update({ where: { id: subB.id }, data: { status: "active" } });
    await generateAllAlerts();
    const trialAlertsB = await dbB.alert.findMany({ where: { alert_type: "trial_ending" } });
    assert(trialAlertsB.length === 0, "tenant com assinatura (mesmo em trial) não recebe trial_ending");
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ Módulo 5: 0 falhas.");
  else console.error(`❌ Módulo 5: ${failures} falha(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("❌ Erro inesperado:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
