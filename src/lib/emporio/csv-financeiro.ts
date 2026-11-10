import { diaBr, gerarCsv, type ColunaCsv } from "@/lib/csv";
import type { AReceberPorIdadeView, APagarPorVencimentoView, PosicaoPorLugarView } from "@/lib/actions/emporio-relatorios-financeiro";
import type { FluxoProjetadoView } from "@/lib/actions/emporio-projecao";

/** As planilhas dos relatórios do dinheiro (Q269): só montam linhas do que a action já devolveu. */

const ROTULO_FAIXA: Record<string, string> = { em_dia: "Em dia", "1-15": "1 a 15 dias", "16-30": "16 a 30 dias", "30+": "Mais de 30 dias" };
const ROTULO_LUGAR: Record<string, string> = { gaveta: "Gaveta", gerencia: "Gerência", conta: "Conta bancária" };

export function csvDoAReceberPorIdade(v: AReceberPorIdadeView): string {
  type L = { cliente: string; loja: string; faixa: string; valor: number; vencimento: string };
  const linhas: L[] = v.customers.flatMap((c) =>
    c.bands.map((b) => ({
      cliente: c.customer_name,
      loja: b.stores.join(", "),
      faixa: ROTULO_FAIXA[b.band] ?? b.band,
      valor: b.total,
      vencimento: diaBr(b.oldest_due),
    })),
  );
  const colunas: ColunaCsv<L>[] = [
    { titulo: "Cliente", valor: (l) => l.cliente },
    { titulo: "Loja", valor: (l) => l.loja },
    { titulo: "Faixa de idade", valor: (l) => l.faixa },
    { titulo: "Valor", valor: (l) => l.valor },
    { titulo: "Vencimento mais antigo", valor: (l) => l.vencimento },
  ];
  return gerarCsv(colunas, linhas);
}

export function csvDoAPagarPorVencimento(v: APagarPorVencimentoView): string {
  type L = { semana: string; conta: string; vencimento: string; valor: number; situacao: string };
  const situacao = (total: number, vencido: number) => (vencido <= 0 ? "A vencer" : vencido >= total ? "Vencida" : "Em parte vencida");
  const linhas: L[] = v.weeks.flatMap((w) =>
    w.items.map((i) => ({
      semana: `${diaBr(w.de)} a ${diaBr(w.ate)}`,
      conta: i.name,
      vencimento: "Na semana",
      valor: i.total,
      situacao: situacao(i.total, i.overdue_total),
    })),
  );
  for (const e of v.without_due.entries) {
    linhas.push({ semana: "", conta: e.name, vencimento: "Sem vencimento", valor: e.total, situacao: "Sem vencimento" });
  }
  const colunas: ColunaCsv<L>[] = [
    { titulo: "Semana", valor: (l) => l.semana },
    { titulo: "Conta", valor: (l) => l.conta },
    { titulo: "Vencimento", valor: (l) => l.vencimento },
    { titulo: "Valor", valor: (l) => l.valor },
    { titulo: "Situação", valor: (l) => l.situacao },
  ];
  return gerarCsv(colunas, linhas);
}

export function csvDaPosicaoPorLugar(v: PosicaoPorLugarView): string {
  const colunas: ColunaCsv<PosicaoPorLugarView["places"][number]>[] = [
    { titulo: "Lugar", valor: (p) => p.name },
    { titulo: "Tipo", valor: (p) => ROTULO_LUGAR[p.kind] ?? p.kind },
    { titulo: "Saldo", valor: (p) => p.balance },
  ];
  return gerarCsv(colunas, v.places);
}

export function csvDaProjecao(v: FluxoProjetadoView): string {
  type L = { semana: string; entradas: number | null; saidas: number | null; saldo: number | null };
  const linhas: L[] = v.weeks.map((w) => ({
    semana: `${diaBr(w.de)} a ${diaBr(w.ate)}`,
    entradas: w.receivables.total,
    saidas: w.payables.total,
    saldo: w.closing_balance,
  }));
  for (const nota of v.notes) linhas.push({ semana: `Nota: ${nota}`, entradas: null, saidas: null, saldo: null });
  if (v.without_due.count > 0) {
    linhas.push({
      semana: `Nota: ${v.without_due.count} conta(s) sem vencimento, no total de ${v.without_due.total.toFixed(2).replace(".", ",")}, ficam fora da projeção.`,
      entradas: null,
      saidas: null,
      saldo: null,
    });
  }
  const colunas: ColunaCsv<L>[] = [
    { titulo: "Semana", valor: (l) => l.semana },
    { titulo: "Entradas", valor: (l) => l.entradas },
    { titulo: "Saídas", valor: (l) => l.saidas },
    { titulo: "Saldo projetado", valor: (l) => l.saldo },
  ];
  return gerarCsv(colunas, linhas);
}
