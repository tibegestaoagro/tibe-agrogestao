import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { exigir, exigirUma, papelDoEmporio, pode, recusaDe } from "@/lib/emporio/papel";
import { createLinkedEntry, runSerializableTenantTransaction, type TenantTransactionClient } from "@/lib/financial";
import { resolverTurno } from "@/lib/emporio/turno";
import { CATEGORIA_DIFERENCA_CAIXA, VIGENCIA_DESDE_SEMPRE, hojeEmBrasilia } from "@/lib/emporio/cartao";
import {
  criarTaxaAction,
  editarTaxaAction,
  garantirAdquirenteMaquininha,
  listarTaxasAction,
  novaVigenciaAction,
  removerTaxaAction,
  type TaxaView,
} from "@/lib/actions/emporio-cartoes";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { diferencas, dinheiro, registrarNoHistorico } from "@/lib/emporio/historico";
import { diaUtc, vencimentoEfetivo } from "@/lib/emporio/fiado";
import { acharLojaParaEscrita } from "@/lib/actions/emporio-estoque";
import { CATEGORIA_VENDAS } from "@/lib/actions/emporio-vendas";
import { CATEGORIA_ACORDO } from "@/lib/emporio/acordo";
import { contaPixDisponivelParaLoja } from "@/lib/emporio/conta-pix";
import { dataBr } from "@/lib/emporio/datas";

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
  customer_id: string;
  customer_name: string;
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
  emporio_customer_id: string | null;
  amount: unknown;
  due_date: Date | null;
  created_at: Date;
  sold_at: Date;
  /** Vencimento do fiado lido pela regra (`vencimentoEfetivo`): o fiado antigo sem data própria vale a venda mais o prazo padrão. */
  effective_due_date: Date;
  open_cent: number;
  paid_cent: number;
  /** Só a parcela de acordo tem: o acordo a que pertence. A venda tem nulo. */
  agreement_id: string | null;
  /** "Parcela 2/3 do acordo de 10/12/2026"; nulo na venda. */
  installment_label: string | null;
};

/** A parcela que nasce de cheque devolvido de venda já absorvida pelo acordo. */
/** Sufixo das notas que marca a parcela extra do acordo (cheque devolvido); só este arquivo grava e lê. */
const SUFIXO_PARCELA_EXTRA = "parcela extra";
export const ehParcelaExtra = (notes: string | null | undefined) => !!notes && notes.endsWith(SUFIXO_PARCELA_EXTRA);

const diaBr = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Lançamentos de venda e parcelas de acordo do Empório ainda em aberto, com o saldo calculado pela soma dos pagamentos. */
export async function entradasAbertas(
  db: TenantPrismaClient,
  where: Record<string, unknown>,
  opts: { prazoPadraoDias?: number } = {},
): Promise<EntradaAberta[]> {
  const entradas = await db.financialEntry.findMany({
    where: {
      related_module: "emporio",
      entry_type: "income",
      category: { in: [CATEGORIA_VENDAS, CATEGORIA_ACORDO] },
      status: "pending",
      ...where,
    },
  });
  if (entradas.length === 0) return [];
  // A parcela do acordo: o número e a data do acordo vêm do acordo e das irmãs.
  const acordoIds = [...new Set(entradas.flatMap((e) => (e.agreement_id ? [e.agreement_id] : [])))];
  const acordos = acordoIds.length
    ? await db.emporioCreditAgreement.findMany({ where: { id: { in: acordoIds } }, select: { id: true, created_at: true, installments: true } })
    : [];
  const acordoPorId = new Map(acordos.map((a) => [a.id, a]));
  const irmas = acordoIds.length
    ? await db.financialEntry.findMany({
        where: { agreement_id: { in: acordoIds }, category: CATEGORIA_ACORDO },
        select: { id: true, agreement_id: true, due_date: true, created_at: true, notes: true },
      })
    : [];
  const numeroDaParcela = new Map<string, number>();
  for (const id of acordoIds) {
    irmas
      .filter((p) => p.agreement_id === id)
      .sort(
        (a, b) =>
          Number(ehParcelaExtra(a.notes)) - Number(ehParcelaExtra(b.notes)) ||
          (a.due_date?.getTime() ?? 0) - (b.due_date?.getTime() ?? 0) ||
          a.created_at.getTime() - b.created_at.getTime(),
      )
      .forEach((p, i) => numeroDaParcela.set(p.id, i + 1));
  }
  const vendas = await db.emporioSale.findMany({
    where: { id: { in: entradas.map((e) => e.related_id as string) } },
    select: { id: true, sold_at: true },
  });
  const vendidoEm = new Map(vendas.map((v) => [v.id, v.sold_at]));
  const pagamentosFiado = await db.emporioSalePayment.findMany({
    where: { sale_id: { in: vendas.map((v) => v.id) }, kind: "fiado" },
    select: { sale_id: true, due_date: true },
  });
  const fiadoDaVenda = new Map(pagamentosFiado.map((p) => [p.sale_id, p.due_date]));
  const prazoPadrao =
    opts.prazoPadraoDias ?? (await db.emporioSettings.findFirst({ select: { fiado_due_days: true } }))?.fiado_due_days ?? 30;
  const pagos = await db.financialPayment.findMany({
    where: { entry_id: { in: entradas.map((e) => e.id) } },
    select: { entry_id: true, amount: true },
  });
  const soma = new Map<string, number>();
  for (const p of pagos) soma.set(p.entry_id, (soma.get(p.entry_id) ?? 0) + centavos(decToNum(p.amount) ?? 0));
  return entradas
    .map((e) => {
      const pago = soma.get(e.id) ?? 0;
      const acordo = e.agreement_id ? acordoPorId.get(e.agreement_id) : undefined;
      const vendidoQuando = acordo ? e.created_at : (vendidoEm.get(e.related_id as string) ?? e.created_at);
      return {
        id: e.id,
        related_id: e.related_id,
        establishment_id: e.establishment_id,
        emporio_customer_id: e.emporio_customer_id,
        amount: e.amount,
        due_date: e.due_date,
        created_at: e.created_at,
        sold_at: vendidoQuando,
        effective_due_date: acordo
          ? (e.due_date ?? e.created_at)
          : vencimentoEfetivo(
              { due_date: e.due_date, sold_at: hojeEmBrasilia(vendidoQuando), fiado_due_date: fiadoDaVenda.get(e.related_id as string) ?? null },
              prazoPadrao,
            ),
        paid_cent: pago,
        open_cent: centavos(decToNum(e.amount) ?? 0) - pago,
        agreement_id: acordo ? acordo.id : null,
        installment_label: acordo
          ? ehParcelaExtra(e.notes)
            ? `Parcela extra do acordo de ${diaBr(acordo.created_at)}`
            : `Parcela ${numeroDaParcela.get(e.id) ?? "?"}/${acordo.installments} do acordo de ${diaBr(acordo.created_at)}`
          : null,
      };
    })
    .filter((e) => e.open_cent > 0)
    // A ordem da LISTA é por venda (a mais antiga primeiro), com o vencimento desempatando parcelas do mesmo acordo.
    // A FILA do recebimento é outra: `receberFiadoAction` reordena por vencimento efetivo (Q238).
    .sort(
      (a, b) =>
        a.sold_at.getTime() - b.sold_at.getTime() ||
        a.effective_due_date.getTime() - b.effective_due_date.getTime() ||
        a.created_at.getTime() - b.created_at.getTime(),
    );
}

function filtroDeLojas(visiveis: Set<string> | null): Record<string, unknown> {
  return visiveis ? { establishment_id: { in: [...visiveis] } } : {};
}

export async function listarFiadoAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; customer_id?: string } = {},
): Promise<ActionResult<FiadoClienteView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const abertas = await entradasAbertas(db, {
    ...(opts.establishment_id ? { establishment_id: opts.establishment_id } : filtroDeLojas(visiveis)),
    ...(opts.customer_id ? { emporio_customer_id: opts.customer_id } : { emporio_customer_id: { not: null } }),
  });
  const clientesDb = await db.emporioCustomer.findMany({
    where: { id: { in: [...new Set(abertas.map((e) => e.emporio_customer_id as string))] } },
    select: { id: true, name: true, phone: true },
  });
  const porCliente = new Map(clientesDb.map((c) => [c.id, c]));
  const hoje = hojeEmBrasilia();

  const clientes = new Map<string, FiadoClienteView>();
  for (const e of abertas) {
    const id = e.emporio_customer_id as string;
    const c = porCliente.get(id);
    if (!c) continue;
    const venceEm = e.effective_due_date.toISOString();
    const vencido = diaUtc(e.effective_due_date) < hoje.getTime();
    const aberto = e.open_cent / 100;
    let cli = clientes.get(id);
    if (!cli) {
      cli = {
        customer_id: id,
        customer_name: c.name,
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
    if (cli.oldest_due_date === null || venceEm < cli.oldest_due_date) cli.oldest_due_date = venceEm;
    cli.entries.push({
      entry_id: e.id,
      sale_id: e.agreement_id ? null : e.related_id,
      establishment_id: e.establishment_id,
      amount: decToNum(e.amount) ?? 0,
      paid: e.paid_cent / 100,
      open: aberto,
      due_date: venceEm,
      overdue: vencido,
    });
  }
  return ok(
    [...clientes.values()].sort((a, b) => {
      if (a.oldest_due_date && b.oldest_due_date) return a.oldest_due_date.localeCompare(b.oldest_due_date);
      if (a.oldest_due_date) return -1;
      if (b.oldest_due_date) return 1;
      return a.customer_name.localeCompare(b.customer_name, "pt-BR");
    }),
  );
}

export type ReceberFiadoInput = {
  operation_key: string;
  customer_id: string;
  establishment_id: string;
  amount: number;
  kind: string;
  entry_id?: string | null;
  bank_account_id?: string | null;
  /** Entrega 2: o caixa do turno; o dinheiro exige turno, o PIX leva o turno quando houver. */
  cash_register_id?: string | null;
};

export type RecebimentoView = {
  operation_key: string;
  customer_id: string;
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
    include: { financial_payment: { include: { entry: { select: { id: true, emporio_customer_id: true, establishment_id: true, related_id: true, agreement_id: true } } } } },
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
    customer_id: primeira.fp.entry.emporio_customer_id ?? "",
    establishment_id: lojaId ?? "",
    kind: primeira.fp.method ?? "dinheiro",
    amount: total / 100,
    received_at: primeira.m.occurred_at.toISOString(),
    parts: partes.map(({ m, fp }) => ({
      entry_id: fp.entry_id,
      sale_id: fp.entry.agreement_id ? null : fp.entry.related_id,
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
  const neg = await exigirUma(db, ator, ["vendedor_da_loja", "dinheiro"], "receber fiado");
  if (neg) return neg;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  // §23.2: a chave não é única no banco (um recebimento pode tocar vários
  // lançamentos), então a repetição se resolve por busca.
  const gravado = await recebimentoGravado(db, ator, chave);
  if (gravado) return gravado;

  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;

  if (typeof input.customer_id !== "string" || !input.customer_id) {
    return fail("VALIDATION_ERROR", "Escolha o cliente.", 422, "customer_id");
  }
  const cliente = await db.emporioCustomer.findFirst({ where: { id: input.customer_id }, select: { id: true, name: true, archived_at: true } });
  if (!cliente || cliente.archived_at) return fail("VALIDATION_ERROR", "Escolha um cliente ativo.", 422, "customer_id");

  if (input.kind !== "dinheiro" && input.kind !== "pix") {
    return fail("VALIDATION_ERROR", "Escolha como o cliente pagou: dinheiro ou PIX.", 422, "kind");
  }
  if (!numero(input.amount) || centavos(input.amount) <= 0) {
    return fail("VALIDATION_ERROR", "O valor recebido deve ser maior que zero.", 422, "amount");
  }
  const valorCent = centavos(input.amount);
  // O Financeiro não trabalha na loja: o que ele recebe entra na conta e não toca turno nenhum.
  const naLoja = pode(await papelDoEmporio(db, ator), "vendedor_da_loja", loja.data.id);
  if (input.kind === "dinheiro" && !naLoja) {
    return fail("VALIDATION_ERROR", "O Financeiro recebe pela conta bancária; o dinheiro é no caixa da loja.", 422, "kind");
  }

  let contaId: string | null = null;
  if (input.kind === "pix") {
    const lojaExtra = await db.establishment.findFirst({ where: { id: loja.data.id }, select: { pix_bank_account_id: true } });
    const escolhida = input.bank_account_id || lojaExtra?.pix_bank_account_id || null;
    const conta = escolhida ? await db.bankAccount.findFirst({ where: { id: escolhida }, select: { id: true, archived_at: true } }) : null;
    if (!conta || conta.archived_at) {
      return fail(
        "VALIDATION_ERROR",
        "Para receber PIX, cadastre uma conta bancária e defina a conta PIX da loja.",
        422,
        input.bank_account_id ? "bank_account_id" : "kind",
      );
    }
    if (!(await contaPixDisponivelParaLoja(db, conta.id, loja.data.id))) {
      return fail("VALIDATION_ERROR", "Essa conta de PIX não vale para esta loja. Escolha outra conta.", 422, "bank_account_id");
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
          emporio_customer_id: cliente.id,
          ...filtroDeLojas(visiveis),
          ...(entradaId ? { id: entradaId } : {}),
        },
      );
      if (entradaId && abertas.length === 0) {
        throw new RecusaCaixa(fail("NOT_FOUND", "Essa conta a receber não foi encontrada ou já está quitada.", 404, "entry_id"));
      }
      // O dinheiro vai para o que vence primeiro (venda ou parcela); a venda mais antiga desempata.
      abertas.sort(
        (a, b) =>
          a.effective_due_date.getTime() - b.effective_due_date.getTime() ||
          a.sold_at.getTime() - b.sold_at.getTime() ||
          a.created_at.getTime() - b.created_at.getTime(),
      );
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

      const naGaveta = input.kind === "dinheiro";
      const turno = naLoja
        ? await resolverTurno(tx, ator, loja.data.id, texto(input.cash_register_id) ?? undefined, naGaveta ? "exige" : "se_houver")
        : { ok: true as const, turno: null };
      if (!turno.ok) throw new RecusaCaixa(turno);

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
            establishment_id: naGaveta ? loja.data.id : null,
            cash_register_id: naGaveta ? (turno.turno?.cash_register_id ?? null) : null,
            cash_session_id: turno.turno?.id ?? null,
            bank_account_id: contaId,
            direction: "entrada" as const,
            amount: parte / 100,
            origin: "recebimento_fiado" as const,
            occurred_at: agora,
            sale_id: e.agreement_id ? null : e.related_id,
            financial_payment_id: fp.id,
            operation_key: chave,
            created_by_user_id: ator.id,
          }),
        });
        feitas.push({ entry_id: e.id, sale_id: e.agreement_id ? null : e.related_id, amount: parte / 100, financial_payment_id: fp.id });
      }
      await registrarNoHistorico(tx, ator, {
        action: "fiado.receber",
        establishment_id: loja.data.id,
        target_type: "fiado",
        target_id: cliente.id,
        summary: `Recebeu ${dinheiro(valorCent / 100)} de fiado de ${cliente.name} (${input.kind === "pix" ? "PIX" : "dinheiro"})`,
      });
      return { feitas, agora };
    });
    return ok({
      operation_key: chave,
      customer_id: cliente.id,
      establishment_id: loja.data.id,
      kind: input.kind,
      amount: valorCent / 100,
      received_at: partes.agora.toISOString(),
      parts: partes.feitas,
      replayed: false,
    });
  } catch (err) {
    // A mesma chave em paralelo: a outra gravou enquanto esta corria (e o turno
    // pode ter fechado no meio). A recusa só vale se a chave segue sem recebimento.
    if (err instanceof RecusaCaixa || ehErroUnico(err)) {
      const igual = await recebimentoGravado(db, ator, chave);
      if (igual) return igual;
      if (err instanceof RecusaCaixa) return err.recusa;
    }
    throw err;
  }
}

/** Recusa lançada de dentro da transação para desfazê-la e devolver o `fail` pronto. */
export class RecusaCaixa extends Error {
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
  /** Q310: só os 14 dígitos; nulo quando não informado. */
  document: string | null;
  beneficiary: string | null;
  /** Q311: true = vale para o PIX de todas as lojas. */
  pix_all_establishments: boolean;
  /** Lojas onde a conta vale para o PIX; vazio quando vale em todas. */
  pix_available_establishment_ids: string[];
};

/** Q310: confere os dois dígitos verificadores do CNPJ (14 dígitos, não todos iguais). */
function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const digito = (base: string) => {
    let peso = base.length - 7;
    let soma = 0;
    for (const c of base) {
      soma += Number(c) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = digito(d.slice(0, 12));
  const d2 = digito(d.slice(0, 12) + d1);
  return d.endsWith(`${d1}${d2}`);
}

function validarCnpjDaConta(v: unknown): ActionResult<string | null> {
  if (v == null) return ok(null);
  if (typeof v !== "string") return fail("VALIDATION_ERROR", "Informe um CNPJ válido.", 422, "document");
  if (!v.trim()) return ok(null);
  const digitos = v.replace(/[.\-/\s]/g, "");
  if (!cnpjValido(digitos)) return fail("VALIDATION_ERROR", "O CNPJ não é válido: confira os 14 números.", 422, "document");
  return ok(digitos);
}

function validarFavorecido(v: unknown): ActionResult<string | null> {
  if (v == null) return ok(null);
  if (typeof v !== "string") return fail("VALIDATION_ERROR", "Informe o nome do favorecido.", 422, "beneficiary");
  const n = v.trim();
  if (!n) return ok(null);
  if (n.length > 120) return fail("VALIDATION_ERROR", "O favorecido pode ter até 120 letras.", 422, "beneficiary");
  return ok(n);
}

export { contaPixDisponivelParaLoja };

/** As lojas escolhidas para o PIX: pelo menos uma, todas existentes no tenant (client escopado). */
async function lojasDoPix(db: TenantPrismaClient, ids: unknown): Promise<ActionResult<{ id: string; name: string }[]>> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((x) => typeof x !== "string" || !x)) {
    return fail("VALIDATION_ERROR", "Escolha pelo menos uma loja onde a conta vale para o PIX.", 422, "establishment_ids");
  }
  const unicos = [...new Set(ids as string[])];
  const lojas = await db.establishment.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } });
  if (lojas.length !== unicos.length) {
    return fail("VALIDATION_ERROR", "Alguma das lojas escolhidas não existe.", 422, "establishment_ids");
  }
  return ok(lojas);
}

const textoDasLojas = (todas: boolean, nomes: string[]) => (todas ? "Todas as lojas" : [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")).join(", "));

/**
 * Saldo das contas, em centavos (Q90): os `CashMovement` mais as parcelas do
 * cartão não canceladas que já caíram (`effective_on` até hoje em Brasília, pelo `effective_net`).
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
    where: { canceled_at: null, effective_on: { lte: hojeEmBrasilia() } },
    _sum: { effective_net: true },
  });
  for (const c of caidas) {
    mapa.set(c.bank_account_id, (mapa.get(c.bank_account_id) ?? 0) + centavos(decToNum(c._sum.effective_net) ?? 0));
  }
  return mapa;
}

/** Entradas menos saídas, em centavos, dos movimentos que casam com o filtro. */
async function saldoDosMovimentos(
  db: TenantPrismaClient,
  where: { establishment_id: string } | { cash_register_id: string } | { manager_establishment_id: string },
): Promise<number> {
  const linhas = await db.cashMovement.groupBy({
    by: ["direction"],
    where,
    _sum: { amount: true },
  });
  let total = 0;
  for (const l of linhas) {
    const v = centavos(decToNum(l._sum.amount) ?? 0);
    total += l.direction === "entrada" ? v : -v;
  }
  return total;
}

/** Saldo da gaveta de uma loja, em centavos: a soma dos caixas dela. */
export function saldoDaGaveta(db: TenantPrismaClient, lojaId: string): Promise<number> {
  return saldoDosMovimentos(db, { establishment_id: lojaId });
}

/** Saldo de um caixa numerado, em centavos. */
export function saldoDoCaixa(db: TenantPrismaClient, cashRegisterId: string): Promise<number> {
  return saldoDosMovimentos(db, { cash_register_id: cashRegisterId });
}

/** Saldo "Com a gerência" de uma loja, em centavos. */
export function saldoDaGerencia(db: TenantPrismaClient, establishmentId: string): Promise<number> {
  return saldoDosMovimentos(db, { manager_establishment_id: establishmentId });
}

async function viewsDasContas(db: TenantPrismaClient, where: Record<string, unknown>): Promise<ContaView[]> {
  const contas = await db.bankAccount.findMany({
    where,
    include: { pix_of: { select: { id: true } }, pix_establishments: { select: { establishment_id: true } } },
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
    document: c.document,
    beneficiary: c.beneficiary,
    pix_all_establishments: c.pix_all_establishments,
    pix_available_establishment_ids: c.pix_all_establishments ? [] : c.pix_establishments.map((p) => p.establishment_id),
  }));
}

export async function listarContasAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { incluir_arquivadas?: boolean } = {},
): Promise<ActionResult<ContaView[]>> {
  const neg = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "ver as contas bancárias");
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
  input: {
    name: string;
    bank?: string | null;
    document?: string | null;
    beneficiary?: string | null;
    pix_all_establishments?: boolean;
    establishment_ids?: string[];
  },
): Promise<ActionResult<ContaView>> {
  const neg = await exigirUma(db, ator, ["conta", "dinheiro"], "criar uma conta bancária");
  if (neg) return neg;
  const nome = validarNomeDaConta(input?.name);
  if (!nome.ok) return nome;
  const banco = typeof input.bank === "string" && input.bank.trim() ? input.bank.trim() : null;
  const cnpj = validarCnpjDaConta(input.document);
  if (!cnpj.ok) return cnpj;
  const favorecido = validarFavorecido(input.beneficiary);
  if (!favorecido.ok) return favorecido;
  if (input.pix_all_establishments !== undefined && typeof input.pix_all_establishments !== "boolean") {
    return fail("VALIDATION_ERROR", "Informe se a conta vale para todas as lojas.", 422, "pix_all_establishments");
  }
  const todas = input.pix_all_establishments ?? true;
  let lojas: { id: string; name: string }[] = [];
  if (!todas) {
    const r = await lojasDoPix(db, input.establishment_ids);
    if (!r.ok) return r;
    lojas = r.data;
  }
  if (await db.bankAccount.findFirst({ where: { name: nome.data }, select: { id: true } })) return NOME_REPETIDO();
  try {
    const c = await db.$transaction(async (tx) => {
      const criada = await tx.bankAccount.create({
        data: scoped({
          name: nome.data,
          bank: banco,
          document: cnpj.data,
          beneficiary: favorecido.data,
          pix_all_establishments: todas,
          created_by_user_id: ator.id,
        }),
      });
      for (const l of lojas) {
        await tx.bankAccountPixEstablishment.create({
          data: scoped({ bank_account_id: criada.id, establishment_id: l.id }),
        });
      }
      await registrarNoHistorico(tx, ator, {
        action: "conta_bancaria.criar",
        target_type: "conta_bancaria",
        target_id: criada.id,
        summary: `Criou a conta bancária ${criada.name}`,
        changes: diferencas(
          { document: null, beneficiary: null, disponivel: null },
          { document: cnpj.data, beneficiary: favorecido.data, disponivel: todas ? null : textoDasLojas(false, lojas.map((l) => l.name)) },
          { document: "CNPJ", beneficiary: "Favorecido", disponivel: "Disponível para PIX em" },
        ),
      });
      return criada;
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
  input: {
    name?: string;
    bank?: string | null;
    archived?: boolean;
    document?: string | null;
    beneficiary?: string | null;
    pix_all_establishments?: boolean;
    establishment_ids?: string[];
  },
): Promise<ActionResult<ContaView>> {
  const neg = await exigirUma(db, ator, ["conta", "dinheiro"], "mudar uma conta bancária");
  if (neg) return neg;
  const atual = await db.bankAccount.findFirst({ where: { id }, include: { pix_establishments: { select: { establishment_id: true } } } });
  if (!atual) return NAO_ACHADO("Conta");

  const data: {
    name?: string;
    bank?: string | null;
    archived_at?: Date | null;
    document?: string | null;
    beneficiary?: string | null;
    pix_all_establishments?: boolean;
  } = {};
  if (input?.document !== undefined) {
    const cnpj = validarCnpjDaConta(input.document);
    if (!cnpj.ok) return cnpj;
    data.document = cnpj.data;
  }
  if (input?.beneficiary !== undefined) {
    const fav = validarFavorecido(input.beneficiary);
    if (!fav.ok) return fav;
    data.beneficiary = fav.data;
  }
  // Q311, Q313: a disponibilidade só muda quando o corpo a menciona; trocar para "lojas marcadas" exige a lista.
  const mexeNaDisponibilidade = input?.pix_all_establishments !== undefined || input?.establishment_ids !== undefined;
  const todasDepois = input?.pix_all_establishments ?? atual.pix_all_establishments;
  let lojasDepois: { id: string; name: string }[] = [];
  if (mexeNaDisponibilidade) {
    if (input?.pix_all_establishments !== undefined && typeof input.pix_all_establishments !== "boolean") {
      return fail("VALIDATION_ERROR", "Informe se a conta vale para todas as lojas.", 422, "pix_all_establishments");
    }
    if (!todasDepois) {
      const idsDepois = input?.establishment_ids ?? atual.pix_establishments.map((p) => p.establishment_id);
      const r = await lojasDoPix(db, idsDepois);
      if (!r.ok) return r;
      lojasDepois = r.data;
      const ficam = new Set(lojasDepois.map((l) => l.id));
      const presa = await db.establishment.findFirst({
        where: { pix_bank_account_id: id, id: { notIn: [...ficam] } },
        select: { name: true },
      });
      if (presa) {
        return fail(
          "VALIDATION_ERROR",
          `Essa conta é a conta PIX da loja ${presa.name}. Troque a conta PIX da loja antes de tirá-la da lista.`,
          422,
          "establishment_ids",
        );
      }
    }
    data.pix_all_establishments = todasDepois;
  }
  const nomesAntes = atual.pix_all_establishments
    ? []
    : (await db.establishment.findMany({ where: { id: { in: atual.pix_establishments.map((p) => p.establishment_id) } }, select: { name: true } })).map((l) => l.name);
  const disponivelAntes = textoDasLojas(atual.pix_all_establishments, nomesAntes);
  const disponivelDepois = mexeNaDisponibilidade ? textoDasLojas(todasDepois, lojasDepois.map((l) => l.name)) : disponivelAntes;
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
    if (Object.keys(data).length > 0) {
      await db.$transaction(async (tx) => {
        await tx.bankAccount.update({ where: { id }, data });
        if (mexeNaDisponibilidade) {
          await tx.bankAccountPixEstablishment.deleteMany({ where: { bank_account_id: id } });
          for (const l of lojasDepois) {
            await tx.bankAccountPixEstablishment.create({ data: scoped({ bank_account_id: id, establishment_id: l.id }) });
          }
        }
        await registrarNoHistorico(tx, ator, {
          action: "conta_bancaria.editar",
          target_type: "conta_bancaria",
          target_id: id,
          summary:
            data.archived_at !== undefined && Object.keys(data).length === 1
              ? `${data.archived_at ? "Arquivou" : "Reativou"} a conta bancária ${atual.name}`
              : `Editou a conta bancária ${atual.name}`,
          changes: diferencas(
            {
              name: atual.name,
              bank: atual.bank,
              document: atual.document,
              beneficiary: atual.beneficiary,
              disponivel: disponivelAntes,
              arquivada: atual.archived_at !== null,
            },
            {
              name: data.name ?? atual.name,
              bank: data.bank !== undefined ? data.bank : atual.bank,
              document: data.document !== undefined ? data.document : atual.document,
              beneficiary: data.beneficiary !== undefined ? data.beneficiary : atual.beneficiary,
              disponivel: disponivelDepois,
              arquivada: data.archived_at !== undefined ? data.archived_at !== null : atual.archived_at !== null,
            },
            { name: "Nome", bank: "Banco", document: "CNPJ", beneficiary: "Favorecido", disponivel: "Disponível para PIX em", arquivada: "Arquivada" },
            { arquivada: (v) => (v ? "Sim" : "Não") },
          ),
        });
      });
    }
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
  const neg = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "definir a conta PIX da loja");
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
    if (!(await contaPixDisponivelParaLoja(db, conta.id, loja.data.id))) {
      return fail("VALIDATION_ERROR", "Essa conta não está disponível para o PIX desta loja. Inclua a loja na lista da conta.", 422, "bank_account_id");
    }
    contaId = conta.id;
  }
  const lojaAntes = await db.establishment.findFirst({
    where: { id: loja.data.id },
    select: { name: true, pix_bank_account_id: true },
  });
  const nomesContas = new Map(
    (
      await db.bankAccount.findMany({
        where: { id: { in: [contaId, lojaAntes?.pix_bank_account_id].filter((x): x is string => !!x) } },
        select: { id: true, name: true },
      })
    ).map((c) => [c.id, c.name]),
  );
  const nomeConta = (cid: string | null | undefined) => (cid ? (nomesContas.get(cid) ?? null) : null);
  await db.$transaction(async (tx) => {
    await tx.establishment.update({ where: { id: loja.data.id }, data: { pix_bank_account_id: contaId } });
    await registrarNoHistorico(tx, ator, {
      action: "conta_bancaria.pix",
      establishment_id: loja.data.id,
      target_type: "estabelecimento",
      target_id: loja.data.id,
      summary: contaId
        ? `Definiu a conta do Pix da ${lojaAntes?.name ?? "loja"}: ${nomeConta(contaId)}`
        : `Tirou a conta do Pix da ${lojaAntes?.name ?? "loja"}`,
      changes: diferencas(
        { pix: nomeConta(lojaAntes?.pix_bank_account_id) },
        { pix: nomeConta(contaId) },
        { pix: "Conta do Pix" },
      ),
    });
  });
  return ok({ establishment_id: loja.data.id, pix_bank_account_id: contaId });
}

export type ContaPixDaLojaView = {
  id: string;
  name: string;
  bank: string | null;
  beneficiary: string | null;
  document: string | null;
  is_store_default: boolean;
};

/** As contas que a loja pode escolher no PIX (Q314): ativas e disponíveis, a padrão primeiro. Sem saldo. */
export async function listarContasPixDaLojaAction(
  db: TenantPrismaClient,
  ator: Ator,
  establishment_id: string,
): Promise<ActionResult<ContaPixDaLojaView[]>> {
  const neg = await exigirUma(db, ator, ["vendedor_da_loja", "dinheiro"], "ver as contas PIX da loja");
  if (neg) return neg;
  const loja = await acharLojaParaEscrita(db, ator, establishment_id);
  if (!loja.ok) return loja;
  const padrao = (await db.establishment.findFirst({ where: { id: loja.data.id }, select: { pix_bank_account_id: true } }))?.pix_bank_account_id ?? null;
  const contas = await db.bankAccount.findMany({
    where: {
      archived_at: null,
      OR: [{ pix_all_establishments: true }, { pix_establishments: { some: { establishment_id: loja.data.id } } }],
    },
    select: { id: true, name: true, bank: true, beneficiary: true, document: true },
    orderBy: { name: "asc" },
  });
  const lista = contas.map((c) => ({ ...c, is_store_default: c.id === padrao }));
  lista.sort((a, b) => Number(b.is_store_default) - Number(a.is_store_default) || a.name.localeCompare(b.name, "pt-BR"));
  return ok(lista);
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
  boleto_id: string | null;
  card_receivable_id: string | null;
  /** Entrega 2: o caixa e o turno (na gaveta), a gerência (o terceiro lugar) e a entrega. */
  cash_register_id: string | null;
  cash_session_id: string | null;
  manager_establishment_id: string | null;
  cash_handover_id: string | null;
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
  boleto_id: string | null;
  card_receivable_id: string | null;
  cash_register_id: string | null;
  cash_session_id: string | null;
  manager_establishment_id: string | null;
  cash_handover_id: string | null;
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
    boleto_id: m.boleto_id,
    card_receivable_id: m.card_receivable_id,
    cash_register_id: m.cash_register_id,
    cash_session_id: m.cash_session_id,
    manager_establishment_id: m.manager_establishment_id,
    cash_handover_id: m.cash_handover_id,
    notes: m.notes,
  };
}

export type ConferenciaView = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  cash_register_id: string | null;
  cash_session_id: string | null;
  kind: "abertura" | "livre" | "encerramento";
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
  /** Quando e quanto cai de fato (Q261): difere do previsto se a parcela foi antecipada. */
  effective_on: string;
  effective_net: number;
  fee_amount: number;
  anticipated: boolean;
  /** Taxas de cartão (Q254): nulos nas parcelas de antes da entrega. */
  acquirer_name: string | null;
  brand: string | null;
};

export type ChequeView = {
  id: string;
  sale_id: string;
  sale_payment_id: string;
  customer_id: string;
  customer_name: string;
  establishment_id: string;
  number: string;
  /** Q284: em nome de quem é o cheque. */
  holder_name: string;
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

/** Entrega 2: um caixa numerado (a gaveta física), com o saldo e o turno aberto nele. */
export type CaixaRegistradoView = {
  id: string;
  establishment_id: string;
  number: number;
  nome: string;
  saldo: number;
  turno_aberto: { id: string; aberto_por: { id: string; name: string }; aberto_em: string } | null;
};

/** Os caixas das lojas, por loja e número, com o saldo (soma dos movimentos) e o turno aberto. */
export async function viewsDosCaixas(db: TenantPrismaClient, lojaIds: string[]): Promise<CaixaRegistradoView[]> {
  if (lojaIds.length === 0) return [];
  const caixas = await db.cashRegister.findMany({
    where: { establishment_id: { in: lojaIds } },
    orderBy: [{ establishment_id: "asc" }, { number: "asc" }],
  });
  if (caixas.length === 0) return [];
  const ids = caixas.map((c) => c.id);
  const [linhas, abertos] = await Promise.all([
    db.cashMovement.groupBy({
      by: ["cash_register_id", "direction"],
      where: { cash_register_id: { in: ids } },
      _sum: { amount: true },
    }),
    db.cashSession.findMany({
      where: { open_register_id: { in: ids } },
      select: { id: true, cash_register_id: true, opened_by_user_id: true, opened_at: true },
    }),
  ]);
  const saldo = new Map<string, number>();
  for (const l of linhas) {
    const id = l.cash_register_id as string;
    const v = centavos(decToNum(l._sum.amount) ?? 0);
    saldo.set(id, (saldo.get(id) ?? 0) + (l.direction === "entrada" ? v : -v));
  }
  const nomes = new Map(
    (
      await db.user.findMany({
        where: { id: { in: [...new Set(abertos.map((a) => a.opened_by_user_id))] } },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, u.name]),
  );
  const turno = new Map(abertos.map((a) => [a.cash_register_id, a]));
  return caixas.map((c) => {
    const t = turno.get(c.id);
    return {
      id: c.id,
      establishment_id: c.establishment_id,
      number: c.number,
      nome: `Caixa ${c.number}`,
      saldo: (saldo.get(c.id) ?? 0) / 100,
      turno_aberto: t
        ? { id: t.id, aberto_por: { id: t.opened_by_user_id, name: nomes.get(t.opened_by_user_id) ?? "" }, aberto_em: t.opened_at.toISOString() }
        : null,
    };
  });
}

export type CaixaView = {
  drawers: {
    establishment_id: string;
    name: string;
    /** A soma dos caixas da loja. */
    balance: number;
    last_count: ConferenciaView | null;
    /** Entrega 2: os caixas numerados da loja. */
    registers: CaixaRegistradoView[];
    /** Entrega 2: o saldo "Com a gerência" da loja; nulo para quem não é gestor dela. */
    manager_balance: number | null;
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
  cash_register_id: string | null;
  cash_session_id: string | null;
  kind: "abertura" | "livre" | "encerramento";
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
    cash_register_id: c.cash_register_id,
    cash_session_id: c.cash_session_id,
    kind: c.kind,
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
  customer_id: string | null;
  establishment_id: string;
  number: string;
  holder_name: string;
  bank: string;
  good_for: Date;
  amount: unknown;
  status: string;
  bank_account_id: string | null;
  deposited_at: Date | null;
  cleared_at: Date | null;
  returned_at: Date | null;
  return_reason: string | null;
  customer: { name: string } | null;
};

function viewDoCheque(c: ChequeRow): ChequeView {
  return {
    id: c.id,
    sale_id: c.sale_id,
    sale_payment_id: c.sale_payment_id,
    customer_id: c.customer_id ?? "",
    customer_name: c.customer?.name ?? "",
    establishment_id: c.establishment_id,
    number: c.number,
    holder_name: c.holder_name,
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
  const papel = await papelDoEmporio(db, ator);
  const veContas = pode(papel, "gestor_da_loja") || pode(papel, "dinheiro");
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
  const caixas = await viewsDosCaixas(db, lojas.map((l) => l.id));
  const gerenciadas = lojas.filter((l) => pode(papel, "gestor_da_loja", l.id)).map((l) => l.id);
  const saldoGerencia = new Map<string, number>();
  for (const id of gerenciadas) saldoGerencia.set(id, await saldoDaGerencia(db, id));

  let contas: CaixaView["accounts"] = [];
  let parcelas: ParcelaCartaoView[] = [];
  if (veContas) {
    const todas = await viewsDasContas(db, { archived_at: null });
    const todasFuturas = await db.cardReceivable.findMany({
      where: { canceled_at: null, effective_on: { gt: hojeEmBrasilia() } },
      include: { bank_account: { select: { name: true } }, acquirer: { select: { name: true } } },
      orderBy: [{ effective_on: "asc" }, { installment: "asc" }],
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
        effective_on: dia(f.effective_on),
        effective_net: decToNum(f.effective_net) ?? 0,
        fee_amount: decToNum(f.fee_amount) ?? 0,
        anticipated: f.anticipation_id !== null,
        acquirer_name: f.acquirer?.name ?? null,
        brand: f.brand,
      }));
    const aReceber = new Map<string, number>();
    for (const f of todasFuturas) {
      aReceber.set(f.bank_account_id, (aReceber.get(f.bank_account_id) ?? 0) + centavos(decToNum(f.effective_net) ?? 0));
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
    include: { customer: { select: { name: true } } },
    orderBy: [{ good_for: "asc" }, { created_at: "asc" }],
  });

  const lojaIds = opts.establishment_id ? [opts.establishment_id] : lojas.map((l) => l.id);
  // A gerência de uma loja aparece para quem é gestor dela.
  const daGerencia = gerenciadas.filter((id) => lojaIds.includes(id));
  const gaveta = daGerencia.length > 0
    ? [{ establishment_id: { in: lojaIds } }, { manager_establishment_id: { in: daGerencia } }]
    : [{ establishment_id: { in: lojaIds } }];
  const onde = opts.bank_account_id
    ? { bank_account_id: opts.bank_account_id }
    : { OR: veContas && !opts.establishment_id ? [...gaveta, { bank_account_id: { not: null } }] : gaveta };
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
      registers: caixas.filter((c) => c.establishment_id === l.id),
      manager_balance: saldoGerencia.has(l.id) ? (saldoGerencia.get(l.id) as number) / 100 : null,
    })),
    accounts: contas,
    card_receivables: parcelas,
    checks: carteira.map(viewDoCheque),
    movements: movs.map(viewDoMovimento),
  });
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Saldo inicial (implantação), uma vez por lugar: um caixa (`cash_register_id`),
 * a gerência de uma loja (`manager_establishment_id`) ou uma conta. O
 * `establishment_id` sozinho, de antes dos caixas numerados, vale como o Caixa 1
 * da loja.
 */
export async function saldoInicialCaixaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: {
    establishment_id?: string | null;
    cash_register_id?: string | null;
    manager_establishment_id?: string | null;
    bank_account_id?: string | null;
    amount: number;
    occurred_at?: Date | null;
  },
): Promise<ActionResult<MovimentoDeCaixaView>> {
  const pedidoCaixa = texto(input?.cash_register_id);
  const pedidoLoja = texto(input?.establishment_id);
  const pedidoGerencia = texto(input?.manager_establishment_id);
  const pedidoConta = texto(input?.bank_account_id);
  const lugares = [pedidoCaixa ?? pedidoLoja, pedidoGerencia, pedidoConta].filter((x) => x !== null).length;
  if (lugares !== 1 || (pedidoCaixa && pedidoLoja)) {
    return fail("VALIDATION_ERROR", "Informe o caixa, a gerência OU a conta que recebe o saldo inicial.", 422, "cash_register_id");
  }
  if (!numero(input.amount) || centavos(input.amount) <= 0) {
    return fail("VALIDATION_ERROR", "O saldo inicial deve ser maior que zero.", 422, "amount");
  }
  const quando = input.occurred_at == null ? new Date() : input.occurred_at;
  if (!dataValida(quando)) return fail("VALIDATION_ERROR", "Informe uma data válida.", 422, "occurred_at");

  let lojaId: string | null = null;
  let caixaId: string | null = null;
  let gerenciaId: string | null = null;
  let contaId: string | null = null;
  let numeroDoCaixa = 1;
  if (pedidoCaixa || pedidoLoja) {
    // O saldo inicial do caixa é a implantação, do Gestor: quem opera o caixa
    // põe troco pela abertura (reforço da gerência), nunca dinheiro do nada.
    const neg = await exigir(db, ator, "gestor_da_loja", "informar o saldo inicial do caixa");
    if (neg) return neg;
    const caixa = pedidoCaixa
      ? await db.cashRegister.findFirst({ where: { id: pedidoCaixa }, select: { id: true, establishment_id: true, number: true } })
      : await db.cashRegister.findFirst({ where: { establishment_id: pedidoLoja as string, number: 1 }, select: { id: true, establishment_id: true, number: true } });
    if (pedidoCaixa && !caixa) return NAO_ACHADO("Caixa", "cash_register_id");
    const loja = await acharLojaParaEscrita(db, ator, caixa?.establishment_id ?? pedidoLoja);
    if (!loja.ok) return loja;
    if (!caixa) return NAO_ACHADO("Caixa", "cash_register_id");
    const negLoja = await exigir(db, ator, "gestor_da_loja", "informar o saldo inicial do caixa", loja.data.id);
    if (negLoja) return negLoja;
    lojaId = loja.data.id;
    caixaId = caixa.id;
    numeroDoCaixa = caixa.number;
  } else if (pedidoGerencia) {
    const loja = await acharLojaParaEscrita(db, ator, pedidoGerencia);
    if (!loja.ok) return fail(loja.code, loja.message, loja.status, "manager_establishment_id");
    const neg = await exigir(db, ator, "gestor_da_loja", "informar o saldo inicial da gerência", loja.data.id);
    if (neg) return neg;
    gerenciaId = loja.data.id;
  } else {
    const neg = await exigirUma(db, ator, ["conta", "dinheiro"], "informar o saldo inicial de uma conta bancária");
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
        where: {
          origin: "implantacao",
          ...(caixaId
            ? { cash_register_id: caixaId }
            : gerenciaId
              ? { manager_establishment_id: gerenciaId }
              : { bank_account_id: contaId }),
        },
        select: { id: true },
      });
      const campo = caixaId ? (pedidoCaixa ? "cash_register_id" : "establishment_id") : gerenciaId ? "manager_establishment_id" : "bank_account_id";
      if (ja) {
        throw new RecusaCaixa(
          fail("OPENING_ALREADY_DONE", "O saldo inicial já foi lançado. Para corrigir, lance a diferença como movimento.", 409, campo),
        );
      }
      // Depois do primeiro turno, o saldo do caixa é o que as contagens disseram: o troco novo entra pelo reforço.
      if (caixaId && (await tx.cashSession.findFirst({ where: { cash_register_id: caixaId }, select: { id: true } }))) {
        throw new RecusaCaixa(
          fail(
            "OPENING_ALREADY_DONE",
            "Este caixa já teve turno: o troco entra pelo reforço da gerência na abertura.",
            409,
            campo,
          ),
        );
      }
      const mov = await tx.cashMovement.create({
        data: scoped({
          establishment_id: lojaId,
          cash_register_id: caixaId,
          manager_establishment_id: gerenciaId,
          bank_account_id: contaId,
          direction: "entrada" as const,
          amount: arred2(input.amount),
          origin: "implantacao" as const,
          occurred_at: quando,
          notes: "Saldo inicial",
          created_by_user_id: ator.id,
        }),
      });
      const nomeDaLoja = async (id: string) => (await tx.establishment.findFirst({ where: { id }, select: { name: true } }))?.name ?? "loja";
      const valor = dinheiro(arred2(input.amount));
      await registrarNoHistorico(tx, ator, {
        action: "caixa.saldo_inicial",
        establishment_id: lojaId ?? gerenciaId,
        target_type: "caixa",
        target_id: mov.id,
        summary: lojaId
          ? `Informou ${valor} de saldo inicial no Caixa ${numeroDoCaixa} da ${await nomeDaLoja(lojaId)}`
          : gerenciaId
            ? `Informou ${valor} de saldo inicial com a gerência da ${await nomeDaLoja(gerenciaId)}`
            : `Informou ${valor} de saldo inicial na conta ${(await tx.bankAccount.findFirst({ where: { id: contaId as string }, select: { name: true } }))?.name ?? ""}`.trim(),
      });
      return mov;
    });
    return ok(viewDoMovimento(m));
  } catch (err) {
    if (err instanceof RecusaCaixa) return err.recusa;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Taxas de cartão, formato antigo (F3b, Q89)
//
// @deprecated Usada pelos cenários e suítes antigos; tela e rota usam
// emporio-cartoes.ts. Aqui a regra antiga é a linha `qualquer` da faixa padrão
// (2 a 12 parcelas no parcelado, 1 nas demais) da adquirente "Maquininha".
// ---------------------------------------------------------------------------

const FORMAS_DE_CARTAO = ["debito", "credito_vista", "credito_parcelado"] as const;
type FormaDeCartao = (typeof FORMAS_DE_CARTAO)[number];

const faixaPadrao = (kind: FormaDeCartao) => ({
  installments_from: kind === "credito_parcelado" ? 2 : 1,
  installments_to: kind === "credito_parcelado" ? 12 : 1,
});

const ADQUIRENTE_PADRAO = "Maquininha";

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

function viewDaRegra(t: TaxaView, nomeDaLoja: string): RegraCartaoView {
  return {
    id: t.id,
    establishment_id: t.establishment_id,
    establishment_name: nomeDaLoja,
    kind: t.kind,
    fee_pct: t.fee_pct,
    days: t.days,
    bank_account_id: t.bank_account_id,
    bank_account_name: t.bank_account_name,
  };
}

const ehDaRegraAntiga = (t: TaxaView) => {
  const f = faixaPadrao(t.kind);
  return (
    t.acquirer_name.toLowerCase() === ADQUIRENTE_PADRAO.toLowerCase() &&
    t.brand === "qualquer" &&
    t.installments_from === f.installments_from &&
    t.installments_to === f.installments_to
  );
};

/** @deprecated Usada pelos cenários e suítes antigos; tela e rota usam emporio-cartoes.ts. */
export async function listarRegrasCartaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string } = {},
): Promise<ActionResult<RegraCartaoView[]>> {
  const res = await listarTaxasAction(db, ator, {
    establishment_id: opts?.establishment_id,
    vigentes_em: hojeEmBrasilia(),
  });
  if (!res.ok) return res;
  const linhas = res.data.filter(ehDaRegraAntiga);
  const lojas = await db.establishment.findMany({
    where: { id: { in: [...new Set(linhas.map((l) => l.establishment_id))] } },
    select: { id: true, name: true },
  });
  const nomes = new Map(lojas.map((l) => [l.id, l.name]));
  return ok(linhas.map((l) => viewDaRegra(l, nomes.get(l.establishment_id) ?? "")));
}

export type DefinirRegraCartaoInput = {
  establishment_id: string;
  kind: string;
  fee_pct: number;
  days: number;
  bank_account_id: string;
};

/**
 * @deprecated Usada pelos cenários e suítes antigos; tela e rota usam emporio-cartoes.ts.
 * Muda a regra no lugar; se alguma venda já copiou a linha, encerra ontem e cria a nova desde hoje (decisão 10).
 */
export async function definirRegraCartaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: DefinirRegraCartaoInput,
): Promise<ActionResult<RegraCartaoView>> {
  const neg = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "definir a regra de cartão");
  if (neg) return neg;
  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;
  if (!(FORMAS_DE_CARTAO as readonly unknown[]).includes(input.kind)) {
    return fail("VALIDATION_ERROR", "Escolha a forma: débito, crédito à vista ou crédito parcelado.", 422, "kind");
  }
  const kind = input.kind as FormaDeCartao;
  const faixa = faixaPadrao(kind);
  const conta = await db.bankAccount.findFirst({
    where: { id: typeof input.bank_account_id === "string" ? input.bank_account_id : "" },
    select: { archived_at: true },
  });
  if (!conta || conta.archived_at) {
    return fail("VALIDATION_ERROR", "Escolha uma conta bancária ativa para receber o cartão.", 422, "bank_account_id");
  }

  const adq = await garantirAdquirenteMaquininha(db, ator);
  const hoje = hojeEmBrasilia();
  const existentes = await listarTaxasAction(db, ator, {
    establishment_id: loja.data.id,
    acquirer_id: adq.id,
    vigentes_em: hoje,
  });
  if (!existentes.ok) return existentes;
  const atual = existentes.data.find((t) => t.kind === kind && ehDaRegraAntiga(t));

  let res: ActionResult<TaxaView>;
  if (!atual) {
    res = await criarTaxaAction(db, ator, {
      establishment_id: loja.data.id,
      acquirer_id: adq.id,
      brand: "qualquer",
      kind,
      ...faixa,
      fee_pct: input.fee_pct,
      days: input.days,
      bank_account_id: input.bank_account_id,
      valid_from: new Date(`${VIGENCIA_DESDE_SEMPRE}T00:00:00.000Z`),
    });
  } else if (!atual.in_use) {
    res = await editarTaxaAction(db, ator, atual.id, {
      fee_pct: input.fee_pct,
      days: input.days,
      bank_account_id: input.bank_account_id,
    });
  } else {
    res = await novaVigenciaAction(db, ator, atual.id, {
      valid_from: hoje,
      fee_pct: input.fee_pct,
      days: input.days,
      bank_account_id: input.bank_account_id,
    });
  }
  if (!res.ok) return res;
  await registrarNoHistorico(db, ator, {
    action: "cartao.regra",
    establishment_id: loja.data.id,
    target_type: "taxa_cartao",
    target_id: res.data.id,
    summary: `Definiu a regra de cartão (formato antigo) de ${kind} na ${loja.data.name}: taxa de ${res.data.fee_pct.toLocaleString("pt-BR")}% em ${res.data.days} dias`,
  });
  return ok(viewDaRegra(res.data, loja.data.name));
}

/** @deprecated Usada pelos cenários e suítes antigos; tela e rota usam emporio-cartoes.ts. Linha em uso é encerrada, não apagada. */
export async function removerRegraCartaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  let res = await removerTaxaAction(db, ator, id);
  if (!res.ok && res.code === "RATE_IN_USE") res = await removerTaxaAction(db, ator, id, { encerrar: true });
  if (!res.ok) return res;
  await registrarNoHistorico(db, ator, {
    action: "cartao.regra_remover",
    target_type: "taxa_cartao",
    target_id: res.data.id,
    summary: res.data.encerrada ? "Encerrou a regra de cartão (formato antigo)" : "Removeu a regra de cartão (formato antigo)",
  });
  return ok({ id: res.data.id });
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
  opts: { establishment_id?: string; customer_id?: string; status?: string } = {},
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
      ...(opts.customer_id ? { customer_id: opts.customer_id } : {}),
      ...(opts.status ? { status: opts.status as (typeof STATUS_DE_CHEQUE)[number] } : {}),
    },
    include: { customer: { select: { name: true } } },
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
  const c = await db.emporioCheck.findFirst({ where: { id }, include: { customer: { select: { name: true } } } });
  return c ? ok(viewDoCheque(c)) : NAO_ACHADO("Cheque");
}

/** Depositar: `recebido` para `depositado`, escolhendo a conta. */
export async function depositarChequeAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { bank_account_id: string },
): Promise<ActionResult<ChequeView>> {
  // O depósito não mexe na gaveta nem pede turno (só troca o status e escolhe a conta),
  // então o Financeiro, que cuida das contas, também deposita.
  const neg = await exigirUma(db, ator, ["chave:depositar_cheque", "dinheiro"], "depositar cheque");
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
  try {
    await db.$transaction(async (tx) => {
      const r = await tx.emporioCheck.updateMany({
        where: { id, status: "recebido" },
        data: { status: "depositado", bank_account_id: conta.id, deposited_at: new Date(), updated_by_user_id: ator.id },
      });
      if (r.count === 0) throw new RecusaCaixa(FORA_DE_ORDEM("depositado"));
      await registrarNoHistorico(tx, ator, {
        action: "cheque.depositar",
        establishment_id: cheque.establishment_id,
        target_type: "cheque",
        target_id: id,
        summary: `Depositou o cheque ${cheque.number} de ${dinheiro(decToNum(cheque.amount) ?? 0)}`,
      });
    });
  } catch (err) {
    if (err instanceof RecusaCaixa) return FORA_DE_ORDEM((await acharCheque(db, ator, id))?.status ?? "recebido");
    throw err;
  }
  return chequePorId(db, id);
}

/** Compensou: `depositado` para `compensado`, e o dinheiro entra na conta do depósito. */
export async function compensarChequeAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<ChequeView>> {
  const neg = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "marcar o cheque como compensado");
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
      await registrarNoHistorico(tx, ator, {
        action: "cheque.compensar",
        establishment_id: cheque.establishment_id,
        target_type: "cheque",
        target_id: id,
        summary: `Compensou o cheque ${cheque.number} de ${dinheiro(decToNum(cheque.amount) ?? 0)}`,
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
  const neg = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "marcar o cheque como devolvido");
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
      await registrarNoHistorico(tx, ator, {
        action: "cheque.devolvido",
        establishment_id: cheque.establishment_id,
        target_type: "cheque",
        target_id: id,
        summary: `Marcou o cheque ${cheque.number} de ${dinheiro(decToNum(cheque.amount) ?? 0)} como devolvido: ${motivo}`,
      });
      if (!cheque.financial_payment_id) return;

      // Como `cancelarPagamentoAction`: o pagamento sai e, se o lançamento
      // deixou de estar coberto, volta a pendente (e a dívida aparece no fiado).
      const pagamento = await tx.financialPayment.findFirst({
        where: { id: cheque.financial_payment_id },
        select: { id: true, entry_id: true, amount: true },
      });
      if (!pagamento) return;
      await tx.financialPayment.delete({ where: { id: pagamento.id } });
      const lancamento = await tx.financialEntry.findFirst({ where: { id: pagamento.entry_id } });
      // A origem já foi absorvida por um acordo: ela não revive (o aberto dela seria recalculado
      // errado). O valor do cheque volta como parcela extra do acordo, vencendo hoje.
      if (lancamento && lancamento.status === "cancelled" && lancamento.agreement_id) {
        const valor = decToNum(pagamento.amount) ?? 0;
        const venda = lancamento.related_id
          ? await tx.emporioSale.findFirst({ where: { id: lancamento.related_id }, select: { sold_at: true } })
          : null;
        await createLinkedEntry(tx, {
          entry_type: "income",
          category: CATEGORIA_ACORDO,
          amount: valor,
          related_module: "emporio",
          related_id: lancamento.agreement_id,
          occurred_at: new Date(),
          status: "pending",
          due_date: hojeEmBrasilia(),
          agreement_id: lancamento.agreement_id,
          emporio_customer_id: lancamento.emporio_customer_id,
          establishment_id: lancamento.establishment_id,
          notes: `Cheque devolvido da venda de ${venda ? dataBr(venda.sold_at.toISOString()) : "data desconhecida"}, ${SUFIXO_PARCELA_EXTRA}`,
        });
        await registrarNoHistorico(tx, ator, {
          action: "cheque.devolvido",
          establishment_id: cheque.establishment_id,
          target_type: "cheque",
          target_id: id,
          summary: `O valor do cheque ${cheque.number} (${dinheiro(valor)}) virou parcela extra do acordo de fiado do cliente`,
        });
        return;
      }
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
// Boletos (Q278 a Q282): gerados fora do Tibé, só registrados na venda
// ---------------------------------------------------------------------------

export type BoletoView = {
  id: string;
  sale_id: string;
  sale_number: number;
  customer_id: string;
  customer_name: string;
  establishment_id: string;
  establishment_name: string;
  number: string | null;
  /** Data de calendário (AAAA-MM-DD). */
  due_on: string;
  amount: number;
  status: string;
  /** Q280: `aberto` com o vencimento antes de hoje em Brasília (calculado, não gravado). */
  overdue: boolean;
  bank_account_id: string | null;
  bank_account_name: string | null;
  /** Data de calendário (AAAA-MM-DD) do pagamento no banco. */
  paid_on: string | null;
  sent_to_fiado_at: string | null;
  reason: string | null;
};

const STATUS_DE_BOLETO = ["aberto", "vencido", "pago", "no_fiado"] as const;

const NOME_DO_STATUS_DO_BOLETO: Record<string, string> = {
  aberto: "em aberto",
  pago: "pago",
  no_fiado: "no fiado",
  cancelado: "cancelado",
};

const BOLETO_FORA_DE_ORDEM = (status: string) =>
  fail("BOLETO_STATUS", `Esse boleto está ${NOME_DO_STATUS_DO_BOLETO[status] ?? status} e não pode seguir para essa etapa.`, 409);

const INCLUDE_BOLETO = {
  customer: { select: { name: true } },
  establishment: { select: { name: true } },
  sale: { select: { number: true } },
  bank_account: { select: { name: true } },
} as const;

type BoletoRow = {
  id: string;
  sale_id: string;
  customer_id: string;
  establishment_id: string;
  number: string | null;
  due_on: Date;
  amount: unknown;
  status: string;
  bank_account_id: string | null;
  paid_on: Date | null;
  sent_to_fiado_at: Date | null;
  fiado_reason: string | null;
  customer: { name: string };
  establishment: { name: string };
  sale: { number: number };
  bank_account: { name: string } | null;
};

function viewDoBoleto(b: BoletoRow, hoje: Date): BoletoView {
  return {
    id: b.id,
    sale_id: b.sale_id,
    sale_number: b.sale.number,
    customer_id: b.customer_id,
    customer_name: b.customer.name,
    establishment_id: b.establishment_id,
    establishment_name: b.establishment.name,
    number: b.number,
    due_on: dia(b.due_on),
    amount: decToNum(b.amount as never) ?? 0,
    status: b.status,
    overdue: b.status === "aberto" && b.due_on.getTime() < hoje.getTime(),
    bank_account_id: b.bank_account_id,
    bank_account_name: b.bank_account?.name ?? null,
    paid_on: b.paid_on ? dia(b.paid_on) : null,
    sent_to_fiado_at: isoOrNull(b.sent_to_fiado_at),
    reason: b.fiado_reason,
  };
}

/** Os boletos das lojas do ator, do vencimento mais antigo ao mais novo. Os cancelados (venda cancelada) não aparecem. */
export async function listarBoletosAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; customer_id?: string; status?: string } = {},
): Promise<ActionResult<BoletoView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  if (opts.status && !(STATUS_DE_BOLETO as readonly string[]).includes(opts.status)) {
    return fail("VALIDATION_ERROR", "Escolha uma situação de boleto válida: aberto, vencido, pago ou no fiado.", 422, "status");
  }
  const hoje = hojeEmBrasilia();
  // "aberto" é todo boleto em aberto (os vencidos inclusive); "vencido" é só o que já passou do vencimento.
  const doStatus =
    opts.status === "vencido"
      ? { status: "aberto" as const, due_on: { lt: hoje } }
      : opts.status
        ? { status: opts.status as "aberto" | "pago" | "no_fiado" }
        : { status: { not: "cancelado" as const } };
  const boletos = await db.emporioBoleto.findMany({
    where: {
      ...(opts.establishment_id ? { establishment_id: opts.establishment_id } : filtroDeLojas(visiveis)),
      ...(opts.customer_id ? { customer_id: opts.customer_id } : {}),
      ...doStatus,
    },
    include: INCLUDE_BOLETO,
    orderBy: [{ due_on: "asc" }, { created_at: "asc" }],
  });
  return ok(boletos.map((b) => viewDoBoleto(b, hoje)));
}

async function acharBoleto(db: TenantPrismaClient, ator: Ator, id: string) {
  const b = await db.emporioBoleto.findFirst({ where: { id } });
  if (!b || !(await lojaVisivel(db, ator, b.establishment_id))) return null;
  return b;
}

async function boletoPorId(db: TenantPrismaClient, id: string): Promise<ActionResult<BoletoView>> {
  const b = await db.emporioBoleto.findFirst({ where: { id }, include: INCLUDE_BOLETO });
  return b ? ok(viewDoBoleto(b, hojeEmBrasilia())) : NAO_ACHADO("Boleto");
}

/** Boleto pago: `aberto` para `pago`, e o dinheiro entra na conta escolhida na data do pagamento. */
export async function pagarBoletoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { bank_account_id: string; paid_on?: Date | null },
): Promise<ActionResult<BoletoView>> {
  const neg = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "marcar o boleto como pago");
  if (neg) return neg;
  const boleto = await acharBoleto(db, ator, id);
  if (!boleto) return NAO_ACHADO("Boleto");
  if (boleto.status !== "aberto") return BOLETO_FORA_DE_ORDEM(boleto.status);
  const conta =
    typeof input?.bank_account_id === "string" && input.bank_account_id
      ? await db.bankAccount.findFirst({ where: { id: input.bank_account_id }, select: { id: true, archived_at: true } })
      : null;
  if (!conta || conta.archived_at) {
    return fail("VALIDATION_ERROR", "Escolha a conta bancária onde o boleto foi pago.", 422, "bank_account_id");
  }
  const hoje = hojeEmBrasilia();
  let pagoEm = hoje;
  if (input.paid_on != null) {
    if (!dataValida(input.paid_on)) return fail("VALIDATION_ERROR", "Informe uma data de pagamento válida.", 422, "paid_on");
    // Dia de calendário: o horário que vier junto não conta.
    pagoEm = new Date(input.paid_on.toISOString().slice(0, 10));
    if (pagoEm.getTime() > hoje.getTime()) {
      return fail("VALIDATION_ERROR", "A data do pagamento não pode ser futura.", 422, "paid_on");
    }
  }
  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      const agora = new Date();
      const r = await tx.emporioBoleto.updateMany({
        where: { id, status: "aberto" },
        data: { status: "pago", bank_account_id: conta.id, paid_on: pagoEm, paid_at: agora, updated_by_user_id: ator.id },
      });
      if (r.count === 0) throw new RecusaCaixa(BOLETO_FORA_DE_ORDEM("pago"));
      await tx.cashMovement.create({
        data: scoped({
          establishment_id: null,
          bank_account_id: conta.id,
          direction: "entrada" as const,
          amount: decToNum(boleto.amount) ?? 0,
          origin: "boleto_pago" as const,
          // `pagoEm` é a meia-noite UTC do dia, que em Brasília ainda é a véspera: hoje vale o instante
          // da baixa; dia passado, o meio-dia de Brasília (15h UTC), para o extrato mostrar o dia certo.
          occurred_at: pagoEm.getTime() === hoje.getTime() ? agora : new Date(pagoEm.getTime() + 15 * 3_600_000),
          sale_id: boleto.sale_id,
          boleto_id: boleto.id,
          created_by_user_id: ator.id,
        }),
      });
      await registrarNoHistorico(tx, ator, {
        action: "boleto.pagar",
        establishment_id: boleto.establishment_id,
        target_type: "boleto",
        target_id: id,
        summary: `Marcou o boleto${boleto.number ? ` ${boleto.number}` : ""} de ${dinheiro(decToNum(boleto.amount) ?? 0)} como pago`,
      });
    });
  } catch (err) {
    if (err instanceof RecusaCaixa) return err.recusa;
    throw err;
  }
  return boletoPorId(db, id);
}

/** Mandar para o fiado: `aberto` para `no_fiado`; o pagamento sai do lançamento e a dívida reabre (como o cheque devolvido). */
export async function boletoParaFiadoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { reason: string },
): Promise<ActionResult<BoletoView>> {
  const neg = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "mandar o boleto para o fiado");
  if (neg) return neg;
  const boleto = await acharBoleto(db, ator, id);
  if (!boleto) return NAO_ACHADO("Boleto");
  if (boleto.status !== "aberto") return BOLETO_FORA_DE_ORDEM(boleto.status);
  const motivo = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!motivo) return fail("VALIDATION_ERROR", "Diga por que o boleto vai para o fiado.", 422, "reason");
  const rotulo = `boleto${boleto.number ? ` ${boleto.number}` : ""}`;

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      const agora = new Date();
      const r = await tx.emporioBoleto.updateMany({
        where: { id, status: "aberto" },
        data: {
          status: "no_fiado",
          sent_to_fiado_at: agora,
          fiado_reason: motivo,
          financial_payment_id: null,
          updated_by_user_id: ator.id,
        },
      });
      if (r.count === 0) throw new RecusaCaixa(BOLETO_FORA_DE_ORDEM("no_fiado"));
      await registrarNoHistorico(tx, ator, {
        action: "boleto.fiado",
        establishment_id: boleto.establishment_id,
        target_type: "boleto",
        target_id: id,
        summary: `Mandou o ${rotulo} de ${dinheiro(decToNum(boleto.amount) ?? 0)} para o fiado: ${motivo}`,
      });
      if (!boleto.financial_payment_id) return;

      // Como `cancelarPagamentoAction`: o pagamento sai e, se o lançamento
      // deixou de estar coberto, volta a pendente (e a dívida aparece no fiado).
      const pagamento = await tx.financialPayment.findFirst({
        where: { id: boleto.financial_payment_id },
        select: { id: true, entry_id: true, amount: true },
      });
      if (!pagamento) return;
      await tx.financialPayment.delete({ where: { id: pagamento.id } });
      const lancamento = await tx.financialEntry.findFirst({ where: { id: pagamento.entry_id } });
      // A origem já foi absorvida por um acordo: ela não revive. O valor do boleto
      // volta como parcela extra do acordo, vencendo hoje.
      if (lancamento && lancamento.status === "cancelled" && lancamento.agreement_id) {
        const valor = decToNum(pagamento.amount) ?? 0;
        const venda = lancamento.related_id
          ? await tx.emporioSale.findFirst({ where: { id: lancamento.related_id }, select: { sold_at: true } })
          : null;
        await createLinkedEntry(tx, {
          entry_type: "income",
          category: CATEGORIA_ACORDO,
          amount: valor,
          related_module: "emporio",
          related_id: lancamento.agreement_id,
          occurred_at: new Date(),
          status: "pending",
          due_date: hojeEmBrasilia(),
          agreement_id: lancamento.agreement_id,
          emporio_customer_id: lancamento.emporio_customer_id,
          establishment_id: lancamento.establishment_id,
          notes: `Boleto mandado ao fiado da venda de ${venda ? dataBr(venda.sold_at.toISOString()) : "data desconhecida"}, ${SUFIXO_PARCELA_EXTRA}`,
        });
        await registrarNoHistorico(tx, ator, {
          action: "boleto.fiado",
          establishment_id: boleto.establishment_id,
          target_type: "boleto",
          target_id: id,
          summary: `O valor do ${rotulo} (${dinheiro(valor)}) virou parcela extra do acordo de fiado do cliente`,
        });
        return;
      }
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
  return boletoPorId(db, id);
}

// ---------------------------------------------------------------------------
// Transferência entre caixas (F3b, Q92)
// ---------------------------------------------------------------------------

/**
 * Uma ponta da transferência: uma conta (`bank_account_id`) OU a gerência de
 * uma loja (`manager_establishment_id`, entrega 2). `establishment_id` (a
 * gaveta) é recusado: a gaveta vai ao gerente pela sangria ou pelo malote.
 */
export type PontaDeCaixa = {
  establishment_id?: string | null;
  bank_account_id?: string | null;
  manager_establishment_id?: string | null;
};

type PontaView = { establishment_id: string | null; bank_account_id: string | null; manager_establishment_id: string | null };

export type TransferenciaView = {
  id: string;
  operation_key: string;
  /** `establishment_id` só aparece nas transferências da gaveta de antes da entrega 2. */
  from: PontaView;
  to: PontaView;
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
  from_manager_establishment_id: string | null;
  to_establishment_id: string | null;
  to_bank_account_id: string | null;
  to_manager_establishment_id: string | null;
  amount: unknown;
  notes: string | null;
  created_at: Date;
};

function viewDaTransferencia(t: TransferenciaRow, replayed: boolean): TransferenciaView {
  return {
    id: t.id,
    operation_key: t.operation_key,
    from: { establishment_id: t.from_establishment_id, bank_account_id: t.from_bank_account_id, manager_establishment_id: t.from_manager_establishment_id },
    to: { establishment_id: t.to_establishment_id, bank_account_id: t.to_bank_account_id, manager_establishment_id: t.to_manager_establishment_id },
    amount: decToNum(t.amount as never) ?? 0,
    notes: t.notes,
    created_at: t.created_at.toISOString(),
    replayed,
  };
}

const GAVETA_NAO_TRANSFERE = (campo: "from" | "to") =>
  fail("DRAWER_TRANSFER", "A gaveta vai ao gerente pela sangria ou pelo malote.", 422, campo);

function resolverPonta(
  ponta: PontaDeCaixa | undefined,
  campo: "from" | "to",
): ActionResult<{ gerenciaId: string | null; contaId: string | null }> {
  if (texto(ponta?.establishment_id)) return GAVETA_NAO_TRANSFERE(campo);
  const gerenciaId = texto(ponta?.manager_establishment_id);
  const contaId = texto(ponta?.bank_account_id);
  if ((gerenciaId === null) === (contaId === null)) {
    return fail(
      "VALIDATION_ERROR",
      campo === "from"
        ? "Diga de onde sai o dinheiro: uma conta OU a gerência de uma loja."
        : "Diga para onde vai o dinheiro: uma conta OU a gerência de uma loja.",
      422,
      campo,
    );
  }
  return ok({ gerenciaId, contaId });
}

async function transferenciaGravada(
  db: TenantPrismaClient,
  ator: Ator,
  chave: string,
): Promise<ActionResult<TransferenciaView> | null> {
  const t = await db.cashTransfer.findFirst({ where: { operation_key: chave } });
  if (!t) return null;
  const lojaDeOrigem = t.from_establishment_id ?? t.from_manager_establishment_id;
  if (lojaDeOrigem) {
    if (!(await lojaVisivel(db, ator, lojaDeOrigem))) return NAO_ACHADO("Transferência");
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
  if (origem.data.gerenciaId === destino.data.gerenciaId && origem.data.contaId === destino.data.contaId) {
    return fail("VALIDATION_ERROR", "A origem e o destino precisam ser diferentes.", 422, "to");
  }
  if (!numero(input.amount) || centavos(input.amount) <= 0) {
    return fail("VALIDATION_ERROR", "O valor da transferência deve ser maior que zero.", 422, "amount");
  }
  const valorCent = centavos(input.amount);

  // Q92 revista: sai da gerência quem é gestor daquela loja; sai de conta quem cuida das contas.
  if (origem.data.gerenciaId) {
    const loja = await acharLojaParaEscrita(db, ator, origem.data.gerenciaId);
    if (!loja.ok) return fail(loja.code, loja.message, loja.status, "from");
    const negGestor = await exigir(db, ator, "gestor_da_loja", "levar o dinheiro da gerência", loja.data.id);
    if (negGestor) return negGestor;
  } else {
    const negConta = await exigir(db, ator, "conta", "transferir saindo de uma conta bancária");
    if (negConta) return negConta;
    const conta = await db.bankAccount.findFirst({ where: { id: origem.data.contaId as string }, select: { archived_at: true } });
    if (!conta) return NAO_ACHADO("Conta de origem", "from");
  }
  if (destino.data.gerenciaId) {
    // O destino também precisa estar ao alcance do ator: gestor não manda dinheiro à gerência de loja que não enxerga.
    const negDestino = await exigir(db, ator, "vendedor_da_loja", "levar dinheiro para a gerência dessa loja", destino.data.gerenciaId);
    if (negDestino) return negDestino;
    const loja = await db.establishment.findFirst({ where: { id: destino.data.gerenciaId }, select: { archived_at: true } });
    if (!loja || loja.archived_at) return fail("VALIDATION_ERROR", "Escolha uma loja ativa para receber.", 422, "to");
  } else {
    const conta = await db.bankAccount.findFirst({ where: { id: destino.data.contaId as string }, select: { archived_at: true } });
    if (!conta || conta.archived_at) return fail("VALIDATION_ERROR", "Escolha uma conta ativa para receber.", 422, "to");
  }
  const notas = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null;

  try {
    const t = await runSerializableTenantTransaction(db, async (tx) => {
      const leitor = tx as unknown as TenantPrismaClient;
      const saldo = origem.data.gerenciaId
        ? await saldoDaGerencia(leitor, origem.data.gerenciaId)
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
          from_manager_establishment_id: origem.data.gerenciaId,
          from_bank_account_id: origem.data.contaId,
          to_manager_establishment_id: destino.data.gerenciaId,
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
          manager_establishment_id: origem.data.gerenciaId,
          bank_account_id: origem.data.contaId,
          direction: "saida" as const,
        }),
      });
      await tx.cashMovement.create({
        data: scoped({
          ...comum,
          manager_establishment_id: destino.data.gerenciaId,
          bank_account_id: destino.data.contaId,
          direction: "entrada" as const,
        }),
      });
      const nomeDe = async (gerenciaId: string | null, contaId: string | null) =>
        gerenciaId
          ? `gerência da ${(await tx.establishment.findFirst({ where: { id: gerenciaId }, select: { name: true } }))?.name ?? "loja"}`
          : `conta ${(await tx.bankAccount.findFirst({ where: { id: contaId as string }, select: { name: true } }))?.name ?? ""}`.trim();
      await registrarNoHistorico(tx, ator, {
        action: "caixa.transferir",
        establishment_id: origem.data.gerenciaId ?? destino.data.gerenciaId,
        target_type: "caixa",
        target_id: transf.id,
        summary: `Transferiu ${dinheiro(valorCent / 100)} da ${await nomeDe(origem.data.gerenciaId, origem.data.contaId)} para a ${await nomeDe(destino.data.gerenciaId, destino.data.contaId)}`,
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

/** "sem diferença" ou "sobra de R$ 5,00" / "falta de R$ 5,00", para a frase do Histórico. */
export function fraseDaDiferenca(diffCent: number): string {
  return diffCent === 0 ? "sem diferença" : `${diffCent > 0 ? "sobra" : "falta"} de ${dinheiro(Math.abs(diffCent) / 100)}`;
}

/**
 * A regra da diferença (Q93), única para a conferência livre, a abertura e o
 * encerramento do turno: grava a contagem e, com diferença, exige a
 * justificativa (recusa lançada como `RecusaCaixa`, que desfaz a transação),
 * ajusta o caixa (movimento `conferencia`) e lança "Diferença de caixa" (receita
 * se sobra, despesa se falta). Rode dentro da transação da escrita.
 */
export async function contarCaixa(
  tx: TenantTransactionClient,
  ator: Ator,
  c: {
    establishment_id: string;
    cash_register_id: string;
    cash_session_id: string;
    kind: "abertura" | "livre" | "encerramento";
    esperadoCent: number;
    contadoCent: number;
    justificativa: string | null;
    agora: Date;
  },
): Promise<{ id: string; diffCent: number }> {
  const diffCent = c.contadoCent - c.esperadoCent;
  if (diffCent !== 0 && !c.justificativa) {
    throw new RecusaCaixa(
      fail(
        "VALIDATION_ERROR",
        `A gaveta tem ${diffCent > 0 ? "sobra" : "falta"} de ${brl(Math.abs(diffCent) / 100)}: diga o motivo.`,
        422,
        "justification",
      ),
    );
  }
  const contagem = await tx.cashCount.create({
    data: scoped({
      establishment_id: c.establishment_id,
      cash_register_id: c.cash_register_id,
      cash_session_id: c.cash_session_id,
      kind: c.kind,
      expected: c.esperadoCent / 100,
      counted: c.contadoCent / 100,
      difference: diffCent / 100,
      justification: c.justificativa,
      counted_at: c.agora,
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
      related_id: contagem.id,
      occurred_at: c.agora,
      status: "paid",
      establishment_id: c.establishment_id,
      payment_method: "dinheiro",
    });
    const fp = await tx.financialPayment.findFirst({ where: { entry_id: lancamento.id }, select: { id: true } });
    await tx.cashMovement.create({
      data: scoped({
        establishment_id: c.establishment_id,
        cash_register_id: c.cash_register_id,
        cash_session_id: c.cash_session_id,
        bank_account_id: null,
        direction: sobra ? ("entrada" as const) : ("saida" as const),
        amount: Math.abs(diffCent) / 100,
        origin: "conferencia" as const,
        occurred_at: c.agora,
        cash_count_id: contagem.id,
        financial_payment_id: fp?.id ?? null,
        notes: c.justificativa,
        created_by_user_id: ator.id,
      }),
    });
  }
  return { id: contagem.id, diffCent };
}

/**
 * Conferência livre (Q35, Q93), agora dentro do turno: conta o caixa sem
 * encerrar. `cash_register_id` diz o caixa (a rota o exige); sem ele, vale a
 * regra de `resolverTurno` na loja de `establishment_id`.
 */
export async function conferirGavetaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { cash_register_id?: string | null; establishment_id?: string | null; counted: number; justification?: string | null },
): Promise<ActionResult<ConferenciaView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "conferir a gaveta");
  if (neg) return neg;
  const pedido = texto(input?.cash_register_id);
  let lojaId = texto(input?.establishment_id);
  if (pedido) {
    const caixa = await db.cashRegister.findFirst({ where: { id: pedido }, select: { establishment_id: true } });
    if (!caixa) return NAO_ACHADO("Caixa", "cash_register_id");
    lojaId = caixa.establishment_id;
  } else if (!lojaId) {
    return fail("VALIDATION_ERROR", "Escolha o caixa.", 422, "cash_register_id");
  }
  const loja = await acharLojaParaEscrita(db, ator, lojaId);
  if (!loja.ok) return loja;
  const negLoja = await exigir(db, ator, "vendedor_da_loja", "conferir a gaveta", loja.data.id);
  if (negLoja) return negLoja;
  if (!numero(input.counted) || centavos(input.counted) < 0) {
    return fail("VALIDATION_ERROR", "Informe quanto há na gaveta (zero ou mais).", 422, "counted");
  }
  const contadoCent = centavos(input.counted);
  const justificativa = typeof input.justification === "string" && input.justification.trim() ? input.justification.trim() : null;

  try {
    const id = await runSerializableTenantTransaction(db, async (tx) => {
      const turno = await resolverTurno(tx, ator, loja.data.id, pedido ?? undefined, "exige");
      if (!turno.ok) throw new RecusaCaixa(turno);
      if (!turno.turno) throw new Error("resolverTurno no modo exige devolveu turno nulo");
      const { id: sessaoId, cash_register_id: caixaId } = turno.turno;
      const esperadoCent = await saldoDoCaixa(tx as unknown as TenantPrismaClient, caixaId);
      const caixa = await tx.cashRegister.findFirst({ where: { id: caixaId }, select: { number: true } });
      const conferencia = await contarCaixa(tx, ator, {
        establishment_id: loja.data.id,
        cash_register_id: caixaId,
        cash_session_id: sessaoId,
        kind: "livre",
        esperadoCent,
        contadoCent,
        justificativa,
        agora: new Date(),
      });
      await registrarNoHistorico(tx, ator, {
        action: "caixa.conferir",
        establishment_id: loja.data.id,
        target_type: "gaveta",
        target_id: conferencia.id,
        summary: `Conferiu o Caixa ${caixa?.number ?? ""} da ${loja.data.name}: ${dinheiro(contadoCent / 100)}, ${fraseDaDiferenca(conferencia.diffCent)}`,
      });
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
