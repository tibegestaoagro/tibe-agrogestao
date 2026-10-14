import { z } from "zod";
import { apiOkSchema, totalMetaSchema } from "./envelope";
import { herdChargeTypeSchema, herdStayTypeSchema } from "./herd";
import { idSchema, isoDateTimeSchema } from "./primitives";

/**
 * Confinamento (fase 3 do Módulo 30).
 *
 * Rotas cobertas (só as de leitura):
 *   GET /api/v1/confinement/sites       serializeSite (src/app/api/v1/confinement/sites/route.ts)
 *   GET /api/v1/confinement/stays       ConfinementLotListItem (src/lib/actions/confinement.ts)
 *   GET /api/v1/confinement/stays/:id   ConfinementLotSummary (src/lib/actions/confinement.ts)
 *
 * As rotas de escrita (POST de sites, stays, costs, feeding e archive) ficam
 * de fora: este pacote só descreve respostas.
 */

/** Espelha o enum `ConfinementSiteType` do Prisma. */
export const confinementSiteTypeSchema = z.enum(["proprio", "boitel"]);
export type ConfinementSiteType = z.infer<typeof confinementSiteTypeSchema>;

/** `serializeSite` (src/app/api/v1/confinement/sites/route.ts). */
export const confinementSiteSchema = z.object({
  id: idSchema,
  name: z.string(),
  type: confinementSiteTypeSchema,
  property_id: idSchema.nullable(),
  counterparty_name: z.string().nullable(),
  city: z.string().nullable(),
  capacity: z.number().int().nullable(),
  notes: z.string().nullable(),
  archived: z.boolean(),
  archived_at: isoDateTimeSchema.nullable(),
});
export type ConfinementSite = z.infer<typeof confinementSiteSchema>;

// GET /api/v1/confinement/sites
export const listConfinementSitesResponseSchema = apiOkSchema(z.array(confinementSiteSchema), totalMetaSchema);
export type ListConfinementSitesResponse = z.infer<typeof listConfinementSitesResponseSchema>;

/** `ConfinementLotListItem` (src/lib/actions/confinement.ts). */
export const confinementLotSchema = z.object({
  id: idSchema,
  type: herdStayTypeSchema,
  confinement_site_id: idSchema.nullable(),
  property_id: idSchema,
  location_name: z.string().nullable(),
  started_at: isoDateTimeSchema,
  days_confined: z.number().int().nonnegative(),
  quantity: z.number(),
  aberta: z.boolean(),
  canceled_at: isoDateTimeSchema.nullable(),
});
export type ConfinementLot = z.infer<typeof confinementLotSchema>;

// GET /api/v1/confinement/stays
export const listConfinementLotsResponseSchema = apiOkSchema(z.array(confinementLotSchema), totalMetaSchema);
export type ListConfinementLotsResponse = z.infer<typeof listConfinementLotsResponseSchema>;

/** `ConfinementFeedingLine` (src/lib/actions/confinement.ts). */
export const confinementFeedingLineSchema = z.object({
  product_id: idSchema,
  product_name: z.string(),
  unit: z.string(),
  quantity: z.number(),
});
export type ConfinementFeedingLine = z.infer<typeof confinementFeedingLineSchema>;

/** `ConfinementLotSummary` (src/lib/actions/confinement.ts). */
export const confinementLotSummarySchema = confinementLotSchema.extend({
  charge_type: herdChargeTypeSchema.nullable(),
  charge_value: z.number().nullable(),
  feeding: z.array(confinementFeedingLineSchema),
  financial_cost: z.number(),
});
export type ConfinementLotSummary = z.infer<typeof confinementLotSummarySchema>;

// GET /api/v1/confinement/stays/:id
export const getConfinementLotResponseSchema = apiOkSchema(confinementLotSummarySchema);
export type GetConfinementLotResponse = z.infer<typeof getConfinementLotResponseSchema>;
