import { ehDataCalendario, somarDiasCalendario } from "@/lib/dia-calendario";
import { atalhosDePeriodo } from "@/lib/emporio/periodo";
import { variacaoDoMes } from "@/lib/emporio/inicio";
import { lerMes, textoDoMes, ultimoDia } from "@/lib/emporio/mes";

/**
 * Meu Empório, UX onda 5: as regras pequenas da tela Estatísticas.
 *
 * Puro, sem banco: o período da tela, o mês anterior, o texto da comparação, a aba da URL, o endereço
 * novo de cada endereço antigo, o dia do ponto de equilíbrio e a soma dos resultados das lojas.
 * `hoje` é a meia-noite UTC do dia de Brasília (`hojeEmBrasilia`), como nas outras regras de período.
 */

const DIA_MS = 86_400_000;
const MAX_DIAS = 366;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export type AbaDaEstatistica = "geral" | "vendas" | "dinheiro" | "resultado" | "imprimir";

/** A aba da URL; valor desconhecido, ou Dinheiro sem permissão, cai na Visão geral. */
export function abaDaEstatistica(v: string | undefined, podeDinheiro: boolean): AbaDaEstatistica {
  if (v === "vendas" || v === "resultado" || v === "imprimir") return v;
  if (v === "dinheiro" && podeDinheiro) return "dinheiro";
  return "geral";
}

export type PeriodoDasEstatisticas = { de: string; ate: string; invalido: boolean };

/**
 * O período da tela: `de` e `ate` da URL. Sem nenhum dos dois, Este mês. Com algum que não vale
 * (data que não existe, `de` depois de `ate`, mais de 366 dias, um só dos dois), volta a Este mês
 * com `invalido: true`, para a tela avisar em vez de o relatório recusar com 422.
 */
export function periodoDasEstatisticas(sp: { de?: string; ate?: string }, hoje: Date): PeriodoDasEstatisticas {
  const { de, ate } = sp ?? {};
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  const esteMes = { de: iso(new Date(Date.UTC(ano, mes, 1))), ate: iso(new Date(Date.UTC(ano, mes + 1, 0))) };
  if (!de && !ate) return { ...esteMes, invalido: false };
  if (ehDataCalendario(de) && ehDataCalendario(ate) && de <= ate) {
    const dias = (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS + 1;
    if (dias <= MAX_DIAS) return { de, ate, invalido: false };
  }
  return { ...esteMes, invalido: true };
}

/** Hoje, 7 dias (de hoje menos 6 a hoje), Este mês e Mês passado. */
export function atalhosDasEstatisticas(
  hoje: Date,
): { id: "hoje" | "7dias" | "mes" | "mes_passado"; rotulo: string; de: string; ate: string }[] {
  const base = atalhosDePeriodo(hoje);
  const pega = (id: string) => base.find((a) => a.id === id) as (typeof base)[number];
  const h = pega("hoje");
  const mes = pega("mes");
  const passado = pega("mes_passado");
  return [
    { id: "hoje", rotulo: "Hoje", de: h.de, ate: h.ate },
    { id: "7dias", rotulo: "7 dias", de: somarDiasCalendario(h.ate, -6), ate: h.ate },
    { id: "mes", rotulo: "Este mês", de: mes.de, ate: mes.ate },
    { id: "mes_passado", rotulo: "Mês passado", de: passado.de, ate: passado.ate },
  ];
}

/** O mesmo dia do mês anterior; o dia que não existe lá (31/03) vira o último do mês (28 ou 29/02). */
function umMesAntes(dia: string): string {
  const ano = Number(dia.slice(0, 4));
  const mes = Number(dia.slice(5, 7));
  const d = Number(dia.slice(8, 10));
  const alvo = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const ultimo = ultimoDia(alvo).getUTCDate();
  return `${textoDoMes(alvo)}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/** O mesmo trecho do mês anterior: cada ponta recua um mês, presa ao último dia do mês de lá. */
export function periodoDoMesAnterior(de: string, ate: string): { de: string; ate: string } {
  return { de: umMesAntes(de), ate: umMesAntes(ate) };
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * "8% acima de outubro, no mesmo período", "10% abaixo de outubro, no mesmo período",
 * "Igual a outubro, no mesmo período" ou "Sem vendas em outubro, no mesmo período". Se o trecho anterior
 * atravessa dois meses, o nome do mês vira "o mês anterior" (com a contração: "do", "ao", "no").
 */
export function textoDaComparacao(atualCent: number, anteriorCent: number, deAnterior: string, ateAnterior: string): string {
  const mesmoMes = deAnterior.slice(0, 7) === ateAnterior.slice(0, 7);
  const nome = MESES[Number(deAnterior.slice(5, 7)) - 1] ?? "";
  const de = mesmoMes ? `de ${nome}` : "do mês anterior";
  const a = mesmoMes ? `a ${nome}` : "ao mês anterior";
  const em = mesmoMes ? `em ${nome}` : "no mês anterior";
  const variacao = variacaoDoMes(atualCent, anteriorCent);
  if (variacao === null) return `Sem vendas ${em}, no mesmo período`;
  if (variacao === 0) return `Igual ${a}, no mesmo período`;
  return `${Math.abs(variacao)}% ${variacao > 0 ? "acima" : "abaixo"} ${de}, no mesmo período`;
}

/** O mês ("AAAA-MM") do resultado: o da data final do período. */
export function mesDoPeriodo(ate: string): string {
  return ate.slice(0, 7);
}

export function periodoPegaMaisDeUmMes(de: string, ate: string): boolean {
  return de.slice(0, 7) !== ate.slice(0, 7);
}

/** O dia do mês (1 a 31) em que o acumulado alcançou o ponto de equilíbrio; nulo sem ponto ou sem dia que chegue. */
export function diaDoEquilibrio(dias: { date: string; cumulative: number | null }[], ponto: number | null): number | null {
  if (ponto === null) return null;
  const d = dias.find((x) => x.cumulative !== null && x.cumulative >= ponto);
  return d ? Number(d.date.slice(8, 10)) : null;
}

type Resultado = { sales: number; margin: number; fixed_expenses: number; losses: number; result: number };

const emReais = (n: number) => Math.round(n * 100) / 100;

/** A soma dos resultados das lojas; a margem % é a margem total sobre as vendas totais, com 1 casa. */
export function somarResultados(lojas: Resultado[]): Resultado & { margin_pct: number | null } {
  const soma = (f: (l: Resultado) => number) => emReais(lojas.reduce((s, l) => s + Math.round(f(l) * 100), 0) / 100);
  const sales = soma((l) => l.sales);
  const margin = soma((l) => l.margin);
  return {
    sales,
    margin,
    margin_pct: sales > 0 ? Math.round((margin / sales) * 1000) / 10 : null,
    fixed_expenses: soma((l) => l.fixed_expenses),
    losses: soma((l) => l.losses),
    result: soma((l) => l.result),
  };
}

type Antigo = "/emporio/relatorios" | "/emporio/resultado" | "/emporio/financeiro/relatorios" | "/emporio/financeiro/projecao";

/** O endereço novo de cada tela que virou aba das Estatísticas, mantendo só os parâmetros que valem. */
export function enderecoDaEstatistica(antigo: Antigo, sp: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  const copia = (chaves: string[]) => {
    for (const k of chaves) if (sp[k]) p.set(k, sp[k] as string);
  };
  if (antigo === "/emporio/relatorios") {
    p.set("aba", "vendas");
    copia(["de", "ate", "loja", "abc", "medida"]);
  } else if (antigo === "/emporio/resultado") {
    p.set("aba", "resultado");
    const mes = lerMes(sp.mes);
    if (mes) {
      p.set("de", `${textoDoMes(mes)}-01`);
      p.set("ate", iso(ultimoDia(mes)));
    }
    if (sp.loja && sp.loja !== "all") p.set("loja", sp.loja);
  } else if (antigo === "/emporio/financeiro/relatorios") {
    p.set("aba", "dinheiro");
    copia(["loja", "de", "ate"]);
  } else {
    p.set("aba", "dinheiro");
    copia(["loja", "dias"]);
  }
  return `/emporio/estatisticas?${p.toString()}`;
}
