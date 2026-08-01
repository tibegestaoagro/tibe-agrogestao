import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { checkLoginRateLimit } from "@/lib/rate-limit";
import { isStrongPassword } from "@/lib/passwords";
import { sendEmail } from "@/lib/email-send";
import { buildPasswordResetEmailHtml } from "@/lib/email-templates";
import { sendWhatsAppMessage } from "@/lib/whatsapp-send";
import type { PasswordResetChannel } from "@/generated/prisma/enums";

/**
 * Recuperação de senha (arquitetura 2026-07-29): código de 6 dígitos por
 * email ou WhatsApp, à escolha do usuário no pedido. Só para User de tenant
 * (PlatformUser fica de fora, decisão deliberada).
 *
 * As etapas 1 (pedir) e 2 (validar) são correlacionadas pelo EMAIL (que o
 * usuário já sabe, não é informação nova), nunca pelo id do
 * PasswordResetCode, porque criar esse id só quando a conta existe já
 * vazaria a existência da conta pela presença/ausência de um `rid` na
 * resposta. Só depois de validar o código (prova de acesso ao canal) é que
 * o id real vira a referência (`rid`) usada na etapa 3 (nova senha): nesse
 * ponto a existência da conta já está inerentemente provada, então não tem
 * mais nada a esconder.
 */

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const MAX_VERIFY_ATTEMPTS = 5;
const REQUEST_RATE_LIMIT = { windowSeconds: 60 * 60, maxAttempts: 3 };

function generateCode(): string {
  return crypto.randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
}

function buildResetWhatsAppMessage(code: string): string {
  return (
    `Seu código de recuperação de senha no Tibé é: ${code}\n\n` +
    `Ele expira em ${CODE_TTL_MINUTES} minutos. Se você não pediu essa recuperação, ignore esta mensagem.`
  );
}

/**
 * Pedido de código. Resposta é SEMPRE a mesma (`{ requested: true }`),
 * exista ou não a conta, tenha ou não telefone pro canal WhatsApp: proteção
 * padrão contra enumeração de conta. O rate limit é aplicado ANTES da busca
 * pelo usuário, pelo mesmo motivo (não pode diferir por conta existir ou não).
 */
export async function requestPasswordResetAction(params: {
  email: string;
  channel: PasswordResetChannel;
}): Promise<ActionResult<{ requested: true }>> {
  const allowed = await checkLoginRateLimit("password-reset-request", params.email, REQUEST_RATE_LIMIT);
  if (!allowed) {
    return fail("RATE_LIMITED", "Muitas tentativas. Aguarde antes de pedir um novo código.", 429);
  }

  const user = await prisma.user.findUnique({ where: { email: params.email } });
  if (!user || !user.active) {
    return ok({ requested: true });
  }
  if (params.channel === "whatsapp" && !user.phone) {
    return ok({ requested: true });
  }

  const code = generateCode();
  const code_hash = await bcrypt.hash(code, 10);
  const expires_at = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);

  const db = prismaForTenant(user.tenant_id);
  await db.passwordResetCode.create({
    data: scoped({
      user_id: user.id,
      code_hash,
      channel: params.channel,
      expires_at,
    }),
  });

  if (params.channel === "email") {
    await sendEmail({
      to: user.email,
      subject: "Seu código de recuperação de senha",
      html: buildPasswordResetEmailHtml({ code }),
      tenant_id: user.tenant_id,
      type: "password_reset",
    });
  } else if (user.phone) {
    await sendWhatsAppMessage(user.phone, buildResetWhatsAppMessage(code));
  }

  return ok({ requested: true });
}

/**
 * Validação do código. Sem diferenciar "conta não existe" de "código
 * errado": os dois casos devolvem o mesmo INVALID_CODE. Sucesso devolve o
 * `rid` (id do PasswordResetCode) que a etapa 3 vai exigir.
 */
export async function verifyPasswordResetCodeAction(params: {
  email: string;
  code: string;
}): Promise<ActionResult<{ reset_id: string }>> {
  const allowed = await checkLoginRateLimit("password-reset-verify", params.email);
  if (!allowed) {
    return fail("RATE_LIMITED", "Muitas tentativas. Peça um novo código.", 429);
  }

  const user = await prisma.user.findUnique({ where: { email: params.email } });
  if (!user) return fail("INVALID_CODE", "Código inválido ou expirado", 422);

  const db = prismaForTenant(user.tenant_id);
  const reset = await db.passwordResetCode.findFirst({
    where: { user_id: user.id, consumed_at: null, verified_at: null },
    orderBy: { created_at: "desc" },
  });
  if (!reset || reset.expires_at < new Date()) {
    return fail("INVALID_CODE", "Código inválido ou expirado", 422);
  }
  if (reset.attempts >= MAX_VERIFY_ATTEMPTS) {
    return fail("INVALID_CODE", "Muitas tentativas erradas. Peça um novo código.", 422);
  }

  const matches = await bcrypt.compare(params.code, reset.code_hash);
  if (!matches) {
    await db.passwordResetCode.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
    return fail("INVALID_CODE", "Código inválido ou expirado", 422);
  }

  await db.passwordResetCode.update({ where: { id: reset.id }, data: { verified_at: new Date() } });
  return ok({ reset_id: reset.id });
}

/**
 * Troca de senha depois do código validado. Exige `verified_at` preenchido
 * (prova que a etapa 2 aconteceu) e `consumed_at` nulo (não deixa reusar o
 * mesmo código já validado duas vezes). Também zera must_change_password: um
 * usuário que acabou de provar posse do email/telefone já pode entrar com a
 * senha nova diretamente, sem gate adicional.
 */
export async function confirmPasswordResetAction(params: {
  reset_id: string;
  newPassword: string;
}): Promise<ActionResult<{ id: string }>> {
  const reset = await prisma.passwordResetCode.findUnique({ where: { id: params.reset_id } });
  if (!reset || !reset.verified_at || reset.consumed_at || reset.expires_at < new Date()) {
    return fail("INVALID_RESET", "Sessão de recuperação inválida ou expirada. Peça um novo código.", 422);
  }

  const strength = isStrongPassword(params.newPassword);
  if (!strength.ok) {
    return fail("VALIDATION_ERROR", strength.message, 422);
  }

  const db = prismaForTenant(reset.tenant_id);
  const password_hash = await bcrypt.hash(params.newPassword, 10);
  const [user] = await db.$transaction([
    db.user.update({
      where: { id: reset.user_id },
      data: { password_hash, must_change_password: false },
    }),
    db.passwordResetCode.update({
      where: { id: reset.id },
      data: { consumed_at: new Date() },
    }),
  ]);

  return ok({ id: user.id });
}
