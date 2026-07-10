import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import * as asaas from "@/lib/asaas";
import type { AsaasBillingType } from "@/lib/asaas";
import type { TenantPlan } from "@/generated/prisma/enums";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Criação de assinatura real no Asaas (spec 5.5). PIX e boleto são exibidos
 * dentro do próprio painel (decisão do módulo — evita redirecionar o
 * produtor para fora do site); cartão de crédito devolve a URL da fatura
 * hospedada pelo Asaas, a única exceção deliberada (evita exigir
 * certificação PCI-DSS SAQ-D do Tibé — ver CLAUDE.md).
 */

export type SubscribeResult =
  | { method: "pix"; subscriptionId: string; payload: string; encodedImage: string; expirationDate: string }
  | { method: "boleto"; subscriptionId: string; identificationField: string; barCode: string }
  | { method: "redirect"; subscriptionId: string; redirectUrl: string };

export async function subscribeAction(
  db: TenantPrismaClient,
  tenant: {
    id: string;
    name: string;
    document: string;
    email: string | null;
    phone: string | null;
  },
  params: { plan: TenantPlan; billingType: AsaasBillingType },
): Promise<ActionResult<SubscribeResult>> {
  const existing = await db.subscription.findFirst({});
  if (existing?.status === "active") {
    return fail("ALREADY_SUBSCRIBED", "Este tenant já tem uma assinatura ativa", 409);
  }

  let asaasCustomerId = existing?.asaas_customer_id ?? null;
  if (!asaasCustomerId) {
    const customer = await asaas.createCustomer(tenant);
    asaasCustomerId = customer.id;
  }

  const subscription = await asaas.createSubscription(asaasCustomerId, {
    plan: params.plan,
    billingType: params.billingType,
    tenantId: tenant.id,
  });

  const subscriptionData = {
    asaas_customer_id: asaasCustomerId,
    asaas_subscription_id: subscription.id,
    plan: params.plan,
    // "overdue" é o estado técnico até o primeiro pagamento ser confirmado
    // pelo webhook — o cálculo de acesso (billing-access.ts) dá carência
    // automática porque next_due_date ainda está no futuro.
    status: "overdue" as const,
    next_due_date: new Date(subscription.nextDueDate),
  };

  const record = existing
    ? await db.subscription.update({ where: { id: existing.id }, data: subscriptionData })
    : await db.subscription.create({ data: scoped(subscriptionData) });

  // Primeira cobrança gerada pela assinatura — usada para exibir PIX/boleto/link.
  const payments = await asaas.listSubscriptionPayments(subscription.id);
  const firstPayment = payments[0];
  if (!firstPayment) {
    return fail(
      "NO_PAYMENT_GENERATED",
      "Assinatura criada, mas nenhuma cobrança foi gerada ainda. Tente novamente em instantes.",
      502,
    );
  }

  if (params.billingType === "PIX") {
    const pix = await asaas.getPixQrCode(firstPayment.id);
    return ok({ method: "pix", subscriptionId: record.id, ...pix });
  }
  if (params.billingType === "BOLETO") {
    const boleto = await asaas.getBoletoDetails(firstPayment.id);
    return ok({ method: "boleto", subscriptionId: record.id, ...boleto });
  }
  // CREDIT_CARD — única forma que sai do painel (fatura hospedada pelo Asaas).
  return ok({ method: "redirect", subscriptionId: record.id, redirectUrl: firstPayment.invoiceUrl });
}

export async function cancelSubscriptionAction(
  db: TenantPrismaClient,
): Promise<ActionResult<{ id: string }>> {
  const existing = await db.subscription.findFirst({});
  if (!existing?.asaas_subscription_id) {
    return fail("NOT_FOUND", "Nenhuma assinatura ativa para cancelar", 404);
  }
  await asaas.cancelSubscription(existing.asaas_subscription_id);
  const updated = await db.subscription.update({
    where: { id: existing.id },
    data: { status: "canceled" },
  });
  return ok({ id: updated.id });
}
