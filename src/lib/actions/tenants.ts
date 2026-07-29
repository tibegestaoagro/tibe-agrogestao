import bcrypt from "bcryptjs";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { toBrazilPhoneDigits } from "@/lib/phone";
import { TRIAL_DAYS } from "@/lib/billing-access";
import type { TenantPlan } from "@/generated/prisma/enums";

/**
 * Seam compartilhado de criação de tenant+dono (arquitetura 2026-07-29,
 * candidato #5 do relatório): antes duplicado quase byte a byte entre
 * POST /api/v1/signup e createTenantManuallyAction (platform-tenants.ts).
 * `plan_confirmed` e `must_change_password` são obrigatórios de propósito:
 * cada chamador declara o próprio comportamento explicitamente, em vez de
 * herdar um default escondido neste seam. Mensagem de boas-vindas fica de
 * fora (só o fluxo de criação manual pelo painel dispara isso).
 */
export async function createTenantWithOwner(params: {
  company_name: string;
  document: string;
  phone: string;
  owner_name: string;
  owner_email: string;
  plan: TenantPlan;
  plan_confirmed: boolean;
  password: string;
  must_change_password: boolean;
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null };
}): Promise<ActionResult<{ tenant_id: string; email: string }>> {
  const document = params.document.replace(/\D/g, "");
  if (document.length < 11) {
    return fail("VALIDATION_ERROR", "CNPJ ou CPF inválido", 422);
  }
  const phone = toBrazilPhoneDigits(params.phone);

  const [dupDoc, dupEmail] = await Promise.all([
    prisma.tenant.findUnique({ where: { document } }),
    prisma.user.findUnique({ where: { email: params.owner_email } }),
  ]);
  if (dupDoc) return fail("DUPLICATE_DOCUMENT", "Já existe uma conta com esse CNPJ/CPF", 409);
  if (dupEmail) return fail("DUPLICATE_EMAIL", "Já existe uma conta com esse email", 409);

  const trial_ends_at = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const tenant = await prisma.tenant.create({
    data: {
      name: params.company_name,
      document,
      phone,
      email: params.owner_email,
      plan: params.plan,
      plan_confirmed: params.plan_confirmed,
      status: "trial",
      trial_ends_at,
      lead_source_utm_source: params.utm?.source ?? null,
      lead_source_utm_medium: params.utm?.medium ?? null,
      lead_source_utm_campaign: params.utm?.campaign ?? null,
    },
  });

  try {
    const password_hash = await bcrypt.hash(params.password, 10);
    await prismaForTenant(tenant.id).user.create({
      data: scoped({
        name: params.owner_name,
        email: params.owner_email,
        password_hash,
        role: "OWNER",
        phone,
        must_change_password: params.must_change_password,
      }),
    });
  } catch (e) {
    // Compensação: remove o tenant órfão se o usuário não pôde ser criado
    // (ex: corrida de email duplicado entre a checagem e o create).
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    if ((e as { code?: string }).code === "P2002") {
      return fail("DUPLICATE_EMAIL", "Já existe uma conta com esse email", 409);
    }
    throw e;
  }

  return ok({ tenant_id: tenant.id, email: params.owner_email });
}
