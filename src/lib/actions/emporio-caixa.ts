import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { exigir, papelDoEmporio, pode, recusaDe } from "@/lib/emporio/papel";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { CATEGORIA_DIFERENCA_CAIXA, hojeEmBrasilia } from "@/lib/emporio/cartao";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { acharLojaParaEscrita } from "@/lib/actions/emporio-estoque";
import { CATEGORIA_VENDAS } from "@/lib/actions/emporio-vendas";

/**
 * Meu Empório, F3a: fiado, contas bancárias e caixa (Módulo 39, Q82, Q83, Q86).
 *
 * O saldo de caixa nunca é gravado (invariante 2): é a soma dos
 * `CashMovement`, entradas menos saídas, por loja (a gaveta) ou por conta. O
 * fiado também não é campo: é o saldo em aberto do lançamento da venda
 * (valor menos a soma dos `FinancialPayment`). A validação é em TypeScript
 * puro, porque o agente do WhatsApp chama estas funções sem passar pelo Zod.
 */

const NAO_ACHADO = (o: string, field?: string) => fail("NOT_FOUND", `${o} não encontrado.`, 404, field);


const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const arred2 = (n: number) => centavos(n) / 100;
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const dataValida = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ehErroUnico(e: unknown): boolean {
  return (e as { code?: unknown })?.code === "P2002";
}

// ---------------------------------------------------------------------------
// Fiado
// ---------------------------------------------------------------------------

export type FiadoEntradaView = {
  entry_id: string;
  sale_id: string | null;
  establishment_id: string | null;
  amount: number;
  paid: number;
  open: number;
  due_date: string | null;
  overdue: boolean;
};

export type FiadoClienteView = {
  contact_id: string;
  contact_name: string;
  phone: string | null;
  owed: number;
  oldest_due_date: string | null;
  overdue_amount: number;
  entries: FiadoEntradaView[];
};

type EntradaAberta = {
  id: string;
  related_id: string | null;
  establishment_id: string | null;
  contact_id: string | null;
  amount: unknown;
  due_date: Date | null;
  created_at: Date;
  sold_at: Date;
  open_cent: number;
  paid_cent: number;
};

/** Lançamentos de venda do Empório ainda em aberto, com o saldo calculado pela soma dos pagamentos. */
export async function entradasAbertas(
  db: TenantPrismaClient,
  where: Record<string, unknown>,
): Promise<EntradaAberta[]> {
  const entradas = await db.financialEntry.findMany({
    where: { related_module: "emporio", entry_type: "income", category: CATEGORIA_VENDAS, status: "pending", ...where },
  });
  if (entradas.length === 0) return [];
  const vendas = await db.emporioSale.findMany({
    where: { id: { in: entradas.map((e) => e.related_id as string) } },
    select: { id: true, sold_at: true },
  });
  const vendidoEm = new Map(vendas.map((v) => [v.id, v.sold_at]));
  const pagos = await db.financialPayment.findMany({
    where: { entry_id: { in: entradas.map((e) => e.id) } },
    select: { entry_id: true, amount: true },
  });
  const soma = new Map<string, number>();
  for (const p of pagos) soma.set(p.entry_id, (soma.get(p.entry_id) ?? 0) + centavos(decToNum(p.amount) ?? 0));
  return entradas
    .map((e) => {
      const pago = soma.get(e.id) ?? 0;
      return {
        id: e.id,
        related_id: e.related_id,
        establishment_id: e.establishment_id,
        contact_id: e.contact_id,
        amount: e.amount,
        due_date: e.due_date,
        created_at: e.created_at,
        sold_at: vendidoEm.get(e.related_id as string) ?? e.created_at,
        paid_cent: pago,
        open_cent: centavos(decToNum(e.amount) ?? 0) - pago,
      };
    })
    .filter((e) => e.open_cent > 0)
    // O mais antigo é a VENDA mais antiga, não o vencimento.
    .sort((a, b) => a.sold_at.getTime() - b.sold_at.getTime() || a.created_at.getTime() - b.created_at.getTime());
}

function filtroDeLojas(visiveis: Set<string> | null): Record<string, unknown> {
  return visiveis ? { establishment_id: { in: [...visiveis] } } : {};
}

export async function listarFiadoAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; contact_id?: string } = {},
): Promise<ActionResult<FiadoClienteView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const abertas = await entradasAbertas(db, {
    ...(opts.establishment_id ? { establishment_id: opts.establishment_id } : filtroDeLojas(visiveis)),
    ...(opts.contact_id ? { contact_id: opts.contact_id } : { contact_id: { not: null } }),
  });
  const contatos = await db.contact.findMany({
    where: { id: { in: [...new Set(abertas.map((e) => e.contact_id as string))] } },
    select: { id: true, name: true, phone: true },
  });
  const porContato = new Map(contatos.map((c) => [c.id, c]));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const clientes = new Map<string, FiadoClienteView>();
  for (const e of abertas) {
    const id = e.contact_id as string;
    const c = porContato.get(id);
    if (!c) continue;
    const vencido = e.due_date !== null && e.due_date.getTime() < hoje.getTime();
    const aberto = e.open_cent / 100;
    let cli = clientes.get(id);
    if (!cli) {
      cli = {
        contact_id: id,
        contact_name: c.name,
        phone: c.phone,
        owed: 0,
        oldest_due_date: null,
        overdue_amount: 0,
        entries: [],
      };
      clientes.set(id, cli);
    }
    cli.owed = arred2(cli.owed + aberto);
    if (vencido) cli.overdue_amount = arred2(cli.overdue_amount + aberto);
    if (e.due_date && (cli.oldest_due_date === null || e.due_date.toISOString() < cli.oldest_due_date)) {
      cli.oldest_due_date = e.due_date.toISOString();
    }
    cli.entries.push({
      entry_id: e.id,
      sale_id: e.related_id,
      establishment_id: e.establishment_id,
      amount: decToNum(e.amount) ?? 0,
      paid: e.paid_cent / 100,
      open: aberto,
      due_date: isoOrNull(e.due_date),
      overdue: vencido,
    });
  }
  return ok(
    [...clientes.values()].sort((a, b) => {
      if (a.oldest_due_date && b.oldest_due_date) return a.oldest_due_date.localeCompare(b.oldest_due_date);
      if (a.oldest_due_date) return -1;
      if (b.oldest_due_date) return 1;
      return a.contact_name.localeCompare(b.contact_name, "pt-BR");
    }),
  );
}

export type ReceberFiadoInput = {
  operation_key: string;
  contact_id: string;
  establishment_id: string;
  amount: number;
  kind: string;
  entry_id?: string | null;
  bank_account_id?: string | null;
};

export type RecebimentoView = {
  operation_key: string;
  contact_id: string;
  establishment_id: string;
  kind: string;
  amount: number;
  received_at: string;
  parts: { entry_id: string; sale_id: string | null; amount: number; financial_payment_id: string }[];
  replayed: boolean;
};

async function recebimentoGravado(db: TenantPrismaClient, ator: Ator, chave: string): Promise<ActionResult<RecebimentoView> | null> {
  const movs = await db.cashMovement.findMany({
    where: { operation_key: chave, origin: "recebimento_fiado" },
    include: { financial_payment: { include: { entry: { select: { id: true, contact_id: true, establishment_id: true, related_id: true } } } } },
    orderBy: { created_at: "asc" },
  });
  if (movs.length === 0) return null;
  const visiveis = await lojasDoAtor(db, ator);
  const partes = movs.flatMap((m) => (m.financial_payment ? [{ m, fp: m.financial_payment }] : []));
  const primeira = partes[0];
  const lojaId = movs[0].establishment_id ?? primeira?.fp.entry.establishment_id ?? null;
  if (visiveis && lojaId && !visiveis.has(lojaId)) return NAO_ACHADO("Recebimento");
  if (!primeira) return NAO_ACHADO("Recebimento");
  const total = movs.reduce((s, m) => s + centavos(decToNum(m.amount) ?? 0), 0);
  return ok({
    operation_key: chave,
    contact_id: primeira.fp.entry.contact_id ?? "",
    establishment_id: lojaId ?? "",
    kind: primeira.fp.method ?? "dinheiro",
    amount: total / 100,
    received_at: primeira.m.occurred_at.toISOString(),
    parts: partes.map(({ m, fp }) => ({
      entry_id: fp.entry_id,
      sale_id: fp.entry.related_id,
      amount: decToNum(m.amount) ?? 0,
      financial_payment_id: fp.id,
    })),
    replayed: true,
  });
}

export async function receberFiadoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: ReceberFiadoInput,
): Promise<ActionResult<RecebimentoView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "receber fiado");
  if (neg) return neg;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  // §23.2: a chave não é única no banco (um recebimento pode tocar vários
  // lançamentos), então a repetição se resolve por busca.
  const gravado = await recebimentoGravado(db, ator, chave);
  if (gravado) return gravado;

  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;

  if (typeof input.contact_id !== "string" || !input.contact_id) {
    return fail("VALIDATION_ERROR", "Escolha o cliente.", 422, "contact_id");
  }
  const contato = await db.contact.findFirst({ where: { id: input.contact_id }, select: { id: true, archived_at: true } });
  if (!contato || contato.archived_at) return fail("VALIDATION_ERROR", "Escolha um cliente ativo.", 422, "contact_id");

  if (input.kind !== "dinheiro" && input.kind !== "pix") {
    return fail("VALIDATION_ERROR", "Escolha como o cliente pagou: dinheiro ou PIX.", 422, "kind");
  }
  if (!numero(input.amount) || centavos(input.amount) <= 0) {
    return fail("VALIDATION_ERROR", "O valor recebido deve ser maior que zero.", 422, "amount");
  }
  const valorCent = centavos(input.amount);

  let contaId: string | null = null;
  if (input.kind === "pix") {
    const lojaExtra = await db.establishment.findFirst({ where: { id: loja.data.id }, select: { pix_bank_account_id: true } });
    const escolhida = input.bank_account_id || lojaExtra?.pix_bank_account_id || null;
    const conta = escolhida ? await db.bankAccount.findFirst({ where: { id: escolhida }, select: { id: true, archived_at: true } }) : null;
    if (!conta || conta.archived_at) {
      return fail("VALIDATION_ERROR", "Para receber PIX, cadastre uma conta bancária e defina a conta PIX da loja.", 422, "kind");
    }
    contaId = conta.id;
  }

  const visiveis = await lojasDoAtor(db, ator);
  const entradaId = input.entry_id ? String(input.entry_id) : null;

  try {
    const partes = await runSerializableTenantTransaction(db, async (tx) => {
      const abertas = await entradasAbertas(
        tx as unknown as TenantPrismaClient,
        {
          contact_id: contato.id,
          ...filtroDeLojas(visiveis),
          ...(entradaId ? { id: entradaId } : {}),
        },
      );
      if (entradaId && abertas.length === 0) {
        throw new RecusaCaixa(fail("NOT_FOUND", "Essa conta a receber não foi encontrada ou já está quitada.", 404, "entry_id"));
      }
      const devido = abertas.reduce((s, e) => s + e.open_cent, 0);
      if (valorCent > devido) {
        throw new RecusaCaixa(
          fail(
            "VALIDATION_ERROR",
            devido > 0
              ? `Esse cliente deve ${brl(devido / 100)}: o valor recebido passa disso.`
              : "Esse cliente não tem fiado em aberto.",
            422,
            "amount",
          ),
        );
      }

      const agora = new Date();
      let restante = valorCent;
      const feitas: RecebimentoView["parts"] = [];
      for (const e of abertas) {
        if (restante <= 0) break;
        const parte = Math.min(restante, e.open_cent);
        restante -= parte;
        const fp = await tx.financialPayment.create({
          data: scoped({
            entry_id: e.id,
            amount: parte / 100,
            paid_at: agora,
            method: input.kind as "dinheiro" | "pix",
            created_by_user_id: ator.id,
          }),
        });
        if (parte === e.open_cent) {
          await tx.financialEntry.update({ where: { id: e.id }, data: { status: "paid", paid_at: agora } });
        }
        await tx.cashMovement.create({
          data: scoped({
            establishment_id: input.kind === "dinheiro" ? loja.data.id : null,
            bank_account_id: contaId,
            direction: "entrada" as const,
            amount: parte / 100,
            origin: "recebimento_fiado" as const,
            occurred_at: agora,
            sale_id: e.related_id,
            financial_payment_id: fp.id,
            operation_key: chave,
            created_by_user_id: ator.id,
          }),
        });
        feitas.push({ entry_id: e.id, sale_id: e.related_id, amount: parte / 100, financial_payment_id: fp.id });
      }
      return { feitas, agora };
    });
    return ok({
      operation_key: chave,
      contact_id: contato.id,
      establishment_id: loja.data.id,
      kind: input.kind,
      amount: valorCent / 100,
      received_at: partes.agora.toISOString(),
      parts: partes.feitas,
      replayed: false,
    });
  } catch (err) {
    if (err instanceof RecusaCaixa) return err.recusa;
    if (ehErroUnico(err)) {
      const igual = await recebimentoGravado(db, ator, chave);
      if (igual) return igual;
    }
    throw err;
  }
}

class RecusaCaixa extends Error {
  constructor(public recusa: ActionResult<never>) {
    super("recusa do caixa");
  }
}

// ---------------------------------------------------------------------------
// Contas bancárias
// ---------------------------------------------------------------------------

export type ContaView = {
  id: string;
  name: string;
  bank: string | null;
  archived_at: string | null;
  balance: number;
  pix_establishment_ids: string[];
};

/**
 * Saldo das contas, em centavos (Q90): os `CashMovement` mais as parcelas do
 * cartão não canceladas que já caíram (`expected_on` até hoje em Brasília).
 * Nada disso é gravado: a data decide, sem job.
 */
export async function saldosDasContas(db: TenantPrismaClient): Promise<Map<string, number>> {
  const linhas = await db.cashMovement.groupBy({
    by: ["bank_account_id", "direction"],
    where: { bank_account_id: { not: null } },
    _sum: { amount: true },
  });
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    const id = l.bank_account_id as string;
    const v = centavos(decToNum(l._sum.amount) ?? 0);
    mapa.set(id, (mapa.get(id) ?? 0) + (l.direction === "entrada" ? v : -v));
  }
  const caidas = await db.cardReceivable.groupBy({
    by: ["bank_account_id"],
    where: { canceled_at: null, expected_on: { lte: hojeEmBrasilia() } },
    _sum: { net_amount: true },
  });
  for (const c of caidas) {
    mapa.set(c.bank_account_id, (mapa.get(c.bank_account_id) ?? 0) + centavos(decToNum(c._sum.net_amount) ?? 0));
  }
  return mapa;
}

/** Saldo da gaveta de uma loja, em centavos: entradas menos saídas. */
export async function saldoDaGaveta(db: TenantPrismaClient, lojaId: string): Promise<number> {
  const linhas = await db.cashMovement.groupBy({
    by: ["direction"],
    where: { establishment_id: lojaId },
    _sum: { amount: true },
  });
  let total = 0;
  for (const l of linhas) {
    const v = centavos(decToNum(l._sum.amount) ?? 0);
    total += l.direction === "entrada" ? v : -v;
  }
  return total;
}

async function viewsDasContas(db: TenantPrismaClient, where: Record<string, unknown>): Promise<ContaView[]> {
  const contas = await db.bankAccount.findMany({
    where,
    include: { pix_of: { select: { id: true } } },
    orderBy: { name: "asc" },
  });
  const saldos = await saldosDasContas(db);
  return contas.map((c) => ({
    id: c.id,
    name: c.name,
    bank: c.bank,
    archived_at: isoOrNull(c.archived_at),
    balance: (saldos.get(c.id) ?? 0) / 100,
    pix_establishment_ids: c.pix_of.map((e) => e.id),
  }));
}

export async function listarContasAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { incluir_arquivadas?: boolean } = {},
): Promise<ActionResult<ContaView[]>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "ver as contas bancárias");
  if (neg) return neg;
  return ok(await viewsDasContas(db, opts.incluir_arquivadas ? {} : { archived_at: null }));
}

function validarNomeDaConta(nome: unknown): ActionResult<string> {
  const n = typeof nome === "string" ? nome.trim() : "";
  if (!n) return fail("VALIDATION_ERROR", "Dê um nome à conta.", 422, "name");
  if (n.length > 80) return fail("VALIDATION_ERROR", "O nome da conta pode ter até 80 letras.", 422, "name");
  return ok(n);
}

const NOME_REPETIDO = () => fail("DUPLICATE_NAME", "Já existe uma conta com esse nome.", 409, "name");

export async function criarContaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { name: string; bank?: string | null },
): Promise<ActionResult<ContaView>> {
  const neg = await exigir(db, ator, "conta", "criar uma conta bancária");
  if (neg) return neg;
  const nome = validarNomeDaConta(input?.name);
  if (!nome.ok) return nome;
  const banco = typeof input.bank === "string" && input.bank.trim() ? input.bank.trim() : null;
  if (await db.bankAccount.findFirst({ where: { name: nome.data }, select: { id: true } })) return NOME_REPETIDO();
  try {
    const c = await db.bankAccount.create({
      data: scoped({ name: nome.data, bank: banco, created_by_user_id: ator.id }),
    });
    const [v] = await viewsDasContas(db, { id: c.id });
    return ok(v);
  } catch (err) {
    if (ehErroUnico(err)) return NOME_REPETIDO();
    throw err;
  }
}

export async function editarContaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { name?: string; bank?: string | null; archived?: boolean },
): Promise<ActionResult<ContaView>> {
  const neg = await exigir(db, ator, "conta", "mudar uma conta bancária");
  if (neg) return neg;
  const atual = await db.bankAccount.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO("Conta");

  const data: { name?: string; bank?: string | null; archived_at?: Date | null } = {};
  if (input?.name !== undefined) {
    const nome = validarNomeDaConta(input.name);
    if (!nome.ok) return nome;
    if (nome.data !== atual.name) {
      if (await db.bankAccount.findFirst({ where: { name: nome.data, id: { not: id } }, select: { id: true } })) {
        return NOME_REPETIDO();
      }
      data.name = nome.data;
    }
  }
  if (input?.bank !== undefined) {
    data.bank = typeof input.bank === "string" && input.bank.trim() ? input.bank.trim() : null;
  }
  if (input?.archived !== undefined) {
    if (typeof input.archived !== "boolean") {
      return fail("VALIDATION_ERROR", "Informe se a conta fica arquivada.", 422, "archived");
    }
    data.archived_at = input.archived ? (atual.archived_at ?? new Date()) : null;
  }
  try {
    if (Object.keys(data).length > 0) await db.bankAccount.update({ where: { id }, data });
  } catch (err) {
    if (ehErroUnico(err)) return NOME_REPETIDO();
    throw err;
  }
  const [v] = await viewsDasContas(db, { id });
  return ok(v);
}

export async function definirContaPixAction(
  db: TenantPrismaClient,
  ator: Ator,
  establishment_id: string,
  input: { bank_account_id: string | null },
): Promise<ActionResult<{ establishment_id: string; pix_bank_account_id: string | null }>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "definir a conta PIX da loja");
  if (neg) return neg;
  const loja = await acharLojaParaEscrita(db, ator, establishment_id);
  if (!loja.ok) return loja;
  let contaId: string | null = null;
  if (input?.bank_account_id != null) {
    const conta = await db.bankAccount.findFirst({
      where: { id: String(input.bank_account_id) },
      select: { id: true, archived_at: true },
    });
    if (!conta || conta.archived_at) {
      return fail("VALIDATION_ERROR", "Escolha uma conta bancária ativa.", 422, "bank_account_id");
    }
    contaId = conta.id;
  }
  await db.establishment.update({ where: { id: loja.data.id }, data: { pix_bank_account_id: contaId } });
  return ok({ establishment_id: loja.data.id, pix_bank_account_id: contaId });
}

// ---------------------------------------------------------------------------
// Caixa
// ---------------------------------------------------------------------------

export type MovimentoDeCaixaView = {
  id: string;
  establishment_id: string | null;
  bank_account_id: string | null;
  direction: "entrada" | "saida";
  amount: number;
  origin: string;
  occurred_at: string;
  sale_id: string | null;
  sale_return_id: string | null;
  financial_payment_id: string | null;
  cash_transfer_id: string | null;
  cash_count_id: string | null;
  check_id: string | null;
  card_receivable_id: string | null;
  notes: string | null;
};

type MovimentoRow = {
  id: string;
  establishment_id: string | null;
  bank_account_id: string | null;
  direction: "entrada" | "saida";
  amount: unknown;
  origin: string;
  occurred_at: Date;
  sale_id: string | null;
  sale_return_id: string | null;
  financial_payment_id: string | null;
  cash_transfer_id: string | null;
  cash_count_id: string | null;
  check_id: string | null;
  card_receivable_id: string | null;
  notes: string | null;
};

function viewDoMovimento(m: MovimentoRow): MovimentoDeCaixaView {
  return {
    id: m.id,
    establishment_id: m.establishment_id,
    bank_account_id: m.bank_account_id,
    direction: m.direction,
    amount: decToNum(m.amount as never) ?? 0,
    origin: m.origin,
    occurred_at: m.occurred_at.toISOString(),
    sale_id: m.sale_id,
    sale_return_id: m.sale_return_id,
    financial_payment_id: m.financial_payment_id,
    cash_transfer_id: m.cash_transfer_id,
    cash_count_id: m.cash_count_id,
    check_id: m.check_id,
    card_receivable_id: m.card_receivable_id,
    notes: m.notes,
  };
}

export type ConferenciaView = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  expected: number;
  counted: number;
  difference: number;
  justification: string | null;
  counted_at: string;
  created_by_user_id: string | null;
};

export type ParcelaCartaoView = {
  id: string;
  sale_id: string;
  establishment_id: string;
  bank_account_id: string;
  bank_account_name: string;
  installment: number;
  installments: number;
  gross_amount: number;
  net_amount: number;
  /** Data de calendário (AAAA-MM-DD). */
  expected_on: string;
};

export type ChequeView = {
  id: string;
  sale_id: string;
  sale_payment_id: string;
  contact_id: string;
  contact_name: string;
  establishment_id: string;
  number: string;
  bank: string;
  /** Data de calendário (AAAA-MM-DD). */
  good_for: string;
  amount: number;
  status: string;
  bank_account_id: string | null;
  deposited_at: string | null;
  cleared_at: string | null;
  returned_at: string | null;
  return_reason: string | null;
};

export type CaixaView = {
  drawers: {
    establishment_id: string;
    name: string;
    balance: number;
    last_count: ConferenciaView | null;
  }[];
  /** `balance` já inclui as parcelas do cartão que caíram; `to_receive` é o que ainda vai cair. */
  accounts: { bank_account_id: string; name: string; balance: number; to_receive: number }[];
  /** Parcelas futuras do cartão (só OWNER e ADMIN, como as contas). */
  card_receivables: ParcelaCartaoView[];
  /** Carteira: cheques recebidos e depositados, das lojas visíveis. */
  checks: ChequeView[];
  movements: MovimentoDeCaixaView[];
};

const dia = (d: Date) => d.toISOString().slice(0, 10);

type ConferenciaRow = {
  id: string;
  establishment_id: string;
  expected: unknown;
  counted: unknown;
  difference: unknown;
  justification: string | null;
  counted_at: Date;
  created_by_user_id: string | null;
  establishment: { name: string };
};

function viewDaConferencia(c: ConferenciaRow): ConferenciaView {
  return {
    id: c.id,
    establishment_id: c.establishment_id,
    establishment_name: c.establishment.name,
    expected: decToNum(c.expected as never) ?? 0,
    counted: decToNum(c.counted as never) ?? 0,
    difference: decToNum(c.difference as never) ?? 0,
    justification: c.justification,
    counted_at: c.counted_at.toISOString(),
    created_by_user_id: c.created_by_user_id,
  };
}

type ChequeRow = {
  id: string;
  sale_id: string;
  sale_payment_id: string;
  contact_id: string;
  establishment_id: string;
  number: string;
  bank: string;
  good_for: Date;
  amount: unknown;
  status: string;
  bank_account_id: string | null;
  deposited_at: Date | null;
  cleared_at: Date | null;
  returned_at: Date | null;
  return_reason: string | null;
  contact: { name: string };
};

function viewDoCheque(c: ChequeRow): ChequeView {
  return {
    id: c.id,
    sale_id: c.sale_id,
    sale_payment_id: c.sale_payment_id,
    contact_id: c.contact_id,
    contact_name: c.contact.name,
    establishment_id: c.establishment_id,
    number: c.number,
    bank: c.bank,
    good_for: dia(c.good_for),
    amount: decToNum(c.amount as never) ?? 0,
    status: c.status,
    bank_account_id: c.bank_account_id,
    deposited_at: isoOrNull(c.deposited_at),
    cleared_at: isoOrNull(c.cleared_at),
    returned_at: isoOrNull(c.returned_at),
    return_reason: c.return_reason,
  };
}

export async function lerCaixaAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; bank_account_id?: string; limit?: number } = {},
): Promise<ActionResult<CaixaView>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const veContas = pode(await papelDoEmporio(db, ator), "gestor_da_loja");
  if (opts.bank_account_id && !veContas) return recusaDe("gestor_da_loja", "ver uma conta bancária");

  const lojas = await db.establishment.findMany({
    where: { archived_at: null, ...(visiveis ? { id: { in: [...visiveis] } } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const linhas = await db.cashMovement.groupBy({
    by: ["establishment_id", "direction"],
    where: { establishment_id: { in: lojas.map((l) => l.id) } },
    _sum: { amount: true },
  });
  const saldoLoja = new Map<string, number>();
  for (const l of linhas) {
    const id = l.establishment_id as string;
    const v = centavos(decToNum(l._sum.amount) ?? 0);
    saldoLoja.set(id, (saldoLoja.get(id) ?? 0) + (l.direction === "entrada" ? v : -v));
  }

  // A última conferência de cada gaveta.
  const conferencias = await db.cashCount.findMany({
    where: { establishment_id: { in: lojas.map((l) => l.id) } },
    include: { establishment: { select: { name: true } } },
    orderBy: [{ counted_at: "desc" }, { created_at: "desc" }],
  });
  const ultimaConferencia = new Map<string, ConferenciaView>();
  for (const c of conferencias) {
    if (!ultimaConferencia.has(c.establishment_id)) ultimaConferencia.set(c.establishment_id, viewDaConferencia(c));
  }

  let contas: CaixaView["accounts"] = [];
  let parcelas: ParcelaCartaoView[] = [];
  if (veContas) {
    const todas = await viewsDasContas(db, { archived_at: null });
    const todasFuturas = await db.cardReceivable.findMany({
      where: { canceled_at: null, expected_on: { gt: hojeEmBrasilia() } },
      include: { bank_account: { select: { name: true } } },
      orderBy: [{ expected_on: "asc" }, { installment: "asc" }],
    });
    parcelas = todasFuturas
      .filter(
        (f) =>
          (!opts.establishment_id || f.establishment_id === opts.establishment_id) &&
          (!opts.bank_account_id || f.bank_account_id === opts.bank_account_id),
      )
      .map((f) => ({
        id: f.id,
        sale_id: f.sale_id,
        establishment_id: f.establishment_id,
        bank_account_id: f.bank_account_id,
        bank_account_name: f.bank_account.name,
        installment: f.installment,
        installments: f.installments,
        gross_amount: decToNum(f.gross_amount) ?? 0,
        net_amount: decToNum(f.net_amount) ?? 0,
        expected_on: dia(f.expected_on),
      }));
    const aReceber = new Map<string, number>();
    for (const f of todasFuturas) {
      aReceber.set(f.bank_account_id, (aReceber.get(f.bank_account_id) ?? 0) + centavos(decToNum(f.net_amount) ?? 0));
    }
    contas = todas.map((c) => ({
      bank_account_id: c.id,
      name: c.name,
      balance: c.balance,
      to_receive: (aReceber.get(c.id) ?? 0) / 100,
    }));
  }

  const carteira = await db.emporioCheck.findMany({
    where: {
      status: { in: ["recebido", "depositado"] },
      establishment_id: opts.establishment_id ? opts.establishment_id : { in: lojas.map((l) => l.id) },
    },
    include: { contact: { select: { name: true } } },
    orderBy: [{ good_for: "asc" }, { created_at: "asc" }],
  });

  const lojaIds = opts.establishment_id ? [opts.establishment_id] : lojas.map((l) => l.id);
  const onde = opts.bank_account_id
    ? { bank_account_id: opts.bank_account_id }
    : opts.establishment_id
      ? { establishment_id: opts.establishment_id }
      : veContas
        ? { OR: [{ establishment_id: { in: lojaIds } }, { bank_account_id: { not: null } }] }
        : { establishment_id: { in: lojaIds } };
  const limite = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 500) : 100;
  const movs = await db.cashMovement.findMany({
    where: onde,
    orderBy: [{ occurred_at: "desc" }, { created_at: "desc" }],
    take: limite,
  });

  return ok({
    drawers: lojas.map((l) => ({
      establishment_id: l.id,
      name: l.name,
      balance: (saldoLoja.get(l.id) ?? 0) / 100,
      last_count: ultimaConferencia.get(l.id) ?? null,
    })),
    accounts: contas,
    card_receivables: parcelas,
    checks: carteira.map(viewDoCheque),
    movements: movs.map(viewDoMovimento),
  });
}

export async function saldoInicialCaixaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { establishment_id?: string | null; bank_account_id?: string | null; amount: number; occurred_at?: Date | null },
): Promise<ActionResult<MovimentoDeCaixaView>> {
  const temLoja = typeof input?.establishment_id === "string" && !!input.establishment_id;
  const temConta = typeof input?.bank_account_id === "string" && !!input.bank_account_id;
  if (temLoja === temConta) {
    return fail("VALIDATION_ERROR", "Informe a loja OU a conta que recebe o saldo inicial.", 422, "establishment_id");
  }
  if (!numero(input.amount) || centavos(input.amount) <= 0) {
    return fail("VALIDATION_ERROR", "O saldo inicial deve ser maior que zero.", 422, "amount");
  }
  const quando = input.occurred_at == null ? new Date() : input.occurred_at;
  if (!dataValida(quando)) return fail("VALIDATION_ERROR", "Informe uma data válida.", 422, "occurred_at");

  let lojaId: string | null = null;
  let contaId: string | null = null;
  if (temLoja) {
    const neg = await exigir(db, ator, "vendedor_da_loja", "informar o saldo inicial da gaveta");
    if (neg) return neg;
    const loja = await acharLojaParaEscrita(db, ator, input.establishment_id);
    if (!loja.ok) return loja;
    lojaId = loja.data.id;
  } else {
    const neg = await exigir(db, ator, "conta", "informar o saldo inicial de uma conta bancária");
    if (neg) return neg;
    const conta = await db.bankAccount.findFirst({
      where: { id: String(input.bank_account_id) },
      select: { id: true, archived_at: true },
    });
    if (!conta) return NAO_ACHADO("Conta", "bank_account_id");
    if (conta.archived_at) return fail("VALIDATION_ERROR", "Essa conta está arquivada.", 422, "bank_account_id");
    contaId = conta.id;
  }

  try {
    const m = await runSerializableTenantTransaction(db, async (tx) => {
      const ja = await tx.cashMovement.findFirst({
        where: { origin: "implantacao", ...(lojaId ? { establishment_id: lojaId } : { bank_account_id: contaId }) },
        select: { id: true },
      });
      if (ja) {
        throw new RecusaCaixa(
          fail(
            "OPENING_ALREADY_DONE",
            "O saldo inicial já foi lançado. Para corrigir, lance a diferença como movimento.",
            409,
            lojaId ? "establishment_id" : "bank_account_id",
          ),
        );
      }
      return tx.cashMovement.create({
        data: scoped({
          establishment_id: lojaId,
          bank_account_id: contaId,
          direction: "entrada" as const,
          amount: arred2(input.amount),
          origin: "implantacao" as const,
          occurred_at: quando,
          notes: "Saldo inicial",
          created_by_user_id: ator.id,
        }),
      });
    });
    return ok(viewDoMovimento(m));
  } catch (err) {
    if (err instanceof RecusaCaixa) return err.recusa;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Taxas de cartão (F3b, Q89)
// ---------------------------------------------------------------------------

const FORMAS_DE_CARTAO = ["debito", "credito_vista", "credito_parcelado"] as const;
type FormaDeCartao = (typeof FORMAS_DE_CARTAO)[number];

export type RegraCartaoView = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  kind: FormaDeCartao;
  fee_pct: number;
  days: number;
  bank_account_id: string;
  /** Contas são de OWNER e ADMIN: para os outros o nome vem vazio. */
  bank_account_name: string | null;
};

const INCLUDE_REGRA = {
  establishment: { select: { name: true } },
  bank_account: { select: { name: true } },
} as const;

type RegraRow = {
  id: string;
  establishment_id: string;
  kind: FormaDeCartao;
  fee_pct: unknown;
  days: number;
  bank_account_id: string;
  establishment: { name: string };
  bank_account: { name: string };
};

function viewDaRegra(r: RegraRow, veConta: boolean): RegraCartaoView {
  return {
    id: r.id,
    establishment_id: r.establishment_id,
    establishment_name: r.establishment.name,
    kind: r.kind,
    fee_pct: decToNum(r.fee_pct as never) ?? 0,
    days: r.days,
    bank_account_id: r.bank_account_id,
    bank_account_name: veConta ? r.bank_account.name : null,
  };
}

export async function listarRegrasCartaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string } = {},
): Promise<ActionResult<RegraCartaoView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const regras = await db.cardFeeRule.findMany({
    where: opts.establishment_id ? { establishment_id: opts.establishment_id } : filtroDeLojas(visiveis),
    include: INCLUDE_REGRA,
    orderBy: [{ establishment: { name: "asc" } }, { kind: "asc" }],
  });
  const veConta = pode(await papelDoEmporio(db, ator), "gestor_da_loja");
  return ok(regras.map((r) => viewDaRegra(r, veConta)));
}

export type DefinirRegraCartaoInput = {
  establishment_id: string;
  kind: string;
  fee_pct: number;
  days: number;
  bank_account_id: string;
};

/** Cria ou substitui a regra da loja para a forma. As vendas passadas guardam a taxa no pagamento. */
export async function definirRegraCartaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: DefinirRegraCartaoInput,
): Promise<ActionResult<RegraCartaoView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "definir a regra de cartão");
  if (neg) return neg;
  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;
  if (!(FORMAS_DE_CARTAO as readonly unknown[]).includes(input.kind)) {
    return fail("VALIDATION_ERROR", "Escolha a forma: débito, crédito à vista ou crédito parcelado.", 422, "kind");
  }
  const kind = input.kind as FormaDeCartao;
  if (!numero(input.fee_pct) || input.fee_pct < 0 || input.fee_pct > 100) {
    return fail("VALIDATION_ERROR", "A taxa deve ficar entre 0% e 100%.", 422, "fee_pct");
  }
  const feePct = Math.round(Number((input.fee_pct * 100).toPrecision(12))) / 100;
  if (!numero(input.days) || !Number.isInteger(input.days) || input.days < 0 || input.days > 120) {
    return fail("VALIDATION_ERROR", "O prazo deve ser um número inteiro de dias, de 0 a 120.", 422, "days");
  }
  const conta =
    typeof input.bank_account_id === "string" && input.bank_account_id
      ? await db.bankAccount.findFirst({ where: { id: input.bank_account_id }, select: { id: true, archived_at: true } })
      : null;
  if (!conta || conta.archived_at) {
    return fail("VALIDATION_ERROR", "Escolha uma conta bancária ativa para receber o cartão.", 422, "bank_account_id");
  }

  const gravar = async () => {
    const atual = await db.cardFeeRule.findFirst({ where: { establishment_id: loja.data.id, kind }, select: { id: true } });
    const dados = { fee_pct: feePct, days: input.days, bank_account_id: conta.id, updated_by_user_id: ator.id };
    return atual
      ? db.cardFeeRule.update({ where: { id: atual.id }, data: dados, include: INCLUDE_REGRA })
      : db.cardFeeRule.create({ data: scoped({ establishment_id: loja.data.id, kind, ...dados }), include: INCLUDE_REGRA });
  };
  try {
    return ok(viewDaRegra(await gravar(), true));
  } catch (err) {
    if (!ehErroUnico(err)) throw err;
    return ok(viewDaRegra(await gravar(), true));
  }
}

export async function removerRegraCartaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "remover a regra de cartão");
  if (neg) return neg;
  const regra = await db.cardFeeRule.findFirst({ where: { id }, select: { id: true, establishment_id: true } });
  if (!regra || !(await lojaVisivel(db, ator, regra.establishment_id))) return NAO_ACHADO("Regra de cartão");
  await db.cardFeeRule.delete({ where: { id: regra.id } });
  return ok({ id: regra.id });
}

async function lojaVisivel(db: TenantPrismaClient, ator: Ator, lojaId: string): Promise<boolean> {
  const v = await lojasDoAtor(db, ator);
  return !v || v.has(lojaId);
}

// ---------------------------------------------------------------------------
// Cheques (F3b, Q91)
// ---------------------------------------------------------------------------

const NOME_DO_STATUS: Record<string, string> = {
  recebido: "na carteira",
  depositado: "depositado",
  compensado: "compensado",
  devolvido: "devolvido pelo banco",
  devolvido_ao_cliente: "devolvido ao cliente",
};

const FORA_DE_ORDEM = (status: string) =>
  fail("CHECK_STATUS", `Esse cheque está ${NOME_DO_STATUS[status] ?? status} e não pode seguir para essa etapa.`, 409);

const STATUS_DE_CHEQUE = ["recebido", "depositado", "compensado", "devolvido", "devolvido_ao_cliente"] as const;

export async function listarChequesAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; contact_id?: string; status?: string } = {},
): Promise<ActionResult<ChequeView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  if (opts.status && !(STATUS_DE_CHEQUE as readonly string[]).includes(opts.status)) {
    return fail("VALIDATION_ERROR", "Escolha uma situação de cheque válida.", 422, "status");
  }
  const cheques = await db.emporioCheck.findMany({
    where: {
      ...(opts.establishment_id ? { establishment_id: opts.establishment_id } : filtroDeLojas(visiveis)),
      ...(opts.contact_id ? { contact_id: opts.contact_id } : {}),
      ...(opts.status ? { status: opts.status as (typeof STATUS_DE_CHEQUE)[number] } : {}),
    },
    include: { contact: { select: { name: true } } },
    orderBy: [{ good_for: "asc" }, { created_at: "asc" }],
  });
  return ok(cheques.map(viewDoCheque));
}

async function acharCheque(db: TenantPrismaClient, ator: Ator, id: string) {
  const c = await db.emporioCheck.findFirst({ where: { id } });
  if (!c || !(await lojaVisivel(db, ator, c.establishment_id))) return null;
  return c;
}

async function chequePorId(db: TenantPrismaClient, id: string): Promise<ActionResult<ChequeView>> {
  const c = await db.emporioCheck.findFirst({ where: { id }, include: { contact: { select: { name: true } } } });
  return c ? ok(viewDoCheque(c)) : NAO_ACHADO("Cheque");
}

/** Depositar: `recebido` para `depositado`, escolhendo a conta. */
export async function depositarChequeAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { bank_account_id: string },
): Promise<ActionResult<ChequeView>> {
  const neg = await exigir(db, ator, "chave:depositar_cheque", "depositar cheque");
  if (neg) return neg;
  const cheque = await acharCheque(db, ator, id);
  if (!cheque) return NAO_ACHADO("Cheque");
  if (cheque.status !== "recebido") return FORA_DE_ORDEM(cheque.status);
  const conta =
    typeof input?.bank_account_id === "string" && input.bank_account_id
      ? await db.bankAccount.findFirst({ where: { id: input.bank_account_id }, select: { id: true, archived_at: true } })
      : null;
  if (!conta || conta.archived_at) {
    return fail("VALIDATION_ERROR", "Escolha a conta bancária onde o cheque foi depositado.", 422, "bank_account_id");
  }
  const r = await db.emporioCheck.updateMany({
    where: { id, status: "recebido" },
    data: { status: "depositado", bank_account_id: conta.id, deposited_at: new Date(), updated_by_user_id: ator.id },
  });
  if (r.count === 0) return FORA_DE_ORDEM((await acharCheque(db, ator, id))?.status ?? "recebido");
  return chequePorId(db, id);
}

/** Compensou: `depositado` para `compensado`, e o dinheiro entra na conta do depósito. */
export async function compensarChequeAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<ChequeView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "marcar o cheque como compensado");
  if (neg) return neg;
  const cheque = await acharCheque(db, ator, id);
  if (!cheque) return NAO_ACHADO("Cheque");
  if (cheque.status !== "depositado" || !cheque.bank_account_id) return FORA_DE_ORDEM(cheque.status);
  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      const agora = new Date();
      const r = await tx.emporioCheck.updateMany({
        where: { id, status: "depositado" },
        data: { status: "compensado", cleared_at: agora, updated_by_user_id: ator.id },
      });
      if (r.count === 0) throw new RecusaCaixa(FORA_DE_ORDEM("compensado"));
      await tx.cashMovement.create({
        data: scoped({
          establishment_id: null,
          bank_account_id: cheque.bank_account_id,
          direction: "entrada" as const,
          amount: decToNum(cheque.amount) ?? 0,
          origin: "cheque_compensado" as const,
          occurred_at: agora,
          sale_id: cheque.sale_id,
          check_id: cheque.id,
          created_by_user_id: ator.id,
        }),
      });
    });
  } catch (err) {
    if (err instanceof RecusaCaixa) return err.recusa;
    throw err;
  }
  return chequePorId(db, id);
}

/** Voltou: `recebido` ou `depositado` para `devolvido`; o pagamento sai do lançamento e a dívida reabre. */
export async function chequeVoltouAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { reason: string },
): Promise<ActionResult<ChequeView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "marcar o cheque como devolvido");
  if (neg) return neg;
  const cheque = await acharCheque(db, ator, id);
  if (!cheque) return NAO_ACHADO("Cheque");
  if (cheque.status !== "recebido" && cheque.status !== "depositado") return FORA_DE_ORDEM(cheque.status);
  const motivo = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!motivo) return fail("VALIDATION_ERROR", "Diga por que o cheque voltou.", 422, "reason");

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      const r = await tx.emporioCheck.updateMany({
        where: { id, status: { in: ["recebido", "depositado"] } },
        data: {
          status: "devolvido",
          returned_at: new Date(),
          return_reason: motivo,
          financial_payment_id: null,
          updated_by_user_id: ator.id,
        },
      });
      if (r.count === 0) throw new RecusaCaixa(FORA_DE_ORDEM("devolvido"));
      if (!cheque.financial_payment_id) return;

      // Como `cancelarPagamentoAction`: o pagamento sai e, se o lançamento
      // deixou de estar coberto, volta a pendente (e a dívida aparece no fiado).
      const pagamento = await tx.financialPayment.findFirst({
        where: { id: cheque.financial_payment_id },
        select: { id: true, entry_id: true },
      });
      if (!pagamento) return;
      await tx.financialPayment.delete({ where: { id: pagamento.id } });
      const lancamento = await tx.financialEntry.findFirst({ where: { id: pagamento.entry_id } });
      if (!lancamento || lancamento.status !== "paid") return;
      const pago = await tx.financialPayment.aggregate({ where: { entry_id: lancamento.id }, _sum: { amount: true } });
      if (centavos(decToNum(pago._sum.amount) ?? 0) < centavos(decToNum(lancamento.amount) ?? 0)) {
        await tx.financialEntry.update({ where: { id: lancamento.id }, data: { status: "pending", paid_at: null } });
      }
    });
  } catch (err) {
    if (err instanceof RecusaCaixa) return err.recusa;
    throw err;
  }
  return chequePorId(db, id);
}

// ---------------------------------------------------------------------------
// Transferência entre caixas (F3b, Q92)
// ---------------------------------------------------------------------------

export type PontaDeCaixa = { establishment_id?: string | null; bank_account_id?: string | null };

export type TransferenciaView = {
  id: string;
  operation_key: string;
  from: { establishment_id: string | null; bank_account_id: string | null };
  to: { establishment_id: string | null; bank_account_id: string | null };
  amount: number;
  notes: string | null;
  created_at: string;
  replayed: boolean;
};

type TransferenciaRow = {
  id: string;
  operation_key: string;
  from_establishment_id: string | null;
  from_bank_account_id: string | null;
  to_establishment_id: string | null;
  to_bank_account_id: string | null;
  amount: unknown;
  notes: string | null;
  created_at: Date;
};

function viewDaTransferencia(t: TransferenciaRow, replayed: boolean): TransferenciaView {
  return {
    id: t.id,
    operation_key: t.operation_key,
    from: { establishment_id: t.from_establishment_id, bank_account_id: t.from_bank_account_id },
    to: { establishment_id: t.to_establishment_id, bank_account_id: t.to_bank_account_id },
    amount: decToNum(t.amount as never) ?? 0,
    notes: t.notes,
    created_at: t.created_at.toISOString(),
    replayed,
  };
}

function resolverPonta(
  ponta: PontaDeCaixa | undefined,
  campo: "from" | "to",
): ActionResult<{ lojaId: string | null; contaId: string | null }> {
  const lojaId = typeof ponta?.establishment_id === "string" && ponta.establishment_id ? ponta.establishment_id : null;
  const contaId = typeof ponta?.bank_account_id === "string" && ponta.bank_account_id ? ponta.bank_account_id : null;
  if ((lojaId === null) === (contaId === null)) {
    return fail(
      "VALIDATION_ERROR",
      campo === "from"
        ? "Diga de onde sai o dinheiro: uma loja OU uma conta."
        : "Diga para onde vai o dinheiro: uma loja OU uma conta.",
      422,
      campo,
    );
  }
  return ok({ lojaId, contaId });
}

async function transferenciaGravada(
  db: TenantPrismaClient,
  ator: Ator,
  chave: string,
): Promise<ActionResult<TransferenciaView> | null> {
  const t = await db.cashTransfer.findFirst({ where: { operation_key: chave } });
  if (!t) return null;
  if (t.from_establishment_id) {
    if (!(await lojaVisivel(db, ator, t.from_establishment_id))) return NAO_ACHADO("Transferência");
  } else if (!pode(await papelDoEmporio(db, ator), "conta")) {
    return NAO_ACHADO("Transferência");
  }
  return ok(viewDaTransferencia(t, true));
}

export async function transferirCaixaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { operation_key: string; from: PontaDeCaixa; to: PontaDeCaixa; amount: number; notes?: string | null },
): Promise<ActionResult<TransferenciaView>> {
  const negBase = await exigir(db, ator, "vendedor_da_loja", "transferir entre caixas");
  if (negBase) return negBase;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  const gravada = await transferenciaGravada(db, ator, chave);
  if (gravada) return gravada;

  const origem = resolverPonta(input.from, "from");
  if (!origem.ok) return origem;
  const destino = resolverPonta(input.to, "to");
  if (!destino.ok) return destino;
  if (origem.data.lojaId === destino.data.lojaId && origem.data.contaId === destino.data.contaId) {
    return fail("VALIDATION_ERROR", "A origem e o destino precisam ser diferentes.", 422, "to");
  }
  if (!numero(input.amount) || centavos(input.amount) <= 0) {
    return fail("VALIDATION_ERROR", "O valor da transferência deve ser maior que zero.", 422, "amount");
  }
  const valorCent = centavos(input.amount);

  if (origem.data.lojaId) {
    const loja = await acharLojaParaEscrita(db, ator, origem.data.lojaId);
    if (!loja.ok) return fail(loja.code, loja.message, loja.status, "from");
    const negChave = await exigir(db, ator, "chave:transferir_caixa", "levar a gaveta ao banco", loja.data.id);
    if (negChave) return negChave;
  } else {
    const negConta = await exigir(db, ator, "conta", "transferir saindo de uma conta bancária");
    if (negConta) return negConta;
    const conta = await db.bankAccount.findFirst({ where: { id: origem.data.contaId as string }, select: { archived_at: true } });
    if (!conta) return NAO_ACHADO("Conta de origem", "from");
  }
  if (destino.data.lojaId) {
    const loja = await db.establishment.findFirst({ where: { id: destino.data.lojaId }, select: { archived_at: true } });
    if (!loja || loja.archived_at) return fail("VALIDATION_ERROR", "Escolha uma loja ativa para receber.", 422, "to");
  } else {
    const conta = await db.bankAccount.findFirst({ where: { id: destino.data.contaId as string }, select: { archived_at: true } });
    if (!conta || conta.archived_at) return fail("VALIDATION_ERROR", "Escolha uma conta ativa para receber.", 422, "to");
  }
  const notas = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null;

  try {
    const t = await runSerializableTenantTransaction(db, async (tx) => {
      const leitor = tx as unknown as TenantPrismaClient;
      const saldo = origem.data.lojaId
        ? await saldoDaGaveta(leitor, origem.data.lojaId)
        : ((await saldosDasContas(leitor)).get(origem.data.contaId as string) ?? 0);
      if (saldo < valorCent) {
        throw new RecusaCaixa(
          fail(
            "INSUFFICIENT_CASH",
            `Saldo insuficiente na origem: há ${brl(saldo / 100)} e a transferência pede ${brl(valorCent / 100)}.`,
            409,
            "amount",
          ),
        );
      }
      const agora = new Date();
      const transf = await tx.cashTransfer.create({
        data: scoped({
          operation_key: chave,
          from_establishment_id: origem.data.lojaId,
          from_bank_account_id: origem.data.contaId,
          to_establishment_id: destino.data.lojaId,
          to_bank_account_id: destino.data.contaId,
          amount: valorCent / 100,
          notes: notas,
          created_by_user_id: ator.id,
        }),
      });
      const comum = {
        amount: valorCent / 100,
        origin: "transferencia" as const,
        occurred_at: agora,
        cash_transfer_id: transf.id,
        notes: notas,
        created_by_user_id: ator.id,
      };
      await tx.cashMovement.create({
        data: scoped({
          ...comum,
          establishment_id: origem.data.lojaId,
          bank_account_id: origem.data.contaId,
          direction: "saida" as const,
        }),
      });
      await tx.cashMovement.create({
        data: scoped({
          ...comum,
          establishment_id: destino.data.lojaId,
          bank_account_id: destino.data.contaId,
          direction: "entrada" as const,
        }),
      });
      return transf;
    });
    return ok(viewDaTransferencia(t, false));
  } catch (err) {
    if (err instanceof RecusaCaixa) return err.recusa;
    if (ehErroUnico(err)) {
      const igual = await transferenciaGravada(db, ator, chave);
      if (igual) return igual;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Conferência da gaveta (F3b, Q93)
// ---------------------------------------------------------------------------

export async function conferirGavetaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { establishment_id: string; counted: number; justification?: string | null },
): Promise<ActionResult<ConferenciaView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "conferir a gaveta");
  if (neg) return neg;
  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;
  if (!numero(input.counted) || centavos(input.counted) < 0) {
    return fail("VALIDATION_ERROR", "Informe quanto há na gaveta (zero ou mais).", 422, "counted");
  }
  const contadoCent = centavos(input.counted);
  const justificativa = typeof input.justification === "string" && input.justification.trim() ? input.justification.trim() : null;

  try {
    const id = await runSerializableTenantTransaction(db, async (tx) => {
      const esperadoCent = await saldoDaGaveta(tx as unknown as TenantPrismaClient, loja.data.id);
      const diffCent = contadoCent - esperadoCent;
      if (diffCent !== 0 && !justificativa) {
        throw new RecusaCaixa(
          fail(
            "VALIDATION_ERROR",
            `A gaveta tem ${diffCent > 0 ? "sobra" : "falta"} de ${brl(Math.abs(diffCent) / 100)}: diga o motivo.`,
            422,
            "justification",
          ),
        );
      }
      const agora = new Date();
      const conferencia = await tx.cashCount.create({
        data: scoped({
          establishment_id: loja.data.id,
          expected: esperadoCent / 100,
          counted: contadoCent / 100,
          difference: diffCent / 100,
          justification: justificativa,
          counted_at: agora,
          created_by_user_id: ator.id,
        }),
      });
      if (diffCent !== 0) {
        const sobra = diffCent > 0;
        const lancamento = await createLinkedEntry(tx, {
          entry_type: sobra ? "income" : "expense",
          category: CATEGORIA_DIFERENCA_CAIXA,
          amount: Math.abs(diffCent) / 100,
          related_module: "emporio",
          related_id: conferencia.id,
          occurred_at: agora,
          status: "paid",
          establishment_id: loja.data.id,
          payment_method: "dinheiro",
        });
        const fp = await tx.financialPayment.findFirst({ where: { entry_id: lancamento.id }, select: { id: true } });
        await tx.cashMovement.create({
          data: scoped({
            establishment_id: loja.data.id,
            bank_account_id: null,
            direction: sobra ? ("entrada" as const) : ("saida" as const),
            amount: Math.abs(diffCent) / 100,
            origin: "conferencia" as const,
            occurred_at: agora,
            cash_count_id: conferencia.id,
            financial_payment_id: fp?.id ?? null,
            notes: justificativa,
            created_by_user_id: ator.id,
          }),
        });
      }
      return conferencia.id;
    });
    const c = await db.cashCount.findFirst({ where: { id }, include: { establishment: { select: { name: true } } } });
    return c ? ok(viewDaConferencia(c)) : NAO_ACHADO("Conferência");
  } catch (err) {
    if (err instanceof RecusaCaixa) return err.recusa;
    throw err;
  }
}

export async function listarConferenciasAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; limit?: number } = {},
): Promise<ActionResult<ConferenciaView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const limite = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 500) : 100;
  const linhas = await db.cashCount.findMany({
    where: opts.establishment_id ? { establishment_id: opts.establishment_id } : filtroDeLojas(visiveis),
    include: { establishment: { select: { name: true } } },
    orderBy: [{ counted_at: "desc" }, { created_at: "desc" }],
    take: limite,
  });
  return ok(linhas.map(viewDaConferencia));
}
