import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { subscribeAction } from "@/lib/actions/billing";
import { AsaasNotConfiguredError, AsaasApiError } from "@/lib/asaas";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/billing/subscribe (spec 5.5)
 * Cria (ou troca de plano) a assinatura real no Asaas. Só Owner.
 * skipBillingCheck: precisa funcionar mesmo com a conta em atraso/bloqueada
 *: é assim que o tenant regulariza.
 */

const schema = z.object({
  plan: z.enum(["campo", "fazenda", "grupo"]),
  billing_type: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]),
});

async function POSTHandler(request: Request) {
  const g = await guard("assinatura", "write", { skipBillingCheck: true });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: g.user.tenant_id } });
  if (!tenant) return apiError("NOT_FOUND", "Tenant não encontrado", 404);
  if (!tenant.document || tenant.document.length < 11) {
    return apiError(
      "MISSING_DOCUMENT",
      "Cadastre um CNPJ/CPF válido em Configurações antes de assinar",
      422,
    );
  }

  try {
    const result = await subscribeAction(g.db, tenant, {
      plan: parsed.data.plan,
      billingType: parsed.data.billing_type,
    });
    if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
    return apiOk(result.data, {}, { status: 201 });
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
