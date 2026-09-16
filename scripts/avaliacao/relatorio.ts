import fs from "node:fs";
import path from "node:path";
import { carregarCasos, particaoDoCaso } from "./casos";
import type { ResultadoDoModelo } from "./executor";
import { agregar, aprovar } from "./pontuar";

/**
 * CLI: gera o relatório em markdown de uma rodada a partir de
 * `resultados/<rodada>/*.json`. A partição filtra TODA lista de casos (notas,
 * erros, gravações indevidas) e as métricas são recalculadas sobre o filtro:
 * na rodada de ajuste, caso da partição final nunca aparece. A partição de
 * cada id vem dos casos ATUAIS em `casos/*.json` (o resultado gravado só tem
 * o id), então um caso marcado `coincide_com_exemplo` depois da rodada já
 * sai do relatório como "ajuste".
 * Roda: `npm run avaliacao:relatorio -- --rodada <nome> [--particao ajuste|final|todas]` (sem --particao, a do resultado).
 */

/** id -> partição, calculada uma vez sobre os casos atuais em disco. */
function construirMapaDeParticao(): Map<string, "ajuste" | "final"> {
  const mapa = new Map<string, "ajuste" | "final">();
  for (const caso of carregarCasos()) mapa.set(caso.id, particaoDoCaso(caso));
  return mapa;
}

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Trava contra o erro que a revisão da Fase 3 achou: ajustar prompt olhando um
 * resultado que já vinha com a partição guardada dentro. O relatório de uma
 * rodada que não é a final (nem uma rodada `fora...`, de casos novos) avisa, no
 * topo, quando os casos medidos incluem a partição `final`.
 */
export function avisoDeParticaoGuardada(
  rodada: string,
  ids: string[],
  particaoPorId: Map<string, "ajuste" | "final">,
): string | null {
  if (rodada === "final" || rodada.startsWith("fora")) return null;
  if (!ids.some((id) => particaoPorId.get(id) === "final")) return null;
  return "**Atenção: este resultado inclui casos da partição guardada (`final`). Ele serve para medir, nunca para ajustar prompt.**";
}

/** Texto seguro dentro de célula de tabela. */
function celula(s: string): string {
  return s.replace(/\r?\n/g, " / ").replace(/\|/g, "\\|");
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function main() {
  const rodada = argumento("rodada");
  // Sem --particao, cada resultado usa a partição com que foi rodado.
  const particaoPedida = argumento("particao") as "ajuste" | "final" | "todas" | undefined;
  if (!rodada || (particaoPedida !== undefined && !["ajuste", "final", "todas"].includes(particaoPedida))) {
    console.error("Uso: npm run avaliacao:relatorio -- --rodada <nome> [--particao ajuste|final|todas]");
    process.exit(1);
  }
  const pasta = path.join(__dirname, "resultados", rodada);
  if (!fs.existsSync(pasta)) {
    console.error(`rodada sem resultados: ${rodada}`);
    process.exit(1);
  }

  const particaoPorId = construirMapaDeParticao();
  const coincideComExemploPorId = new Map(carregarCasos().map((c) => [c.id, c.coincide_com_exemplo !== undefined]));

  const particoes = new Set<string>();
  const arquivosDeCaso = new Set<string>();
  const idsMedidos: string[] = [];
  const pulados: { modelo: string; pulado: string }[] = [];
  const linhas = [];
  for (const arquivo of fs.readdirSync(pasta).filter((f) => f.endsWith(".json"))) {
    const bruto = JSON.parse(fs.readFileSync(path.join(pasta, arquivo), "utf8")) as ResultadoDoModelo | { modelo: string; pulado: string };
    if ("pulado" in bruto) {
      pulados.push(bruto);
      continue;
    }
    const particao = particaoPedida ?? bruto.particao;
    particoes.add(particao);
    if (bruto.arquivo) arquivosDeCaso.add(bruto.arquivo);
    const noFiltro = (id: string) => particao === "todas" || particaoPorId.get(id) === particao;
    const notas = bruto.notas.filter((n) => noFiltro(n.id));
    const conversas = bruto.conversas.filter((c) => noFiltro(c.id));
    // Sem o filtro de partição de propósito: o que o carimbo denuncia é o ARQUIVO ter rodado a partição guardada.
    idsMedidos.push(...bruto.notas.map((n) => n.id), ...bruto.conversas.map((c) => c.id));
    const metricas = agregar(notas);
    // Poucos casos por intenção numa partição só (a "final" em especial): o limite de 85% olha
    // TODAS as notas do resultado gravado, não o filtro de partição acima do relatório.
    const metricasParaLimite = agregar(bruto.notas);
    const metricasSemExemplo = agregar(notas.filter((n) => !coincideComExemploPorId.get(n.id)));
    const metricasComExemplo = agregar(notas.filter((n) => coincideComExemploPorId.get(n.id)));
    const passos = conversas.flatMap((c) => c.passos);
    const falhas = { mensagens: notas.filter((n) => n.falha).length, passos: passos.filter((p) => p.falha_do_modelo).length };
    const confirmacoesQueNaoGravaram = passos.filter((p) => p.faltou).length;
    const passosQueDevem = passos.filter((p) => p.grava === "deve").length;
    const indevidas = conversas.flatMap((c) => c.passos.map((p, i) => ({ caso: c.id, passo: i + 1, ...p }))).filter((p) => p.indevida);
    const pior = Object.entries(metricas.por_intencao)
      .filter(([, v]) => v.total >= 5)
      .map(([intent, v]) => ({ intent, taxa: v.certos / v.total, total: v.total }))
      .sort((a, b) => a.taxa - b.taxa)[0];
    const aprovacao = aprovar(
      metricas,
      indevidas.length,
      {
        falhas: falhas.passos,
        passos: passos.length,
        confirmacoesSemGravar: confirmacoesQueNaoGravaram,
        passosQueDevem,
      },
      metricasParaLimite.por_intencao,
    );
    // Resultado parcial nunca aprova: os casos que faltaram podiam reprovar.
    if (bruto.interrompido) aprovacao.motivos.push(`interrompido: ${bruto.interrompido}`);
    linhas.push({ r: bruto, notas, metricas, metricasSemExemplo, metricasComExemplo, indevidas, pior, falhas, confirmacoesQueNaoGravaram, passosQueDevem, aprovacao: { aprovado: aprovacao.motivos.length === 0, motivos: aprovacao.motivos } });
  }

  const aviso = avisoDeParticaoGuardada(rodada, idsMedidos, particaoPorId);
  const md: string[] = [
    `# Avaliação do agente: rodada ${rodada}`,
    "",
    ...(aviso ? [aviso, ""] : []),
    `Partição: ${[...particoes].join(", ") || "nenhuma"}.` +
      `${arquivosDeCaso.size > 0 ? ` Casos de ${[...arquivosDeCaso].join(", ")}.` : ""}` +
      ` Gerado em ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "O limite de 85% por intenção usa todas as notas do resultado gravado, não o filtro de partição acima: gravações indevidas, intenção geral e campos seguem a partição pedida.",
    "",
    "`campos` é a coluna do limite de 90%: mede só os pedidos cuja intenção acertou. `campos absoluto` mede na base que inclui os campos perdidos junto com a intenção errada, e é a comparável entre modelos que erram intenção em ritmos diferentes.",
    "",
    "`confirmações que não gravaram` é sinal de defeito de conversa (o gabarito de \"deve\" não é confiável, e o agente às vezes pergunta a fazenda em vez de gravar, o que é certo), não critério de aprovação: a porcentagem informa, mas não reprova.",
    "",
  ];

  md.push(
    "## Modelos",
    "",
    "| modelo | aprovado | gravações indevidas | confirmações que não gravaram (informativo) | falhas do modelo (mensagens / passos) | intenção geral | intenção (sem exemplo) | intenção (exemplo) | pior intenção (5+ casos) | campos | campos absoluto | campos (sem exemplo) | campos (exemplo) | US$ por 1.000 mensagens | p50 | p95 |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  );
  for (const l of linhas) {
    const nome = `${l.r.modelo}${l.r.esforco ? ` (${l.r.esforco})` : ""}${l.r.interrompido ? `, interrompido: ${l.r.interrompido}` : ""}`;
    const taxaConfirmacoes = l.passosQueDevem > 0 ? pct(l.confirmacoesQueNaoGravaram / l.passosQueDevem) : "-";
    md.push(
      `| ${celula(nome)} | ${l.aprovacao.aprovado ? "sim" : "não"} | ${l.indevidas.length} | ${l.confirmacoesQueNaoGravaram} / ${l.passosQueDevem} (${taxaConfirmacoes}) | ${l.falhas.mensagens} / ${l.falhas.passos} | ${pct(l.metricas.intencao_geral)} | ${pct(l.metricasSemExemplo.intencao_geral)} (${l.metricasSemExemplo.mensagens}) | ${pct(l.metricasComExemplo.intencao_geral)} (${l.metricasComExemplo.mensagens}) | ${l.pior ? `${l.pior.intent} ${pct(l.pior.taxa)} (${l.pior.total})` : "nenhuma"} | ${pct(l.metricas.campos)} | ${pct(l.metricas.campos_absoluto)} | ${pct(l.metricasSemExemplo.campos)} | ${pct(l.metricasComExemplo.campos)} | ${l.r.custo_por_mil_mensagens.toFixed(4)} | ${l.r.latencia_p50_ms} ms | ${l.r.latencia_p95_ms} ms |`,
    );
  }
  for (const p of pulados) md.push(`| ${celula(p.modelo)} | pulado: ${celula(p.pulado)} | | | | | | | | | | | | | | |`);

  md.push("", "## Falhas do modelo por detalhe", "");
  const comFalha = linhas.filter((l) => l.notas.some((n) => n.falha));
  if (comFalha.length === 0) md.push("Nenhuma.");
  else {
    for (const l of comFalha) {
      const porDetalhe = new Map<string, number>();
      for (const n of l.notas) {
        if (!n.falha) continue;
        const chave = n.falha_detalhe ?? n.falha;
        porDetalhe.set(chave, (porDetalhe.get(chave) ?? 0) + 1);
      }
      const detalhe = [...porDetalhe.entries()].map(([d, vezes]) => `${celula(d)} (${vezes})`).join(", ");
      md.push(`- ${l.r.modelo}: ${detalhe}`);
    }
  }

  md.push("", "## Gravações indevidas", "");
  const todasIndevidas = linhas.flatMap((l) => l.indevidas.map((p) => ({ modelo: l.r.modelo, ...p })));
  if (todasIndevidas.length === 0) md.push("Nenhuma.");
  else {
    md.push("| modelo | caso | passo | texto | linhas novas (0 = alteração ou remoção) | respostas |", "|---|---|---|---|---|---|");
    for (const p of todasIndevidas) {
      md.push(`| ${p.modelo} | ${p.caso} | ${p.passo} | ${celula(p.texto)} | ${p.linhas_novas} | ${celula(p.respostas.join(" // "))} |`);
    }
  }

  md.push("", "## Erros de intenção mais frequentes", "");
  const erros = new Map<string, { texto: string; esperado: string; obtido: string; vezes: number; modelos: Set<string> }>();
  for (const l of linhas) {
    const contar = (texto: string, esperado: string, obtido: string) => {
      const chave = JSON.stringify([texto, esperado, obtido]);
      const atual = erros.get(chave) ?? { texto, esperado, obtido, vezes: 0, modelos: new Set<string>() };
      atual.vezes += 1;
      atual.modelos.add(l.r.modelo);
      erros.set(chave, atual);
    };
    for (const n of l.notas) {
      // Mesmas intenções, outra ordem: a pontuação conta dois erros (a ordem da mensagem é regra do
      // prompt), mas listar os dois soltos sugere duas confusões de intenção que não existem.
      const esperadosDaNota = n.por_intencao.map((pi) => pi.intent);
      const obtidosDaNota = n.obtidos.map((o) => o.intent);
      const mesmasIntencoes =
        esperadosDaNota.length === obtidosDaNota.length &&
        [...esperadosDaNota].sort().join("|") === [...obtidosDaNota].sort().join("|");
      if (mesmasIntencoes && esperadosDaNota.some((intent, i) => intent !== obtidosDaNota[i])) {
        contar(n.texto, `ordem trocada: ${esperadosDaNota.join(" + ")}`, obtidosDaNota.join(" + "));
        continue;
      }
      n.por_intencao.forEach((pi, i) => {
        if (!pi.certo) contar(n.texto, pi.intent, n.falha ? `falha: ${n.falha}` : (n.obtidos[i]?.intent ?? "(nenhum)"));
      });
      // Pedido a mais (a ação cortada em dois) também derruba a intenção geral.
      for (const extra of n.obtidos.slice(n.por_intencao.length)) contar(n.texto, "(nenhum: pedido a mais)", extra.intent);
    }
  }
  const maisFrequentes = [...erros.values()].sort((a, b) => b.vezes - a.vezes).slice(0, 25);
  if (maisFrequentes.length === 0) md.push("Nenhum.");
  else {
    md.push("| texto | esperado | obtido | vezes | modelos |", "|---|---|---|---|---|");
    for (const e of maisFrequentes) md.push(`| ${celula(e.texto)} | ${e.esperado} | ${celula(e.obtido)} | ${e.vezes} | ${[...e.modelos].join(", ")} |`);
  }

  md.push("", "## Ordem de preferência", "", "Aprovados por custo por 1.000 mensagens, depois p95; os não aprovados vêm depois, com o motivo.", "");
  const aprovados = linhas.filter((l) => l.aprovacao.aprovado).sort((a, b) => a.r.custo_por_mil_mensagens - b.r.custo_por_mil_mensagens || a.r.latencia_p95_ms - b.r.latencia_p95_ms);
  const reprovados = linhas.filter((l) => !l.aprovacao.aprovado);
  [...aprovados, ...reprovados].forEach((l, i) => {
    md.push(`${i + 1}. ${l.r.modelo}${l.aprovacao.aprovado ? "" : `: não aprovado (${l.aprovacao.motivos.join("; ")})`}`);
  });
  for (const p of pulados) md.push(`- ${p.modelo}: pulado (${p.pulado})`);
  md.push("");

  const destino = path.join(__dirname, "..", "..", "docs", "agents", "agente-whatsapp", `avaliacao-${rodada}.md`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, md.join("\n"));
  console.log(`Relatório: ${path.relative(process.cwd(), destino)}`);
}

// Só como CLI: a m69 importa `avisoDeParticaoGuardada` daqui, e importar não pode gerar relatório.
if (require.main === module) main();
