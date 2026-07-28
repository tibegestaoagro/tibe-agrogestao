import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { resendWelcomeMessageAction } from "@/lib/actions/platform-tenants";

/**
 * POST /api/platform/tenants/:id/welcome-message — só master_admin.
 * Reenvia a mensagem de boas-vindas do Tibé pelo WhatsApp (provider ativo).
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const result = await resendWelcomeMessageAction(params.id);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
