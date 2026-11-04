import { z } from "zod";
import { apiOkSchema, totalMetaSchema } from "./envelope";
import { negotiationTypeSchema } from "./negotiations";
import { idSchema, isoDateTimeSchema } from "./primitives";
import { serviceDirectionSchema } from "./services";

/**
 * Contatos de negociação (Módulo 31, §5).
 *
 * Rotas cobertas (só as de leitura):
 *   GET /api/v1/contacts
 *   GET /api/v1/contacts/:id
 *
 * Serializer de origem: `serializar` e `getContactDetail`
 * (src/lib/actions/contacts.ts).
 *
 * Divergência com `/docs/api` (vale o código): a doc omite `notes` na lista e,
 * no detalhe, `phone`, `city`, `notes` e a lista `services`.
 */

/** Espelha o enum `ContactType` do Prisma. */
export const contactTypeSchema = z.enum([
  "particular",
  "fazendeiro",
  "comerciante_gado",
  "frigorifico",
  "leilao",
  "feira_evento",
  "cooperativa",
  "loja_fornecedor",
  "prestador_servico",
  "laticinio",
  "queijaria",
  "mercado",
  "outro",
]);
export type ContactType = z.infer<typeof contactTypeSchema>;

/** `ContactView` (serializar). */
export const contactSchema = z.object({
  id: idSchema,
  name: z.string(),
  type: contactTypeSchema.nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  notes: z.string().nullable(),
  // Cadastro PF/PJ (2026-11-03). `document` sem pontuação (CPF só dígitos; CNPJ pode ser
  // alfanumérico, em maiúscula); CEP só com dígitos; `birth_date` é YYYY-MM-DD.
  person_kind: z.enum(["pf", "pj"]).nullable(),
  document: z.string().nullable(),
  state_registration: z.string().nullable(),
  birth_date: z.string().nullable(),
  responsible_name: z.string().nullable(),
  address_zip: z.string().nullable(),
  address_street: z.string().nullable(),
  address_number: z.string().nullable(),
  address_complement: z.string().nullable(),
  address_district: z.string().nullable(),
  address_state: z.string().nullable(),
  delivery_zip: z.string().nullable(),
  delivery_street: z.string().nullable(),
  delivery_number: z.string().nullable(),
  delivery_complement: z.string().nullable(),
  delivery_district: z.string().nullable(),
  delivery_city: z.string().nullable(),
  delivery_state: z.string().nullable(),
  /** Falta tipo, documento ou telefone (nunca para o Consumidor final). */
  incomplete: z.boolean(),
  /** Contato de sistema (o Consumidor final): fixo, não edita nem arquiva. */
  fixed: z.boolean(),
});
export type Contact = z.infer<typeof contactSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/contacts
// ─────────────────────────────────────────────────────────────

export const listContactsResponseSchema = apiOkSchema(z.array(contactSchema), totalMetaSchema);
export type ListContactsResponse = z.infer<typeof listContactsResponseSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/contacts/:id
// ─────────────────────────────────────────────────────────────

/** Negociação não cancelada do histórico (máx. 50). */
export const contactNegotiationSchema = z.object({
  id: idSchema,
  type: negotiationTypeSchema,
  occurred_at: isoDateTimeSchema,
  amount: z.number().nullable(),
});

/** Serviço não cancelado do histórico (máx. 50), nas duas direções. */
export const contactServiceSchema = z.object({
  id: idSchema,
  occurred_at: isoDateTimeSchema,
  description: z.string(),
  direction: serviceDirectionSchema,
  total: z.number(),
});

export const getContactResponseSchema = apiOkSchema(
  contactSchema.extend({
    archived: z.boolean(),
    negotiations: z.array(contactNegotiationSchema),
    services: z.array(contactServiceSchema),
  }),
);
export type GetContactResponse = z.infer<typeof getContactResponseSchema>;
