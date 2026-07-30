import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { verifySignupCodeAction } from "@/lib/actions/signup-flow";
import { readSignupId, clearSignupCookie } from "@/lib/signup-cookie";

/**
 * POST /api/v1/signup/verify (Módulo 19, etapas 2 e 3).
 *
 * Confirma o código de um canal. Quando o SEGUNDO canal é confirmado, a conta
 * é criada e a resposta traz a senha temporária, usada só para o login
 * automático do navegador que acabou de concluir o cadastro.
 */

const schema = z.object({
  channel: z.enum(["whatsapp", "email"]),
  code: z.string().trim().regex(/^\d{6}$/, "Código inválido ou expirado"),
});

export async function POST(request: Request) {
  const signupId = readSignupId();
  if (!signupId) {
    return apiError("SIGNUP_EXPIRED", "Seu cadastro expirou. Recomece pelo formulário.", 410);
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // Formato errado responde igual a código errado: não entrega pista nenhuma.
    return apiError("INVALID_CODE", "Código inválido ou expirado", 422);
  }

  const result = await verifySignupCodeAction(signupId, parsed.data.channel, parsed.data.code);
  if (!result.ok) return apiError(result.code, result.message, result.status);

  const res = apiOk(result.data);
  if (result.data.completed) res.cookies.set(clearSignupCookie());
  return res;
}
