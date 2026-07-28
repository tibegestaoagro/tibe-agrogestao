import bcrypt from "bcryptjs";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { logSubscriptionStatusChange } from "@/lib/platform/subscription-log";
import { generateTempPassword } from "@/lib/passwords";
import { toBrazilPhoneDigits } from "@/lib/phone";
import { dispatchWelcomeMessage, buildWelcomeMessage } from "@/lib/whatsapp-welcome";
import { sendWhatsAppMessage } from "@/lib/whatsapp-send";
import { TRIAL_DAYS } from "@/lib/billing-access";
import type { SubscriptionStatus, TenantPlan } from "@/generated/prisma/enums";

/**
 * Ação manual de master_admin (Módulo 6, task 6.9): força a mudança de
 * status de uma assinatura (ex: reativar um tenant suspenso por erro).
 * Grava em SubscriptionStatusLog com o PlatformUser responsável e o motivo —
 * é o próprio log de auditoria exigido pela spec.
 */
export async function forceSubscriptionStatusAction(params: {
  tenantId: string;
  newStatus: SubscriptionStatus;
  reason: string | null;
  platformUserId: string;
}): Promise<ActionResult<{ id: string; status: SubscriptionStatus }>> {
  const subscription = await prisma.subscription.findUnique({ where: { tenant_id: params.tenantId } });
  if (!subscription) {
    return fail("NOT_FOUND", "Este tenant ainda não tem assinatura para alterar", 404);
  }
  if (subscription.status === params.newStatus) {
    return fail("NO_CHANGE", `A assinatura já está em '${params.newStatus}'`, 422);
  }

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: params.newStatus },
  });

  await logSubscriptionStatusChange({
    subscriptionId: subscription.id,
    fromStatus: subscription.status,
    toStatus: params.newStatus,
    changedByPlatformUserId: params.platformUserId,
    reason: params.reason,
  });

  // Mantém Tenant.status coerente com a assinatura forçada (mesmo padrão do webhook).
  if (params.newStatus === "active") {
    await prisma.tenant.update({ where: { id: params.tenantId }, data: { status: "active" } });
  }

  return ok({ id: updated.id, status: updated.status });
}

/**
 * Criação manual de tenant pelo painel da plataforma (spec 2026-07-24) —
 * SEGUNDA exceção deliberada à regra "signup público é a única forma de
 * criar tenant" (a primeira é o próprio /criar-conta). Usada para dar acesso
 * de teste a equipes de cliente sem passar pelo formulário público. Reusa a
 * mesma lógica de POST /api/v1/signup (checagem de duplicidade, TRIAL_DAYS),
 * mas gera a senha em vez de recebê-la, e marca must_change_password.
 */
/** Plano interno até o cliente confirmar o próprio no primeiro login (ver plan_confirmed). */
const DEFAULT_UNCONFIRMED_PLAN: TenantPlan = "fazenda";

export async function createTenantManuallyAction(params: {
  company_name: string;
  document: string;
  phone: string;
  owner_name: string;
  owner_email: string;
}): Promise<ActionResult<{ tenant_id: string; email: string; temp_password: string }>> {
  const document = params.document.replace(/\D/g, "");
  if (document.length < 11) {
    return fail("VALIDATION_ERROR", "CNPJ ou CPF inválido", 422);
  }

  const [dupDoc, dupEmail] = await Promise.all([
    prisma.tenant.findUnique({ where: { document } }),
    prisma.user.findUnique({ where: { email: params.owner_email } }),
  ]);
  if (dupDoc) return fail("DUPLICATE_DOCUMENT", "Já existe uma conta com esse CNPJ/CPF", 409);
  if (dupEmail) return fail("DUPLICATE_EMAIL", "Já existe uma conta com esse email", 409);

  const phone = toBrazilPhoneDigits(params.phone);
  const trial_ends_at = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const tenant = await prisma.tenant.create({
    data: {
      name: params.company_name,
      document,
      phone,
      email: params.owner_email,
      plan: DEFAULT_UNCONFIRMED_PLAN,
      plan_confirmed: false,
      status: "trial",
      trial_ends_at,
    },
  });

  const temp_password = generateTempPassword();
  try {
    const password_hash = await bcrypt.hash(temp_password, 10);
    await prismaForTenant(tenant.id).user.create({
      data: scoped({
        name: params.owner_name,
        email: params.owner_email,
        password_hash,
        role: "OWNER",
        phone,
        must_change_password: true,
      }),
    });
  } catch (e) {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    if ((e as { code?: string }).code === "P2002") {
      return fail("DUPLICATE_EMAIL", "Já existe uma conta com esse email", 409);
    }
    throw e;
  }

  await dispatchWelcomeMessage(phone, params.owner_name);

  return ok({ tenant_id: tenant.id, email: params.owner_email, temp_password });
}

/**
 * Edição de dados cadastrais + plano de um tenant qualquer, pelo painel da
 * plataforma (spec 2026-07-27) — só master_admin. Mesmos campos que o
 * próprio tenant já pode editar sozinho em PATCH /api/v1/tenant, mais
 * `plan` (o tenant só muda o próprio plano via assinatura/Asaas; aqui é
 * override direto do master_admin, sem passar pelo Asaas).
 */
export async function updateTenantAction(
  tenantId: string,
  params: {
    name?: string;
    document?: string;
    phone?: string | null;
    email?: string | null;
    plan?: TenantPlan;
  },
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!existing) return fail("NOT_FOUND", "Tenant não encontrado", 404);

  let document = params.document;
  if (document !== undefined) {
    document = document.replace(/\D/g, "");
    if (document.length < 11) return fail("VALIDATION_ERROR", "CNPJ ou CPF inválido", 422);
    const dup = await prisma.tenant.findFirst({ where: { document, id: { not: tenantId } } });
    if (dup) return fail("DUPLICATE_DOCUMENT", "Já existe uma conta com esse CNPJ/CPF", 409);
  }

  const phone = params.phone ? toBrazilPhoneDigits(params.phone) : params.phone;

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(document !== undefined ? { document } : {}),
      ...(params.phone !== undefined ? { phone } : {}),
      ...(params.email !== undefined ? { email: params.email } : {}),
      ...(params.plan !== undefined ? { plan: params.plan } : {}),
    },
  });

  return ok({ id: tenant.id });
}

/**
 * Reenvia a mensagem de boas-vindas (a mesma que dispara na criação manual)
 * para o dono de um tenant já existente — útil pra testar entrega real ou
 * reenviar quando o primeiro disparo falhou (ex: provider ficou fora do ar).
 * Só master_admin (mesma exceção estrutural de createTenantManuallyAction:
 * lookup cross-tenant do Owner pelo painel da plataforma).
 */
export async function resendWelcomeMessageAction(tenantId: string): Promise<ActionResult<{ sent: boolean }>> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return fail("NOT_FOUND", "Tenant não encontrado", 404);
  if (!tenant.phone) return fail("VALIDATION_ERROR", "Tenant não tem telefone cadastrado", 422);

  const owner = await prisma.user.findFirst({ where: { tenant_id: tenantId, role: "OWNER" } });
  const result = await sendWhatsAppMessage(tenant.phone, buildWelcomeMessage(owner?.name ?? tenant.name));
  if (!result.ok) return fail(result.code, result.message, result.status);

  return ok({ sent: true });
}

/**
 * Arquiva/desarquiva um tenant pelo painel (spec 2026-07-27) — só
 * master_admin. Nunca deleta (mesmo padrão de Property.archived_at, M1).
 * Idempotente nos dois sentidos.
 */
export async function setTenantArchivedAction(
  tenantId: string,
  archived: boolean,
): Promise<ActionResult<{ id: string; archived_at: Date | null }>> {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!existing) return fail("NOT_FOUND", "Tenant não encontrado", 404);

  const tenant = archived === !!existing.archived_at
    ? existing
    : await prisma.tenant.update({
        where: { id: tenantId },
        data: { archived_at: archived ? new Date() : null },
      });

  return ok({ id: tenant.id, archived_at: tenant.archived_at });
}
