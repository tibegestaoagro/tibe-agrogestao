/**
 * Cliente Asaas (spec 5.4). Baseado na documentação pública oficial
 * (docs.asaas.com), consultada durante o desenvolvimento: sem chave de
 * sandbox própria neste ambiente, então nenhuma chamada real foi testada
 * ainda. Validar de ponta a ponta assim que `ASAAS_API_KEY` existir.
 *
 * Autenticação: header `access_token` (sem prefixo "Bearer"), chave própria
 * por ambiente (sandbox começa com `$aact_hmlg_`, produção com `$aact_prod_`).
 * Base URL: api-sandbox.asaas.com/v3 (sandbox) | api.asaas.com/v3 (produção).
 */

import type { TenantPlan } from "@/generated/prisma/enums";

const BASE_URL =
  process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

/** Preços mensais por plano (spec 5.5, conforme proposta comercial). */
export const PLAN_PRICES: Record<TenantPlan, number> = {
  campo: 97,
  fazenda: 197,
  grupo: 397,
};

export class AsaasNotConfiguredError extends Error {
  constructor() {
    super("ASAAS_API_KEY não configurada");
    this.name = "AsaasNotConfiguredError";
  }
}

export class AsaasApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`Asaas API respondeu ${status}`);
    this.name = "AsaasApiError";
    this.status = status;
    this.body = body;
  }
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new AsaasNotConfiguredError();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: key,
      ...init?.headers,
    },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new AsaasApiError(res.status, body);
  return body as T;
}

// ── Clientes ─────────────────────────────────────────────────────────

export type AsaasCustomer = { id: string; name: string; cpfCnpj: string };

export async function createCustomer(tenant: {
  name: string;
  document: string;
  email?: string | null;
  phone?: string | null;
}): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: tenant.name,
      cpfCnpj: tenant.document,
      email: tenant.email ?? undefined,
      phone: tenant.phone ?? undefined,
      externalReference: undefined,
    }),
  });
}

// ── Assinaturas ──────────────────────────────────────────────────────

export type AsaasBillingType = "BOLETO" | "PIX" | "CREDIT_CARD";

export type AsaasSubscription = {
  id: string;
  customer: string;
  status: "ACTIVE" | "EXPIRED" | "INACTIVE";
  billingType: AsaasBillingType;
  value: number;
  cycle: string;
  nextDueDate: string;
};

function tomorrowIsoDate(): string {
  const d = new Date(Date.now() + 86_400_000);
  return d.toISOString().slice(0, 10);
}

export async function createSubscription(
  customerId: string,
  params: { plan: TenantPlan; billingType: AsaasBillingType; tenantId: string },
): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType: params.billingType,
      value: PLAN_PRICES[params.plan],
      nextDueDate: tomorrowIsoDate(),
      cycle: "MONTHLY",
      description: `Tibé: Plano ${params.plan}`,
      externalReference: params.tenantId,
    }),
  });
}

export async function getSubscription(id: string): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>(`/subscriptions/${id}`);
}

export async function cancelSubscription(id: string): Promise<void> {
  await asaasFetch(`/subscriptions/${id}`, { method: "DELETE" });
}

// ── Cobranças (para exibir PIX/boleto/link dentro do painel) ────────

export type AsaasPayment = {
  id: string;
  status: string;
  value: number;
  invoiceUrl: string;
  billingType: AsaasBillingType;
};

/** Lista as cobranças geradas por uma assinatura (a mais recente primeiro). */
export async function listSubscriptionPayments(
  subscriptionId: string,
): Promise<AsaasPayment[]> {
  const res = await asaasFetch<{ data: AsaasPayment[] }>(
    `/payments?subscription=${encodeURIComponent(subscriptionId)}&sort=dateCreated&order=desc`,
  );
  return res.data;
}

export type AsaasBoleto = { identificationField: string; barCode: string };

export async function getBoletoDetails(paymentId: string): Promise<AsaasBoleto> {
  return asaasFetch<AsaasBoleto>(`/payments/${paymentId}/identificationField`);
}

export type AsaasPixQrCode = {
  encodedImage: string; // base64 PNG
  payload: string; // copia-e-cola
  expirationDate: string;
};

export async function getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
  return asaasFetch<AsaasPixQrCode>(`/payments/${paymentId}/pixQrCode`);
}
