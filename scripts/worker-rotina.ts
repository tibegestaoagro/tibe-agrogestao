import "dotenv/config";
import { Worker } from "bullmq";
import { getRedisConnectionOptions } from "@/lib/redis";
import { FILA_DE_ROTINA } from "@/lib/jobs/fila";
import { executarRotinaDiaria } from "@/lib/jobs/rotina-diaria";
import { log, resumirErro } from "@/lib/log";

/**
 * Processo que consome a fila da rotina diária.
 *
 * Existe porque `generateAllAlerts` percorre TODOS os tenants ativos, e até
 * aqui isso rodava dentro da requisição da Vercel Cron, com o teto do timeout
 * da função serverless. O teto não incomodava com a base atual e passa a
 * incomodar exatamente quando o produto der certo.
 *
 * Roda FORA da Vercel (o Railway já hospeda o n8n, e é o lugar natural).
 * Comando: `npm run worker`.
 *
 * Precisa das MESMAS variáveis que a aplicação usa para banco, Redis e envio:
 * `DATABASE_URL`, `REDIS_URL`, e as de email/WhatsApp que a entrega de alerta
 * consome. Sem elas o worker sobe e falha no primeiro job.
 *
 * ⚠️ Enquanto este processo não estiver de pé, NÃO ligue `ROTINA_COM_WORKER=1`
 * na Vercel: a rota passaria a só enfileirar, ninguém consumiria, e o sistema
 * pararia de gerar alerta em silêncio.
 */

const CONCORRENCIA = 1; // a rotina é diária e global: paralelismo aqui só criaria corrida

function main() {
  if (!process.env.REDIS_URL) {
    console.error("REDIS_URL não definida: o worker não tem fila para consumir.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida: o worker não tem banco para ler.");
    process.exit(1);
  }

  const worker = new Worker(
    FILA_DE_ROTINA,
    async (job) => {
      // O job de bookkeeping que a rota grava quando ela mesma executa não deve
      // ser reexecutado aqui: seria rodar a rotina duas vezes no mesmo dia.
      if (job.data?.executado_inline) {
        log.info("worker: job de historico ignorado", { code: "HISTORICO" });
        return { ignorado: true };
      }
      log.info("worker: rotina diaria iniciada", { code: "INICIO" });
      return executarRotinaDiaria();
    },
    { connection: getRedisConnectionOptions(), concurrency: CONCORRENCIA },
  );

  worker.on("completed", (job) => {
    log.info("worker: job concluido", { code: "OK", request_id: job.id });
  });

  worker.on("failed", (job, err) => {
    log.error("worker: job falhou", { code: "FALHOU", request_id: job?.id });
    console.error(JSON.stringify({ level: "error", msg: "detalhe", err: resumirErro(err) }));
  });

  // Encerramento limpo: sem isto, um deploy no meio de um job deixaria a
  // rotina pela metade e o lock do dia ocupado.
  for (const sinal of ["SIGTERM", "SIGINT"] as const) {
    process.on(sinal, async () => {
      log.info("worker: encerrando", { code: sinal });
      await worker.close();
      process.exit(0);
    });
  }

  log.info("worker: ouvindo a fila", { code: "PRONTO", route: FILA_DE_ROTINA });
}

main();
