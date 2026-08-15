import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import {
  createFinancialCategoryAction,
  updateFinancialCategoryAction,
  listFinancialCategoriesAction,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from "@/lib/actions/financial-categories";
import {
  postponeEntryDueDateAction,
  cancelEntryAction,
} from "@/lib/actions/financial-entries";
import {
  isAlertTypeEnabled,
  listAlertPreferencesAction,
  setAlertPreferenceAction,
} from "@/lib/actions/alert-preferences";
import { generateAlertsForTenant } from "@/lib/actions/alerts";

exigirBancoLocal();


/**
 * Teste do Módulo 28: ajustes financeiros e tela inicial reformulada
 * (docs/specs/module-28-ajustes-financeiros-e-dashboard.md). Roda:
 * `npm run test:m29` com o DATABASE_URL do Docker local.
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86_400_000);
}

async function main() {
  console.log("💰 Módulo 28: ajustes financeiros e tela inicial\n");

  const tenantA = await prisma.tenant.create({
    data: { name: "M29 Tenant A", document: `M29A-${Date.now()}`, plan: "fazenda" },
  });
  const tenantB = await prisma.tenant.create({
    data: { name: "M29 Tenant B", document: `M29B-${Date.now()}`, plan: "fazenda" },
  });
  const dbA = prismaForTenant(tenantA.id);
  const dbB = prismaForTenant(tenantB.id);

  try {
    // ── Categorias financeiras: provisionamento e CRUD ──────────────────
    const seeded = await listFinancialCategoriesAction(dbA);
    assert(
      seeded.length === DEFAULT_EXPENSE_CATEGORIES.length + DEFAULT_INCOME_CATEGORIES.length,
      "categorias padrão semeadas (despesa + receita) na primeira leitura",
    );
    const expenseOnly = await listFinancialCategoriesAction(dbA, { entry_type: "expense" });
    assert(
      expenseOnly.length === DEFAULT_EXPENSE_CATEGORIES.length &&
        expenseOnly.every((c) => c.entry_type === "expense"),
      "filtro por entry_type funciona (só despesa)",
    );

    const created = await createFinancialCategoryAction(dbA, { name: "Frete", entry_type: "expense" });
    assert(created.ok, "cria categoria de despesa customizada");
    const dup = await createFinancialCategoryAction(dbA, { name: "frete", entry_type: "expense" });
    assert(!dup.ok && dup.code === "DUPLICATE_CATEGORY", "rejeita nome duplicado no MESMO tipo (case-insensitive)");
    const sameNameOtherType = await createFinancialCategoryAction(dbA, { name: "Frete", entry_type: "income" });
    assert(sameNameOtherType.ok, "mesmo nome em tipo DIFERENTE (receita) não colide com despesa");

    if (created.ok) {
      const renamed = await updateFinancialCategoryAction(dbA, created.data.id, { name: "Frete e transporte" });
      assert(renamed.ok && renamed.data.name === "Frete e transporte", "renomeia categoria");
      const deactivated = await updateFinancialCategoryAction(dbA, created.data.id, { active: false });
      assert(deactivated.ok ? deactivated.data.active === false : false, "desativa categoria");
    }

    // ── Adiar vencimento e cancelar: qualquer origem ─────────────────────
    const manualEntry = await dbA.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Combustível",
        amount: 300,
        related_module: "geral",
        due_date: daysFromNow(5),
        status: "pending",
      }),
    });
    const autoEntry = await dbA.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Manutenção",
        amount: 450,
        related_module: "maquinas", // origem automática, NÃO "geral"
        related_id: "maquina-fake-m29",
        due_date: daysFromNow(3),
        status: "pending",
      }),
    });

    const newDate = daysFromNow(20);
    const postponed = await postponeEntryDueDateAction(dbA, autoEntry.id, newDate);
    assert(postponed.ok, "adia vencimento de lançamento AUTOMÁTICO (related_module != geral), sem NOT_EDITABLE");
    const afterPostpone = await dbA.financialEntry.findFirst({ where: { id: autoEntry.id } });
    assert(afterPostpone?.due_date?.getTime() === newDate.getTime(), "due_date persistido corretamente");

    const cancelled = await cancelEntryAction(dbA, autoEntry.id);
    assert(cancelled.ok, "cancela lançamento AUTOMÁTICO, sem restrição de origem");
    const afterCancel = await dbA.financialEntry.findFirst({ where: { id: autoEntry.id } });
    assert(afterCancel?.status === "cancelled", "status persistido como cancelled");
    assert(
      afterCancel?.category === "Manutenção" && Number(afterCancel.amount) === 450,
      "cancelar não mexe em categoria/valor, só no status",
    );

    const doubleCancel = await cancelEntryAction(dbA, autoEntry.id);
    assert(!doubleCancel.ok && doubleCancel.code === "ALREADY_CANCELLED", "cancelar 2x falha com ALREADY_CANCELLED");

    const postponeAlreadyPaid = await dbA.financialEntry.update({
      where: { id: manualEntry.id },
      data: { status: "paid", paid_at: new Date() },
    });
    const postponePaid = await postponeEntryDueDateAction(dbA, postponeAlreadyPaid.id, daysFromNow(1));
    assert(!postponePaid.ok && postponePaid.code === "NOT_PENDING", "não adia vencimento de lançamento já pago");

    const notFoundCancel = await cancelEntryAction(dbA, "lancamento-inexistente-m29");
    assert(!notFoundCancel.ok && notFoundCancel.code === "NOT_FOUND", "cancelar lançamento inexistente falha com NOT_FOUND");

    // ── Preferência de alerta: por tipo, some sozinha sem gravar tudo ────
    const defaultPrefs = await listAlertPreferencesAction(dbA);
    assert(
      defaultPrefs.length === 8 && defaultPrefs.every((p) => p.enabled === true),
      "todos os 8 tipos habilitados por padrão, mesmo sem nenhuma linha gravada",
    );
    assert(await isAlertTypeEnabled(dbA, "bill_due"), "isAlertTypeEnabled: bill_due habilitado por padrão");

    const disabled = await setAlertPreferenceAction(dbA, "bill_due", false);
    assert(disabled.ok, "desliga o tipo bill_due");
    assert(!(await isAlertTypeEnabled(dbA, "bill_due")), "bill_due agora desabilitado");
    assert(await isAlertTypeEnabled(dbA, "low_balance"), "low_balance continua habilitado (não afetado)");

    // Cria um lançamento pendente que geraria bill_due se estivesse ligado,
    // e um saldo negativo pra confirmar que low_balance CONTINUA disparando.
    await dbA.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Teste alerta",
        amount: 9999999,
        related_module: "geral",
        due_date: daysFromNow(1),
        status: "pending",
      }),
    });
    const billsBefore = await dbA.alert.count({ where: { alert_type: "bill_due" } });
    const balanceBefore = await dbA.alert.count({ where: { alert_type: "low_balance" } });
    await generateAlertsForTenant(tenantA.id);
    const billsAfter = await dbA.alert.count({ where: { alert_type: "bill_due" } });
    const balanceAfter = await dbA.alert.count({ where: { alert_type: "low_balance" } });
    assert(billsAfter === billsBefore, "bill_due desabilitado: geração NÃO cria alerta desse tipo, mesmo com conta elegível");
    assert(balanceAfter > balanceBefore, "low_balance continua gerando normalmente (preferência não afeta outros tipos)");

    // Reabilita e confirma que volta a gerar.
    await setAlertPreferenceAction(dbA, "bill_due", true);
    assert(await isAlertTypeEnabled(dbA, "bill_due"), "reabilitado com sucesso");
    const alertPref = await dbA.alertPreference.findFirst({ where: { alert_type: "bill_due" } });
    assert(alertPref?.enabled === true, "linha gravada com enabled: true após reabilitar (não vira ausência de linha)");

    // ── Isolamento multi-tenant ──────────────────────────────────────────
    const prefB = await listAlertPreferencesAction(dbB);
    assert(
      prefB.every((p) => p.enabled === true),
      "tenant B não é afetado pela preferência desligada em A (isolamento)",
    );

    const catB = await createFinancialCategoryAction(dbB, { name: "Categoria de B", entry_type: "expense" });
    assert(catB.ok, "tenant B cria a própria categoria");
    const listA = await listFinancialCategoriesAction(dbA);
    assert(
      !listA.some((c) => c.name === "Categoria de B"),
      "tenant A não vê categoria de B",
    );

    if (catB.ok) {
      const crossTenant = await dbA.financialCategory.findFirst({ where: { id: catB.data.id } });
      assert(crossTenant === null, "findFirst de A pelo id de uma categoria de B retorna null");
    }
  } finally {
    await prisma.alert.deleteMany({ where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.alertPreference.deleteMany({ where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.financialEntry.deleteMany({ where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.financialCategory.deleteMany({ where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ Módulo 28: 0 falhas.");
  else console.error(`❌ Módulo 28: ${failures} falha(s).`);
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
