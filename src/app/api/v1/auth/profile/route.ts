import { z } from "zod";
import { apiOk, apiError, ApiErrors, apiErroDeZod } from "@/lib/api";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { updateOwnNameAction } from "@/lib/actions/auth-self";
import { withApi } from "@/lib/route";

/**
 * PATCH /api/v1/auth/profile (briefing de layout, menu "Perfil" do topo):
 * o próprio usuário renomeia a si mesmo. Sem guard() de módulo/billing, mesmo
 * motivo de `/auth/change-password-self`: não é privilégio de papel.
 */
const schema = z.object({ name: z.string().min(2, "Informe um nome com pelo menos 2 caracteres") });

async function PATCHHandler(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError(...ApiErrors.UNAUTHORIZED);

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }

  const db = await getTenantDb();
  const result = await updateOwnNameAction(db, user.id, parsed.data.name);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const PATCH = withApi(PATCHHandler);
