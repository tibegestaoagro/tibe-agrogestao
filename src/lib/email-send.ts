import nodemailer from "nodemailer";
import { Resend } from "resend";
import { prismaForTenant, scoped } from "@/lib/prisma";
import type { EmailLogType } from "@/generated/prisma/enums";

/**
 * Canal de email (arquitetura 2026-07-29), somando ao WhatsApp já existente:
 * Gmail SMTP em desenvolvimento/início de produção, Resend guardado pronto
 * pra quando o domínio próprio (tibe.com.br) estiver verificado (troca só
 * por `EMAIL_PROVIDER`, sem mudar código). Nunca lança: toda tentativa
 * (sucesso ou falha) grava uma linha em EmailLog, porque o usuário precisa
 * de comprovação de envio (avisos de fatura/trial não podem depender só do
 * WhatsApp para fins de defensabilidade).
 */

type SendEmailResult = { ok: true } | { ok: false; error: string };

async function sendViaGmailSmtp(to: string, subject: string, html: string): Promise<SendEmailResult> {
  const user = process.env.GMAIL_SMTP_USER;
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD;
  if (!user || !pass) {
    return { ok: false, error: "GMAIL_SMTP_USER/GMAIL_SMTP_APP_PASSWORD não configurados" };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user, pass },
    });
    await transporter.sendMail({ from: `Tibé <${user}>`, to, subject, html });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro desconhecido ao enviar email (Gmail SMTP)" };
  }
}

async function sendViaResend(to: string, subject: string, html: string): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return { ok: false, error: "RESEND_API_KEY/RESEND_FROM_EMAIL não configurados" };
  }
  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({ from, to, subject, html });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro desconhecido ao enviar email (Resend)" };
  }
}

/**
 * Envio SEM registro em EmailLog. Existe para o único caso em que não há
 * tenant algum a que atribuir o log: o código de verificação do cadastro
 * público (Módulo 19), disparado antes de o Tenant existir. Não use isto
 * para mensagem a cliente já cadastrado: aí o rastro auditável do `EmailLog`
 * é justamente o ponto (ver `sendEmail`).
 */
export async function dispatchEmail(
  to: string,
  subject: string,
  html: string,
): Promise<SendEmailResult> {
  const provider = process.env.EMAIL_PROVIDER === "resend" ? "resend" : "gmail_smtp";
  return provider === "resend"
    ? sendViaResend(to, subject, html)
    : sendViaGmailSmtp(to, subject, html);
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  tenant_id: string;
  type: EmailLogType;
  related_id?: string | null;
}): Promise<SendEmailResult> {
  const result = await dispatchEmail(params.to, params.subject, params.html);

  const db = prismaForTenant(params.tenant_id);
  await db.emailLog
    .create({
      data: scoped({
        to_email: params.to,
        type: params.type,
        related_id: params.related_id ?? null,
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error,
        sent_at: result.ok ? new Date() : null,
      }),
    })
    .catch(() => {}); // o log em si nunca deve derrubar o disparo

  return result;
}
