import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { confirmPasswordResetAction } from "@/lib/actions/password-reset";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/password-reset/confirm: define a nova senha depois do código
 * validado (spec 2026-07-29). Roda sem sessão. Exige `reset_id` (devolvido
 * por /password-reset/verify) com `verified_at` preenchido.
 */

const schema = z.object({
  reset_id: z.string().trim().min(1, "reset_id é obrigatório"),
  new_password: z.string().min(1, "Nova senha é obrigatória"),
});

async function POSTHandler(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }

  const result = await confirmPasswordResetAction({
    reset_id: parsed.data.reset_id,
    newPassword: parsed.data.new_password,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const POST = withApi(POSTHandler);
