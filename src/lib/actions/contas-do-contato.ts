import type { TenantPrismaClient } from "@/lib/prisma";
import { findClientsByName } from "@/lib/actions/service-orders";
import { resumoDePagamento } from "@/lib/actions/financial-payments";
import { normalizarTermo } from "@/lib/actions/whatsapp-handlers/shared";

/**
 * Fase 5 do agente do WhatsApp, Task 2 (`task-2-brief.md`), com a correção de
 * G2, G5 e G6 (rodada de correção do juiz, 2026-09-16).
 *
 * Contas a receber em aberto de um contato: achadas pelo vínculo
 * ESTRUTURADO, nunca por texto livre. A busca é sempre pelos dois vínculos
 * que existem: `related_module: "servico"` + `related_id` da `ServiceOrder`
 * (cliente casado por `ServiceClient`), e `negotiation_id` da `Negotiation`
 * (contato casado por `Contact`). `FinancialEntry.contact_id` existe desde o
 * Módulo 35 para o `Contact` (não para o `ServiceClient`), mas esta busca não
 * o usa nesta rodada: trocar o caminho é escopo novo, fica como dívida.
 */

export type ContaEmAberto = {
  id: string;
  amount: number;
  saldo: number;
  due_date: Date | null;
  origem: "servico" | "negocio";
  descricao: string;
};

/**
 * Uma pessoa que casou o nome dito: cliente de serviço (`ServiceClient`) ou
 * contato de negócio (`Contact`).
 */
export type PessoaCandidata = {
  tipo: "cliente" | "contato";
  id: string;
  name: string;
};

export type ContasDoContatoResultado =
  | { estado: "nao_encontrado" }
  /**
   * G2: mais de uma pessoa casou o mesmo nome. NUNCA se escolhe a primeira
   * (a alfabética) em silêncio: era exatamente o defeito reproduzido pelo
   * juiz. "Joao Pereira tem uma conta de R$ 1.000" perguntava confirmação
   * com o nome do Pereira (o primeiro em ordem alfabética) enquanto a única
   * conta em aberto pertencia ao Joao Silva, porque a busca antiga somava as
   * contas de TODOS os homônimos numa lista só. O chamador é quem pergunta
   * qual, com os candidatos aqui.
   */
  | { estado: "ambiguo"; candidatos: PessoaCandidata[] }
  /**
   * `pessoa` (Fase 5, unificação de 16/09): quem chamou sabe se quem casou é
   * cliente de serviço ou contato de negócio, sem casar o nome de novo. É o
   * que permite `consultarRecebimento` somar o trabalho feito e ainda não
   * faturado (só existe para `ServiceClient`) às contas já lançadas.
   */
  | { estado: "ok"; contato: string; contas: ContaEmAberto[]; pessoa: PessoaCandidata };

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

function ordenarPorVencimento(a: ContaEmAberto, b: ContaEmAberto): number {
  if (a.due_date === null) return b.due_date === null ? 0 : 1;
  if (b.due_date === null) return -1;
  return a.due_date.getTime() - b.due_date.getTime();
}

/**
 * As pessoas (cliente de serviço OU contato de negócio) que casam o nome
 * dito.
 *
 * G5: o `Contact` é achado por comparação SEM ACENTO, feita em memória, não
 * por `contains` do Prisma. `contains` + `mode: "insensitive"` é `ILIKE` no
 * Postgres, e `ILIKE` não dobra acento: contra um contato "Zé Carlos", a
 * mensagem "recebi do Ze Carlos" (o próprio exemplo da intenção usa a grafia
 * sem acento) devolvia "não achei ninguém". Mesmo filtro de
 * `resolverTrabalhador` (`mao-de-obra.ts`), que já resolve isso para a mão de
 * obra.
 *
 * A1 (correção da mesma rodada): `findClientsByName` (`service-orders.ts`)
 * tinha ficado de fora e continuava só no `contains`/`ILIKE`, então um
 * `ServiceClient` acentuado só casava com a grafia acentuada, enquanto o
 * `Contact` já casava dos dois jeitos. Além de "recebi do Ze Carlos" falhar
 * contra um `ServiceClient`, dois homônimos (um `ServiceClient`, um
 * `Contact`) com o mesmo nome escrito COM acento entravam como ambíguo (os
 * dois casavam) e SEM acento silenciosamente viravam um só (só o `Contact`
 * casava): a mesma pessoa, escolhida ou não por causa da ortografia da
 * mensagem. `findClientsByName` agora normaliza acento internamente, e as
 * duas fontes casam pela MESMA regra.
 */
async function pessoasQueCasam(db: TenantPrismaClient, nome: string): Promise<PessoaCandidata[]> {
  const clientes = await findClientsByName(db, nome);
  const alvo = normalizarTermo(nome);
  const todosOsContatos = await db.contact.findMany({ where: { archived_at: null } });
  const contatos = todosOsContatos.filter((c) => normalizarTermo(c.name).includes(alvo));

  return [
    ...clientes.map((c): PessoaCandidata => ({ tipo: "cliente", id: c.id, name: c.name })),
    ...contatos.map((c): PessoaCandidata => ({ tipo: "contato", id: c.id, name: c.name })),
  ];
}

/** As contas em aberto de UMA pessoa já resolvida: não casa o nome de novo. */
export async function contasDaPessoa(
  db: TenantPrismaClient,
  pessoa: PessoaCandidata,
): Promise<ContaEmAberto[]> {
  const contas =
    pessoa.tipo === "cliente"
      ? await contasDeServico(db, [pessoa.id])
      : await contasDeNegocio(db, [pessoa.id]);
  return contas.sort(ordenarPorVencimento);
}

/**
 * Contas a receber EM ABERTO de um contato, pelo vínculo estruturado.
 * Nunca casa por texto livre: ver a decisão de 16/09 no cabeçalho acima.
 *
 * `nao_encontrado` quando nenhum cliente nem contato casa com o nome.
 * `ambiguo` quando mais de uma pessoa casa (G2): o chamador pergunta qual,
 * nunca escolhe a primeira em silêncio. `ok` com lista vazia quando a única
 * pessoa achada existe e não tem conta em aberto: são respostas diferentes, e
 * o handler fala diferente em cada caso.
 */
export async function contasEmAbertoDoContato(
  db: TenantPrismaClient,
  nome: string,
): Promise<ContasDoContatoResultado> {
  const pessoas = await pessoasQueCasam(db, nome);
  if (pessoas.length === 0) return { estado: "nao_encontrado" };
  if (pessoas.length > 1) return { estado: "ambiguo", candidatos: pessoas };
  const pessoa = pessoas[0];
  return { estado: "ok", contato: pessoa.name, contas: await contasDaPessoa(db, pessoa), pessoa };
}
