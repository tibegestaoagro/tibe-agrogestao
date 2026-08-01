import { z } from "zod";
import { apiOkSchema, totalMetaSchema } from "./envelope";
import {
  alertStatusSchema,
  alertTypeSchema,
  idSchema,
  isoDateTimeSchema,
  relatedModuleSchema,
} from "./primitives";

/**
 * Alertas.
 *
 * Rotas cobertas:
 *   GET   /api/v1/alerts
 *   PATCH /api/v1/alerts/:id/dismiss
 */

/**
 * `Alert` como sai na resposta.
 *
 * A rota `GET /api/v1/alerts` monta o objeto inline (nao ha
 * `serializeAlert`), e devolve os 9 campos abaixo sempre. `related_module` e
 * a unica enumeracao anulavel do pacote: a coluna e `RelatedModule?`, porque
 * alerta de saldo baixo e de fim de trial nao pertencem a modulo nenhum.
 */
export const alertSchema = z.object({
  id: idSchema,
  alert_type: alertTypeSchema,
  related_module: relatedModuleSchema.nullable(),
  related_id: z.string().nullable(),
  message: z.string(),
  status: alertStatusSchema,
  scheduled_for: isoDateTimeSchema.nullable(),
  sent_at: isoDateTimeSchema.nullable(),
  created_at: isoDateTimeSchema,
});
export type Alert = z.infer<typeof alertSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/alerts
// ─────────────────────────────────────────────────────────────

/**
 * O filtro por tipo se chama `type` na query, embora o campo devolvido se
 * chame `alert_type`. Nao e engano de transcricao: e o nome atual do
 * parametro, e renomear seria mudanca de contrato.
 */
export const listAlertsQuerySchema = z.object({
  type: alertTypeSchema.optional(),
  status: alertStatusSchema.optional(),
});
export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;

/** Ordenado por `created_at` decrescente. */
export const listAlertsResponseSchema = apiOkSchema(z.array(alertSchema), totalMetaSchema);
export type ListAlertsResponse = z.infer<typeof listAlertsResponseSchema>;

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/alerts/:id/dismiss
// ─────────────────────────────────────────────────────────────

/**
 * Sem corpo: a rota ignora a requisicao e so usa o `:id`. Exige escrita em
 * alertas (Owner/Admin), porque Operador so tem leitura no modulo (PRD 5.2).
 *
 * `status` volta como a enumeracao completa, e nao como o literal
 * "dismissed", para nao quebrar a leitura se o servidor um dia devolver outro
 * estado. Hoje e sempre "dismissed".
 */
export const dismissAlertResponseSchema = apiOkSchema(
  z.object({
    id: idSchema,
    status: alertStatusSchema,
  }),
);
export type DismissAlertResponse = z.infer<typeof dismissAlertResponseSchema>;
