import type { TenantPrismaClient } from "@/lib/prisma";
import { findClientsByName } from "@/lib/actions/service-orders";
import { resumoDePagamento } from "@/lib/actions/financial-payments";

/**
 * Fase 5 do agente do WhatsApp, Task 2 (`task-2-brief.md`).
 *
 * Contas a receber em aberto de um contato: achadas pelo vínculo
 * ESTRUTURADO, nunca por texto livre. `FinancialEntry` não tem FK de
 * cliente (decisão do usuário de 16/09), então a busca é sempre pelos dois
 * vínculos que existem: `related_module: "servico"` + `related_id` da
 * `ServiceOrder` (cliente casado por `ServiceClient`), e `negotiation_id`
 * da `Negotiation` (contato casado por `Contact`).
 */

export type ContaEmAberto = {
  id: string;
  amount: number;
  saldo: number;
  due_date: Date | null;
  origem: "servico" | "negocio";
  descricao: string;
};

async function contasDeServico(
  db: TenantPrismaClient,
  clienteIds: string[],
): Promise<ContaEmAberto[]> {
  const ordens = await db.serviceOrder.findMany({
    where: { service_client_id: { in: clienteIds } },
    select: {
      id: true,
      description: true,
      performed_at: true,
      service: { select: { name: true } },
    },
  });
  if (ordens.length === 0) return [];

  const ordensPorId = new Map(ordens.map((o) => [o.id, o]));
  const lancamentos = await db.financialEntry.findMany({
    where: {
      related_module: "servico",
      related_id: { in: ordens.map((o) => o.id) },
      entry_type: "income",
      status: "pending",
    },
  });

  const contas: ContaEmAberto[] = [];
  for (const entry of lancamentos) {
    const ordem = entry.related_id ? ordensPorId.get(entry.related_id) : undefined;
    const { valor, saldo } = await resumoDePagamento(db, entry);
    const data = ordem?.performed_at ?? entry.due_date;
    contas.push({
      id: entry.id,
      amount: valor,
      saldo,
      due_date: entry.due_date,
      origem: "servico",
      descricao: ordem
        ? `Ordem de ${data ? data.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "?"}, ${ordem.description ?? ordem.service.name}`
        : (entry.category ?? "Ordem de serviço"),
    });
  }
  return contas;
}

async function contasDeNegocio(
  db: TenantPrismaClient,
  contatoIds: string[],
): Promise<ContaEmAberto[]> {
  const negociacoes = await db.negotiation.findMany({
    where: { contact_id: { in: contatoIds } },
    select: { id: true },
  });
  if (negociacoes.length === 0) return [];

  const lancamentos = await db.financialEntry.findMany({
    where: {
      negotiation_id: { in: negociacoes.map((n) => n.id) },
      entry_type: "income",
      status: "pending",
    },
  });

  const contas: ContaEmAberto[] = [];
  for (const entry of lancamentos) {
    const { valor, saldo } = await resumoDePagamento(db, entry);
    contas.push({
      id: entry.id,
      amount: valor,
      saldo,
      due_date: entry.due_date,
      origem: "negocio",
      descricao: entry.category ?? "Negócio",
    });
  }
  return contas;
}

/**
 * Contas a receber EM ABERTO de um contato, pelo vínculo estruturado.
 * Nunca casa por texto livre: ver a decisão de 16/09 no cabeçalho acima.
 *
 * `null` quando nenhum cliente nem contato casa com o nome. Lista vazia
 * quando o contato existe e não tem conta em aberto: são respostas
 * diferentes, e o handler fala diferente nos dois casos.
 */
export async function contasEmAbertoDoContato(
  db: TenantPrismaClient,
  nome: string,
): Promise<{ contato: string; contas: ContaEmAberto[] } | null> {
  const clientes = await findClientsByName(db, nome);
  const contatos = await db.contact.findMany({
    where: { archived_at: null, name: { contains: nome, mode: "insensitive" } },
    orderBy: { name: "asc" },
  });

  if (clientes.length === 0 && contatos.length === 0) return null;

  const contato = (clientes[0] ?? contatos[0])!.name;

  const [contasServico, contasNegocio] = await Promise.all([
    contasDeServico(db, clientes.map((c) => c.id)),
    contasDeNegocio(db, contatos.map((c) => c.id)),
  ]);

  const contas = [...contasServico, ...contasNegocio].sort((a, b) => {
    if (a.due_date === null) return b.due_date === null ? 0 : 1;
    if (b.due_date === null) return -1;
    return a.due_date.getTime() - b.due_date.getTime();
  });

  return { contato, contas };
}
