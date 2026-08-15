import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma } from "@/lib/prisma";
import { TENANT_SCOPED_MODELS } from "@/lib/prisma";
import { calculateMRR, calculateChurn, calculateLTV, calculateFunnel } from "@/lib/platform/kpis";
import { forceSubscriptionStatusAction } from "@/lib/actions/platform-tenants";
import { inviteTeamMemberAction, updateTeamMemberRoleAction, setTeamMemberActiveAction } from "@/lib/actions/platform-team";

exigirBancoLocal();


/**
 * Testes do Módulo 6: isolamento de PlatformUser/SubscriptionStatusLog,
 * cálculo de MRR/churn/LTV/funil (com histórico simulado via datas
 * retroativas), força manual de status + log de auditoria, e ações de
 * equipe da plataforma.
 * Roda: `npm run test:m6`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function main() {
  console.log("🔒 Módulo 6: Painel da Plataforma\n");

  // ── Isolamento estrutural ──────────────────────────────────────
  assert(!TENANT_SCOPED_MODELS.has("PlatformUser"), "PlatformUser NÃO está em TENANT_SCOPED_MODELS");
  assert(!TENANT_SCOPED_MODELS.has("SubscriptionStatusLog"), "SubscriptionStatusLog NÃO está em TENANT_SCOPED_MODELS");

  const createdTenantIds: string[] = [];
  const createdPlatformUserIds: string[] = [];

  // Baseline ANTES de criar os tenants de teste: o funil escaneia TODOS os
  // tenants do banco (é o próprio ponto do módulo), então num banco de dev
  // compartilhado (seed, tenants de outros testes) a contagem absoluta não é
  // confiável: as asserções de funil comparam o DELTA baseline→depois.
  const funnelBaseline = await calculateFunnel("30d");
  const bucketOf = (f: Awaited<ReturnType<typeof calculateFunnel>>, source: string | null) =>
    f.by_source.find((s) => s.utm_source === source) ?? { trials_created: 0, converted: 0 };

  try {
    // ── Cenário: 3 tenants com históricos distintos ──────────────
    // A: trial há 10 dias, assinatura campo ativada há 8 dias (converteu dentro de 30d), direto (sem UTM).
    const tenantA = await prisma.tenant.create({
      data: { name: "M6 Tenant A", document: "M6A000000001", plan: "campo", status: "active", created_at: daysAgo(10) },
    });
    const subA = await prisma.subscription.create({
      data: { tenant_id: tenantA.id, plan: "campo", status: "active", created_at: daysAgo(10) },
    });
    await prisma.subscriptionStatusLog.create({
      data: { subscription_id: subA.id, from_status: null, to_status: "overdue", created_at: daysAgo(10) },
    });
    await prisma.subscriptionStatusLog.create({
      data: { subscription_id: subA.id, from_status: "overdue", to_status: "active", created_at: daysAgo(8) },
    });

    // B: trial há 40 dias (fora da janela de 30d), fazenda ativada há 35 dias, CANCELADA há 5 dias.
    const tenantB = await prisma.tenant.create({
      data: { name: "M6 Tenant B", document: "M6B000000002", plan: "fazenda", status: "canceled", created_at: daysAgo(40) },
    });
    const subB = await prisma.subscription.create({
      data: { tenant_id: tenantB.id, plan: "fazenda", status: "canceled", created_at: daysAgo(40) },
    });
    await prisma.subscriptionStatusLog.create({
      data: { subscription_id: subB.id, from_status: null, to_status: "overdue", created_at: daysAgo(40) },
    });
    await prisma.subscriptionStatusLog.create({
      data: { subscription_id: subB.id, from_status: "overdue", to_status: "active", created_at: daysAgo(35) },
    });
    await prisma.subscriptionStatusLog.create({
      data: { subscription_id: subB.id, from_status: "active", to_status: "canceled", created_at: daysAgo(5) },
    });

    // C: trial há 3 dias, sem assinatura, veio do Instagram.
    const tenantC = await prisma.tenant.create({
      data: {
        name: "M6 Tenant C",
        document: "M6C000000003",
        plan: "grupo",
        status: "trial",
        created_at: daysAgo(3),
        lead_source_utm_source: "instagram",
      },
    });
    createdTenantIds.push(tenantA.id, tenantB.id, tenantC.id);

    // ── MRR ────────────────────────────────────────────────────────
    const mrr = await calculateMRR();
    assert(mrr.total_mrr === 97, `MRR atual = 97 (só tenant A ativo, campo): obtido: ${mrr.total_mrr}`);
    assert(mrr.by_plan.campo === 97 && mrr.by_plan.fazenda === 0, "MRR por plano correto (fazenda de B não conta, cancelada)");
    assert(mrr.active_subscriptions_count === 1, "1 assinatura ativa");

    // ── Churn 30d ─────────────────────────────────────────────────
    const churn = await calculateChurn("30d");
    assert(
      churn.canceled_count === 1,
      `1 cancelamento nos últimos 30 dias (tenant B, há 5 dias): obtido: ${churn.canceled_count}`,
    );
    // Ativos no início do período (30d atrás): só B (A só existiu a partir de 10 dias atrás).
    assert(
      churn.customer_churn_pct === 100,
      `customer_churn = 1 cancelado / 1 ativo no início = 100%: obtido: ${churn.customer_churn_pct}`,
    );
    assert(
      churn.mrr_churn_pct === 100,
      `mrr_churn = 100% (todo MRR do início do período, só B/fazenda, foi perdido): obtido: ${churn.mrr_churn_pct}`,
    );

    // ── LTV ────────────────────────────────────────────────────────
    const ltv = await calculateLTV();
    assert(ltv.avg_ticket_mensal === 97, `ticket médio mensal = 97: obtido: ${ltv.avg_ticket_mensal}`);
    assert(ltv.ltv === 97, `LTV = ticket(97) / churn(100%) = 97: obtido: ${ltv.ltv}`);

    // ── Funil 30d (deltas relativos ao baseline: ver comentário acima) ──
    const funnel = await calculateFunnel("30d");
    const trialsDelta = funnel.trials_created - funnelBaseline.trials_created;
    const convertedDelta = funnel.converted_to_paid - funnelBaseline.converted_to_paid;
    assert(
      trialsDelta === 2,
      `+2 trials criados nos últimos 30 dias (A e C; B está fora da janela): delta obtido: ${trialsDelta}`,
    );
    assert(convertedDelta === 1, `+1 conversão no período (A): delta obtido: ${convertedDelta}`);
    // Média não é aditiva: recompõe a média esperada a partir do baseline +
    // a nova conversão de A (2 dias), em vez de comparar direto com "2".
    const expectedAvg =
      (funnelBaseline.avg_days_to_convert * funnelBaseline.converted_to_paid + 2 * 1) /
      (funnelBaseline.converted_to_paid + 1);
    assert(
      Math.abs(funnel.avg_days_to_convert - expectedAvg) < 0.01,
      `tempo médio de conversão recompõe corretamente com o baseline (esperado: ${expectedAvg.toFixed(2)}, obtido: ${funnel.avg_days_to_convert})`,
    );

    const directBefore = bucketOf(funnelBaseline, null);
    const directAfter = bucketOf(funnel, null);
    const instaBefore = bucketOf(funnelBaseline, "instagram");
    const instaAfter = bucketOf(funnel, "instagram");
    assert(
      directAfter.trials_created - directBefore.trials_created === 1 &&
        directAfter.converted - directBefore.converted === 1,
      "bucket 'sem origem' (A) recebeu +1 trial e +1 conversão",
    );
    assert(
      instaAfter.trials_created - instaBefore.trials_created === 1 && instaAfter.converted - instaBefore.converted === 0,
      "bucket 'instagram' (C) recebeu +1 trial e +0 conversão",
    );

    // ── Força manual de status (6.9) + log de auditoria ───────────
    const platformUser = await prisma.platformUser.create({
      data: { name: "M6 Admin", email: "m6-admin@test.local", password_hash: "x", role: "MASTER_ADMIN" },
    });
    createdPlatformUserIds.push(platformUser.id);

    const forced = await forceSubscriptionStatusAction({
      tenantId: tenantA.id,
      newStatus: "overdue",
      reason: "teste automatizado",
      platformUserId: platformUser.id,
    });
    assert(forced.ok && forced.data.status === "overdue", "forceSubscriptionStatusAction muda o status");

    const auditLog = await prisma.subscriptionStatusLog.findFirst({
      where: { subscription_id: subA.id, changed_by_platform_user_id: platformUser.id },
    });
    assert(
      auditLog?.to_status === "overdue" && auditLog?.reason === "teste automatizado",
      "mudança manual grava log de auditoria com PlatformUser responsável e motivo",
    );

    const noChange = await forceSubscriptionStatusAction({
      tenantId: tenantA.id,
      newStatus: "overdue",
      reason: null,
      platformUserId: platformUser.id,
    });
    assert(!noChange.ok && noChange.code === "NO_CHANGE", "forçar o MESMO status é rejeitado (NO_CHANGE)");

    const noSub = await forceSubscriptionStatusAction({
      tenantId: tenantC.id,
      newStatus: "active",
      reason: null,
      platformUserId: platformUser.id,
    });
    assert(!noSub.ok && noSub.code === "NOT_FOUND", "forçar status de tenant sem assinatura é rejeitado (NOT_FOUND)");

    // ── Equipe da plataforma (6.10) ─────────────────────────────────
    const invite = await inviteTeamMemberAction({ name: "Membro Teste", email: "m6-membro@test.local", role: "EQUIPE" });
    assert(invite.ok && invite.data.temp_password.length > 0, "inviteTeamMemberAction cria membro com senha temporária");
    if (invite.ok) createdPlatformUserIds.push(invite.data.id);

    const dupInvite = await inviteTeamMemberAction({ name: "Outro", email: "m6-membro@test.local", role: "EQUIPE" });
    assert(!dupInvite.ok && dupInvite.code === "DUPLICATE_EMAIL", "convite com email já usado é rejeitado");

    if (invite.ok) {
      const roleUpdate = await updateTeamMemberRoleAction(invite.data.id, "MASTER_ADMIN");
      assert(roleUpdate.ok, "updateTeamMemberRoleAction promove o membro");

      const deactivate = await setTeamMemberActiveAction(invite.data.id, false);
      assert(deactivate.ok, "setTeamMemberActiveAction desativa o membro");
      const memberAfter = await prisma.platformUser.findUnique({ where: { id: invite.data.id } });
      assert(memberAfter?.active === false, "desativação persistida");
    }
  } finally {
    await prisma.subscriptionStatusLog.deleteMany({
      where: { subscription: { tenant_id: { in: createdTenantIds } } },
    });
    await prisma.subscription.deleteMany({ where: { tenant_id: { in: createdTenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    await prisma.platformUser.deleteMany({ where: { id: { in: createdPlatformUserIds } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ Módulo 6: 0 falhas.");
  else console.error(`❌ Módulo 6: ${failures} falha(s).`);
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
