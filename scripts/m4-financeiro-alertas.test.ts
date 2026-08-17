import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import {
  createManualEntryAction,
  updateManualEntryAction,
  markEntryPaidAction,
} from "@/lib/actions/financial-entries";
import { getDre, getCashFlow, getUpcoming } from "@/lib/actions/financial-reports";
import { createLinkedEntry } from "@/lib/financial";
import { generateAllAlerts } from "@/lib/actions/alerts";
import { generateFinancialPdf } from "@/lib/reports/generate-financial-pdf";
import { signReportToken, verifyReportToken } from "@/lib/reports/report-token";
import { POST as executeAction } from "@/app/api/internal/whatsapp/execute-action/route";
import { GET as generateAlertsRoute } from "@/app/api/internal/jobs/generate-alerts/route";
import { getRedisConnection } from "@/lib/redis";

exigirBancoLocal();


/**
 * Testes do Módulo 4: lançamentos manuais (create/edit-restrito/pay), DRE,
 * fluxo de caixa, upcoming, geração/idempotência de alertas, isolamento entre
 * tenants, token de relatório e a rota de cron.
 * Roda: `npm run test:m4`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

const SECRET = process.env.INTERNAL_API_SECRET ?? "dev-internal-secret";
const CRON_SECRET = process.env.CRON_SECRET ?? "dev-cron-secret";

async function main() {
  console.log("🔒 Módulo 4: Financeiro e Alertas\n");

  const tenantA = await prisma.tenant.create({
    data: { name: "M4 Tenant A", document: "M4A000000001", plan: "grupo" },
  });
  const tenantB = await prisma.tenant.create({
    data: { name: "M4 Tenant B", document: "M4B000000002", plan: "grupo" },
  });
  const dbA = prismaForTenant(tenantA.id);
  const dbB = prismaForTenant(tenantB.id);

  try {
    // ── Lançamentos manuais ─────────────────────────────────────
    const created = await createManualEntryAction(dbA, {
      entry_type: "expense",
      category: "Combustível",
      amount: 300,
      due_date: new Date(),
      notes: "abastecimento",
    });
    assert(created.ok, "lançamento manual criado (related_module: geral)");
    const manualId = created.ok ? created.data.id : "";
    const manualEntry = await dbA.financialEntry.findFirst({ where: { id: manualId } });
    assert(manualEntry?.related_module === "geral", "lançamento manual nasce com related_module geral");

    const editOk = await updateManualEntryAction(dbA, manualId, { amount: 350 });
    assert(editOk.ok, "lançamento manual (geral) pode ser editado");

    // Lançamento AUTOMÁTICO (simulando o que M1/M2 criam): edição deve ser bloqueada.
    // status "pending" de propósito: testa que DRE (competência) inclui mesmo
    // não pago, enquanto fluxo de caixa (regime de caixa) não inclui.
    const autoEntry = await createLinkedEntry(dbA, {
      entry_type: "income",
      category: "Venda de animal",
      amount: 8000,
      related_module: "rebanho",
      related_id: "fake-animal-id",
      occurred_at: new Date(),
      status: "pending",
    });
    const editBlocked = await updateManualEntryAction(dbA, autoEntry.id, { amount: 1 });
    assert(
      !editBlocked.ok && editBlocked.code === "NOT_EDITABLE",
      "lançamento automático (rebanho) NÃO pode ser editado via updateManualEntryAction",
    );

    const paid = await markEntryPaidAction(dbA, manualId);
    assert(paid.ok, "lançamento manual marcado como pago");
    const doublePay = await markEntryPaidAction(dbA, manualId);
    assert(!doublePay.ok && doublePay.code === "ALREADY_PAID", "pagar 2x o mesmo lançamento é rejeitado");

    // ── DRE por módulo ───────────────────────────────────────────
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const dre = await getDre(dbA, { start: monthStart, end: monthEnd });
    const rebanhoRow = dre.by_module.find((m) => m.module === "rebanho")!;
    const geralRow = dre.by_module.find((m) => m.module === "geral")!;
    assert(rebanhoRow.total_income === 8000, `DRE rebanho.total_income = 8000 (obtido: ${rebanhoRow.total_income})`);
    assert(geralRow.total_expense === 350, `DRE geral.total_expense = 350 (obtido: ${geralRow.total_expense})`);
    assert(
      dre.by_module.length === 5,
      "DRE sempre retorna os 5 módulos (mesmo sem movimento; maquinas somado no Módulo 26)",
    );

    // ── Fluxo de caixa (regime de caixa: só pago) ────────────────
    const cashFlow = await getCashFlow(dbA, { start: monthStart, end: monthEnd, groupBy: "month" });
    const totalCashIncome = cashFlow.reduce((s, p) => s + p.income, 0);
    assert(totalCashIncome === 0, "fluxo de caixa NÃO inclui a venda (income) ainda pendente/não paga");
    const totalCashExpense = cashFlow.reduce((s, p) => s + p.expense, 0);
    assert(totalCashExpense === 350, `fluxo de caixa inclui a despesa PAGA de 350 (obtido: ${totalCashExpense})`);

    // ── Upcoming (contas a vencer em 7 dias) ─────────────────────
    await createManualEntryAction(dbA, {
      entry_type: "expense",
      category: "Manutenção",
      amount: 100,
      due_date: new Date(Date.now() + 3 * 86_400_000),
    });
    await createManualEntryAction(dbA, {
      entry_type: "expense",
      category: "Manutenção",
      amount: 999,
      due_date: new Date(Date.now() + 30 * 86_400_000), // fora da janela de 7 dias
    });
    const upcoming = await getUpcoming(dbA, 7);
    assert(
      upcoming.some((u) => u.amount === 100) && !upcoming.some((u) => u.amount === 999),
      "upcoming(7) inclui só o que vence em até 7 dias",
    );

    // ── Isolamento: tenant B não vê nada de A ────────────────────
    assert((await dbB.financialEntry.findMany()).length === 0, "tenant B não vê lançamentos de A");
    const crossPay = await markEntryPaidAction(dbB, manualId);
    assert(!crossPay.ok && crossPay.code === "NOT_FOUND", "tenant B não consegue marcar como pago um lançamento de A");

    // ── Token de relatório assinado ──────────────────────────────
    const token = signReportToken({ tenant_id: tenantA.id, start: monthStart.toISOString(), end: monthEnd.toISOString() }, 5);
    const verified = verifyReportToken(token);
    assert(verified?.tenant_id === tenantA.id, "token de relatório verifica corretamente");
    assert(verifyReportToken(`${token}tampered`) === null, "token adulterado é rejeitado");
    const expiredToken = signReportToken({ tenant_id: tenantA.id, start: monthStart.toISOString(), end: monthEnd.toISOString() }, -1);
    assert(verifyReportToken(expiredToken) === null, "token expirado é rejeitado");

    // ── PDF gerado tem conteúdo ───────────────────────────────────
    const pdfBytes = await generateFinancialPdf(dbA, { tenantName: tenantA.name, start: monthStart, end: monthEnd });
    assert(pdfBytes.length > 500, `PDF gerado tem conteúdo (${pdfBytes.length} bytes)`);
    assert(
      Buffer.from(pdfBytes.slice(0, 5)).toString("latin1") === "%PDF-",
      "arquivo gerado é um PDF válido (assinatura %PDF-)",
    );

    // ── gerar_relatorio (WhatsApp) devolve link real, não mais "em breve" ──
    const owner = await dbA.user.create({
      data: scoped({
        name: "Owner A",
        email: "m4-owner-a@test.local",
        password_hash: "x",
        role: "OWNER",
        phone: "5511900000099",
      }),
    });
    await dbA.tenantProfile.create({ data: scoped({ profile_type: "fazenda" }) });
    const reportReq = new Request("http://localhost/api/internal/whatsapp/execute-action", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": SECRET },
      body: JSON.stringify({
        tenant_id: tenantA.id,
        user_id: owner.id,
        intent: "gerar_relatorio",
        parameters: { tipo: "financeiro" },
      }),
    });
    const reportRes = await executeAction(reportReq);
    const reportBody = await reportRes.json();
    assert(
      typeof reportBody.data.report_url === "string" && reportBody.data.report_url.includes("token="),
      "gerar_relatorio (WhatsApp) devolve um report_url com token, não mais 'em breve'",
    );

    // ── Alertas: geração + idempotência ──────────────────────────
    await createManualEntryAction(dbA, {
      entry_type: "expense",
      category: "Teste alerta",
      amount: 50,
      due_date: new Date(Date.now() + 2 * 86_400_000),
    });
    const gen1 = await generateAllAlerts();
    assert(gen1.alertsCreated >= 1, `1ª geração cria ao menos 1 alerta (obtido: ${gen1.alertsCreated})`);
    const gen2 = await generateAllAlerts();
    assert(gen2.alertsCreated === 0, "2ª geração no mesmo estado NÃO duplica alertas");

    const alertsA = await dbA.alert.findMany();
    assert(alertsA.length > 0, "alertas ficam visíveis via client escopado do tenant A");
    assert((await dbB.alert.findMany()).length === 0, "tenant B não vê alertas de A");

    // ── Rota de cron: auth + lock diário ─────────────────────────
    const noAuthRes = await generateAlertsRoute(
      new Request("http://localhost/api/internal/jobs/generate-alerts"),
    );
    assert(noAuthRes.status === 401, "rota de cron sem Authorization -> 401");

    const cronReq = () =>
      generateAlertsRoute(
        new Request("http://localhost/api/internal/jobs/generate-alerts", {
          headers: { Authorization: `Bearer ${CRON_SECRET}` },
        }),
      );
    const firstRun = await (await cronReq()).json();
    const secondRun = await (await cronReq()).json();
    assert(!firstRun.data.skipped, "1ª chamada do dia executa (não fica marcada como skipped)");
    assert(secondRun.data.skipped === true, "2ª chamada do MESMO dia é pulada (lock funcionando)");

    // Limpa a chave de lock criada por este teste para não afetar execuções futuras hoje.
    const today = new Date().toISOString().slice(0, 10);
    await getRedisConnection().del(`tibe:alerts:generated:${today}`);
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ Módulo 4: 0 falhas.");
  else console.error(`❌ Módulo 4: ${failures} falha(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await getRedisConnection().quit();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("❌ Erro inesperado:", err);
    await prisma.$disconnect();
    await getRedisConnection().quit();
    process.exit(1);
  });
