import { buscarIntencao, type CampoDef } from "@/lib/agente/intencoes";
import { lerNumeroBr } from "@/lib/numero-br";
import { interpretarData } from "@/lib/actions/whatsapp-handlers/parsers";
import { normalizarTermo } from "@/lib/actions/whatsapp-handlers/shared";
import { conferirTrechoLiteral } from "@/lib/agente/trecho-literal";
import type { CasoMensagem, ValorEsperado } from "./tipos";

export type PedidoObtido = { intent: string; parameters: Record<string, unknown> };

/**
 * `campos_total_absoluto`: a mesma base de `campos_total` mais os campos esperados dos pedidos cuja
 * INTENÇÃO errou (que hoje não são medidos em lugar nenhum). Sem ele, quem erra mais intenção é
 * medido numa base menor, e a nota de campos sobe justamente por errar antes.
 */
export type NotaDeMensagem = {
  id: string;
  pedidos_certos: number;
  pedidos_total: number;
  por_intencao: { intent: string; certo: boolean }[];
  campos_certos: number;
  campos_total: number;
  campos_total_absoluto: number;
  erros: string[];
};

function comoRegistro(x: unknown): Record<string, unknown> {
  return x !== null && typeof x === "object" ? (x as Record<string, unknown>) : {};
}

function paraBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = normalizarTermo(v);
    if (t === "sim") return true;
    if (t === "nao") return false;
  }
  return null;
}

/**
 * Quando nenhum dos dois lados é legível por `interpretarData` ("quinta" x
 * "quinta-feira"), cai em inclusão de texto em vez de igualdade exata: um
 * dos dois costuma ser a forma mais completa da mesma fala. Quando só um
 * lado é legível ("dia 20" x "quinta"), os dois falam de coisas diferentes
 * até prova em contrário, e o campo erra.
 */
function mesmoDiaCivil(hoje: Date, esperado: unknown, obtido: unknown): boolean {
  const dEsperado = interpretarData(String(esperado), hoje);
  const dObtido = interpretarData(String(obtido), hoje);
  if (!dEsperado && !dObtido) {
    const a = normalizarTermo(String(esperado));
    if (a === "") return false;
    const b = normalizarTermo(String(obtido));
    return a.includes(b) || b.includes(a);
  }
  if (!dEsperado || !dObtido) return false;
  return (
    dEsperado.getFullYear() === dObtido.getFullYear() &&
    dEsperado.getMonth() === dObtido.getMonth() &&
    dEsperado.getDate() === dObtido.getDate()
  );
}

/**
 * Plural simples de uma palavra normalizada (>= 4 letras): "es" depois de
 * r/z/l vira o singular sem o "es" ("professores" -> "professor"); "s" no
 * fim vira o singular sem o "s" ("bezerros" -> "bezerro"). Existe porque a
 * inclusão de texto só casa plural no FIM da frase por acaso (substring); no
 * meio ("fêmeas de 13 a 24 meses" x "fêmea de 13 a 24 meses") não casava.
 *
 * ponytail: plural ingênuo, de propósito. Invariável ("lápis") perde o "s" e
 * irregular ("animais" x "animal") não casa; nos termos que a avaliação usa
 * (categoria de animal, produto, serviço) isso não aparece. Se aparecer, o
 * caminho é uma lista de exceções, não um lematizador.
 */
function singularizarPalavra(palavra: string): string {
  if (palavra.length < 4) return palavra;
  if (/[rzl]es$/.test(palavra)) return palavra.slice(0, -2);
  if (palavra.endsWith("s")) return palavra.slice(0, -1);
  return palavra;
}

function normalizarParaTexto(valor: unknown): string {
  return normalizarTermo(String(valor)).split(" ").filter(Boolean).map(singularizarPalavra).join(" ");
}

export function compararCampo(campo: CampoDef, esperado: ValorEsperado, obtido: unknown, hoje: Date): boolean {
  if (obtido === undefined || obtido === null) return false;

  switch (campo.tipo) {
    case "numero": {
      const nEsperado = lerNumeroBr(esperado);
      const nObtido = lerNumeroBr(obtido);
      return nEsperado !== null && nObtido !== null && nEsperado === nObtido;
    }
    case "data":
      return mesmoDiaCivil(hoje, esperado, obtido);
    case "sim_nao":
      return paraBool(esperado) === paraBool(obtido);
    case "lista": {
      if (!Array.isArray(esperado) || !Array.isArray(obtido) || esperado.length !== obtido.length) return false;
      if (!campo.itens) return false;
      for (let i = 0; i < esperado.length; i++) {
        const itemEsperado = comoRegistro(esperado[i]) as Record<string, ValorEsperado>;
        const itemObtido = comoRegistro(obtido[i]);
        for (const chave of Object.keys(itemEsperado)) {
          const subcampo = campo.itens.find((c) => c.nome === chave);
          if (!subcampo || !compararCampo(subcampo, itemEsperado[chave], itemObtido[chave], hoje)) return false;
        }
      }
      return true;
    }
    case "texto":
    default: {
      const a = normalizarParaTexto(esperado);
      if (a === "") return false;
      const b = normalizarParaTexto(obtido);
      return a.includes(b) || b.includes(a);
    }
  }
}

export function pontuarMensagem(caso: CasoMensagem, obtidos: PedidoObtido[], hoje: Date): NotaDeMensagem {
  const esperados = caso.esperado;
  const por_intencao: { intent: string; certo: boolean }[] = [];
  const erros: string[] = [];
  let pedidos_certos = 0;
  let campos_certos = 0;
  let campos_total = 0;
  let campos_de_intencao_errada = 0;

  for (let i = 0; i < esperados.length; i++) {
    const esperado = esperados[i];
    const obtido = obtidos[i];
    const certo = obtido !== undefined && obtido.intent === esperado.intent;
    por_intencao.push({ intent: esperado.intent, certo });
    if (certo) pedidos_certos += 1;
    if (!certo) {
      // Intenção errada leva os campos dela junto: nenhum foi extraído certo, e a base absoluta conta isso.
      campos_de_intencao_errada += Object.keys(esperado.campos ?? {}).length;
      continue;
    }

    const def = buscarIntencao(esperado.intent);
    if (!def) continue;

    const camposEsperados = esperado.campos ?? {};
    const parametros = obtido.parameters ?? {};
    // Número extra só é "inventado" quando não aparece de fato na mensagem, em dígito ou por
    // extenso, inclusive composto ("cento e trinta mil"); um número dito e não pedido no
    // gabarito não é erro do modelo.
    // ponytail: a conferência lê a MENSAGEM INTEIRA, então número inventado que por acaso é
    // igual a outro número dito na mesma mensagem passa batido. Pegar isso exigiria casar cada
    // campo com o trecho dele, e o trecho que o modelo devolve nem sempre é literal.
    const { removidos: numerosSemLastro } = conferirTrechoLiteral(parametros, caso.texto, def.campos);
    const inventado = new Set(numerosSemLastro);

    for (const nome of Object.keys(camposEsperados)) {
      const campoDef = def.campos.find((c) => c.nome === nome);
      if (!campoDef) continue;
      campos_total += 1;
      if (compararCampo(campoDef, camposEsperados[nome], parametros[nome], hoje)) campos_certos += 1;

      if (campoDef.tipo === "lista" && campoDef.itens && Array.isArray(parametros[nome])) {
        const itensEsperados = Array.isArray(camposEsperados[nome]) ? (camposEsperados[nome] as Record<string, ValorEsperado>[]) : [];
        const itensObtidos = parametros[nome] as Record<string, unknown>[];
        for (let j = 0; j < itensObtidos.length; j++) {
          const itemEsperado = itensEsperados[j] ?? {};
          for (const subNome of Object.keys(itensObtidos[j] ?? {})) {
            if (subNome in itemEsperado) continue;
            const subDef = campoDef.itens.find((s) => s.nome === subNome);
            if (subDef?.tipo !== "numero") continue;
            const caminho = `${nome}.${subNome}`;
            if (!inventado.has(caminho)) continue;
            campos_total += 1;
            erros.push(`número inventado: ${caminho}`);
          }
        }
      }
    }

    for (const nome of Object.keys(parametros)) {
      if (nome in camposEsperados) continue;
      const campoDef = def.campos.find((c) => c.nome === nome);
      if (campoDef?.tipo !== "numero") continue;
      if (!inventado.has(nome)) continue;
      campos_total += 1;
      erros.push(`número inventado: ${nome}`);
    }
  }

  for (let i = esperados.length; i < obtidos.length; i++) erros.push(`pedido a mais: ${obtidos[i].intent}`);
  for (let i = obtidos.length; i < esperados.length; i++) erros.push(`pedido a menos: ${esperados[i].intent}`);

  return {
    id: caso.id,
    pedidos_certos,
    pedidos_total: Math.max(esperados.length, obtidos.length),
    por_intencao,
    campos_certos,
    campos_total,
    campos_total_absoluto: campos_total + campos_de_intencao_errada,
    erros,
  };
}

/** `campos`: a nota que o limite de 90% usa, medida só nos pedidos com intenção certa. `campos_absoluto`: a mesma nota na base que inclui os campos perdidos junto com a intenção. */
export type Metricas = {
  intencao_geral: number;
  por_intencao: Record<string, { certos: number; total: number }>;
  campos: number;
  campos_absoluto: number;
  mensagens: number;
};

export function agregar(notas: NotaDeMensagem[]): Metricas {
  let pedidosCertos = 0;
  let pedidosTotal = 0;
  let camposCertos = 0;
  let camposTotal = 0;
  let camposTotalAbsoluto = 0;
  const porIntencao: Record<string, { certos: number; total: number }> = {};

  for (const nota of notas) {
    pedidosCertos += nota.pedidos_certos;
    pedidosTotal += nota.pedidos_total;
    camposCertos += nota.campos_certos;
    camposTotal += nota.campos_total;
    camposTotalAbsoluto += nota.campos_total_absoluto;
    for (const { intent, certo } of nota.por_intencao) {
      const atual = porIntencao[intent] ?? { certos: 0, total: 0 };
      atual.total += 1;
      if (certo) atual.certos += 1;
      porIntencao[intent] = atual;
    }
  }

  return {
    intencao_geral: pedidosTotal === 0 ? 0 : pedidosCertos / pedidosTotal,
    por_intencao: porIntencao,
    campos: camposTotal === 0 ? 1 : camposCertos / camposTotal,
    campos_absoluto: camposTotalAbsoluto === 0 ? 1 : camposCertos / camposTotalAbsoluto,
    mensagens: notas.length,
  };
}

/**
 * `falhas`: passos de conversa que responderam com a frase de falha; sem isso, falhar em tudo
 * passaria pelo eliminatório de gravação. `confirmacoesSemGravar` sobre `passosQueDevem` é o outro
 * lado da gravação indevida: o modelo que nunca escreve não erra por excesso, mas também não serve;
 * sem esses dois, o comportamento é o de antes. `porIntencaoParaLimite`: base do limite de 85% por
 * intenção, default `m.por_intencao`; o relatório passa a base de TODAS as partições, porque a
 * partição final sozinha deixa intenção com poucos casos (o gate de "total >= 5" some, ou vira
 * sorte de amostra pequena).
 */
export function aprovar(
  m: Metricas,
  gravacoesIndevidas: number,
  falhas?: { falhas: number; passos: number; confirmacoesSemGravar?: number; passosQueDevem?: number },
  porIntencaoParaLimite?: Metricas["por_intencao"],
): { aprovado: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (falhas && falhas.passos > 0 && falhas.falhas / falhas.passos > 0.02) {
    motivos.push(`falhas do modelo ${((falhas.falhas / falhas.passos) * 100).toFixed(1)}% > 2%`);
  }
  if (falhas?.confirmacoesSemGravar !== undefined && (falhas.passosQueDevem ?? 0) > 0) {
    const taxa = falhas.confirmacoesSemGravar / falhas.passosQueDevem!;
    if (taxa > 0.1) motivos.push(`confirmações que não gravaram ${(taxa * 100).toFixed(1)}% > 10%`);
  }
  if (m.mensagens === 0) motivos.push("sem mensagens");
  if (gravacoesIndevidas > 0) motivos.push(`gravações indevidas: ${gravacoesIndevidas}`);
  if (m.intencao_geral < 0.95) motivos.push(`intenção geral ${Math.round(m.intencao_geral * 100)}% < 95%`);
  for (const [intent, { certos, total }] of Object.entries(porIntencaoParaLimite ?? m.por_intencao)) {
    if (total >= 5 && certos / total < 0.85) {
      motivos.push(`${intent} ${Math.round((certos / total) * 100)}% < 85% (${total} casos)`);
    }
  }
  if (m.campos < 0.9) motivos.push(`campos ${Math.round(m.campos * 100)}% < 90%`);
  return { aprovado: motivos.length === 0, motivos };
}
