import { z } from "zod";
import { apiOkSchema, totalMetaSchema } from "./envelope";
import { financialEntryStatusSchema, idSchema, isoDateTimeSchema } from "./primitives";

/**
 * Mão de obra (Módulo 33).
 *
 * Rotas cobertas (só as de leitura):
 *   GET /api/v1/workers
 *   GET /api/v1/workers/:id
 *   GET /api/v1/workers/:id/logs
 *
 * Serializers de origem: `serializar`, `listWorkers` e `getWorkerDetail`
 * (src/lib/actions/workers.ts) e `serializar` de src/lib/actions/worker-logs.ts.
 *
 * Divergência com `/docs/api` (vale o código): os exemplos da doc são
 * amostras. A lista omite `property_id`, `phone`, `started_at` e `notes`; o
 * detalhe omite os campos do cadastro além de `entries`; as anotações omitem
 * `property_id` e `pasture_id`.
 */

/** Espelha o enum `WorkerType` do Prisma. */
export const workerTypeSchema = z.enum(["fixo", "eventual"]);
export type WorkerType = z.infer<typeof workerTypeSchema>;

/** Espelha o enum `WorkerStatus` do Prisma. */
export const workerStatusSchema = z.enum(["ativo", "inativo"]);
export type WorkerStatus = z.infer<typeof workerStatusSchema>;

/** Espelha o enum `PayFrequency` do Prisma. */
export const payFrequencySchema = z.enum(["mensal", "quinzenal", "semanal", "diaria", "outra"]);
export type PayFrequency = z.infer<typeof payFrequencySchema>;

/** Espelha o enum `WorkerEntryKind` do Prisma. */
export const workerEntryKindSchema = z.enum(["pagamento", "adiantamento", "gratificacao", "beneficio", "outro"]);
export type WorkerEntryKind = z.infer<typeof workerEntryKindSchema>;

/** Espelha o enum `WorkerLogKind` do Prisma. */
export const workerLogKindSchema = z.enum(["atividade", "falta", "folga", "ferias", "afastamento"]);
export type WorkerLogKind = z.infer<typeof workerLogKindSchema>;

/** `WorkerView` (serializar em src/lib/actions/workers.ts). */
export const workerSchema = z.object({
  id: idSchema,
  name: z.string(),
  role: z.string(),
  type: workerTypeSchema,
  status: workerStatusSchema,
  pay_frequency: payFrequencySchema.nullable(),
  pay_amount: z.number().nullable(),
  pay_day: z.number().int().nullable(),
  property_id: idSchema.nullable(),
  phone: z.string().nullable(),
  started_at: isoDateTimeSchema.nullable(),
  notes: z.string().nullable(),
  /** A previsão pendente mais próxima. `null` no eventual e no inativo. */
  proximo_pagamento: z
    .object({ id: idSchema, amount: z.number(), due_date: isoDateTimeSchema })
    .nullable(),
});
export type Worker = z.infer<typeof workerSchema>;

/** `WorkerEntryView`: um lançamento financeiro do trabalhador. */
export const workerEntrySchema = z.object({
  id: idSchema,
  kind: workerEntryKindSchema.nullable(),
  amount: z.number(),
  category: z.string().nullable(),
  due_date: isoDateTimeSchema.nullable(),
  paid_at: isoDateTimeSchema.nullable(),
  status: financialEntryStatusSchema,
  notes: z.string().nullable(),
});
export type WorkerEntry = z.infer<typeof workerEntrySchema>;

/** `WorkerLogView` (src/lib/actions/worker-logs.ts). */
export const workerLogSchema = z.object({
  id: idSchema,
  kind: workerLogKindSchema,
  occurred_at: isoDateTimeSchema,
  description: z.string().nullable(),
  property_id: idSchema.nullable(),
  pasture_id: idSchema.nullable(),
});
export type WorkerLog = z.infer<typeof workerLogSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/workers
// ─────────────────────────────────────────────────────────────

/** `meta` traz as dez funções sugeridas do §6 (`FUNCOES_SUGERIDAS`). */
export const listWorkersResponseSchema = apiOkSchema(
  z.array(workerSchema),
  totalMetaSchema.extend({ funcoes_sugeridas: z.array(z.string()) }),
);
export type ListWorkersResponse = z.infer<typeof listWorkersResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/workers/:id
// ─────────────────────────────────────────────────────────────

export const getWorkerResponseSchema = apiOkSchema(workerSchema.extend({ entries: z.array(workerEntrySchema) }));
export type GetWorkerResponse = z.infer<typeof getWorkerResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/workers/:id/logs
// ─────────────────────────────────────────────────────────────

export const listWorkerLogsResponseSchema = apiOkSchema(z.array(workerLogSchema), totalMetaSchema);
export type ListWorkerLogsResponse = z.infer<typeof listWorkerLogsResponseSchema>;
