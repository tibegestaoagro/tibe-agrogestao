import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import {
  createMachineAction,
  updateMachineAction,
  registerMaintenanceAction,
  listMachinesAction,
  getMachineWithMaintenancesAction,
} from "@/lib/actions/machines";
import { generateAlertsForTenant } from "@/lib/actions/alerts";
import { getAccessLevel } from "@/lib/permissions";

exigirBancoLocal();


/**
 * Teste do Módulo 26: máquinas e equipamentos
 * (docs/specs/module-26-maquinas-equipamentos.md). Roda: `npm run test:m27`
 * com o DATABASE_URL do Docker local.
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

async function main() {
  console.log("🚜 Módulo 26: máquinas e equipamentos\n");

  const tenantA = await prisma.tenant.create({
    data: { name: "M27 Tenant A", document: `M27A-${Date.now()}`, plan: "fazenda" },
  });
  const tenantB = await prisma.tenant.create({
    data: { name: "M27 Tenant B", document: `M27B-${Date.now()}`, plan: "fazenda" },
  });
  const dbA = prismaForTenant(tenantA.id);
  const dbB = prismaForTenant(tenantB.id);

  try {
    const propertyA = await dbA.property.create({ data: scoped({ name: "Fazenda A" }) });
    const propertyB = await dbB.property.create({ data: scoped({ name: "Fazenda B" }) });

    // ── Permissão (matriz PRD 5.2) ──────────────────────────────────────
    assert(getAccessLevel("VISUALIZADOR", "maquinas") === "read", "VISUALIZADOR só lê máquinas");
    assert(getAccessLevel("OPERADOR", "maquinas") === "write", "OPERADOR escreve em máquinas");
    assert(getAccessLevel("OWNER", "maquinas") === "write", "OWNER escreve em máquinas");

    // ── Cadastro de máquina ──────────────────────────────────────────────
    const invalidProperty = await createMachineAction(dbA, {
      property_id: "propriedade-inexistente",
      name: "Trator 1",
      type: "trator",
    });
    assert(
      !invalidProperty.ok && invalidProperty.code === "INVALID_PROPERTY",
      "rejeita propriedade inválida",
    );

    const created = await createMachineAction(dbA, {
      property_id: propertyA.id,
      name: "Trator 1",
      type: "trator",
      brand: "Massey Ferguson",
      year: 2020,
      acquisition_cost: 180000,
      hour_meter: 1200,
    });
    assert(created.ok, "cria máquina com custo de aquisição");

    if (created.ok) {
      const entries = await dbA.financialEntry.findMany({
        where: { related_module: "maquinas", related_id: created.data.id },
      });
      assert(
        entries.length === 1 && entries[0]!.entry_type === "expense" && Number(entries[0]!.amount) === 180000,
        "custo de aquisição gera despesa vinculada à máquina",
      );
    }

    const noCost = await createMachineAction(dbA, {
      property_id: propertyA.id,
      name: "Pulverizador 1",
      type: "pulverizador",
    });
    assert(noCost.ok, "cria máquina sem custo de aquisição");
    if (noCost.ok) {
      const entries = await dbA.financialEntry.findMany({
        where: { related_module: "maquinas", related_id: noCost.data.id },
      });
      assert(entries.length === 0, "máquina sem custo não gera lançamento financeiro nenhum");
    }

    // ── Registro de manutenção ──────────────────────────────────────────
    if (created.ok) {
      const machineId = created.data.id;
      const nextDue = new Date(Date.now() + 10 * 86_400_000); // daqui a 10 dias

      const maintenance = await registerMaintenanceAction(dbA, machineId, {
        description: "Troca de óleo e filtros",
        cost: 450,
        next_due_at: nextDue,
      });
      assert(maintenance.ok, "registra manutenção com custo e próxima data");

      if (maintenance.ok) {
        const entries = await dbA.financialEntry.findMany({
          where: { related_module: "maquinas", related_id: maintenance.data.id },
        });
        assert(
          entries.length === 1 && Number(entries[0]!.amount) === 450,
          "manutenção com custo gera despesa vinculada À MANUTENÇÃO (não à máquina)",
        );
      }

      const machine = await dbA.machine.findFirst({ where: { id: machineId } });
      assert(
        machine?.next_maintenance_at?.getTime() === nextDue.getTime(),
        "next_maintenance_at da máquina é atualizado pela manutenção registrada",
      );

      const secondMaintenance = await registerMaintenanceAction(dbA, machineId, {
        description: "Revisão geral",
      });
      assert(
        secondMaintenance.ok,
        "registra segunda manutenção sem custo e sem next_due_at (não obrigatório)",
      );
      const machineAfter = await dbA.machine.findFirst({ where: { id: machineId } });
      assert(
        machineAfter?.next_maintenance_at?.getTime() === nextDue.getTime(),
        "next_maintenance_at NÃO muda quando a manutenção não informa next_due_at (undefined preserva o valor)",
      );

      const withDetail = await getMachineWithMaintenancesAction(dbA, machineId);
      assert(
        withDetail?.maintenances.length === 2,
        "detalhe da máquina traz as 2 manutenções no histórico",
      );

      const updated = await updateMachineAction(dbA, machineId, { status: "maintenance" });
      assert(updated.ok, "atualiza status da máquina");
      const afterUpdate = await dbA.machine.findFirst({ where: { id: machineId } });
      assert(afterUpdate?.status === "maintenance", "status persistido corretamente");

      const invalidStatus = await updateMachineAction(dbA, machineId, {
        status: "inexistente" as never,
      });
      assert(!invalidStatus.ok, "rejeita status inválido");
    }

    const notFoundMaintenance = await registerMaintenanceAction(dbA, "maquina-inexistente", {
      description: "x",
    });
    assert(
      !notFoundMaintenance.ok && notFoundMaintenance.code === "NOT_FOUND",
      "manutenção em máquina inexistente falha com NOT_FOUND",
    );

    // ── Alerta maintenance_due ───────────────────────────────────────────
    const machineSoon = await createMachineAction(dbA, {
      property_id: propertyA.id,
      name: "Colheitadeira 1",
      type: "colheitadeira",
    });
    assert(machineSoon.ok, "cria máquina para teste de alerta");
    if (machineSoon.ok) {
      await registerMaintenanceAction(dbA, machineSoon.data.id, {
        description: "Revisão programada",
        next_due_at: new Date(Date.now() + 5 * 86_400_000), // dentro da janela de 15 dias
      });

      const machineFar = await createMachineAction(dbA, {
        property_id: propertyA.id,
        name: "Colheitadeira 2",
        type: "colheitadeira",
      });
      if (machineFar.ok) {
        await registerMaintenanceAction(dbA, machineFar.data.id, {
          description: "Revisão programada distante",
          next_due_at: new Date(Date.now() + 40 * 86_400_000), // fora da janela
        });
      }

      const result = await generateAlertsForTenant(tenantA.id);
      assert(result.created >= 1, `gera ao menos 1 alerta maintenance_due (obtido: ${result.created})`);

      const alert = await dbA.alert.findFirst({
        where: { alert_type: "maintenance_due", related_id: machineSoon.data.id },
      });
      assert(alert !== null, "alerta maintenance_due criado para a máquina dentro da janela de 15 dias");

      const alertFar =
        machineFar.ok &&
        (await dbA.alert.findFirst({
          where: { alert_type: "maintenance_due", related_id: machineFar.data.id },
        }));
      assert(!alertFar, "máquina com manutenção fora da janela de 15 dias NÃO gera alerta");

      const secondRun = await generateAlertsForTenant(tenantA.id);
      const alertsAfterSecondRun = await dbA.alert.count({
        where: { alert_type: "maintenance_due", related_id: machineSoon.data.id },
      });
      assert(
        alertsAfterSecondRun === 1,
        `segunda geração NÃO duplica o alerta (obtido: ${alertsAfterSecondRun}, +${secondRun.created} nesta rodada)`,
      );
    }

    // ── Isolamento multi-tenant ──────────────────────────────────────────
    const machineB = await createMachineAction(dbB, {
      property_id: propertyB.id,
      name: "Trator B",
      type: "trator",
    });
    assert(machineB.ok, "tenant B cria a própria máquina");

    const listA = await listMachinesAction(dbA);
    const listB = await listMachinesAction(dbB);
    assert(
      !listA.some((m) => m.name === "Trator B") && !listB.some((m) => m.name === "Trator 1"),
      "tenant A não vê máquina de B, e vice-versa",
    );

    if (machineB.ok) {
      const crossTenant = await dbA.machine.findFirst({ where: { id: machineB.data.id } });
      assert(crossTenant === null, "findFirst de A pelo id de uma máquina de B retorna null");
    }
  } finally {
    await prisma.financialEntry.deleteMany({
      where: { tenant_id: { in: [tenantA.id, tenantB.id] } },
    });
    await prisma.alert.deleteMany({ where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.machineMaintenance.deleteMany({
      where: { tenant_id: { in: [tenantA.id, tenantB.id] } },
    });
    await prisma.machine.deleteMany({ where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.property.deleteMany({ where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ Módulo 26: 0 falhas.");
  else console.error(`❌ Módulo 26: ${failures} falha(s).`);
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
