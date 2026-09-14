import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { prazoVencido } from "@/lib/dia-calendario";

/**
 * Lógica de negócio de Task (Módulo 27, Meu Dia). Compartilhada dentro do
 * tenant: nenhuma função aqui filtra por usuário, de propósito (spec §2.4).
 * "Atrasada" nunca é gravada: computada em `effectiveStatus()` a partir de
 * `status: "pending"` + `due_date` cujo DIA já passou.
 */

const TASK_STATUSES = ["pending", "completed", "cancelled"] as const;
export type TaskStatusInput = (typeof TASK_STATUSES)[number];
export type EffectiveStatus = TaskStatusInput | "overdue";

/**
 * ⚠️ Compara por DIA, nunca por instante. Comparar `getTime()` marcava como
 * atrasada toda tarefa criada para hoje, porque o formulário grava meia-noite.
 * O porquê inteiro está em `dia-calendario.ts`.
 */
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
}) {
  return {
    id: t.id,
    title: t.title,
    due_date: t.due_date?.toISOString() ?? null,
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
