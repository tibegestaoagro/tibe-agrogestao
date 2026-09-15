import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buscarIntencao, INTENCOES_FORA_DO_CLASSIFICADOR, type CampoDef } from "@/lib/agente/intencoes";
import { AUTORES, type Autor, type Caso, type CoincideComExemplo, type Gravacao } from "./tipos";

const GRAVACOES: readonly Gravacao[] = ["nao", "pode", "deve"];
const COINCIDENCIAS: readonly CoincideComExemplo[] = ["literal", "molde"];

function comoRegistro(x: unknown): Record<string, unknown> | null {
  return x !== null && typeof x === "object" ? (x as Record<string, unknown>) : null;
}

function validarPedido(rotulo: string, bruto: unknown): string[] {
  const p = comoRegistro(bruto);
  if (!p || typeof p.intent !== "string") return [`${rotulo}: pedido sem intent`];
  const intent = p.intent;

  // "ambigua" não tem extração (sai pronta da etapa de domínio): não declara campos.
  if (intent === "ambigua") return [];

  if ((INTENCOES_FORA_DO_CLASSIFICADOR as readonly string[]).includes(intent)) {
    return [`${rotulo}: intenção fora do classificador: ${intent}`];
  }

  const def = buscarIntencao(intent);
  if (!def) return [`${rotulo}: intenção desconhecida: ${intent}`];

  const erros: string[] = [];
  const campos = comoRegistro(p.campos) ?? {};
  for (const nome of Object.keys(campos)) {
    const campoDef = def.campos.find((c) => c.nome === nome);
    if (!campoDef) {
      erros.push(`${rotulo}: ${intent} não declara o campo: ${nome}`);
      continue;
    }
    if (campoDef.tipo === "lista" && campoDef.itens) {
      erros.push(...validarSubchavesDaLista(rotulo, intent, nome, campoDef, campos[nome]));
    }
  }
  return erros;
}

function validarSubchavesDaLista(rotulo: string, intent: string, nome: string, campoDef: CampoDef, valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const erros: string[] = [];
  for (const item of valor) {
    const itemReg = comoRegistro(item) ?? {};
    for (const chave of Object.keys(itemReg)) {
      if (!campoDef.itens!.some((sub) => sub.nome === chave)) {
        erros.push(`${rotulo}: ${intent}.${nome} não declara a subchave: ${chave}`);
      }
    }
  }
  return erros;
}

/** Lista de erros legíveis, vazia se todos os casos são válidos. */
export function validarCasos(casos: unknown[]): string[] {
  const erros: string[] = [];
  const idsVistos = new Set<string>();

  casos.forEach((bruto, indice) => {
    const c = comoRegistro(bruto);
    const rotulo = typeof c?.id === "string" ? c.id : `#${indice}`;

    if (!c) {
      erros.push(`${rotulo}: caso inválido`);
      return;
    }

    if (typeof c.id !== "string" || !/^[a-z0-9-]+$/.test(c.id)) {
      erros.push(`${rotulo}: id inválido: ${String(c.id)}`);
    } else if (idsVistos.has(c.id)) {
      erros.push(`${c.id}: id repetido`);
    } else {
      idsVistos.add(c.id);
    }

    if (!AUTORES.includes(c.autor as Autor)) {
      erros.push(`${rotulo}: autor inválido: ${String(c.autor)}`);
    }

    if (c.coincide_com_exemplo !== undefined && !COINCIDENCIAS.includes(c.coincide_com_exemplo as CoincideComExemplo)) {
      erros.push(`${rotulo}: coincide_com_exemplo inválido: ${String(c.coincide_com_exemplo)}`);
    }

    if (c.tipo === "mensagem") {
      if (typeof c.texto !== "string" || c.texto === "") erros.push(`${rotulo}: mensagem sem texto`);
      if (!Array.isArray(c.esperado) || c.esperado.length === 0) {
        erros.push(`${rotulo}: mensagem sem esperado`);
      } else {
        for (const pedido of c.esperado) erros.push(...validarPedido(rotulo, pedido));
      }
    } else if (c.tipo === "conversa") {
      if (!Array.isArray(c.passos) || c.passos.length < 2) {
        erros.push(`${rotulo}: conversa com menos de 2 passos`);
      } else {
        for (const passo of c.passos) {
          const p = comoRegistro(passo);
          if (!p || !GRAVACOES.includes(p.grava as Gravacao)) {
            erros.push(`${rotulo}: grava inválido: ${String(p?.grava)}`);
          }
        }
      }
    } else {
      erros.push(`${rotulo}: tipo inválido: ${String(c.tipo)}`);
    }
  });

  return erros;
}

const PASTA_PADRAO = path.join(__dirname, "casos");

/** Lê todo `casos/*.json` (cada arquivo é um array de `Caso`). */
export function carregarCasos(pasta: string = PASTA_PADRAO): Caso[] {
  if (!fs.existsSync(pasta)) return [];
  const casos: Caso[] = [];
  for (const arquivo of fs.readdirSync(pasta).filter((f) => f.endsWith(".json"))) {
    let conteudo: unknown;
    try {
      conteudo = JSON.parse(fs.readFileSync(path.join(pasta, arquivo), "utf8"));
    } catch (e) {
      throw new Error(`${arquivo}: JSON inválido (${e instanceof Error ? e.message : String(e)})`);
    }
    if (Array.isArray(conteudo)) casos.push(...(conteudo as Caso[]));
  }
  return casos;
}

/** Partição estável por hash: ~70% "ajuste", ~30% "final". */
export function particao(id: string): "ajuste" | "final" {
  const primeiroByte = createHash("sha1").update(id).digest()[0];
  return primeiroByte < 179 ? "ajuste" : "final";
}

/**
 * Partição de um caso: quem coincide com exemplo do registro nunca entra na
 * "final" (mediria o modelo decorando o próprio prompt), então fica sempre em
 * "ajuste"; os demais seguem o hash de `particao`.
 */
export function particaoDoCaso(caso: Caso): "ajuste" | "final" {
  return caso.coincide_com_exemplo ? "ajuste" : particao(caso.id);
}

export function coberturaPorIntencao(casos: Caso[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const caso of casos) {
    if (caso.tipo !== "mensagem") continue;
    for (const pedido of caso.esperado) {
      mapa.set(pedido.intent, (mapa.get(pedido.intent) ?? 0) + 1);
    }
  }
  return mapa;
}
