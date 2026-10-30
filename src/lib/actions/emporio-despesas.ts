import type { Prisma } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { exigir } from "@/lib/emporio/papel";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { acharLojaParaEscrita } from "@/lib/actions/emporio-estoque";
import { saldoDaGaveta, saldosDasContas } from "@/lib/actions/emporio-caixa";
import { CATEGORIAS_RESERVADAS } from "@/lib/emporio/vendeu-pagou";
import {
  compararMeses,
  diaDoMes,
  mesAtualEmBrasilia,
  mesDaData,
  primeiroDia,
  somarMeses,
  textoDoMes,
  type MesCivil,
} from "@/lib/emporio/mes";

/**
 * Meu Empório, F4a: regras do "Vendeu, Pagou", despesa fixa e contas a pagar
 * (Módulo 39, Q97 a Q100).
 *
 * Tudo aqui é de OWNER e ADMIN (o atendente não vê despesa nem resultado), e
 * quem tem vínculo a lojas só enxerga as dele. O dinheiro continua sendo o
 * `FinancialEntry` (a conta a pagar) mais o `FinancialPayment` mais o
 * `CashMovement` de saída; nada de saldo é gravado (invariante 2). A validação
 * é em TypeScript puro, porque o agente do WhatsApp chama estas funções sem
 * passar pelo Zod da rota.
 */

type Tx = Prisma.TransactionClient;

const NAO_ACHADO = (o: string, field?: string) => fail("NOT_FOUND", `${o} não encontrado.`, 404, field);

const arred2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;
const arred4 = (n: number) => Math.round(n * 10000) / 10000;
const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const dataValida = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const idOuNulo = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const diaIso = (d: Date) => d.toISOString().slice(0, 10);

function ehErroUnico(e: unknown): boolean {
  return (e as { code?: unknown })?.code === "P2002";
}

class RecusaDespesa extends Error {
  constructor(public recusa: ActionResult<never>) {
    super("recusa de despesa");
  }
}

async function lojaVisivel(db: TenantPrismaClient, ator: Ator, lojaId: string): Promise<boolean> {
  const v = await lojasDoAtor(db, ator);
  return !v || v.has(lojaId);
}

/** Transação mais longa que a padrão: a despesa fixa grava até 12 meses por loja. */
function transacaoLonga<T>(db: TenantPrismaClient, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => fn(tx as unknown as Tx), { timeout: 30_000, maxWait: 10_000 });
}

// ---------------------------------------------------------------------------
// Regras do "Vendeu, Pagou" (Q97)
// ---------------------------------------------------------------------------

export const TIPOS_DE_REGRA = ["percentual", "fixo_por_venda", "por_unidade", "embalagem"] as const;
export const FORMAS_DA_REGRA = ["dinheiro", "pix", "debito", "credito_vista", "credito_parcelado", "cheque", "fiado"] as const;
type TipoDeRegra = (typeof TIPOS_DE_REGRA)[number];
type FormaDaRegra = (typeof FORMAS_DA_REGRA)[number];

export type RegraVariavelView = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  name: string;
  kind: TipoDeRegra;
  value: number;
  payment_kind: FormaDaRegra | null;
  emporio_product_id: string | null;
  presentation_id: string | null;
  packaging_emporio_product_id: string | null;
  archived_at: string | null;
  created_at: string;
};

type RegraRow = Prisma.VariableExpenseRuleGetPayload<{ include: { establishment: { select: { name: true } } } }>;

const INCLUDE_REGRA = { establishment: { select: { name: true } } } as const;

function viewDaRegra(r: RegraRow): RegraVariavelView {
  return {
    id: r.id,
    establishment_id: r.establishment_id,
    establishment_name: r.establishment.name,
    name: r.name,
    kind: r.kind,
    value: decToNum(r.value) ?? 0,
    payment_kind: r.payment_kind as FormaDaRegra | null,
    emporio_product_id: r.emporio_product_id,
    presentation_id: r.presentation_id,
    packaging_emporio_product_id: r.packaging_emporio_product_id,
    archived_at: isoOrNull(r.archived_at),
    created_at: r.created_at.toISOString(),
  };
}

type RegraDados = {
  name: string;
  kind: TipoDeRegra;
  value: number;
  payment_kind: FormaDaRegra | null;
  emporio_product_id: string | null;
  presentation_id: string | null;
  packaging_emporio_product_id: string | null;
};

async function validarRegra(db: TenantPrismaClient, raw: Record<string, unknown>): Promise<ActionResult<RegraDados>> {
  const name = texto(raw.name);
  if (!name) return fail("VALIDATION_ERROR", "Dê um nome à regra.", 422, "name");
  if (name.length > 80) return fail("VALIDATION_ERROR", "O nome da regra deve ter até 80 caracteres.", 422, "name");
  if (CATEGORIAS_RESERVADAS.some((c) => c.toLowerCase() === name.toLowerCase())) {
    return fail("VALIDATION_ERROR", `"${name}" já é o nome de um lançamento do Empório. Escolha outro nome.`, 422, "name");
  }

  const kind = raw.kind;
  if (!(TIPOS_DE_REGRA as readonly unknown[]).includes(kind)) {
    return fail("VALIDATION_ERROR", "Escolha o cálculo: percentual, fixo por venda, por unidade ou embalagem.", 422, "kind");
  }
  const tipo = kind as TipoDeRegra;

  if (!numero(raw.value)) return fail("VALIDATION_ERROR", "Informe o valor da regra.", 422, "value");
  const value = arred4(raw.value);
  if (tipo === "percentual") {
    if (value < 0 || value > 100) return fail("VALIDATION_ERROR", "O percentual deve ficar entre 0 e 100.", 422, "value");
  } else if (!(value > 0)) {
    return fail("VALIDATION_ERROR", "O valor da regra deve ser maior que zero.", 422, "value");
  }

  let forma: FormaDaRegra | null = null;
  if (raw.payment_kind != null && raw.payment_kind !== "") {
    if (!(FORMAS_DA_REGRA as readonly unknown[]).includes(raw.payment_kind)) {
      return fail("VALIDATION_ERROR", "Escolha uma forma de pagamento válida.", 422, "payment_kind");
    }
    forma = raw.payment_kind as FormaDaRegra;
  }

  const produtoId = idOuNulo(raw.emporio_product_id);
  if (produtoId) {
    const p = await db.emporioProduct.findFirst({ where: { id: produtoId }, select: { id: true } });
    if (!p) return fail("VALIDATION_ERROR", "Escolha um produto do Empório.", 422, "emporio_product_id");
  }
  const apresentacaoId = idOuNulo(raw.presentation_id);
  if (apresentacaoId) {
    const a = await db.productPresentation.findFirst({
      where: { id: apresentacaoId },
      select: { emporio_product_id: true },
    });
    if (!a || (produtoId && a.emporio_product_id !== produtoId)) {
      return fail("VALIDATION_ERROR", "Escolha uma apresentação do produto da regra.", 422, "presentation_id");
    }
  }

  const embalagemId = idOuNulo(raw.packaging_emporio_product_id);
  if (tipo === "embalagem") {
    if (!embalagemId) {
      return fail("VALIDATION_ERROR", "Escolha o produto de embalagem que sai do estoque.", 422, "packaging_emporio_product_id");
    }
    const e = await db.emporioProduct.findFirst({ where: { id: embalagemId }, select: { archived_at: true } });
    if (!e || e.archived_at) {
      return fail("VALIDATION_ERROR", "Escolha um produto de embalagem ativo.", 422, "packaging_emporio_product_id");
    }
  } else if (embalagemId) {
    return fail("VALIDATION_ERROR", "Só a regra de embalagem escolhe produto de embalagem.", 422, "packaging_emporio_product_id");
  }

  return ok({
    name,
    kind: tipo,
    value,
    payment_kind: forma,
    emporio_product_id: produtoId,
    presentation_id: apresentacaoId,
    packaging_emporio_product_id: tipo === "embalagem" ? embalagemId : null,
  });
}

async function regraPorId(db: TenantPrismaClient, id: string): Promise<RegraVariavelView | null> {
  const r = await db.variableExpenseRule.findFirst({ where: { id }, include: INCLUDE_REGRA });
  return r ? viewDaRegra(r) : null;
}

export async function listarRegrasVariaveisAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; incluir_arquivadas?: boolean } = {},
): Promise<ActionResult<RegraVariavelView[]>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "mexer nas despesas da loja");
  if (neg) return neg;
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const rows = await db.variableExpenseRule.findMany({
    where: {
      ...(opts.establishment_id
        ? { establishment_id: opts.establishment_id }
        : visiveis
          ? { establishment_id: { in: [...visiveis] } }
          : {}),
      ...(opts.incluir_arquivadas ? {} : { archived_at: null }),
    },
    include: INCLUDE_REGRA,
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });
  return ok(rows.map(viewDaRegra));
}

export type CriarRegraInput = {
  establishment_id: string;
  name: string;
  kind: string;
  value: number;
  payment_kind?: string | null;
  emporio_product_id?: string | null;
  presentation_id?: string | null;
  packaging_emporio_product_id?: string | null;
};

export async function criarRegraVariavelAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: CriarRegraInput,
): Promise<ActionResult<RegraVariavelView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "mexer nas despesas da loja");
  if (neg) return neg;
  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;
  const dados = await validarRegra(db, (input ?? {}) as unknown as Record<string, unknown>);
  if (!dados.ok) return dados;

  const criada = await db.variableExpenseRule.create({
    data: scoped({ ...dados.data, establishment_id: loja.data.id, updated_by_user_id: ator.id }),
    include: INCLUDE_REGRA,
  });
  return ok(viewDaRegra(criada));
}

export type EditarRegraInput = Partial<Omit<CriarRegraInput, "establishment_id">> & { archived?: boolean };

export async function editarRegraVariavelAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  patch: EditarRegraInput,
): Promise<ActionResult<RegraVariavelView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "mexer nas despesas da loja");
  if (neg) return neg;
  const atual = await db.variableExpenseRule.findFirst({ where: { id } });
  if (!atual || !(await lojaVisivel(db, ator, atual.establishment_id))) return NAO_ACHADO("Regra");

  const p = (patch ?? {}) as Record<string, unknown>;
  const camposDaRegra = ["name", "kind", "value", "payment_kind", "emporio_product_id", "presentation_id", "packaging_emporio_product_id"];
  const mexeNaRegra = camposDaRegra.some((c) => p[c] !== undefined);
  if (!mexeNaRegra && p.archived === undefined) {
    return fail("VALIDATION_ERROR", "Nada para alterar.", 422, "name");
  }
  if (p.archived !== undefined && typeof p.archived !== "boolean") {
    return fail("VALIDATION_ERROR", "Informe se a regra fica arquivada ou não.", 422, "archived");
  }

  let dados: RegraDados | null = null;
  if (mexeNaRegra) {
    if (atual.archived_at && p.archived !== false) {
      return fail("VALIDATION_ERROR", "Reative a regra antes de alterá-la.", 422, "name");
    }
    const mesclado: Record<string, unknown> = {
      name: atual.name,
      kind: atual.kind,
      value: decToNum(atual.value),
      payment_kind: atual.payment_kind,
      emporio_product_id: atual.emporio_product_id,
      presentation_id: atual.presentation_id,
      packaging_emporio_product_id: atual.packaging_emporio_product_id,
    };
    for (const c of camposDaRegra) if (p[c] !== undefined) mesclado[c] = p[c];
    const v = await validarRegra(db, mesclado);
    if (!v.ok) return v;
    dados = v.data;
  }

  const arquivada = p.archived === undefined ? undefined : p.archived ? (atual.archived_at ?? new Date()) : null;
  await db.variableExpenseRule.update({
    where: { id },
    data: { ...(dados ?? {}), ...(arquivada === undefined ? {} : { archived_at: arquivada }), updated_by_user_id: ator.id },
  });
  const v = await regraPorId(db, id);
  return v ? ok(v) : NAO_ACHADO("Regra");
}

// ---------------------------------------------------------------------------
// Despesa fixa mensal (Q25, Q100)
// ---------------------------------------------------------------------------

export const MESES_GERADOS = 12;

export type DespesaFixaView = {
  id: string;
  name: string;
  category: string;
  amount: number;
  due_day: number;
  split_kind: "percentual" | "valor";
  starts_on: string;
  ended_at: string | null;
  splits: { establishment_id: string; establishment_name: string; value: number }[];
  /** Último mês com conta gerada (AAAA-MM), ou nulo. */
  generated_until: string | null;
  /** Quantos meses, do atual em diante, já têm conta gerada. */
  months_ahead: number;
  /** A tela oferece "Renovar" quando faltam menos de 3 meses gerados e a despesa não foi encerrada. */
  needs_renewal: boolean;
  created_at: string;
};

const INCLUDE_FIXA = {
  splits: { include: { establishment: { select: { name: true } } }, orderBy: { id: "asc" } },
} as const;

type FixaRow = Prisma.FixedExpenseTemplateGetPayload<{ include: typeof INCLUDE_FIXA }>;

async function viewsDasFixas(db: TenantPrismaClient, ator: Ator, linhas: FixaRow[]): Promise<DespesaFixaView[]> {
  if (linhas.length === 0) return [];
  const visiveis = await lojasDoAtor(db, ator);
  const ocorrencias = await db.fixedExpenseOccurrence.findMany({
    where: { template_id: { in: linhas.map((l) => l.id) } },
    select: { template_id: true, period: true },
  });
  const atual = mesAtualEmBrasilia();
  return linhas.map((t) => {
    const meses = new Set(
      ocorrencias.filter((o) => o.template_id === t.id).map((o) => textoDoMes(mesDaData(o.period))),
    );
    const daquiPraFrente = [...meses].filter((m) => m >= textoDoMes(atual));
    const ultimo = [...meses].sort().pop() ?? null;
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      amount: decToNum(t.amount) ?? 0,
      due_day: t.due_day,
      split_kind: t.split_kind,
      starts_on: diaIso(t.starts_on),
      ended_at: isoOrNull(t.ended_at),
      splits: t.splits
        .filter((s) => !visiveis || visiveis.has(s.establishment_id))
        .map((s) => ({
          establishment_id: s.establishment_id,
          establishment_name: s.establishment.name,
          value: decToNum(s.value) ?? 0,
        })),
      generated_until: ultimo,
      months_ahead: daquiPraFrente.length,
      needs_renewal: !t.ended_at && daquiPraFrente.length < 3,
      created_at: t.created_at.toISOString(),
    };
  });
}

async function fixaPorId(db: TenantPrismaClient, ator: Ator, id: string): Promise<DespesaFixaView | null> {
  const t = await db.fixedExpenseTemplate.findFirst({ where: { id }, include: INCLUDE_FIXA });
  if (!t) return null;
  const [v] = await viewsDasFixas(db, ator, [t]);
  return v ?? null;
}

/** O modelo é do ator quando todas as lojas do rateio estão no vínculo dele (sem vínculo, todas). */
async function fixaVisivelParaEscrita(db: TenantPrismaClient, ator: Ator, id: string) {
  const t = await db.fixedExpenseTemplate.findFirst({ where: { id }, include: INCLUDE_FIXA });
  if (!t) return null;
  const visiveis = await lojasDoAtor(db, ator);
  if (visiveis && !t.splits.every((s) => visiveis.has(s.establishment_id))) return null;
  return t;
}

export async function listarDespesasFixasAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { incluir_encerradas?: boolean } = {},
): Promise<ActionResult<DespesaFixaView[]>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "mexer nas despesas da loja");
  if (neg) return neg;
  const visiveis = await lojasDoAtor(db, ator);
  const linhas = await db.fixedExpenseTemplate.findMany({
    where: {
      ...(opts.incluir_encerradas ? {} : { ended_at: null }),
      ...(visiveis ? { splits: { some: { establishment_id: { in: [...visiveis] } } } } : {}),
    },
    include: INCLUDE_FIXA,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
  });
  return ok(await viewsDasFixas(db, ator, linhas));
}

type FixaDados = {
  name: string;
  category: string;
  amount: number;
  due_day: number;
  split_kind: "percentual" | "valor";
  splits: { establishment_id: string; value: number }[];
};

async function validarFixa(db: TenantPrismaClient, ator: Ator, raw: Record<string, unknown>): Promise<ActionResult<FixaDados>> {
  const name = texto(raw.name);
  if (!name) return fail("VALIDATION_ERROR", "Dê um nome à despesa.", 422, "name");
  if (name.length > 80) return fail("VALIDATION_ERROR", "O nome da despesa deve ter até 80 caracteres.", 422, "name");
  const category = texto(raw.category) || name;
  if (CATEGORIAS_RESERVADAS.some((c) => c.toLowerCase() === category.toLowerCase())) {
    return fail("VALIDATION_ERROR", `"${category}" já é a categoria de um lançamento do Empório. Escolha outra.`, 422, "category");
  }

  if (!numero(raw.amount) || centavos(raw.amount) <= 0) {
    return fail("VALIDATION_ERROR", "O valor da despesa deve ser maior que zero.", 422, "amount");
  }
  const amount = arred2(raw.amount);

  if (!numero(raw.due_day) || !Number.isInteger(raw.due_day) || raw.due_day < 1 || raw.due_day > 31) {
    return fail("VALIDATION_ERROR", "O dia do vencimento deve ser de 1 a 31.", 422, "due_day");
  }

  if (raw.split_kind !== "percentual" && raw.split_kind !== "valor") {
    return fail("VALIDATION_ERROR", "Escolha como dividir entre as lojas: por percentual ou por valor.", 422, "split_kind");
  }
  const splitKind = raw.split_kind;

  if (!Array.isArray(raw.splits) || raw.splits.length === 0) {
    return fail("VALIDATION_ERROR", "Escolha ao menos uma loja para a despesa.", 422, "splits");
  }
  const vistas = new Set<string>();
  const splits: FixaDados["splits"] = [];
  for (const s of raw.splits as { establishment_id?: unknown; value?: unknown }[]) {
    const lojaId = idOuNulo(s?.establishment_id);
    if (!lojaId) return fail("VALIDATION_ERROR", "Escolha a loja de cada parte.", 422, "splits");
    if (vistas.has(lojaId)) return fail("VALIDATION_ERROR", "A mesma loja aparece mais de uma vez.", 422, "splits");
    vistas.add(lojaId);
    if (!numero(s.value) || centavos(s.value) <= 0) {
      return fail("VALIDATION_ERROR", "A parte de cada loja deve ser maior que zero.", 422, "splits");
    }
    const loja = await acharLojaParaEscrita(db, ator, lojaId);
    if (!loja.ok) return fail(loja.code, loja.message, loja.status, "splits");
    splits.push({ establishment_id: lojaId, value: arred2(s.value) });
  }
  const somaCent = splits.reduce((t, s) => t + centavos(s.value), 0);
  if (splitKind === "percentual" && somaCent !== 10000) {
    return fail(
      "VALIDATION_ERROR",
      `Os percentuais somam ${(somaCent / 100).toLocaleString("pt-BR")}%: precisam fechar 100%.`,
      422,
      "splits",
    );
  }
  if (splitKind === "valor" && somaCent !== centavos(amount)) {
    return fail(
      "VALIDATION_ERROR",
      `As partes somam ${brl(somaCent / 100)}: precisam fechar o valor da despesa (${brl(amount)}).`,
      422,
      "splits",
    );
  }
  return ok({ name, category, amount, due_day: raw.due_day, split_kind: splitKind, splits });
}

/** O valor de cada loja num mês, em centavos. No percentual, o centavo que sobra fica na primeira loja. */
function partesDoMes(
  splitKind: "percentual" | "valor",
  amount: number,
  splits: { establishment_id: string; value: number }[],
): Map<string, number> {
  const totalCent = centavos(amount);
  const partes = new Map<string, number>();
  if (splitKind === "valor") {
    for (const s of splits) partes.set(s.establishment_id, centavos(s.value));
    return partes;
  }
  let usado = 0;
  for (const s of splits) {
    const parte = Math.floor((totalCent * centavos(s.value)) / 10000);
    partes.set(s.establishment_id, parte);
    usado += parte;
  }
  const primeira = splits[0].establishment_id;
  partes.set(primeira, (partes.get(primeira) ?? 0) + (totalCent - usado));
  return partes;
}

async function criarOcorrencia(
  tx: Tx,
  t: { id: string; category: string; due_day: number },
  lojaId: string,
  mes: MesCivil,
  parteCent: number,
): Promise<boolean> {
  if (parteCent <= 0) return false;
  const vencimento = diaDoMes(mes, t.due_day);
  const conta = await createLinkedEntry(tx, {
    entry_type: "expense",
    category: t.category,
    amount: parteCent / 100,
    related_module: "emporio",
    related_id: t.id,
    occurred_at: vencimento,
    status: "pending",
    due_date: vencimento,
    establishment_id: lojaId,
  });
  await tx.fixedExpenseOccurrence.create({
    data: scoped({
      template_id: t.id,
      establishment_id: lojaId,
      period: primeiroDia(mes),
      financial_entry_id: conta.id,
    }),
  });
  return true;
}

/** Quais lançamentos já têm pagamento: esses não se mexem mais. */
async function comPagamento(tx: Tx, entryIds: string[]): Promise<Set<string>> {
  if (entryIds.length === 0) return new Set();
  const pagos = await tx.financialPayment.findMany({
    where: { entry_id: { in: entryIds } },
    select: { entry_id: true },
    distinct: ["entry_id"],
  });
  return new Set(pagos.map((p) => p.entry_id));
}

export type CriarDespesaFixaInput = {
  name: string;
  category?: string | null;
  amount: number;
  due_day: number;
  split_kind: string;
  starts_on?: Date | null;
  splits: { establishment_id: string; value: number }[];
};

export async function criarDespesaFixaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: CriarDespesaFixaInput,
): Promise<ActionResult<DespesaFixaView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "mexer nas despesas da loja");
  if (neg) return neg;
  const raw = (input ?? {}) as unknown as Record<string, unknown>;
  const dados = await validarFixa(db, ator, raw);
  if (!dados.ok) return dados;

  let inicio: MesCivil;
  if (raw.starts_on == null) {
    inicio = mesAtualEmBrasilia();
  } else {
    if (!dataValida(raw.starts_on)) return fail("VALIDATION_ERROR", "Informe uma data de início válida.", 422, "starts_on");
    inicio = mesDaData(raw.starts_on);
  }

  const d = dados.data;
  const partes = partesDoMes(d.split_kind, d.amount, d.splits);
  const id = await transacaoLonga(db, async (tx) => {
    const t = await tx.fixedExpenseTemplate.create({
      data: scoped({
        name: d.name,
        category: d.category,
        amount: d.amount,
        due_day: d.due_day,
        split_kind: d.split_kind,
        starts_on: primeiroDia(inicio),
        created_by_user_id: ator.id,
        updated_by_user_id: ator.id,
      }),
    });
    await tx.fixedExpenseSplit.createMany({
      data: d.splits.map((s) => scoped({ template_id: t.id, establishment_id: s.establishment_id, value: s.value })),
    });
    for (let n = 0; n < MESES_GERADOS; n++) {
      for (const s of d.splits) {
        await criarOcorrencia(tx, t, s.establishment_id, somarMeses(inicio, n), partes.get(s.establishment_id) ?? 0);
      }
    }
    return t.id;
  });
  const v = await fixaPorId(db, ator, id);
  return v ? ok(v) : NAO_ACHADO("Despesa fixa");
}

export type EditarDespesaFixaInput = Partial<Omit<CriarDespesaFixaInput, "starts_on">>;

export async function editarDespesaFixaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  patch: EditarDespesaFixaInput,
): Promise<ActionResult<DespesaFixaView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "mexer nas despesas da loja");
  if (neg) return neg;
  const t = await fixaVisivelParaEscrita(db, ator, id);
  if (!t) return NAO_ACHADO("Despesa fixa");
  if (t.ended_at) return fail("EXPENSE_ENDED", "Essa despesa foi encerrada e não pode mais ser alterada.", 409);

  const p = (patch ?? {}) as Record<string, unknown>;
  const mesclado: Record<string, unknown> = {
    name: t.name,
    category: t.category,
    amount: decToNum(t.amount),
    due_day: t.due_day,
    split_kind: t.split_kind,
    splits: t.splits.map((s) => ({ establishment_id: s.establishment_id, value: decToNum(s.value) ?? 0 })),
  };
  // Mudar o valor ou o tipo de divisão sem mandar o rateio novo deixaria o rateio antigo incoerente: a validação recusa em `splits`.
  for (const c of Object.keys(mesclado)) if (p[c] !== undefined) mesclado[c] = p[c];
  if (p.category === null || p.category === "") mesclado.category = mesclado.name;
  const dados = await validarFixa(db, ator, mesclado);
  if (!dados.ok) return dados;
  const d = dados.data;
  const partes = partesDoMes(d.split_kind, d.amount, d.splits);
  const atual = mesAtualEmBrasilia();

  await transacaoLonga(db, async (tx) => {
    await tx.fixedExpenseTemplate.update({
      where: { id },
      data: {
        name: d.name,
        category: d.category,
        amount: d.amount,
        due_day: d.due_day,
        split_kind: d.split_kind,
        updated_by_user_id: ator.id,
      },
    });
    await tx.fixedExpenseSplit.deleteMany({ where: { template_id: id } });
    await tx.fixedExpenseSplit.createMany({
      data: d.splits.map((s) => scoped({ template_id: id, establishment_id: s.establishment_id, value: s.value })),
    });

    const ocorrencias = await tx.fixedExpenseOccurrence.findMany({
      where: { template_id: id },
      select: { id: true, establishment_id: true, period: true, financial_entry_id: true },
    });
    if (ocorrencias.length === 0) return;
    const inicioJanela = compararMeses(mesDaData(t.starts_on), atual) > 0 ? mesDaData(t.starts_on) : atual;
    const ultimo = ocorrencias.map((o) => mesDaData(o.period)).sort(compararMeses).pop() as MesCivil;
    const pagas = await comPagamento(tx, ocorrencias.map((o) => o.financial_entry_id));
    const porChave = new Map(ocorrencias.map((o) => [`${o.establishment_id}|${textoDoMes(mesDaData(o.period))}`, o]));
    const nova = { id, category: d.category, due_day: d.due_day };

    for (let m = inicioJanela; compararMeses(m, ultimo) <= 0; m = somarMeses(m, 1)) {
      for (const s of d.splits) {
        const parte = partes.get(s.establishment_id) ?? 0;
        const existente = porChave.get(`${s.establishment_id}|${textoDoMes(m)}`);
        if (!existente) {
          await criarOcorrencia(tx, nova, s.establishment_id, m, parte);
          continue;
        }
        if (pagas.has(existente.financial_entry_id)) continue;
        const vencimento = diaDoMes(m, d.due_day);
        await tx.financialEntry.update({
          where: { id: existente.financial_entry_id },
          data:
            parte > 0
              ? {
                  amount: parte / 100,
                  category: d.category,
                  due_date: vencimento,
                  status: "pending",
                  paid_at: null,
                  updated_by_user_id: ator.id,
                }
              : { status: "cancelled", updated_by_user_id: ator.id },
        });
      }
      // A loja que saiu do rateio: a conta futura sem pagamento é cancelada.
      for (const o of ocorrencias) {
        if (textoDoMes(mesDaData(o.period)) !== textoDoMes(m)) continue;
        if (d.splits.some((s) => s.establishment_id === o.establishment_id)) continue;
        if (pagas.has(o.financial_entry_id)) continue;
        await tx.financialEntry.update({
          where: { id: o.financial_entry_id },
          data: { status: "cancelled", updated_by_user_id: ator.id },
        });
      }
    }
  });
  const v = await fixaPorId(db, ator, id);
  return v ? ok(v) : NAO_ACHADO("Despesa fixa");
}

export async function encerrarDespesaFixaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<DespesaFixaView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "mexer nas despesas da loja");
  if (neg) return neg;
  const t = await fixaVisivelParaEscrita(db, ator, id);
  if (!t) return NAO_ACHADO("Despesa fixa");
  if (t.ended_at) return fail("EXPENSE_ENDED", "Essa despesa já foi encerrada.", 409);

  const atual = mesAtualEmBrasilia();
  await transacaoLonga(db, async (tx) => {
    await tx.fixedExpenseTemplate.update({ where: { id }, data: { ended_at: new Date(), updated_by_user_id: ator.id } });
    const futuras = await tx.fixedExpenseOccurrence.findMany({
      where: { template_id: id, period: { gt: primeiroDia(atual) } },
      select: { financial_entry_id: true },
    });
    const pagas = await comPagamento(tx, futuras.map((o) => o.financial_entry_id));
    const livres = futuras.map((o) => o.financial_entry_id).filter((e) => !pagas.has(e));
    if (livres.length > 0) {
      await tx.financialEntry.updateMany({
        where: { id: { in: livres }, status: "pending" },
        data: { status: "cancelled", updated_by_user_id: ator.id },
      });
    }
  });
  const v = await fixaPorId(db, ator, id);
  return v ? ok(v) : NAO_ACHADO("Despesa fixa");
}

export async function renovarDespesaFixaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<DespesaFixaView & { created: number }>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "mexer nas despesas da loja");
  if (neg) return neg;
  const t = await fixaVisivelParaEscrita(db, ator, id);
  if (!t) return NAO_ACHADO("Despesa fixa");
  if (t.ended_at) return fail("EXPENSE_ENDED", "Essa despesa foi encerrada: cadastre uma nova.", 409);

  const atual = mesAtualEmBrasilia();
  const comeco = compararMeses(mesDaData(t.starts_on), atual) > 0 ? mesDaData(t.starts_on) : atual;
  const splits = t.splits.map((s) => ({ establishment_id: s.establishment_id, value: decToNum(s.value) ?? 0 }));
  const partes = partesDoMes(t.split_kind, decToNum(t.amount) ?? 0, splits);

  try {
    const criadas = await transacaoLonga(db, async (tx) => {
      const existentes = await tx.fixedExpenseOccurrence.findMany({
        where: { template_id: id },
        select: { establishment_id: true, period: true },
      });
      const chaves = new Set(existentes.map((o) => `${o.establishment_id}|${textoDoMes(mesDaData(o.period))}`));
      let n = 0;
      for (let i = 0; i < MESES_GERADOS; i++) {
        const m = somarMeses(comeco, i);
        for (const s of splits) {
          if (chaves.has(`${s.establishment_id}|${textoDoMes(m)}`)) continue;
          if (await criarOcorrencia(tx, t, s.establishment_id, m, partes.get(s.establishment_id) ?? 0)) n++;
        }
      }
      return n;
    });
    const v = await fixaPorId(db, ator, id);
    return v ? ok({ ...v, created: criadas }) : NAO_ACHADO("Despesa fixa");
  } catch (err) {
    // Duas renovações ao mesmo tempo: a segunda esbarra no único por modelo, loja e mês.
    if (ehErroUnico(err)) return fail("CONFLICT", "A despesa foi renovada ao mesmo tempo. Tente de novo.", 409);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Contas a pagar do Empório (Q98, Q100)
// ---------------------------------------------------------------------------

export type ContaAPagarView = {
  entry_id: string;
  origin: "vendeu_pagou" | "despesa_fixa";
  name: string;
  category: string | null;
  establishment_id: string | null;
  establishment_name: string | null;
  amount: number;
  paid_amount: number;
  open_amount: number;
  due_date: string | null;
  status: "pending" | "paid" | "cancelled";
  sale_id: string | null;
  sale_variable_expense_id: string | null;
  template_id: string | null;
  period: string | null;
  /** Corrigir só vale em conta pendente e sem pagamento. */
  can_correct: boolean;
};

const INCLUDE_CONTA = {
  payments: { select: { amount: true } },
  establishment: { select: { name: true } },
  sale_variable_expense: { include: { rule: { select: { name: true } } } },
  fixed_occurrence: { include: { template: { select: { id: true, name: true } } } },
} as const;

type ContaRow = Prisma.FinancialEntryGetPayload<{ include: typeof INCLUDE_CONTA }>;

function viewDaConta(e: ContaRow): ContaAPagarView | null {
  const sve = e.sale_variable_expense;
  const occ = e.fixed_occurrence;
  if (!sve && !occ) return null;
  const valorCent = centavos(decToNum(e.amount) ?? 0);
  const pagoCent = e.payments.reduce((s, p) => s + centavos(decToNum(p.amount) ?? 0), 0);
  const aberto = e.status === "cancelled" ? 0 : Math.max(0, valorCent - pagoCent);
  return {
    entry_id: e.id,
    origin: sve ? "vendeu_pagou" : "despesa_fixa",
    name: sve ? sve.rule.name : (occ?.template.name ?? ""),
    category: e.category,
    establishment_id: e.establishment_id,
    establishment_name: e.establishment?.name ?? null,
    amount: valorCent / 100,
    paid_amount: pagoCent / 100,
    open_amount: aberto / 100,
    due_date: e.due_date ? diaIso(e.due_date) : null,
    status: e.status as ContaAPagarView["status"],
    sale_id: sve ? sve.sale_id : null,
    sale_variable_expense_id: sve?.id ?? null,
    template_id: occ ? occ.template_id : null,
    period: occ ? textoDoMes(mesDaData(occ.period)) : null,
    can_correct: e.status === "pending" && pagoCent === 0,
  };
}

const SO_DO_EMPORIO = [{ sale_variable_expense: { isNot: null } }, { fixed_occurrence: { isNot: null } }];

export async function listarContasAPagarAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: {
    establishment_id?: string;
    status?: "pending" | "paid" | "cancelled" | "all";
    de?: Date;
    ate?: Date;
    limit?: number;
  } = {},
): Promise<ActionResult<ContaAPagarView[]>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "mexer nas despesas da loja");
  if (neg) return neg;
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const status = opts.status ?? "pending";
  if (status !== "all" && status !== "pending" && status !== "paid" && status !== "cancelled") {
    return fail("VALIDATION_ERROR", "Escolha um status válido.", 422, "status");
  }
  const vencimento: Record<string, Date> = {};
  if (dataValida(opts.de)) vencimento.gte = opts.de;
  if (dataValida(opts.ate)) vencimento.lte = opts.ate;
  const limite = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 500) : 200;

  const linhas = await db.financialEntry.findMany({
    where: {
      related_module: "emporio",
      entry_type: "expense",
      OR: SO_DO_EMPORIO,
      ...(opts.establishment_id
        ? { establishment_id: opts.establishment_id }
        : visiveis
          ? { establishment_id: { in: [...visiveis] } }
          : {}),
      ...(status === "all" ? {} : { status }),
      ...(Object.keys(vencimento).length > 0 ? { due_date: vencimento } : {}),
    },
    include: INCLUDE_CONTA,
    orderBy: [{ due_date: "asc" }, { created_at: "asc" }],
    take: limite,
  });
  return ok(linhas.map(viewDaConta).filter((v): v is ContaAPagarView => v !== null));
}

async function acharContaDoEmporio(db: TenantPrismaClient, ator: Ator, entryId: unknown): Promise<ContaRow | null> {
  if (typeof entryId !== "string" || !entryId) return null;
  const e = await db.financialEntry.findFirst({
    where: { id: entryId, related_module: "emporio", entry_type: "expense", OR: SO_DO_EMPORIO },
    include: INCLUDE_CONTA,
  });
  if (!e) return null;
  if (e.establishment_id && !(await lojaVisivel(db, ator, e.establishment_id))) return null;
  return e;
}

export async function corrigirDespesaAction(
  db: TenantPrismaClient,
  ator: Ator,
  entry_id: string,
  input: { amount: number },
): Promise<ActionResult<ContaAPagarView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "mexer nas despesas da loja");
  if (neg) return neg;
  const conta = await acharContaDoEmporio(db, ator, entry_id);
  if (!conta) return NAO_ACHADO("Conta", "entry_id");
  if (!numero(input?.amount) || centavos(input.amount) <= 0) {
    return fail("VALIDATION_ERROR", "O valor da conta deve ser maior que zero.", 422, "amount");
  }
  const novo = arred2(input.amount);

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      // Relê dentro da transação: um pagamento que entrou agora fecha a correção.
      const e = await tx.financialEntry.findFirst({ where: { id: conta.id }, select: { status: true } });
      const pagamentos = await tx.financialPayment.count({ where: { entry_id: conta.id } });
      if (pagamentos > 0 || e?.status === "paid") {
        throw new RecusaDespesa(fail("ENTRY_PAID", "Essa conta já tem pagamento: não dá para corrigir o valor.", 409, "amount"));
      }
      if (e?.status === "cancelled") {
        throw new RecusaDespesa(fail("ENTRY_CANCELED", "Essa conta foi cancelada.", 409, "amount"));
      }
      await tx.financialEntry.update({
        where: { id: conta.id },
        data: { amount: novo, updated_by_user_id: ator.id },
      });
      const sve = conta.sale_variable_expense;
      if (sve) {
        const snapshot = (sve.rule_snapshot ?? {}) as Record<string, unknown>;
        await tx.saleVariableExpense.update({
          where: { id: sve.id },
          data: {
            amount: novo,
            rule_snapshot: {
              ...snapshot,
              original_amount: snapshot.original_amount ?? decToNum(sve.amount),
            } as Prisma.InputJsonValue,
          },
        });
      }
    });
  } catch (err) {
    if (err instanceof RecusaDespesa) return err.recusa;
    throw err;
  }
  const atualizada = await acharContaDoEmporio(db, ator, entry_id);
  const v = atualizada ? viewDaConta(atualizada) : null;
  return v ? ok(v) : NAO_ACHADO("Conta", "entry_id");
}

export type OrigemDoPagamento = { establishment_id?: string | null; bank_account_id?: string | null };

export type PagarDespesasInput = {
  entry_ids: string[];
  paid_at?: Date | null;
  from: OrigemDoPagamento;
};

export type PagamentoDeContasView = {
  paid_at: string;
  total: number;
  from: { establishment_id: string | null; bank_account_id: string | null };
  payments: { entry_id: string; amount: number; financial_payment_id: string }[];
};

export async function pagarDespesasAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: PagarDespesasInput,
): Promise<ActionResult<PagamentoDeContasView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "mexer nas despesas da loja");
  if (neg) return neg;

  const ids = Array.isArray(input?.entry_ids) ? input.entry_ids : [];
  if (ids.length === 0 || ids.some((i) => typeof i !== "string" || !i)) {
    return fail("VALIDATION_ERROR", "Escolha ao menos uma conta para pagar.", 422, "entry_ids");
  }
  if (new Set(ids).size !== ids.length) {
    return fail("VALIDATION_ERROR", "A mesma conta aparece mais de uma vez.", 422, "entry_ids");
  }

  const lojaId = idOuNulo(input.from?.establishment_id);
  const contaId = idOuNulo(input.from?.bank_account_id);
  if ((lojaId === null) === (contaId === null)) {
    return fail("VALIDATION_ERROR", "Diga de onde sai o dinheiro: uma loja OU uma conta.", 422, "from");
  }
  if (lojaId) {
    const loja = await db.establishment.findFirst({ where: { id: lojaId }, select: { id: true } });
    if (!loja || !(await lojaVisivel(db, ator, lojaId))) return NAO_ACHADO("Estabelecimento", "from");
  } else {
    const conta = await db.bankAccount.findFirst({ where: { id: contaId as string }, select: { id: true } });
    if (!conta) return NAO_ACHADO("Conta", "from");
  }

  let pagoEm = new Date();
  if (input.paid_at != null) {
    if (!dataValida(input.paid_at)) return fail("VALIDATION_ERROR", "Informe uma data de pagamento válida.", 422, "paid_at");
    pagoEm = input.paid_at;
  }

  try {
    const feitos = await runSerializableTenantTransaction(db, async (tx) => {
      const leitor = tx as unknown as TenantPrismaClient;
      const contas: ContaRow[] = [];
      for (const id of ids) {
        const c = await acharContaDoEmporio(leitor, ator, id);
        if (!c) {
          throw new RecusaDespesa(fail("VALIDATION_ERROR", "Uma das contas não é uma conta do Empório.", 422, "entry_ids"));
        }
        const v = viewDaConta(c);
        if (!v || v.status !== "pending" || !(v.open_amount > 0)) {
          throw new RecusaDespesa(
            fail("VALIDATION_ERROR", `A conta "${v?.name ?? id}" já foi paga ou cancelada.`, 422, "entry_ids"),
          );
        }
        contas.push(c);
      }
      const abertoCent = contas.map((c) => {
        const pago = c.payments.reduce((s, p) => s + centavos(decToNum(p.amount) ?? 0), 0);
        return centavos(decToNum(c.amount) ?? 0) - pago;
      });
      const totalCent = abertoCent.reduce((s, v) => s + v, 0);

      const saldo = lojaId
        ? await saldoDaGaveta(leitor, lojaId)
        : ((await saldosDasContas(leitor)).get(contaId as string) ?? 0);
      if (saldo < totalCent) {
        throw new RecusaDespesa(
          fail(
            "INSUFFICIENT_CASH",
            `Saldo insuficiente: há ${brl(saldo / 100)} e as contas somam ${brl(totalCent / 100)}.`,
            409,
            "from",
          ),
        );
      }

      const pagos: PagamentoDeContasView["payments"] = [];
      for (let n = 0; n < contas.length; n++) {
        const c = contas[n];
        const valor = abertoCent[n] / 100;
        const fp = await tx.financialPayment.create({
          data: scoped({
            entry_id: c.id,
            amount: valor,
            paid_at: pagoEm,
            method: lojaId ? ("dinheiro" as const) : ("outro" as const),
            created_by_user_id: ator.id,
          }),
        });
        await tx.financialEntry.update({
          where: { id: c.id },
          data: { status: "paid", paid_at: pagoEm, updated_by_user_id: ator.id },
        });
        await tx.cashMovement.create({
          data: scoped({
            establishment_id: lojaId,
            bank_account_id: contaId,
            direction: "saida" as const,
            amount: valor,
            origin: "pagamento_despesa" as const,
            occurred_at: pagoEm,
            financial_payment_id: fp.id,
            created_by_user_id: ator.id,
          }),
        });
        pagos.push({ entry_id: c.id, amount: valor, financial_payment_id: fp.id });
      }
      return { pagos, totalCent };
    });
    return ok({
      paid_at: pagoEm.toISOString(),
      total: feitos.totalCent / 100,
      from: { establishment_id: lojaId, bank_account_id: contaId },
      payments: feitos.pagos,
    });
  } catch (err) {
    if (err instanceof RecusaDespesa) return err.recusa;
    throw err;
  }
}
