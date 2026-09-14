import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  createTaskAction,
  listTasksAction,
  serializeTask,
  TASK_PRIORITIES,
  TASK_RECURRENCES,
} from "@/lib/actions/tasks";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/tasks    lista tarefas do tenant (Módulo 27, Meu Dia)
 * POST /api/v1/tasks    cria uma tarefa
 *
 * Módulo 38: o POST aceita os campos do §18, todos opcionais menos o título,
 * e `due_date` passou a aceitar nulo (§19). Extensão aditiva: o corpo antigo,
 * com título e data, continua valendo igual.
 */

const createSchema = z.object({
  title: z.string().min(1, "Diga o que precisa ser feito"),
  due_date: z.string().datetime().nullable().optional(),
  due_time: z.string().nullable().optional(),
  worker_id: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  property_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  recurrence: z.enum(TASK_RECURRENCES).nullable().optional(),
  remind: z.boolean().optional(),
});

async function GETHandler() {
  const g = await guard("tarefas", "read");
  if ("error" in g) return g.error;

  const tasks = await listTasksAction(g.db);
  const data = tasks.map(serializeTask);
  return apiOk(data, { total: data.length });
}

async function POSTHandler(request: Request) {
  const g = await guard("tarefas", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const d = parsed.data;

  const result = await createTaskAction(g.db, {
    title: d.title,
    due_date: d.due_date ? new Date(d.due_date) : null,
    due_time: d.due_time,
    worker_id: d.worker_id,
    assignee: d.assignee,
    priority: d.priority,
    property_id: d.property_id,
    notes: d.notes,
    recurrence: d.recurrence,
    remind: d.remind,
    created_by: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
