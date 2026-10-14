import * as c from "@tibe/contracts";
import * as E from "@/generated/prisma/enums";
import type { OrigemDoItem } from "@/lib/actions/meu-dia";
import { assert, tenantDaSecao, type SecaoDeContrato } from "../contratos";

const DIA = 86_400_000;

/**
 * As origens do Meu Dia não são enum do Prisma, e o cenário só materializa
 * três das sete (achado do Codex): quem prende o contrato à action é o
 * compilador. Origem a mais ou a menos de qualquer lado quebra o `tsc`.
 */
type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const origensIguais: Igual<c.MeuDiaOrigem, OrigemDoItem> = true;
void origensIguais;

export const secao: SecaoDeContrato = {
  titulo: "Tarefas e Meu Dia (Módulos 27 e 38)",
  enums: [
    ["TaskStatus", c.taskStatusSchema, E.TaskStatus],
    ["TaskRecurrence", c.taskRecurrenceSchema, E.TaskRecurrence],
  ],
  async roda() {
    const { prisma, scoped } = await import("@/lib/prisma");
    const { inicioDoDiaEmSaoPaulo } = await import("@/lib/dia-calendario");
    const { deleteTestTenants } = await import("../herd");
    const t = await tenantDaSecao("TMD");
    const rotas = {
      tasks: await import("@/app/api/v1/tasks/route"),
      meuDia: await import("@/app/api/v1/meu-dia/route"),
      financeiro: await import("@/app/api/v1/financial-entries/route"),
    };

    // Data de calendário (meio-dia UTC) do dia de hoje em São Paulo, mais `n` dias.
    const diaIso = (n: number) => new Date(inicioDoDiaEmSaoPaulo(new Date()).getTime() + 12 * 3_600_000 + n * DIA).toISOString();

    try {
      await t.cria("tarefa atrasada", rotas.tasks, "/api/v1/tasks", { title: "Atrasada TMD", due_date: diaIso(-2), property_id: t.fazenda.id });
      await t.cria("tarefa de hoje", rotas.tasks, "/api/v1/tasks", {
        title: "Hoje TMD",
        due_date: diaIso(0),
        due_time: "14:00",
        priority: "urgente",
        recurrence: "semanal",
        notes: "Nota TMD",
        assignee: "Zé",
      });
      await t.cria("tarefa de amanhã", rotas.tasks, "/api/v1/tasks", { title: "Amanhã TMD", due_date: diaIso(1), remind: true });
      await t.cria("tarefa sem data", rotas.tasks, "/api/v1/tasks", { title: "Sem data TMD" });
      await t.cria("conta a pagar", rotas.financeiro, "/api/v1/financial-entries", {
        entry_type: "expense",
        category: "Insumos",
        amount: 450,
        due_date: diaIso(0),
      });
      await t.db.alert.create({
        data: scoped({ alert_type: "low_stock", related_module: "geral", message: "Sal mineral TMD abaixo do mínimo", status: "pending" }),
      });

      console.log("   Tarefas");
      const lista = await t.confere("GET /tasks", rotas.tasks, "/api/v1/tasks", c.listTasksResponseSchema);
      assert(lista?.data.some((x) => x.effective_status === "overdue") === true, "GET /tasks: a atrasada vem com effective_status overdue");

      console.log("   Meu Dia");
      const dia = await t.confere("GET /meu-dia", rotas.meuDia, "/api/v1/meu-dia", c.getMeuDiaResponseSchema);
      const origens = new Set([dia?.data.atencao, dia?.data.hoje, dia?.data.proximos, dia?.data.sem_data].flatMap((s) => (s ?? []).map((i) => i.origem)));
      assert(origens.has("tarefa") && origens.has("pagar") && origens.has("estoque"), `GET /meu-dia: origens tarefa, pagar e estoque presentes (${[...origens].join(", ")})`);
    } finally {
      const where = { tenant_id: t.tenant.id };
      await prisma.task.deleteMany({ where });
      await prisma.alert.deleteMany({ where });
      await prisma.financialEntry.deleteMany({ where });
      await deleteTestTenants([t.tenant.id]);
    }
  },
};
