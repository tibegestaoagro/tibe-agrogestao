import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { createTaskAction, updateTaskStatusAction, listTasksAction, serializeTask } from "@/lib/actions/tasks";
import { generateAlertsForTenant } from "@/lib/actions/alerts";
import { POST as executeAction } from "@/app/api/internal/whatsapp/execute-action/route";

exigirBancoLocal();


/**
 * Teste do Módulo 27: Meu Dia (tarefas e compromissos)
 * (docs/specs/module-27-meu-dia.md). Roda: `npm run test:m28` com o
 * DATABASE_URL do Docker local.
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

// Mesmo espírito do M24/M25: não depender da presença/ausência de
// INTERNAL_API_SECRET no .env de quem roda o teste.
process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? "m28-test-internal-secret";
const SECRET = process.env.INTERNAL_API_SECRET;

async function callExecute(input: {
  tenant_id: string;
  user_id: string;
  intent: string;
  parameters?: Record<string, unknown>;
  confirmed?: boolean;
}) {
  const req = new Request("http://localhost/api/internal/whatsapp/execute-action", {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": SECRET },
    body: JSON.stringify({ parameters: {}, ...input }),
  });
  const res = await executeAction(req);
  return { status: res.status, body: await res.json() };
}

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86_400_000);
}

async function main() {
  console.log("📌 Módulo 27: Meu Dia (tarefas e compromissos)\n");

  const tenantA = await prisma.tenant.create({
    data: { name: "M28 Tenant A", document: `M28A-${Date.now()}`, plan: "fazenda" },
  });
  const tenantB = await prisma.tenant.create({
    data: { name: "M28 Tenant B", document: `M28B-${Date.now()}`, plan: "fazenda" },
  });
  const dbA = prismaForTenant(tenantA.id);
  const dbB = prismaForTenant(tenantB.id);

  const ownerA = await dbA.user.create({
    data: {
      tenant_id: tenantA.id,
      name: "Dono A",
      email: `m28-owner-a-${Date.now()}@teste.com`,
      password_hash: "x",
      role: "OWNER",
      active: true,
    },
  });
  const viewerA = await dbA.user.create({
    data: {
      tenant_id: tenantA.id,
      name: "Visualizador A",
      email: `m28-viewer-a-${Date.now()}@teste.com`,
      password_hash: "x",
      role: "VISUALIZADOR",
      active: true,
    },
  });

  try {
    // ── CRUD básico ──────────────────────────────────────────────────────
    const noTitle = await createTaskAction(dbA, { title: "  ", due_date: daysFromNow(1) });
    assert(!noTitle.ok, "rejeita título vazio");

    const created = await createTaskAction(dbA, {
      title: "Comprar sal mineral",
      due_date: daysFromNow(3),
      created_by: ownerA.id,
    });
    assert(created.ok, "cria tarefa com sucesso");

    if (created.ok) {
      const listed = await listTasksAction(dbA);
      const row = listed.find((t) => t.id === created.data.id)!;
      assert(row.status === "pending", "tarefa nasce pendente");
      assert(row.created_by === ownerA.id, "guarda quem criou como metadado");
      const ser = serializeTask(row);
      assert(ser.effective_status === "pending", "effective_status = pending (data futura)");

      const completed = await updateTaskStatusAction(dbA, created.data.id, "completed");
      assert(completed.ok, "conclui tarefa");
      const afterComplete = await dbA.task.findFirst({ where: { id: created.data.id } });
      assert(afterComplete?.status === "completed", "status persistido como completed");

      const invalidStatus = await updateTaskStatusAction(dbA, created.data.id, "xyz" as never);
      assert(!invalidStatus.ok, "rejeita status inválido");
    }

    const notFound = await updateTaskStatusAction(dbA, "tarefa-inexistente", "completed");
    assert(!notFound.ok && notFound.code === "NOT_FOUND", "tarefa inexistente falha com NOT_FOUND");

    // ── "Atrasada" é calculada, nunca gravada ──────────────────────────────
    const overdueCreated = await createTaskAction(dbA, {
      title: "Tarefa vencida",
      due_date: daysFromNow(-2),
    });
    assert(overdueCreated.ok, "cria tarefa com data no passado");
    if (overdueCreated.ok) {
      const row = await dbA.task.findFirst({ where: { id: overdueCreated.data.id } });
      assert(row?.status === "pending", "status gravado continua 'pending', nunca 'overdue'");
      const ser = serializeTask(row!);
      assert(ser.effective_status === "overdue", "effective_status calculado como 'overdue'");
    }

    // ── Tarefa compartilhada (não privada por usuário) ─────────────────────
    const bothSee = await listTasksAction(dbA);
    assert(
      bothSee.some((t) => t.title === "Comprar sal mineral") &&
        bothSee.some((t) => t.title === "Tarefa vencida"),
      "listagem não filtra por quem criou: qualquer usuário do tenant vê todas",
    );

    // ── Alerta task_reminder: dispara NO DIA, não com antecedência ──────────
    const today = new Date();
    today.setHours(12, 0, 0, 0); // meio-dia de hoje, dentro da janela 00h-23h59
    const dueToday = await createTaskAction(dbA, { title: "Lembrete de hoje", due_date: today });
    const dueFuture = await createTaskAction(dbA, { title: "Lembrete futuro", due_date: daysFromNow(5) });
    const dueNoRemind = await createTaskAction(dbA, {
      title: "Sem lembrete",
      due_date: today,
      remind: false,
    });
    assert(dueToday.ok && dueFuture.ok && dueNoRemind.ok, "cria as 3 tarefas de teste de alerta");

    const genResult = await generateAlertsForTenant(tenantA.id);
    assert(genResult.created >= 1, `gera ao menos 1 alerta task_reminder (obtido: ${genResult.created})`);

    if (dueToday.ok) {
      const alertToday = await dbA.alert.findFirst({
        where: { alert_type: "task_reminder", related_id: dueToday.data.id },
      });
      assert(alertToday !== null, "tarefa com due_date HOJE gera alerta task_reminder");
      const taskAfter = await dbA.task.findFirst({ where: { id: dueToday.data.id } });
      assert(taskAfter?.reminded_at !== null, "reminded_at marcado após gerar o alerta");
    }
    if (dueFuture.ok) {
      const alertFuture = await dbA.alert.findFirst({
        where: { alert_type: "task_reminder", related_id: dueFuture.data.id },
      });
      assert(alertFuture === null, "tarefa com due_date NO FUTURO não gera alerta (dispara só no dia)");
    }
    if (dueNoRemind.ok) {
      const alertNoRemind = await dbA.alert.findFirst({
        where: { alert_type: "task_reminder", related_id: dueNoRemind.data.id },
      });
      assert(alertNoRemind === null, "tarefa com remind: false não gera alerta mesmo vencendo hoje");
    }

    const secondRun = await generateAlertsForTenant(tenantA.id);
    if (dueToday.ok) {
      const countAfterSecondRun = await dbA.alert.count({
        where: { alert_type: "task_reminder", related_id: dueToday.data.id },
      });
      assert(
        countAfterSecondRun === 1,
        `segunda geração não duplica o alerta (obtido: ${countAfterSecondRun}, +${secondRun.created} nesta rodada)`,
      );
    }

    // ── Intenção WhatsApp criar_tarefa ──────────────────────────────────────
    const noParams = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "criar_tarefa",
      parameters: {},
    });
    assert(
      noParams.body.data?.action_taken === "clarification_requested",
      "sem título/data, o agente pede esclarecimento em vez de assumir",
    );

    const dueDateIso = daysFromNow(4).toISOString();
    const askConfirm = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "criar_tarefa",
      parameters: { title: "Comprar arame", due_date: dueDateIso },
    });
    assert(
      askConfirm.body.data?.requires_confirmation === true,
      "pede confirmação com resumo antes de gravar (mesmo padrão das outras intenções)",
    );

    const beforeConfirm = (await listTasksAction(dbA)).length;
    const confirmed = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "criar_tarefa",
      parameters: { title: "Comprar arame", due_date: dueDateIso },
      confirmed: true,
    });
    assert(confirmed.status === 200, "confirmação ('sim') responde sucesso");
    const afterConfirm = (await listTasksAction(dbA)).length;
    assert(afterConfirm === beforeConfirm + 1, "confirmação cria exatamente 1 tarefa nova");

    const createdViaWhatsapp = (await listTasksAction(dbA)).find((t) => t.title === "Comprar arame");
    assert(!!createdViaWhatsapp, "tarefa criada via WhatsApp aparece na listagem do painel");

    // Perfil sem permissão (VISUALIZADOR não escreve em "tarefas").
    const forbidden = await callExecute({
      tenant_id: tenantA.id,
      user_id: viewerA.id,
      intent: "criar_tarefa",
      parameters: { title: "Não deveria criar", due_date: dueDateIso },
      confirmed: true,
    });
    assert(
      forbidden.body.data?.action_taken === "criar_tarefa:sem_permissao",
      "VISUALIZADOR não tem permissão para criar tarefa pelo WhatsApp",
    );

    // ── Isolamento multi-tenant ──────────────────────────────────────────
    const taskB = await createTaskAction(dbB, { title: "Tarefa de B", due_date: daysFromNow(1) });
    assert(taskB.ok, "tenant B cria a própria tarefa");
    const listA = await listTasksAction(dbA);
    const listB = await listTasksAction(dbB);
    assert(
      !listA.some((t) => t.title === "Tarefa de B") && !listB.some((t) => t.title === "Comprar sal mineral"),
      "tenant A não vê tarefa de B, e vice-versa",
    );
    if (taskB.ok) {
      const crossTenant = await dbA.task.findFirst({ where: { id: taskB.data.id } });
      assert(crossTenant === null, "findFirst de A pelo id de uma tarefa de B retorna null");
    }
  } finally {
    await prisma.alert.deleteMany({ where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.task.deleteMany({ where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.user.deleteMany({ where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ Módulo 27: 0 falhas.");
  else console.error(`❌ Módulo 27: ${failures} falha(s).`);
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
