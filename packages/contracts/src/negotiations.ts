import { z } from "zod";
import { apiOkSchema, totalMetaSchema } from "./envelope";
import { herdMovementTypeSchema } from "./herd";
import {
  entryTypeSchema,
  financialEntryStatusSchema,
  idSchema,
  isoDateTimeSchema,
} from "./primitives";

/**
 * Negociacoes (Modulo 31): respostas das rotas de leitura.
 *
 * Rotas cobertas:
 *   GET /api/v1/negotiations
 *   GET /api/v1/negotiations/:id
 *
 * O formato vem de `serializeNegotiation` (`src/lib/actions/negotiations.ts`),
 * que as duas rotas usam. Ele devolve MENOS que o `NegotiationDetail` da
 * action: `recebe_dinheiro`, `barter_out_note` e `barter_in_note` existem no
 * detalhe interno mas o serializer nao os repassa, e `produtos[].movement_type`
 * idem. Vale o que sai na resposta.
 */

// ─────────────────────────────────────────────────────────────
// Enumeracoes
// ─────────────────────────────────────────────────────────────

/** `NegotiationType` (schema.prisma). */
export const negotiationTypeSchema = z.enum([
  "compra_gado",
  "venda_gado",
  "compra_produto",
  "venda_produto",
  "permuta",
  "evento",
  "venda_leite",
]);
export type NegotiationType = z.infer<typeof negotiationTypeSchema>;

/** `NegotiationEntryRole` (schema.prisma). */
export const negotiationEntryRoleSchema = z.enum(["principal", "custo_adicional", "estorno"]);
export type NegotiationEntryRole = z.infer<typeof negotiationEntryRoleSchema>;

/**
 * `SituacaoNegociacao` (tipo da action, derivado dos filhos e nunca gravado).
 * Nao e enum do Prisma.
 */
export const situacaoNegociacaoSchema = z.enum([
  "confirmada",
  "vencida",
  "parcialmente_paga",
  "paga",
  "cancelada",
  "sem_valor",
]);
export type SituacaoNegociacao = z.infer<typeof situacaoNegociacaoSchema>;

// ─────────────────────────────────────────────────────────────
// Objeto
// ─────────────────────────────────────────────────────────────

/** Soma dos lancamentos (§15), nunca campo gravado. */
export const negotiationTotaisSchema = z.object({
  principal: z.number(),
  custos: z.number(),
  total: z.number(),
  liquido: z.number(),
});
export type NegotiationTotais = z.infer<typeof negotiationTotaisSchema>;

/** Movimento de rebanho do negocio. `category_id` e `to ?? from` da categoria. */
export const negotiationMovimentoSchema = z.object({
  id: idSchema,
  movement_type: herdMovementTypeSchema,
  quantity: z.number(),
  category_id: z.string().nullable(),
  canceled_at: isoDateTimeSchema.nullable(),
});
export type NegotiationMovimento = z.infer<typeof negotiationMovimentoSchema>;

/** Movimento de estoque (negocio de insumo). `unit` e texto livre da coluna. */
export const negotiationProdutoSchema = z.object({
  id: idSchema,
  product_id: idSchema,
  product_name: z.string(),
  unit: z.string(),
  quantity: z.number(),
  canceled_at: isoDateTimeSchema.nullable(),
});
export type NegotiationProduto = z.infer<typeof negotiationProdutoSchema>;

/** Lancamento financeiro do negocio (principal, custo adicional ou estorno). */
export const negotiationLancamentoSchema = z.object({
  id: idSchema,
  entry_type: entryTypeSchema,
  amount: z.number(),
  status: financialEntryStatusSchema,
  due_date: isoDateTimeSchema.nullable(),
  category: z.string().nullable(),
  negotiation_role: negotiationEntryRoleSchema.nullable(),
});
export type NegotiationLancamento = z.infer<typeof negotiationLancamentoSchema>;

/** `Negotiation` como `serializeNegotiation` devolve. */
export const negotiationSchema = z.object({
  id: idSchema,
  type: negotiationTypeSchema,
  occurred_at: isoDateTimeSchema,
  property_id: idSchema,
  contact_id: z.string().nullable(),
  contact_name: z.string().nullable(),
  amount: z.number().nullable(),
  /** §6.2 e §7.2: informativos; nulos quando o produtor não disse. */
  total_weight_kg: z.number().nullable(),
  arroba_count: z.number().nullable(),
  arroba_price: z.number().nullable(),
  notes: z.string().nullable(),
  canceled_at: isoDateTimeSchema.nullable(),
  canceled_reason: z.string().nullable(),
  created_at: isoDateTimeSchema,
  situacao: situacaoNegociacaoSchema,
  totais: negotiationTotaisSchema,
  movimentos: z.array(negotiationMovimentoSchema),
  produtos: z.array(negotiationProdutoSchema),
  lancamentos: z.array(negotiationLancamentoSchema),
});
export type Negotiation = z.infer<typeof negotiationSchema>;

// ─────────────────────────────────────────────────────────────
// Respostas
// ─────────────────────────────────────────────────────────────

/** GET /api/v1/negotiations: `occurred_at` decrescente, `meta: { total }`. */
export const listNegotiationsResponseSchema = apiOkSchema(
  z.array(negotiationSchema),
  totalMetaSchema,
);
export type ListNegotiationsResponse = z.infer<typeof listNegotiationsResponseSchema>;

/** GET /api/v1/negotiations/:id. */
export const getNegotiationResponseSchema = apiOkSchema(negotiationSchema);
export type GetNegotiationResponse = z.infer<typeof getNegotiationResponseSchema>;
