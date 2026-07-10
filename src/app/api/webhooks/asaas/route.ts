import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSubscription, AsaasNotConfiguredError } from "@/lib/asaas";

/**
 * POST /api/webhooks/asaas (spec 5.6)
 *
 * Autenticação por token no header `asaas-access-token` (configurado no
 * painel do Asaas ao cadastrar o webhook — PRD §10.3, mesmo padrão de
 * `/api/webhooks/*`, não é sessão).
 *
 * Lookup cross-tenant legítimo (webhook não tem sessão de tenant): busca a
 * Subscription pelo `asaas_subscription_id` via client base — mesma
 * categoria de exceção documentada em CLAUDE.md (resolve-contact do M3,
 * job de alertas do M4).
 */

const schema = z.object({
  event: z.string(),
  payment: z
    .object({
      subscription: z.string().nullish(),
      customer: z.string().nullish(),
      value: z.number().nullish(),
      status: z.string().nullish(),
    })
    .nullish(),
});

export async function POST(request: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  const provided = request.headers.get("asaas-access-token");
  if (!expected) {
    return apiError("SERVER_MISCONFIGURED", "ASAAS_WEBHOOK_TOKEN não configurado", 500);
  }
  if (!provided || provided !== expected) {
    return apiError("UNAUTHORIZED", "Token inválido", 401);
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Payload inválido", 422);
  }
  const { event, payment } = parsed.data;
  const asaasSubscriptionId = payment?.subscription;

  // Eventos fora do escopo da spec 5.6: reconhece sem processar (não é erro).
  if (!["PAYMENT_CONFIRMED", "PAYMENT_OVERDUE", "PAYMENT_DELETED"].includes(event)) {
    return apiOk({ received: true, processed: false });
  }
  if (!asaasSubscriptionId) {
    return apiOk({ received: true, processed: false, reason: "sem subscription no payload" });
  }

  const subscription = await prisma.subscription.findFirst({
    where: { asaas_subscription_id: asaasSubscriptionId },
  });
  if (!subscription) {
    // Assinatura não rastreada no Tibé (ex: ambiente de teste do Asaas) — ok, não é erro nosso.
    return apiOk({ received: true, processed: false, reason: "subscription não encontrada" });
  }

  if (event === "PAYMENT_CONFIRMED") {
    let nextDueDate: Date | null = null;
    try {
      const remote = await getSubscription(asaasSubscriptionId);
      nextDueDate = new Date(remote.nextDueDate);
    } catch (e) {
      if (!(e instanceof AsaasNotConfiguredError)) {
        // Não derruba o webhook por uma falha de rede pontual — segue sem atualizar a data exata.
        console.error("Falha ao buscar next_due_date no Asaas:", e);
      }
    }
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "active",
        ...(nextDueDate ? { next_due_date: nextDueDate } : {}),
      },
    });
    await prisma.tenant.update({
      where: { id: subscription.tenant_id },
      data: { status: "active" },
    });
  } else if (event === "PAYMENT_OVERDUE") {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "overdue" },
    });
  } else if (event === "PAYMENT_DELETED") {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "canceled" },
    });
  }

  return apiOk({ received: true, processed: true });
}
