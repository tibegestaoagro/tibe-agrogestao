import { z } from "zod";
import { apiOkSchema, totalMetaSchema } from "./envelope";
import { idSchema, isoDateTimeSchema } from "./primitives";

/**
 * Rebanho: respostas das rotas GET.
 *
 * Rotas cobertas:
 *   GET /api/v1/animals
 *   GET /api/v1/animals/:id
 *   GET /api/v1/animal-categories
 *   GET /api/v1/pastures
 *   GET /api/v1/herd/positions
 *   GET /api/v1/herd/movements
 *   GET /api/v1/herd/stays
 *
 * So respostas: o corpo das rotas de escrita nao esta aqui.
 */

// ─────────────────────────────────────────────────────────────
// Enumeracoes (prisma/schema.prisma, mesma ordem)
// ─────────────────────────────────────────────────────────────

/** `AnimalSex` (schema.prisma). */
export const animalSexSchema = z.enum(["male", "female"]);
export type AnimalSex = z.infer<typeof animalSexSchema>;

/** `HerdSituation` (schema.prisma). */
export const herdSituationSchema = z.enum([
  "presente",
  "evento",
  "pasto_terceiro",
  "boitel",
  "confinamento",
  "desaparecido",
]);
export type HerdSituation = z.infer<typeof herdSituationSchema>;

/** `HerdOwner` (schema.prisma). */
export const herdOwnerSchema = z.enum(["proprio", "terceiro"]);
export type HerdOwner = z.infer<typeof herdOwnerSchema>;

/** `HerdMovementType` (schema.prisma). */
export const herdMovementTypeSchema = z.enum([
  "saldo_inicial",
  "nascimento",
  "compra",
  "venda",
  "morte",
  "transferencia_pasto",
  "transferencia_fazenda",
  "mudanca_categoria",
  "ajuste",
  "envio_evento",
  "envio_pasto_terceiro",
  "envio_boitel",
  "envio_confinamento",
  "retorno_estadia",
  "entrada_terceiro",
  "saida_terceiro",
  "desaparecimento",
  "perda_confirmada",
  "permuta_entrada",
  "permuta_saida",
]);
export type HerdMovementType = z.infer<typeof herdMovementTypeSchema>;

/** `HerdStayType` (schema.prisma). */
export const herdStayTypeSchema = z.enum([
  "pasto_terceiro",
  "boitel",
  "evento",
  "terceiro_na_fazenda",
  "desaparecimento",
  "confinamento",
]);
export type HerdStayType = z.infer<typeof herdStayTypeSchema>;

/** `HerdChargeType` (schema.prisma). */
export const herdChargeTypeSchema = z.enum([
  "por_cabeca",
  "por_mes",
  "por_periodo",
  "fechado",
  "por_dia",
  "por_cabeca_dia",
]);
export type HerdChargeType = z.infer<typeof herdChargeTypeSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/animals e GET /api/v1/animals/:id
// ─────────────────────────────────────────────────────────────

/**
 * `AnimalBatch` via `serializeAnimal` (`src/lib/serializers.ts`). Todos os
 * campos saem sempre; os anulaveis saem como `null`, nunca omitidos.
 */
export const animalSchema = z.object({
  id: idSchema,
  category_id: idSchema,
  quantity: z.number().int(),
  ear_tag: z.string().nullable(),
  breed: z.string().nullable(),
  sex: animalSexSchema.nullable(),
  property_id: idSchema,
  birth_date: isoDateTimeSchema.nullable(),
  average_weight: z.number().nullable(),
  acquisition_cost: z.number().nullable(),
  acquired_at: isoDateTimeSchema.nullable(),
  created_at: isoDateTimeSchema,
});
export type Animal = z.infer<typeof animalSchema>;

/**
 * Item da listagem: `serializeAnimal` mais tres extensoes que a rota monta
 * inline. `last_vaccination_at` e a `applied_at` da vacinacao mais recente.
 */
export const animalListItemSchema = animalSchema.extend({
  property_name: z.string().nullable(),
  category_name: z.string().nullable(),
  last_vaccination_at: isoDateTimeSchema.nullable(),
});
export type AnimalListItem = z.infer<typeof animalListItemSchema>;

/**
 * Query: todos opcionais (property_id, category_id, breed, q = busca por
 * brinco). O `status` saiu em 2026-08-04.
 */
export const listAnimalsResponseSchema = apiOkSchema(z.array(animalListItemSchema), totalMetaSchema);
export type ListAnimalsResponse = z.infer<typeof listAnimalsResponseSchema>;

/**
 * Detalhe: `serializeAnimal` mais `property_name` apenas. Nao traz
 * `category_name` nem `last_vaccination_at`. `meta` vem `{}`.
 */
export const animalDetailSchema = animalSchema.extend({
  property_name: z.string().nullable(),
});
export type AnimalDetail = z.infer<typeof animalDetailSchema>;

export const getAnimalResponseSchema = apiOkSchema(animalDetailSchema);
export type GetAnimalResponse = z.infer<typeof getAnimalResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/animal-categories
// ─────────────────────────────────────────────────────────────

/**
 * Montado inline na rota. A primeira leitura de um tenant sem categorias
 * semeia a lista padrao. Ordenado por `name` crescente.
 */
export const animalCategorySchema = z.object({
  id: idSchema,
  name: z.string(),
  active: z.boolean(),
  created_at: isoDateTimeSchema,
});
export type AnimalCategory = z.infer<typeof animalCategorySchema>;

export const listAnimalCategoriesResponseSchema = apiOkSchema(
  z.array(animalCategorySchema),
  totalMetaSchema,
);
export type ListAnimalCategoriesResponse = z.infer<typeof listAnimalCategoriesResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/pastures
// ─────────────────────────────────────────────────────────────

/** `Pasture` via `serializePasture`. A listagem so traz ativos, entao `archived` e sempre false ali. */
export const pastureSchema = z.object({
  id: idSchema,
  property_id: idSchema,
  name: z.string(),
  area_hectares: z.number().nullable(),
  archived: z.boolean(),
  archived_at: isoDateTimeSchema.nullable(),
  created_at: isoDateTimeSchema,
});
export type Pasture = z.infer<typeof pastureSchema>;

/**
 * `getPastureAreaSummary` (`src/lib/actions/properties.ts`). `total_area` e
 * `remaining_area` sao `null` quando a fazenda nao tem area cadastrada.
 */
export const pastureAreaSummarySchema = z.object({
  total_area: z.number().nullable(),
  distributed_area: z.number(),
  remaining_area: z.number().nullable(),
  over_allocated: z.boolean(),
});
export type PastureAreaSummary = z.infer<typeof pastureAreaSummarySchema>;

/** Exige `?property_id=` (sem ele a rota devolve 422). Ordenado por `name`. */
export const listPasturesResponseSchema = apiOkSchema(
  z.array(pastureSchema),
  totalMetaSchema.extend({ area_summary: pastureAreaSummarySchema }),
);
export type ListPasturesResponse = z.infer<typeof listPasturesResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/herd/positions
// ─────────────────────────────────────────────────────────────

/**
 * Chave de uma posicao do livro-razao (`HerdPositionKey`,
 * `src/lib/actions/herd-ledger.ts`). `category_id` aqui e o slug das 12
 * faixas de idade (ex "femea_36_mais"), nao o id de `AnimalCategory`.
 */
export const herdPositionKeySchema = z.object({
  category_id: z.string(),
  property_id: idSchema,
  pasture_id: z.string().nullable(),
  situation: herdSituationSchema,
  owner: herdOwnerSchema,
});
export type HerdPositionKey = z.infer<typeof herdPositionKeySchema>;

/** Posicao com saldo (soma das movimentacoes nao canceladas, nunca gravado). */
export const herdPositionSchema = herdPositionKeySchema.extend({
  quantity: z.number().int(),
});
export type HerdPosition = z.infer<typeof herdPositionSchema>;

/**
 * Posicoes zeradas nao sao devolvidas. `total_quantity` soma o que o filtro
 * devolveu (so rebanho proprio com `?owner=proprio`). Filtros opcionais:
 * category_id, property_id, pasture_id, situation, owner.
 */
export const listHerdPositionsResponseSchema = apiOkSchema(
  z.array(herdPositionSchema),
  totalMetaSchema.extend({ total_quantity: z.number().int() }),
);
export type ListHerdPositionsResponse = z.infer<typeof listHerdPositionsResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/herd/movements
// ─────────────────────────────────────────────────────────────

/** `serializeHerdMovement` (`src/lib/actions/herd-ledger.ts`). */
export const herdMovementSchema = z.object({
  id: idSchema,
  movement_type: herdMovementTypeSchema,
  quantity: z.number().int(),
  from: herdPositionKeySchema.nullable(),
  to: herdPositionKeySchema.nullable(),
  value: z.number().nullable(),
  financial_entry_id: z.string().nullable(),
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  occurred_at: isoDateTimeSchema,
  created_at: isoDateTimeSchema,
  canceled_at: isoDateTimeSchema.nullable(),
  canceled_reason: z.string().nullable(),
  recorded_by: z.object({ id: idSchema, name: z.string() }).nullable(),
});
export type HerdMovement = z.infer<typeof herdMovementSchema>;

/**
 * Mais recente primeiro. Canceladas aparecem por padrao (`include_canceled=false`
 * as esconde). `meta.total` e o total do filtro, nao o tamanho da pagina
 * (`limit` padrao 50, maximo 200, mais `offset`).
 */
export const listHerdMovementsResponseSchema = apiOkSchema(
  z.array(herdMovementSchema),
  totalMetaSchema,
);
export type ListHerdMovementsResponse = z.infer<typeof listHerdMovementsResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/herd/stays
// ─────────────────────────────────────────────────────────────

/**
 * `HerdStayListItem` (`src/lib/actions/herd-stays.ts`) com as datas em ISO
 * pela rota. `saldo_aberto` e `aberta` sao derivados das movimentacoes.
 * A rota passa `started_at` por `isoOrNull`, mas a coluna e obrigatoria, entao
 * nunca sai nulo.
 */
export const herdStaySchema = z.object({
  id: idSchema,
  type: herdStayTypeSchema,
  property_id: idSchema,
  counterparty_name: z.string().nullable(),
  location_name: z.string().nullable(),
  negotiation_id: z.string().nullable(),
  started_at: isoDateTimeSchema,
  expected_end_at: isoDateTimeSchema.nullable(),
  charge_type: herdChargeTypeSchema.nullable(),
  charge_value: z.number().nullable(),
  saldo_aberto: z.number().int(),
  aberta: z.boolean(),
  canceled_at: isoDateTimeSchema.nullable(),
});
export type HerdStay = z.infer<typeof herdStaySchema>;

/** Mais recente primeiro (`started_at`). Filtros opcionais: property_id, type, abertas=true. */
export const listHerdStaysResponseSchema = apiOkSchema(z.array(herdStaySchema), totalMetaSchema);
export type ListHerdStaysResponse = z.infer<typeof listHerdStaysResponseSchema>;
