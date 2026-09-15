import "dotenv/config";
import fs from "node:fs";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Avaliação do agente, Fase 3 (Módulo do agente WhatsApp).
 * Nenhuma seção chama a OpenAI: o transporte do modelo é substituído.
 * Roda: `npm run test:m69`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

async function main() {
  console.log("1. Medidor de custo");
  {
    const os = await import("node:os");
    const path = await import("node:path");
    const { custoDaChamada, criarMedidor, OrcamentoEsgotado } = await import("./avaliacao/medidor");
    check("1M de entrada sem cache no gpt-4o-mini custa US$ 0,15", Math.abs(custoDaChamada("gpt-4o-mini", { prompt_tokens: 1_000_000, completion_tokens: 0 }) - 0.15) < 1e-9);
    check("entrada em cache cobra o preço de cache", Math.abs(custoDaChamada("gpt-4o-mini", { prompt_tokens: 1_000_000, prompt_tokens_details: { cached_tokens: 1_000_000 }, completion_tokens: 0 }) - 0.075) < 1e-9);
    check("saída do gpt-5.6-terra custa US$ 12 por milhão", Math.abs(custoDaChamada("gpt-5.6-terra", { completion_tokens: 1_000_000 }) - 12) < 1e-9);
    check("cached_tokens maior que prompt_tokens nunca gera custo negativo", custoDaChamada("gpt-4o-mini", { prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 1_000_000 }, completion_tokens: 0 }) >= 0);
    let semPreco = false;
    try { custoDaChamada("modelo-inexistente", {}); } catch { semPreco = true; }
    check("modelo sem preço recusa em vez de contar zero", semPreco);

    const arquivo = path.join(os.tmpdir(), `gasto-m69-${Date.now()}.json`);
    try {
      fs.writeFileSync(arquivo, JSON.stringify({ total_usd: 29.99 }));
      let enviadas = 0;
      const medidor = criarMedidor({
        arquivo,
        enviar: async () => {
          enviadas += 1;
          return { status: 200, json: { usage: { prompt_tokens: 100_000, completion_tokens: 0 }, choices: [] } };
        },
      });
      await medidor.transporte({ model: "gpt-5.6-terra" });
      check("chamada abaixo do teto passa e soma o custo", enviadas === 1 && Math.abs(medidor.gastoTotal() - 30.19) < 1e-6, String(medidor.gastoTotal()));
      let parou = false;
      try { await medidor.transporte({ model: "gpt-5.6-terra" }); } catch (e) { parou = e instanceof OrcamentoEsgotado; }
      check("no teto, a chamada seguinte nem sai", parou && enviadas === 1);
      check("o gasto fica gravado no arquivo", JSON.parse(fs.readFileSync(arquivo, "utf8")).total_usd > 30);

      let naoEnviouComModeloInvalido = true;
      let enviadas2 = 0;
      const medidor2 = criarMedidor({
        arquivo: path.join(os.tmpdir(), `gasto-m69-2-${Date.now()}.json`),
        enviar: async () => {
          enviadas2 += 1;
          return { status: 200, json: { usage: { prompt_tokens: 100_000, completion_tokens: 0 }, choices: [] } };
        },
      });
      try { await medidor2.transporte({ model: "modelo-inexistente" }); } catch { naoEnviouComModeloInvalido = enviadas2 === 0; }
      check("medidor recusa modelo sem preço antes de enviar", naoEnviouComModeloInvalido);
    } finally {
      fs.rmSync(arquivo, { force: true });
    }
  }

  if (falhas === 0) console.log("\n✅ Todos os testes passaram");
  else console.log(`\n❌ ${falhas} testes falharam`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("Erro ao rodar testes:", e);
  process.exit(1);
});
