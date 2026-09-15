import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { exigirBancoLocal, exigirRedisLocal } from "../_banco-local";

/**
 * CLI da rodada real (Fase 3): roda cada modelo sobre os casos, com um medidor
 * de custo único para a rodada, e grava `resultados/<rodada>/<modelo>.json`.
 * Roda: `npm run avaliacao:rodar -- --rodada <nome> [--modelos a,b] [--particao ajuste|final|todas] [--limite N] [--concorrencia N]`.
 * Sai com código 2 quando o orçamento acaba; 1 quando algum modelo foi pulado ou interrompido por outro motivo.
 */

exigirBancoLocal();
exigirRedisLocal();

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  // Depois das travas: nada que abre banco ou Redis é carregado antes delas.
  const { PRECOS, TETO_USD, criarMedidor, OrcamentoEsgotado } = await import("./medidor");
  const { carregarCasos, particaoDoCaso } = await import("./casos");
  const { avaliarModelo } = await import("./executor");
  const { comEsperaEmLimite } = await import("./limite");
  const { classificarMensagem } = await import("@/lib/agente/classificar");
  const { definirTransporteDoModelo, FalhaDoModelo, transporteHttp } = await import("@/lib/agente/modelo");

  const rodada = argumento("rodada");
  if (!rodada || !/^[a-z0-9-]+$/.test(rodada)) {
    console.error("Uso: npm run avaliacao:rodar -- --rodada <nome> [--modelos a,b] [--particao ajuste|final|todas] [--limite N] [--concorrencia N]");
    process.exit(1);
  }
  const particao = (argumento("particao") ?? "todas") as "ajuste" | "final" | "todas";
  if (!["ajuste", "final", "todas"].includes(particao)) {
    console.error(`partição inválida: ${particao}`);
    process.exit(1);
  }
  const modelos = (argumento("modelos") ?? Object.keys(PRECOS).join(",")).split(",").filter(Boolean);
  const semPreco = modelos.filter((m) => !PRECOS[m]);
  if (semPreco.length > 0) {
    console.error(`modelo sem preço na tabela da avaliação: ${semPreco.join(", ")}`);
    process.exit(1);
  }
  const limite = argumento("limite") === undefined ? Infinity : Number(argumento("limite"));
  if (!(limite > 0)) {
    console.error("--limite precisa ser um número positivo");
    process.exit(1);
  }
  const concorrencia = argumento("concorrencia") === undefined ? 2 : Number(argumento("concorrencia"));
  if (!(concorrencia > 0)) {
    console.error("--concorrencia precisa ser um número positivo");
    process.exit(1);
  }

  let casos = carregarCasos();
  if (particao !== "todas") casos = casos.filter((c) => particaoDoCaso(c) === particao);
  casos = casos.slice(0, limite);
  if (casos.length === 0) {
    console.error("nenhum caso para rodar");
    process.exit(1);
  }

  // No máximo uma linha a cada 10 s: com concorrência, várias mensagens esperam ao mesmo tempo.
  let ultimoAviso = 0;
  const aoEsperar = (ms: number) => {
    const agora = Date.now();
    if (agora - ultimoAviso < 10_000) return;
    ultimoAviso = agora;
    console.log(`limite da conta: esperando ${(ms / 1000).toFixed(1)} s`);
  };
  const medidor = criarMedidor({ arquivo: path.join(__dirname, "resultados", "gasto.json"), enviar: comEsperaEmLimite(transporteHttp, { aoEsperar }) });
  const pasta = path.join(__dirname, "resultados", rodada);
  fs.mkdirSync(pasta, { recursive: true });
  const gravar = (modelo: string, dados: unknown) => fs.writeFileSync(path.join(pasta, `${modelo}.json`), JSON.stringify(dados, null, 2));
  console.log(`Rodada ${rodada}: ${casos.length} casos, partição ${particao}, gasto acumulado US$ ${medidor.gastoTotal().toFixed(4)} de US$ ${TETO_USD}`);

  let outraInterrupcao = false;
  let algumPulado = false;
  for (const modelo of modelos) {
    let esforco: string | null = /^gpt-5/.test(modelo) ? "low" : null;

    // Sondagem: modelo que recusa o pedido (HTTP 400) não pode virar uma rodada inteira de erro.
    const sondar = async () => {
      process.env.AGENTE_MODELO = modelo;
      if (esforco === null) delete process.env.AGENTE_ESFORCO;
      else process.env.AGENTE_ESFORCO = esforco;
      definirTransporteDoModelo(medidor.transporte);
      try {
        await classificarMensagem({ texto: "quantos animais eu tenho", hoje: "2026-09-15", perfis: ["fazenda", "prestador"] });
        return null;
      } catch (e) {
        if (e instanceof OrcamentoEsgotado) {
          console.error(e.message);
          process.exit(2);
        }
        return e instanceof Error ? e : new Error(String(e));
      } finally {
        definirTransporteDoModelo(null);
      }
    };
    let falha = await sondar();
    if (falha instanceof FalhaDoModelo && /HTTP 400/.test(falha.message) && esforco !== null) {
      console.log(`${modelo}: HTTP 400 com esforço ${esforco}, tentando sem esforço`);
      esforco = null;
      falha = await sondar();
    }
    // Tempo, rede, 429 ou 5xx numa única sondagem não pode tirar um modelo inteiro da comparação; 400 não muda tentando de novo.
    if (falha instanceof FalhaDoModelo && (falha.motivo === "tempo" || (falha.motivo === "http" && !/HTTP 400/.test(falha.message)))) {
      console.log(`${modelo}: sondagem falhou (${falha.message}), tentando de novo`);
      falha = await sondar();
    }
    if (falha) {
      const motivo = `${falha.name}: ${falha.message}`;
      console.log(`${modelo}: pulado (${motivo})`);
      gravar(modelo, { modelo, pulado: motivo });
      algumPulado = true;
      continue;
    }

    let resultado: Awaited<ReturnType<typeof avaliarModelo>>;
    try {
      resultado = await avaliarModelo({
        modelo,
        esforco,
        casos,
        particao,
        transporte: medidor.transporte,
        concorrencia,
        prefixo: `${rodada}-${modelo}`,
        orcamentoEsgotado: () => medidor.gastoTotal() >= TETO_USD,
      });
    } catch (e) {
      // Erro inesperado num modelo não derruba os seguintes, e fica registrado no lugar do resultado.
      const motivo = `erro inesperado: ${e instanceof Error ? `${e.name}: ${e.message.split("\n")[0]}` : String(e)}`;
      console.log(`${modelo}: pulado (${motivo})`);
      gravar(modelo, { modelo, pulado: motivo });
      algumPulado = true;
      continue;
    }
    gravar(modelo, resultado);

    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    const falhasNasMensagens = resultado.notas.filter((n) => n.falha).length;
    console.log(
      `${modelo}${esforco ? ` (${esforco})` : ""}: ` +
      [
        resultado.aprovacao.aprovado ? "APROVADO" : "reprovado",
        `intenção ${pct(resultado.metricas.intencao_geral)}`,
        `campos ${pct(resultado.metricas.campos)}`,
        `gravações indevidas ${resultado.gravacoes_indevidas}`,
        `confirmações que não gravaram ${resultado.confirmacoes_que_nao_gravaram}`,
        `falhas do modelo ${falhasNasMensagens} em mensagens, ${resultado.falhas_do_modelo} em passos`,
        `custo US$ ${resultado.custo_usd.toFixed(4)}`,
        `gasto acumulado US$ ${medidor.gastoTotal().toFixed(4)}`,
        resultado.interrompido ? `INTERROMPIDO (${resultado.interrompido})` : "",
      ]
        .filter(Boolean)
        .join(" | "),
    );

    if (resultado.interrompido === "orçamento") process.exit(2);
    if (resultado.interrompido) outraInterrupcao = true;
  }
  process.exit(outraInterrupcao || algumPulado ? 1 : 0);
}

main().catch((e) => {
  console.error("Erro na rodada:", e instanceof Error ? e.message : e);
  process.exit(1);
});
