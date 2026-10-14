import { z } from "zod";
import { apiOkSchema, totalMetaSchema } from "./envelope";
import { idSchema, isoDateTimeSchema } from "./primitives";
import { shoppingPrioritySchema, type ShoppingPriority } from "./stock";

/**
 * Tarefas (Módulos 27 e 38).
 *
 * Rotas cobertas:
 *   GET /api/v1/tasks
 *
 * Fora, de propósito: `POST /tasks`, `PATCH` e `DELETE /tasks/:id` e
 * `POST /tasks/:id/postpone` (escrita, e as respostas delas não são lidas pelo
 * aplicativo). Não existe `GET /tasks/:id`.
 */

/** `TaskStatus` (schema.prisma). */
export const taskStatusSchema = z.enum(["pending", "completed", "cancelled"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** `TaskRecurrence` (schema.prisma). */
export const taskRecurrenceSchema = z.enum(["diaria", "semanal", "mensal"]);
export type TaskRecurrence = z.infer<typeof taskRecurrenceSchema>;

/**
 * `Task.priority` usa o enum `ShoppingPriority` do Prisma (a decisão 28 do
 * Módulo 38 manteve um só enum para a tarefa e para a lista de compra), e o
 * contrato também: o schema é o da lista de compra, em `stock.ts`.
 */
export const taskPrioritySchema = shoppingPrioritySchema;
export type TaskPriority = ShoppingPriority;

/**
 * `serializeTask` (src/lib/actions/tasks.ts). `effective_status` é o `status`
 * mais `overdue`, calculado e nunca gravado: pendente cujo dia já passou.
 */
export const taskSchema = z.object({
  id: idSchema,
  title: z.string(),
  due_date: isoDateTimeSchema.nullable(),
  due_time: z.string().nullable(),
  worker_id: idSchema.nullable(),
  assignee: z.string().nullable(),
  priority: taskPrioritySchema,
  property_id: idSchema.nullable(),
  notes: z.string().nullable(),
  recurrence: taskRecurrenceSchema.nullable(),
  remind: z.boolean(),
  status: taskStatusSchema,
  effective_status: z.enum(["pending", "completed", "cancelled", "overdue"]),
  created_by: idSchema.nullable(),
  created_at: isoDateTimeSchema,
});
export type Task = z.infer<typeof taskSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/tasks
// ─────────────────────────────────────────────────────────────

export const listTasksResponseSchema = apiOkSchema(z.array(taskSchema), totalMetaSchema);
export type ListTasksResponse = z.infer<typeof listTasksResponseSchema>;
