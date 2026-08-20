import { apiOk, apiError } from "@/lib/api";
import { getSignupStateAction } from "@/lib/actions/signup-flow";
import { readSignupId } from "@/lib/signup-cookie";

/** GET /api/v1/signup/state (Módulo 19): estado das etapas do cadastro em andamento. */
export async function GET() {
  const signupId = await readSignupId();
  if (!signupId) {
    return apiError("SIGNUP_EXPIRED", "Seu cadastro expirou. Recomece pelo formulário.", 410);
  }
  const result = await getSignupStateAction(signupId);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
