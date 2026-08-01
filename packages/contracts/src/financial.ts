import { z } from "zod";
import { apiOkSchema, totalMetaSchema } from "./envelope";
import {
  entryTypeSchema,
  financialEntryStatusSchema,
  idSchema,
  isoDateTimeSchema,
  relatedModuleSchema,
  trimmedNonEmptySchema,
  trimmedNullishSchema,
} from "./primitives";

/**
 * Financeiro: lancamentos e pendencias.
 *
 * Rotas cobertas:
 *   GET   /api/v1/financial-entries
 *   POST  /api/v1/financial-entries
 *   PATCH /api/v1/financial-entries/:id
 *   PATCH /api/v1/financial-entries/:id/pay
 *   GET   /api/v1/financial/upcoming
 *
 * Fora deste pacote nesta onda: DRE, fluxo de caixa e o link assinado do PDF
 * (`/api/v1/financial/dre`, `/cash-flow`, `/report`, `/report/link`), que sao
 * relatorio, nao lancamento nem pendencia.
 */

// ─────────────────────────────────────────────────────────────
// Entidade
// ─────────────────────────────────────────────────────────────

/**
 * `FinancialEntry` como sai na resposta (`serializeFinancialEntry` em
 * `src/lib/serializers.ts`).
 *
 * A nulabilidade segue a coluna no `schema.prisma`, nao o exemplo abreviado
 * de `/docs/api`: `amount` e `Decimal` obrigatorio (sempre number na
 * resposta), enquanto `category`, `related_id`, `due_date`, `paid_at` e
 * `notes` sao colunas opcionais e chegam como `null` quando vazias.
 *
 * `due_date` e anulavel aqui mesmo sendo obrigatorio na criacao manual:
 * lancamentos gerados por outros modulos (`createLinkedEntry`) podem nascer
 * sem vencimento.
 */
export const financialEntrySchema = z.object({
  id: idSchema,
  entry_type: entryTypeSchema,
  category: z.string().nullable(),
  amount: z.number(),
  related_module: relatedModuleSchema,
  related_id: z.string().nullable(),
  due_date: isoDateTimeSchema.nullable(),
  paid_at: isoDateTimeSchema.nullable(),
  status: financialEntryStatusSchema,
  notes: z.string().nullable(),
  created_at: isoDateTimeSchema,
});
export type FinancialEntry = z.infer<typeof financialEntrySchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/financial-entries
// ─────────────────────────────────────────────────────────────

/**
 * Filtros da listagem, todos opcionais, todos lidos de `searchParams`.
 *
 * `start` e `end` incidem sobre `due_date` e sao repassados crus para
 * `new Date(...)` pela rota, sem validacao de formato: por isso ficam como
 * string e nao como `isoDateTimeSchema`. Mande ISO8601 mesmo assim, e o que
 * o `Date` interpreta sem ambiguidade.
 *
 * `category` e busca parcial, sem diferenciar maiuscula de minuscula
 * (`contains`, `mode: "insensitive"`), nao igualdade exata.
 */
export const listFinancialEntriesQuerySchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  entry_type: entryTypeSchema.optional(),
  category: z.string().optional(),
  related_module: relatedModuleSchema.optional(),
  status: financialEntryStatusSchema.optional(),
});
export type ListFinancialEntriesQuery = z.infer<typeof listFinancialEntriesQuerySchema>;

/** Ordenado por `due_date` decrescente. */
export const listFinancialEntriesResponseSchema = apiOkSchema(
  z.array(financialEntrySchema),
  totalMetaSchema,
);
export type ListFinancialEntriesResponse = z.infer<typeof listFinancialEntriesResponseSchema>;

// ─────────────────────────────────────────────────────────────
// POST /api/v1/financial-entries
// ─────────────────────────────────────────────────────────────

/**
 * Lancamento manual. Nasce sempre com `related_module: "geral"` e
 * `status: "pending"`: nenhum dos dois e aceito no corpo, quem os define e a
 * action (`createManualEntryAction`).
 */
export const createFinancialEntryRequestSchema = z.object({
  entry_type: entryTypeSchema,
  category: trimmedNonEmptySchema,
  amount: z.number().positive(),
  due_date: isoDateTimeSchema,
  notes: trimmedNullishSchema,
});
export type CreateFinancialEntryRequest = z.infer<typeof createFinancialEntryRequestSchema>;

/** 201, com o lancamento completo (a rota rele o registro depois de criar). */
export const createFinancialEntryResponseSchema = apiOkSchema(financialEntrySchema);
export type CreateFinancialEntryResponse = z.infer<typeof createFinancialEntryResponseSchema>;

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/financial-entries/:id
// ─────────────────────────────────────────────────────────────

/**
 * Edicao parcial, permitida so em lancamento manual
 * (`related_module: "geral"`). Editar um lancamento gerado por venda de
 * animal, insumo ou ordem faturada devolve `NOT_EDITABLE` (422).
 *
 * `entry_type` nao esta aqui de proposito: a rota nao aceita trocar receita
 * por despesa.
 */
export const updateFinancialEntryRequestSchema = z.object({
  category: trimmedNonEmptySchema.optional(),
  amount: z.number().positive().optional(),
  due_date: isoDateTimeSchema.optional(),
  notes: trimmedNullishSchema,
});
export type UpdateFinancialEntryRequest = z.infer<typeof updateFinancialEntryRequestSchema>;

export const updateFinancialEntryResponseSchema = apiOkSchema(financialEntrySchema);
export type UpdateFinancialEntryResponse = z.infer<typeof updateFinancialEntryResponseSchema>;

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/financial-entries/:id/pay
// ─────────────────────────────────────────────────────────────

/**
 * Marcar como pago vale para lancamento de qualquer origem, nao so manual.
 *
 * O corpo inteiro e dispensavel: a rota trata ausencia de JSON como `{}` e
 * usa o instante atual como `paid_at`. Marcar de novo um lancamento ja pago
 * devolve `ALREADY_PAID` (409).
 */
export const payFinancialEntryRequestSchema = z.object({
  paid_at: isoDateTimeSchema.nullish(),
});
export type PayFinancialEntryRequest = z.infer<typeof payFinancialEntryRequestSchema>;

export const payFinancialEntryResponseSchema = apiOkSchema(financialEntrySchema);
export type PayFinancialEntryResponse = z.infer<typeof payFinancialEntryResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/financial/upcoming
// ─────────────────────────────────────────────────────────────

/**
 * Pendencia dos proximos 7 dias: `status: "pending"` com `due_date` na
 * janela, em ordem crescente de vencimento.
 *
 * NAO e um `FinancialEntry` reduzido por acaso: `getUpcoming()` monta uma
 * projecao propria, com 6 campos e mais nenhum. `status`, `notes`,
 * `related_id`, `paid_at` e `created_at` nao vem. E `due_date` aqui nunca e
 * nulo, ao contrario da entidade completa, porque o filtro da consulta ja
 * garante que existe.
 */
export const upcomingEntrySchema = z.object({
  id: idSchema,
  entry_type: entryTypeSchema,
  category: z.string().nullable(),
  amount: z.number(),
  due_date: isoDateTimeSchema,
  related_module: relatedModuleSchema,
});
export type UpcomingEntry = z.infer<typeof upcomingEntrySchema>;

export const listUpcomingResponseSchema = apiOkSchema(
  z.array(upcomingEntrySchema),
  totalMetaSchema,
);
export type ListUpcomingResponse = z.infer<typeof listUpcomingResponseSchema>;
