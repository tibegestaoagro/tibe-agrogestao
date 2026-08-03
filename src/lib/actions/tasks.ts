import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Lógica de negócio de Task (Módulo 27, Meu Dia). Compartilhada dentro do
 * tenant: nenhuma função aqui filtra por usuário, de propósito (spec §2.4).
 * "Atrasada" nunca é gravada: computada em `effectiveStatus()` a partir de
 * `status: "pending"` + `due_date` no passado.
 */

const TASK_STATUSES = ["pending", "completed", "cancelled"] as const;
export type TaskStatusInput = (typeof TASK_STATUSES)[number];
export type EffectiveStatus = TaskStatusInput | "overdue";

function effectiveStatus(task: { status: TaskStatusInput; due_date: Date }, now = new Date()): EffectiveStatus {
  if (task.status === "pending" && task.due_date.getTime() < now.getTime()) return "overdue";
  return task.status;
}

export function serializeTask(t: {
  id: string;
  title: string;
  due_date: Date;
  remind: boolean;
  status: string;
  created_by: string | null;
  created_at: Date;
}) {
  return {
    id: t.id,
    title: t.title,
    due_date: t.due_date.toISOString(),
    remind: t.remind,
    status: t.status,
    effective_status: effectiveStatus({ status: t.status as TaskStatusInput, due_date: t.due_date }),
    created_by: t.created_by,
    created_at: t.created_at.toISOString(),
  };
}

export async function createTaskAction(
  db: TenantPrismaClient,
  input: {
    title: string;
    due_date: Date;
    remind?: boolean;
    created_by?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  if (!input.title.trim()) return fail("VALIDATION_ERROR", "Título é obrigatório", 422);

  const task = await db.task.create({
    data: scoped({
      title: input.title.trim(),
      due_date: input.due_date,
      remind: input.remind ?? true,
      created_by: input.created_by ?? null,
    }),
  });

  return ok({ id: task.id });
}

export async function updateTaskStatusAction(
  db: TenantPrismaClient,
  taskId: string,
  status: TaskStatusInput,
): Promise<ActionResult<{ id: string }>> {
  if (!TASK_STATUSES.includes(status)) {
    return fail("VALIDATION_ERROR", "Status inválido", 422);
  }
  const existing = await db.task.findFirst({ where: { id: taskId } });
  if (!existing) return fail("NOT_FOUND", "Tarefa não encontrada", 404);

  await db.task.update({ where: { id: taskId }, data: { status } });
  return ok({ id: taskId });
}

export async function listTasksAction(db: TenantPrismaClient) {
  return db.task.findMany({ orderBy: { due_date: "asc" } });
}
