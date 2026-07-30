import { apiOk } from "@/lib/api";
import { requireInternalSecret } from "@/lib/internal-guard";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { collectPendingReminders, purgeExpiredFlows } from "@/lib/actions/agent-flows";
import { sendWhatsAppMessage } from "@/lib/whatsapp-send";

/**
 * POST /api/internal/whatsapp/pending-flows (2026-07-30)
 *
 * Chamado por um agendador do n8n a cada 15 minutos. Existe porque o único
 * agendador do Tibé é a Vercel Cron, que roda 1x/dia: lembrar no dia seguinte
 * de um cadastro abandonado às 14h não ajuda ninguém. O n8n já está
 * provisionado e tem gatilho por intervalo nativo, então a granularidade sai de
 * graça, e a regra continua aqui (versionada e testável).
 *
 * O n8n não decide nada: só acorda o Tibé. Quem escolhe quem merece lembrete,
 * monta o texto e envia é esta rota.
 *
 * Varre todos os tenants ativos, como o job diário de alertas: por natureza é
 * cross-tenant, e cada iteração usa o client escopado.
 */
export async function POST(request: Request) {
  const auth = requireInternalSecret(request);
  if ("error" in auth) return auth.error;

  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ["trial", "active"] } },
    select: { id: true },
  });

  let sent = 0;
  let failed = 0;
  let purged = 0;

  for (const t of tenants) {
    const db = prismaForTenant(t.id);
    try {
      purged += (await purgeExpiredFlows(db)).deleted;
      const pending = await collectPendingReminders(db);
      for (const p of pending) {
        const res = await sendWhatsAppMessage(p.phone, p.message);
        if (res.ok) sent++;
        else failed++;
      }
    } catch {
      // Um tenant com problema não pode impedir o lembrete dos outros.
      failed++;
    }
  }

  return apiOk({ sent, failed, expired_flows_purged: purged }, { tenants: tenants.length });
}
