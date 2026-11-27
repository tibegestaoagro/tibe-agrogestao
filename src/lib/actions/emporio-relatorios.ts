import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigirUma } from "@/lib/emporio/papel";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { valorDevolvidoDoItemCent } from "@/lib/actions/emporio-resultado";
import { diaDoInstante } from "@/lib/emporio/mes";
import { somarDiasCalendario } from "@/lib/dia-calendario";
import { periodoDoMesAnterior } from "@/lib/emporio/estatisticas";
import { variacaoDoMes } from "@/lib/emporio/inicio";

/**
 * Meu Empório, entrega 3: o relatório de vendas por vendedor, por produto, os
 * produtos parados e o resumo por loja.
 *
 * Calculado na leitura, como o Resultado: nada é gravado. O período é de dias
 * de Brasília (UTC-3 fixo), os dois extremos inclusivos. A quantidade conta as
 * vendas concluídas, menos a venda nova da troca (não é atendimento novo); o
 * total soma o líquido das concluídas (a da troca inclusa) e desconta o
 * devolvido no período, que vai ao vendedor e à loja da venda ORIGINAL, mesmo
 * que ela seja de antes do período. Por isso o total pode ficar negativo.
 */

const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const reais = (cent: number) => Math.round(cent) / 100;
const DIA_MS = 86_400_000;
const TRES_HORAS = 3 * 3_600_000;
const MAX_DIAS = 366;

export type RelatorioDeVendasInput = { from: string; to: string; establishment_id?: string };

export type VendasPorOrigem = {
  origin: "balcao" | "ecommerce";
  count: number;
  net: number;
  freight: number;
  /** Q303: crédito de franqueado cobrado a mais (interno), fora do líquido. */
  franchisee_credit: number;
  /** Participação no líquido do relatório (ou da loja), em % com 2 casas; 0 quando o total é zero. */
  share_pct: number;
}[];

export type RelatorioDeVendas = {
  periodo: { from: string; to: string };
  lojas: { id: string; name: string }[];
  por_vendedor: {
    seller_user_id: string | null;
    name: string;
    sales_count: number;
    total: number;
    average_ticket: number | null;
  }[];
  por_produto: { emporio_product_id: string; name: string; base_unit: string; quantity: number; total: number }[];
  parados: { emporio_product_id: string; name: string; establishment_id: string; establishment_name: string }[];
  por_loja: {
    establishment_id: string;
    name: string;
    sales_count: number;
    total: number;
    average_ticket: number | null;
    by_origin: VendasPorOrigem;
    pix_by_account: PixPorConta;
  }[];
  /** Sempre as duas origens, com zero quando não houver venda; o líquido já desconta o devolvido, como o total. */
  by_origin: VendasPorOrigem;
  /** O PIX recebido por conta nas vendas concluídas do período, bruto (não desconta devolução), do maior valor para o menor. */
  pix_by_account: PixPorConta;
  /** Todo dia do período (calendário de Brasília), zero incluído: a venda no dia dela menos a devolução no dia dela. */
  por_dia: { date: string; total: number }[];
};

export type PixPorConta = { bank_account_id: string; name: string; count: number; amount: number }[];
type PixMapa = Map<string, { count: number; cent: number }>;

type Origem = "balcao" | "ecommerce";
const ORIGENS: Origem[] = ["balcao", "ecommerce"];
type SomaOrigem = { count: number; cent: number; freightCent: number; creditCent: number };
const somaVazia = (): Record<Origem, SomaOrigem> => ({
  balcao: { count: 0, cent: 0, freightCent: 0, creditCent: 0 },
  ecommerce: { count: 0, cent: 0, freightCent: 0, creditCent: 0 },
});
function viewDeOrigens(m: Record<Origem, SomaOrigem>): VendasPorOrigem {
  const total = ORIGENS.reduce((s, o) => s + m[o].cent, 0);
  return ORIGENS.map((o) => ({
    origin: o,
    count: m[o].count,
    net: reais(m[o].cent),
    freight: reais(m[o].freightCent),
    franchisee_credit: reais(m[o].creditCent),
    share_pct: total > 0 ? Math.round((m[o].cent * 10000) / total) / 100 : 0,
  }));
}

/** "AAAA-MM-DD" -> meia-noite UTC do dia; `null` se não for um dia que existe. */
function lerDia(texto: unknown): number | null {
  if (typeof texto !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (ano < 2000 || ano > 2200) return null;
  const t = Date.UTC(ano, mes - 1, dia);
  const d = new Date(t);
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return t;
}

type Soma = { count: number; cent: number };
const ticket = (s: Soma) => (s.count > 0 ? reais(Math.round(s.cent / s.count)) : null);

/**
 * O miolo comum do relatório de vendas e da curva ABC: a permissão, o período de
 * Brasília (até 366 dias), as lojas que o ator vê, as vendas concluídas do período
 * (a nova da troca inclusa) e as devoluções do período (que pertencem à venda
 * ORIGINAL). As duas actions somam em cima disto, para o mesmo período e a mesma
 * loja darem o mesmo total.
 */
async function carregarVendasDoPeriodo(db: TenantPrismaClient, ator: Ator, input: RelatorioDeVendasInput) {
  const neg = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "ver os relatórios");
  if (neg) return neg;

  const de = lerDia(input?.from);
  if (de === null) return fail("VALIDATION_ERROR", "Informe a data inicial no formato AAAA-MM-DD.", 422, "from");
  const ate = lerDia(input?.to);
  if (ate === null) return fail("VALIDATION_ERROR", "Informe a data final no formato AAAA-MM-DD.", 422, "to");
  if (ate < de) return fail("VALIDATION_ERROR", "A data final não pode ser antes da inicial.", 422, "to");
  if ((ate - de) / DIA_MS + 1 > MAX_DIAS) return fail("VALIDATION_ERROR", "O período vai até 366 dias.", 422, "to");
  const janela = { gte: new Date(de + TRES_HORAS), lt: new Date(ate + DIA_MS + TRES_HORAS) };

  // As lojas do relatório: a pedida (mesmo arquivada), ou todas as não arquivadas que o ator vê.
  const visiveis = await lojasDoAtor(db, ator);
  const lojaId = typeof input?.establishment_id === "string" ? input.establishment_id.trim() : "";
  let lojas: { id: string; name: string }[];
  if (lojaId) {
    const loja = await db.establishment.findFirst({ where: { id: lojaId }, select: { id: true, name: true } });
    if (!loja || (visiveis && !visiveis.has(lojaId))) {
      return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
    }
    lojas = [loja];
  } else {
    lojas = await db.establishment.findMany({
      where: { archived_at: null, ...(visiveis ? { id: { in: [...visiveis] } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }
  const lojaIds = lojas.map((l) => l.id);
  const periodo = { from: String(input.from).trim(), to: String(input.to).trim() };
  const vendas = await db.emporioSale.findMany({
    where: { establishment_id: { in: lojaIds }, status: "concluida", sold_at: janela },
    select: {
      establishment_id: true,
      sold_at: true,
      seller_user_id: true,
      customer_id: true,
      origin: true,
      freight_amount: true,
      franchisee_credit: true,
      net_amount: true,
      exchange_return_id: true,
      items: {
        select: {
          emporio_product_id: true,
          base_qty: true,
          total: true,
          unit_cost: true,
          cost_estimated: true,
          cost_provisional: true,
        },
      },
      payments: { where: { kind: "pix" }, select: { bank_account_id: true, amount: true } },
    },
  });
  const devolucoes = await db.emporioSaleReturn.findMany({
    where: { returned_at: janela, sale: { establishment_id: { in: lojaIds }, status: "concluida" } },
    select: {
      franchisee_credit: true,
      returned_at: true,
      sale: { select: { establishment_id: true, seller_user_id: true, customer_id: true, origin: true } },
      items: {
        select: {
          quantity: true,
          base_qty: true,
          sale_item: {
            select: { emporio_product_id: true, quantity: true, total: true, unit_cost: true },
          },
        },
      },
    },
  });
  return ok({ periodo, lojas, lojaIds, vendas, devolucoes });
}

export async function relatorioDeVendasAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: RelatorioDeVendasInput,
): Promise<ActionResult<RelatorioDeVendas>> {
  const carga = await carregarVendasDoPeriodo(db, ator, input);
  if (!carga.ok) return carga;
  const { periodo, lojas, lojaIds, vendas, devolucoes } = carga.data;
  if (lojaIds.length === 0) {
    return ok({
      periodo,
      lojas,
      por_vendedor: [],
      por_produto: [],
      parados: [],
      por_loja: [],
      by_origin: viewDeOrigens(somaVazia()),
      pix_by_account: [],
      por_dia: totalPorDia(periodo, vendas, devolucoes),
    });
  }

  const porVendedor = new Map<string | null, Soma>();
  const porLoja = new Map<string, Soma>(lojaIds.map((id) => [id, { count: 0, cent: 0 }]));
  const porProduto = new Map<string, { qty: number; cent: number }>();
  const vendidoNaLoja = new Set<string>();
  const origemTotal = somaVazia();
  const origemDaLoja = new Map<string, Record<Origem, SomaOrigem>>(lojaIds.map((id) => [id, somaVazia()]));
  const pixTotal: PixMapa = new Map();
  const pixDaLoja = new Map<string, PixMapa>(lojaIds.map((id) => [id, new Map()]));
  const soma = <K>(m: Map<K, Soma>, k: K) => {
    let s = m.get(k);
    if (!s) m.set(k, (s = { count: 0, cent: 0 }));
    return s;
  };
  const produto = (id: string) => {
    let p = porProduto.get(id);
    if (!p) porProduto.set(id, (p = { qty: 0, cent: 0 }));
    return p;
  };

  for (const v of vendas) {
    const cent = centavos(decToNum(v.net_amount) ?? 0);
    const conta = v.exchange_return_id ? 0 : 1;
    for (const s of [soma(porVendedor, v.seller_user_id), soma(porLoja, v.establishment_id)]) {
      s.count += conta;
      s.cent += cent;
    }
    for (const o of [origemTotal[v.origin], (origemDaLoja.get(v.establishment_id) as Record<Origem, SomaOrigem>)[v.origin]]) {
      o.count += conta;
      o.cent += cent;
      o.freightCent += centavos(decToNum(v.freight_amount) ?? 0);
      o.creditCent += centavos(decToNum(v.franchisee_credit) ?? 0);
    }
    for (const pg of v.payments) {
      if (!pg.bank_account_id) continue;
      for (const mapa of [pixTotal, pixDaLoja.get(v.establishment_id) as PixMapa]) {
        const a = mapa.get(pg.bank_account_id) ?? { count: 0, cent: 0 };
        a.count += 1;
        a.cent += centavos(decToNum(pg.amount) ?? 0);
        mapa.set(pg.bank_account_id, a);
      }
    }
    for (const i of v.items) {
      const p = produto(i.emporio_product_id);
      p.qty += decToNum(i.base_qty) ?? 0;
      p.cent += centavos(decToNum(i.total) ?? 0);
      vendidoNaLoja.add(`${i.emporio_product_id}@${v.establishment_id}`);
    }
  }
  for (const d of devolucoes) {
    let devolvido = 0;
    for (const i of d.items) {
      const valor = valorDevolvidoDoItemCent(i);
      devolvido += valor;
      const p = produto(i.sale_item.emporio_product_id);
      p.qty -= decToNum(i.base_qty) ?? 0;
      p.cent -= valor;
    }
    soma(porVendedor, d.sale.seller_user_id).cent -= devolvido;
    soma(porLoja, d.sale.establishment_id).cent -= devolvido;
    origemTotal[d.sale.origin].cent -= devolvido;
    (origemDaLoja.get(d.sale.establishment_id) as Record<Origem, SomaOrigem>)[d.sale.origin].cent -= devolvido;
    // Q379: o crédito do franqueado devolvido sai do repasse mostrado por origem.
    const creditoDevolvido = centavos(decToNum(d.franchisee_credit) ?? 0);
    origemTotal[d.sale.origin].creditCent -= creditoDevolvido;
    (origemDaLoja.get(d.sale.establishment_id) as Record<Origem, SomaOrigem>)[d.sale.origin].creditCent -= creditoDevolvido;
  }

  // Nomes: o vendedor desativado continua com o nome dele.
  const sellerIds = [...porVendedor.keys()].filter((id): id is string => id !== null);
  const usuarios =
    sellerIds.length === 0
      ? []
      : await db.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } });
  const nomeDe = new Map(usuarios.map((u) => [u.id, u.name]));
  const porNome = (a: { total: number; name: string }, b: { total: number; name: string }) =>
    b.total - a.total || a.name.localeCompare(b.name, "pt-BR");

  const por_vendedor = [...porVendedor.entries()]
    .map(([id, s]) => ({
      seller_user_id: id,
      name: id === null ? "Sem vendedor" : (nomeDe.get(id) ?? "Usuário removido"),
      sales_count: s.count,
      total: reais(s.cent),
      average_ticket: ticket(s),
    }))
    .sort(porNome);

  const contaIds = [...pixTotal.keys()];
  const nomesDasContas = new Map(
    (contaIds.length === 0
      ? []
      : await db.bankAccount.findMany({ where: { id: { in: contaIds } }, select: { id: true, name: true } })
    ).map((c) => [c.id, c.name]),
  );
  const viewDoPix = (m: PixMapa): RelatorioDeVendas["pix_by_account"] =>
    [...m.entries()]
      .map(([id, a]) => ({ bank_account_id: id, name: nomesDasContas.get(id) ?? "Conta removida", count: a.count, amount: reais(a.cent) }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "pt-BR"));

  const por_loja = lojas
    .map((l) => {
      const s = porLoja.get(l.id) as Soma;
      return {
        pix_by_account: viewDoPix(pixDaLoja.get(l.id) as PixMapa),
        establishment_id: l.id,
        name: l.name,
        sales_count: s.count,
        total: reais(s.cent),
        average_ticket: ticket(s),
        by_origin: viewDeOrigens(origemDaLoja.get(l.id) as Record<Origem, SomaOrigem>),
      };
    })
    .sort(porNome);

  const produtos =
    porProduto.size === 0
      ? []
      : await db.emporioProduct.findMany({
          where: { id: { in: [...porProduto.keys()] } },
          select: { id: true, base_unit: true, product: { select: { name: true } } },
        });
  const por_produto = produtos
    .map((p) => {
      const a = porProduto.get(p.id) as { qty: number; cent: number };
      return {
        emporio_product_id: p.id,
        name: p.product.name,
        base_unit: p.base_unit,
        quantity: Math.round(a.qty * 1000) / 1000,
        total: reais(a.cent),
      };
    })
    .sort(porNome);

  // Parados: produto não arquivado com preço numa apresentação ativa da loja, e nada vendido nela no período.
  const precos = await db.presentationPrice.findMany({
    where: {
      establishment_id: { in: lojaIds },
      price: { not: null },
      presentation: { archived_at: null, emporio_product: { archived_at: null } },
    },
    select: {
      establishment_id: true,
      presentation: { select: { emporio_product: { select: { id: true, product: { select: { name: true } } } } } },
    },
  });
  const nomeDaLoja = new Map(lojas.map((l) => [l.id, l.name]));
  const parados = new Map<string, RelatorioDeVendas["parados"][number]>();
  for (const p of precos) {
    const prod = p.presentation.emporio_product;
    const chave = `${prod.id}@${p.establishment_id}`;
    if (vendidoNaLoja.has(chave) || parados.has(chave)) continue;
    parados.set(chave, {
      emporio_product_id: prod.id,
      name: prod.product.name,
      establishment_id: p.establishment_id,
      establishment_name: nomeDaLoja.get(p.establishment_id) ?? "",
    });
  }

  return ok({
    periodo,
    lojas,
    por_vendedor,
    por_produto,
    parados: [...parados.values()].sort(
      (a, b) =>
        a.establishment_name.localeCompare(b.establishment_name, "pt-BR") || a.name.localeCompare(b.name, "pt-BR"),
    ),
    por_loja,
    by_origin: viewDeOrigens(origemTotal),
    pix_by_account: viewDoPix(pixTotal),
    por_dia: totalPorDia(periodo, vendas, devolucoes),
  });
}

type Carga = Extract<Awaited<ReturnType<typeof carregarVendasDoPeriodo>>, { ok: true }>["data"];

/** O valor devolvido de uma devolução, em centavos: a soma dos itens, como o relatório desconta do total. */
const devolvidoCent = (d: Carga["devolucoes"][number]) => d.items.reduce((s, i) => s + valorDevolvidoDoItemCent(i), 0);

/** O total do período em centavos: o líquido das vendas concluídas menos o devolvido, a mesma conta do `por_loja`. */
function totalDoPeriodoCent(vendas: Carga["vendas"], devolucoes: Carga["devolucoes"]): number {
  return (
    vendas.reduce((s, v) => s + centavos(decToNum(v.net_amount) ?? 0), 0) - devolucoes.reduce((s, d) => s + devolvidoCent(d), 0)
  );
}

/** O total de cada dia do período, com zero nos dias sem venda; o dia é o de Brasília. */
function totalPorDia(periodo: { from: string; to: string }, vendas: Carga["vendas"], devolucoes: Carga["devolucoes"]) {
  const porDia = new Map<string, number>();
  for (const v of vendas) {
    const dia = diaDoInstante(v.sold_at);
    porDia.set(dia, (porDia.get(dia) ?? 0) + centavos(decToNum(v.net_amount) ?? 0));
  }
  for (const d of devolucoes) {
    const dia = diaDoInstante(d.returned_at);
    porDia.set(dia, (porDia.get(dia) ?? 0) - devolvidoCent(d));
  }
  const dias: { date: string; total: number }[] = [];
  for (let dia = periodo.from; dia <= periodo.to; dia = somarDiasCalendario(dia, 1)) {
    dias.push({ date: dia, total: reais(porDia.get(dia) ?? 0) });
  }
  return dias;
}

export type ComparacaoDeVendas = {
  atual: { from: string; to: string; total: number };
  anterior: { from: string; to: string; total: number };
  variacao_pct: number | null;
};

/**
 * O total de vendas do período e o do mesmo trecho do mês anterior, pela mesma conta do relatório (o líquido
 * das concluídas menos o devolvido), com a mesma permissão e o mesmo alcance de lojas.
 */
export async function compararVendasAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: RelatorioDeVendasInput,
): Promise<ActionResult<ComparacaoDeVendas>> {
  const atual = await carregarVendasDoPeriodo(db, ator, input);
  if (!atual.ok) return atual;
  const ant = periodoDoMesAnterior(atual.data.periodo.from, atual.data.periodo.to);
  const anterior = await carregarVendasDoPeriodo(db, ator, { ...input, from: ant.de, to: ant.ate });
  if (!anterior.ok) return anterior;
  const atualCent = totalDoPeriodoCent(atual.data.vendas, atual.data.devolucoes);
  const anteriorCent = totalDoPeriodoCent(anterior.data.vendas, anterior.data.devolucoes);
  return ok({
    atual: { from: atual.data.periodo.from, to: atual.data.periodo.to, total: reais(atualCent) },
    anterior: { from: ant.de, to: ant.ate, total: reais(anteriorCent) },
    variacao_pct: variacaoDoMes(atualCent, anteriorCent),
  });
}

export type CurvaAbcInput = {
  from: string;
  to: string;
  establishment_id?: string;
  kind: "products" | "customers";
  measure: "revenue" | "profit";
};

export type CurvaAbcClasse = "A" | "B" | "C";

export type CurvaAbc = {
  periodo: { from: string; to: string };
  kind: "products" | "customers";
  measure: "revenue" | "profit";
  /** A medida somada do período, a mesma base do `por_produto` (faturamento) ou ela menos o custo (lucro). Em clientes, inclui `fora_da_curva`. */
  total: number;
  classes: { classe: CurvaAbcClasse; count: number; amount: number; share_pct: number }[];
  itens: {
    posicao: number;
    id: string;
    name: string;
    quantity?: number;
    base_unit?: string;
    sales_count?: number;
    amount: number;
    share_pct: number;
    cumulative_pct: number;
    classe: CurvaAbcClasse;
    cost_estimated: boolean;
    cost_missing: boolean;
  }[];
  fora_da_curva?: { label: string; amount: number; sales_count: number };
};

/**
 * A parte de cada valor positivo em `base`, em centésimos de ponto percentual (10000 = 100,00%), pelo método do maior
 * resto: a soma fecha exatamente em 10000. Valor zero ou negativo não participa (fica 0). Empate de resto: o mais antigo da lista.
 */
function repartirEmCentesimos(centavosPorItem: number[], base: number): number[] {
  if (base <= 0) return centavosPorItem.map(() => 0);
  const partes = centavosPorItem.map((c) => {
    const v = c > 0 ? c * 10000 : 0;
    return { inteiro: Math.floor(v / base), resto: v % base };
  });
  let sobra = 10000 - partes.reduce((s, p) => s + p.inteiro, 0);
  const porResto = partes.map((p, i) => ({ i, resto: p.resto })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  const saida = partes.map((p) => p.inteiro);
  for (const { i, resto } of porResto) {
    if (sobra <= 0 || resto <= 0) break;
    saida[i] += 1;
    sobra -= 1;
  }
  return saida;
}

const ROTULO_FORA_DA_CURVA = "Consumidor final e vendas sem cliente";
const CONSUMIDOR_FINAL_KEY = "consumidor_final";

type Acumulado = {
  cent: number;
  qty: number;
  vendas: number;
  estimado: boolean;
  semCusto: boolean;
};

/** A mesma permissão do Resultado (`lerVisao`). */
const PERMISSOES_DO_LUCRO: ["gestor_da_loja", "dinheiro"] = ["gestor_da_loja", "dinheiro"];

/** Se o ator pode ver o lucro (a mesma checagem do `measure=profit` da curva): a página decide o seletor por ela. */
export async function podeVerLucroAction(db: TenantPrismaClient, ator: Ator): Promise<boolean> {
  const neg = await exigirUma(db, ator, PERMISSOES_DO_LUCRO, "ver o lucro");
  return !neg;
}

/**
 * A curva ABC de produtos ou de clientes, na mesma conta do relatório de vendas
 * (`carregarVendasDoPeriodo`): o faturamento é a soma do `total` das linhas, menos
 * o devolvido no período (que vai ao produto e ao cliente da venda ORIGINAL). O
 * lucro é esse faturamento menos `unit_cost` x `base_qty`, com o custo devolvido
 * saindo junto. Calculada na leitura, nada é gravado.
 */
export async function curvaAbcAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: CurvaAbcInput,
): Promise<ActionResult<CurvaAbc>> {
  if (input?.kind !== "products" && input?.kind !== "customers") {
    return fail("VALIDATION_ERROR", "Escolha a curva: produtos ou clientes.", 422, "kind");
  }
  if (input.measure !== "revenue" && input.measure !== "profit") {
    return fail("VALIDATION_ERROR", "Escolha a medida: faturamento ou lucro.", 422, "measure");
  }
  const { kind, measure } = input;
  if (measure === "profit") {
    const neg = await exigirUma(db, ator, PERMISSOES_DO_LUCRO, "ver o lucro");
    if (neg && !neg.ok) return fail(neg.code, neg.message, neg.status, "measure");
  }

  const carga = await carregarVendasDoPeriodo(db, ator, input);
  if (!carga.ok) return carga;
  const { periodo, vendas, devolucoes } = carga.data;
  const comLucro = measure === "profit";

  const mapa = new Map<string, Acumulado>();
  const fora: Acumulado = { cent: 0, qty: 0, vendas: 0, estimado: false, semCusto: false };
  let consumidorFinalId: string | null = null;
  if (kind === "customers") {
    const cf = await db.emporioCustomer.findFirst({ where: { system_key: CONSUMIDOR_FINAL_KEY }, select: { id: true } });
    consumidorFinalId = cf?.id ?? null;
  }
  const alvo = (produtoId: string, clienteId: string | null): Acumulado => {
    if (kind === "products") {
      let a = mapa.get(produtoId);
      if (!a) mapa.set(produtoId, (a = { cent: 0, qty: 0, vendas: 0, estimado: false, semCusto: false }));
      return a;
    }
    if (clienteId === null || clienteId === consumidorFinalId) return fora;
    let a = mapa.get(clienteId);
    if (!a) mapa.set(clienteId, (a = { cent: 0, qty: 0, vendas: 0, estimado: false, semCusto: false }));
    return a;
  };
  const custoCent = (unitCost: unknown, baseQty: unknown) =>
    Math.round((decToNum(unitCost as never) ?? 0) * (decToNum(baseQty as never) ?? 0) * 100);

  for (const v of vendas) {
    if (kind === "customers" && !v.exchange_return_id) alvo("", v.customer_id).vendas += 1;
    for (const i of v.items) {
      const a = alvo(i.emporio_product_id, v.customer_id);
      a.cent += centavos(decToNum(i.total) ?? 0);
      a.qty += decToNum(i.base_qty) ?? 0;
      if (comLucro) {
        a.cent -= custoCent(i.unit_cost, i.base_qty);
        if (i.unit_cost === null) a.semCusto = true;
        if (i.cost_estimated || i.cost_provisional) a.estimado = true;
      }
    }
  }
  for (const d of devolucoes) {
    for (const i of d.items) {
      const a = alvo(i.sale_item.emporio_product_id, d.sale.customer_id);
      a.cent -= valorDevolvidoDoItemCent(i);
      a.qty -= decToNum(i.base_qty) ?? 0;
      if (comLucro) a.cent += custoCent(i.sale_item.unit_cost, i.base_qty);
    }
  }

  // Nomes
  const ids = [...mapa.keys()];
  const nomes = new Map<string, { name: string; base_unit?: string }>();
  if (ids.length > 0) {
    if (kind === "products") {
      const ps = await db.emporioProduct.findMany({
        where: { id: { in: ids } },
        select: { id: true, base_unit: true, product: { select: { name: true } } },
      });
      for (const p of ps) nomes.set(p.id, { name: p.product.name, base_unit: p.base_unit });
    } else {
      const cs = await db.emporioCustomer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      for (const c of cs) nomes.set(c.id, { name: c.name });
    }
  }

  const lista = ids
    .map((id) => ({ id, name: nomes.get(id)?.name ?? "", base_unit: nomes.get(id)?.base_unit, a: mapa.get(id) as Acumulado }))
    .sort((x, y) => y.a.cent - x.a.cent || x.name.localeCompare(y.name, "pt-BR"));

  const baseCent = lista.reduce((s, x) => s + (x.a.cent > 0 ? x.a.cent : 0), 0);
  const totalCent = lista.reduce((s, x) => s + x.a.cent, 0) + (kind === "customers" ? fora.cent : 0);
  const comClasses = totalCent > 0 && baseCent > 0;
  // Participações pelo maior resto, em centésimos de ponto: só quem tem valor positivo participa, e a soma fecha em 100,00.
  const partItens = comClasses ? repartirEmCentesimos(lista.map((x) => x.a.cent), baseCent) : lista.map(() => 0);
  let acumuladoCentesimos = 0;
  let acumulado = 0;
  const somaClasse: Record<CurvaAbcClasse, { count: number; cent: number; positivo: number }> = {
    A: { count: 0, cent: 0, positivo: 0 },
    B: { count: 0, cent: 0, positivo: 0 },
    C: { count: 0, cent: 0, positivo: 0 },
  };
  const itens: CurvaAbc["itens"] = lista.map((x, idx) => {
    let classe: CurvaAbcClasse = "C";
    if (comClasses && x.a.cent > 0) {
      // O acumulado ANTES do item decide: quem cruza o corte fica na classe de cima.
      classe = acumulado * 100 < 80 * baseCent ? "A" : acumulado * 100 < 95 * baseCent ? "B" : "C";
      acumulado += x.a.cent;
    }
    if (comClasses) {
      somaClasse[classe].count += 1;
      somaClasse[classe].cent += x.a.cent;
      somaClasse[classe].positivo += x.a.cent > 0 ? x.a.cent : 0;
    }
    acumuladoCentesimos += partItens[idx];
    return {
      posicao: idx + 1,
      id: x.id,
      name: x.name,
      ...(kind === "products"
        ? { quantity: Math.round(x.a.qty * 1000) / 1000, base_unit: x.base_unit }
        : { sales_count: x.a.vendas }),
      amount: reais(x.a.cent),
      share_pct: partItens[idx] / 100,
      cumulative_pct: acumuladoCentesimos / 100,
      classe,
      cost_estimated: x.a.estimado,
      cost_missing: x.a.semCusto,
    };
  });

  const ordemDasClasses = ["A", "B", "C"] as const;
  const partClasses = comClasses ? repartirEmCentesimos(ordemDasClasses.map((c) => somaClasse[c].positivo), baseCent) : [];
  const classes: CurvaAbc["classes"] = comClasses
    ? ordemDasClasses.map((c, k) => ({
        classe: c,
        count: somaClasse[c].count,
        amount: reais(somaClasse[c].cent),
        share_pct: partClasses[k] / 100,
      }))
    : [];

  return ok({
    periodo,
    kind,
    measure,
    total: reais(totalCent),
    classes,
    itens,
    ...(kind === "customers"
      ? { fora_da_curva: { label: ROTULO_FORA_DA_CURVA, amount: reais(fora.cent), sales_count: fora.vendas } }
      : {}),
  });
}
