import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { cancelSubscriptionAction } from "@/lib/actions/billing";
import { AsaasNotConfiguredError, AsaasApiError } from "@/lib/asaas";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/billing/cancel
 * Cancela a assinatura no Asaas e marca `canceled` (registrando a transição
 * em SubscriptionStatusLog). Só Owner, como todo o módulo de assinatura.
 *
 * A action existia desde o Módulo 5 mas nunca teve rota: até 2026-08-04 o
 * cliente não conseguia cancelar sozinho, só falando com a Pleno (achado da
 * auditoria).
 *
 * `skipBillingCheck` pelo mesmo motivo de `/billing/subscribe`: quem está em
 * atraso ou bloqueado precisa conseguir chegar aqui. Sem isso, um tenant
 * bloqueado ficaria preso, sem poder nem regularizar nem sair.
 */
async function POSTHandler() {
  const g = await guard("assinatura", "write", { skipBillingCheck: true });
  if ("error" in g) return g.error;

  try {
    const result = await cancelSubscriptionAction(g.db);
    if (!result.ok) return apiError(result.code, result.message, result.status);
    return apiOk(result.data);
  } catch (e) {
    if (e instanceof AsaasNotConfiguredError) {
      return apiError(
        "ASAAS_NOT_CONFIGURED",
        "Cobrança ainda não configurada neste ambiente (ASAAS_API_KEY ausente)",
        503,
      );
    }
    if (e instanceof AsaasApiError) {
      return apiError("ASAAS_ERROR", "O Asaas recusou a solicitação. Tente novamente.", 502);
    }
    throw e;
  }
}

export const POST = withApi(POSTHandler);
