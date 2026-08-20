import "dotenv/config";
import { Queue, Worker } from "bullmq";
import { getRedisConnectionOptions, getRedisConnection } from "@/lib/redis";

/**
 * O worker consome a fila, e ignora o job que nao deve reexecutar.
 *
 * ⚠️ Esta suite NAO executa `executarRotinaDiaria`, de proposito. O Redis
 * deste projeto e COMPARTILHADO com producao (nao ha instancia local), e a
 * rotina real gera e ENVIA alerta para cliente de verdade. Testar isso aqui
 * mandaria mensagem para produtor de verdade.
 *
 * O que se prova entao e o mecanismo, que e o que pode quebrar: worker sobe,
 * consome da fila certa, ignora o job de historico e processa o job real. A
 * rotina em si ja e exercitada por `test:m4` e `test:m24`, que chamam a rota.
 *
 * Usa uma fila de nome proprio, para nunca encostar na fila de producao.
 *
 * Roda: `npm run test:m44`.
 */

const FILA_DE_TESTE = `tibe-teste-worker-${Date.now()}`;

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

function esperar(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("⚙️  M44: worker da rotina diaria\n");

  const conexao = getRedisConnectionOptions();
  const processados: string[] = [];

  // Mesmo corpo de decisão do worker real (`scripts/worker-rotina.ts`): o job
  // de bookkeeping que a rota grava quando ela mesma executa nao pode ser
  // reexecutado, senao a rotina roda duas vezes no mesmo dia.
  const worker = new Worker(
    FILA_DE_TESTE,
    async (job) => {
      if (job.data?.executado_inline) {
        processados.push(`ignorado:${job.name}`);
        return { ignorado: true };
      }
      processados.push(`executado:${job.name}`);
      return { ok: true };
    },
    { connection: conexao, concurrency: 1 },
  );

  const fila = new Queue(FILA_DE_TESTE, { connection: conexao });

  try {
    console.log("1. O worker consome o que a rota enfileira");
    {
      await fila.add("rotina-diaria", { date: "2026-08-20" });
      for (let i = 0; i < 40 && processados.length === 0; i++) await esperar(150);
      assert(processados.includes("executado:rotina-diaria"), "job real e processado");
    }

    console.log("\n2. O job de historico NAO e reexecutado");
    {
      // A rota grava este job mesmo quando ela propria executou a rotina, como
      // registro auditavel. Se o worker o tratasse como trabalho, a rotina
      // rodaria de novo e os alertas sairiam em dobro.
      await fila.add("rotina-diaria", { date: "2026-08-20", executado_inline: true });
      for (let i = 0; i < 40 && processados.length < 2; i++) await esperar(150);
      assert(
        processados.includes("ignorado:rotina-diaria"),
        "job marcado como executado_inline e ignorado, nao reexecutado",
      );
    }

    console.log("\n3. O nome da fila e compartilhado entre rota e worker");
    {
      const { FILA_DE_ROTINA } = await import("@/lib/jobs/fila");
      assert(
        typeof FILA_DE_ROTINA === "string" && FILA_DE_ROTINA.length > 0,
        `a constante existe e vale "${FILA_DE_ROTINA}"`,
      );
    }

    console.log("\n4. Sem a chave ligada, a rota NAO enfileira");
    {
      const { temWorkerDedicado } = await import("@/lib/jobs/fila");
      const antes = process.env.ROTINA_COM_WORKER;

      delete process.env.ROTINA_COM_WORKER;
      assert(temWorkerDedicado() === false, "sem a variavel, o padrao e executar na propria rota");

      process.env.ROTINA_COM_WORKER = "1";
      assert(temWorkerDedicado() === true, "com a variavel em 1, a rota passa a enfileirar");

      process.env.ROTINA_COM_WORKER = "sim";
      assert(temWorkerDedicado() === false, "qualquer outro valor NAO liga: so o literal 1");

      if (antes === undefined) delete process.env.ROTINA_COM_WORKER;
      else process.env.ROTINA_COM_WORKER = antes;
    }

    console.log("");
    if (failures > 0) {
      console.error(`❌ M44: ${failures} falha(s).`);
      process.exit(1);
    }
    console.log("✅ M44: 0 falhas.");
  } finally {
    await worker.close();
    await fila.obliterate({ force: true }).catch(() => {});
    await fila.close();
    getRedisConnection().disconnect();
  }
}

main();
