import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { toBrazilPhoneDigits } from "@/lib/phone";
import { generateTempPassword } from "@/lib/passwords";
import { createTenantWithOwner } from "@/lib/actions/tenants";
import { checkLoginRateLimit } from "@/lib/rate-limit";
import { sendWhatsAppMessage } from "@/lib/whatsapp-send";
import { dispatchEmail, sendEmail } from "@/lib/email-send";
import {
  buildSignupCodeEmailHtml,
  buildSignupTempPasswordEmailHtml,
} from "@/lib/email-templates";
import type { TenantPlan } from "@/generated/prisma/enums";

/**
 * Cadastro público verificado em 4 etapas (Módulo 19).
 *
 * O ponto do módulo: `Tenant` e `User` só nascem depois de WhatsApp E email
 * confirmados. Enquanto isso os dados ficam em `PendingSignup`, que não é
 * escopado por tenant (o tenant ainda não existe) e é varrido quando vence.
 * Criar o tenant antes contaminaria os KPIs do painel da plataforma e travaria
 * o CPF/CNPJ do dono real com "já existe uma conta".
 *
 * Ver docs/specs/module-19-cadastro-verificado.md para as decisões fechadas.
 */

export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
export const SIGNUP_TTL_MINUTES = 60;
/** Aos 2 minutos a tela oferece corrigir o destino. Cronômetro de UI, separado
 *  da validade do código (10 min): amarrar os dois faria quem digita devagar
 *  perder um código ainda válido. */
export const ALLOW_EDIT_AFTER_SECONDS = 120;

/** Envio tem custo real e a rota roda sem login: sem limite vira ferramenta de perturbação. */
const SEND_LIMIT = { windowSeconds: 3600, maxAttempts: 5 };
const START_LIMIT = { windowSeconds: 3600, maxAttempts: 10 };

export type SignupChannel = "whatsapp" | "email";

export type SignupState = {
  whatsapp_verified: boolean;
  email_verified: boolean;
  phone_masked: string;
  email_masked: string;
  current_step: SignupChannel | "done";
  allow_edit_after_seconds: number;
};

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

export function maskPhone(digits: string): string {
  if (digits.length < 4) return "número informado";
  return `${digits.slice(0, 4)}${"*".repeat(Math.max(digits.length - 8, 0))}${digits.slice(-4)}`;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const head = user.slice(0, 2);
  return `${head}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

type PendingRow = {
  id: string;
  company_name: string;
  owner_name: string;
  owner_email: string;
  document: string;
  phone: string;
  plan: TenantPlan;
  whatsapp_verified_at: Date | null;
  email_verified_at: Date | null;
  expires_at: Date;
};

function toState(row: PendingRow): SignupState {
  const whatsapp_verified = row.whatsapp_verified_at != null;
  const email_verified = row.email_verified_at != null;
  return {
    whatsapp_verified,
    email_verified,
    phone_masked: maskPhone(row.phone),
    email_masked: maskEmail(row.owner_email),
    current_step: !whatsapp_verified ? "whatsapp" : !email_verified ? "email" : "done",
    allow_edit_after_seconds: ALLOW_EDIT_AFTER_SECONDS,
  };
}

async function deliverCode(
  channel: SignupChannel,
  destination: string,
  code: string,
  companyName: string,
): Promise<boolean> {
  if (channel === "whatsapp") {
    const res = await sendWhatsAppMessage(
      destination,
      `Seu código de confirmação do Tibé é ${code}. Ele vale por ${CODE_TTL_MINUTES} minutos.\n\n` +
        `Salve este número nos seus contatos como "Tibé": é por aqui que você vai receber os lembretes de vencimento e falar com o assistente.`,
    );
    return res.ok;
  }
  const res = await dispatchEmail(
    destination,
    "Seu código de confirmação do Tibé",
    buildSignupCodeEmailHtml({ code, companyName }),
  );
  return res.ok;
}

/**
 * Etapa 1: valida, checa duplicidade contra dados REAIS (Tenant/User), cria ou
 * retoma o cadastro pendente e dispara o código de WhatsApp.
 */
export async function startSignupAction(input: {
  company_name: string;
  owner_name: string;
  owner_email: string;
  document: string;
  phone: string;
  plan: TenantPlan;
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null };
}): Promise<ActionResult<{ signup_id: string; state: SignupState }>> {
  const document = input.document.replace(/\D/g, "");
  if (document.length < 11) {
    return fail("VALIDATION_ERROR", "CNPJ ou CPF inválido", 422);
  }
  const phone = toBrazilPhoneDigits(input.phone);
  if (phone.length < 12) {
    return fail("VALIDATION_ERROR", "WhatsApp inválido: informe DDD e número", 422);
  }
  const owner_email = input.owner_email.trim().toLowerCase();

  if (!(await checkLoginRateLimit("signup-start", document, START_LIMIT))) {
    return fail("RATE_LIMITED", "Muitas tentativas de cadastro. Tente novamente mais tarde.", 429);
  }

  const [dupDoc, dupEmail] = await Promise.all([
    prisma.tenant.findUnique({ where: { document } }),
    prisma.user.findUnique({ where: { email: owner_email } }),
  ]);
  if (dupDoc) return fail("DUPLICATE_DOCUMENT", "Já existe uma conta com esse CNPJ/CPF", 409);
  if (dupEmail) return fail("DUPLICATE_EMAIL", "Já existe uma conta com esse email", 409);

  if (!(await checkLoginRateLimit("signup-send", phone, SEND_LIMIT))) {
    return fail("RATE_LIMITED", "Muitos envios para esse número. Tente novamente mais tarde.", 429);
  }

  const code = generateCode();
  const code_hash = await bcrypt.hash(code, 10);

  // Retomada: cadastro pendente vivo com o mesmo documento continua de onde
  // parou, em vez de obrigar a refazer a verificação já concluída.
  const existing = await prisma.pendingSignup.findFirst({
    where: { document, expires_at: { gt: new Date() } },
    orderBy: { created_at: "desc" },
  });

  let row: PendingRow;
  if (existing) {
    // Trocar o destino invalida a verificação daquele canal: verificamos o
    // contato, não a intenção de quem preencheu.
    const phoneChanged = existing.phone !== phone;
    const emailChanged = existing.owner_email !== owner_email;
    row = await prisma.pendingSignup.update({
      where: { id: existing.id },
      data: {
        company_name: input.company_name,
        owner_name: input.owner_name,
        owner_email,
        phone,
        plan: input.plan,
        ...(phoneChanged ? { whatsapp_verified_at: null } : {}),
        ...(emailChanged ? { email_verified_at: null, email_code_hash: null } : {}),
        ...(existing.whatsapp_verified_at && !phoneChanged
          ? {}
          : {
              whatsapp_code_hash: code_hash,
              whatsapp_code_expires_at: minutesFromNow(CODE_TTL_MINUTES),
              whatsapp_attempts: 0,
            }),
        expires_at: minutesFromNow(SIGNUP_TTL_MINUTES),
      },
    });
  } else {
    row = await prisma.pendingSignup.create({
      data: {
        company_name: input.company_name,
        owner_name: input.owner_name,
        owner_email,
        document,
        phone,
        plan: input.plan,
        whatsapp_code_hash: code_hash,
        whatsapp_code_expires_at: minutesFromNow(CODE_TTL_MINUTES),
        utm_source: input.utm?.source ?? null,
        utm_medium: input.utm?.medium ?? null,
        utm_campaign: input.utm?.campaign ?? null,
        expires_at: minutesFromNow(SIGNUP_TTL_MINUTES),
      },
    });
  }

  if (row.whatsapp_verified_at == null) {
    await deliverCode("whatsapp", phone, code, input.company_name);
  }

  return ok({ signup_id: row.id, state: toState(row) });
}

export async function getSignupStateAction(
  signupId: string,
): Promise<ActionResult<SignupState>> {
  const row = await prisma.pendingSignup.findUnique({ where: { id: signupId } });
  if (!row || row.expires_at <= new Date()) {
    return fail("SIGNUP_EXPIRED", "Seu cadastro expirou. Recomece pelo formulário.", 410);
  }
  return ok(toState(row));
}

/** Reenvia o código, opcionalmente corrigindo o destino (etapas 2 e 3). */
export async function resendSignupCodeAction(
  signupId: string,
  channel: SignupChannel,
  destination?: string | null,
): Promise<ActionResult<SignupState>> {
  const row = await prisma.pendingSignup.findUnique({ where: { id: signupId } });
  if (!row || row.expires_at <= new Date()) {
    return fail("SIGNUP_EXPIRED", "Seu cadastro expirou. Recomece pelo formulário.", 410);
  }
  if (channel === "whatsapp" && row.whatsapp_verified_at) {
    return fail("ALREADY_VERIFIED", "Esse canal já foi confirmado", 422);
  }
  if (channel === "email" && row.email_verified_at) {
    return fail("ALREADY_VERIFIED", "Esse canal já foi confirmado", 422);
  }
  if (channel === "email" && !row.whatsapp_verified_at) {
    return fail("WHATSAPP_PENDING", "Confirme o WhatsApp antes do email", 422);
  }

  let target = channel === "whatsapp" ? row.phone : row.owner_email;
  if (destination) {
    target = channel === "whatsapp"
      ? toBrazilPhoneDigits(destination)
      : destination.trim().toLowerCase();
    if (channel === "whatsapp" && target.length < 12) {
      return fail("VALIDATION_ERROR", "WhatsApp inválido: informe DDD e número", 422);
    }
    if (channel === "email" && !target.includes("@")) {
      return fail("VALIDATION_ERROR", "Email inválido", 422);
    }
    // Email corrigido pode colidir com uma conta existente: checar de novo.
    if (channel === "email") {
      const dup = await prisma.user.findUnique({ where: { email: target } });
      if (dup) return fail("DUPLICATE_EMAIL", "Já existe uma conta com esse email", 409);
    }
  }

  if (!(await checkLoginRateLimit("signup-send", target, SEND_LIMIT))) {
    return fail("RATE_LIMITED", "Muitos envios para esse destino. Tente novamente mais tarde.", 429);
  }

  const code = generateCode();
  const code_hash = await bcrypt.hash(code, 10);
  const updated = await prisma.pendingSignup.update({
    where: { id: row.id },
    data:
      channel === "whatsapp"
        ? {
            phone: target,
            whatsapp_code_hash: code_hash,
            whatsapp_code_expires_at: minutesFromNow(CODE_TTL_MINUTES),
            whatsapp_attempts: 0,
          }
        : {
            owner_email: target,
            email_code_hash: code_hash,
            email_code_expires_at: minutesFromNow(CODE_TTL_MINUTES),
            email_attempts: 0,
          },
  });

  await deliverCode(channel, target, code, updated.company_name);
  return ok(toState(updated));
}

export type VerifyResult =
  | { completed: false; state: SignupState }
  | { completed: true; email: string; temp_password: string };

/**
 * Valida o código de um canal. Quando o SEGUNDO canal é confirmado, cria a
 * conta de verdade, envia a senha temporária pelos dois canais já verificados
 * e apaga o cadastro pendente.
 */
export async function verifySignupCodeAction(
  signupId: string,
  channel: SignupChannel,
  code: string,
): Promise<ActionResult<VerifyResult>> {
  const row = await prisma.pendingSignup.findUnique({ where: { id: signupId } });
  if (!row || row.expires_at <= new Date()) {
    return fail("SIGNUP_EXPIRED", "Seu cadastro expirou. Recomece pelo formulário.", 410);
  }
  if (channel === "email" && !row.whatsapp_verified_at) {
    return fail("WHATSAPP_PENDING", "Confirme o WhatsApp antes do email", 422);
  }

  const hash = channel === "whatsapp" ? row.whatsapp_code_hash : row.email_code_hash;
  const expiresAt =
    channel === "whatsapp" ? row.whatsapp_code_expires_at : row.email_code_expires_at;
  const attempts = channel === "whatsapp" ? row.whatsapp_attempts : row.email_attempts;

  if (attempts >= MAX_CODE_ATTEMPTS) {
    return fail("TOO_MANY_ATTEMPTS", "Muitas tentativas. Peça um código novo.", 429);
  }
  // Código ausente, expirado ou errado respondem igual, sem diferenciar.
  if (!hash || !expiresAt || expiresAt <= new Date()) {
    return fail("INVALID_CODE", "Código inválido ou expirado", 422);
  }
  const matches = await bcrypt.compare(code, hash);
  if (!matches) {
    await prisma.pendingSignup.update({
      where: { id: row.id },
      data:
        channel === "whatsapp"
          ? { whatsapp_attempts: { increment: 1 } }
          : { email_attempts: { increment: 1 } },
    });
    return fail("INVALID_CODE", "Código inválido ou expirado", 422);
  }

  const now = new Date();
  const verified = await prisma.pendingSignup.update({
    where: { id: row.id },
    data:
      channel === "whatsapp"
        ? { whatsapp_verified_at: now }
        : { email_verified_at: now },
  });

  // Primeiro canal confirmado: dispara o código do segundo e devolve o estado.
  if (channel === "whatsapp" && !verified.email_verified_at) {
    const emailCode = generateCode();
    const emailHash = await bcrypt.hash(emailCode, 10);
    const withEmailCode = await prisma.pendingSignup.update({
      where: { id: row.id },
      data: {
        email_code_hash: emailHash,
        email_code_expires_at: minutesFromNow(CODE_TTL_MINUTES),
        email_attempts: 0,
      },
    });
    await deliverCode("email", withEmailCode.owner_email, emailCode, withEmailCode.company_name);
    return ok({ completed: false, state: toState(withEmailCode) });
  }

  if (!verified.whatsapp_verified_at || !verified.email_verified_at) {
    return ok({ completed: false, state: toState(verified) });
  }

  // Os dois canais confirmados: agora sim a conta existe.
  const temp_password = generateTempPassword();
  const created = await createTenantWithOwner({
    company_name: verified.company_name,
    document: verified.document,
    phone: verified.phone,
    owner_name: verified.owner_name,
    owner_email: verified.owner_email,
    plan: verified.plan,
    plan_confirmed: true,
    password: temp_password,
    must_change_password: true,
    utm: {
      source: verified.utm_source,
      medium: verified.utm_medium,
      campaign: verified.utm_campaign,
    },
  });
  if (!created.ok) return fail(created.code, created.message, created.status);

  // Senha temporária pelos DOIS canais recém-verificados. Melhor esforço: a
  // conta já existe e o usuário entra automaticamente, então falha de entrega
  // aqui não pode derrubar o cadastro (o email fica auditado em EmailLog).
  await sendEmail({
    to: verified.owner_email,
    subject: "Sua conta no Tibé está pronta",
    html: buildSignupTempPasswordEmailHtml({
      ownerName: verified.owner_name,
      email: verified.owner_email,
      tempPassword: temp_password,
    }),
    tenant_id: created.data.tenant_id,
    type: "welcome",
  }).catch(() => {});
  await sendWhatsAppMessage(
    verified.phone,
    `Sua conta no Tibé está pronta, ${verified.owner_name}.\n\n` +
      `Email: ${verified.owner_email}\nSenha temporária: ${temp_password}\n\n` +
      `No primeiro acesso vamos pedir uma senha nova. Guarde esta mensagem até concluir a troca.`,
  ).catch(() => {});

  await prisma.pendingSignup.delete({ where: { id: row.id } }).catch(() => {});

  return ok({ completed: true, email: verified.owner_email, temp_password });
}

/** Varredura dos cadastros vencidos (chamada pelo cron diário que já existe). */
export async function purgeExpiredSignups(): Promise<{ deleted: number }> {
  const res = await prisma.pendingSignup.deleteMany({
    where: { expires_at: { lte: new Date() } },
  });
  return { deleted: res.count };
}
