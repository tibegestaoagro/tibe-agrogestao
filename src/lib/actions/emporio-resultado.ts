import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigir } from "@/lib/emporio/papel";
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
  type MesCivil,
} from "@/lib/emporio/mes";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";

/**
 * Meu Empório, F4a e F4b: o Resultado da Loja (Módulo 39, Q26, Q101), a visão
 * somada (Q103), os produtos do mês (Q104) e as vendas com margem negativa
 * (Q105).
 *
 * Calculado na LEITURA, por competência no mês (datas em Brasília): nada do
 * resultado, do custo ou do ponto de equilíbrio é gravado (invariante 2). O
 * que está gravado são os fatos: a venda e o custo do item, o "Vendeu, Pagou"
 * da venda, a perda, a conta fixa. Só OWNER e ADMIN; quem tem vínculo vê as
 * lojas dele, menos a visão somada (regra 10).
 */

const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const reais = (cent: number) => Math.round(cent) / 100;
const pct2 = (n: number) => Math.round(n * 100) / 100;
const DIA_MS = 86_400_000;

/** `establishment_id` da visão somada (Q103). */
export const TODAS_AS_LOJAS = "all";

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

export type LojaDoResultadoView = {
  establishment_id: string;
  name: string;
  sales: number;
  margin: number;
  margin_pct: number | null;
  losses: number;
  fixed_expenses: number;
  result: number;
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
  /** Só na visão somada (`all`): uma linha por loja não arquivada. */
  stores?: LojaDoResultadoView[];
};

type Janela = { de: Date; ate: Date };
type Margem = Awaited<ReturnType<typeof margemDaJanela>>;

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

/** Soma as margens de várias lojas: a visão somada reaproveita a conta da loja, sem reescrevê-la. */
function somarMargens(ms: Margem[]): Margem {
  const regras = new Map<string, number>();
  for (const m of ms) for (const [nome, c] of m.regras) regras.set(nome, (regras.get(nome) ?? 0) + c);
  const soma = (f: (m: Margem) => number) => ms.reduce((s, m) => s + f(m), 0);
  return {
    vendas: ms.flatMap((m) => m.vendas),
    devolucoes: ms.flatMap((m) => m.devolucoes),
    vendasCent: soma((m) => m.vendasCent),
    devolvidoCent: soma((m) => m.devolvidoCent),
    custoCent: soma((m) => m.custoCent),
    regras,
    taxasCent: soma((m) => m.taxasCent),
    vendeuPagouCent: soma((m) => m.vendeuPagouCent),
    margemCent: soma((m) => m.margemCent),
    itensEstimados: soma((m) => m.itensEstimados),
    embalagensProvisorias: soma((m) => m.embalagensProvisorias),
  };
}

/** Tudo o que o resultado de UMA loja precisa no mês: margem, perdas e fixas, em centavos. */
async function apurarLoja(db: TenantPrismaClient, lojaId: string, mes: MesCivil, mesJanela: Janela) {
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

  // A diferença da transferência é perda só da origem: o destino não a recebe como venda nem como custo.
  const transferencias = await db.stockTransfer.findMany({
    where: {
      origin_establishment_id: lojaId,
      received_at: { gte: mesJanela.de, lt: mesJanela.ate },
      // Q131: "não foi enviada" devolve a diferença ao saldo da origem, então não é perda.
      OR: [{ resolution: null }, { resolution: "perda_no_caminho" }],
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

  // Fixas: pelo vencimento no mês (data de calendário, meia-noite UTC). A despesa
  // dividida entra pelas partes de cada loja, que somam o total.
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

  return {
    m,
    perdasEstoqueCent,
    diferencaTransfCent,
    conferenciaCent,
    perdasCent,
    perdaSemCusto,
    fixas,
    fixasCent,
    fixasNaoPagas: fixas.filter((f) => f.status !== "paid").length,
  };
}

type Apuracao = Awaited<ReturnType<typeof apurarLoja>>;

type Visao = {
  lojas: { id: string; name: string }[];
  todas: boolean;
  mes: MesCivil;
  janela: Janela;
};

/** O que as três leituras do Resultado validam igual: papel, loja (ou "all") e mês. */
async function lerVisao(db: TenantPrismaClient, ator: Ator, input: ResultadoInput): Promise<ActionResult<Visao>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "ver o resultado da loja");
  if (neg) return neg;
  const lojaId = typeof input?.establishment_id === "string" ? input.establishment_id.trim() : "";
  if (!lojaId) return fail("VALIDATION_ERROR", "Escolha o estabelecimento.", 422, "establishment_id");
  const mes = lerMes(input?.month);
  if (!mes) return fail("VALIDATION_ERROR", "Informe o mês no formato AAAA-MM.", 422, "month");

  const visiveis = await lojasDoAtor(db, ator);
  const janela: Janela = { de: inicioDoMesInstante(mes), ate: inicioDoMesInstante(somarMeses(mes, 1)) };

  if (lojaId === TODAS_AS_LOJAS) {
    if (visiveis) {
      return fail(
        "FORBIDDEN",
        "Só o dono e o gerente geral veem a visão de todas as lojas.",
        403,
        "establishment_id",
      );
    }
    const lojas = await db.establishment.findMany({
      where: { archived_at: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return ok({ lojas, todas: true, mes, janela });
  }

  const loja = await db.establishment.findFirst({ where: { id: lojaId }, select: { id: true, name: true } });
  if (!loja || (visiveis && !visiveis.has(lojaId))) {
    return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
  }
  return ok({ lojas: [loja], todas: false, mes, janela });
}

export async function resultadoDaLojaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: ResultadoInput,
): Promise<ActionResult<ResultadoDaLojaView>> {
  const visao = await lerVisao(db, ator, input);
  if (!visao.ok) return visao;
  const { lojas, todas, mes, janela: mesJanela } = visao.data;

  const apuradas: Apuracao[] = [];
  for (const l of lojas) apuradas.push(await apurarLoja(db, l.id, mes, mesJanela));

  const m = somarMargens(apuradas.map((a) => a.m));
  const soma = (f: (a: Apuracao) => number) => apuradas.reduce((s, a) => s + f(a), 0);
  const perdasEstoqueCent = soma((a) => a.perdasEstoqueCent);
  const diferencaTransfCent = soma((a) => a.diferencaTransfCent);
  const conferenciaCent = soma((a) => a.conferenciaCent);
  const perdasCent = soma((a) => a.perdasCent);
  const perdaSemCusto = soma((a) => a.perdaSemCusto);
  const fixasCent = soma((a) => a.fixasCent);
  const fixasNaoPagas = soma((a) => a.fixasNaoPagas);
  const fixas = apuradas.flatMap((a) => a.fixas).sort((a, b) => (a.due_date as Date).getTime() - (b.due_date as Date).getTime());

  const resultadoCent = m.margemCent - perdasCent - fixasCent;

  // Ponto de equilíbrio (Q26): no somado, o recuo de 30 dias também sai da soma das lojas.
  let base = { vendasCent: m.vendasCent, margemCent: m.margemCent, n: m.vendas.length };
  let origem: "mes" | "ultimos_30_dias" = "mes";
  if (m.vendas.length < 10) {
    const agora = new Date();
    const fim = new Date(Math.min(agora.getTime(), mesJanela.ate.getTime()));
    const janela30: Janela = { de: new Date(fim.getTime() - 30 * DIA_MS), ate: new Date(fim.getTime() + 1) };
    const ults: Margem[] = [];
    for (const l of lojas) ults.push(await margemDaJanela(db, l.id, janela30));
    const ult = somarMargens(ults);
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
      message: todas
        ? "As lojas juntas não se pagam com os preços atuais: a margem não cobre nem o custo das vendas."
        : "A loja não se paga com os preços atuais: a margem não cobre nem o custo das vendas.",
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

  // Estimado, com os motivos (na visão somada, os das lojas juntos)
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

  const view: ResultadoDaLojaView = {
    establishment_id: todas ? TODAS_AS_LOJAS : lojas[0].id,
    establishment_name: todas ? "Todas as lojas" : lojas[0].name,
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
  };
  if (todas) {
    view.stores = lojas.map((l, i) => {
      const a = apuradas[i];
      return {
        establishment_id: l.id,
        name: l.name,
        sales: reais(a.m.vendasCent),
        margin: reais(a.m.margemCent),
        margin_pct: a.m.vendasCent > 0 ? pct2((a.m.margemCent / a.m.vendasCent) * 100) : null,
        losses: reais(a.perdasCent),
        fixed_expenses: reais(a.fixasCent),
        result: reais(a.m.margemCent - a.perdasCent - a.fixasCent),
      };
    });
  }
  return ok(view);
}

// ---------------------------------------------------------------------------
// Produtos do mês e vendas com margem negativa (F4b, Q104 e Q105)
// ---------------------------------------------------------------------------

/** Reparte `totalCent` na proporção dos pesos, sem perder centavo (maior resto primeiro). */
function ratear(totalCent: number, pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  let soma = pesos.reduce((s, p) => s + p, 0);
  const p = soma > 0 ? pesos : pesos.map(() => 1);
  if (soma <= 0) soma = p.length;
  const partes = p.map((w) => (totalCent * w) / soma);
  const base = partes.map((x) => Math.floor(x));
  let falta = totalCent - base.reduce((s, x) => s + x, 0);
  const ordem = partes.map((x, i) => ({ i, resto: x - Math.floor(x) })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (let k = 0; falta > 0 && k < ordem.length; k++, falta--) base[ordem[k].i] += 1;
  return base;
}

/** Vendas concluídas do mês das lojas, com tudo o que as duas leituras abaixo cruzam. */
async function vendasDetalhadas(db: TenantPrismaClient, lojaIds: string[], j: Janela) {
  const vendas = await db.emporioSale.findMany({
    where: { establishment_id: { in: lojaIds }, status: "concluida", sold_at: { gte: j.de, lt: j.ate } },
    select: {
      id: true,
      sold_at: true,
      net_amount: true,
      discount_amount: true,
      establishment: { select: { name: true } },
      items: {
        select: {
          emporio_product_id: true,
          presentation_id: true,
          quantity: true,
          base_qty: true,
          unit_price: true,
          total: true,
          unit_cost: true,
          cost_provisional: true,
        },
      },
    },
    orderBy: [{ sold_at: "asc" }, { id: "asc" }],
  });
  const ids = vendas.map((v) => v.id);
  const despesas =
    ids.length === 0
      ? []
      : await db.saleVariableExpense.findMany({
          where: { sale_id: { in: ids }, canceled_at: null },
          select: { sale_id: true, amount: true, rule_snapshot: true },
          orderBy: { id: "asc" },
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
          select: { related_id: true, amount: true },
        });
  const despesasPorVenda = new Map<string, typeof despesas>();
  for (const d of despesas) despesasPorVenda.set(d.sale_id, [...(despesasPorVenda.get(d.sale_id) ?? []), d]);
  const taxaPorVenda = new Map<string, number>();
  for (const t of taxas) {
    const id = t.related_id as string;
    taxaPorVenda.set(id, (taxaPorVenda.get(id) ?? 0) + centavos(decToNum(t.amount) ?? 0));
  }
  return { vendas, despesasPorVenda, taxaPorVenda };
}

type Dec = Parameters<typeof decToNum>[0];
const custoDoItemCent = (i: { unit_cost: Dec; base_qty: Dec }) =>
  Math.round((decToNum(i.unit_cost) ?? 0) * (decToNum(i.base_qty) ?? 0) * 100);

export type ProdutoDoMesView = {
  emporio_product_id: string;
  name: string;
  base_unit: string;
  /** Na unidade-base, já descontadas as devoluções do mês. */
  quantity: number;
  sales: number;
  cost: number;
  variable_expenses: number;
  margin: number;
  margin_pct: number | null;
};

export type ProdutosDoMesView = {
  establishment_id: string;
  establishment_name: string;
  month: string;
  top_sales: ProdutoDoMesView[];
  top_margin: ProdutoDoMesView[];
};

const LIMITE_PRODUTOS = 10;

export async function produtosDoMesAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: ResultadoInput,
): Promise<ActionResult<ProdutosDoMesView>> {
  const visao = await lerVisao(db, ator, input);
  if (!visao.ok) return visao;
  const { lojas, todas, mes, janela } = visao.data;
  const lojaIds = lojas.map((l) => l.id);

  type Acc = { qty: number; salesCent: number; costCent: number; despCent: number };
  const porProduto = new Map<string, Acc>();
  const acc = (id: string) => {
    let a = porProduto.get(id);
    if (!a) porProduto.set(id, (a = { qty: 0, salesCent: 0, costCent: 0, despCent: 0 }));
    return a;
  };

  if (lojaIds.length > 0) {
    const { vendas, despesasPorVenda, taxaPorVenda } = await vendasDetalhadas(db, lojaIds, janela);
    for (const v of vendas) {
      const valores = v.items.map((i) => centavos(decToNum(i.total) ?? 0));
      v.items.forEach((i, idx) => {
        const a = acc(i.emporio_product_id);
        a.qty += decToNum(i.base_qty) ?? 0;
        a.salesCent += valores[idx];
        a.costCent += custoDoItemCent(i);
      });
      // Cada despesa do "Vendeu, Pagou" é rateada pelo valor entre os itens que a regra alcançava.
      for (const d of despesasPorVenda.get(v.id) ?? []) {
        const snap = (d.rule_snapshot ?? {}) as { emporio_product_id?: string | null; presentation_id?: string | null };
        let alvo = v.items.map((_, idx) => idx).filter((idx) => {
          const i = v.items[idx];
          return (
            (!snap.emporio_product_id || i.emporio_product_id === snap.emporio_product_id) &&
            (!snap.presentation_id || i.presentation_id === snap.presentation_id)
          );
        });
        if (alvo.length === 0) alvo = v.items.map((_, idx) => idx);
        const partes = ratear(centavos(decToNum(d.amount) ?? 0), alvo.map((idx) => valores[idx]));
        alvo.forEach((idx, k) => (acc(v.items[idx].emporio_product_id).despCent += partes[k]));
      }
      // A taxa de cartão é da venda toda: rateada pelo valor entre todos os itens.
      const taxa = taxaPorVenda.get(v.id) ?? 0;
      if (taxa > 0) {
        const partes = ratear(taxa, valores);
        v.items.forEach((i, idx) => (acc(i.emporio_product_id).despCent += partes[idx]));
      }
    }

    // Devolvido no mês desconta do produto pelo item devolvido (venda e custo; a despesa do "Vendeu, Pagou" não volta).
    const devolucoes = await db.emporioSaleReturn.findMany({
      where: { returned_at: { gte: janela.de, lt: janela.ate }, sale: { establishment_id: { in: lojaIds } } },
      select: {
        items: {
          select: {
            quantity: true,
            base_qty: true,
            sale_item: { select: { emporio_product_id: true, quantity: true, total: true, unit_cost: true } },
          },
        },
      },
    });
    for (const d of devolucoes) {
      for (const i of d.items) {
        const a = acc(i.sale_item.emporio_product_id);
        const qVendida = decToNum(i.sale_item.quantity) ?? 0;
        const fracao = qVendida > 0 ? (decToNum(i.quantity) ?? 0) / qVendida : 0;
        a.salesCent -= Math.round(centavos(decToNum(i.sale_item.total) ?? 0) * fracao);
        a.costCent -= custoDoItemCent({ unit_cost: i.sale_item.unit_cost, base_qty: i.base_qty });
        a.qty -= decToNum(i.base_qty) ?? 0;
      }
    }
  }

  const produtos =
    porProduto.size === 0
      ? []
      : await db.emporioProduct.findMany({
          where: { id: { in: [...porProduto.keys()] } },
          select: { id: true, base_unit: true, product: { select: { name: true } } },
        });
  const linhas: ProdutoDoMesView[] = produtos.map((p) => {
    const a = porProduto.get(p.id) as Acc;
    const margemCent = a.salesCent - a.costCent - a.despCent;
    return {
      emporio_product_id: p.id,
      name: p.product.name,
      base_unit: p.base_unit,
      quantity: Math.round(a.qty * 1000) / 1000,
      sales: reais(a.salesCent),
      cost: reais(a.costCent),
      variable_expenses: reais(a.despCent),
      margin: reais(margemCent),
      margin_pct: a.salesCent > 0 ? pct2((margemCent / a.salesCent) * 100) : null,
    };
  });

  const ordenar = (chave: "sales" | "margin") =>
    [...linhas]
      .sort((a, b) => b[chave] - a[chave] || a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, LIMITE_PRODUTOS);

  return ok({
    establishment_id: todas ? TODAS_AS_LOJAS : lojas[0].id,
    establishment_name: todas ? "Todas as lojas" : lojas[0].name,
    month: textoDoMes(mes),
    top_sales: ordenar("sales"),
    top_margin: ordenar("margin"),
  });
}

export type CausaDaMargemNegativa =
  | "custo_provisorio"
  | "preco_abaixo_do_custo"
  | "desconto"
  | "taxa_cartao"
  | "despesas_da_venda";

export type VendaComMargemNegativaView = {
  sale_id: string;
  sold_at: string;
  establishment_name: string;
  net_amount: number;
  margin: number;
  cause: CausaDaMargemNegativa;
};

export async function vendasComMargemNegativaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: ResultadoInput,
): Promise<ActionResult<VendaComMargemNegativaView[]>> {
  const visao = await lerVisao(db, ator, input);
  if (!visao.ok) return visao;
  const { lojas, janela } = visao.data;
  if (lojas.length === 0) return ok([]);

  const { vendas, despesasPorVenda, taxaPorVenda } = await vendasDetalhadas(
    db,
    lojas.map((l) => l.id),
    janela,
  );

  const negativas: (VendaComMargemNegativaView & { margemCent: number })[] = [];
  for (const v of vendas) {
    const custoCent = v.items.reduce((s, i) => s + custoDoItemCent(i), 0);
    const despesasCent = (despesasPorVenda.get(v.id) ?? []).reduce((s, d) => s + centavos(decToNum(d.amount) ?? 0), 0);
    const taxaCent = taxaPorVenda.get(v.id) ?? 0;
    const liquidoCent = centavos(decToNum(v.net_amount) ?? 0);
    const margemCent = liquidoCent - custoCent - despesasCent - taxaCent;
    if (margemCent >= 0) continue;

    const abaixoDoCusto = v.items.some((i) => {
      const custo = decToNum(i.unit_cost);
      const qtd = decToNum(i.quantity) ?? 0;
      if (custo === null || qtd <= 0) return false;
      const custoDaApresentacaoCent = Math.round(custo * ((decToNum(i.base_qty) ?? 0) / qtd) * 100);
      return centavos(decToNum(i.unit_price) ?? 0) < custoDaApresentacaoCent;
    });
    const cause: CausaDaMargemNegativa = v.items.some((i) => i.cost_provisional)
      ? "custo_provisorio"
      : abaixoDoCusto
        ? "preco_abaixo_do_custo"
        : (decToNum(v.discount_amount) ?? 0) > 0
          ? "desconto"
          : taxaCent > 0
            ? "taxa_cartao"
            : "despesas_da_venda";

    negativas.push({
      sale_id: v.id,
      sold_at: v.sold_at.toISOString(),
      establishment_name: v.establishment.name,
      net_amount: reais(liquidoCent),
      margin: reais(margemCent),
      cause,
      margemCent,
    });
  }
  negativas.sort((a, b) => a.margemCent - b.margemCent || a.sale_id.localeCompare(b.sale_id));
  return ok(negativas.map(({ margemCent: _m, ...v }) => v));
}
