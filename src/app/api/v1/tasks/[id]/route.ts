import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  deleteTaskAction,
  TASK_PRIORITIES,
  TASK_RECURRENCES,
  updateTaskAction,
  updateTaskStatusAction,
} from "@/lib/actions/tasks";
import { withApi } from "@/lib/route";

/**
 * PATCH  /api/v1/tasks/:id   conclui, cancela ou edita uma tarefa
 * DELETE /api/v1/tasks/:id   apaga de vez, para quem digitou errado
 *
 * Módulo 38: o PATCH aceitava só `status`, e continua aceitando igual (é o que
 * o botão Concluir da tela manda). Os campos de edição do §18 são extensão
 * aditiva no mesmo corpo. Cancelar continua sendo `status: "cancelled"`, que
 * mantém o histórico como o §27 pede; o DELETE é outra coisa.
 */

const schema = z
  .object({
    status: z.enum(["pending", "completed", "cancelled"]).optional(),
    title: z.string().min(1, "Diga o que precisa ser feito").optional(),
    due_date: z.string().datetime().nullable().optional(),
    due_time: z.string().nullable().optional(),
    worker_id: z.string().nullable().optional(),
    assignee: z.string().nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    property_id: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    recurrence: z.enum(TASK_RECURRENCES).nullable().optional(),
    remind: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Nada para alterar" });

async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("tarefas", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const { status, due_date, ...resto } = parsed.data;

  /*
   * Edição ANTES do status: concluir uma recorrente gera a próxima a partir
   * dos campos da tarefa, e um corpo que edita e conclui junto precisa que a
   * próxima nasça com o que acabou de ser editado.
   */
  const temEdicao = Object.keys(resto).length > 0 || due_date !== undefined;
  if (temEdicao) {
    const editado = await updateTaskAction(g.db, params.id, {
      ...resto,
      ...(due_date !== undefined ? { due_date: due_date ? new Date(due_date) : null } : {}),
    });
    if (!editado.ok) return apiError(editado.code, editado.message, editado.status, editado.field);
  }

  if (status) {
    const result = await updateTaskStatusAction(g.db, params.id, status);
    if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
    return apiOk(result.data);
  }

  return apiOk({ id: params.id, next_task_id: null });
}

async function DELETEHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("tarefas", "write");
  if ("error" in g) return g.error;

  const result = await deleteTaskAction(g.db, params.id);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const PATCH = withApi(PATCHHandler);
export const DELETE = withApi(DELETEHandler);
