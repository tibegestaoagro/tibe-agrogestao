import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import type { EmporioCustomer, Prisma } from "@/generated/prisma/client";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { formatarNumero } from "@/lib/emporio/numeracao";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { normalizarTermo } from "@/lib/actions/whatsapp-handlers/shared";
import { CONSUMIDOR_FINAL, conferirCadastro, type CadastroDoContato } from "@/lib/contatos/cadastro";
import { faltaNoCadastro, recusaDocumentoRepetido } from "@/lib/emporio/cliente-cadastro";
import { exigir } from "@/lib/emporio/papel";
import { diferencas, registrarNoHistorico } from "@/lib/emporio/historico";

/**
 * O cliente do Empório (`EmporioCustomer`), separado dos Contatos da fazenda.
 * O formato dos campos é de `conferirCadastro`; o que é obrigatório por tipo é
 * de `faltaNoCadastro` (PF: nome e telefone; PJ: mais CNPJ e endereço principal).
 * O "Consumidor final" é o cliente fixo de quem não quer se identificar.
 */

export type ClienteInput = CadastroDoContato & { name?: string | null; notes?: string | null };

export type ClienteView = {
  id: string;
  name: string;
  person_kind: "pf" | "pj" | null;
  document: string | null;
  phone: string | null;
  state_registration: string | null;
  birth_date: string | null;
  responsible_name: string | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  city: string | null;
  address_state: string | null;
  delivery_zip: string | null;
  delivery_street: string | null;
  delivery_number: string | null;
  delivery_complement: string | null;
  delivery_district: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  notes: string | null;
  archived: boolean;
  /** Falta algo do que `faltaNoCadastro` exige para o tipo (o migrado só com nome, por exemplo). */
  incomplete: boolean;
  /** O Consumidor final: fixo, não edita nem arquiva. */
  fixed: boolean;
};

export const RECUSA_CONSUMIDOR_FINAL = "O Consumidor final é fixo e não pode ser editado nem arquivado.";
const NAO_ACHADO = () => fail("NOT_FOUND", "Cliente não encontrado.", 404);

/** Os campos do cadastro que a edição trata como "ausente = mantém, nulo = limpa". */
const CAMPOS = [
  "name", "person_kind", "document", "phone", "state_registration", "birth_date", "responsible_name",
  "address_zip", "address_street", "address_number", "address_complement", "address_district", "city", "address_state",
  "delivery_zip", "delivery_street", "delivery_number", "delivery_complement", "delivery_district", "delivery_city",
  "delivery_state",
] as const;

const ROTULOS: Record<string, string> = {
  name: "Nome",
  phone: "Telefone",
  city: "Cidade",
  notes: "Observações",
  person_kind: "Tipo de pessoa",
  document: "CPF/CNPJ",
  state_registration: "Inscrição estadual",
  birth_date: "Nascimento",
  responsible_name: "Responsável",
  address_zip: "CEP",
  address_street: "Rua",
  address_number: "Número",
  address_complement: "Complemento",
  address_district: "Bairro",
  address_state: "UF",
  delivery_zip: "CEP de entrega",
  delivery_street: "Rua de entrega",
  delivery_number: "Número de entrega",
  delivery_complement: "Complemento de entrega",
  delivery_district: "Bairro de entrega",
  delivery_city: "Cidade de entrega",
  delivery_state: "UF de entrega",
};

// O Histórico não se apaga: dado pessoal entra só como "informado".
const mascarar = (v: unknown) => (v ? "informado" : null);
const PESSOAIS = { document: mascarar, phone: mascarar, birth_date: mascarar };

const ehUnico = (e: unknown) => (e as { code?: unknown })?.code === "P2002";
const textoOuNulo = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function serializarCliente(c: EmporioCustomer): ClienteView {
  const view: Omit<ClienteView, "incomplete"> = {
    id: c.id,
    name: c.name,
    person_kind: c.person_kind,
    document: c.document,
    phone: c.phone,
    state_registration: c.state_registration,
    birth_date: c.birth_date ? c.birth_date.toISOString().slice(0, 10) : null,
    responsible_name: c.responsible_name,
    address_zip: c.address_zip,
    address_street: c.address_street,
    address_number: c.address_number,
    address_complement: c.address_complement,
    address_district: c.address_district,
    city: c.city,
    address_state: c.address_state,
    delivery_zip: c.delivery_zip,
    delivery_street: c.delivery_street,
    delivery_number: c.delivery_number,
    delivery_complement: c.delivery_complement,
    delivery_district: c.delivery_district,
    delivery_city: c.delivery_city,
    delivery_state: c.delivery_state,
    notes: c.notes,
    archived: c.archived_at !== null,
    fixed: c.system_key !== null,
  };
  return { ...view, incomplete: faltaNoCadastro({ ...view, system_key: c.system_key }) !== null };
}

function paraBanco(dados: CadastroDoContato): Record<string, unknown> {
  const { birth_date, ...resto } = dados;
  return {
    ...resto,
    ...(birth_date !== undefined
      ? { birth_date: birth_date ? new Date(`${birth_date}T00:00:00.000Z`) : null }
      : {}),
  };
}

/** Os campos que `faltaNoCadastro` lê, a partir dos dados conferidos (ausente vira nulo). */
function paraConferir(d: CadastroDoContato) {
  return {
    name: d.name ?? null,
    person_kind: d.person_kind ?? null,
    phone: d.phone ?? null,
    document: d.document ?? null,
    address_zip: d.address_zip ?? null,
    address_street: d.address_street ?? null,
    address_number: d.address_number ?? null,
    address_complement: d.address_complement ?? null,
    address_district: d.address_district ?? null,
    city: d.city ?? null,
    address_state: d.address_state ?? null,
  };
}

/**
 * Quem já usa o documento entre os clientes da conta. Conta os arquivados: o
 * índice único não os ignora, e a recusa precisa dizer onde o cliente está.
 */
async function documentoRepetido(
  db: TenantPrismaClient,
  documento: string,
  selfId: string | null,
): Promise<ActionResult<never> | null> {
  const c = await db.emporioCustomer.findFirst({
    where: { document: documento, ...(selfId ? { id: { not: selfId } } : {}) },
    select: { name: true, archived_at: true },
  });
  return c ? recusaDocumentoRepetido("cliente", { name: c.name, archived: c.archived_at !== null }, documento) : null;
}

export async function cadastrarClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: ClienteInput,
): Promise<ActionResult<ClienteView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "cadastrar um cliente");
  if (neg) return neg;

  const conf = conferirCadastro(input);
  if (!conf.ok) return fail("VALIDATION_ERROR", conf.message, 422, conf.field);
  const falta = faltaNoCadastro(paraConferir(conf.dados));
  if (falta) return fail("VALIDATION_ERROR", falta.message, 422, falta.field);
  const documento = conf.dados.document ?? null;

  if (documento) {
    const rep = await documentoRepetido(db, documento, null);
    if (rep) return rep;
  }

  try {
    const cliente = await db.$transaction(async (tx) => {
      const criado = await tx.emporioCustomer.create({
        data: scoped({
          ...paraBanco(conf.dados),
          name: conf.dados.name as string,
          notes: textoOuNulo(input.notes),
        }) as Prisma.EmporioCustomerUncheckedCreateInput,
      });
      await registrarNoHistorico(tx, ator, {
        action: "cliente.cadastrar",
        target_type: "cliente",
        target_id: criado.id,
        summary: `Cadastrou o cliente ${criado.name}`,
      });
      return criado;
    });
    return ok(serializarCliente(cliente));
  } catch (e) {
    // Dois balcões com o mesmo documento ao mesmo tempo: o índice único decide.
    if (documento && ehUnico(e)) {
      const rep = await documentoRepetido(db, documento, null);
      if (rep) return rep;
    }
    throw e;
  }
}

/**
 * Edita o cadastro (inclusive o do cliente migrado, só com nome). Mescla o
 * guardado com o que veio (ausente = mantém, nulo = limpa) e confere o
 * RESULTADO: formato e o que o tipo exige. Só se grava o cadastro completo.
 */
export async function editarClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: Partial<ClienteInput>,
): Promise<ActionResult<ClienteView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "editar um cliente");
  if (neg) return neg;

  const atual = await db.emporioCustomer.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO();
  if (atual.system_key) return fail("VALIDATION_ERROR", RECUSA_CONSUMIDOR_FINAL, 422);
  if (atual.archived_at) {
    return fail("VALIDATION_ERROR", "Esse cliente está arquivado: desarquive em Clientes antes de editar.", 422);
  }

  const guardado = serializarCliente(atual) as unknown as Record<string, string | null>;
  const entrada = input as unknown as Record<string, string | null | undefined>;
  const mesclado: Record<string, string | null> = {};
  for (const k of CAMPOS) mesclado[k] = k in entrada ? (entrada[k] ?? null) : guardado[k];

  const conf = conferirCadastro(mesclado as CadastroDoContato);
  if (!conf.ok) return fail("VALIDATION_ERROR", conf.message, 422, conf.field);
  const falta = faltaNoCadastro(paraConferir(conf.dados));
  if (falta) return fail("VALIDATION_ERROR", falta.message, 422, falta.field);
  const documento = conf.dados.document ?? null;

  if (documento) {
    const rep = await documentoRepetido(db, documento, id);
    if (rep) return rep;
  }

  const dados: Record<string, unknown> = { ...paraBanco(conf.dados) };
  if ("notes" in entrada) dados.notes = textoOuNulo(entrada.notes);

  try {
    const cliente = await db.$transaction(async (tx) => {
      const novo = await tx.emporioCustomer.update({ where: { id }, data: dados as Prisma.EmporioCustomerUncheckedUpdateInput });
      await registrarNoHistorico(tx, ator, {
        action: "cliente.editar",
        target_type: "cliente",
        target_id: id,
        summary: `Editou o cliente ${novo.name}`,
        changes: diferencas(guardado, serializarCliente(novo) as unknown as Record<string, unknown>, ROTULOS, PESSOAIS),
      });
      return novo;
    });
    return ok(serializarCliente(cliente));
  } catch (e) {
    if (documento && ehUnico(e)) {
      const rep = await documentoRepetido(db, documento, id);
      if (rep) return rep;
    }
    throw e;
  }
}

export type ClienteLinha = Pick<ClienteView, "id" | "name" | "person_kind" | "document" | "phone" | "incomplete" | "fixed" | "archived">;

export type ClienteFichaView = ClienteView & {
  resumo: { total_comprado: number; ultima_compra_em: string | null; vendas_ativas: number };
  vendas: {
    id: string;
    numero: string;
    sold_at: string;
    loja: string;
    situacao: "ativa" | "cancelada" | "trocada" | "devolvida";
    total: number;
    formas: string[];
    vendedor: string | null;
    itens: { produto: string; apresentacao: string | null; quantity: number; total: number }[];
  }[];
  orcamentos: { id: string; numero: string; created_at: string; loja: string; valor: number; situacao: "aberto" | "vencido" | "faturado" }[];
};

const POR_PAGINA_PADRAO = 50;
const POR_PAGINA_MAXIMO = 100;
const VENDAS_NA_FICHA = 100;
const ORCAMENTOS_NA_FICHA = 50;

/**
 * A lista de clientes: o Consumidor final primeiro, depois por nome. `q` casa o
 * nome sem acento; sem `arquivados`, só os ativos.
 */
export async function listarClientesAction(
  db: TenantPrismaClient,
  ator: Ator,
  f: { q?: string; arquivados?: boolean; pagina?: number; por_pagina?: number },
): Promise<ActionResult<{ itens: ClienteLinha[]; total: number; pagina: number; por_pagina: number }>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "ver os clientes");
  if (neg) return neg;

  const porPagina = Math.min(POR_PAGINA_MAXIMO, Math.max(1, Math.floor(Number(f.por_pagina) || POR_PAGINA_PADRAO)));
  const pagina = Math.max(1, Math.floor(Number(f.pagina) || 1));
  const termo = typeof f.q === "string" ? normalizarTermo(f.q) : "";
  const where: Prisma.EmporioCustomerWhereInput = {
    ...(f.arquivados ? {} : { archived_at: null }),
    ...(termo ? { name_busca: { contains: termo } } : {}),
  };

  const total = await db.emporioCustomer.count({ where });
  // O Consumidor final (um por conta) abre a primeira página; os demais seguem por nome.
  const fixos = pagina === 1 ? await db.emporioCustomer.findMany({ where: { ...where, system_key: { not: null } }, orderBy: { name: "asc" } }) : [];
  const jaFixos = (await db.emporioCustomer.count({ where: { ...where, system_key: { not: null } } }));
  const pular = pagina === 1 ? 0 : (pagina - 1) * porPagina - jaFixos;
  const resto = await db.emporioCustomer.findMany({
    where: { ...where, system_key: null },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: pular,
    take: porPagina - fixos.length,
  });
  const itens = [...fixos, ...resto].map((c) => {
    const v = serializarCliente(c);
    return {
      id: v.id, name: v.name, person_kind: v.person_kind, document: v.document, phone: v.phone,
      incomplete: v.incomplete, fixed: v.fixed, archived: v.archived,
    };
  });
  return ok({ itens, total, pagina, por_pagina: porPagina });
}

/** Lê um cliente: o cadastro e o histórico de compras (vendas e orçamentos das lojas do ator). */
export async function lerClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<ClienteFichaView>> {
  return lerFicha(db, ator, id, VENDAS_NA_FICHA);
}

/** A ficha com o limite de vendas listadas à vista: o resumo NUNCA depende dele (vale para todas as vendas). */
export async function lerFicha(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  limiteDeVendas: number,
): Promise<ActionResult<ClienteFichaView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "ver um cliente");
  if (neg) return neg;
  const c = await db.emporioCustomer.findFirst({ where: { id } });
  if (!c) return NAO_ACHADO();

  const visiveis = await lojasDoAtor(db, ator);
  const daLoja = visiveis ? { establishment_id: { in: [...visiveis] } } : {};

  const vendas = await db.emporioSale.findMany({
    where: { customer_id: id, ...daLoja },
    orderBy: [{ sold_at: "desc" }, { id: "desc" }],
    take: limiteDeVendas,
    include: {
      establishment: { select: { name: true } },
      payments: { select: { kind: true }, orderBy: { created_at: "asc" } },
      items: { include: { emporio_product: { select: { product: { select: { name: true } } } }, presentation: { select: { name: true } } } },
      returns: { select: { amount: true, exchange_sale: { select: { id: true } } } },
    },
  });
  const orcamentos = await db.emporioQuote.findMany({
    where: { customer_id: id, ...daLoja },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: ORCAMENTOS_NA_FICHA,
    include: { establishment: { select: { name: true } } },
  });
  // O resumo vale para TODAS as vendas do cliente nas lojas visíveis, não só as listadas.
  const concluidas = { customer_id: id, status: "concluida" as const, ...daLoja };
  const vendido = await db.emporioSale.aggregate({ where: concluidas, _sum: { net_amount: true }, _max: { sold_at: true } });
  const devolvido = await db.emporioSaleReturn.aggregate({ where: { sale: concluidas }, _sum: { amount: true } });
  const ativas = await db.emporioSale.count({ where: { ...concluidas, returns: { none: {} } } });
  const donos = [...new Set(vendas.map((v) => v.seller_user_id ?? v.sold_by_user_id).filter((u): u is string => !!u))];
  const usuarios = donos.length ? await db.user.findMany({ where: { id: { in: donos } }, select: { id: true, name: true } }) : [];
  const nomeDe = new Map(usuarios.map((u) => [u.id, u.name]));

  const linhas: ClienteFichaView["vendas"] = vendas.map((v) => {
    const situacao: ClienteFichaView["vendas"][number]["situacao"] =
      v.status === "cancelada" ? "cancelada"
        : v.returns.some((r) => r.exchange_sale) ? "trocada"
          : v.returns.length > 0 ? "devolvida"
            : "ativa";
    const quem = v.seller_user_id ?? v.sold_by_user_id;
    return {
      id: v.id,
      numero: formatarNumero(v.number),
      sold_at: v.sold_at.toISOString(),
      loja: v.establishment.name,
      situacao,
      total: Number(v.net_amount),
      formas: [...new Set(v.payments.map((p) => p.kind as string))],
      vendedor: quem ? (nomeDe.get(quem) ?? null) : null,
      itens: v.items.map((i) => ({
        produto: i.emporio_product.product.name,
        apresentacao: i.presentation.name ?? null,
        quantity: Number(i.quantity),
        total: Number(i.total),
      })),
    };
  });

  const hojeMs = hojeEmBrasilia().getTime();
  return ok({
    ...serializarCliente(c),
    resumo: {
      total_comprado: Math.round((Number(vendido._sum.net_amount ?? 0) - Number(devolvido._sum.amount ?? 0)) * 100) / 100,
      ultima_compra_em: vendido._max.sold_at?.toISOString() ?? null,
      vendas_ativas: ativas,
    },
    vendas: linhas,
    orcamentos: orcamentos.map((q) => ({
      id: q.id,
      numero: formatarNumero(q.number),
      created_at: q.created_at.toISOString(),
      loja: q.establishment.name,
      valor: Number(q.net_amount),
      situacao: q.sale_id ? "faturado" : hojeMs > q.valid_until.getTime() ? "vencido" : "aberto",
    })),
  });
}

/** Arquiva ou desarquiva. O arquivado sai das listas e das escolhas, mas a ficha e as vendas dele seguem. */
export async function arquivarClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  arquivado: boolean,
): Promise<ActionResult<ClienteView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "arquivar um cliente");
  if (neg) return neg;
  const atual = await db.emporioCustomer.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO();
  if (atual.system_key) return fail("VALIDATION_ERROR", RECUSA_CONSUMIDOR_FINAL, 422);

  const novo = await db.$transaction(async (tx) => {
    const r = await tx.emporioCustomer.update({ where: { id }, data: { archived_at: arquivado ? new Date() : null } });
    await registrarNoHistorico(tx, ator, {
      action: arquivado ? "cliente.arquivar" : "cliente.desarquivar",
      target_type: "cliente",
      target_id: id,
      summary: `${arquivado ? "Arquivou" : "Desarquivou"} o cliente ${r.name}`,
    });
    return r;
  });
  return ok(serializarCliente(novo));
}

/**
 * O cliente fixo "Consumidor final" da conta, criado na primeira vez. Não é
 * escrita do usuário (nome sem `Action`, fora do Histórico). Race-safe: o
 * índice único [tenant_id, system_key] decide, e quem perde a corrida relê.
 */
export async function garantirConsumidorFinal(db: TenantPrismaClient): Promise<{ id: string; name: string }> {
  const achar = () => db.emporioCustomer.findFirst({ where: { system_key: CONSUMIDOR_FINAL.system_key } });
  const existente = await achar();
  if (existente) return { id: existente.id, name: existente.name };
  try {
    const novo = await db.emporioCustomer.create({
      data: scoped({ name: CONSUMIDOR_FINAL.name, system_key: CONSUMIDOR_FINAL.system_key }) as Prisma.EmporioCustomerUncheckedCreateInput,
    });
    return { id: novo.id, name: novo.name };
  } catch (e) {
    if (!ehUnico(e)) throw e;
    const depois = await achar();
    if (!depois) throw e;
    return { id: depois.id, name: depois.name };
  }
}
