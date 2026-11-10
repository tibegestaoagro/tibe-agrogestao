import type { Prisma } from "@/generated/prisma/client";
import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { dinheiro } from "@/lib/emporio/historico";
import { notify } from "@/lib/notify";
import { sendEmail } from "@/lib/email-send";
import { buildPaymentRequestEmailHtml } from "@/lib/email-templates";

/**
 * Entrega 3 do financeiro (Q227): a visão do pedido de aprovação de pagamento e o aviso aos aprovadores.
 * Mora aqui, e não nas actions, para `emporio-despesas` (que cria o pedido) e `emporio-aprovacoes` (que o decide)
 * não se importarem em círculo.
 */

export type PedidoDePagamentoView = {
  id: string;
  status: "pendente" | "aprovado" | "recusado";
  total: number;
  created_at: string;
  requested_by: { id: string; name: string };
  from: { kind: "gaveta" | "conta"; id: string; name: string };
  entries: { entry_id: string; description: string; supplier_or_category: string | null; due_date: string | null; amount: number }[];
  reason: string | null;
  last_failure: string | null;
  decided_by: { name: string } | null;
  decided_at: string | null;
};

type PedidoRow = Prisma.EmporioPaymentRequestGetPayload<{ include: { requested_by: { select: { id: true; name: true } } } }>;

export const INCLUDE_PEDIDO = { requested_by: { select: { id: true, name: true } } } as const;

const diaIso = (d: Date) => d.toISOString().slice(0, 10);

export const EM_APROVACAO = "Esta conta está esperando aprovação de pagamento.";

/** Alguma das contas já está num pedido pendente? Pagar, cancelar (inclusive pela compra ou pela venda), adiar e corrigir recusam. */
export async function contaEmAprovacao(tx: object, ids: string[]): Promise<boolean> {
  const leitor = tx as Prisma.TransactionClient;
  if (ids.length === 0) return false;
  const p = await leitor.emporioPaymentRequest.findFirst({
    where: { status: "pendente", entry_ids: { hasSome: ids } },
    select: { id: true },
  });
  return !!p;
}

/** Monta as visões de uma lista de pedidos com poucas leituras (contas, lugares e decisores de uma vez). */
export async function viewsDosPedidos(db: TenantPrismaClient, linhas: PedidoRow[]): Promise<PedidoDePagamentoView[]> {
  if (linhas.length === 0) return [];
  const entryIds = [...new Set(linhas.flatMap((l) => l.entry_ids))];
  const lojaIds = [...new Set(linhas.map((l) => l.establishment_id).filter((x): x is string => !!x))];
  const contaIds = [...new Set(linhas.map((l) => l.bank_account_id).filter((x): x is string => !!x))];
  const decisorIds = [...new Set(linhas.map((l) => l.decided_by_user_id).filter((x): x is string => !!x))];

  const entradas = await db.financialEntry.findMany({
    where: { id: { in: entryIds } },
    select: {
      id: true,
      category: true,
      amount: true,
      due_date: true,
      emporio_supplier: { select: { name: true } },
      sale_variable_expense: { select: { rule: { select: { name: true } } } },
      fixed_occurrence: { select: { template: { select: { name: true } } } },
    },
  });
  const porId = new Map(entradas.map((e) => [e.id, e]));
  const lojas = new Map(
    (await db.establishment.findMany({ where: { id: { in: lojaIds } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]),
  );
  const contas = new Map(
    (await db.bankAccount.findMany({ where: { id: { in: contaIds } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]),
  );
  const decisores = new Map(
    (await db.user.findMany({ where: { id: { in: decisorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );

  return linhas.map((l) => {
    const daGaveta = !!l.establishment_id;
    const lugarId = (daGaveta ? l.establishment_id : l.bank_account_id) ?? "";
    return {
      id: l.id,
      status: l.status as PedidoDePagamentoView["status"],
      total: decToNum(l.total) ?? 0,
      created_at: l.created_at.toISOString(),
      requested_by: { id: l.requested_by.id, name: l.requested_by.name },
      from: {
        kind: daGaveta ? "gaveta" : "conta",
        id: lugarId,
        name: (daGaveta ? lojas.get(lugarId) : contas.get(lugarId)) ?? (daGaveta ? "Loja" : "Conta"),
      },
      entries: l.entry_ids.flatMap((id) => {
        const e = porId.get(id);
        if (!e) return [];
        const fornecedor = e.emporio_supplier?.name ?? null;
        const nome =
          e.sale_variable_expense?.rule.name ?? e.fixed_occurrence?.template.name ?? fornecedor ?? "Compra sem fornecedor";
        return [
          {
            entry_id: e.id,
            description: nome,
            supplier_or_category: fornecedor ?? e.category ?? null,
            due_date: e.due_date ? diaIso(e.due_date) : null,
            amount: decToNum(e.amount) ?? 0,
          },
        ];
      }),
      reason: l.reason,
      last_failure: l.last_failure,
      decided_by: l.decided_by_user_id ? { name: decisores.get(l.decided_by_user_id) ?? "Usuário" } : null,
      decided_at: isoOrNull(l.decided_at),
    };
  });
}

export async function viewDoPedidoDePagamento(db: TenantPrismaClient, id: string): Promise<PedidoDePagamentoView | null> {
  const l = await db.emporioPaymentRequest.findFirst({ where: { id }, include: INCLUDE_PEDIDO });
  if (!l) return null;
  return (await viewsDosPedidos(db, [l]))[0] ?? null;
}

/**
 * Avisa por email e por WhatsApp (este só para quem tem telefone) o Dono e o Gerente geral ativos de que há
 * pagamento esperando aprovação. É um aviso, não parte do pagamento: nunca lança (o pedido segue na tela).
 */
export async function avisarAprovadores(db: TenantPrismaClient, pedido: PedidoDePagamentoView): Promise<void> {
  try {
    const aprovadores = await db.user.findMany({
      where: { active: true, OR: [{ role: "OWNER" }, { emporio_role: "gerente_geral" }] },
      select: { id: true, tenant_id: true, phone: true, email: true },
    });
    const primeira = pedido.entries[0];
    const aQuem = primeira ? (primeira.supplier_or_category ?? primeira.description) : "uma conta";
    const maisContas = pedido.entries.length > 1 ? ` e mais ${pedido.entries.length - 1} conta(s)` : "";
    const vencimentos = pedido.entries.map((e) => e.due_date).filter((d): d is string => !!d).sort();
    const venc = vencimentos[0] ? `${vencimentos[0].slice(8, 10)}/${vencimentos[0].slice(5, 7)}` : "sem data";
    const total = dinheiro(pedido.total);
    const base = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    const resumo = `${pedido.requested_by.name} pediu aprovação para pagar ${total} a ${aQuem}${maisContas}, vencimento ${venc}.`;
    for (const u of aprovadores) {
      // Um try por canal e por destinatário: a falha de um envio não cala os seguintes.
      try {
        await sendEmail({
          to: u.email,
          subject: `Pedido de pagamento de ${total} para aprovar`,
          html: buildPaymentRequestEmailHtml({ resumo, url: `${base}/emporio/financeiro/aprovacoes` }),
          tenant_id: u.tenant_id,
          type: "emporio_pedido_pagamento",
          related_id: pedido.id,
        });
      } catch (err) {
        console.warn("[emporio] não foi possível enviar o email do pedido de pagamento", err);
      }
      if (!u.phone) continue;
      try {
        await notify(
          { tenant_id: u.tenant_id, user_id: u.id, phone: u.phone, email: u.email },
          {
            pushTitle: "Pagamento esperando aprovação",
            pushBody: `${pedido.requested_by.name} pediu para pagar ${total} a ${aQuem}`,
            pushUrl: "/emporio/financeiro/aprovacoes",
            whatsappText: `${pedido.requested_by.name} pediu aprovação para pagar ${total} a ${aQuem}${maisContas}, vencimento ${venc}. Aprove em ${base}/emporio/financeiro/aprovacoes`,
          },
          "conversa",
        );
      } catch (err) {
        console.warn("[emporio] não foi possível avisar um aprovador do pedido de pagamento", err);
      }
    }
  } catch (err) {
    console.warn("[emporio] não foi possível avisar os aprovadores do pedido de pagamento", err);
  }
}
