import { z } from "zod";
import { apiOkSchema, totalMetaSchema } from "./envelope";
import { idSchema, isoDateTimeSchema } from "./primitives";

/**
 * Área Leite (Módulo 32): só as RESPOSTAS das rotas GET.
 *
 * Rotas cobertas e o serializer de origem:
 *   GET /api/v1/milk/sites          `serializar` em milk/sites/route.ts
 *   GET /api/v1/milk/groups         `serializar` em milk/groups/route.ts
 *   GET /api/v1/milk/lactation      `serializar` em milk/lactation/route.ts
 *   GET /api/v1/milk/production     `serializar` em milk/production/route.ts
 *   GET /api/v1/milk/summary        `getResumoDoLeite` (actions/milk-production.ts)
 *   GET /api/v1/milk/storage        `getMilkPositions`, `getMilkStorageSummary`
 *                                   e `serializar` em milk/storage/route.ts
 *   GET /api/v1/milk/charges        `serializar` em milk/charges/route.ts
 *   GET /api/v1/milk/sales/pending  `listPendingDeliveries` (actions/milk-sales.ts)
 *
 * Os POST (inclusive cancelar e arquivar) ficam de fora: este pacote só
 * declara respostas de leitura nesta área.
 *
 * Os nomes seguem o contrato ATUAL, que mistura grafias: `canceled` (sites,
 * storage, charges) e `cancelled` (lactation, production).
 */

/** Espelha o enum `MilkSiteType` do Prisma. */
export const milkSiteTypeSchema = z.enum(["proprio", "terceiro"]);
export type MilkSiteType = z.infer<typeof milkSiteTypeSchema>;

/** Espelha o enum `MilkMovementType` do Prisma. */
export const milkMovementTypeSchema = z.enum(["entrada_producao", "entrada_terceiro", "transferencia", "saida", "ajuste"]);
export type MilkMovementType = z.infer<typeof milkMovementTypeSchema>;

/**
 * Espelha o enum `MilkDestination` do Prisma. Inclui `doacao`, que o banco tem
 * e a rota de retirada ainda não aceita na entrada: a resposta precisa tolerar
 * o que o banco pode devolver.
 */
export const milkDestinationSchema = z.enum([
  "venda",
  "laticinio",
  "cooperativa",
  "ponto_coleta",
  "fabricacao_propria",
  "alimentacao_bezerros",
  "consumo",
  "descarte",
  "doacao",
  "outro",
]);
export type MilkDestination = z.infer<typeof milkDestinationSchema>;

/** Espelha o enum `MilkChargeType` do Prisma. */
export const milkChargeTypeSchema = z.enum(["por_litro", "por_produtor", "por_coleta", "mensal", "fixo", "outro"]);
export type MilkChargeType = z.infer<typeof milkChargeTypeSchema>;

/** Espelha o enum `MilkShift` do Prisma. */
export const milkShiftSchema = z.enum(["dia", "manha", "tarde", "noite"]);
export type MilkShift = z.infer<typeof milkShiftSchema>;

/** Espelha o enum `LactationEntryType` do Prisma. */
export const lactationEntryTypeSchema = z.enum(["definir", "entrada", "saida"]);
export type LactationEntryType = z.infer<typeof lactationEntryTypeSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/milk/sites
// ─────────────────────────────────────────────────────────────

export const milkSiteSchema = z.object({
  id: idSchema,
  name: z.string(),
  type: milkSiteTypeSchema,
  property_id: idSchema.nullable(),
  counterparty_name: z.string().nullable(),
  city: z.string().nullable(),
  capacity: z.number().int().nullable(),
  notes: z.string().nullable(),
  /** Volume físico atual: a soma de todos os donos. */
  liters: z.number(),
  acima_da_capacidade: z.boolean(),
  archived: z.boolean(),
  archived_at: isoDateTimeSchema.nullable(),
});
export type MilkSite = z.infer<typeof milkSiteSchema>;

export const listMilkSitesResponseSchema = apiOkSchema(z.array(milkSiteSchema), totalMetaSchema);
export type ListMilkSitesResponse = z.infer<typeof listMilkSitesResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/milk/groups
// ─────────────────────────────────────────────────────────────

export const milkGroupSchema = z.object({
  id: idSchema,
  property_id: idSchema,
  name: z.string(),
  notes: z.string().nullable(),
  archived: z.boolean(),
  archived_at: isoDateTimeSchema.nullable(),
});
export type MilkGroup = z.infer<typeof milkGroupSchema>;

export const listMilkGroupsResponseSchema = apiOkSchema(z.array(milkGroupSchema), totalMetaSchema);
export type ListMilkGroupsResponse = z.infer<typeof listMilkGroupsResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/milk/lactation
// ─────────────────────────────────────────────────────────────

export const lactationEntrySchema = z.object({
  id: idSchema,
  property_id: idSchema,
  type: lactationEntryTypeSchema,
  quantity: z.number().int(),
  recorded_at: isoDateTimeSchema,
  pasture_id: idSchema.nullable(),
  group_id: idSchema.nullable(),
  notes: z.string().nullable(),
  cancelled: z.boolean(),
  cancelled_at: isoDateTimeSchema.nullable(),
});
export type LactationEntry = z.infer<typeof lactationEntrySchema>;

/** `vacas_em_lactacao` é `null` quando a consulta vem sem `property_id`. */
export const listLactationResponseSchema = apiOkSchema(
  z.array(lactationEntrySchema),
  totalMetaSchema.extend({ vacas_em_lactacao: z.number().int().nullable() }),
);
export type ListLactationResponse = z.infer<typeof listLactationResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/milk/production
// ─────────────────────────────────────────────────────────────

export const milkProductionSchema = z.object({
  id: idSchema,
  property_id: idSchema,
  liters: z.number(),
  shift: milkShiftSchema,
  recorded_at: isoDateTimeSchema,
  group_id: idSchema.nullable(),
  notes: z.string().nullable(),
  cancelled: z.boolean(),
  cancelled_at: isoDateTimeSchema.nullable(),
});
export type MilkProduction = z.infer<typeof milkProductionSchema>;

export const listMilkProductionResponseSchema = apiOkSchema(
  z.array(milkProductionSchema),
  totalMetaSchema.extend({ total_litros: z.number() }),
);
export type ListMilkProductionResponse = z.infer<typeof listMilkProductionResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/milk/summary
// ─────────────────────────────────────────────────────────────

/** `JanelaChave` (src/lib/milk/periodos.ts). */
export const milkWindowKeySchema = z.enum(["hoje", "ontem", "semana", "mes", "mes_anterior", "ano"]);
export type MilkWindowKey = z.infer<typeof milkWindowKeySchema>;

/** `ResumoDePeriodo`. `de` e `ate` são dias `AAAA-MM-DD`, não data e hora. */
export const milkPeriodSummarySchema = z.object({
  chave: milkWindowKeySchema,
  rotulo: z.string(),
  de: z.string(),
  ate: z.string(),
  litros: z.number(),
  dias: z.number().int(),
  dias_com_registro: z.number().int(),
  media_diaria: z.number(),
  media_por_vaca: z.number().nullable(),
  dias_com_contagem: z.number().int(),
});
export type MilkPeriodSummary = z.infer<typeof milkPeriodSummarySchema>;

/** `ResumoDoLeite`. */
export const milkSummarySchema = z.object({
  property_id: idSchema,
  hoje: z.object({
    dia: z.string(),
    vacas_em_lactacao: z.number().int().nullable(),
    litros: z.number(),
    media_por_vaca: z.number().nullable(),
  }),
  periodos: z.array(milkPeriodSummarySchema),
});
export type MilkSummary = z.infer<typeof milkSummarySchema>;

export const getMilkSummaryResponseSchema = apiOkSchema(milkSummarySchema);
export type GetMilkSummaryResponse = z.infer<typeof getMilkSummaryResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/milk/storage
// ─────────────────────────────────────────────────────────────

/** `MilkPosition`: `owner_id` nulo é o leite próprio. */
export const milkPositionSchema = z.object({
  site_id: idSchema,
  owner_id: idSchema.nullable(),
  liters: z.number(),
});
export type MilkPosition = z.infer<typeof milkPositionSchema>;

/** `MilkStorageSummary`. */
export const milkStorageSummarySchema = z.object({
  proprio_em_tanque: z.number(),
  proprio_em_ponto_de_coleta: z.number(),
  de_terceiros: z.number(),
  fisico_total: z.number(),
});
export type MilkStorageSummary = z.infer<typeof milkStorageSummarySchema>;

export const milkMovementSchema = z.object({
  id: idSchema,
  movement_type: milkMovementTypeSchema,
  liters: z.number(),
  occurred_at: isoDateTimeSchema,
  from_site_id: idSchema.nullable(),
  from_owner_id: idSchema.nullable(),
  to_site_id: idSchema.nullable(),
  to_owner_id: idSchema.nullable(),
  destination: milkDestinationSchema.nullable(),
  production_id: idSchema.nullable(),
  notes: z.string().nullable(),
  canceled: z.boolean(),
  canceled_at: isoDateTimeSchema.nullable(),
});
export type MilkMovement = z.infer<typeof milkMovementSchema>;

export const getMilkStorageResponseSchema = apiOkSchema(
  z.object({
    posicoes: z.array(milkPositionSchema),
    resumo: milkStorageSummarySchema,
    movimentos: z.array(milkMovementSchema),
  }),
  z.object({ total_posicoes: z.number().int().nonnegative() }),
);
export type GetMilkStorageResponse = z.infer<typeof getMilkStorageResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/milk/charges
// ─────────────────────────────────────────────────────────────

export const milkChargeSchema = z.object({
  id: idSchema,
  owner_id: idSchema,
  site_id: idSchema.nullable(),
  type: milkChargeTypeSchema,
  amount: z.number(),
  occurred_at: isoDateTimeSchema,
  period_label: z.string().nullable(),
  notes: z.string().nullable(),
  financial_entry_id: idSchema.nullable(),
  canceled: z.boolean(),
  canceled_at: isoDateTimeSchema.nullable(),
});
export type MilkCharge = z.infer<typeof milkChargeSchema>;

export const listMilkChargesResponseSchema = apiOkSchema(
  z.array(milkChargeSchema),
  totalMetaSchema.extend({ total_valor: z.number() }),
);
export type ListMilkChargesResponse = z.infer<typeof listMilkChargesResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/milk/sales/pending
// ─────────────────────────────────────────────────────────────

/** `EntregaEmAberto`, uma linha por comprador. */
export const milkPendingDeliverySchema = z.object({
  buyer_id: idSchema,
  liters: z.number(),
  entregas: z.number().int(),
  primeira: isoDateTimeSchema,
  ultima: isoDateTimeSchema,
});
export type MilkPendingDelivery = z.infer<typeof milkPendingDeliverySchema>;

export const listMilkPendingDeliveriesResponseSchema = apiOkSchema(
  z.array(milkPendingDeliverySchema),
  totalMetaSchema.extend({ total_litros: z.number() }),
);
export type ListMilkPendingDeliveriesResponse = z.infer<typeof listMilkPendingDeliveriesResponseSchema>;
