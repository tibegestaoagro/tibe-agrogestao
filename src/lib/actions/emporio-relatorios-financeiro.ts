import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigir } from "@/lib/emporio/papel";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { diasDeAtraso } from "@/lib/emporio/fiado";
import { faixaDeIdade, type FaixaDeIdade } from "@/lib/emporio/projecao";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { entradasAbertas } from "@/lib/actions/emporio-caixa";
import { lerPosicoes, ROTULO_ORIGEM } from "@/lib/actions/emporio-financeiro";
import { listarContasAPagarAction, TETO_DE_CONTAS_A_PAGAR } from "@/lib/actions/emporio-despesas";

/**
 * Meu Empório, financeiro das lojas, entrega 4: os três relatórios do dinheiro.
 *
 * Só leem, e só para quem lê o dinheiro (`dinheiro`), recortados pelas lojas do ator.
 */

const DIA_MS = 86_400_000;
const PERIODO_MAXIMO_DIAS = 366;
// São Paulo é UTC-3 fixo desde 2019 (o mesmo deslocamento do extrato).
const MEIA_NOITE_SP_EM_UTC_MS = 3 * 3_600_000;

const dia = (d: Date) => d.toISOString().slice(0, 10);
const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const dataValida = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());
const diaDeCalendario = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** A loja pedida (404 se não existe ou o ator não a vê) e o alcance de lojas do ator. */
async function alcance(
  db: TenantPrismaClient,
  ator: Ator,
  establishmentId: unknown,
): Promise<{ lojaId: string | undefined; visiveis: Set<string> | null } | ActionResult<never>> {
  const lojaId = typeof establishmentId === "string" && establishmentId ? establishmentId : undefined;
  const visiveis = await lojasDoAtor(db, ator);
  if (lojaId && ((visiveis && !visiveis.has(lojaId)) || !(await db.establishment.findFirst({ where: { id: lojaId }, select: { id: true } })))) {
    return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
  }
  return { lojaId, visiveis };
}

/** Confere `de` e `ate`: datas válidas, na ordem, e no máximo 366 dias. Devolve o dia de calendário de cada um. */
function conferirPeriodo(input: { de: Date; ate: Date }): { de: Date; ate: Date } | ActionResult<never> {
  if (!dataValida(input?.de)) return fail("VALIDATION_ERROR", "Informe uma data inicial válida.", 422, "de");
  if (!dataValida(input?.ate)) return fail("VALIDATION_ERROR", "Informe uma data final válida.", 422, "ate");
  const de = diaDeCalendario(input.de);
  const ate = diaDeCalendario(input.ate);
  if (ate.getTime() < de.getTime()) return fail("VALIDATION_ERROR", "A data final não pode ser antes da inicial.", 422, "ate");
  if ((ate.getTime() - de.getTime()) / DIA_MS + 1 > PERIODO_MAXIMO_DIAS) {
    return fail("VALIDATION_ERROR", `O período é de até ${PERIODO_MAXIMO_DIAS} dias.`, 422, "ate");
  }
  return { de, ate };
}

const ehRecusa = (x: unknown): x is ActionResult<never> => typeof x === "object" && x !== null && "ok" in x;

// ---------------------------------------------------------------------------
// A receber por idade
// ---------------------------------------------------------------------------

export type LinhaDeIdadeView = Record<FaixaDeIdade, number> & { total: number };

export type AReceberPorIdadeView = {
  today: string;
  customers: ({ customer_id: string; customer_name: string; phone: string | null } & LinhaDeIdadeView)[];
  totals: LinhaDeIdadeView;
};

/** O fiado e as parcelas de acordo em aberto, por cliente e faixa de atraso. É o retrato de hoje: não tem período. */
export async function lerAReceberPorIdadeAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { establishment_id?: string } = {},
): Promise<ActionResult<AReceberPorIdadeView>> {
  const neg = await exigir(db, ator, "dinheiro", "ver o a receber por idade");
  if (neg) return neg;
  const al = await alcance(db, ator, input?.establishment_id);
  if (ehRecusa(al)) return al;
  const { lojaId, visiveis } = al;

  const hoje = hojeEmBrasilia();
  const abertas = await entradasAbertas(db, {
    emporio_customer_id: { not: null },
    ...(lojaId ? { establishment_id: lojaId } : visiveis ? { establishment_id: { in: [...visiveis] } } : {}),
  });

  const vazia = () => ({ em_dia: 0, "1-15": 0, "16-30": 0, "30+": 0, total: 0 }) as Record<FaixaDeIdade, number> & { total: number };
  const porCliente = new Map<string, ReturnType<typeof vazia>>();
  const totais = vazia();
  for (const e of abertas) {
    if (!e.emporio_customer_id || e.open_cent <= 0) continue;
    const faixa = faixaDeIdade(diasDeAtraso(e.effective_due_date, hoje));
    const linha = porCliente.get(e.emporio_customer_id) ?? vazia();
    linha[faixa] += e.open_cent;
    linha.total += e.open_cent;
    porCliente.set(e.emporio_customer_id, linha);
    totais[faixa] += e.open_cent;
    totais.total += e.open_cent;
  }

  const clientes = porCliente.size
    ? await db.emporioCustomer.findMany({ where: { id: { in: [...porCliente.keys()] } }, select: { id: true, name: true, phone: true } })
    : [];
  const dadosDe = new Map(clientes.map((c) => [c.id, c]));
  const reais = (l: ReturnType<typeof vazia>): LinhaDeIdadeView => ({
    em_dia: l.em_dia / 100,
    "1-15": l["1-15"] / 100,
    "16-30": l["16-30"] / 100,
    "30+": l["30+"] / 100,
    total: l.total / 100,
  });

  const customers = [...porCliente.entries()]
    .map(([id, l]) => ({ customer_id: id, customer_name: dadosDe.get(id)?.name ?? "", phone: dadosDe.get(id)?.phone ?? null, ...reais(l) }))
    .sort((a, b) => b.total - a.total || a.customer_name.localeCompare(b.customer_name, "pt-BR"));
  return ok({ today: dia(hoje), customers, totals: reais(totais) });
}

// ---------------------------------------------------------------------------
// A pagar por vencimento
// ---------------------------------------------------------------------------

export type APagarPorVencimentoView = {
  de: string;
  ate: string;
  weeks: { de: string; ate: string; total: number; overdue: boolean; items: { name: string; total: number }[] }[];
  by_name: { name: string; total: number; overdue_total: number }[];
  overdue_total: number;
  total: number;
  notes: string[];
};

const NOTA_TETO_DE_CONTAS = "Mais de 5.000 contas pendentes: a soma considera as 5.000 primeiras.";

/** As contas pendentes do Empório que vencem até o fim do período, por semana de 7 dias a partir de `de` e por nome; o que já venceu (antes de hoje) entra na primeira semana, em destaque, mesmo que seja anterior a `de`. */
export async function lerAPagarPorVencimentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { establishment_id?: string; de: Date; ate: Date },
): Promise<ActionResult<APagarPorVencimentoView>> {
  const neg = await exigir(db, ator, "dinheiro", "ver o a pagar por vencimento");
  if (neg) return neg;
  const periodo = conferirPeriodo(input);
  if (ehRecusa(periodo)) return periodo;
  const al = await alcance(db, ator, input.establishment_id);
  if (ehRecusa(al)) return al;

  const { de, ate } = periodo;
  const hojeTxt = dia(hojeEmBrasilia());
  const contas = await listarContasAPagarAction(db, ator, {
    establishment_id: al.lojaId,
    status: "pending",
    ate: new Date(ate.getTime() + DIA_MS - 1),
    limit: TETO_DE_CONTAS_A_PAGAR,
  });
  if (!contas.ok) return contas;
  const notes: string[] = [];
  if (contas.data.length >= TETO_DE_CONTAS_A_PAGAR) notes.push(NOTA_TETO_DE_CONTAS);

  const dias = Math.round((ate.getTime() - de.getTime()) / DIA_MS) + 1;
  const semanas: { de: string; ate: string; total: number; vencido: boolean; itens: Map<string, number> }[] = [];
  for (let ini = 0; ini < dias; ini += 7) {
    semanas.push({
      de: dia(new Date(de.getTime() + ini * DIA_MS)),
      ate: dia(new Date(de.getTime() + Math.min(ini + 6, dias - 1) * DIA_MS)),
      total: 0,
      vencido: false,
      itens: new Map(),
    });
  }
  const porNome = new Map<string, { total: number; overdue: number }>();
  let total = 0;
  let vencidoTotal = 0;
  for (const c of contas.data) {
    if (!c.due_date) continue;
    // O que já VENCEU (antes de hoje) entra na primeira semana mesmo fora do período: o vencido é justo o
    // que importa. Conta que vence entre hoje e um `de` futuro não venceu nem é do período: fica fora.
    const vencidaAntesDoPeriodo = c.due_date < semanas[0].de && c.due_date < hojeTxt;
    const semana = vencidaAntesDoPeriodo ? semanas[0] : semanas.find((s) => c.due_date! >= s.de && c.due_date! <= s.ate);
    if (!semana) continue;
    const valor = centavos(c.open_amount);
    const vencida = c.due_date < hojeTxt;
    semana.total += valor;
    semana.itens.set(c.name, (semana.itens.get(c.name) ?? 0) + valor);
    if (vencida) semana.vencido = true;
    const n = porNome.get(c.name) ?? { total: 0, overdue: 0 };
    n.total += valor;
    if (vencida) n.overdue += valor;
    porNome.set(c.name, n);
    total += valor;
    if (vencida) vencidoTotal += valor;
  }

  return ok({
    de: dia(de),
    ate: dia(ate),
    weeks: semanas.map((s) => ({
      de: s.de,
      ate: s.ate,
      total: s.total / 100,
      overdue: s.vencido,
      items: [...s.itens.entries()].sort((a, b) => b[1] - a[1]).map(([name, t]) => ({ name, total: t / 100 })),
    })),
    by_name: [...porNome.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, v]) => ({ name, total: v.total / 100, overdue_total: v.overdue / 100 })),
    overdue_total: vencidoTotal / 100,
    total: total / 100,
    notes,
  });
}

// ---------------------------------------------------------------------------
// Posição de caixa por lugar
// ---------------------------------------------------------------------------

export type PosicaoPorLugarView = {
  de: string;
  ate: string;
  places: {
    kind: "gaveta" | "gerencia" | "conta";
    id: string;
    name: string;
    establishment_id: string | null;
    balance: number;
    period: {
      entradas: number;
      saidas: number;
      by_origin: { origin: string; label: string; entradas: number; saidas: number }[];
    };
  }[];
  total_balance: number;
};

/**
 * O saldo de hoje de cada lugar e o que se moveu nele no período, por origem. A conta soma também as parcelas
 * de cartão do período (origem `cartao`): a parcela não tem movimento de caixa, então não conta em dobro.
 */
export async function lerPosicaoPorLugarAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { establishment_id?: string; de: Date; ate: Date },
): Promise<ActionResult<PosicaoPorLugarView>> {
  const neg = await exigir(db, ator, "dinheiro", "ver a posição de caixa por lugar");
  if (neg) return neg;
  const periodo = conferirPeriodo(input);
  if (ehRecusa(periodo)) return periodo;
  const al = await alcance(db, ator, input.establishment_id);
  if (ehRecusa(al)) return al;

  const { de, ate } = periodo;
  const desde = new Date(de.getTime() + MEIA_NOITE_SP_EM_UTC_MS);
  const ateInstante = new Date(ate.getTime() + DIA_MS + MEIA_NOITE_SP_EM_UTC_MS);
  const posicoes = await lerPosicoes(db, { lojaId: al.lojaId, visiveis: al.visiveis, comContas: !al.lojaId });

  // Uma consulta por tabela, distribuída em memória por lugar.
  const movimentos = await db.cashMovement.groupBy({
    by: ["establishment_id", "manager_establishment_id", "bank_account_id", "origin", "direction"],
    where: { occurred_at: { gte: desde, lt: ateInstante } },
    _sum: { amount: true },
  });
  // A parcela de cartão futura não está no saldo (que soma até hoje): fica fora do período também.
  const hojeDia = hojeEmBrasilia();
  const cartaoAte = ate.getTime() < hojeDia.getTime() ? ate : hojeDia;
  const cartoes = await db.cardReceivable.groupBy({
    by: ["bank_account_id"],
    where: { canceled_at: null, expected_on: { gte: de, lte: cartaoAte } },
    _sum: { net_amount: true },
  });
  const cartaoDaConta = new Map(cartoes.map((c) => [c.bank_account_id, centavos(decToNum(c._sum.net_amount) ?? 0)]));

  const places: PosicaoPorLugarView["places"] = [];
  for (const p of posicoes) {
    const doLugar = movimentos.filter((l) =>
      p.kind === "gaveta" ? l.establishment_id === p.id : p.kind === "gerencia" ? l.manager_establishment_id === p.id : l.bank_account_id === p.id,
    );
    const porOrigem = new Map<string, { entradas: number; saidas: number }>();
    const somar = (origin: string, entrada: boolean, cent: number) => {
      const o = porOrigem.get(origin) ?? { entradas: 0, saidas: 0 };
      if (entrada) o.entradas += cent;
      else o.saidas += cent;
      porOrigem.set(origin, o);
    };
    for (const l of doLugar) somar(l.origin, l.direction === "entrada", centavos(decToNum(l._sum.amount) ?? 0));
    if (p.kind === "conta") {
      const v = cartaoDaConta.get(p.id) ?? 0;
      if (v > 0) somar("cartao", true, v);
    }
    const byOrigin = [...porOrigem.entries()]
      .sort((a, b) => b[1].entradas + b[1].saidas - (a[1].entradas + a[1].saidas))
      .map(([origin, v]) => ({ origin, label: ROTULO_ORIGEM[origin] ?? origin, entradas: v.entradas / 100, saidas: v.saidas / 100 }));
    places.push({
      kind: p.kind,
      id: p.id,
      name: p.name,
      establishment_id: p.establishment_id,
      balance: p.balance,
      period: {
        entradas: byOrigin.reduce((s, o) => s + centavos(o.entradas), 0) / 100,
        saidas: byOrigin.reduce((s, o) => s + centavos(o.saidas), 0) / 100,
        by_origin: byOrigin,
      },
    });
  }
  return ok({
    de: dia(de),
    ate: dia(ate),
    places,
    total_balance: places.reduce((s, p) => s + centavos(p.balance), 0) / 100,
  });
}
