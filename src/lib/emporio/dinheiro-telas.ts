import type { ContaAPagarView } from "@/lib/actions/emporio-despesas";

/**
 * Regras puras das telas do Dinheiro (onda 4 da UX do Empório): abas vindas da
 * URL, fatia de página, busca do Fiado, endereços antigos e grupo de comissões.
 * Sem React e sem servidor, para a suíte rodar sem banco.
 */

export type AbaDoPagar = "contas" | "fixas" | "vendeu_pagou";
export function abaDoPagar(aba?: string): AbaDoPagar {
  return aba === "fixas" || aba === "vendeu_pagou" ? aba : "contas";
}

export type AbaDoReceber = "fiado" | "cheques" | "boletos" | "cartoes" | "vencidos";
const ABAS_DO_RECEBER: readonly string[] = ["fiado", "cheques", "boletos", "cartoes", "vencidos"];
/** O link "Ver os cheques" do Hoje (`?cheques=a_completar`) vale mais que a aba. */
export function abaDoReceber(aba?: string, cheques?: string): AbaDoReceber {
  if (cheques === "a_completar") return "cheques";
  return aba && ABAS_DO_RECEBER.includes(aba) ? (aba as AbaDoReceber) : "fiado";
}

export type AbaDoEstoque = "repor" | "tudo";
export function abaDoEstoque(aba?: string): AbaDoEstoque {
  return aba === "tudo" ? "tudo" : "repor";
}

export function fatiarPagina<T>(
  itens: T[],
  pagina: number,
  porPagina: number,
): { linhas: T[]; pagina: number; total: number } {
  const total = itens.length;
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  const atual = Math.min(Math.max(1, Math.floor(Number.isFinite(pagina) ? pagina : 1)), ultima);
  return { linhas: itens.slice((atual - 1) * porPagina, atual * porPagina), pagina: atual, total };
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
const soDigitos = (s: string | null) => (s ?? "").replace(/\D/g, "");

export function clienteBateComABusca(
  c: { customer_name: string; phone: string | null; document: string | null },
  termo: string,
): boolean {
  const t = normalizar(termo);
  if (t === "") return true;
  if (normalizar(c.customer_name).includes(t)) return true;
  const digitos = soDigitos(termo);
  if (digitos.length < 3) return false;
  return soDigitos(c.phone).includes(digitos) || soDigitos(c.document).includes(digitos);
}

export type EnderecoAntigo = "/emporio/despesas" | "/emporio/financeiro/cobranca" | "/emporio/financeiro/caixa";

function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function enderecoDaTelaNova(
  antigo: EnderecoAntigo,
  params: Record<string, string | string[] | undefined>,
): string {
  const q = new URLSearchParams();
  let caminho: string;
  let levar: string[];
  if (antigo === "/emporio/despesas") {
    caminho = "/emporio/financeiro/pagar";
    q.set("aba", "fixas");
    levar = [];
  } else if (antigo === "/emporio/financeiro/cobranca") {
    caminho = "/emporio/financeiro/receber";
    q.set("aba", "vencidos");
    levar = ["loja", "faixa"];
  } else {
    caminho = "/emporio/caixa";
    levar = ["loja", "lugar", "de", "ate", "carimbo"];
  }
  for (const k of levar) {
    const v = primeiro(params[k]);
    if (v !== undefined && v !== "") q.set(k, v);
  }
  if (antigo === "/emporio/financeiro/caixa") {
    const conta = primeiro(params.conta);
    if (conta && !q.has("lugar")) q.set("lugar", `conta:${conta}`);
  }
  const qs = q.toString();
  return qs ? `${caminho}?${qs}` : caminho;
}

export type LinhaDoPagar =
  | { tipo: "conta"; conta: ContaAPagarView }
  | {
      tipo: "grupo";
      chave: string;
      nome: string;
      loja: string | null;
      due_date: string | null;
      contas: ContaAPagarView[];
      total: number;
    };

/**
 * Comissões do "Vendeu, Pagou" com o mesmo nome, loja e vencimento, quando
 * são duas ou mais, viram uma linha. O grupo fica onde estava a primeira.
 */
export function agruparContas(contas: ContaAPagarView[]): LinhaDoPagar[] {
  const chaveDe = (c: ContaAPagarView) => `vendeu_pagou|${c.name}|${c.establishment_id}|${c.due_date}`;
  const porChave = new Map<string, ContaAPagarView[]>();
  for (const c of contas) {
    if (c.origin !== "vendeu_pagou") continue;
    const k = chaveDe(c);
    porChave.set(k, [...(porChave.get(k) ?? []), c]);
  }
  const saida: LinhaDoPagar[] = [];
  const jaFeitos = new Set<string>();
  for (const c of contas) {
    const k = c.origin === "vendeu_pagou" ? chaveDe(c) : null;
    const grupo = k ? porChave.get(k) : undefined;
    if (!k || !grupo || grupo.length < 2) {
      saida.push({ tipo: "conta", conta: c });
      continue;
    }
    if (jaFeitos.has(k)) continue;
    jaFeitos.add(k);
    const centavos = grupo.reduce((s, x) => s + Math.round(x.open_amount * 100), 0);
    saida.push({
      tipo: "grupo",
      chave: k,
      nome: c.name,
      loja: c.establishment_id,
      due_date: c.due_date,
      contas: grupo,
      total: centavos / 100,
    });
  }
  return saida;
}
