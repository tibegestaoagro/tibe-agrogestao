import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigir } from "@/lib/emporio/papel";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { CRITERIOS_AUTOMATICOS, ehCriterioAutomatico } from "@/lib/emporio/rateio";
import { compararMeses, diaDoMes, mesDaData, primeiroDia, somarMeses, textoDoMes, type MesCivil } from "@/lib/emporio/mes";
import { semanasDaJanela } from "@/lib/emporio/projecao";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { entradasAbertas } from "@/lib/actions/emporio-caixa";
import { contasSemVencimento, type SemVencimentoView } from "@/lib/actions/emporio-relatorios-financeiro";
import { lerPosicoes } from "@/lib/actions/emporio-financeiro";
import {
  basesDasLojas,
  garantirOcorrenciasDoMes,
  NOTA_VIROU_AUTOMATICO,
  listarContasAPagarAction,
  partesAutomaticas,
  partesDoMes,
  TETO_DE_CONTAS_A_PAGAR,
} from "@/lib/actions/emporio-despesas";

/**
 * Meu Empório, financeiro das lojas, entrega 4: o fluxo de caixa projetado por semana.
 *
 * Só lê. O saldo de abertura é a soma das posições de hoje (movimentações, nunca um número gravado,
 * invariante 2) e cada semana fecha com o anterior mais o que entra menos o que sai.
 */

const DIA_MS = 86_400_000;

export type SemanaProjetadaView = {
  numero: number;
  de: string;
  ate: string;
  receivables: { fiado: number; cards: number; checks: number; boletos: number; total: number };
  payables: { entries: number; fixed_estimated: number; total: number };
  net: number;
  closing_balance: number;
};

export type FluxoProjetadoView = {
  today: string;
  days: 30 | 60 | 90;
  establishment_id: string | null;
  opening_balance: number;
  weeks: SemanaProjetadaView[];
  closing_balance: number;
  /** As contas pendentes sem vencimento: ficam fora das semanas e do saldo projetado. */
  without_due: SemVencimentoView;
  notes: string[];
};

const NOTA_CONTA = "A conta bancária é da rede inteira e só entra em Todas as lojas.";
const NOTA_ESTIMATIVA = "Despesas fixas dos meses sem conta gerada são estimativa (as automáticas, com a base de hoje).";
const NOTA_TETO_DE_CONTAS = "Mais de 5.000 contas pendentes: a soma considera as 5.000 primeiras.";

const dia = (d: Date) => d.toISOString().slice(0, 10);
const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));

export async function lerFluxoProjetadoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { establishment_id?: string; days: 30 | 60 | 90 },
): Promise<ActionResult<FluxoProjetadoView>> {
  const neg = await exigir(db, ator, "dinheiro", "ver o fluxo de caixa projetado");
  if (neg) return neg;
  const days = input?.days;
  if (days !== 30 && days !== 60 && days !== 90) return fail("VALIDATION_ERROR", "Escolha 30, 60 ou 90 dias.", 422, "days");
  const lojaId = typeof input.establishment_id === "string" && input.establishment_id ? input.establishment_id : undefined;
  const visiveis = await lojasDoAtor(db, ator);
  if (lojaId && ((visiveis && !visiveis.has(lojaId)) || !(await db.establishment.findFirst({ where: { id: lojaId }, select: { id: true } })))) {
    return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
  }
  await garantirOcorrenciasDoMes(db, ator);

  const hoje = hojeEmBrasilia();
  const semanas = semanasDaJanela(hoje, days);
  const ultimoDia = semanas[semanas.length - 1].ate;
  const fimDaJanela = new Date(hoje.getTime() + (days - 1) * DIA_MS);

  /** A semana (índice) do dia; o que já venceu cai na primeira; depois da janela, -1. */
  const semanaDoDia = (d: string): number => {
    if (d > ultimoDia) return -1;
    const i = semanas.findIndex((s) => d <= s.ate);
    return i < 0 ? -1 : i;
  };
  const zeros = () => semanas.map(() => ({ fiado: 0, cards: 0, checks: 0, boletos: 0, entries: 0, fixed: 0 }));
  const acc = zeros();

  const ondeLoja = lojaId
    ? { establishment_id: lojaId }
    : visiveis
      ? { establishment_id: { in: [...visiveis] } }
      : {};

  const posicoes = await lerPosicoes(db, { lojaId, visiveis, comContas: !lojaId });
  const abertura = posicoes.reduce((s, p) => s + centavos(p.balance), 0);

  const abertas = await entradasAbertas(db, { emporio_customer_id: { not: null }, ...ondeLoja });
  for (const e of abertas) {
    const i = semanaDoDia(dia(e.effective_due_date));
    if (i >= 0) acc[i].fiado += e.open_cent;
  }

  const cartoes = await db.cardReceivable.findMany({
    where: { canceled_at: null, effective_on: { gt: hoje, lte: fimDaJanela }, ...ondeLoja },
    select: { effective_on: true, effective_net: true },
  });
  for (const c of cartoes) {
    const i = semanaDoDia(dia(c.effective_on));
    if (i >= 0) acc[i].cards += centavos(decToNum(c.effective_net) ?? 0);
  }

  const cheques = await db.emporioCheck.findMany({
    where: { status: { in: ["recebido", "depositado"] }, good_for: { lte: fimDaJanela }, ...ondeLoja },
    select: { good_for: true, amount: true },
  });
  for (const c of cheques) {
    const i = semanaDoDia(dia(c.good_for));
    if (i >= 0) acc[i].checks += centavos(decToNum(c.amount) ?? 0);
  }

  // Boleto aberto (Q282): entra pelo vencimento; o vencido e não pago cai na primeira semana, como o cheque atrasado.
  const boletos = await db.emporioBoleto.findMany({
    where: { status: "aberto", due_on: { lte: fimDaJanela }, ...ondeLoja },
    select: { due_on: true, amount: true },
  });
  for (const b of boletos) {
    const i = semanaDoDia(dia(b.due_on));
    if (i >= 0) acc[i].boletos += centavos(decToNum(b.amount) ?? 0);
  }

  const contas = await listarContasAPagarAction(db, ator, {
    establishment_id: lojaId,
    status: "pending",
    ate: new Date(hoje.getTime() + days * DIA_MS - 1),
    limit: TETO_DE_CONTAS_A_PAGAR,
  });
  if (!contas.ok) return contas;
  for (const c of contas.data) {
    if (!c.due_date) continue;
    const i = semanaDoDia(c.due_date);
    if (i >= 0) acc[i].entries += centavos(c.open_amount);
  }

  const estimou = await estimarFixas(db, { lojaId, visiveis, hoje, ultimoDia, semanaDoDia, acc });

  const notes: string[] = [];
  if (lojaId) notes.push(NOTA_CONTA);
  if (estimou) notes.push(NOTA_ESTIMATIVA);
  if (contas.data.length >= TETO_DE_CONTAS_A_PAGAR) notes.push(NOTA_TETO_DE_CONTAS);

  const semVenc = await contasSemVencimento(db, ator, lojaId);
  if (!semVenc.ok) return semVenc;
  if (semVenc.data.nota) notes.push(semVenc.data.nota);

  let saldo = abertura;
  const weeks = semanas.map((s, i): SemanaProjetadaView => {
    const a = acc[i];
    const rec = a.fiado + a.cards + a.checks + a.boletos;
    const pag = a.entries + a.fixed;
    saldo += rec - pag;
    return {
      numero: s.numero,
      de: s.de,
      ate: s.ate,
      receivables: { fiado: a.fiado / 100, cards: a.cards / 100, checks: a.checks / 100, boletos: a.boletos / 100, total: rec / 100 },
      payables: { entries: a.entries / 100, fixed_estimated: a.fixed / 100, total: pag / 100 },
      net: (rec - pag) / 100,
      closing_balance: saldo / 100,
    };
  });

  return ok({
    today: dia(hoje),
    days,
    establishment_id: lojaId ?? null,
    opening_balance: abertura / 100,
    weeks,
    closing_balance: saldo / 100,
    without_due: semVenc.data.view,
    notes,
  });
}

/**
 * A despesa fixa ainda sem conta nos meses seguintes (a manual cujo lote de 12 meses acabou, a automática que ainda
 * não nasceu): entra como estimativa na semana do vencimento, com as partes do modelo nos critérios manuais e com a
 * base de agora nos automáticos. O mês que já nasceu (tem ocorrência que a troca de critério não cancelou) entra
 * pela lista de contas, não aqui.
 * Devolve se alguma estimativa maior que zero entrou.
 */
async function estimarFixas(
  db: TenantPrismaClient,
  ctx: {
    lojaId: string | undefined;
    visiveis: Set<string> | null;
    hoje: Date;
    ultimoDia: string;
    semanaDoDia: (d: string) => number;
    acc: { fixed: number }[];
  },
): Promise<boolean> {
  const modelos = await db.fixedExpenseTemplate.findMany({
    where: { ended_at: null },
    select: {
      id: true,
      due_day: true,
      amount: true,
      split_kind: true,
      starts_on: true,
      splits: { select: { establishment_id: true, value: true }, orderBy: { id: "asc" } },
    },
  });
  if (modelos.length === 0) return false;
  const lojas = await db.establishment.findMany({
    where: { archived_at: null },
    select: { id: true, name: true, area_m2: true, employees_count: true },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });
  if (lojas.length === 0) return false;

  const mesDeHoje = mesDaData(ctx.hoje);
  const mesFinal = mesDaData(new Date(`${ctx.ultimoDia}T00:00:00Z`));
  const meses: MesCivil[] = [];
  for (let m = mesDeHoje; compararMeses(m, mesFinal) <= 0; m = somarMeses(m, 1)) meses.push(m);

  const feitas = await db.fixedExpenseOccurrence.findMany({
    where: { template_id: { in: modelos.map((m) => m.id) }, period: { in: meses.map(primeiroDia) } },
    select: { template_id: true, period: true, financial_entry: { select: { status: true, notes: true } } },
  });
  // O mês nasceu quando existe ocorrência dele que não foi cancelada pela troca de manual para automático: a mesma
  // regra do gatilho (`garantirOcorrenciasDoMes`). Nascido, a conta real já está na lista e nada é estimado.
  const nasceu = new Set(
    feitas
      .filter((o) => !(o.financial_entry.status === "cancelled" && (o.financial_entry.notes ?? "").includes(NOTA_VIROU_AUTOMATICO)))
      .map((o) => `${o.template_id}|${textoDoMes(mesDaData(o.period))}`),
  );

  // A base de hoje, uma vez por critério: a estimativa de todos os meses usa a mesma.
  const basesPorCriterio = new Map<string, Awaited<ReturnType<typeof basesDasLojas>>>();
  const basesDe = async (kind: (typeof CRITERIOS_AUTOMATICOS)[number]) => {
    const guardada = basesPorCriterio.get(kind);
    if (guardada) return guardada;
    const b = await basesDasLojas(db, kind, lojas, mesDeHoje);
    basesPorCriterio.set(kind, b);
    return b;
  };

  const hojeTxt = dia(ctx.hoje);
  let estimou = false;
  for (const modelo of modelos) {
    const kind = modelo.split_kind;
    for (const mes of meses) {
      if (compararMeses(mes, mesDaData(modelo.starts_on)) < 0) continue;
      const vencimento = dia(diaDoMes(mes, modelo.due_day));
      if (vencimento < hojeTxt) continue;
      const i = ctx.semanaDoDia(vencimento);
      if (i < 0) continue;
      if (nasceu.has(`${modelo.id}|${textoDoMes(mes)}`)) continue;
      const daLoja = (id: string) => (ctx.lojaId ? id === ctx.lojaId : !ctx.visiveis || ctx.visiveis.has(id));
      let soma = 0;
      if (ehCriterioAutomatico(kind)) {
        const bases = await basesDe(kind);
        const { partes } = partesAutomaticas(centavos(decToNum(modelo.amount) ?? 0), bases.pesos);
        lojas.forEach((l, k) => {
          if (daLoja(l.id)) soma += partes[k];
        });
      } else if (kind === "percentual" || kind === "valor") {
        const partes = partesDoMes(
          kind,
          decToNum(modelo.amount) ?? 0,
          modelo.splits.map((sp) => ({ establishment_id: sp.establishment_id, value: decToNum(sp.value) ?? 0 })),
        );
        for (const [id, parte] of partes) if (daLoja(id)) soma += parte;
      }
      if (soma <= 0) continue;
      ctx.acc[i].fixed += soma;
      estimou = true;
    }
  }
  return estimou;
}
