import bcrypt from "bcryptjs";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { logSubscriptionStatusChange } from "@/lib/platform/subscription-log";
import { generateTempPassword } from "@/lib/passwords";
import { toBrazilPhoneDigits } from "@/lib/phone";
import { dispatchWelcomeMessage, buildWelcomeMessage } from "@/lib/whatsapp-welcome";
import { sendWhatsAppMessage } from "@/lib/whatsapp-send";
import { sendEmail } from "@/lib/email-send";
import { buildWelcomeEmailHtml } from "@/lib/email-templates";
import { createTenantWithOwner } from "@/lib/actions/tenants";
import type { SubscriptionStatus, TenantPlan } from "@/generated/prisma/enums";

/**
 * Ação manual de master_admin (Módulo 6, task 6.9): força a mudança de
 * status de uma assinatura (ex: reativar um tenant suspenso por erro).
 * Grava em SubscriptionStatusLog com o PlatformUser responsável e o motivo:
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
 * Criação manual de tenant pelo painel da plataforma (spec 2026-07-24):
 * SEGUNDA exceção deliberada à regra "signup público é a única forma de
 * criar tenant" (a primeira é o próprio /criar-conta). Usada para dar acesso
 * de teste a equipes de cliente sem passar pelo formulário público. Chama o
 * mesmo seam de POST /api/v1/signup (createTenantWithOwner, arquitetura
 * 2026-07-29), mas gera a senha em vez de recebê-la, marca
 * must_change_password e dispara a mensagem de boas-vindas (exclusiva deste
 * fluxo, fora do seam) pelos 2 canais (WhatsApp + email, arquitetura
 * 2026-07-29): cada um melhor esforço e independente do outro (email nunca
 * lança, sempre grava EmailLog; WhatsApp mantém o próprio best-effort já
 * existente).
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
  const temp_password = generateTempPassword();
  const result = await createTenantWithOwner({
    company_name: params.company_name,
    document: params.document,
    phone: params.phone,
    owner_name: params.owner_name,
    owner_email: params.owner_email,
    plan: DEFAULT_UNCONFIRMED_PLAN,
    plan_confirmed: false,
    password: temp_password,
    must_change_password: true,
  });
  if (!result.ok) return result;

  await dispatchWelcomeMessage({
    phone: toBrazilPhoneDigits(params.phone),
    ownerName: params.owner_name,
    email: params.owner_email,
    tempPassword: temp_password,
  });

  await sendEmail({
    to: params.owner_email,
    subject: "Bem-vindo ao Tibé",
    html: buildWelcomeEmailHtml({ ownerName: params.owner_name, email: params.owner_email, tempPassword: temp_password }),
    tenant_id: result.data.tenant_id,
    type: "welcome",
  });

  return ok({ tenant_id: result.data.tenant_id, email: result.data.email, temp_password });
}

/**
 * Edição de dados cadastrais + plano de um tenant qualquer, pelo painel da
 * plataforma (spec 2026-07-27): só master_admin. Mesmos campos que o
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
 * Reenvia a mensagem de boas-vindas para o dono de um tenant já existente:
 * útil pra testar entrega real ou reenviar quando o primeiro disparo falhou
 * (ex: provider ficou fora do ar). A senha original em claro não existe mais
 * (só o hash é guardado), então isso GERA uma nova senha temporária e marca
 * must_change_password de novo: a mensagem reenviada sempre tem uma senha
 * que realmente funciona, em vez de repetir uma que pode já ter sido trocada.
 * Só master_admin (mesma exceção estrutural de createTenantManuallyAction:
 * lookup cross-tenant do Owner pelo painel da plataforma). Dispara pelos 2
 * canais (arquitetura 2026-07-29): email é sempre tentado (nunca lança,
 * sempre grava EmailLog) e não afeta o resultado desta action, que continua
 * refletindo só o WhatsApp (contrato existente, coberto por test:m7/m10).
 */
export async function resendWelcomeMessageAction(tenantId: string): Promise<ActionResult<{ sent: boolean }>> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return fail("NOT_FOUND", "Tenant não encontrado", 404);
  if (!tenant.phone) return fail("VALIDATION_ERROR", "Tenant não tem telefone cadastrado", 422);

  const owner = await prisma.user.findFirst({ where: { tenant_id: tenantId, role: "OWNER" } });
  if (!owner) return fail("NOT_FOUND", "Este tenant ainda não tem um usuário Owner", 404);

  const temp_password = generateTempPassword();
  const password_hash = await bcrypt.hash(temp_password, 10);
  await prismaForTenant(tenantId).user.update({
    where: { id: owner.id },
    data: { password_hash, must_change_password: true },
  });

  await sendEmail({
    to: owner.email,
    subject: "Nova senha de acesso ao Tibé",
    html: buildWelcomeEmailHtml({ ownerName: owner.name, email: owner.email, tempPassword: temp_password }),
    tenant_id: tenantId,
    type: "welcome",
  });

  const result = await sendWhatsAppMessage(
    tenant.phone,
    buildWelcomeMessage({ ownerName: owner.name, email: owner.email, tempPassword: temp_password }),
  );
  if (!result.ok) return fail(result.code, result.message, result.status);

  return ok({ sent: true });
}

/**
 * Arquiva/desarquiva um tenant pelo painel (spec 2026-07-27): só
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

/**
 * Troca o email de LOGIN do dono do tenant (2026-07-30).
 *
 * Existe porque a tela de "Dados cadastrais" mostrava só `Tenant.email`, que é
 * o contato da EMPRESA, e o usuário editou aquilo esperando trocar a
 * credencial de acesso: o login não mudou e o acesso pareceu quebrado. São
 * campos diferentes de propósito (uma empresa pode ter contato financeiro
 * diferente de quem entra no sistema), mas a interface não deixava isso claro
 * e não oferecia como trocar o login de fato.
 *
 * `User.email` é único GLOBALMENTE (o login recebe só email e senha, sem
 * seletor de tenant), então a checagem de duplicidade precisa do client base e
 * atravessa tenants: é a mesma necessidade estrutural de `inviteUserAction`.
 */
export async function updateOwnerLoginEmailAction(
  tenantId: string,
  newEmail: string,
): Promise<ActionResult<{ user_id: string; email: string }>> {
  const email = newEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail("VALIDATION_ERROR", "Email inválido", 422);
  }

  const owner = await prisma.user.findFirst({
    where: { tenant_id: tenantId, role: "OWNER", active: true },
    orderBy: { created_at: "asc" },
  });
  if (!owner) return fail("NOT_FOUND", "Este tenant não tem um dono ativo", 404);
  if (owner.email === email) {
    return ok({ user_id: owner.id, email });
  }

  const dup = await prisma.user.findUnique({ where: { email } });
  if (dup) {
    return fail("DUPLICATE_EMAIL", "Esse email já é usado por outra conta no sistema", 409);
  }

  await prisma.user.update({ where: { id: owner.id }, data: { email } });
  return ok({ user_id: owner.id, email });
}
