import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { hasMinRole } from "@/lib/permissions";
import { precoSugerido, percentualEfetivo } from "@/lib/emporio/preco";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Meu Empório, F1: estabelecimentos e catálogo (Módulo 39, Q50 a Q59).
 *
 * Nada aqui grava saldo nem custo calculado: lacrado/avulso efetivo, custo da
 * apresentação, percentuais efetivos e preço sugerido são sempre derivados na
 * leitura. A validação é em TypeScript puro de propósito: o agente do WhatsApp
 * chama estas mesmas funções sem passar pelo Zod da rota.
 */

export type Ator = { id: string; role: AppUserRole };

export const EMPORIO_BASE_UNITS = ["quilograma", "litro", "unidade"] as const;
export const ESTABLISHMENT_KINDS = ["central", "ponto_venda"] as const;
type BaseUnit = (typeof EMPORIO_BASE_UNITS)[number];
type Kind = (typeof ESTABLISHMENT_KINDS)[number];

function isBaseUnit(v: unknown): v is BaseUnit {
  return typeof v === "string" && (EMPORIO_BASE_UNITS as readonly string[]).includes(v);
}
function isKind(v: unknown): v is Kind {
  return typeof v === "string" && (ESTABLISHMENT_KINDS as readonly string[]).includes(v);
}

const NEGADO_ADMIN = () =>
  fail("FORBIDDEN", "Só o dono e o administrador podem fazer isso.", 403);
const NEGADO_OPERADOR = () =>
  fail("FORBIDDEN", "Seu perfil só permite consultar o Empório.", 403);
const NAO_ACHADO = (o: string) => fail("NOT_FOUND", `${o} não encontrado.`, 404);

const ehAdmin = (a: Ator) => hasMinRole(a.role, "ADMIN");
const ehOperador = (a: Ator) => hasMinRole(a.role, "OPERADOR");

function ehErroUnico(e: unknown): boolean {
  return (e as { code?: unknown })?.code === "P2002";
}

/** Percentual de 0 a 1000, ou nulo. Devolve a mensagem da recusa, ou null se vale. */
function recusaPct(v: unknown, rotulo: string): string | null {
  if (v == null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1000) {
    return `${rotulo} deve ficar entre 0 e 1000.`;
  }
  return null;
}

function recusaDinheiro(v: unknown, rotulo: string): string | null {
  if (v == null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    return `${rotulo} não pode ser negativo.`;
  }
  return null;
}

/** Lojas que o ator enxerga: null = todas (sem vínculo, Q8/Q56). */
export async function lojasDoAtor(db: TenantPrismaClient, ator: Ator): Promise<Set<string> | null> {
  const links = await db.userEstablishment.findMany({
    where: { user_id: ator.id },
    select: { establishment_id: true },
  });
  if (links.length === 0) return null;
  return new Set(links.map((l) => l.establishment_id));
}

// ---------------------------------------------------------------------------
// Estabelecimentos
// ---------------------------------------------------------------------------

export type EstablishmentView = {
  id: string;
  name: string;
  kind: string;
  address: string | null;
  city: string | null;
  responsible_user_id: string | null;
  allow_negative_stock: boolean;
  max_discount_pct: number | null;
  default_expense_pct: number | null;
  default_profit_pct: number | null;
  archived_at: string | null;
  user_ids: string[];
};

type EstablishmentRow = {
  id: string;
  name: string;
  kind: string;
  address: string | null;
  city: string | null;
  responsible_user_id: string | null;
  allow_negative_stock: boolean;
  max_discount_pct: unknown;
  default_expense_pct: unknown;
  default_profit_pct: unknown;
  archived_at: Date | null;
  user_links: { user_id: string }[];
};

function viewEstabelecimento(e: EstablishmentRow): EstablishmentView {
  return {
    id: e.id,
    name: e.name,
    kind: e.kind,
    address: e.address,
    city: e.city,
    responsible_user_id: e.responsible_user_id,
    allow_negative_stock: e.allow_negative_stock,
    max_discount_pct: decToNum(e.max_discount_pct),
    default_expense_pct: decToNum(e.default_expense_pct),
    default_profit_pct: decToNum(e.default_profit_pct),
    archived_at: isoOrNull(e.archived_at),
    user_ids: e.user_links.map((l) => l.user_id),
  };
}

const INCLUDE_LOJA = { user_links: { select: { user_id: true } } } as const;

export async function listarEstabelecimentosAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { incluir_arquivados?: boolean } = {},
): Promise<ActionResult<EstablishmentView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  const linhas = await db.establishment.findMany({
    where: {
      ...(opts.incluir_arquivados ? {} : { archived_at: null }),
      ...(visiveis ? { id: { in: [...visiveis] } } : {}),
    },
    include: INCLUDE_LOJA,
    orderBy: { name: "asc" },
  });
  return ok(linhas.map(viewEstabelecimento));
}

export async function lerEstabelecimentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<EstablishmentView>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (visiveis && !visiveis.has(id)) return NAO_ACHADO("Estabelecimento");
  const e = await db.establishment.findFirst({ where: { id }, include: INCLUDE_LOJA });
  if (!e) return NAO_ACHADO("Estabelecimento");
  return ok(viewEstabelecimento(e));
}

export type EstablishmentInput = {
  name?: string;
  kind?: string;
  address?: string | null;
  city?: string | null;
  responsible_user_id?: string | null;
  allow_negative_stock?: boolean;
  max_discount_pct?: number | null;
  default_expense_pct?: number | null;
  default_profit_pct?: number | null;
};

/** Validação comum à criação e à edição; só olha o que veio (`undefined` = não mexe). */
async function validarLoja(
  db: TenantPrismaClient,
  input: EstablishmentInput,
  selfId: string | null,
): Promise<ActionResult<{ name?: string }>> {
  let nome: string | undefined;
  if (input.name !== undefined) {
    nome = String(input.name ?? "").trim();
    if (!nome) return fail("VALIDATION_ERROR", "Informe o nome do estabelecimento.", 422, "name");
    const igual = await db.establishment.findFirst({
      where: { name: { equals: nome, mode: "insensitive" }, ...(selfId ? { NOT: { id: selfId } } : {}) },
    });
    if (igual) {
      return fail("DUPLICATE_NAME", `Já existe um estabelecimento chamado "${igual.name}".`, 409, "name");
    }
  }
  if (input.kind !== undefined && !isKind(input.kind)) {
    return fail("VALIDATION_ERROR", "Escolha o tipo: central ou ponto de venda.", 422, "kind");
  }
  const descMax = input.max_discount_pct;
  if (descMax != null && (typeof descMax !== "number" || !Number.isFinite(descMax) || descMax < 0 || descMax > 100)) {
    return fail("VALIDATION_ERROR", "O desconto máximo deve ficar entre 0 e 100.", 422, "max_discount_pct");
  }
  const rd = recusaPct(input.default_expense_pct, "O percentual de despesas");
  if (rd) return fail("VALIDATION_ERROR", rd, 422, "default_expense_pct");
  const rl = recusaPct(input.default_profit_pct, "O percentual de lucro");
  if (rl) return fail("VALIDATION_ERROR", rl, 422, "default_profit_pct");
  if (input.responsible_user_id) {
    const u = await db.user.findFirst({ where: { id: input.responsible_user_id, active: true } });
    if (!u) return fail("VALIDATION_ERROR", "Responsável inválido.", 422, "responsible_user_id");
  }
  return ok({ name: nome });
}

export async function criarEstabelecimentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: EstablishmentInput,
): Promise<ActionResult<EstablishmentView>> {
  if (!ehAdmin(ator)) return NEGADO_ADMIN();
  if (input.name === undefined) return fail("VALIDATION_ERROR", "Informe o nome do estabelecimento.", 422, "name");
  if (input.kind === undefined) return fail("VALIDATION_ERROR", "Escolha o tipo: central ou ponto de venda.", 422, "kind");
  const v = await validarLoja(db, input, null);
  if (!v.ok) return v;

  try {
    const e = await db.establishment.create({
      data: scoped({
        name: v.data.name as string,
        kind: input.kind as Kind,
        address: input.address?.trim() || null,
        city: input.city?.trim() || null,
        responsible_user_id: input.responsible_user_id ?? null,
        allow_negative_stock: input.allow_negative_stock ?? false,
        max_discount_pct: input.max_discount_pct ?? null,
        default_expense_pct: input.default_expense_pct ?? null,
        default_profit_pct: input.default_profit_pct ?? null,
      }),
      include: INCLUDE_LOJA,
    });
    return ok(viewEstabelecimento(e));
  } catch (err) {
    if (ehErroUnico(err)) return fail("DUPLICATE_NAME", "Já existe um estabelecimento com esse nome.", 409, "name");
    throw err;
  }
}

export async function editarEstabelecimentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: EstablishmentInput,
): Promise<ActionResult<EstablishmentView>> {
  if (!ehAdmin(ator)) return NEGADO_ADMIN();
  const visiveis = await lojasDoAtor(db, ator);
  if (visiveis && !visiveis.has(id)) return NAO_ACHADO("Estabelecimento");
  const atual = await db.establishment.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO("Estabelecimento");

  const v = await validarLoja(db, input, id);
  if (!v.ok) return v;

  try {
    const e = await db.establishment.update({
      where: { id },
      data: {
        ...(v.data.name !== undefined ? { name: v.data.name } : {}),
        ...(input.kind !== undefined ? { kind: input.kind as Kind } : {}),
        ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
        ...(input.city !== undefined ? { city: input.city?.trim() || null } : {}),
        ...(input.responsible_user_id !== undefined ? { responsible_user_id: input.responsible_user_id } : {}),
        ...(input.allow_negative_stock !== undefined ? { allow_negative_stock: input.allow_negative_stock } : {}),
        ...(input.max_discount_pct !== undefined ? { max_discount_pct: input.max_discount_pct } : {}),
        ...(input.default_expense_pct !== undefined ? { default_expense_pct: input.default_expense_pct } : {}),
        ...(input.default_profit_pct !== undefined ? { default_profit_pct: input.default_profit_pct } : {}),
      },
      include: INCLUDE_LOJA,
    });
    return ok(viewEstabelecimento(e));
  } catch (err) {
    if (ehErroUnico(err)) return fail("DUPLICATE_NAME", "Já existe um estabelecimento com esse nome.", 409, "name");
    throw err;
  }
}

export async function arquivarEstabelecimentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  archived: boolean,
): Promise<ActionResult<EstablishmentView>> {
  if (!ehAdmin(ator)) return NEGADO_ADMIN();
  if (typeof archived !== "boolean") {
    return fail("VALIDATION_ERROR", "Informe se é para arquivar ou desarquivar.", 422, "archived");
  }
  const visiveis = await lojasDoAtor(db, ator);
  if (visiveis && !visiveis.has(id)) return NAO_ACHADO("Estabelecimento");
  const atual = await db.establishment.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO("Estabelecimento");
  const e = await db.establishment.update({
    where: { id },
    data: { archived_at: archived ? (atual.archived_at ?? new Date()) : null },
    include: INCLUDE_LOJA,
  });
  return ok(viewEstabelecimento(e));
}

export async function definirVinculosAction(
  db: TenantPrismaClient,
  ator: Ator,
  establishment_id: string,
  user_ids: string[],
): Promise<ActionResult<EstablishmentView>> {
  if (!ehAdmin(ator)) return NEGADO_ADMIN();
  if (!Array.isArray(user_ids) || user_ids.some((u) => typeof u !== "string")) {
    return fail("VALIDATION_ERROR", "Informe a lista de usuários.", 422, "user_ids");
  }
  const visiveis = await lojasDoAtor(db, ator);
  if (visiveis && !visiveis.has(establishment_id)) return NAO_ACHADO("Estabelecimento");
  const loja = await db.establishment.findFirst({ where: { id: establishment_id } });
  if (!loja) return NAO_ACHADO("Estabelecimento");

  const unicos = [...new Set(user_ids)];
  if (unicos.length > 0) {
    const validos = await db.user.findMany({
      where: { id: { in: unicos }, active: true },
      select: { id: true },
    });
    if (validos.length !== unicos.length) {
      return fail("VALIDATION_ERROR", "Algum usuário da lista não existe ou está inativo.", 422, "user_ids");
    }
  }

  await db.$transaction(async (tx) => {
    await tx.userEstablishment.deleteMany({ where: { establishment_id } });
    if (unicos.length > 0) {
      await tx.userEstablishment.createMany({
        data: unicos.map((user_id) => scoped({ user_id, establishment_id })),
      });
    }
  });

  const e = await db.establishment.findFirst({ where: { id: establishment_id }, include: INCLUDE_LOJA });
  if (!e) return NAO_ACHADO("Estabelecimento");
  return ok(viewEstabelecimento(e));
}

// ---------------------------------------------------------------------------
// Produtos do Empório
// ---------------------------------------------------------------------------

export type PresentationView = {
  id: string;
  name: string;
  base_qty: number;
  is_sealed_package: boolean;
  archived_at: string | null;
};

export type PriceRowView = {
  establishment_id: string;
  establishment_name: string;
  presentation_id: string;
  price: number | null;
  cost: number | null;
  expense_pct: number | null;
  profit_pct: number | null;
  expense_pct_efetivo: number;
  profit_pct_efetivo: number;
  suggested_price: number | null;
};

export type EmporioProductView = {
  id: string;
  product_id: string;
  name: string;
  category_id: string;
  category_name: string;
  brand: string | null;
  base_unit: string;
  created_in_emporio: boolean;
  reference_cost: number | null;
  track_sealed: boolean | null;
  track_sealed_efetivo: boolean;
  track_lot: boolean;
  track_expiry: boolean;
  expense_pct: number | null;
  profit_pct: number | null;
  archived_at: string | null;
};

export type EmporioProductDetail = EmporioProductView & {
  presentations: PresentationView[];
  prices: PriceRowView[];
};

export type ProdutoRow = {
  id: string;
  product_id: string;
  base_unit: string;
  created_in_emporio: boolean;
  reference_cost: unknown;
  track_sealed: boolean | null;
  track_lot: boolean;
  track_expiry: boolean;
  expense_pct: unknown;
  profit_pct: unknown;
  archived_at: Date | null;
  product: { name: string; brand: string | null; category_id: string; category: { name: string } };
  presentations: { id: string; name: string; base_qty: unknown; is_sealed_package: boolean; archived_at: Date | null }[];
};

export const INCLUDE_PRODUTO = {
  product: { include: { category: true } },
  presentations: { orderBy: { name: "asc" } },
} as const;

/** Q57: escolha explícita vale; senão, ligado quando há fechada E não fechada ativas. */
export function lacradoEfetivo(p: Pick<ProdutoRow, "track_sealed" | "presentations">): boolean {
  if (p.track_sealed != null) return p.track_sealed;
  const ativas = p.presentations.filter((x) => !x.archived_at);
  return ativas.some((x) => x.is_sealed_package) && ativas.some((x) => !x.is_sealed_package);
}

function viewProduto(p: ProdutoRow): EmporioProductView {
  return {
    id: p.id,
    product_id: p.product_id,
    name: p.product.name,
    category_id: p.product.category_id,
    category_name: p.product.category.name,
    brand: p.product.brand,
    base_unit: p.base_unit,
    created_in_emporio: p.created_in_emporio,
    reference_cost: decToNum(p.reference_cost),
    track_sealed: p.track_sealed,
    track_sealed_efetivo: lacradoEfetivo(p),
    track_lot: p.track_lot,
    track_expiry: p.track_expiry,
    expense_pct: decToNum(p.expense_pct),
    profit_pct: decToNum(p.profit_pct),
    archived_at: isoOrNull(p.archived_at),
  };
}

export async function listarProdutosEmporioAction(
  db: TenantPrismaClient,
  _ator: Ator,
  opts: { incluir_arquivados?: boolean } = {},
): Promise<ActionResult<EmporioProductView[]>> {
  const linhas = await db.emporioProduct.findMany({
    where: opts.incluir_arquivados ? {} : { archived_at: null },
    include: INCLUDE_PRODUTO,
  });
  const views = linhas.map(viewProduto);
  views.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return ok(views);
}

export type CandidatoView = {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  brand: string | null;
  unit: string;
};

export async function listarCandidatosAction(
  db: TenantPrismaClient,
  _ator: Ator,
): Promise<ActionResult<CandidatoView[]>> {
  const produtos = await db.product.findMany({
    where: { archived_at: null, emporio: { is: null } },
    include: { category: true },
    orderBy: { name: "asc" },
  });
  return ok(
    produtos.map((p) => ({
      id: p.id,
      name: p.name,
      category_id: p.category_id,
      category_name: p.category.name,
      brand: p.brand,
      unit: p.unit,
    })),
  );
}

export async function lerProdutoEmporioAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<EmporioProductDetail>> {
  const p = await db.emporioProduct.findFirst({ where: { id }, include: INCLUDE_PRODUTO });
  if (!p) return NAO_ACHADO("Produto");

  const visiveis = await lojasDoAtor(db, ator);
  const lojas = await db.establishment.findMany({
    where: {
      archived_at: null,
      ...(visiveis ? { id: { in: [...visiveis] } } : {}),
    },
    orderBy: { name: "asc" },
  });
  const ativas = p.presentations.filter((x) => !x.archived_at);
  const precos = ativas.length
    ? await db.presentationPrice.findMany({
        where: { presentation_id: { in: ativas.map((x) => x.id) } },
      })
    : [];
  const porPar = new Map(precos.map((x) => [`${x.establishment_id}:${x.presentation_id}`, x]));

  const custoRef = decToNum(p.reference_cost);
  const pctProdutoDesp = decToNum(p.expense_pct);
  const pctProdutoLucro = decToNum(p.profit_pct);

  const prices: PriceRowView[] = [];
  for (const loja of lojas) {
    for (const ap of ativas) {
      const linha = porPar.get(`${loja.id}:${ap.id}`);
      const custo =
        custoRef == null ? null : Math.round(custoRef * (decToNum(ap.base_qty) ?? 0) * 10000) / 10000;
      const exDesp = decToNum(linha?.expense_pct);
      const exLucro = decToNum(linha?.profit_pct);
      const desp = percentualEfetivo(exDesp, pctProdutoDesp, decToNum(loja.default_expense_pct));
      const lucro = percentualEfetivo(exLucro, pctProdutoLucro, decToNum(loja.default_profit_pct));
      prices.push({
        establishment_id: loja.id,
        establishment_name: loja.name,
        presentation_id: ap.id,
        price: decToNum(linha?.price),
        cost: custo,
        expense_pct: exDesp,
        profit_pct: exLucro,
        expense_pct_efetivo: desp,
        profit_pct_efetivo: lucro,
        suggested_price: precoSugerido(custo, desp, lucro),
      });
    }
  }

  return ok({
    ...viewProduto(p),
    presentations: p.presentations.map(viewApresentacao),
    prices,
  });
}

function viewApresentacao(a: ProdutoRow["presentations"][number]): PresentationView {
  return {
    id: a.id,
    name: a.name,
    base_qty: decToNum(a.base_qty) ?? 0,
    is_sealed_package: a.is_sealed_package,
    archived_at: isoOrNull(a.archived_at),
  };
}

export type CriarProdutoEmporioInput = {
  product_id?: string;
  name?: string;
  category_id?: string;
  brand?: string | null;
  base_unit?: string;
  reference_cost?: number | null;
};

export async function criarProdutoEmporioAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: CriarProdutoEmporioInput,
): Promise<ActionResult<EmporioProductDetail>> {
  if (!ehOperador(ator)) return NEGADO_OPERADOR();
  if (!isBaseUnit(input.base_unit)) {
    return fail("VALIDATION_ERROR", "Escolha a unidade-base: quilograma, litro ou unidade.", 422, "base_unit");
  }
  const rc = recusaDinheiro(input.reference_cost, "O custo");
  if (rc) return fail("VALIDATION_ERROR", rc, 422, "reference_cost");

  const baseUnit = input.base_unit;
  let novoId: string;

  if (input.product_id) {
    const produto = await db.product.findFirst({ where: { id: input.product_id }, include: { emporio: true } });
    if (!produto) return NAO_ACHADO("Produto");
    if (produto.emporio) {
      return fail("ALREADY_IN_EMPORIO", "Esse produto já está no Empório.", 409);
    }
    if (produto.archived_at) {
      return fail("VALIDATION_ERROR", "Esse produto está arquivado.", 422, "product_id");
    }
    try {
      const ep = await db.emporioProduct.create({
        data: scoped({
          product_id: produto.id,
          base_unit: baseUnit,
          created_in_emporio: false,
          reference_cost: input.reference_cost ?? null,
          created_by_user_id: ator.id,
          updated_by_user_id: ator.id,
        }),
      });
      novoId = ep.id;
    } catch (err) {
      if (ehErroUnico(err)) return fail("ALREADY_IN_EMPORIO", "Esse produto já está no Empório.", 409);
      throw err;
    }
  } else {
    const nome = String(input.name ?? "").trim();
    if (!nome) return fail("VALIDATION_ERROR", "Informe o nome do produto.", 422, "name");
    if (!input.category_id) return fail("VALIDATION_ERROR", "Escolha a categoria.", 422, "category_id");
    const categoria = await db.productCategory.findFirst({ where: { id: input.category_id } });
    if (!categoria) return fail("INVALID_CATEGORY", "Categoria inválida.", 422, "category_id");

    const igual = await db.product.findFirst({ where: { name: { equals: nome, mode: "insensitive" } } });
    if (igual) return fail("DUPLICATE_NAME", mensagemProdutoRepetido(igual.name), 409, "name");

    try {
      novoId = await db.$transaction(async (tx) => {
        const produto = await tx.product.create({
          data: scoped({
            name: nome,
            category_id: categoria.id,
            unit: baseUnit,
            brand: input.brand?.trim() || null,
          }),
        });
        const ep = await tx.emporioProduct.create({
          data: scoped({
            product_id: produto.id,
            base_unit: baseUnit,
            created_in_emporio: true,
            reference_cost: input.reference_cost ?? null,
            created_by_user_id: ator.id,
            updated_by_user_id: ator.id,
          }),
        });
        return ep.id;
      });
    } catch (err) {
      if (ehErroUnico(err)) return fail("DUPLICATE_NAME", mensagemProdutoRepetido(nome), 409, "name");
      throw err;
    }
  }

  return lerProdutoEmporioAction(db, ator, novoId);
}

function mensagemProdutoRepetido(nome: string): string {
  return `Já existe um produto chamado "${nome}". Use o existente pelo "usar no Empório".`;
}

export type EditarProdutoEmporioInput = {
  brand?: string | null;
  reference_cost?: number | null;
  track_sealed?: boolean | null;
  track_lot?: boolean;
  track_expiry?: boolean;
  expense_pct?: number | null;
  profit_pct?: number | null;
};

export async function editarProdutoEmporioAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: EditarProdutoEmporioInput,
): Promise<ActionResult<EmporioProductDetail>> {
  if (!ehOperador(ator)) return NEGADO_OPERADOR();
  if ((input.expense_pct !== undefined || input.profit_pct !== undefined) && !ehAdmin(ator)) {
    return NEGADO_ADMIN();
  }
  const atual = await db.emporioProduct.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO("Produto");

  const rc = recusaDinheiro(input.reference_cost, "O custo");
  if (rc) return fail("VALIDATION_ERROR", rc, 422, "reference_cost");
  const rd = recusaPct(input.expense_pct, "O percentual de despesas");
  if (rd) return fail("VALIDATION_ERROR", rd, 422, "expense_pct");
  const rl = recusaPct(input.profit_pct, "O percentual de lucro");
  if (rl) return fail("VALIDATION_ERROR", rl, 422, "profit_pct");
  if (input.track_sealed != null && typeof input.track_sealed !== "boolean") {
    return fail("VALIDATION_ERROR", "Informe sim, não ou automático.", 422, "track_sealed");
  }

  await db.$transaction(async (tx) => {
    if (input.brand !== undefined) {
      await tx.product.update({ where: { id: atual.product_id }, data: { brand: input.brand?.trim() || null } });
    }
    await tx.emporioProduct.update({
      where: { id },
      data: {
        updated_by_user_id: ator.id,
        ...(input.reference_cost !== undefined ? { reference_cost: input.reference_cost } : {}),
        ...(input.track_sealed !== undefined ? { track_sealed: input.track_sealed } : {}),
        ...(input.track_lot !== undefined ? { track_lot: input.track_lot } : {}),
        ...(input.track_expiry !== undefined ? { track_expiry: input.track_expiry } : {}),
        ...(input.expense_pct !== undefined ? { expense_pct: input.expense_pct } : {}),
        ...(input.profit_pct !== undefined ? { profit_pct: input.profit_pct } : {}),
      },
    });
  });
  return lerProdutoEmporioAction(db, ator, id);
}

export async function arquivarProdutoEmporioAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  archived: boolean,
): Promise<ActionResult<EmporioProductDetail>> {
  if (!ehOperador(ator)) return NEGADO_OPERADOR();
  if (typeof archived !== "boolean") {
    return fail("VALIDATION_ERROR", "Informe se é para arquivar ou desarquivar.", 422, "archived");
  }
  const atual = await db.emporioProduct.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO("Produto");
  await db.emporioProduct.update({
    where: { id },
    data: { archived_at: archived ? (atual.archived_at ?? new Date()) : null, updated_by_user_id: ator.id },
  });
  return lerProdutoEmporioAction(db, ator, id);
}

// ---------------------------------------------------------------------------
// Apresentações
// ---------------------------------------------------------------------------

export type ApresentacaoInput = {
  name?: string;
  base_qty?: number;
  is_sealed_package?: boolean;
};

function recusaBaseQty(qty: unknown, baseUnit: string): string | null {
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) {
    return "A quantidade na unidade-base deve ser maior que zero.";
  }
  if (baseUnit === "unidade" && !Number.isInteger(qty)) {
    return "Para produto vendido por unidade, a quantidade deve ser inteira.";
  }
  return null;
}

export async function criarApresentacaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  emporio_product_id: string,
  input: ApresentacaoInput,
): Promise<ActionResult<PresentationView>> {
  if (!ehOperador(ator)) return NEGADO_OPERADOR();
  const p = await db.emporioProduct.findFirst({ where: { id: emporio_product_id } });
  if (!p) return NAO_ACHADO("Produto");

  const nome = String(input.name ?? "").trim();
  if (!nome) return fail("VALIDATION_ERROR", "Informe o nome da apresentação.", 422, "name");
  const rq = recusaBaseQty(input.base_qty, p.base_unit);
  if (rq) return fail("VALIDATION_ERROR", rq, 422, "base_qty");

  const igual = await db.productPresentation.findFirst({
    where: { emporio_product_id, name: { equals: nome, mode: "insensitive" } },
  });
  if (igual) return fail("DUPLICATE_NAME", `Esse produto já tem a apresentação "${igual.name}".`, 409, "name");

  try {
    const a = await db.productPresentation.create({
      data: scoped({
        emporio_product_id,
        name: nome,
        base_qty: input.base_qty as number,
        is_sealed_package: input.is_sealed_package ?? false,
        created_by_user_id: ator.id,
        updated_by_user_id: ator.id,
      }),
    });
    return ok(viewApresentacao(a));
  } catch (err) {
    if (ehErroUnico(err)) return fail("DUPLICATE_NAME", `Esse produto já tem a apresentação "${nome}".`, 409, "name");
    throw err;
  }
}

export async function editarApresentacaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: ApresentacaoInput,
): Promise<ActionResult<PresentationView>> {
  if (!ehOperador(ator)) return NEGADO_OPERADOR();
  const atual = await db.productPresentation.findFirst({ where: { id }, include: { emporio_product: true } });
  if (!atual) return NAO_ACHADO("Apresentação");

  let nome: string | undefined;
  if (input.name !== undefined) {
    nome = String(input.name ?? "").trim();
    if (!nome) return fail("VALIDATION_ERROR", "Informe o nome da apresentação.", 422, "name");
    const igual = await db.productPresentation.findFirst({
      where: { emporio_product_id: atual.emporio_product_id, name: { equals: nome, mode: "insensitive" }, NOT: { id } },
    });
    if (igual) return fail("DUPLICATE_NAME", `Esse produto já tem a apresentação "${igual.name}".`, 409, "name");
  }
  if (input.base_qty !== undefined) {
    const rq = recusaBaseQty(input.base_qty, atual.emporio_product.base_unit);
    if (rq) return fail("VALIDATION_ERROR", rq, 422, "base_qty");
  }

  try {
    const a = await db.productPresentation.update({
      where: { id },
      data: {
        updated_by_user_id: ator.id,
        ...(nome !== undefined ? { name: nome } : {}),
        ...(input.base_qty !== undefined ? { base_qty: input.base_qty } : {}),
        ...(input.is_sealed_package !== undefined ? { is_sealed_package: input.is_sealed_package } : {}),
      },
    });
    return ok(viewApresentacao(a));
  } catch (err) {
    if (ehErroUnico(err)) return fail("DUPLICATE_NAME", "Esse produto já tem uma apresentação com esse nome.", 409, "name");
    throw err;
  }
}

export async function arquivarApresentacaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  archived: boolean,
): Promise<ActionResult<PresentationView>> {
  if (!ehOperador(ator)) return NEGADO_OPERADOR();
  if (typeof archived !== "boolean") {
    return fail("VALIDATION_ERROR", "Informe se é para arquivar ou desarquivar.", 422, "archived");
  }
  const atual = await db.productPresentation.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO("Apresentação");
  const a = await db.productPresentation.update({
    where: { id },
    data: { archived_at: archived ? (atual.archived_at ?? new Date()) : null, updated_by_user_id: ator.id },
  });
  return ok(viewApresentacao(a));
}

// ---------------------------------------------------------------------------
// Preço por loja e apresentação
// ---------------------------------------------------------------------------

export type DefinirPrecoInput = {
  establishment_id: string;
  presentation_id: string;
  price?: number | null;
  expense_pct?: number | null;
  profit_pct?: number | null;
};

export type PrecoView = {
  establishment_id: string;
  presentation_id: string;
  price: number | null;
  expense_pct: number | null;
  profit_pct: number | null;
};

export async function definirPrecoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: DefinirPrecoInput,
): Promise<ActionResult<PrecoView>> {
  if (!ehAdmin(ator)) return NEGADO_ADMIN();

  const rp = recusaDinheiro(input.price, "O preço");
  if (rp) return fail("VALIDATION_ERROR", rp, 422, "price");
  const rd = recusaPct(input.expense_pct, "O percentual de despesas");
  if (rd) return fail("VALIDATION_ERROR", rd, 422, "expense_pct");
  const rl = recusaPct(input.profit_pct, "O percentual de lucro");
  if (rl) return fail("VALIDATION_ERROR", rl, 422, "profit_pct");

  const visiveis = await lojasDoAtor(db, ator);
  if (visiveis && !visiveis.has(input.establishment_id)) return NAO_ACHADO("Estabelecimento");
  const loja = await db.establishment.findFirst({ where: { id: input.establishment_id } });
  if (!loja) return NAO_ACHADO("Estabelecimento");
  const ap = await db.productPresentation.findFirst({ where: { id: input.presentation_id } });
  if (!ap) return NAO_ACHADO("Apresentação");

  const valores = {
    price: input.price ?? null,
    expense_pct: input.expense_pct ?? null,
    profit_pct: input.profit_pct ?? null,
    updated_by_user_id: ator.id,
  };
  const linha = await db.presentationPrice.upsert({
    where: {
      establishment_id_presentation_id: {
        establishment_id: input.establishment_id,
        presentation_id: input.presentation_id,
      },
    },
    create: scoped({
      establishment_id: input.establishment_id,
      presentation_id: input.presentation_id,
      ...valores,
    }),
    update: valores,
  });
  return ok({
    establishment_id: linha.establishment_id,
    presentation_id: linha.presentation_id,
    price: decToNum(linha.price),
    expense_pct: decToNum(linha.expense_pct),
    profit_pct: decToNum(linha.profit_pct),
  });
}
