import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { hasMinRole } from "@/lib/permissions";
import { CATEGORIA_TAXAS_CARTAO } from "@/lib/emporio/cartao";
import {
  diaDoInstante,
  diasNoMes,
  inicioDoMesInstante,
  lerMes,
  mesAtualEmBrasilia,
  primeiroDia,
  somarMeses,
  textoDoMes,
  compararMeses,
} from "@/lib/emporio/mes";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";

/**
 * Meu Empório, F4a: o Resultado da Loja (Módulo 39, Q26 e Q101).
 *
 * Calculado na LEITURA, por competência no mês (datas em Brasília): nada do
 * resultado, do custo ou do ponto de equilíbrio é gravado (invariante 2). O
 * que está gravado são os fatos: a venda e o custo do item, o "Vendeu, Pagou"
 * da venda, a perda, a conta fixa. Só OWNER e ADMIN; quem tem vínculo vê as
 * lojas dele.
 */

const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const reais = (cent: number) => Math.round(cent) / 100;
const pct2 = (n: number) => Math.round(n * 100) / 100;
const DIA_MS = 86_400_000;

export type ResultadoInput = { establishment_id: string; month: string };

export type PontoDeEquilibrioView = {
  status: "ok" | "sem_dados" | "nao_se_paga";
  /** Vendas do mês necessárias para cobrir as fixas; nulo fora do `ok`. */
  amount: number | null;
  /** Ponto menos as vendas do mês, nunca negativo; nulo fora do `ok`. */
  missing: number | null;
  /** A margem % usada na conta e de onde ela veio. */
  margin_pct_used: number | null;
  basis: "mes" | "ultimos_30_dias" | null;
  message: string;
};

export type ResultadoDaLojaView = {
  establishment_id: string;
  establishment_name: string;
  month: string;
  sales: number;
  sales_count: number;
  returns_amount: number;
  cost: number;
  /** "Vendeu, Pagou" do mês: as regras mais as taxas de cartão. */
  variable_expenses: number;
  variable_expenses_by_rule: { name: string; amount: number }[];
  card_fees: number;
  margin: number;
  margin_pct: number | null;
  /** Perdas e quebras: linha própria, fora do custo. */
  losses: number;
  losses_detail: { stock_losses: number; transfer_differences: number; cash_count_differences: number };
  fixed_expenses: number;
  fixed_expenses_items: { name: string; establishment_id: string; amount: number; due_date: string; status: string }[];
  result: number;
  break_even: PontoDeEquilibrioView;
  tracking: {
    days: { date: string; sales: number; cumulative: number | null }[];
    days_in_month: number;
    days_elapsed: number;
    /** Projeção linear até o fim do mês; nulo quando o mês ainda não começou. */
    projected_sales: number | null;
  };
  estimated: boolean;
  estimated_reasons: string[];
};

type Janela = { de: Date; ate: Date };

/** Vendas, custo e "Vendeu, Pagou" de uma janela: a conta da margem, usada no mês e nos últimos 30 dias. */
async function margemDaJanela(db: TenantPrismaClient, lojaId: string, j: Janela) {
  const vendas = await db.emporioSale.findMany({
    where: { establishment_id: lojaId, status: "concluida", sold_at: { gte: j.de, lt: j.ate } },
    select: {
      id: true,
      sold_at: true,
      net_amount: true,
      items: { select: { unit_cost: true, base_qty: true, cost_estimated: true, cost_provisional: true } },
    },
  });
  const devolucoes = await db.emporioSaleReturn.findMany({
    where: { returned_at: { gte: j.de, lt: j.ate }, sale: { establishment_id: lojaId } },
    select: {
      amount: true,
      returned_at: true,
      items: { select: { base_qty: true, sale_item: { select: { unit_cost: true } } } },
    },
  });
  const ids = vendas.map((v) => v.id);
  const despesas =
    ids.length === 0
      ? []
      : await db.saleVariableExpense.findMany({
          where: { sale_id: { in: ids }, canceled_at: null },
          select: { amount: true, cost_provisional: true, rule: { select: { name: true } } },
        });
  const taxas =
    ids.length === 0
      ? []
      : await db.financialEntry.findMany({
          where: {
            related_module: "emporio",
            entry_type: "expense",
            category: CATEGORIA_TAXAS_CARTAO,
            status: { not: "cancelled" },
            related_id: { in: ids },
          },
          select: { amount: true },
        });

  let vendasCent = vendas.reduce((s, v) => s + centavos(decToNum(v.net_amount) ?? 0), 0);
  let custoCent = 0;
  let itensEstimados = 0;
  for (const v of vendas) {
    for (const i of v.items) {
      custoCent += Math.round((decToNum(i.unit_cost) ?? 0) * (decToNum(i.base_qty) ?? 0) * 100);
      if (i.cost_estimated || i.cost_provisional) itensEstimados++;
    }
  }
  let devolvidoCent = 0;
  for (const d of devolucoes) {
    devolvidoCent += centavos(decToNum(d.amount) ?? 0);
    for (const i of d.items) {
      custoCent -= Math.round((decToNum(i.sale_item.unit_cost) ?? 0) * (decToNum(i.base_qty) ?? 0) * 100);
    }
  }
  vendasCent -= devolvidoCent;

  const regras = new Map<string, number>();
  let regrasCent = 0;
  let embalagensProvisorias = 0;
  for (const d of despesas) {
    const c = centavos(decToNum(d.amount) ?? 0);
    regrasCent += c;
    regras.set(d.rule.name, (regras.get(d.rule.name) ?? 0) + c);
    if (d.cost_provisional) embalagensProvisorias++;
  }
  const taxasCent = taxas.reduce((s, t) => s + centavos(decToNum(t.amount) ?? 0), 0);
  const vendeuPagouCent = regrasCent + taxasCent;

  return {
    vendas,
    devolucoes,
    vendasCent,
    devolvidoCent,
    custoCent,
    regras,
    taxasCent,
    vendeuPagouCent,
    margemCent: vendasCent - custoCent - vendeuPagouCent,
    itensEstimados,
    embalagensProvisorias,
  };
}

export async function resultadoDaLojaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: ResultadoInput,
): Promise<ActionResult<ResultadoDaLojaView>> {
  if (!hasMinRole(ator.role, "ADMIN")) {
    return fail("FORBIDDEN", "Só o dono e o administrador podem ver o resultado.", 403);
  }
  const lojaId = typeof input?.establishment_id === "string" ? input.establishment_id.trim() : "";
  if (!lojaId) return fail("VALIDATION_ERROR", "Escolha o estabelecimento.", 422, "establishment_id");
  const mes = lerMes(input?.month);
  if (!mes) return fail("VALIDATION_ERROR", "Informe o mês no formato AAAA-MM.", 422, "month");

  const visiveis = await lojasDoAtor(db, ator);
  const loja = await db.establishment.findFirst({ where: { id: lojaId }, select: { id: true, name: true } });
  if (!loja || (visiveis && !visiveis.has(lojaId))) {
    return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
  }

  const mesJanela: Janela = { de: inicioDoMesInstante(mes), ate: inicioDoMesInstante(somarMeses(mes, 1)) };
  const m = await margemDaJanela(db, lojaId, mesJanela);

  // Perdas e quebras
  const perdas = await db.stockMovement.findMany({
    where: {
      establishment_id: lojaId,
      movement_type: "perda",
      canceled_at: null,
      occurred_at: { gte: mesJanela.de, lt: mesJanela.ate },
    },
    select: { quantity: true, unit_cost: true },
  });
  let perdaSemCusto = 0;
  const perdasEstoqueCent = perdas.reduce((s, p) => {
    const custo = decToNum(p.unit_cost);
    if (custo === null) perdaSemCusto++;
    return s + Math.round((custo ?? 0) * (decToNum(p.quantity) ?? 0) * 100);
  }, 0);

  const transferencias = await db.stockTransfer.findMany({
    where: {
      origin_establishment_id: lojaId,
      received_at: { gte: mesJanela.de, lt: mesJanela.ate },
    },
    select: { items: { select: { sent_qty: true, received_qty: true, unit_cost: true } } },
  });
  let diferencaTransfCent = 0;
  for (const t of transferencias) {
    for (const i of t.items) {
      if (i.received_qty === null) continue;
      const falta = (decToNum(i.sent_qty) ?? 0) - (decToNum(i.received_qty) ?? 0);
      const custo = decToNum(i.unit_cost);
      if (custo === null && falta !== 0) perdaSemCusto++;
      diferencaTransfCent += Math.round(falta * (custo ?? 0) * 100);
    }
  }

  const conferencias = await db.cashCount.findMany({
    where: { establishment_id: lojaId, counted_at: { gte: mesJanela.de, lt: mesJanela.ate } },
    select: { difference: true },
  });
  // `difference` = contado menos esperado: negativo é falta, que soma nas perdas.
  const conferenciaCent = -conferencias.reduce((s, c) => s + centavos(decToNum(c.difference) ?? 0), 0);
  const perdasCent = perdasEstoqueCent + diferencaTransfCent + conferenciaCent;

  // Fixas: pelo vencimento no mês (data de calendário, meia-noite UTC).
  const fixas = await db.financialEntry.findMany({
    where: {
      related_module: "emporio",
      entry_type: "expense",
      establishment_id: lojaId,
      status: { not: "cancelled" },
      fixed_occurrence: { isNot: null },
      due_date: { gte: primeiroDia(mes), lt: primeiroDia(somarMeses(mes, 1)) },
    },
    select: {
      amount: true,
      status: true,
      due_date: true,
      establishment_id: true,
      fixed_occurrence: { select: { template: { select: { name: true } } } },
    },
    orderBy: { due_date: "asc" },
  });
  const fixasCent = fixas.reduce((s, f) => s + centavos(decToNum(f.amount) ?? 0), 0);
  const fixasNaoPagas = fixas.filter((f) => f.status !== "paid").length;

  const resultadoCent = m.margemCent - perdasCent - fixasCent;

  // Ponto de equilíbrio (Q26)
  let base = { vendasCent: m.vendasCent, margemCent: m.margemCent, n: m.vendas.length };
  let origem: "mes" | "ultimos_30_dias" = "mes";
  if (m.vendas.length < 10) {
    const agora = new Date();
    const fim = new Date(Math.min(agora.getTime(), mesJanela.ate.getTime()));
    const ult = await margemDaJanela(db, lojaId, { de: new Date(fim.getTime() - 30 * DIA_MS), ate: new Date(fim.getTime() + 1) });
    base = { vendasCent: ult.vendasCent, margemCent: ult.margemCent, n: ult.vendas.length };
    origem = "ultimos_30_dias";
  }
  let pe: PontoDeEquilibrioView;
  if (base.n === 0 || base.vendasCent <= 0) {
    pe = {
      status: "sem_dados",
      amount: null,
      missing: null,
      margin_pct_used: null,
      basis: null,
      message: "Sem dados ainda: faça algumas vendas para calcular o ponto de equilíbrio.",
    };
  } else if (base.margemCent <= 0) {
    pe = {
      status: "nao_se_paga",
      amount: null,
      missing: null,
      margin_pct_used: pct2((base.margemCent / base.vendasCent) * 100),
      basis: origem,
      message: "A loja não se paga com os preços atuais: a margem não cobre nem o custo das vendas.",
    };
  } else {
    const pontoCent = Math.round((fixasCent * base.vendasCent) / base.margemCent);
    pe = {
      status: "ok",
      amount: reais(pontoCent),
      missing: reais(Math.max(0, pontoCent - m.vendasCent)),
      margin_pct_used: pct2((base.margemCent / base.vendasCent) * 100),
      basis: origem,
      message:
        origem === "mes"
          ? "Calculado pela margem das vendas do mês."
          : "Poucas vendas no mês (menos de 10): calculado pela margem dos últimos 30 dias.",
    };
  }

  // Acompanhamento do mês: vendas por dia (líquidas das devoluções), acumulado e projeção linear.
  const nDias = diasNoMes(mes);
  const porDia = new Map<string, number>();
  for (const v of m.vendas) {
    const d = diaDoInstante(v.sold_at);
    porDia.set(d, (porDia.get(d) ?? 0) + centavos(decToNum(v.net_amount) ?? 0));
  }
  for (const d of m.devolucoes) {
    const dia = diaDoInstante(d.returned_at);
    porDia.set(dia, (porDia.get(dia) ?? 0) - centavos(decToNum(d.amount) ?? 0));
  }
  const hoje = mesAtualEmBrasilia();
  const cmp = compararMeses(mes, hoje);
  const diaDeHoje = Number(diaDoInstante(new Date()).slice(8, 10));
  const decorridos = cmp < 0 ? nDias : cmp === 0 ? Math.min(diaDeHoje, nDias) : 0;
  let acumulado = 0;
  const dias: ResultadoDaLojaView["tracking"]["days"] = [];
  for (let d = 1; d <= nDias; d++) {
    const chave = `${textoDoMes(mes)}-${String(d).padStart(2, "0")}`;
    const dia = porDia.get(chave) ?? 0;
    if (d <= decorridos) acumulado += dia;
    dias.push({ date: chave, sales: reais(dia), cumulative: d <= decorridos ? reais(acumulado) : null });
  }
  const projetado = decorridos > 0 ? reais(Math.round((acumulado / decorridos) * nDias)) : null;

  // Estimado, com os motivos
  const motivos: string[] = [];
  if (m.itensEstimados > 0) {
    motivos.push(
      `${m.itensEstimados} ${m.itensEstimados === 1 ? "item vendido" : "itens vendidos"} com custo estimado ou provisório.`,
    );
  }
  if (m.embalagensProvisorias > 0) {
    motivos.push(
      `${m.embalagensProvisorias} ${m.embalagensProvisorias === 1 ? "baixa de embalagem" : "baixas de embalagem"} com custo provisório.`,
    );
  }
  if (perdaSemCusto > 0) {
    motivos.push(`${perdaSemCusto} ${perdaSemCusto === 1 ? "perda" : "perdas"} sem custo conhecido, contada(s) como zero.`);
  }
  if (fixasNaoPagas > 0) {
    motivos.push(
      `${fixasNaoPagas} ${fixasNaoPagas === 1 ? "conta fixa do mês ainda não paga" : "contas fixas do mês ainda não pagas"}.`,
    );
  }

  return ok({
    establishment_id: loja.id,
    establishment_name: loja.name,
    month: textoDoMes(mes),
    sales: reais(m.vendasCent),
    sales_count: m.vendas.length,
    returns_amount: reais(m.devolvidoCent),
    cost: reais(m.custoCent),
    variable_expenses: reais(m.vendeuPagouCent),
    variable_expenses_by_rule: [...m.regras.entries()].map(([name, c]) => ({ name, amount: reais(c) })),
    card_fees: reais(m.taxasCent),
    margin: reais(m.margemCent),
    margin_pct: m.vendasCent > 0 ? pct2((m.margemCent / m.vendasCent) * 100) : null,
    losses: reais(perdasCent),
    losses_detail: {
      stock_losses: reais(perdasEstoqueCent),
      transfer_differences: reais(diferencaTransfCent),
      cash_count_differences: reais(conferenciaCent),
    },
    fixed_expenses: reais(fixasCent),
    fixed_expenses_items: fixas.map((f) => ({
      name: f.fixed_occurrence?.template.name ?? "",
      establishment_id: f.establishment_id as string,
      amount: decToNum(f.amount) ?? 0,
      due_date: (f.due_date as Date).toISOString().slice(0, 10),
      status: f.status,
    })),
    result: reais(resultadoCent),
    break_even: pe,
    tracking: { days: dias, days_in_month: nDias, days_elapsed: decorridos, projected_sales: projetado },
    estimated: motivos.length > 0,
    estimated_reasons: motivos,
  });
}
