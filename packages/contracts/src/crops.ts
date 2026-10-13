import { z } from "zod";
import { apiOkSchema, totalMetaSchema } from "./envelope";
import { idSchema, isoDateTimeSchema } from "./primitives";

/**
 * Lavoura: talhoes, ciclos e insumos (somente leitura).
 *
 * Rotas cobertas:
 *   GET /api/v1/plots
 *   GET /api/v1/plots/:id
 *   GET /api/v1/plots/:id/cycles
 *   GET /api/v1/cycles/:id/inputs
 *   GET /api/v1/cycles/:id/summary
 */

/** `CropCycleStatus` (schema.prisma). */
export const cropCycleStatusSchema = z.enum(["planted", "growing", "harvested"]);
export type CropCycleStatus = z.infer<typeof cropCycleStatusSchema>;

/** `InputType` (schema.prisma). */
export const inputTypeSchema = z.enum(["fertilizer", "pesticide", "seed"]);
export type InputType = z.infer<typeof inputTypeSchema>;

// ─────────────────────────────────────────────────────────────
// Itens
// ─────────────────────────────────────────────────────────────

/**
 * `Plot` como sai de `serializePlot` (`src/lib/serializers.ts`). `area_hectares`
 * e anulavel porque a coluna e `Decimal?`.
 */
export const plotSchema = z.object({
  id: idSchema,
  name: z.string(),
  property_id: idSchema,
  area_hectares: z.number().nullable(),
  current_crop: z.string().nullable(),
  created_at: isoDateTimeSchema,
});
export type Plot = z.infer<typeof plotSchema>;

/** `CropCycle` como sai de `serializeCycle` (`src/lib/serializers.ts`). */
export const cropCycleSchema = z.object({
  id: idSchema,
  plot_id: idSchema,
  crop_name: z.string(),
  planted_at: isoDateTimeSchema.nullable(),
  expected_harvest_at: isoDateTimeSchema.nullable(),
  harvested_at: isoDateTimeSchema.nullable(),
  yield_amount: z.number().nullable(),
  yield_unit: z.string().nullable(),
  status: cropCycleStatusSchema,
  created_at: isoDateTimeSchema,
});
export type CropCycle = z.infer<typeof cropCycleSchema>;

/** `PlotInput` como sai de `serializeInput` (`src/lib/serializers.ts`). */
export const plotInputSchema = z.object({
  id: idSchema,
  cycle_id: idSchema,
  input_type: inputTypeSchema,
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  cost: z.number().nullable(),
  applied_at: isoDateTimeSchema.nullable(),
  created_at: isoDateTimeSchema,
});
export type PlotInput = z.infer<typeof plotInputSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/plots
// ─────────────────────────────────────────────────────────────

/**
 * Resumo do ciclo ativo (planted/growing) montado inline pela rota, com 4
 * campos apenas. Difere do `cropCycleSchema` completo usado no detalhe.
 */
export const plotActiveCycleSummarySchema = z.object({
  id: idSchema,
  crop_name: z.string(),
  status: cropCycleStatusSchema,
  expected_harvest_at: isoDateTimeSchema.nullable(),
});
export type PlotActiveCycleSummary = z.infer<typeof plotActiveCycleSummarySchema>;

/**
 * Item da listagem: `serializePlot` + `property_name` e `active_cycle`
 * (nulos quando nao ha propriedade/ciclo ativo). Ordenado por `created_at`
 * decrescente. Exige lavoura:read e perfil fazenda.
 *
 * `/docs/api` mostra so alguns campos no exemplo; o codigo devolve todos.
 */
export const plotListItemSchema = plotSchema.extend({
  property_name: z.string().nullable(),
  active_cycle: plotActiveCycleSummarySchema.nullable(),
});
export type PlotListItem = z.infer<typeof plotListItemSchema>;

export const listPlotsResponseSchema = apiOkSchema(z.array(plotListItemSchema), totalMetaSchema);
export type ListPlotsResponse = z.infer<typeof listPlotsResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/plots/:id
// ─────────────────────────────────────────────────────────────

/**
 * Detalhe: `serializePlot` + `property_name`, `active_cycle` (ciclo COMPLETO
 * via `serializeCycle`, o primeiro planted/growing, ou null) e `cycles`
 * (historico inteiro, `created_at` decrescente). Sem `meta.total`. 404 se o
 * talhao nao existe.
 */
export const plotDetailSchema = plotSchema.extend({
  property_name: z.string().nullable(),
  active_cycle: cropCycleSchema.nullable(),
  cycles: z.array(cropCycleSchema),
});
export type PlotDetail = z.infer<typeof plotDetailSchema>;

export const getPlotResponseSchema = apiOkSchema(plotDetailSchema);
export type GetPlotResponse = z.infer<typeof getPlotResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/plots/:id/cycles
// ─────────────────────────────────────────────────────────────

/** Ciclos do talhao, `created_at` decrescente. 404 se o talhao nao existe. */
export const listPlotCyclesResponseSchema = apiOkSchema(z.array(cropCycleSchema), totalMetaSchema);
export type ListPlotCyclesResponse = z.infer<typeof listPlotCyclesResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/cycles/:id/inputs
// ─────────────────────────────────────────────────────────────

/** Insumos do ciclo, `created_at` decrescente. 404 se o ciclo nao existe. */
export const listCycleInputsResponseSchema = apiOkSchema(z.array(plotInputSchema), totalMetaSchema);
export type ListCycleInputsResponse = z.infer<typeof listCycleInputsResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/cycles/:id/summary
// ─────────────────────────────────────────────────────────────

/**
 * Montado inline pela rota. `total_input_cost` e sempre numero (soma dos custos
 * nao nulos, 2 casas). `cost_per_hectare` e `productivity_per_hectare` so
 * existem com area positiva (a produtividade tambem exige colheita
 * registrada); fora disso sao null. `yield_unit` aparece sempre, mas
 * `/docs/api` nao o lista no exemplo: vale o codigo.
 */
export const cycleSummarySchema = z.object({
  total_input_cost: z.number(),
  area_hectares: z.number().nullable(),
  cost_per_hectare: z.number().nullable(),
  yield_amount: z.number().nullable(),
  yield_unit: z.string().nullable(),
  productivity_per_hectare: z.number().nullable(),
});
export type CycleSummary = z.infer<typeof cycleSummarySchema>;

export const getCycleSummaryResponseSchema = apiOkSchema(cycleSummarySchema);
export type GetCycleSummaryResponse = z.infer<typeof getCycleSummaryResponseSchema>;
