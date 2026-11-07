import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import type { EmporioSupplier, Prisma } from "@/generated/prisma/client";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { lerTermo, ondeBuscaFornecedor, paginaValida, type ResultadoDaBusca } from "@/lib/emporio/busca-de-cadastro";
import { conferirCadastro, type CadastroDoContato } from "@/lib/contatos/cadastro";
import { recusaDocumentoRepetido } from "@/lib/emporio/cliente-cadastro";
import { exigir } from "@/lib/emporio/papel";
import { diferencas, registrarNoHistorico } from "@/lib/emporio/historico";

/**
 * O fornecedor do Empório (`EmporioSupplier`), fora de Contatos. Dois tipos:
 * `externo` (só o nome é obrigatório) e `propriedade` (uma propriedade do Dono: o
 * nome é a cópia do dela e a compra entra só com o custo).
 */

export type FornecedorInput = Omit<CadastroDoContato, "birth_date" | "responsible_name" | `delivery_${string}`> & {
  kind?: "propriedade" | "externo";
  property_id?: string | null;
  name?: string | null;
  notes?: string | null;
};

export type FornecedorView = {
  id: string;
  kind: "propriedade" | "externo";
  property_id: string | null;
  name: string;
  person_kind: "pf" | "pj" | null;
  document: string | null;
  phone: string | null;
  state_registration: string | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  city: string | null;
  address_state: string | null;
  notes: string | null;
  archived: boolean;
};

export type FornecedorLinha = Pick<FornecedorView, "id" | "kind" | "name" | "document" | "phone" | "archived">;

const NAO_ACHADO = () => fail("NOT_FOUND", "Fornecedor não encontrado.", 404);

const CAMPOS = [
  "name", "person_kind", "document", "phone", "state_registration",
  "address_zip", "address_street", "address_number", "address_complement", "address_district", "city", "address_state",
] as const;

const ROTULOS: Record<string, string> = {
  name: "Nome",
  phone: "Telefone",
  city: "Cidade",
  notes: "Observações",
  person_kind: "Tipo de pessoa",
  document: "CPF/CNPJ",
  state_registration: "Inscrição estadual",
  address_zip: "CEP",
  address_street: "Rua",
  address_number: "Número",
  address_complement: "Complemento",
  address_district: "Bairro",
  address_state: "UF",
};

// O Histórico não se apaga: dado pessoal entra só como "informado".
const mascarar = (v: unknown) => (v ? "informado" : null);
const PESSOAIS = { document: mascarar, phone: mascarar };

const ehUnico = (e: unknown) => (e as { code?: unknown })?.code === "P2002";
const textoOuNulo = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function serializarFornecedor(s: EmporioSupplier): FornecedorView {
  return {
    id: s.id,
    kind: s.kind,
    property_id: s.property_id,
    name: s.name,
    person_kind: s.person_kind,
    document: s.document,
    phone: s.phone,
    state_registration: s.state_registration,
    address_zip: s.address_zip,
    address_street: s.address_street,
    address_number: s.address_number,
    address_complement: s.address_complement,
    address_district: s.address_district,
    city: s.city,
    address_state: s.address_state,
    notes: s.notes,
    archived: s.archived_at !== null,
  };
}

/** Quem já usa o documento entre os fornecedores da conta (os arquivados contam: o índice único não os ignora). */
async function documentoRepetido(
  db: TenantPrismaClient,
  documento: string,
  selfId: string | null,
): Promise<ActionResult<never> | null> {
  const s = await db.emporioSupplier.findFirst({
    where: { document: documento, ...(selfId ? { id: { not: selfId } } : {}) },
    select: { name: true, archived_at: true },
  });
  return s ? recusaDocumentoRepetido("fornecedor", { name: s.name, archived: s.archived_at !== null }, documento) : null;
}

async function propriedadeJaFornecedora(db: TenantPrismaClient, propertyId: string): Promise<ActionResult<never> | null> {
  const s = await db.emporioSupplier.findFirst({ where: { property_id: propertyId }, select: { name: true } });
  return s ? fail("DUPLICATE_PROPERTY_SUPPLIER", `Essa propriedade já é fornecedor: ${s.name}.`, 409, "property_id") : null;
}

export async function cadastrarFornecedorAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: FornecedorInput,
): Promise<ActionResult<FornecedorView>> {
  const neg = await exigir(db, ator, "chave:lancar_compra", "cadastrar um fornecedor");
  if (neg) return neg;

  if (input.kind === "propriedade") return cadastrarDePropriedade(db, ator, input);

  const { kind: _k, property_id: _p, notes, ...cadastro } = input;
  const conf = conferirCadastro(cadastro);
  if (!conf.ok) return fail("VALIDATION_ERROR", conf.message, 422, conf.field);
  const nome = conf.dados.name;
  if (!nome) return fail("VALIDATION_ERROR", "Informe o nome do fornecedor.", 422, "name");
  const documento = conf.dados.document ?? null;
  if (documento) {
    const rep = await documentoRepetido(db, documento, null);
    if (rep) return rep;
  }

  try {
    const criado = await db.$transaction(async (tx) => {
      const novo = await tx.emporioSupplier.create({
        data: scoped({
          ...conf.dados,
          kind: "externo" as const,
          name: nome,
          notes: textoOuNulo(notes),
        }) as Prisma.EmporioSupplierUncheckedCreateInput,
      });
      await registrarNoHistorico(tx, ator, {
        action: "fornecedor.cadastrar",
        target_type: "fornecedor",
        target_id: novo.id,
        summary: `Cadastrou o fornecedor ${novo.name}`,
      });
      return novo;
    });
    return ok(serializarFornecedor(criado));
  } catch (e) {
    if (documento && ehUnico(e)) {
      const rep = await documentoRepetido(db, documento, null);
      if (rep) return rep;
    }
    throw e;
  }
}

async function cadastrarDePropriedade(
  db: TenantPrismaClient,
  ator: Ator,
  input: FornecedorInput,
): Promise<ActionResult<FornecedorView>> {
  if (!input.property_id) return fail("VALIDATION_ERROR", "Escolha a propriedade.", 422, "property_id");
  const prop = await db.property.findFirst({ where: { id: input.property_id }, select: { id: true, name: true, archived_at: true } });
  if (!prop) return fail("NOT_FOUND", "Propriedade não encontrada.", 404, "property_id");
  if (prop.archived_at) return fail("VALIDATION_ERROR", "Essa propriedade está arquivada no Tibé.", 422, "property_id");
  const dup = await propriedadeJaFornecedora(db, prop.id);
  if (dup) return dup;

  try {
    const criado = await db.$transaction(async (tx) => {
      // O nome é a cópia do da propriedade: o do corpo é ignorado, e o resto do cadastro não vale aqui.
      const novo = await tx.emporioSupplier.create({
        data: scoped({
          kind: "propriedade" as const,
          property_id: prop.id,
          name: prop.name,
          notes: textoOuNulo(input.notes),
        }) as Prisma.EmporioSupplierUncheckedCreateInput,
      });
      await registrarNoHistorico(tx, ator, {
        action: "fornecedor.cadastrar",
        target_type: "fornecedor",
        target_id: novo.id,
        summary: `Cadastrou a propriedade ${novo.name} como fornecedor`,
      });
      return novo;
    });
    return ok(serializarFornecedor(criado));
  } catch (e) {
    if (ehUnico(e)) {
      const dup2 = await propriedadeJaFornecedora(db, prop.id);
      if (dup2) return dup2;
    }
    throw e;
  }
}

/**
 * Edita o fornecedor de fora (ausente mantém, nulo limpa; o resultado é conferido).
 * O de propriedade só muda `notes`: o nome é o da propriedade.
 */
export async function editarFornecedorAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: Partial<FornecedorInput>,
): Promise<ActionResult<FornecedorView>> {
  const neg = await exigir(db, ator, "chave:lancar_compra", "editar um fornecedor");
  if (neg) return neg;

  const atual = await db.emporioSupplier.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO();
  if (atual.archived_at) {
    return fail("VALIDATION_ERROR", "Esse fornecedor está arquivado: desarquive em Fornecedores antes de editar.", 422);
  }

  const guardado = serializarFornecedor(atual) as unknown as Record<string, string | null>;
  const entrada = input as unknown as Record<string, string | null | undefined>;
  const dados: Record<string, unknown> = {};
  let documento: string | null = null;

  if (atual.kind === "externo") {
    const mesclado: Record<string, string | null> = {};
    for (const k of CAMPOS) mesclado[k] = k in entrada ? (entrada[k] ?? null) : guardado[k];
    const conf = conferirCadastro(mesclado as CadastroDoContato);
    if (!conf.ok) return fail("VALIDATION_ERROR", conf.message, 422, conf.field);
    if (!conf.dados.name) return fail("VALIDATION_ERROR", "Informe o nome do fornecedor.", 422, "name");
    documento = conf.dados.document ?? null;
    if (documento) {
      const rep = await documentoRepetido(db, documento, id);
      if (rep) return rep;
    }
    Object.assign(dados, conf.dados);
  }
  if ("notes" in entrada) dados.notes = textoOuNulo(entrada.notes);

  try {
    const novo = await db.$transaction(async (tx) => {
      const r = await tx.emporioSupplier.update({ where: { id }, data: dados as Prisma.EmporioSupplierUncheckedUpdateInput });
      await registrarNoHistorico(tx, ator, {
        action: "fornecedor.editar",
        target_type: "fornecedor",
        target_id: id,
        summary: `Editou o fornecedor ${r.name}`,
        changes: diferencas(guardado, serializarFornecedor(r) as unknown as Record<string, unknown>, ROTULOS, PESSOAIS),
      });
      return r;
    });
    return ok(serializarFornecedor(novo));
  } catch (e) {
    if (documento && ehUnico(e)) {
      const rep = await documentoRepetido(db, documento, id);
      if (rep) return rep;
    }
    throw e;
  }
}

export async function arquivarFornecedorAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  arquivado: boolean,
): Promise<ActionResult<FornecedorView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "arquivar um fornecedor");
  if (neg) return neg;
  const atual = await db.emporioSupplier.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO();

  const novo = await db.$transaction(async (tx) => {
    const r = await tx.emporioSupplier.update({ where: { id }, data: { archived_at: arquivado ? new Date() : null } });
    await registrarNoHistorico(tx, ator, {
      action: arquivado ? "fornecedor.arquivar" : "fornecedor.desarquivar",
      target_type: "fornecedor",
      target_id: id,
      summary: `${arquivado ? "Arquivou" : "Desarquivou"} o fornecedor ${r.name}`,
    });
    return r;
  });
  return ok(serializarFornecedor(novo));
}

const POR_PAGINA_PADRAO = 50;
const POR_PAGINA_MAXIMO = 100;

export async function listarFornecedoresAction(
  db: TenantPrismaClient,
  ator: Ator,
  f: { q?: string; arquivados?: boolean; pagina?: number; por_pagina?: number },
): Promise<ActionResult<{ itens: FornecedorLinha[]; total: number; pagina: number; por_pagina: number; poucos_digitos: boolean }>> {
  const neg = await exigir(db, ator, "fora_do_caixa", "ver os fornecedores");
  if (neg) return neg;

  const porPagina = Math.min(POR_PAGINA_MAXIMO, Math.max(1, Math.floor(Number(f.por_pagina) || POR_PAGINA_PADRAO)));
  const pagina = paginaValida(f.pagina);
  const termo = lerTermo(f.q);
  if (termo.modo === "poucos_digitos") return ok({ itens: [], total: 0, pagina, por_pagina: porPagina, poucos_digitos: true });
  const where: Prisma.EmporioSupplierWhereInput = {
    ...(f.arquivados ? {} : { archived_at: null }),
    ...ondeBuscaFornecedor(termo),
  };
  const total = await db.emporioSupplier.count({ where });
  const linhas = await db.emporioSupplier.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (pagina - 1) * porPagina,
    take: porPagina,
  });
  const itens = linhas.map((s) => {
    const v = serializarFornecedor(s);
    return { id: v.id, kind: v.kind, name: v.name, document: v.document, phone: v.phone, archived: v.archived };
  });
  return ok({ itens, total, pagina, por_pagina: porPagina, poucos_digitos: false });
}

export type FornecedorEscolhido = Pick<FornecedorView, "id" | "kind" | "property_id" | "name" | "person_kind" | "document" | "phone">;
export type FornecedorDaBusca = FornecedorEscolhido & { ultima_compra: { em: string; valor: number } | null };

const BUSCA_POR_PAGINA_PADRAO = 20;
const BUSCA_POR_PAGINA_MAXIMO = 50;

/**
 * A busca da janela de Compra: ativos, por nome, CPF/CNPJ ou telefone, com a última compra de cada um
 * nas lojas do ator. Por `id`, ignora `q` e devolve 0 ou 1 ativo.
 */
export async function buscarFornecedoresAction(
  db: TenantPrismaClient,
  ator: Ator,
  f: { q?: string; id?: string; pagina?: number; por_pagina?: number },
): Promise<ActionResult<ResultadoDaBusca<FornecedorDaBusca>>> {
  const neg = await exigir(db, ator, "fora_do_caixa", "buscar um fornecedor");
  if (neg) return neg;

  const porPagina = Math.min(BUSCA_POR_PAGINA_MAXIMO, Math.max(1, Math.floor(Number(f.por_pagina) || BUSCA_POR_PAGINA_PADRAO)));
  const pagina = paginaValida(f.pagina);

  let linhas: EmporioSupplier[];
  let total: number;
  if (f.id) {
    linhas = await db.emporioSupplier.findMany({ where: { id: f.id, archived_at: null } });
    total = linhas.length;
  } else {
    const termo = lerTermo(f.q);
    if (termo.modo === "poucos_digitos") return ok({ itens: [], total: 0, pagina, por_pagina: porPagina, poucos_digitos: true });
    const where: Prisma.EmporioSupplierWhereInput = { archived_at: null, ...ondeBuscaFornecedor(termo) };
    total = await db.emporioSupplier.count({ where });
    linhas = await db.emporioSupplier.findMany({
      where,
      orderBy: [{ name_busca: "asc" }, { id: "asc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    });
  }

  const ultimas = await ultimaCompraDosFornecedores(db, ator, linhas.map((s) => s.id));
  const itens: FornecedorDaBusca[] = linhas.map((s) => ({
    id: s.id,
    kind: s.kind,
    property_id: s.property_id,
    name: s.name,
    person_kind: s.person_kind,
    document: s.document,
    phone: s.phone,
    ultima_compra: ultimas.get(s.id) ?? null,
  }));
  return ok({ itens, total, pagina: f.id ? 1 : pagina, por_pagina: porPagina, poucos_digitos: false });
}

/** A compra não cancelada mais recente de cada fornecedor nas lojas do ator: itens mais frete (a conta do total da compra). */
async function ultimaCompraDosFornecedores(
  db: TenantPrismaClient,
  ator: Ator,
  ids: string[],
): Promise<Map<string, { em: string; valor: number }>> {
  const resultado = new Map<string, { em: string; valor: number }>();
  if (ids.length === 0) return resultado;
  const visiveis = await lojasDoAtor(db, ator);
  const base = { canceled_at: null, ...(visiveis ? { establishment_id: { in: [...visiveis] } } : {}) };
  const maximas = await db.emporioPurchase.groupBy({
    by: ["supplier_id"],
    where: { supplier_id: { in: ids }, ...base },
    _max: { purchased_at: true },
  });
  const pares = maximas.flatMap((m: { supplier_id: string | null; _max: { purchased_at: Date | null } }) =>
    m.supplier_id && m._max.purchased_at ? [{ supplier_id: m.supplier_id, purchased_at: m._max.purchased_at }] : [],
  );
  if (pares.length === 0) return resultado;
  const compras = await db.emporioPurchase.findMany({
    where: { ...base, OR: pares },
    select: { supplier_id: true, purchased_at: true, freight: true, items: { select: { item_total: true } } },
    orderBy: { id: "desc" },
  });
  for (const c of compras) {
    if (c.supplier_id && !resultado.has(c.supplier_id)) {
      const itens = c.items.reduce((s, i) => s + Number(i.item_total), 0);
      resultado.set(c.supplier_id, { em: c.purchased_at.toISOString(), valor: Math.round((itens + Number(c.freight)) * 100) / 100 });
    }
  }
  return resultado;
}

export async function lerFornecedorAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<FornecedorView>> {
  const neg = await exigir(db, ator, "fora_do_caixa", "ver um fornecedor");
  if (neg) return neg;
  const s = await db.emporioSupplier.findFirst({ where: { id } });
  return s ? ok(serializarFornecedor(s)) : NAO_ACHADO();
}

/** As propriedades ativas que ainda não são fornecedor (o seletor do cadastro). */
export async function listarPropriedadesLivresAction(
  db: TenantPrismaClient,
  ator: Ator,
): Promise<ActionResult<{ id: string; name: string }[]>> {
  const neg = await exigir(db, ator, "fora_do_caixa", "ver as propriedades");
  if (neg) return neg;
  const usadas = await db.emporioSupplier.findMany({ where: { property_id: { not: null } }, select: { property_id: true } });
  const ids = usadas.map((u) => u.property_id as string);
  const props = await db.property.findMany({
    where: { archived_at: null, ...(ids.length ? { id: { notIn: ids } } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return ok(props);
}
