import { buscarIntencao, type CampoDef } from "@/lib/agente/intencoes";
import { lerNumeroBr } from "@/lib/numero-br";
import { interpretarData } from "@/lib/actions/whatsapp-handlers/parsers";
import { normalizarTermo } from "@/lib/actions/whatsapp-handlers/shared";
import type { CasoMensagem, ValorEsperado } from "./tipos";

export type PedidoObtido = { intent: string; parameters: Record<string, unknown> };

export type NotaDeMensagem = {
  id: string;
  pedidos_certos: number;
  pedidos_total: number;
  por_intencao: { intent: string; certo: boolean }[];
  campos_certos: number;
  campos_total: number;
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

function mesmoDiaCivil(hoje: Date, esperado: unknown, obtido: unknown): boolean {
  const dEsperado = interpretarData(String(esperado), hoje);
  if (!dEsperado) return normalizarTermo(String(esperado)) === normalizarTermo(String(obtido));
  const dObtido = interpretarData(String(obtido), hoje);
  if (!dObtido) return false;
  return (
    dEsperado.getFullYear() === dObtido.getFullYear() &&
    dEsperado.getMonth() === dObtido.getMonth() &&
    dEsperado.getDate() === dObtido.getDate()
  );
}

export function compararCampo(campo: CampoDef, esperado: ValorEsperado, obtido: unknown, hoje: Date): boolean {
  if (obtido === undefined || obtido === null) return false;

  switch (campo.tipo) {
    case "numero":
      return lerNumeroBr(esperado) === lerNumeroBr(obtido);
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
      const a = normalizarTermo(String(esperado));
      const b = normalizarTermo(String(obtido));
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

  for (let i = 0; i < esperados.length; i++) {
    const esperado = esperados[i];
    const obtido = obtidos[i];
    const certo = obtido !== undefined && obtido.intent === esperado.intent;
    por_intencao.push({ intent: esperado.intent, certo });
    if (certo) pedidos_certos += 1;
    if (!certo) continue;

    const def = buscarIntencao(esperado.intent);
    if (!def) continue;

    const camposEsperados = esperado.campos ?? {};
    const parametros = obtido.parameters ?? {};

    for (const nome of Object.keys(camposEsperados)) {
      const campoDef = def.campos.find((c) => c.nome === nome);
      if (!campoDef) continue;
      campos_total += 1;
      if (compararCampo(campoDef, camposEsperados[nome], parametros[nome], hoje)) campos_certos += 1;
    }

    for (const nome of Object.keys(parametros)) {
      if (nome in camposEsperados) continue;
      const campoDef = def.campos.find((c) => c.nome === nome);
      if (campoDef?.tipo === "numero") {
        campos_total += 1;
        erros.push(`número inventado: ${nome}`);
      }
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
    erros,
  };
}

export type Metricas = {
  intencao_geral: number;
  por_intencao: Record<string, { certos: number; total: number }>;
  campos: number;
  mensagens: number;
};

export function agregar(notas: NotaDeMensagem[]): Metricas {
  let pedidosCertos = 0;
  let pedidosTotal = 0;
  let camposCertos = 0;
  let camposTotal = 0;
  const porIntencao: Record<string, { certos: number; total: number }> = {};

  for (const nota of notas) {
    pedidosCertos += nota.pedidos_certos;
    pedidosTotal += nota.pedidos_total;
    camposCertos += nota.campos_certos;
    camposTotal += nota.campos_total;
    for (const { intent, certo } of nota.por_intencao) {
      const atual = porIntencao[intent] ?? { certos: 0, total: 0 };
      atual.total += 1;
      if (certo) atual.certos += 1;
      porIntencao[intent] = atual;
    }
  }

  return {
    intencao_geral: pedidosCertos / pedidosTotal,
    por_intencao: porIntencao,
    campos: camposTotal === 0 ? 1 : camposCertos / camposTotal,
    mensagens: notas.length,
  };
}

export function aprovar(m: Metricas, gravacoesIndevidas: number): { aprovado: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (gravacoesIndevidas > 0) motivos.push(`gravações indevidas: ${gravacoesIndevidas}`);
  if (m.intencao_geral < 0.95) motivos.push(`intenção geral ${Math.round(m.intencao_geral * 100)}% < 95%`);
  for (const [intent, { certos, total }] of Object.entries(m.por_intencao)) {
    if (total >= 5 && certos / total < 0.85) {
      motivos.push(`${intent} ${Math.round((certos / total) * 100)}% < 85% (${total} casos)`);
    }
  }
  if (m.campos < 0.9) motivos.push(`campos ${Math.round(m.campos * 100)}% < 90%`);
  return { aprovado: motivos.length === 0, motivos };
}
