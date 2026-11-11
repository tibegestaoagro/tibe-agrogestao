import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import type { EmporioFranchisee, Prisma } from "@/generated/prisma/client";
import type { Ator } from "@/lib/actions/emporio-catalogo";
import { saldoDoCaixa, saldosDasContas } from "@/lib/actions/emporio-caixa";
import { exigir } from "@/lib/emporio/papel";
import { dinheiro, diferencas, registrarNoHistorico } from "@/lib/emporio/historico";
import { resolverTurno } from "@/lib/emporio/turno";
import { runSerializableTenantTransaction, type TenantTransactionClient } from "@/lib/financial";
import { decToNum, isoOrNull } from "@/lib/serialize";

/**
 * O franqueado do Empório (Q300, Q304, Q305): cadastro curto da conta (nome e telefone) e o
 * crédito interno que ele acumula nas vendas. O saldo nunca é gravado (invariante 2): é a soma
 * de `EmporioSale.franchisee_credit` das vendas ativas menos a de `EmporioFranchiseePayment`
 * ativos, e pode ficar negativo (venda cancelada depois de paga). O crédito não é despesa:
 * o pagamento não cria `FinancialEntry`, só a saída de caixa.
 */

export type FranchiseeInput = {
  name?: string | null;
  phone?: string | null;
  document?: string | null;
  notes?: string | null;
};

export type FranchiseeView = {
  id: string;
  name: string;
  phone: string;
  document: string | null;
  notes: string | null;
  archived_at: string | null;
  balance: number;
};

export type StatementLine = {
  kind: "credito" | "pagamento";
  date: string;
  amount: number;
  sale_id: string | null;
  sale_number: number | null;
  payment_id: string | null;
  /** Só no pagamento: de onde saiu o dinheiro. */
  paid_from: { establishment_id: string | null; establishment_name: string | null; bank_account_id: string | null; bank_account_name: string | null } | null;
  notes: string | null;
};

export type FranchiseePaymentView = {
  id: string;
  franchisee_id: string;
  amount: number;
  paid_at: string;
  establishment_id: string | null;
  bank_account_id: string | null;
  cash_register_id: string | null;
  notes: string | null;
  operation_key: string;
  created_at: string;
};

export type FranchiseePaymentInput = {
  operation_key: string;
  amount: number;
  paid_at?: Date | null;
  paid_from?: { establishment_id?: string | null; bank_account_id?: string | null; cash_register_id?: string | null } | null;
  notes?: string | null;
};

const NAO_ACHADO = () => fail("NOT_FOUND", "Franqueado não encontrado.", 404);

const ROTULOS: Record<string, string> = {
  name: "Nome",
  phone: "Telefone",
  document: "CPF/CNPJ",
  notes: "Observações",
};
const mascarar = (v: unknown) => (v ? "informado" : null);
const PESSOAIS = { document: mascarar, phone: mascarar };

const centavos = (v: number) => Math.round(v * 100);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const textoOuNulo = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const ehErroUnico = (e: unknown) => (e as { code?: unknown })?.code === "P2002";

class AbortarPagamento extends Error {
  constructor(public recusa: ActionResult<never>) {
    super("pagamento abortado");
  }
}

function serializar(f: EmporioFranchisee, saldoEmCentavos: number): FranchiseeView {
  return {
    id: f.id,
    name: f.name,
    phone: f.phone,
    document: f.document,
    notes: f.notes,
    archived_at: isoOrNull(f.archived_at),
    balance: saldoEmCentavos / 100,
  };
}

/** Saldos em centavos de vários franqueados de uma vez: crédito das vendas ativas menos pagamentos ativos. */
async function saldosEmCentavos(db: TenantPrismaClient, ids: string[]): Promise<Map<string, number>> {
  const saldos = new Map<string, number>(ids.map((id) => [id, 0]));
  if (ids.length === 0) return saldos;
  const creditos = await db.emporioSale.groupBy({
    by: ["franchisee_id"],
    where: { franchisee_id: { in: ids }, canceled_at: null },
    _sum: { franchisee_credit: true },
  });
  for (const c of creditos) {
    if (c.franchisee_id) saldos.set(c.franchisee_id, (saldos.get(c.franchisee_id) ?? 0) + centavos(decToNum(c._sum.franchisee_credit) ?? 0));
  }
  const pagos = await db.emporioFranchiseePayment.groupBy({
    by: ["franchisee_id"],
    where: { franchisee_id: { in: ids }, canceled_at: null },
    _sum: { amount: true },
  });
  for (const p of pagos) {
    saldos.set(p.franchisee_id, (saldos.get(p.franchisee_id) ?? 0) - centavos(decToNum(p._sum.amount) ?? 0));
  }
  return saldos;
}

async function visaoDe(db: TenantPrismaClient, f: EmporioFranchisee): Promise<FranchiseeView> {
  const saldos = await saldosEmCentavos(db, [f.id]);
  return serializar(f, saldos.get(f.id) ?? 0);
}

export async function cadastrarFranqueadoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: FranchiseeInput,
): Promise<ActionResult<FranchiseeView>> {
  const neg = await exigir(db, ator, "chave:lancar_compra", "cadastrar um franqueado");
  if (neg) return neg;

  const nome = textoOuNulo(input?.name);
  if (!nome) return fail("VALIDATION_ERROR", "Informe o nome do franqueado.", 422, "name");
  const telefone = textoOuNulo(input?.phone);
  if (!telefone) return fail("VALIDATION_ERROR", "Informe o telefone do franqueado.", 422, "phone");

  const criado = await db.$transaction(async (tx) => {
    const novo = await tx.emporioFranchisee.create({
      data: scoped({
        name: nome,
        phone: telefone,
        document: textoOuNulo(input.document),
        notes: textoOuNulo(input.notes),
      }) as Prisma.EmporioFranchiseeUncheckedCreateInput,
    });
    await registrarNoHistorico(tx, ator, {
      action: "franqueado.cadastrar",
      target_type: "franqueado",
      target_id: novo.id,
      summary: `Cadastrou o franqueado ${novo.name}`,
    });
    return novo;
  });
  return ok(serializar(criado, 0));
}

/** Edita o franqueado (ausente mantém, nulo limpa `document` e `notes`; `name` e `phone` não ficam vazios). */
export async function editarFranqueadoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: FranchiseeInput,
): Promise<ActionResult<FranchiseeView>> {
  const neg = await exigir(db, ator, "chave:lancar_compra", "editar um franqueado");
  if (neg) return neg;

  const atual = await db.emporioFranchisee.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO();

  const entrada = (input ?? {}) as Record<string, string | null | undefined>;
  const dados: Record<string, string | null> = {};
  if ("name" in entrada) {
    const v = textoOuNulo(entrada.name);
    if (!v) return fail("VALIDATION_ERROR", "Informe o nome do franqueado.", 422, "name");
    dados.name = v;
  }
  if ("phone" in entrada) {
    const v = textoOuNulo(entrada.phone);
    if (!v) return fail("VALIDATION_ERROR", "Informe o telefone do franqueado.", 422, "phone");
    dados.phone = v;
  }
  if ("document" in entrada) dados.document = textoOuNulo(entrada.document);
  if ("notes" in entrada) dados.notes = textoOuNulo(entrada.notes);

  const guardado = { name: atual.name, phone: atual.phone, document: atual.document, notes: atual.notes };
  const novo = await db.$transaction(async (tx) => {
    const r = await tx.emporioFranchisee.update({ where: { id }, data: dados });
    await registrarNoHistorico(tx, ator, {
      action: "franqueado.editar",
      target_type: "franqueado",
      target_id: id,
      summary: `Editou o franqueado ${r.name}`,
      changes: diferencas(
        guardado,
        { name: r.name, phone: r.phone, document: r.document, notes: r.notes },
        ROTULOS,
        PESSOAIS,
      ),
    });
    return r;
  });
  return ok(await visaoDe(db, novo));
}

export async function arquivarFranqueadoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  arquivado: boolean,
): Promise<ActionResult<FranchiseeView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "arquivar um franqueado");
  if (neg) return neg;
  const atual = await db.emporioFranchisee.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO();

  const novo = await db.$transaction(async (tx) => {
    const r = await tx.emporioFranchisee.update({ where: { id }, data: { archived_at: arquivado ? new Date() : null } });
    await registrarNoHistorico(tx, ator, {
      action: arquivado ? "franqueado.arquivar" : "franqueado.desarquivar",
      target_type: "franqueado",
      target_id: id,
      summary: `${arquivado ? "Arquivou" : "Desarquivou"} o franqueado ${r.name}`,
    });
    return r;
  });
  return ok(await visaoDe(db, novo));
}

export async function listarFranqueadosAction(
  db: TenantPrismaClient,
  ator: Ator,
  f: { q?: string; arquivados?: boolean } = {},
): Promise<ActionResult<FranchiseeView[]>> {
  const neg = await exigir(db, ator, "fora_do_caixa", "ver os franqueados");
  if (neg) return neg;

  const termo = (f.q ?? "").trim();
  const where: Prisma.EmporioFranchiseeWhereInput = {
    ...(f.arquivados ? {} : { archived_at: null }),
    ...(termo
      ? {
          OR: [
            { name: { contains: termo, mode: "insensitive" } },
            { phone: { contains: termo } },
            { document: { contains: termo } },
          ],
        }
      : {}),
  };
  const linhas = await db.emporioFranchisee.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }] });
  const saldos = await saldosEmCentavos(db, linhas.map((l) => l.id));
  return ok(linhas.map((l) => serializar(l, saldos.get(l.id) ?? 0)));
}

export async function lerFranqueadoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<FranchiseeView & { statement: StatementLine[] }>> {
  const neg = await exigir(db, ator, "fora_do_caixa", "ver um franqueado");
  if (neg) return neg;
  const f = await db.emporioFranchisee.findFirst({ where: { id } });
  if (!f) return NAO_ACHADO();

  const vendas = await db.emporioSale.findMany({
    where: { franchisee_id: id, canceled_at: null, franchisee_credit: { gt: 0 } },
    select: { id: true, number: true, sold_at: true, franchisee_credit: true },
  });
  const pagamentos = await db.emporioFranchiseePayment.findMany({
    where: { franchisee_id: id, canceled_at: null },
    include: { establishment: { select: { name: true } }, bank_account: { select: { name: true } } },
  });

  const linhas: StatementLine[] = [
    ...vendas.map((v): StatementLine => ({
      kind: "credito",
      date: v.sold_at.toISOString(),
      amount: decToNum(v.franchisee_credit) ?? 0,
      sale_id: v.id,
      sale_number: v.number,
      payment_id: null,
      paid_from: null,
      notes: null,
    })),
    ...pagamentos.map((p): StatementLine => ({
      kind: "pagamento",
      date: p.paid_at.toISOString(),
      amount: decToNum(p.amount) ?? 0,
      sale_id: null,
      sale_number: null,
      payment_id: p.id,
      paid_from: {
        establishment_id: p.establishment_id,
        establishment_name: p.establishment?.name ?? null,
        bank_account_id: p.bank_account_id,
        bank_account_name: p.bank_account?.name ?? null,
      },
      notes: p.notes,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return ok({ ...(await visaoDe(db, f)), statement: linhas });
}

/**
 * Q304: paga parte ou todo o crédito. Sai da gaveta do turno aberto ou de uma conta bancária,
 * com a mesma checagem de saldo do pagamento de compra. Não cria `FinancialEntry` (Q303, Q306).
 * Franqueado arquivado ainda recebe: pode ter saldo a quitar.
 */
export async function pagarFranqueadoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: FranchiseePaymentInput,
): Promise<ActionResult<{ payment: FranchiseePaymentView; franchisee: FranchiseeView }>> {
  const neg = await exigir(db, ator, "dinheiro", "pagar o crédito de um franqueado");
  if (neg) return neg;

  const f = await db.emporioFranchisee.findFirst({ where: { id } });
  if (!f) return NAO_ACHADO();

  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  const devolver = async (p: Awaited<ReturnType<typeof db.emporioFranchiseePayment.findFirst>>) => {
    if (!p || p.franchisee_id !== id) return fail("OPERATION_KEY_REUSED", "Essa chave de operação já foi usada em outro registro.", 409, "operation_key");
    const atualizado = await db.emporioFranchisee.findFirst({ where: { id } });
    return ok({ payment: serializarPagamento(p), franchisee: await visaoDe(db, atualizado ?? f) });
  };

  // Repetir a chave devolve o pagamento gravado, sem escrever nada.
  const repetido = await db.emporioFranchiseePayment.findFirst({ where: { operation_key: chave } });
  if (repetido) return devolver(repetido);

  const valor = input?.amount;
  if (typeof valor !== "number" || !Number.isFinite(valor) || centavos(valor) <= 0) {
    return fail("VALIDATION_ERROR", "O valor do pagamento deve ser maior que zero.", 422, "amount");
  }
  const valorC = centavos(valor);
  const quando = input.paid_at ?? new Date();
  if (!(quando instanceof Date) || Number.isNaN(quando.getTime())) {
    return fail("VALIDATION_ERROR", "Informe uma data de pagamento válida.", 422, "paid_at");
  }

  const pf = input.paid_from;
  const gavetaId = typeof pf?.establishment_id === "string" && pf.establishment_id.trim() ? pf.establishment_id.trim() : null;
  const contaId = typeof pf?.bank_account_id === "string" && pf.bank_account_id.trim() ? pf.bank_account_id.trim() : null;
  if ((gavetaId === null) === (contaId === null)) {
    return fail("VALIDATION_ERROR", "Diga de onde saiu o dinheiro: a gaveta da loja ou uma conta.", 422, "paid_from");
  }
  const caixaPedido = typeof pf?.cash_register_id === "string" && pf.cash_register_id.trim() ? pf.cash_register_id.trim() : undefined;
  if (gavetaId) {
    const loja = await db.establishment.findFirst({ where: { id: gavetaId }, select: { archived_at: true } });
    if (!loja) return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "paid_from");
    if (loja.archived_at) return fail("VALIDATION_ERROR", "Esse estabelecimento está arquivado.", 422, "paid_from");
  }
  if (contaId) {
    const conta = await db.bankAccount.findFirst({ where: { id: contaId }, select: { archived_at: true } });
    if (!conta) return fail("NOT_FOUND", "Conta não encontrada.", 404, "paid_from");
    if (conta.archived_at) return fail("VALIDATION_ERROR", "Essa conta está arquivada.", 422, "paid_from");
  }

  try {
    // Serializável: dois pagamentos simultâneos não passam do saldo do franqueado nem do da gaveta ou conta.
    const criado = await runSerializableTenantTransaction(db, async (txSerial) => {
      const leitor = txSerial as unknown as TenantPrismaClient;
      const tx = txSerial as unknown as Parameters<Parameters<TenantPrismaClient["$transaction"]>[0]>[0];

      const saldoF = (await saldosEmCentavos(leitor, [id])).get(id) ?? 0;
      if (valorC > saldoF) {
        throw new AbortarPagamento(
          fail("AMOUNT_ABOVE_BALANCE", `O valor passa do crédito do franqueado: o saldo é ${brl(saldoF / 100)}.`, 422, "amount"),
        );
      }

      let turno: { id: string; cash_register_id: string } | null = null;
      if (gavetaId) {
        const r = await resolverTurno(txSerial as unknown as TenantTransactionClient, ator, gavetaId, caixaPedido, "exige");
        if (!r.ok) throw new AbortarPagamento(r);
        turno = r.turno;
      }
      const saldoCaixa = turno
        ? await saldoDoCaixa(leitor, turno.cash_register_id)
        : ((await saldosDasContas(leitor)).get(contaId as string) ?? 0);
      if (saldoCaixa < valorC) {
        throw new AbortarPagamento(
          fail(
            "INSUFFICIENT_CASH",
            `Saldo insuficiente: há ${brl(saldoCaixa / 100)} e o pagamento é ${brl(valorC / 100)}.`,
            409,
            "paid_from",
          ),
        );
      }

      const pagamento = await tx.emporioFranchiseePayment.create({
        data: scoped({
          franchisee_id: id,
          amount: valorC / 100,
          paid_at: quando,
          establishment_id: gavetaId,
          bank_account_id: contaId,
          cash_register_id: turno?.cash_register_id ?? null,
          cash_session_id: turno?.id ?? null,
          notes: textoOuNulo(input.notes),
          operation_key: chave,
          created_by_user_id: ator.id,
        }),
      });
      await tx.cashMovement.create({
        data: scoped({
          establishment_id: gavetaId,
          cash_register_id: turno?.cash_register_id ?? null,
          cash_session_id: turno?.id ?? null,
          bank_account_id: contaId,
          direction: "saida" as const,
          amount: valorC / 100,
          origin: "pagamento_franqueado" as const,
          occurred_at: quando,
          franchisee_payment_id: pagamento.id,
          created_by_user_id: ator.id,
        }),
      });
      await registrarNoHistorico(tx, ator, {
        action: "franqueado.pagar",
        establishment_id: gavetaId,
        target_type: "franqueado",
        target_id: id,
        summary: `Pagou ${dinheiro(valorC / 100)} do crédito do franqueado ${f.name}`,
      });
      return pagamento;
    });
    return ok({ payment: serializarPagamento(criado), franchisee: await visaoDe(db, f) });
  } catch (err) {
    if (err instanceof AbortarPagamento) return err.recusa;
    if (ehErroUnico(err)) {
      // Duas requisições com a mesma chave ao mesmo tempo: a perdedora devolve a gravada.
      const igual = await db.emporioFranchiseePayment.findFirst({ where: { operation_key: chave } });
      if (igual) return devolver(igual);
    }
    throw err;
  }
}

function serializarPagamento(p: {
  id: string;
  franchisee_id: string;
  amount: unknown;
  paid_at: Date;
  establishment_id: string | null;
  bank_account_id: string | null;
  cash_register_id: string | null;
  notes: string | null;
  operation_key: string;
  created_at: Date;
}): FranchiseePaymentView {
  return {
    id: p.id,
    franchisee_id: p.franchisee_id,
    amount: decToNum(p.amount as Parameters<typeof decToNum>[0]) ?? 0,
    paid_at: p.paid_at.toISOString(),
    establishment_id: p.establishment_id,
    bank_account_id: p.bank_account_id,
    cash_register_id: p.cash_register_id,
    notes: p.notes,
    operation_key: p.operation_key,
    created_at: p.created_at.toISOString(),
  };
}
