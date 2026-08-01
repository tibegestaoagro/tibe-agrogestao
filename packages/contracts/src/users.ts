import { z } from "zod";
import { apiOkSchema } from "./envelope";
import {
  emailSchema,
  idSchema,
  isoDateTimeSchema,
  trimmedNonEmptySchema,
  trimmedNullishSchema,
  userRoleSchema,
} from "./primitives";

/**
 * Usuarios do tenant.
 *
 * Rotas cobertas:
 *   GET   /api/v1/users
 *   POST  /api/v1/users
 *   PATCH /api/v1/users/:id/role
 *   PATCH /api/v1/users/:id/active
 */

/**
 * `User` como sai na resposta. A rota monta o objeto inline e escolhe os 7
 * campos abaixo: `password_hash`, `tenant_id` e `must_change_password`
 * existem no banco e nao saem daqui.
 */
export const userSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  role: userRoleSchema,
  active: z.boolean(),
  created_at: isoDateTimeSchema,
});
export type User = z.infer<typeof userSchema>;

/**
 * Uso de assentos do plano (`SeatUsage` em `src/lib/seats.ts`).
 *
 * `used` conta so usuario ativo, e o Owner ocupa assento. `has_room` pode ser
 * `false` com `used` acima de `limit`: um tenant que trocou para um plano
 * menor mantem todo mundo funcionando, so nao convida nem reativa.
 */
export const seatUsageSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  has_room: z.boolean(),
});
export type SeatUsage = z.infer<typeof seatUsageSchema>;

// ─────────────────────────────────────────────────────────────
// GET /api/v1/users
// ─────────────────────────────────────────────────────────────

/** `seats` e extensao aditiva ao contrato da spec 5.2 (2026-07-30). */
export const listUsersMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  seats: seatUsageSchema,
});
export type ListUsersMeta = z.infer<typeof listUsersMetaSchema>;

/** Ordenado por `created_at` crescente. Sem filtro nem paginacao. */
export const listUsersResponseSchema = apiOkSchema(z.array(userSchema), listUsersMetaSchema);
export type ListUsersResponse = z.infer<typeof listUsersResponseSchema>;

// ─────────────────────────────────────────────────────────────
// POST /api/v1/users
// ─────────────────────────────────────────────────────────────

/**
 * Convite. So Owner pode convidar outro Owner (403 `FORBIDDEN`).
 *
 * Ordem das recusas, deliberada: email duplicado (`DUPLICATE_EMAIL`, 409) e
 * checado ANTES do limite de assentos (`SEAT_LIMIT_REACHED`, 422). Responder
 * "faca upgrade" a quem digitou um email ja existente mandaria o cliente
 * pagar por um problema que nao e esse.
 */
export const inviteUserRequestSchema = z.object({
  name: trimmedNonEmptySchema,
  email: emailSchema,
  phone: trimmedNullishSchema,
  role: userRoleSchema,
});
export type InviteUserRequest = z.infer<typeof inviteUserRequestSchema>;

/**
 * 201. `temp_password` aparece UMA unica vez, aqui: o banco guarda so o hash,
 * e o convite nao dispara email. Perder esta resposta significa ter de gerar
 * outra senha.
 */
export const inviteUserResponseSchema = apiOkSchema(
  z.object({
    id: idSchema,
    temp_password: z.string(),
  }),
);
export type InviteUserResponse = z.infer<typeof inviteUserResponseSchema>;

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/users/:id/role
// ─────────────────────────────────────────────────────────────

export const updateUserRoleRequestSchema = z.object({
  role: userRoleSchema,
});
export type UpdateUserRoleRequest = z.infer<typeof updateUserRoleRequestSchema>;

/**
 * Devolve SO o `id`.
 *
 * `/docs/api` documenta `{ "id": "cl...", "role": "ADMIN" }`, mas
 * `updateUserRoleAction` devolve `ok({ id: userId })` e a rota repassa esse
 * objeto sem acrescentar nada: `role` nao vem. A documentacao esta errada, e
 * o contrato aqui segue o codigo. Para exibir o papel novo, use o valor que
 * voce acabou de enviar ou releia a lista.
 */
export const updateUserRoleResponseSchema = apiOkSchema(z.object({ id: idSchema }));
export type UpdateUserRoleResponse = z.infer<typeof updateUserRoleResponseSchema>;

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/users/:id/active
// ─────────────────────────────────────────────────────────────

export const setUserActiveRequestSchema = z.object({
  active: z.boolean(),
});
export type SetUserActiveRequest = z.infer<typeof setUserActiveRequestSchema>;

/**
 * Devolve SO o `id`, mesma divergencia de `/role`: `/docs/api` documenta
 * `{ "id": "cl...", "active": false }`, e `setUserActiveAction` devolve
 * `ok({ id: userId })`.
 */
export const setUserActiveResponseSchema = apiOkSchema(z.object({ id: idSchema }));
export type SetUserActiveResponse = z.infer<typeof setUserActiveResponseSchema>;
