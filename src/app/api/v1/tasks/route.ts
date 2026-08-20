import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { createTaskAction, listTasksAction, serializeTask } from "@/lib/actions/tasks";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/tasks    lista tarefas do tenant (Módulo 27, Meu Dia)
 * POST /api/v1/tasks    cria uma tarefa
 */

const createSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  due_date: z.string().datetime(),
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
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const d = parsed.data;

  const result = await createTaskAction(g.db, {
    title: d.title,
    due_date: new Date(d.due_date),
    remind: d.remind,
    created_by: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
