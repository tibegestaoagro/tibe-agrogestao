import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { verifyPasswordResetCodeAction } from "@/lib/actions/password-reset";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/password-reset/verify: valida o código de 6 dígitos (spec
 * 2026-07-29). Roda sem sessão. Sucesso devolve `reset_id`, exigido pela
 * etapa seguinte (/password-reset/confirm).
 */

const schema = z.object({
  email: z.string().trim().email("Email inválido"),
  code: z.string().trim().length(6, "Código deve ter 6 dígitos"),
});

async function POSTHandler(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }

  const result = await verifyPasswordResetCodeAction(parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const POST = withApi(POSTHandler);
