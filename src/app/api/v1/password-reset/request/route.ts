import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { requestPasswordResetAction } from "@/lib/actions/password-reset";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/password-reset/request: pede um código de recuperação de
 * senha (spec 2026-07-29). Roda sem sessão, por natureza (usuário esqueceu a
 * senha). Resposta sempre { requested: true }, mesmo se o email não existir
 * (proteção contra enumeração de conta): ver password-reset.ts.
 */

const schema = z.object({
  email: z.string().trim().email("Email inválido"),
  channel: z.enum(["email", "whatsapp"]),
});

async function POSTHandler(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await requestPasswordResetAction(parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}

export const POST = withApi(POSTHandler);
