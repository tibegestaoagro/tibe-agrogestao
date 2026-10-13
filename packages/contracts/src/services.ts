import { z } from "zod";
import { apiOkSchema, totalMetaSchema } from "./envelope";
import { financialEntryStatusSchema, idSchema, isoDateTimeSchema } from "./primitives";

/**
 * Servicos: prestador (clientes, catalogo, ordens) e servicos contratados ou
 * prestados pela fazenda (service-jobs).
 *
 * Rotas cobertas (so as respostas dos GET):
 *   GET /api/v1/service-clients
 *   GET /api/v1/service-clients/:id/summary
 *   GET /api/v1/services
 *   GET /api/v1/service-orders
 *   GET /api/v1/service-jobs
 *   GET /api/v1/service-jobs/:id
 *   GET /api/v1/service-jobs/:id/costs
 *
 * Perfil do tenant: as quatro primeiras exigem perfil `prestador` e permissao
 * `prestador:read`. As tres de `service-jobs` exigem perfil `fazenda` e
 * permissao `servicos:read`.
 */

// ─────────────────────────────────────────────────────────────
// Enumeracoes
// ─────────────────────────────────────────────────────────────

/** `PricingType` (schema.prisma). Catalogo do prestador (`Service`). */
export const pricingTypeSchema = z.enum(["hour", "day", "fixed"]);
export type PricingType = z.infer<typeof pricingTypeSchema>;

/** `ServiceOrderStatus` (schema.prisma). */
export const serviceOrderStatusSchema = z.enum(["scheduled", "completed", "invoiced"]);
export type ServiceOrderStatus = z.infer<typeof serviceOrderStatusSchema>;

/** `ServiceDirection` (schema.prisma): despesa (contratado) ou receita (prestado). */
export const serviceDirectionSchema = z.enum(["contratado", "prestado"]);
export type ServiceDirection = z.infer<typeof serviceDirectionSchema>;

/** `ServicePricing` (schema.prisma). `fechado` e o empreito. */
export const servicePricingSchema = z.enum([
  "hora",
  "hectare",
  "dia",
  "viagem",
  "tonelada",
  "metro",
  "quilometro",
  "cabeca",
  "fechado",
]);
export type ServicePricing = z.infer<typeof servicePricingSchema>;

/** `ServiceJobStatus` (schema.prisma). */
export const serviceJobStatusSchema = z.enum([
  "agendado",
  "em_andamento",
  "concluido",
  "cancelado",
]);
export type ServiceJobStatus = z.infer<typeof serviceJobStatusSchema>;

/** `ServiceCostKind` (schema.prisma). */
export const serviceCostKindSchema = z.enum([
  "combustivel",
  "mao_de_obra",
  "pedagio",
  "alimentacao",
  "transporte",
  "manutencao",
  "pecas",
  "lubrificantes",
  "comissao",
  "outro",
]);
export type ServiceCostKind = z.infer<typeof serviceCostKindSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/service-clients
// ─────────────────────────────────────────────────────────────

/** `serializeServiceClient` (`src/lib/serializers.ts`). */
export const serviceClientSchema = z.object({
  id: idSchema,
  name: z.string(),
  document: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: isoDateTimeSchema,
});
export type ServiceClient = z.infer<typeof serviceClientSchema>;

/** Query opcional `q`: busca por nome ou telefone. Ordenado por `created_at` decrescente. */
export const listServiceClientsResponseSchema = apiOkSchema(
  z.array(serviceClientSchema),
  totalMetaSchema,
);
export type ListServiceClientsResponse = z.infer<typeof listServiceClientsResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/service-clients/:id/summary
// ─────────────────────────────────────────────────────────────

/**
 * `getClientSummaryAction` (`src/lib/actions/service-clients.ts`).
 *
 * Divergencia com /docs/api: o texto fala em "historico", mas o codigo nao
 * devolve lista nenhuma, so os 6 campos abaixo. O exemplo tambem omite `meta`,
 * que o servidor sempre manda (`{}`). Vale o codigo.
 */
export const serviceClientSummarySchema = z.object({
  client_id: idSchema,
  client_name: z.string(),
  total_invoiced: z.number(),
  total_pending: z.number(),
  orders_count: z.number().int().nonnegative(),
  last_order_at: isoDateTimeSchema.nullable(),
});
export type ServiceClientSummary = z.infer<typeof serviceClientSummarySchema>;

export const serviceClientSummaryResponseSchema = apiOkSchema(serviceClientSummarySchema);
export type ServiceClientSummaryResponse = z.infer<typeof serviceClientSummaryResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/services
// ─────────────────────────────────────────────────────────────

/** `serializeService` (`src/lib/serializers.ts`). `unit_price` e `Decimal` obrigatorio na coluna. */
export const serviceSchema = z.object({
  id: idSchema,
  name: z.string(),
  pricing_type: pricingTypeSchema,
  unit_price: z.number(),
  created_at: isoDateTimeSchema,
});
export type Service = z.infer<typeof serviceSchema>;

/** Catalogo do tenant, ordenado por `name` crescente. */
export const listServicesResponseSchema = apiOkSchema(z.array(serviceSchema), totalMetaSchema);
export type ListServicesResponse = z.infer<typeof listServicesResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/service-orders
// ─────────────────────────────────────────────────────────────

/**
 * `serializeServiceOrder` mais `client_name` e `service_name`, acrescentados
 * inline pela rota (`?? null`). `performed_at` passa por `isoOrNull`, entao o
 * serializer o trata como anulavel.
 */
export const serviceOrderSchema = z.object({
  id: idSchema,
  service_client_id: idSchema,
  service_id: idSchema,
  description: z.string().nullable(),
  quantity: z.number().nullable(),
  total_value: z.number().nullable(),
  performed_at: isoDateTimeSchema.nullable(),
  status: serviceOrderStatusSchema,
  created_at: isoDateTimeSchema,
  client_name: z.string().nullable(),
  service_name: z.string().nullable(),
});
export type ServiceOrder = z.infer<typeof serviceOrderSchema>;

/** Filtros `status` e `service_client_id`. Ordenado por `performed_at` decrescente. */
export const listServiceOrdersResponseSchema = apiOkSchema(
  z.array(serviceOrderSchema),
  totalMetaSchema,
);
export type ListServiceOrdersResponse = z.infer<typeof listServiceOrdersResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/service-jobs
// ─────────────────────────────────────────────────────────────

/**
 * `ServiceJobView` (`src/lib/actions/service-jobs.ts`, funcao `serializar`).
 * `pago`/`restante` e `recebido`/`a_receber` sao a mesma soma com dois nomes.
 * Os campos `*_name` vem de relacoes e sao `?? null`.
 */
export const serviceJobSchema = z.object({
  id: idSchema,
  direction: serviceDirectionSchema,
  status: serviceJobStatusSchema,
  occurred_at: isoDateTimeSchema,
  description: z.string(),
  pricing: servicePricingSchema,
  unit_price: z.number().nullable(),
  agreed_amount: z.number().nullable(),
  worker_count: z.number().int(),
  quantidade: z.number(),
  total: z.number(),
  pago: z.number(),
  restante: z.number(),
  recebido: z.number(),
  a_receber: z.number(),
  machine_id: z.string().nullable(),
  machine_name: z.string().nullable(),
  hour_meter_start: z.number().nullable(),
  hour_meter_end: z.number().nullable(),
  client_location: z.string().nullable(),
  implement: z.string().nullable(),
  operator_worker_id: z.string().nullable(),
  operator_name: z.string().nullable(),
  operator_note: z.string().nullable(),
  contact_id: z.string().nullable(),
  contact_name: z.string().nullable(),
  worker_id: z.string().nullable(),
  worker_name: z.string().nullable(),
  property_id: idSchema,
  pasture_id: z.string().nullable(),
  confinement_stay_id: z.string().nullable(),
  milk_site_id: z.string().nullable(),
  notes: z.string().nullable(),
  canceled_at: isoDateTimeSchema.nullable(),
});
export type ServiceJob = z.infer<typeof serviceJobSchema>;

/**
 * `meta.servicos_sugeridos` e a constante `SERVICOS_SUGERIDOS` (19 textos do
 * §20). Filtros: `status`, `property_id`, `contact_id`, `incluir_cancelados`.
 * Ordenado por `occurred_at` decrescente.
 */
export const listServiceJobsResponseSchema = apiOkSchema(
  z.array(serviceJobSchema),
  totalMetaSchema.extend({ servicos_sugeridos: z.array(z.string()) }),
);
export type ListServiceJobsResponse = z.infer<typeof listServiceJobsResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/service-jobs/:id/costs
// ─────────────────────────────────────────────────────────────

/** `ServiceCostView` (`src/lib/actions/service-costs.ts`, funcao `serializar`). */
export const serviceCostSchema = z.object({
  id: idSchema,
  kind: serviceCostKindSchema,
  description: z.string(),
  amount: z.number().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  occurred_at: isoDateTimeSchema,
  gerou_lancamento: z.boolean(),
  baixou_estoque: z.boolean(),
  canceled_at: isoDateTimeSchema.nullable(),
});
export type ServiceCost = z.infer<typeof serviceCostSchema>;

/**
 * `por_natureza` so tem chave das naturezas que apareceram (e nao canceladas),
 * por isso e `partialRecord`. Cancelados ficam em `linhas` e saem das somas.
 */
const custoPorNaturezaSchema = z.partialRecord(serviceCostKindSchema, z.number());

/** Resposta de `getServiceCosts`, com `linhas` ordenadas por `occurred_at` decrescente. */
export const serviceCostsSchema = z.object({
  linhas: z.array(serviceCostSchema),
  total: z.number(),
  por_natureza: custoPorNaturezaSchema,
});
export type ServiceCosts = z.infer<typeof serviceCostsSchema>;

export const serviceCostsResponseSchema = apiOkSchema(serviceCostsSchema);
export type ServiceCostsResponse = z.infer<typeof serviceCostsResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/service-jobs/:id
// ─────────────────────────────────────────────────────────────

/** Lancamento de quantidade (`ServiceJobLog`), como `getServiceJobDetail` o monta. */
export const serviceJobLogSchema = z.object({
  id: idSchema,
  occurred_at: isoDateTimeSchema,
  quantity: z.number(),
  notes: z.string().nullable(),
  canceled_at: isoDateTimeSchema.nullable(),
});
export type ServiceJobLog = z.infer<typeof serviceJobLogSchema>;

/**
 * Lancamento financeiro do servico. A action tipa `status` como string, mas o
 * valor vem da coluna `FinancialEntry.status`: o enum completo.
 */
export const serviceJobEntrySchema = z.object({
  id: idSchema,
  amount: z.number(),
  status: financialEntryStatusSchema,
  due_date: isoDateTimeSchema.nullable(),
  paid_at: isoDateTimeSchema.nullable(),
});
export type ServiceJobEntry = z.infer<typeof serviceJobEntrySchema>;

/**
 * `ServiceJobDetailView`: o `ServiceJobView` mais logs, lancamentos, custos e
 * resultado. `resultado` e NEGATIVO no `contratado` (o custo soma-se a despesa).
 */
export const serviceJobDetailSchema = serviceJobSchema.extend({
  logs: z.array(serviceJobLogSchema),
  entries: z.array(serviceJobEntrySchema),
  costs: z.array(serviceCostSchema),
  custo_total: z.number(),
  custo_por_natureza: custoPorNaturezaSchema,
  resultado: z.number(),
});
export type ServiceJobDetail = z.infer<typeof serviceJobDetailSchema>;

export const serviceJobDetailResponseSchema = apiOkSchema(serviceJobDetailSchema);
export type ServiceJobDetailResponse = z.infer<typeof serviceJobDetailResponseSchema>;
