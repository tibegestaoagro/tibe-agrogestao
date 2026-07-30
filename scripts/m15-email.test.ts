import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { sendEmail } from "@/lib/email-send";
import { deliverPendingAlertsForTenant } from "@/lib/actions/alert-delivery";

/**
 * Testes do canal de email (arquitetura 2026-07-29): sendEmail() nunca
 * lança e sempre grava EmailLog; deliverPendingAlertsForTenant tenta os 2
 * canais independentemente e só marca o alerta como "sent" se algum deles
 * funcionar. Sem credencial real configurada (Gmail/Resend), não dá pra
 * testar entrega de verdade: os testes aqui forçam deliberadamente a
 * ausência de config pra exercitar o caminho de falha graciosa, que é o
 * único determinístico sem depender de rede externa.
 * Roda: `npm run test:m15` (DATABASE_URL do Docker local).
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

/** Limpa toda config de provider de email do processo, forçando falha determinística. */
function clearEmailEnv() {
  delete process.env.EMAIL_PROVIDER;
  delete process.env.GMAIL_SMTP_USER;
  delete process.env.GMAIL_SMTP_APP_PASSWORD;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
}

async function main() {
  console.log("🔒 M15: canal de email (email-send.ts, alert-delivery.ts)\n");

  const savedEnv = {
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    GMAIL_SMTP_USER: process.env.GMAIL_SMTP_USER,
    GMAIL_SMTP_APP_PASSWORD: process.env.GMAIL_SMTP_APP_PASSWORD,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  };

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: "M15 Tenant", document: `15${stamp}`.slice(0, 14), plan: "campo" },
  });

  try {
    clearEmailEnv();

    // ── sendEmail(): falha graciosa + log ────────────────────────
    const result = await sendEmail({
      to: "destinatario@teste.local",
      subject: "Teste",
      html: "<p>Teste</p>",
      tenant_id: tenant.id,
      type: "welcome",
    });
    assert(!result.ok, "sendEmail() sem provider configurado devolve ok:false (não lança)");

    const logs = await prismaForTenant(tenant.id).emailLog.findMany({ where: { tenant_id: tenant.id } });
    assert(logs.length === 1, "sendEmail() grava exatamente 1 EmailLog");
    assert(logs[0]?.status === "failed", "EmailLog gravado como failed");
    assert(logs[0]?.type === "welcome", "EmailLog com o type correto (welcome)");
    assert(logs[0]?.to_email === "destinatario@teste.local", "EmailLog com o destinatário correto");
    assert(!!logs[0]?.error, "EmailLog guarda o motivo da falha");
    assert(logs[0]?.sent_at === null, "EmailLog sem sent_at quando falhou");

    // ── EMAIL_PROVIDER=resend sem RESEND_API_KEY: mesma falha graciosa ──
    process.env.EMAIL_PROVIDER = "resend";
    const resendResult = await sendEmail({
      to: "destinatario@teste.local",
      subject: "Teste Resend",
      html: "<p>Teste</p>",
      tenant_id: tenant.id,
      type: "welcome",
    });
    assert(!resendResult.ok, "sendEmail() via resend sem RESEND_API_KEY também falha graciosamente");
    clearEmailEnv();

    // ── deliverPendingAlertsForTenant: sem canal configurado ─────
    const owner = await prismaForTenant(tenant.id).user.create({
      data: scoped({
        name: "M15 Owner",
        email: `m15-owner-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
        phone: null,
      }),
    });
    const alert = await prismaForTenant(tenant.id).alert.create({
      data: scoped({
        alert_type: "trial_ending",
        message: "Seu trial termina em 2 dias.",
        status: "pending",
      }),
    });

    const delivery = await deliverPendingAlertsForTenant(tenant.id);
    assert(delivery.sent === 0, "deliverPendingAlertsForTenant: 0 enviados sem nenhum canal configurado");

    const alertAfter = await prismaForTenant(tenant.id).alert.findUnique({ where: { id: alert.id } });
    assert(alertAfter?.status === "pending", "alerta permanece pending quando nenhum canal funciona");

    const alertLogs = await prismaForTenant(tenant.id).emailLog.findMany({
      where: { tenant_id: tenant.id, type: "alert" },
    });
    assert(alertLogs.length === 1, "deliverPendingAlertsForTenant tenta o email mesmo sem provider WhatsApp ativo");
    assert(alertLogs[0]?.related_id === alert.id, "EmailLog do alerta aponta pro Alert.id certo");
    assert(alertLogs[0]?.to_email === owner.email, "email tentado pro Owner ativo (mesmo sem telefone)");

    // ── sem nenhum OWNER/ADMIN ativo: nada é tentado ─────────────
    await prismaForTenant(tenant.id).user.update({ where: { id: owner.id }, data: { active: false } });
    const noRecipient = await deliverPendingAlertsForTenant(tenant.id);
    assert(noRecipient.sent === 0, "deliverPendingAlertsForTenant: 0 enviados sem destinatário ativo");
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
  }

  console.log(failures === 0 ? "\n✅ M15: 0 falhas." : `\n❌ M15: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
