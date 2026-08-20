import { Queue } from "bullmq";
import { getRedisConnection, getRedisConnectionOptions } from "@/lib/redis";
import { requireCronSecret } from "@/lib/internal-guard";
import { apiOk, apiError } from "@/lib/api";
import { executarRotinaDiaria } from "@/lib/jobs/rotina-diaria";
import { FILA_DE_ROTINA, temWorkerDedicado } from "@/lib/jobs/fila";
import { log } from "@/lib/log";
import { withApi } from "@/lib/route";

/**
 * GET /api/internal/jobs/generate-alerts (spec 4.10)
 *
 * Disparado 1x/dia pela Vercel Cron (`vercel.json`), autenticado pelo
 * `CRON_SECRET` que a própria Vercel injeta nas chamadas de cron.
 *
 * Dois modos, e o padrão é o antigo:
 *
 * - **Sem worker** (padrão): o processamento roda direto aqui, dentro da
 *   requisição, como sempre foi. Simples, e com um teto duro no timeout da
 *   função serverless, que chega junto com o crescimento da base, porque
 *   `generateAllAlerts` percorre TODOS os tenants ativos.
 * - **Com worker** (`ROTINA_COM_WORKER=1`): a rota só enfileira e responde na
 *   hora. Quem executa é o processo de `scripts/worker-rotina.ts`, que roda
 *   fora da Vercel.
 *
 * O padrão é o modo antigo de propósito: ligar a fila sem um worker de pé
 * pararia de gerar alerta em produção, em silêncio, e o sintoma só apareceria
 * quando alguém reparasse que o aviso de vacina não chegou.
 *
 * A idempotência "não rodar duas vezes no mesmo dia" (ex: retry da própria
 * Vercel) é um lock simples no Redis (`SET NX`), e não o estado interno do
 * job: continua valendo nos dois modos.
 */
async function GETHandler(request: Request) {
  const auth = requireCronSecret(request);
  if ("error" in auth) return auth.error;

  const connection = getRedisConnection();
  const today = new Date().toISOString().slice(0, 10);
  const lockKey = `tibe:alerts:generated:${today}`;

  const acquired = await connection.set(lockKey, "1", "EX", 26 * 3600, "NX");
  if (acquired !== "OK") {
    return apiOk({ skipped: true, reason: "já executado hoje" }, { date: today });
  }

  if (temWorkerDedicado()) {
    try {
      const queue = new Queue(FILA_DE_ROTINA, { connection: getRedisConnectionOptions() });
      await queue.add(
        "rotina-diaria",
        { date: today },
        { removeOnComplete: { count: 30 }, removeOnFail: { count: 30 }, attempts: 3 },
      );
      await queue.close();
      log.info("rotina diaria enfileirada para o worker", { code: "ENFILEIRADO" });
      return apiOk({ enqueued: true }, { date: today });
    } catch (e) {
      // Enfileirar falhou e há worker configurado: liberar o lock é essencial,
      // senão o dia inteiro fica sem rotina e sem ninguém saber.
      await connection.del(lockKey);
      log.error("falha ao enfileirar a rotina diaria", { code: "ENFILEIRAR_FALHOU" });
      return apiError(
        "QUEUE_FAILED",
        e instanceof Error ? e.message : "Falha ao enfileirar a rotina",
        500,
      );
    }
  }

  // Registro auditável de execução, como a spec pede. Falhar aqui não pode
  // impedir a rotina em si: é observabilidade, não trabalho.
  try {
    const queue = new Queue(FILA_DE_ROTINA, { connection: getRedisConnectionOptions() });
    await queue.add(
      "rotina-diaria",
      { date: today, executado_inline: true },
      { removeOnComplete: { count: 30 }, removeOnFail: { count: 30 } },
    );
    await queue.close();
  } catch {
    // Ver acima: histórico é bônus.
  }

  try {
    const resultado = await executarRotinaDiaria();
    return apiOk(resultado, { date: today });
  } catch (e) {
    await connection.del(lockKey); // libera o lock para permitir nova tentativa
    return apiError(
      "JOB_FAILED",
      e instanceof Error ? e.message : "Falha ao gerar alertas",
      500,
    );
  }
}

export const GET = withApi(GETHandler);
