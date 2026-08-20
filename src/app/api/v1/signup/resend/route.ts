import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { resendSignupCodeAction } from "@/lib/actions/signup-flow";
import { readSignupId } from "@/lib/signup-cookie";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/signup/resend (Módulo 19).
 * Reenvia o código e, com `destination`, corrige o número ou o email antes.
 * Só vale para canal ainda não confirmado.
 */

const schema = z.object({
  channel: z.enum(["whatsapp", "email"]),
  destination: z.string().trim().min(1).nullish(),
});

async function POSTHandler(request: Request) {
  const signupId = await readSignupId();
  if (!signupId) {
    return apiError("SIGNUP_EXPIRED", "Seu cadastro expirou. Recomece pelo formulário.", 410);
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await resendSignupCodeAction(
    signupId,
    parsed.data.channel,
    parsed.data.destination,
  );
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}

export const POST = withApi(POSTHandler);
