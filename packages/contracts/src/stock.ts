import { z } from "zod";
import { apiOkSchema, totalMetaSchema } from "./envelope";
import { idSchema, isoDateTimeSchema } from "./primitives";

/**
 * Estoque (Módulo 31) e Lista de Compra (Módulo 36): só as respostas de leitura.
 *
 * Rotas cobertas:
 *   GET /api/v1/products              (`listProductsWithBalance`, src/lib/actions/products.ts)
 *   GET /api/v1/product-categories    (`listProductCategories`, src/lib/actions/products.ts)
 *   GET /api/v1/stock/movements       (`listStockMovements`, src/lib/actions/stock-ledger.ts)
 *   GET /api/v1/shopping-items        (`serializeShoppingItem`, src/lib/serializers.ts)
 *
 * `POST /stock/adjust` não tem GET, e as rotas de escrita ficam fora.
 */

/** Espelha o enum `StockMovementType` do Prisma. */
export const stockMovementTypeSchema = z.enum([
  "compra",
  "venda",
  "utilizacao",
  "ajuste",
  "permuta_entrada",
  "permuta_saida",
  // Módulo 39 (F2a): só no estoque das lojas do Empório.
  "implantacao",
  "perda",
]);
export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;

/** Espelha o enum `ShoppingItemStatus` do Prisma. */
export const shoppingItemStatusSchema = z.enum(["pendente", "comprado", "removido"]);
export type ShoppingItemStatus = z.infer<typeof shoppingItemStatusSchema>;

/** Espelha o enum `ShoppingPriority` do Prisma. */
export const shoppingPrioritySchema = z.enum(["normal", "urgente"]);
export type ShoppingPriority = z.infer<typeof shoppingPrioritySchema>;

/** Espelha o enum `ShoppingPurpose` do Prisma. */
export const shoppingPurposeSchema = z.enum([
  "rebanho",
  "pasto",
  "confinamento",
  "leite",
  "maquina",
  "cerca",
  "fazenda_geral",
  "outro",
]);
export type ShoppingPurpose = z.infer<typeof shoppingPurposeSchema>;

/** `StockUnit` (src/lib/stock/units.ts): constante de código, viaja em `meta.units`. */
export const stockUnitSchema = z.object({
  id: z.string(),
  label: z.string(),
  plural: z.string(),
  abbr: z.string(),
  fracionavel: z.boolean(),
  genero: z.enum(["m", "f"]),
});
export type StockUnit = z.infer<typeof stockUnitSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/products
// ─────────────────────────────────────────────────────────────

/** `ProductWithBalance` (src/lib/actions/products.ts). */
export const productWithBalanceSchema = z.object({
  id: idSchema,
  name: z.string(),
  category_id: idSchema,
  category_name: z.string(),
  unit: z.string(),
  unit_label: z.string(),
  brand: z.string().nullable(),
  minimum_stock: z.number().nullable(),
  storage_location: z.string().nullable(),
  notes: z.string().nullable(),
  saldo_por_fazenda: z.array(z.object({ property_id: idSchema, quantity: z.number() })),
  saldo_total: z.number(),
  saldo_no_tenant: z.number(),
  abaixo_do_minimo: z.boolean(),
});
export type ProductWithBalance = z.infer<typeof productWithBalanceSchema>;

export const listProductsResponseSchema = apiOkSchema(
  z.array(productWithBalanceSchema),
  z.object({ units: z.array(stockUnitSchema), abaixo_do_minimo: z.number().int().nonnegative() }),
);
export type ListProductsResponse = z.infer<typeof listProductsResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/product-categories
// ─────────────────────────────────────────────────────────────

export const productCategorySchema = z.object({ id: idSchema, name: z.string() });
export type ProductCategory = z.infer<typeof productCategorySchema>;

/** `meta.seeded`: quantas categorias esta chamada semeou (0 depois da primeira). */
export const listProductCategoriesResponseSchema = apiOkSchema(
  z.array(productCategorySchema),
  z.object({ seeded: z.number().int().nonnegative() }),
);
export type ListProductCategoriesResponse = z.infer<typeof listProductCategoriesResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/stock/movements
// ─────────────────────────────────────────────────────────────

/** `StockMovementView` (src/lib/actions/stock-ledger.ts). */
export const stockMovementSchema = z.object({
  id: idSchema,
  product_id: idSchema,
  product_name: z.string(),
  unit: z.string(),
  property_id: idSchema,
  movement_type: stockMovementTypeSchema,
  quantity: z.number(),
  /** O quanto este movimento mexeu no saldo, com sinal. */
  delta: z.number(),
  occurred_at: isoDateTimeSchema,
  previous_balance: z.number().nullable(),
  corrected_balance: z.number().nullable(),
  purpose: z.string().nullable(),
  notes: z.string().nullable(),
  negotiation_id: idSchema.nullable(),
  canceled_at: isoDateTimeSchema.nullable(),
});
export type StockMovement = z.infer<typeof stockMovementSchema>;

export const listStockMovementsResponseSchema = apiOkSchema(z.array(stockMovementSchema), totalMetaSchema);
export type ListStockMovementsResponse = z.infer<typeof listStockMovementsResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/shopping-items
// ─────────────────────────────────────────────────────────────

/** `serializeShoppingItem` (src/lib/serializers.ts). */
export const shoppingItemSchema = z.object({
  id: idSchema,
  description: z.string(),
  product_id: idSchema.nullable(),
  product_name: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  property_id: idSchema.nullable(),
  property_name: z.string().nullable(),
  /** Módulo 39 (Q68): item da Lista para uma loja do Empório. */
  establishment_id: idSchema.nullable(),
  establishment_name: z.string().nullable(),
  category_id: idSchema.nullable(),
  category_name: z.string().nullable(),
  purpose: shoppingPurposeSchema.nullable(),
  priority: shoppingPrioritySchema,
  place: z.string().nullable(),
  notes: z.string().nullable(),
  status: shoppingItemStatusSchema,
  negotiation_id: idSchema.nullable(),
  resolved_at: isoDateTimeSchema.nullable(),
  created_at: isoDateTimeSchema,
});
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;

export const listShoppingItemsResponseSchema = apiOkSchema(
  z.array(shoppingItemSchema),
  z.object({ total: z.number().int().nonnegative(), units: z.array(stockUnitSchema) }),
);
export type ListShoppingItemsResponse = z.infer<typeof listShoppingItemsResponseSchema>;
