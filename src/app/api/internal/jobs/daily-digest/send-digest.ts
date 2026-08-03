import { prisma, prismaForTenant } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { findAlertRecipient } from "@/lib/actions/alert-delivery";
import { buildDailyDigest } from "./build-digest";

/**
 * Envia o resumo diário de um tenant (notify() com urgency "digest").
 * Destinatário-base igual ao de um alerta crítico (findAlertRecipient: OWNER
 * ativo, senão ADMIN ativo, ver alert-delivery.ts): quem recebe o resumo por
 * WhatsApp quando não há inscrição de push é a mesma pessoa que hoje recebe
 * alerta. Devolve false quando não há destinatário (tenant sem OWNER/ADMIN
 * ativo: nada a fazer) ou quando notify() não conseguiu entregar por nenhum
 * canal.
 */
export async function sendDailyDigestForTenant(tenantId: string): Promise<boolean> {
  const db = prismaForTenant(tenantId);
  const recipient = await findAlertRecipient(db);
  if (!recipient) return false;

  const profiles = await db.tenantProfile.findMany({ where: { active: true } });
  const activeProfiles = profiles.map((p) => p.profile_type);
  const content = await buildDailyDigest(db, activeProfiles);

  const result = await notify(
    {
      tenant_id: tenantId,
      user_id: recipient.id,
      phone: recipient.phone,
      email: recipient.email,
    },
    {
      pushTitle: content.pushTitle,
      pushBody: content.pushBody,
      pushUrl: "/dashboard",
      whatsappText: content.whatsappText,
      // Sem `email`: urgency "digest" nunca usa o canal de email de qualquer
      // forma (política dentro de notify()), então nem monta o conteúdo aqui.
    },
    "digest",
  );
  return result.delivered;
}

/** Varre todos os tenants trial/active e envia o resumo diário de cada um. */
export async function sendAllDailyDigests(): Promise<{ tenants: number; sent: number }> {
  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ["trial", "active"] } },
    select: { id: true },
  });

  let sent = 0;
  for (const t of tenants) {
    const delivered = await sendDailyDigestForTenant(t.id);
    if (delivered) sent++;
  }
  return { tenants: tenants.length, sent };
}
