import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import type { ContactType, Prisma } from "@/generated/prisma/client";
import { delegates } from "@/lib/prisma-delegates";

/**
 * O mínimo que esta action precisa do client. Aceita tanto o client escopado
 * quanto um `tx` de transação, que é o que permite criar o contato junto com a
 * negociação, tudo ou nada.
 */
export type ContactClient = Pick<TenantPrismaClient, "contact"> | Prisma.TransactionClient;

/**
 * Contatos de negociação (Módulo 31, §4 e §5).
 *
 * §5 é explícito sobre a simplicidade: nesta primeira versão o sistema NÃO deve
 * exigir CPF, CNPJ, inscrição estadual, endereço completo, dados bancários nem
 * documentação fiscal. Só o nome é obrigatório, e até o TIPO é opcional, porque
 * "o usuário não deverá ser obrigado a classificar a pessoa ou empresa quando
 * não souber" (§4).
 *
 * Extraído do route handler em 2026-08-13: a regra vive aqui porque o caminho
 * do WhatsApp precisa da mesma criação ("comprei 20 bezerros DO JOÃO", §18.1) e
 * duplicá-la faria os dois caminhos divergirem, que é a razão do CLAUDE.md
 * exigir regra de negócio em `src/lib/actions`.
 *
 * `findOrCreateContact` aceita um `tx` justamente por isso: a criação a partir
 * da conversa acontece DENTRO da transação da negociação, para uma recusa por
 * saldo não deixar contato órfão. Uma versão anterior tinha uma cópia inline em
 * `negotiations.ts` enquanto o comentário aqui afirmava que os dois caminhos
 * compartilhavam a regra: era exatamente a divergência que ele dizia evitar.
 */

/**
 * Os tipos oferecidos na API e na tela.
 *
 * ⚠️ Precisa cobrir o enum INTEIRO. Até 02/09 esta lista tinha 10 dos 13
 * valores: `laticinio`, `queijaria` e `mercado` entraram no schema pelo §24 do
 * Módulo 32 e nunca chegaram aqui, então `POST /api/v1/contacts` recusava um
 * contato de laticínio e `GET ?type=laticinio` ignorava o filtro em silêncio.
 *
 * `satisfies readonly ContactType[]`, que era como isto estava escrito, NÃO
 * pega essa falta: ele confere que cada valor listado é válido, nunca que a
 * lista é completa. O `Record` abaixo pega, porque um valor novo no enum quebra
 * a compilação até ser listado aqui.
 *
 * A ORDEM é a do enum, e é a que a tela usa nos seletores.
 */
const TIPOS_COMPLETOS: Record<ContactType, true> = {
  particular: true,
  fazendeiro: true,
  comerciante_gado: true,
  frigorifico: true,
  leilao: true,
  feira_evento: true,
  cooperativa: true,
  loja_fornecedor: true,
  prestador_servico: true,
  laticinio: true,
  queijaria: true,
  mercado: true,
  outro: true,
};

export const CONTACT_TYPES = Object.keys(TIPOS_COMPLETOS) as readonly ContactType[];

export type ContactInput = {
  name: string;
  type?: ContactType | null;
  phone?: string | null;
  city?: string | null;
  notes?: string | null;
};

export type ContactView = {
  id: string;
  name: string;
  type: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
};

function serializar(c: {
  id: string;
  name: string;
  type: ContactType | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
}): ContactView {
  return { id: c.id, name: c.name, type: c.type, phone: c.phone, city: c.city, notes: c.notes };
}

export async function listContacts(
  db: TenantPrismaClient,
  filtro: { busca?: string | null; type?: ContactType | null } = {},
): Promise<ContactView[]> {
  const contatos = await db.contact.findMany({
    where: {
      archived_at: null,
      ...(filtro.busca ? { name: { contains: filtro.busca, mode: "insensitive" as const } } : {}),
      ...(filtro.type ? { type: filtro.type } : {}),
    },
    orderBy: { name: "asc" },
  });
  return contatos.map(serializar);
}

export type ContactDetailView = ContactView & {
  archived: boolean;
  negotiations: { id: string; type: string; occurred_at: string; amount: number | null }[];
};

export async function createContact(
  db: TenantPrismaClient,
  input: ContactInput,
): Promise<ActionResult<ContactView>> {
  const contato = await db.contact.create({
    data: scoped({
      name: input.name.trim(),
      type: input.type ?? null,
      phone: input.phone ?? null,
      city: input.city ?? null,
      notes: input.notes ?? null,
    }),
  });
  return ok(serializar(contato));
}

/**
 * Edita um contato. Só os campos do §5: nada de documento, endereço nem dado
 * bancário, que o Módulo 31 já decidiu deixar fora.
 *
 * Existe desde a fase 0 dos Módulos 33 e 34. Até 02/09 o contato criado pela
 * conversa (`findOrCreateContact`, que grava só o nome dito no WhatsApp) não
 * tinha como ganhar telefone, tipo nem município depois: nenhuma tela e nenhuma
 * rota escreviam num contato existente.
 */
export async function updateContact(
  db: TenantPrismaClient,
  id: string,
  input: ContactInput,
): Promise<ActionResult<ContactView>> {
  const nome = (input.name ?? "").trim();
  if (!nome) return fail("VALIDATION_ERROR", "Informe o nome do contato.", 422, "name");

  const atual = await db.contact.findUnique({ where: { id } });
  if (!atual) return fail("NOT_FOUND", "Contato não encontrado.", 404);

  const contato = await db.contact.update({
    where: { id },
    data: {
      name: nome,
      type: input.type ?? null,
      phone: input.phone ?? null,
      city: input.city ?? null,
      notes: input.notes ?? null,
    },
  });
  return ok(serializar(contato));
}

/**
 * Arquiva ou desarquiva.
 *
 * Desativar, nunca apagar, como em Property e Pasture. Apagar levaria junto o
 * nome de quem está numa negociação antiga: `Negotiation.contact_id` é
 * `onDelete: SetNull`, então o histórico ficaria anônimo sem nenhum aviso.
 */
export async function setContactArchived(
  db: TenantPrismaClient,
  id: string,
  arquivado: boolean,
): Promise<ActionResult<ContactView>> {
  const atual = await db.contact.findUnique({ where: { id } });
  if (!atual) return fail("NOT_FOUND", "Contato não encontrado.", 404);

  const contato = await db.contact.update({
    where: { id },
    data: { archived_at: arquivado ? new Date() : null },
  });
  return ok(serializar(contato));
}

/**
 * O contato mais o histórico dele: por ora, as negociações não canceladas.
 *
 * As canceladas ficam de fora porque o §17.10 do Módulo 31 mantém a linha no
 * histórico DA NEGOCIAÇÃO, que é onde o cancelamento é legível. Aqui elas só
 * inflariam a conta de "quanto já negociei com o João" com negócios desfeitos.
 */
export async function getContactDetail(
  db: TenantPrismaClient,
  id: string,
): Promise<ActionResult<ContactDetailView>> {
  const contato = await db.contact.findUnique({
    where: { id },
    include: {
      negotiations: {
        where: { canceled_at: null },
        orderBy: { occurred_at: "desc" },
        take: 50,
        select: { id: true, type: true, occurred_at: true, amount: true },
      },
    },
  });
  if (!contato) return fail("NOT_FOUND", "Contato não encontrado.", 404);

  return ok({
    ...serializar(contato),
    archived: contato.archived_at !== null,
    negotiations: contato.negotiations.map((n) => ({
      id: n.id,
      type: n.type,
      occurred_at: n.occurred_at.toISOString(),
      amount: n.amount === null ? null : Number(n.amount),
    })),
  });
}

/**
 * Acha o contato pelo nome dito na conversa, ou cria um novo com só o nome.
 *
 * CRIA EM SILÊNCIO, de propósito, e é a única escrita deste módulo que não pede
 * confirmação. O §5 pede cadastro simples, sem CPF, endereço nem dados
 * bancários, e o §4 diz que o produtor "não deverá ser obrigado a classificar
 * a pessoa ou empresa quando não souber"; parar a conversa para
 * perguntar "o João é fazendeiro ou comerciante?" no meio de um registro de
 * compra é exatamente a fricção que o §5 manda evitar. Um contato só com nome
 * não altera saldo nem dinheiro: o risco de errar é um nome duplicado na lista,
 * não um número errado no rebanho.
 *
 * A busca é EXATA e ignora só a CAIXA, não o acento: `mode: "insensitive"` vira
 * `ILIKE` no Postgres, que não normaliza acentuação. "Joao" e "João" viram dois
 * contatos, e é uma limitação conhecida, não o que um comentário anterior
 * afirmava ("sem acento"). Exata em vez de "contém" de propósito: "João" não
 * pode casar com "João Pedro Silva" e pendurar a compra na pessoa errada.
 *
 * Aceita `tx` para a criação a partir da conversa acontecer dentro da transação
 * da negociação.
 */
export async function findOrCreateContact(
  db: ContactClient,
  nome: string,
): Promise<{ id: string; name: string; criado: boolean }> {
  const limpo = nome.trim();
  const existente = await delegates(db).contact.findFirst({
    where: { archived_at: null, name: { equals: limpo, mode: "insensitive" } },
  });
  if (existente) return { id: existente.id, name: existente.name, criado: false };

  const novo = await delegates(db).contact.create({ data: scoped({ name: limpo }) });
  return { id: novo.id, name: novo.name, criado: true };
}
