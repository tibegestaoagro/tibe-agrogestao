import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { changeOwnPasswordWithCurrentAction } from "@/lib/actions/auth-self";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/auth/change-password-self (Módulo 19): troca VOLUNTÁRIA, com
 * senha atual. Separada de `/change-password` (troca obrigatória, sem senha
 * atual) de propósito: são cenários de segurança diferentes, e juntar as duas
 * numa rota só com um campo opcional criaria um caminho para pular a exigência.
 *
 * Sem guard() de módulo/billing: trocar a própria senha não é privilégio de
 * papel e precisa funcionar mesmo com a conta em read_only ou blocked.
 */
const schema = z.object({
  current_password: z.string().min(1, "Informe sua senha atual"),
  new_password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
});

async function POSTHandler(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError(...ApiErrors.UNAUTHORIZED);

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const db = await getTenantDb();
  const result = await changeOwnPasswordWithCurrentAction(
    db,
    user.id,
    parsed.data.current_password,
    parsed.data.new_password,
  );
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}

export const POST = withApi(POSTHandler);
