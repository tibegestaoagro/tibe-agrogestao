import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import type { PaymentMethod } from "@/generated/prisma/client";

/**
 * Pagamento e recebimento PARCIAL (Módulo 35, fase 1; §13 e §14 do documento
 * do cliente).
 *
 * O valor pago de um lançamento é a SOMA dos `FinancialPayment` dele, nunca um
 * campo. É o invariante 2 do projeto aplicado ao dinheiro, o mesmo desenho do
 * livro-razão do rebanho e do estoque.
 *
 * O `status` do lançamento continua GRAVADO, e isso não contradiz o invariante:
 * ele é a máquina de estados da conta (pendente, paga, cancelada), não o saldo.
 * `cancelled` não é derivável de soma nenhuma, e os índices
 * `[tenant_id, status, paid_at]` que a tela usa dependem dele.
 *
 * **"Parcialmente paga" nunca é gravada**: nasce da comparação em `situacaoDe`.
 */

export type SituacaoDePagamento =
  | "em_aberto"
  | "parcialmente_paga"
  | "paga"
  | "cancelada";

export type ResumoDePagamento = {
  valor: number;
  pago: number;
  saldo: number;
  situacao: SituacaoDePagamento;
};

/** Duas casas: o dinheiro é `Decimal(14,2)` e a soma em float erra no centavo. */
function centavos(valor: number): number {
  return Math.round(valor * 100);
}

export function situacaoDe(
  valor: number,
  pago: number,
  status: string,
): SituacaoDePagamento {
  if (status === "cancelled") return "cancelada";
  if (centavos(pago) <= 0) return "em_aberto";
  if (centavos(pago) < centavos(valor)) return "parcialmente_paga";
  return "paga";
}

/** Quanto já foi pago de um lançamento. A soma, sempre. */
export async function somaPagaDe(
  db: TenantPrismaClient,
  entryId: string,
): Promise<number> {
  const agregado = await db.financialPayment.aggregate({
    where: { entry_id: entryId },
    _sum: { amount: true },
  });
  return decToNum(agregado._sum.amount) ?? 0;
}

export async function resumoDePagamento(
  db: TenantPrismaClient,
  entry: { id: string; amount: unknown; status: string },
): Promise<ResumoDePagamento> {
  const valor = decToNum(entry.amount) ?? 0;
  const pago = await somaPagaDe(db, entry.id);
  return {
    valor,
    pago,
    saldo: Math.max(0, (centavos(valor) - centavos(pago)) / 100),
    situacao: situacaoDe(valor, pago, entry.status),
  };
}

/**
 * Registra um pagamento (ou recebimento) contra um lançamento.
 *
 * Fecha o lançamento quando a soma alcança o valor: aí, e só aí, `status` vira
 * `paid` e `paid_at` recebe a data DESTE pagamento, que é o momento em que a
 * conta se quitou de fato.
 */
export async function registrarPagamentoAction(
  db: TenantPrismaClient,
  entryId: string,
  input: {
    amount: number;
    paid_at?: Date | null;
    method?: PaymentMethod | null;
    notes?: string | null;
    created_by_user_id?: string | null;
  },
): Promise<ActionResult<{ id: string } & ResumoDePagamento>> {
  const entry = await db.financialEntry.findFirst({ where: { id: entryId } });
  if (!entry) return fail("NOT_FOUND", "Lançamento não encontrado", 404);

  if (entry.status === "cancelled") {
    return fail(
      "ENTRY_CANCELLED",
      "Este lançamento está cancelado e não aceita pagamento",
      422,
    );
  }

  if (!(input.amount > 0)) {
    return fail("VALOR_INVALIDO", "O valor do pagamento precisa ser maior que zero", 422, "amount");
  }

  const valor = decToNum(entry.amount) ?? 0;
  const jaPago = await somaPagaDe(db, entryId);
  const saldo = (centavos(valor) - centavos(jaPago)) / 100;

  // ⚠️ Recusa COM `field`, senão a mensagem cai no rodapé do painel em vez de
  // embaixo do campo do valor, que é onde o produtor está olhando.
  if (centavos(input.amount) > centavos(saldo)) {
    return fail(
      "PAGAMENTO_EXCEDE_SALDO",
      saldo > 0
        ? `Falta pagar apenas ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} desta conta.`
        : "Esta conta já está quitada.",
      422,
      "amount",
    );
  }

  const paid_at = input.paid_at ?? new Date();

  const pagamento = await db.financialPayment.create({
    data: scoped({
      entry_id: entryId,
      amount: input.amount,
      paid_at,
      method: input.method ?? null,
      notes: input.notes ?? null,
      created_by_user_id: input.created_by_user_id ?? null,
    }),
  });

  const pago = jaPago + input.amount;
  const fechou = centavos(pago) >= centavos(valor);
  if (fechou) {
    await db.financialEntry.update({
      where: { id: entryId },
      data: { status: "paid", paid_at },
    });
  }

  return ok({
    id: pagamento.id,
    valor,
    pago,
    saldo: Math.max(0, (centavos(valor) - centavos(pago)) / 100),
    situacao: situacaoDe(valor, pago, fechou ? "paid" : entry.status),
  });
}

/**
 * Desfaz um pagamento, e o lançamento volta a dever o que voltou a faltar.
 *
 * ⚠️ **Apaga a linha, e isso é deliberado.** O projeto não apaga movimentação
 * financeira: `FinancialEntry` cancelado vira `status: cancelled`, e o
 * livro-razão do rebanho usa `canceled_at`. Aqui é diferente por um motivo: o
 * lançamento representa um COMPROMISSO que existiu no mundo, e apagá-lo
 * fecharia um mês errado; o pagamento desfeito é quase sempre digitação errada
 * ("4000 em vez de 400"), e deixá-lo na lista de pagamentos da conta, riscado,
 * confunde mais do que informa.
 *
 * O histórico que o §47 pede é o do LANÇAMENTO, e ele continua intacto: nada
 * aqui apaga a conta, só a quitação registrada por engano. Se um dia for
 * preciso rastrear quem desfez o quê, o caminho é `canceled_at` mais filtro em
 * toda soma, e isso é decisão do usuário, não escolha silenciosa.
 */
export async function cancelarPagamentoAction(
  db: TenantPrismaClient,
  paymentId: string,
): Promise<ActionResult<{ entry_id: string } & ResumoDePagamento>> {
  const pagamento = await db.financialPayment.findFirst({ where: { id: paymentId } });
  if (!pagamento) return fail("NOT_FOUND", "Pagamento não encontrado", 404);

  const entry = await db.financialEntry.findFirst({ where: { id: pagamento.entry_id } });
  if (!entry) return fail("NOT_FOUND", "Lançamento não encontrado", 404);

  await db.financialPayment.delete({ where: { id: paymentId } });

  const pago = await somaPagaDe(db, entry.id);
  const valor = decToNum(entry.amount) ?? 0;
  const aindaFechado = centavos(pago) >= centavos(valor);

  // O lançamento volta a ser pendente quando deixa de estar coberto. `paid_at`
  // some junto: a conta não foi quitada em data nenhuma.
  if (entry.status === "paid" && !aindaFechado) {
    await db.financialEntry.update({
      where: { id: entry.id },
      data: { status: "pending", paid_at: null },
    });
  }

  return ok({
    entry_id: entry.id,
    valor,
    pago,
    saldo: Math.max(0, (centavos(valor) - centavos(pago)) / 100),
    situacao: situacaoDe(valor, pago, aindaFechado ? "paid" : "pending"),
  });
}

/** Os pagamentos de um lançamento, do mais recente para o mais antigo. */
export async function listarPagamentosAction(db: TenantPrismaClient, entryId: string) {
  return db.financialPayment.findMany({
    where: { entry_id: entryId },
    orderBy: { paid_at: "desc" },
  });
}
