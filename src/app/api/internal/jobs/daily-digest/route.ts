import { Queue } from "bullmq";
import { getRedisConnection, getRedisConnectionOptions } from "@/lib/redis";
import { requireInternalSecret } from "@/lib/internal-guard";
import { apiOk, apiError } from "@/lib/api";
import { sendAllDailyDigests } from "./send-digest";
import { withApi } from "@/lib/route";

const QUEUE_NAME = "tibe-daily-digest";

/**
 * GET /api/internal/jobs/daily-digest (Onda 2, plano de arquitetura seção 2.4)
 *
 * Disparado 1x/dia pelo N8N (workflow "Tibe - Resumo diario", Schedule
 * Trigger, mesmo padrão de "Tibe - Lembrete de cadastro abandonado"), não
 * pela Vercel Cron: evita depender de um segundo slot de cron no plano da
 * Vercel, que não era verificável. Autenticado por INTERNAL_API_SECRET
 * (x-internal-secret), o mesmo padrão de toda rota /api/internal/* chamada
 * pelo N8N, reusando a credencial "Tibe Internal Secret" já configurada lá.
 *
 * Sem worker BullMQ persistente (o processamento roda síncrono aqui dentro),
 * com a Queue usada só para registrar um histórico auditável de execuções no
 * Redis. A idempotência "não rodar 2x no mesmo dia" é um lock simples
 * (`SET NX`), com chave própria para não colidir com o lock de alertas.
 */
async function GETHandler(request: Request) {
  const auth = requireInternalSecret(request);
  if ("error" in auth) return auth.error;

  const connection = getRedisConnection();
  const today = new Date().toISOString().slice(0, 10);
  const lockKey = `tibe:digest:generated:${today}`;

  const acquired = await connection.set(lockKey, "1", "EX", 26 * 3600, "NX");
  if (acquired !== "OK") {
    return apiOk({ skipped: true, reason: "já executado hoje" }, { date: today });
  }

  try {
    const queue = new Queue(QUEUE_NAME, { connection: getRedisConnectionOptions() });
    await queue.add(
      "daily-digest",
      { date: today },
      { removeOnComplete: { count: 30 }, removeOnFail: { count: 30 } },
    );
    await queue.close();
  } catch {
    // Falha ao registrar o job na fila (observabilidade) não deve impedir o
    // envio do resumo em si.
  }

  try {
    const result = await sendAllDailyDigests();
    return apiOk(result, { date: today });
  } catch (e) {
    await connection.del(lockKey); // libera o lock para permitir nova tentativa
    return apiError(
      "JOB_FAILED",
      e instanceof Error ? e.message : "Falha ao enviar o resumo diário",
      500,
    );
  }
}

export const GET = withApi(GETHandler);
