import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { hasMinRole } from "@/lib/permissions";
import { runSerializableTenantTransaction } from "@/lib/financial";
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

const NEGADO_ADMIN = () => fail("FORBIDDEN", "Só o dono e o administrador podem fazer isso.", 403);
const NEGADO_OPERADOR = () => fail("FORBIDDEN", "Seu perfil só permite consultar o Empório.", 403);
const NAO_ACHADO = (o: string, field?: string) => fail("NOT_FOUND", `${o} não encontrado.`, 404, field);

const ehAdmin = (a: Ator) => hasMinRole(a.role, "ADMIN");
const ehOperador = (a: Ator) => hasMinRole(a.role, "OPERADOR");

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
async function entradasAbertas(
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
  if (!ehOperador(ator)) return NEGADO_OPERADOR();
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

async function saldosDasContas(db: TenantPrismaClient): Promise<Map<string, number>> {
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
  return mapa;
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
  if (!ehAdmin(ator)) return NEGADO_ADMIN();
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
  if (!ehAdmin(ator)) return NEGADO_ADMIN();
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
  if (!ehAdmin(ator)) return NEGADO_ADMIN();
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
  if (!ehAdmin(ator)) return NEGADO_ADMIN();
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
  notes: string | null;
};

export type CaixaView = {
  drawers: { establishment_id: string; name: string; balance: number }[];
  accounts: { bank_account_id: string; name: string; balance: number }[];
  movements: MovimentoDeCaixaView[];
};

export async function lerCaixaAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; bank_account_id?: string; limit?: number } = {},
): Promise<ActionResult<CaixaView>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  if (opts.bank_account_id && !ehAdmin(ator)) return NEGADO_ADMIN();

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

  let contas: CaixaView["accounts"] = [];
  if (ehAdmin(ator)) {
    const todas = await viewsDasContas(db, { archived_at: null });
    contas = todas.map((c) => ({ bank_account_id: c.id, name: c.name, balance: c.balance }));
  }

  const lojaIds = opts.establishment_id ? [opts.establishment_id] : lojas.map((l) => l.id);
  const onde = opts.bank_account_id
    ? { bank_account_id: opts.bank_account_id }
    : opts.establishment_id
      ? { establishment_id: opts.establishment_id }
      : ehAdmin(ator)
        ? { OR: [{ establishment_id: { in: lojaIds } }, { bank_account_id: { not: null } }] }
        : { establishment_id: { in: lojaIds } };
  const limite = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 500) : 100;
  const movs = await db.cashMovement.findMany({
    where: onde,
    orderBy: [{ occurred_at: "desc" }, { created_at: "desc" }],
    take: limite,
  });

  return ok({
    drawers: lojas.map((l) => ({ establishment_id: l.id, name: l.name, balance: (saldoLoja.get(l.id) ?? 0) / 100 })),
    accounts: contas,
    movements: movs.map((m) => ({
      id: m.id,
      establishment_id: m.establishment_id,
      bank_account_id: m.bank_account_id,
      direction: m.direction,
      amount: decToNum(m.amount) ?? 0,
      origin: m.origin,
      occurred_at: m.occurred_at.toISOString(),
      sale_id: m.sale_id,
      sale_return_id: m.sale_return_id,
      financial_payment_id: m.financial_payment_id,
      notes: m.notes,
    })),
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
    if (!ehOperador(ator)) return NEGADO_OPERADOR();
    const loja = await acharLojaParaEscrita(db, ator, input.establishment_id);
    if (!loja.ok) return loja;
    lojaId = loja.data.id;
  } else {
    if (!ehAdmin(ator)) return NEGADO_ADMIN();
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
    return ok({
      id: m.id,
      establishment_id: m.establishment_id,
      bank_account_id: m.bank_account_id,
      direction: m.direction,
      amount: decToNum(m.amount) ?? 0,
      origin: m.origin,
      occurred_at: m.occurred_at.toISOString(),
      sale_id: m.sale_id,
      sale_return_id: m.sale_return_id,
      financial_payment_id: m.financial_payment_id,
      notes: m.notes,
    });
  } catch (err) {
    if (err instanceof RecusaCaixa) return err.recusa;
    throw err;
  }
}
