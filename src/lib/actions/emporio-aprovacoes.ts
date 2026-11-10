import type { Prisma } from "@/generated/prisma/client";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import type { TenantPrismaClient } from "@/lib/prisma";
import { runSerializableTenantTransaction } from "@/lib/financial";
import { decToNum } from "@/lib/serialize";
import { exigir } from "@/lib/emporio/papel";
import { dinheiro, registrarNoHistorico } from "@/lib/emporio/historico";
import type { Ator } from "@/lib/actions/emporio-catalogo";
import { executarPagamentoDeContas, RecusaDespesa } from "@/lib/actions/emporio-despesas";
import {
  INCLUDE_PEDIDO,
  viewDoPedidoDePagamento,
  viewsDosPedidos,
  type PedidoDePagamentoView,
} from "@/lib/emporio/pedido-pagamento";

export { avisarAprovadores } from "@/lib/emporio/pedido-pagamento";
export type { PedidoDePagamentoView } from "@/lib/emporio/pedido-pagamento";

/**
 * Meu Empório, entrega 3 do financeiro (Q227): a alçada de pagamento. Quem não é da conta (Dono e Gerente geral)
 * e paga acima do teto cria um pedido (em `pagarDespesasAction`); aqui o pedido é lido, aprovado (e aí o
 * pagamento acontece, com o saldo conferido na hora) ou recusado com motivo.
 */

const STATUS = ["pendente", "aprovado", "recusado"] as const;
type StatusDoPedido = (typeof STATUS)[number];

const NAO_ACHADO = () => fail("NOT_FOUND", "Pedido de pagamento não encontrado.", 404, "request_id");
const NAO_PENDENTE = () => fail("PEDIDO_NAO_PENDENTE", "Este pedido já foi decidido.", 409, "request_id");

export async function listarPedidosDePagamentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { status?: StatusDoPedido | "decididos"; before?: string; before_id?: string } = {},
): Promise<ActionResult<PedidoDePagamentoView[]>> {
  const neg = await exigir(db, ator, "dinheiro", "ver os pedidos de pagamento");
  if (neg) return neg;
  const status = opts?.status;
  if (status !== undefined && status !== "decididos" && !STATUS.includes(status)) {
    return fail("VALIDATION_ERROR", "Escolha um estado válido: pendente, aprovado, recusado ou decididos.", 422, "status");
  }
  if (status === "decididos") {
    // Cursor: `before` é o decided_at do último item da página anterior (ISO) e `before_id` o id dele, que desempata
    // pedidos decididos no mesmo instante. Sem `before_id` vale o corte antigo (só `decided_at` menor).
    const antes = opts?.before ? new Date(opts.before) : null;
    if (antes && Number.isNaN(antes.getTime())) {
      return fail("VALIDATION_ERROR", "Cursor inválido: use uma data ISO8601.", 422, "before");
    }
    const antesId = typeof opts?.before_id === "string" && opts.before_id ? opts.before_id : null;
    if (antesId && !antes) {
      return fail("VALIDATION_ERROR", "Informe também o cursor before (data ISO8601).", 422, "before");
    }
    const corte: Prisma.EmporioPaymentRequestWhereInput = !antes
      ? {}
      : antesId
        ? { OR: [{ decided_at: { lt: antes } }, { decided_at: antes, id: { lt: antesId } }] }
        : { decided_at: { lt: antes } };
    const decididos = await db.emporioPaymentRequest.findMany({
      where: { status: { in: ["aprovado", "recusado"] }, ...corte },
      include: INCLUDE_PEDIDO,
      orderBy: [{ decided_at: "desc" }, { id: "desc" }],
      take: 200,
    });
    return ok(await viewsDosPedidos(db, decididos));
  }
  const linhas = await db.emporioPaymentRequest.findMany({
    where: status ? { status } : {},
    include: INCLUDE_PEDIDO,
    orderBy: { created_at: status === "pendente" ? "asc" : "desc" },
    take: 200,
  });
  return ok(await viewsDosPedidos(db, linhas));
}

export async function aprovarPedidoDePagamentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<PedidoDePagamentoView>> {
  const neg = await exigir(db, ator, "conta", "aprovar pagamentos");
  if (neg) return neg;
  const existe = typeof id === "string" && id ? await db.emporioPaymentRequest.findFirst({ where: { id }, select: { id: true } }) : null;
  if (!existe) return NAO_ACHADO();

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      // Relê dentro da transação: duas aprovações ao mesmo tempo pagariam duas vezes.
      const p = await tx.emporioPaymentRequest.findFirst({ where: { id } });
      if (!p) throw new RecusaDespesa(NAO_ACHADO());
      if (p.status !== "pendente") throw new RecusaDespesa(NAO_PENDENTE());
      // A tela mostra `total`: o que o aprovador viu é o que se paga. Se o aberto atual das contas difere do total do
      // pedido (conta que sumiu, foi paga ou mudou de valor por outro caminho), NÃO paga: o pedido segue pendente,
      // com a falha gravada, e quem pediu refaz ou o aprovador recusa.
      const contas = await tx.financialEntry.findMany({
        where: { id: { in: p.entry_ids } },
        select: { id: true, status: true, amount: true, payments: { select: { amount: true } } },
      });
      const abertoAgoraCent = contas.reduce((soma, c) => {
        if (c.status !== "pending") return soma;
        const pago = c.payments.reduce((s, x) => s + Math.round((decToNum(x.amount) ?? 0) * 100), 0);
        return soma + Math.round((decToNum(c.amount) ?? 0) * 100) - pago;
      }, 0);
      const totalPedidoCent = Math.round((decToNum(p.total) ?? 0) * 100);
      if (contas.length !== p.entry_ids.length || abertoAgoraCent !== totalPedidoCent) {
        const msg = `O valor das contas mudou desde o pedido: ${dinheiro(abertoAgoraCent / 100)} agora, ${dinheiro(totalPedidoCent / 100)} no pedido. Recuse este pedido e quem pediu refaz.`;
        throw new RecusaDespesa(fail("PEDIDO_DESATUALIZADO", msg, 409, "request_id"));
      }
      // `paid_at` fica de fora de propósito: a data do pagamento é a da aprovação.
      await executarPagamentoDeContas(
        tx,
        ator,
        {
          entry_ids: p.entry_ids,
          from: { establishment_id: p.establishment_id, bank_account_id: p.bank_account_id },
          cash_register_id: p.cash_register_id,
        },
        { pagoPor: ator },
      );
      await tx.emporioPaymentRequest.update({
        where: { id },
        data: { status: "aprovado", decided_by_user_id: ator.id, decided_at: new Date(), last_failure: null },
      });
      await registrarNoHistorico(tx, ator, {
        action: "pagamento.aprovar",
        establishment_id: p.establishment_id,
        target_type: "pedido_pagamento",
        target_id: p.id,
        summary: `Aprovou o pagamento de ${p.entry_ids.length} conta(s), ${dinheiro(Number(p.total))}`,
      });
    });
  } catch (err) {
    if (!(err instanceof RecusaDespesa)) throw err;
    const r = err.recusa;
    // A transação desfez tudo: o pedido segue pendente, e a falha fica gravada para quem abrir a lista.
    if (!r.ok && r.code !== "PEDIDO_NAO_PENDENTE" && r.code !== "NOT_FOUND") {
      await db.emporioPaymentRequest.updateMany({ where: { id, status: "pendente" }, data: { last_failure: r.message } });
    }
    return r;
  }
  const view = await viewDoPedidoDePagamento(db, id);
  return view ? ok(view) : NAO_ACHADO();
}

export async function recusarPedidoDePagamentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { reason: string },
): Promise<ActionResult<PedidoDePagamentoView>> {
  const neg = await exigir(db, ator, "conta", "recusar pagamentos");
  if (neg) return neg;
  const motivo = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (motivo.length < 3 || motivo.length > 300) {
    return fail("VALIDATION_ERROR", "Diga o motivo da recusa, de 3 a 300 caracteres.", 422, "reason");
  }
  const existe = typeof id === "string" && id ? await db.emporioPaymentRequest.findFirst({ where: { id }, select: { id: true } }) : null;
  if (!existe) return NAO_ACHADO();

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      const p = await tx.emporioPaymentRequest.findFirst({ where: { id } });
      if (!p) throw new RecusaDespesa(NAO_ACHADO());
      if (p.status !== "pendente") throw new RecusaDespesa(NAO_PENDENTE());
      await tx.emporioPaymentRequest.update({
        where: { id },
        data: { status: "recusado", reason: motivo, decided_by_user_id: ator.id, decided_at: new Date() },
      });
      await registrarNoHistorico(tx, ator, {
        action: "pagamento.recusar",
        establishment_id: p.establishment_id,
        target_type: "pedido_pagamento",
        target_id: p.id,
        summary: `Recusou o pagamento de ${p.entry_ids.length} conta(s), ${dinheiro(Number(p.total))}: ${motivo}`,
      });
    });
  } catch (err) {
    if (err instanceof RecusaDespesa) return err.recusa;
    throw err;
  }
  const view = await viewDoPedidoDePagamento(db, id);
  return view ? ok(view) : NAO_ACHADO();
}
