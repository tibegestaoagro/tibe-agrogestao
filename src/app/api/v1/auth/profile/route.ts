import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { updateOwnNameAction } from "@/lib/actions/auth-self";

/**
 * PATCH /api/v1/auth/profile (briefing de layout, menu "Perfil" do topo):
 * o próprio usuário renomeia a si mesmo. Sem guard() de módulo/billing, mesmo
 * motivo de `/auth/change-password-self`: não é privilégio de papel.
 */
const schema = z.object({ name: z.string().min(2, "Informe um nome com pelo menos 2 caracteres") });

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError(...ApiErrors.UNAUTHORIZED);

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const db = await getTenantDb();
  const result = await updateOwnNameAction(db, user.id, parsed.data.name);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
