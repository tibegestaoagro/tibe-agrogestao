import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, type ActionResult } from "@/lib/actions/types";
import type { ContactType } from "@/generated/prisma/client";

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
 */

export const CONTACT_TYPES = [
  "particular",
  "fazendeiro",
  "comerciante_gado",
  "frigorifico",
  "leilao",
  "feira_evento",
  "cooperativa",
  "loja_fornecedor",
  "prestador_servico",
  "outro",
] as const satisfies readonly ContactType[];

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
 * Acha o contato pelo nome dito na conversa, ou cria um novo com só o nome.
 *
 * CRIA EM SILÊNCIO, de propósito, e é a única escrita deste módulo que não pede
 * confirmação. O §4 diz que o cadastro "deverá ser simples e rápido" e que o
 * produtor não é obrigado a classificar ninguém; parar a conversa para
 * perguntar "o João é fazendeiro ou comerciante?" no meio de um registro de
 * compra é exatamente a fricção que o §5 manda evitar. Um contato só com nome
 * não altera saldo nem dinheiro: o risco de errar é um nome duplicado na lista,
 * não um número errado no rebanho.
 *
 * A busca é exata (sem acento e sem caixa) em vez de "contém": "João" não pode
 * casar com "João Pedro Silva" e pendurar a compra na pessoa errada.
 */
export async function findOrCreateContactByName(
  db: TenantPrismaClient,
  nome: string,
): Promise<{ id: string; name: string; criado: boolean }> {
  const limpo = nome.trim();
  const existente = await db.contact.findFirst({
    where: { archived_at: null, name: { equals: limpo, mode: "insensitive" } },
  });
  if (existente) return { id: existente.id, name: existente.name, criado: false };

  const novo = await db.contact.create({ data: scoped({ name: limpo }) });
  return { id: novo.id, name: novo.name, criado: true };
}
