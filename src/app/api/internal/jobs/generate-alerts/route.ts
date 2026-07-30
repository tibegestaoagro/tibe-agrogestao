import { Queue } from "bullmq";
import { getRedisConnection, getRedisConnectionOptions } from "@/lib/redis";
import { requireCronSecret } from "@/lib/internal-guard";
import { apiOk, apiError } from "@/lib/api";
import { generateAllAlerts } from "@/lib/actions/alerts";
import { deliverAllPendingAlerts } from "@/lib/actions/alert-delivery";
import { purgeExpiredSignups } from "@/lib/actions/signup-flow";

const QUEUE_NAME = "tibe-alerts";

/**
 * GET /api/internal/jobs/generate-alerts (spec 4.10)
 *
 * Disparado 1x/dia pela Vercel Cron (`vercel.json`), autenticado pelo
 * `CRON_SECRET` que a própria Vercel injeta automaticamente nas chamadas de
 * cron. Não há worker BullMQ persistente (decisão do módulo: sem processo
 * separado para hospedar): o processamento roda direto aqui, dentro da
 * requisição.
 *
 * A `Queue` do BullMQ é usada para registrar um histórico auditável de
 * execuções no Redis (uso real do BullMQ, como pede a spec). A idempotência
 * "não rodar duas vezes no mesmo dia" (ex: retry da própria Vercel) é
 * garantida por um lock simples no Redis (`SET NX`), não pelo estado interno
 * do job do BullMQ: mais simples e robusto sem um worker para gerenciá-lo.
 */
export async function GET(request: Request) {
  const auth = requireCronSecret(request);
  if ("error" in auth) return auth.error;

  const connection = getRedisConnection();
  const today = new Date().toISOString().slice(0, 10);
  const lockKey = `tibe:alerts:generated:${today}`;

  const acquired = await connection.set(lockKey, "1", "EX", 26 * 3600, "NX");
  if (acquired !== "OK") {
    return apiOk({ skipped: true, reason: "já executado hoje" }, { date: today });
  }

  try {
    const queue = new Queue(QUEUE_NAME, { connection: getRedisConnectionOptions() });
    await queue.add(
      "generate-alerts",
      { date: today },
      { removeOnComplete: { count: 30 }, removeOnFail: { count: 30 } },
    );
    await queue.close();
  } catch {
    // Falha ao registrar o job na fila (observabilidade) não deve impedir a
    // geração dos alertas em si.
  }

  try {
    const generated = await generateAllAlerts();
    const delivered = await deliverAllPendingAlerts();
    // Varre cadastros públicos abandonados (Módulo 19): dado pessoal de quem
    // nunca virou cliente não fica guardado. Falha aqui não derruba o cron.
    const purged = await purgeExpiredSignups().catch(() => ({ deleted: 0 }));
    return apiOk(
      { ...generated, ...delivered, expired_signups_deleted: purged.deleted },
      { date: today },
    );
  } catch (e) {
    await connection.del(lockKey); // libera o lock para permitir nova tentativa
    return apiError(
      "JOB_FAILED",
      e instanceof Error ? e.message : "Falha ao gerar alertas",
      500,
    );
  }
}
