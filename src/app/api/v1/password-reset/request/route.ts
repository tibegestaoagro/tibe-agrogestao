import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
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
    return apiErroDeZod(parsed.error);
  }

  const result = await requestPasswordResetAction(parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const POST = withApi(POSTHandler);
