import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { changeOwnPasswordAction } from "@/lib/actions/auth-self";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/auth/change-password (spec 2026-07-24): só sessão, sem
 * guard() de módulo/billing (usuário precisa trocar a senha mesmo com a
 * conta em read_only/blocked).
 */
const schema = z.object({ new_password: z.string().min(8) });

async function POSTHandler(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError(...ApiErrors.UNAUTHORIZED);

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "A senha deve ter ao menos 8 caracteres", 422);
  }

  const db = await getTenantDb();
  const result = await changeOwnPasswordAction(db, user.id, parsed.data.new_password);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const POST = withApi(POSTHandler);
