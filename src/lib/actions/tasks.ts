import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { inicioDoDiaEmSaoPaulo, prazoVencido } from "@/lib/dia-calendario";

/**
 * Lógica de negócio de Task (Módulo 27, ampliada no Módulo 38, Meu Dia).
 * Compartilhada dentro do tenant: nenhuma função aqui filtra por usuário, de
 * propósito (spec §2.4). "Atrasada" nunca é gravada: computada em
 * `effectiveStatus()` a partir de `status: "pending"` + `due_date` cujo DIA já
 * passou.
 *
 * Os nomes seguem o inglês que o arquivo já usava, e não o `criarTarefaAction`
 * da spec do Módulo 38: renomear quebraria quatro consumidores sem mudar
 * comportamento nenhum, e o que a spec fixa é o contrato das rotas.
 */

const TASK_STATUSES = ["pending", "completed", "cancelled"] as const;
export type TaskStatusInput = (typeof TASK_STATUSES)[number];
export type EffectiveStatus = TaskStatusInput | "overdue";

export const TASK_RECURRENCES = ["diaria", "semanal", "mensal"] as const;
export type TaskRecurrenceInput = (typeof TASK_RECURRENCES)[number];

export const TASK_PRIORITIES = ["normal", "urgente"] as const;
export type TaskPriorityInput = (typeof TASK_PRIORITIES)[number];

/*
 * ⚠️ Módulo 38, decisão 19: tarefa SEM DATA nunca é "Atrasada", porque não há
 * prazo a estourar. Esta checagem entrou no mesmo commit da migração que
 * tornou `due_date` opcional, e não depois.
 *
 * Provado em 14/09 removendo a guarda: `prazoVencido` recebe nulo e ESTOURA
 * ("Cannot read properties of null"). Como `serializeTask` roda para cada
 * linha da listagem, uma única tarefa sem data derrubaria a página inteira do
 * Meu Dia, e não só a linha dela.
 */
function effectiveStatus(
  task: { status: TaskStatusInput; due_date: Date | null },
  now = new Date(),
): EffectiveStatus {
  if (task.status === "pending" && task.due_date !== null && prazoVencido(task.due_date, now)) {
    return "overdue";
  }
  return task.status;
}

export function serializeTask(t: {
  id: string;
  title: string;
  due_date: Date | null;
  remind: boolean;
  status: string;
  created_by: string | null;
  created_at: Date;
  due_time?: string | null;
  worker_id?: string | null;
  assignee?: string | null;
  priority?: string;
  property_id?: string | null;
  notes?: string | null;
  recurrence?: string | null;
}) {
  return {
    id: t.id,
    title: t.title,
    due_date: t.due_date?.toISOString() ?? null,
    due_time: t.due_time ?? null,
    worker_id: t.worker_id ?? null,
    assignee: t.assignee ?? null,
    priority: t.priority ?? "normal",
    property_id: t.property_id ?? null,
    notes: t.notes ?? null,
    recurrence: t.recurrence ?? null,
    remind: t.remind,
    status: t.status,
    effective_status: effectiveStatus({ status: t.status as TaskStatusInput, due_date: t.due_date }),
    created_by: t.created_by,
    created_at: t.created_at.toISOString(),
  };
}

/**
 * A próxima data de uma tarefa recorrente, pelo padrão ROLANTE (decisão 25).
 *
 * Avança a data pelo intervalo até ela cair DEPOIS de hoje. "Toda segunda
 * conferir os bebedouros" concluída numa quarta, com a última segunda
 * esquecida, nasce na PRÓXIMA segunda, e não na que já passou.
 *
 * ⚠️ **Consequência aceita de olhos abertos:** quem pula três segundas seguidas
 * fica com UMA pendência, não três. Para tarefa de rotina isso está certo, e o
 * contrário entulharia a tela com o que já não adianta fazer.
 *
 * ⚠️ **O mensal nos dias 29, 30 e 31 DERIVA, e isso foi medido, não suposto.**
 * "Todo dia 31" em fevereiro cai no dia 28, que está certo: não vira 3 de
 * março, que é o que `setUTCMonth` faria sozinho. Mas a tarefa de fevereiro
 * nasce com dia 28, e a de março parte DELA: a cadeia real 31/01, 28/02, 28/03
 * nunca volta ao 31. Provado em 14/09 encadeando duas conclusões.
 *
 * ponytail: deriva do fim de mês na recorrência mensal, porque não há onde
 * guardar o dia original. Corrigir exige uma coluna `recurrence_day`, e vale
 * quando alguém pedir "todo dia 31". "Todo dia 5 pagar João", que é o exemplo
 * do §24, não é afetado.
 *
 * Exportada para a suíte: a deriva só se prova com data fixa.
 */
export function proximaOcorrencia(
  dataAtual: Date,
  recorrencia: TaskRecurrenceInput,
  agora = new Date(),
): Date {
  const hoje = inicioDoDiaEmSaoPaulo(agora).getTime();
  const diaDeReferencia = dataAtual.getUTCDate();

  let passo = 0;
  let proxima = new Date(dataAtual.getTime());
  do {
    passo += 1;
    if (recorrencia === "diaria") {
      proxima = new Date(Date.UTC(dataAtual.getUTCFullYear(), dataAtual.getUTCMonth(), dataAtual.getUTCDate() + passo));
    } else if (recorrencia === "semanal") {
      proxima = new Date(Date.UTC(dataAtual.getUTCFullYear(), dataAtual.getUTCMonth(), dataAtual.getUTCDate() + 7 * passo));
    } else {
      const ano = dataAtual.getUTCFullYear();
      const mes = dataAtual.getUTCMonth() + passo;
      const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
      proxima = new Date(Date.UTC(ano, mes, Math.min(diaDeReferencia, ultimoDiaDoMes)));
    }
  } while (proxima.getTime() <= hoje);

  return proxima;
}

const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

export type TaskInput = {
  title: string;
  due_date?: Date | null;
  due_time?: string | null;
  worker_id?: string | null;
  assignee?: string | null;
  priority?: TaskPriorityInput | null;
  property_id?: string | null;
  notes?: string | null;
  recurrence?: TaskRecurrenceInput | null;
  remind?: boolean;
};

function limpar(texto: string | null | undefined): string | null {
  const t = texto?.trim();
  return t ? t : null;
}

/**
 * As regras de coerência entre os campos opcionais, que valem para criar e
 * para editar.
 *
 * ⚠️ Horário e recorrência SEM data são recusados, e não silenciosamente
 * descartados: "14h" sem dia não diz quando, e "toda segunda" sem a primeira
 * segunda não diz de onde começar. Descartar calado faria o produtor achar que
 * anotou uma coisa e ter anotado outra.
 */
async function conferir(
  db: TenantPrismaClient,
  input: Partial<TaskInput>,
  dataFinal: Date | null,
): Promise<{ code: string; message: string; status: number; field: string } | null> {
  if (input.due_time && !HORARIO.test(input.due_time)) {
    return { code: "VALIDATION_ERROR", message: "Use o horário no formato 14:00", status: 422, field: "due_time" };
  }
  if (input.due_time && !dataFinal) {
    return {
      code: "HORARIO_SEM_DATA",
      message: "Para marcar horário, diga também o dia",
      status: 422,
      field: "due_time",
    };
  }
  if (input.recurrence && !dataFinal) {
    return {
      code: "RECORRENCIA_SEM_DATA",
      message: "Para repetir a tarefa, diga o dia da primeira vez",
      status: 422,
      field: "recurrence",
    };
  }
  if (input.worker_id) {
    const worker = await db.worker.findFirst({ where: { id: input.worker_id }, select: { id: true } });
    if (!worker) return { code: "NOT_FOUND", message: "Responsável não encontrado", status: 404, field: "worker_id" };
  }
  if (input.property_id) {
    const property = await db.property.findFirst({ where: { id: input.property_id }, select: { id: true } });
    if (!property) return { code: "NOT_FOUND", message: "Fazenda não encontrada", status: 404, field: "property_id" };
  }
  return null;
}

export async function createTaskAction(
  db: TenantPrismaClient,
  input: TaskInput & { created_by?: string | null },
): Promise<ActionResult<{ id: string }>> {
  const title = limpar(input.title);
  if (!title) return fail("VALIDATION_ERROR", "Diga o que precisa ser feito", 422, "title");

  const dataFinal = input.due_date ?? null;
  const problema = await conferir(db, input, dataFinal);
  if (problema) return fail(problema.code, problema.message, problema.status, problema.field);

  const task = await db.task.create({
    data: scoped({
      title,
      due_date: dataFinal,
      due_time: dataFinal ? limpar(input.due_time) : null,
      worker_id: input.worker_id ?? null,
      assignee: limpar(input.assignee),
      priority: input.priority ?? "normal",
      property_id: input.property_id ?? null,
      notes: limpar(input.notes),
      recurrence: dataFinal ? (input.recurrence ?? null) : null,
      /* Sem data não há dia para lembrar (decisão 19). */
      remind: dataFinal ? (input.remind ?? true) : false,
      created_by: input.created_by ?? null,
    }),
  });

  return ok({ id: task.id });
}

/**
 * Editar tudo menos o status (§26, §27). O status tem ação própria porque é
 * nele que a recorrência dispara.
 *
 * Campo AUSENTE no input fica como está; campo presente com `null` é apagado.
 * É a diferença entre "não mexi na data" e "tirei a data", e as duas precisam
 * existir.
 */
export async function updateTaskAction(
  db: TenantPrismaClient,
  taskId: string,
  input: Partial<TaskInput>,
): Promise<ActionResult<{ id: string }>> {
  const existing = await db.task.findFirst({ where: { id: taskId } });
  if (!existing) return fail("NOT_FOUND", "Tarefa não encontrada", 404);

  if (input.title !== undefined && !limpar(input.title)) {
    return fail("VALIDATION_ERROR", "Diga o que precisa ser feito", 422, "title");
  }

  const dataFinal = input.due_date !== undefined ? input.due_date : existing.due_date;
  const problema = await conferir(
    db,
    {
      ...input,
      /* A coerência vale para o estado FINAL: tirar a data de uma tarefa que
         tem horário precisa ser recusado mesmo que o horário não esteja no
         input desta edição. */
      due_time: input.due_time !== undefined ? input.due_time : existing.due_time,
      recurrence: input.recurrence !== undefined ? input.recurrence : existing.recurrence,
    },
    dataFinal,
  );
  if (problema) return fail(problema.code, problema.message, problema.status, problema.field);

  await db.task.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined ? { title: limpar(input.title)! } : {}),
      ...(input.due_date !== undefined ? { due_date: input.due_date } : {}),
      ...(input.due_time !== undefined ? { due_time: limpar(input.due_time) } : {}),
      ...(input.worker_id !== undefined ? { worker_id: input.worker_id } : {}),
      ...(input.assignee !== undefined ? { assignee: limpar(input.assignee) } : {}),
      ...(input.priority !== undefined && input.priority !== null ? { priority: input.priority } : {}),
      ...(input.property_id !== undefined ? { property_id: input.property_id } : {}),
      ...(input.notes !== undefined ? { notes: limpar(input.notes) } : {}),
      ...(input.recurrence !== undefined ? { recurrence: input.recurrence } : {}),
      ...(input.remind !== undefined ? { remind: input.remind } : {}),
      /*
       * Mudou a data: o lembrete daquele dia volta a ser devido. Sem isso, uma
       * tarefa adiada depois de lembrada nunca mais seria lembrada, porque o
       * cron só olha quem tem `reminded_at` nulo.
       */
      ...(input.due_date !== undefined ? { reminded_at: null } : {}),
    },
  });

  return ok({ id: taskId });
}

/**
 * §26: "não consegui arrumar a cerca hoje, coloca para amanhã". Muda a data e
 * só ela.
 *
 * Ação separada de `updateTaskAction`, e não um atalho da tela, porque o
 * WhatsApp e o painel precisam do mesmo gesto com a mesma regra: adiar tarefa
 * concluída não faz sentido, e editar uma concluída às vezes faz (corrigir o
 * título do histórico).
 */
export async function postponeTaskAction(
  db: TenantPrismaClient,
  taskId: string,
  novaData: Date,
): Promise<ActionResult<{ id: string }>> {
  const existing = await db.task.findFirst({ where: { id: taskId } });
  if (!existing) return fail("NOT_FOUND", "Tarefa não encontrada", 404);
  if (existing.status !== "pending") {
    return fail("TAREFA_ENCERRADA", "Só dá para adiar tarefa que ainda está pendente", 422, "due_date");
  }
  return updateTaskAction(db, taskId, { due_date: novaData });
}

export async function updateTaskStatusAction(
  db: TenantPrismaClient,
  taskId: string,
  status: TaskStatusInput,
): Promise<ActionResult<{ id: string; next_task_id: string | null }>> {
  if (!TASK_STATUSES.includes(status)) {
    return fail("VALIDATION_ERROR", "Status inválido", 422);
  }
  const existing = await db.task.findFirst({ where: { id: taskId } });
  if (!existing) return fail("NOT_FOUND", "Tarefa não encontrada", 404);

  /*
   * §24: concluir uma tarefa recorrente faz nascer a próxima. Só na CONCLUSÃO,
   * e não no cancelamento: cancelar "toda segunda conferir os bebedouros"
   * quer dizer parar de conferir, e recriar seria desobedecer o produtor.
   *
   * Só quando a tarefa ainda estava pendente: reconcluir uma concluída não
   * pode gerar uma segunda cópia da próxima.
   */
  const gerarProxima =
    status === "completed" &&
    existing.status === "pending" &&
    existing.recurrence !== null &&
    existing.due_date !== null;

  const nextTaskId = await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { status } });
    if (!gerarProxima) return null;

    const proxima = await tx.task.create({
      data: scoped({
        title: existing.title,
        due_date: proximaOcorrencia(existing.due_date!, existing.recurrence as TaskRecurrenceInput),
        due_time: existing.due_time,
        worker_id: existing.worker_id,
        assignee: existing.assignee,
        priority: existing.priority,
        property_id: existing.property_id,
        notes: existing.notes,
        recurrence: existing.recurrence,
        remind: existing.remind,
        created_by: existing.created_by,
      }),
    });
    return proxima.id;
  });

  return ok({ id: taskId, next_task_id: nextTaskId });
}

/**
 * Apagar de vez, para quem digitou errado. O §27 pede que CANCELAR mantenha o
 * histórico, e isso continua sendo `updateTaskStatusAction(..., "cancelled")`.
 */
export async function deleteTaskAction(
  db: TenantPrismaClient,
  taskId: string,
): Promise<ActionResult<{ id: string }>> {
  const existing = await db.task.findFirst({ where: { id: taskId } });
  if (!existing) return fail("NOT_FOUND", "Tarefa não encontrada", 404);
  await db.task.delete({ where: { id: taskId } });
  return ok({ id: taskId });
}

/**
 * ⚠️ `nulls: "last"`: sem isso, o Postgres põe as tarefas sem data PRIMEIRO
 * numa ordem ascendente, e "consertar a porteira" empurraria as tarefas de
 * hoje para baixo da dobra.
 */
export async function listTasksAction(db: TenantPrismaClient) {
  return db.task.findMany({ orderBy: { due_date: { sort: "asc", nulls: "last" } } });
}
