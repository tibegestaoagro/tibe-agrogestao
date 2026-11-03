import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import type { Contact, ContactType, Prisma } from "@/generated/prisma/client";
import { delegates } from "@/lib/prisma-delegates";
import { totalDoServico } from "@/lib/mao-de-obra/total-do-servico";
import { decToNum } from "@/lib/serialize";
import { conferirCadastro, cadastroIncompleto, type CadastroDoContato } from "@/lib/contatos/cadastro";

/**
 * O mínimo que esta action precisa do client. Aceita tanto o client escopado
 * quanto um `tx` de transação, que é o que permite criar o contato junto com a
 * negociação, tudo ou nada.
 */
export type ContactClient = Pick<TenantPrismaClient, "contact"> | Prisma.TransactionClient;

/**
 * Contatos de negociação (Módulo 31, §4 e §5).
 *
 * §5 é explícito sobre a simplicidade: fora do balcão do Empório o sistema NÃO
 * exige CPF, CNPJ, inscrição estadual, endereço completo, dados bancários nem
 * documentação fiscal. Desde 2026-11-03 os campos do cadastro PF/PJ são ACEITOS
 * aqui, mas continuam opcionais: só o nome é obrigatório, e até o TIPO é
 * opcional, porque "o usuário não deverá ser obrigado a classificar a pessoa ou
 * empresa quando não souber" (§4). Quem os exige é o balcão do Empório.
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

/** Campos do cadastro PF/PJ que o PATCH trata como "ausente = mantém, nulo = limpa". */
const CAMPOS_NOVOS = [
  "person_kind", "document", "state_registration", "birth_date", "responsible_name",
  "address_zip", "address_street", "address_number", "address_complement", "address_district", "address_state",
  "delivery_zip", "delivery_street", "delivery_number", "delivery_complement", "delivery_district",
  "delivery_city", "delivery_state",
] as const;

export type ContactInput = CadastroDoContato & {
  name: string;
  type?: ContactType | null;
  notes?: string | null;
};

export type ContactView = {
  id: string;
  name: string;
  type: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  person_kind: "pf" | "pj" | null;
  document: string | null;
  state_registration: string | null;
  birth_date: string | null;
  responsible_name: string | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_state: string | null;
  delivery_zip: string | null;
  delivery_street: string | null;
  delivery_number: string | null;
  delivery_complement: string | null;
  delivery_district: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  incomplete: boolean;
};

function serializar(c: Contact): ContactView {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    phone: c.phone,
    city: c.city,
    notes: c.notes,
    person_kind: c.person_kind,
    document: c.document,
    state_registration: c.state_registration,
    birth_date: c.birth_date ? c.birth_date.toISOString().slice(0, 10) : null,
    responsible_name: c.responsible_name,
    address_zip: c.address_zip,
    address_street: c.address_street,
    address_number: c.address_number,
    address_complement: c.address_complement,
    address_district: c.address_district,
    address_state: c.address_state,
    delivery_zip: c.delivery_zip,
    delivery_street: c.delivery_street,
    delivery_number: c.delivery_number,
    delivery_complement: c.delivery_complement,
    delivery_district: c.delivery_district,
    delivery_city: c.delivery_city,
    delivery_state: c.delivery_state,
    incomplete: cadastroIncompleto(c),
  };
}

export const RECUSA_CONSUMIDOR_FINAL = "O Consumidor final é fixo e não pode ser editado nem arquivado.";

/**
 * Quem já usa o documento neste tenant. Conta os arquivados também: o índice
 * único não os ignora, e a recusa precisa dizer onde o contato está.
 */
export async function documentoRepetido(
  db: ContactClient,
  documento: string,
  selfId: string | null,
): Promise<{ id: string; name: string; archived: boolean } | null> {
  const c = await delegates(db).contact.findFirst({
    where: { document: documento, ...(selfId ? { id: { not: selfId } } : {}) },
    select: { id: true, name: true, archived_at: true },
  });
  return c ? { id: c.id, name: c.name, archived: c.archived_at !== null } : null;
}

export function recusaDocumento(r: { name: string; archived: boolean }, documento: string) {
  const rotulo = documento.length === 14 ? "CNPJ" : "CPF";
  const msg =
    `Já existe um contato com esse ${rotulo}: ${r.name}.` +
    (r.archived ? " Ele está arquivado: desarquive em Contatos." : "");
  return fail("DUPLICATE_DOCUMENT", msg, 409, "document");
}

const ehUnico = (e: unknown) => (e as { code?: unknown })?.code === "P2002";

function paraBanco(dados: CadastroDoContato): Record<string, unknown> {
  const { birth_date, ...resto } = dados;
  return {
    ...resto,
    ...(birth_date !== undefined
      ? { birth_date: birth_date ? new Date(`${birth_date}T00:00:00.000Z`) : null }
      : {}),
  };
}

export async function listContacts(
  db: TenantPrismaClient,
  filtro: { busca?: string | null; type?: ContactType | null } = {},
): Promise<ContactView[]> {
  const contatos = await db.contact.findMany({
    where: {
      archived_at: null,
      system_key: null,
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
  /**
   * Os serviços do §37 do documento de Máquinas: "o que já fiz com o João"
   * passa a ter uma resposta só.
   *
   * As DUAS direções na mesma lista, porque a ficha é sobre a PESSOA. O mesmo
   * vizinho pode ter roçado o pasto da fazenda num mês e contratado a
   * colheitadeira no outro, e separar isso em duas listas obrigaria o produtor
   * a lembrar de qual lado o dinheiro correu para achar o serviço.
   */
  services: {
    id: string;
    occurred_at: string;
    description: string;
    direction: string;
    total: number;
  }[];
};

export async function createContact(
  db: TenantPrismaClient,
  input: ContactInput,
): Promise<ActionResult<ContactView>> {
  if (!(input.name ?? "").trim()) return fail("VALIDATION_ERROR", "Informe o nome do contato.", 422, "name");

  const conf = conferirCadastro(input, "livre");
  if (!conf.ok) return fail("VALIDATION_ERROR", conf.message, 422, conf.field);
  const documento = conf.dados.document ?? null;

  if (documento) {
    const rep = await documentoRepetido(db, documento, null);
    if (rep) return recusaDocumento(rep, documento);
  }

  try {
    const contato = await db.contact.create({
      data: scoped({
        ...paraBanco(conf.dados),
        name: input.name.trim(),
        type: input.type ?? null,
        notes: input.notes ?? null,
      }) as Prisma.ContactUncheckedCreateInput,
    });
    return ok(serializar(contato));
  } catch (e) {
    if (documento && ehUnico(e)) {
      const rep = await documentoRepetido(db, documento, null);
      if (rep) return recusaDocumento(rep, documento);
    }
    throw e;
  }
}

/**
 * Edita um contato.
 *
 * Existe desde a fase 0 dos Módulos 33 e 34. Até 02/09 o contato criado pela
 * conversa (`findOrCreateContact`, que grava só o nome dito no WhatsApp) não
 * tinha como ganhar telefone, tipo nem município depois.
 *
 * Semântica mista, de propósito: `name/type/phone/city/notes` continuam
 * substituindo tudo (ausente vira nulo). Os campos do cadastro PF/PJ são
 * "ausente = mantém, nulo = limpa", para quem só corrige o telefone não perder
 * o CPF gravado no balcão. A conferência roda sobre o registro MESCLADO
 * (guardado + entrada): um `document` sem `person_kind` usa o tipo guardado, e
 * trocar o tipo zera o campo do outro tipo.
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
  if (atual.system_key) return fail("VALIDATION_ERROR", RECUSA_CONSUMIDOR_FINAL, 422);

  const guardado = serializar(atual) as unknown as Record<string, string | null>;
  const entrada = input as unknown as Record<string, string | null | undefined>;
  const mesclado: Record<string, string | null> = {
    name: nome,
    phone: input.phone ?? null,
    city: input.city ?? null,
  };
  for (const k of CAMPOS_NOVOS) mesclado[k] = k in entrada ? (entrada[k] ?? null) : guardado[k];

  const conf = conferirCadastro(mesclado as CadastroDoContato, "livre");
  if (!conf.ok) return fail("VALIDATION_ERROR", conf.message, 422, conf.field);
  const documento = conf.dados.document ?? null;

  if (documento) {
    const rep = await documentoRepetido(db, documento, id);
    if (rep) return recusaDocumento(rep, documento);
  }

  try {
    const contato = await db.contact.update({
      where: { id },
      data: {
        ...paraBanco(conf.dados),
        name: nome,
        type: input.type ?? null,
        notes: input.notes ?? null,
      } as Prisma.ContactUncheckedUpdateInput,
    });
    return ok(serializar(contato));
  } catch (e) {
    if (documento && ehUnico(e)) {
      const rep = await documentoRepetido(db, documento, id);
      if (rep) return recusaDocumento(rep, documento);
    }
    throw e;
  }
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
  if (atual.system_key) return fail("VALIDATION_ERROR", RECUSA_CONSUMIDOR_FINAL, 422);

  const contato = await db.contact.update({
    where: { id },
    data: { archived_at: arquivado ? new Date() : null },
  });
  return ok(serializar(contato));
}

/**
 * O contato mais o histórico dele: as negociações e os serviços, os dois sem os
 * cancelados.
 *
 * Os cancelados ficam de fora porque o §17.10 do Módulo 31 mantém a linha no
 * histórico DA NEGOCIAÇÃO, que é onde o cancelamento é legível. Aqui eles só
 * inflariam a conta de "quanto já negociei com o João" com negócios desfeitos.
 *
 * ⚠️ As duas listas são independentes, e cada uma pode vir vazia. O contato mais
 * comum dos Módulos 33 e 34 é o pedreiro, que tem serviço e NENHUMA negociação:
 * uma tela que assuma negócio para mostrar a ficha perde justamente ele.
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
      service_jobs: {
        where: { canceled_at: null },
        orderBy: { occurred_at: "desc" },
        take: 50,
        include: { logs: true },
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
    services: contato.service_jobs.map((s) => ({
      id: s.id,
      occurred_at: s.occurred_at.toISOString(),
      description: s.description,
      direction: s.direction,
      // O total é DERIVADO aqui pela mesma função da listagem de serviços, e
      // não relido do banco: o `ServiceJob` não guarda total nenhum.
      total: totalDoServico(
        {
          pricing: s.pricing,
          unit_price: decToNum(s.unit_price),
          agreed_amount: decToNum(s.agreed_amount),
          worker_count: s.worker_count,
        },
        s.logs.map((l) => ({ quantity: decToNum(l.quantity) ?? 0, canceled_at: l.canceled_at })),
      ),
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
    where: { archived_at: null, system_key: null, name: { equals: limpo, mode: "insensitive" } },
  });
  if (existente) return { id: existente.id, name: existente.name, criado: false };

  const novo = await delegates(db).contact.create({ data: scoped({ name: limpo }) });
  return { id: novo.id, name: novo.name, criado: true };
}
