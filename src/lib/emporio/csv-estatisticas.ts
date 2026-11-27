import { gerarCsv, type ColunaCsv } from "@/lib/csv";
import type { CurvaAbc, RelatorioDeVendas } from "@/lib/actions/emporio-relatorios";
import type { ResultadoPorLojaView } from "@/lib/actions/emporio-resultado";

/** As planilhas das Estatísticas (onda 5): só montam linhas do que a action já devolveu. */

export function csvDosVendedores(r: RelatorioDeVendas): string {
  const colunas: ColunaCsv<RelatorioDeVendas["por_vendedor"][number]>[] = [
    { titulo: "Vendedor", valor: (v) => v.name },
    { titulo: "Vendas", valor: (v) => String(v.sales_count) },
    { titulo: "Total", valor: (v) => v.total },
    { titulo: "Ticket médio", valor: (v) => v.average_ticket },
  ];
  return gerarCsv(colunas, r.por_vendedor);
}

export function csvDosParados(r: RelatorioDeVendas): string {
  const colunas: ColunaCsv<RelatorioDeVendas["parados"][number]>[] = [
    { titulo: "Produto", valor: (p) => p.name },
    { titulo: "Loja", valor: (p) => p.establishment_name },
  ];
  return gerarCsv(colunas, r.parados);
}

export function csvDaCurvaAbc(c: CurvaAbc): string {
  const colunas: ColunaCsv<CurvaAbc["itens"][number]>[] = [
    { titulo: "Classe", valor: (i) => i.classe },
    { titulo: "Nome", valor: (i) => i.name },
    { titulo: "Valor", valor: (i) => i.amount },
    { titulo: "%", valor: (i) => i.share_pct },
    { titulo: "% acumulado", valor: (i) => i.cumulative_pct },
  ];
  return gerarCsv(colunas, c.itens);
}

export function csvDoResultadoPorLoja(v: ResultadoPorLojaView): string {
  type L = { loja: string; sales: number; margin: number; fixed: number; losses: number; result: number };
  const linhas: L[] = v.lojas.map((l) => ({ loja: l.name, sales: l.sales, margin: l.margin, fixed: l.fixed_expenses, losses: l.losses, result: l.result }));
  linhas.push({ loja: "Total", sales: v.total.sales, margin: v.total.margin, fixed: v.total.fixed_expenses, losses: v.total.losses, result: v.total.result });
  const colunas: ColunaCsv<L>[] = [
    { titulo: "Loja", valor: (l) => l.loja },
    { titulo: "Vendas", valor: (l) => l.sales },
    { titulo: "Margem", valor: (l) => l.margin },
    { titulo: "Despesas fixas", valor: (l) => l.fixed },
    { titulo: "Perdas", valor: (l) => l.losses },
    { titulo: "Resultado", valor: (l) => l.result },
  ];
  return gerarCsv(colunas, linhas);
}
