import { z } from "zod";
import { apiOkSchema, totalMetaSchema } from "./envelope";
import { idSchema, isoDateTimeSchema } from "./primitives";

/**
 * Máquinas (Módulo 26).
 *
 * Rotas cobertas:
 *   GET   /api/v1/machines
 *   POST  /api/v1/machines
 *   GET   /api/v1/machines/:id
 *   PATCH /api/v1/machines/:id
 *   POST  /api/v1/machines/:id/maintenances
 *
 * Diferente dos outros domínios deste pacote, os schemas de ENTRADA daqui são
 * os que as rotas usam de verdade: elas importam deste arquivo. É o domínio
 * que o aplicativo escreve, então copiar o schema seria deixar a divergência
 * para aparecer no aparelho.
 */

/** Espelha o enum `MachineStatus` do Prisma, inclusive `negociada` (permuta). */
export const machineStatusSchema = z.enum(["active", "maintenance", "sold", "inactive", "negociada"]);
export type MachineStatus = z.infer<typeof machineStatusSchema>;

/** `serializeMachine` (src/lib/actions/machines.ts). */
export const machineSchema = z.object({
  id: idSchema,
  property_id: idSchema,
  name: z.string(),
  type: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  year: z.number().int().nullable(),
  acquired_at: isoDateTimeSchema.nullable(),
  acquisition_cost: z.number().nullable(),
  hour_meter: z.number().nullable(),
  status: machineStatusSchema,
  next_maintenance_at: isoDateTimeSchema.nullable(),
  created_at: isoDateTimeSchema,
});
export type Machine = z.infer<typeof machineSchema>;

/** `serializeMaintenance` (src/lib/actions/machines.ts). */
export const machineMaintenanceSchema = z.object({
  id: idSchema,
  machine_id: idSchema,
  performed_at: isoDateTimeSchema,
  description: z.string(),
  cost: z.number().nullable(),
  next_due_at: isoDateTimeSchema.nullable(),
  created_at: isoDateTimeSchema,
});
export type MachineMaintenance = z.infer<typeof machineMaintenanceSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/machines
// ─────────────────────────────────────────────────────────────

export const listMachinesResponseSchema = apiOkSchema(z.array(machineSchema), totalMetaSchema);
export type ListMachinesResponse = z.infer<typeof listMachinesResponseSchema>;

// ─────────────────────────────────────────────────────────────
// POST /api/v1/machines
// ─────────────────────────────────────────────────────────────

export const createMachineRequestSchema = z.object({
  property_id: z.string().min(1, "Propriedade é obrigatória"),
  name: z.string().min(1, "Nome é obrigatório"),
  type: z.string().min(1, "Tipo é obrigatório"),
  brand: z.string().nullish(),
  model: z.string().nullish(),
  year: z.number().int().nullish(),
  acquired_at: z.string().datetime().nullish(),
  acquisition_cost: z.number().nonnegative().nullish(),
  hour_meter: z.number().nonnegative().nullish(),
});
export type CreateMachineRequest = z.infer<typeof createMachineRequestSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/machines/:id
// ─────────────────────────────────────────────────────────────

export const getMachineResponseSchema = apiOkSchema(
  machineSchema.extend({ maintenances: z.array(machineMaintenanceSchema) }),
);
export type GetMachineResponse = z.infer<typeof getMachineResponseSchema>;

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/machines/:id
// ─────────────────────────────────────────────────────────────

/**
 * `status` aceita quatro dos cinco valores: `negociada` só nasce de uma
 * permuta (Módulo 31), nunca de edição à mão.
 */
export const updateMachineRequestSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  brand: z.string().nullish(),
  model: z.string().nullish(),
  year: z.number().int().nullish(),
  hour_meter: z.number().nonnegative().nullish(),
  status: z.enum(["active", "maintenance", "sold", "inactive"]).optional(),
});
export type UpdateMachineRequest = z.infer<typeof updateMachineRequestSchema>;

// ─────────────────────────────────────────────────────────────
// POST /api/v1/machines/:id/maintenances
// ─────────────────────────────────────────────────────────────

export const createMaintenanceRequestSchema = z.object({
  performed_at: z.string().datetime().nullish(),
  description: z.string().min(1, "Descrição é obrigatória"),
  cost: z.number().nonnegative().nullish(),
  next_due_at: z.string().datetime().nullish(),
});
export type CreateMaintenanceRequest = z.infer<typeof createMaintenanceRequestSchema>;
