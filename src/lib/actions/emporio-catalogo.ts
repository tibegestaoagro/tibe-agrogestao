import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { alcanceDeLeitura, exigir, lojasDoPapel, papelDoEmporio } from "@/lib/emporio/papel";
import { precoSugerido, percentualEfetivo } from "@/lib/emporio/preco";
import { findUnit } from "@/lib/stock/units";
import { diferencas, dinheiro, registrarNoHistorico } from "@/lib/emporio/historico";
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

export const EMPORIO_BASE_UNITS = ["quilograma", "litro", "unidade", "saca", "fardo"] as const;
type BaseUnit = (typeof EMPORIO_BASE_UNITS)[number];

function isBaseUnit(v: unknown): v is BaseUnit {
  return typeof v === "string" && (EMPORIO_BASE_UNITS as readonly string[]).includes(v);
}

/** Q124: espécies atendidas, lista fixa. O rótulo é o que a tela mostra. */
export const EMPORIO_SPECIES = [
  { id: "cao", label: "Cão" },
  { id: "gato", label: "Gato" },
  { id: "bovino", label: "Bovino" },
  { id: "equino", label: "Equino" },
  { id: "ovino_caprino", label: "Ovino e caprino" },
  { id: "suino", label: "Suíno" },
  { id: "aves", label: "Aves" },
  { id: "peixes", label: "Peixes" },
  { id: "outros", label: "Outros" },
] as const;
export const EMPORIO_SPECIES_LABELS: Record<string, string> = Object.fromEntries(
  EMPORIO_SPECIES.map((e) => [e.id, e.label]),
);

/** Minúsculas e sem acento, para a busca do catálogo. */
export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const NAO_ACHADO = (o: string) => fail("NOT_FOUND", `${o} não encontrado.`, 404);

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

/**
 * Lojas que o ator enxerga: null = todas (Dono e Gerente geral, Q118). Gestor
 * e Vendedor veem só as deles; quem não tem função no Empório não vê nenhuma.
 */
export async function lojasDoAtor(db: TenantPrismaClient, ator: Ator): Promise<Set<string> | null> {
  return lojasDoPapel(await papelDoEmporio(db, ator));
}

/** Q128: como `lojasDoAtor`, mas o Gestor lê o ESTOQUE de qualquer loja. */
export async function lojasDeEstoque(db: TenantPrismaClient, ator: Ator): Promise<Set<string> | null> {
  return alcanceDeLeitura(await papelDoEmporio(db, ator));
}

// ---------------------------------------------------------------------------
// Estabelecimentos
// ---------------------------------------------------------------------------

export type EstablishmentView = {
  id: string;
  name: string;
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

/** `kind` (Q121) não existe mais: se vier no corpo, ninguém lê. */
export type EstablishmentInput = {
  name?: string;
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

const ROTULOS_LOJA: Record<string, string> = {
  name: "Nome",
  address: "Endereço",
  city: "Cidade",
  responsible_user_id: "Responsável",
  allow_negative_stock: "Estoque negativo liberado",
  max_discount_pct: "Desconto máximo (%)",
  default_expense_pct: "Despesas padrão (%)",
  default_profit_pct: "Lucro padrão (%)",
};

function pegarLoja(e: {
  name: string;
  address: string | null;
  city: string | null;
  responsible_user_id: string | null;
  allow_negative_stock: boolean;
  max_discount_pct: unknown;
  default_expense_pct: unknown;
  default_profit_pct: unknown;
}): Record<string, unknown> {
  return {
    name: e.name,
    address: e.address,
    city: e.city,
    responsible_user_id: e.responsible_user_id,
    allow_negative_stock: e.allow_negative_stock,
    max_discount_pct: decToNum(e.max_discount_pct as never),
    default_expense_pct: decToNum(e.default_expense_pct as never),
    default_profit_pct: decToNum(e.default_profit_pct as never),
  };
}

export async function criarEstabelecimentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: EstablishmentInput,
): Promise<ActionResult<EstablishmentView>> {
  const neg = await exigir(db, ator, "conta", "criar um estabelecimento");
  if (neg) return neg;
  if (input.name === undefined) return fail("VALIDATION_ERROR", "Informe o nome do estabelecimento.", 422, "name");
  const v = await validarLoja(db, input, null);
  if (!v.ok) return v;

  try {
    const e = await db.$transaction(async (tx) => {
      const criada = await tx.establishment.create({
        data: scoped({
          name: v.data.name as string,
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
      await registrarNoHistorico(tx, ator, {
        action: "estabelecimento.criar",
        establishment_id: criada.id,
        target_type: "estabelecimento",
        target_id: criada.id,
        summary: `Criou o estabelecimento ${criada.name}`,
      });
      return criada;
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
  const neg = await exigir(db, ator, "gestor_da_loja", "editar os dados da loja");
  if (neg) return neg;
  if (input.allow_negative_stock !== undefined) {
    const negConta = await exigir(db, ator, "conta", "liberar o estoque negativo");
    if (negConta) return negConta;
  }
  const visiveis = await lojasDoAtor(db, ator);
  if (visiveis && !visiveis.has(id)) return NAO_ACHADO("Estabelecimento");
  const atual = await db.establishment.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO("Estabelecimento");

  const v = await validarLoja(db, input, id);
  if (!v.ok) return v;

  try {
    const e = await db.$transaction(async (tx) => {
    const atualizada = await tx.establishment.update({
      where: { id },
      data: {
        ...(v.data.name !== undefined ? { name: v.data.name } : {}),
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
    const mudancas = diferencas(
      pegarLoja(atual),
      pegarLoja(atualizada),
      ROTULOS_LOJA,
      { allow_negative_stock: (x) => (x ? "Sim" : "Não") },
    );
    if (mudancas.length > 0) {
      await registrarNoHistorico(tx, ator, {
        action: "estabelecimento.editar",
        establishment_id: id,
        target_type: "estabelecimento",
        target_id: id,
        summary: `Editou os dados da ${atualizada.name}`,
        changes: mudancas,
      });
    }
    return atualizada;
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
  const neg = await exigir(db, ator, "conta", "arquivar um estabelecimento");
  if (neg) return neg;
  if (typeof archived !== "boolean") {
    return fail("VALIDATION_ERROR", "Informe se é para arquivar ou desarquivar.", 422, "archived");
  }
  const visiveis = await lojasDoAtor(db, ator);
  if (visiveis && !visiveis.has(id)) return NAO_ACHADO("Estabelecimento");
  const atual = await db.establishment.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO("Estabelecimento");
  const e = await db.$transaction(async (tx) => {
    const atualizada = await tx.establishment.update({
      where: { id },
      data: { archived_at: archived ? (atual.archived_at ?? new Date()) : null },
      include: INCLUDE_LOJA,
    });
    await registrarNoHistorico(tx, ator, {
      action: "estabelecimento.arquivar",
      establishment_id: id,
      target_type: "estabelecimento",
      target_id: id,
      summary: `${archived ? "Arquivou" : "Reativou"} o estabelecimento ${atual.name}`,
    });
    return atualizada;
  });
  return ok(viewEstabelecimento(e));
}

export async function definirVinculosAction(
  db: TenantPrismaClient,
  ator: Ator,
  establishment_id: string,
  user_ids: string[],
): Promise<ActionResult<EstablishmentView>> {
  const neg = await exigir(db, ator, "conta", "definir quem trabalha na loja");
  if (neg) return neg;
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

  const nomesDe = async (ids: string[]) =>
    (await db.user.findMany({ where: { id: { in: ids } }, select: { name: true }, orderBy: { name: "asc" } })).map(
      (u) => u.name,
    );
  const antesIds = (await db.userEstablishment.findMany({ where: { establishment_id }, select: { user_id: true } })).map(
    (v) => v.user_id,
  );
  const [nomesAntes, nomesDepois] = await Promise.all([nomesDe(antesIds), nomesDe(unicos)]);

  await db.$transaction(async (tx) => {
    await tx.userEstablishment.deleteMany({ where: { establishment_id } });
    if (unicos.length > 0) {
      await tx.userEstablishment.createMany({
        data: unicos.map((user_id) => scoped({ user_id, establishment_id })),
      });
    }
    await registrarNoHistorico(tx, ator, {
      action: "vinculos.definir",
      establishment_id,
      target_type: "estabelecimento",
      target_id: establishment_id,
      summary: `Definiu quem trabalha na ${loja.name} (${unicos.length} ${unicos.length === 1 ? "pessoa" : "pessoas"})`,
      changes: diferencas({ pessoas: nomesAntes }, { pessoas: nomesDepois }, { pessoas: "Quem trabalha na loja" }),
    });
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
  /** `base_qty` vezes o conteúdo do produto (3 casas); nulo em produto sem conteúdo. */
  content_equivalent: number | null;
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
  content_qty: number | null;
  content_unit: string | null;
  manufacturer: string | null;
  internal_code: string | null;
  species: string[];
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
  content_qty: unknown;
  content_unit: string | null;
  manufacturer: string | null;
  internal_code: string | null;
  species: string[];
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
    content_qty: decToNum(p.content_qty),
    content_unit: p.content_unit,
    manufacturer: p.manufacturer,
    internal_code: p.internal_code,
    species: p.species,
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
  opts: { incluir_arquivados?: boolean; q?: string; species?: string } = {},
): Promise<ActionResult<EmporioProductView[]>> {
  if (opts.species != null && opts.species !== "" && !ehEspecie(opts.species)) {
    return fail("VALIDATION_ERROR", mensagemEspecie(), 422, "species");
  }
  const linhas = await db.emporioProduct.findMany({
    where: {
      ...(opts.incluir_arquivados ? {} : { archived_at: null }),
      ...(opts.species ? { species: { has: opts.species } } : {}),
    },
    include: INCLUDE_PRODUTO,
  });
  // A busca é em memória, como o resto do projeto (NFD): o catálogo de uma loja cabe na tela.
  const termo = semAcento(String(opts.q ?? "").trim());
  const achadas = termo
    ? linhas.filter((p) =>
        [p.product.name, p.product.brand, p.manufacturer, p.internal_code].some(
          (campo) => campo != null && semAcento(campo).includes(termo),
        ),
      )
    : linhas;
  const views = achadas.map(viewProduto);
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
    presentations: p.presentations.map((a) => viewApresentacao(a, p.content_qty)),
    prices,
  });
}

function viewApresentacao(a: ProdutoRow["presentations"][number], conteudo: unknown): PresentationView {
  const base = decToNum(a.base_qty) ?? 0;
  const c = decToNum(conteudo);
  return {
    id: a.id,
    name: a.name,
    base_qty: base,
    content_equivalent: c == null ? null : Math.round(base * c * 1000) / 1000,
    is_sealed_package: a.is_sealed_package,
    archived_at: isoOrNull(a.archived_at),
  };
}

/** Em que unidades o conteúdo de cada unidade-base pode ser dado (Q123). */
const CONTEUDO_PERMITIDO: Record<string, readonly string[]> = {
  saca: ["quilograma", "litro"],
  fardo: ["quilograma", "litro", "unidade"],
  unidade: ["quilograma", "litro"],
};
const CONTEUDO_OBRIGATORIO = ["saca", "fardo"];

type Recusa = { field: string; message: string };

const abbrDe = (id: string) => findUnit(id)?.abbr ?? id;

/** Número no formato brasileiro, sem casas desnecessárias: 10, 2,5, 1.000. */
function numeroBR(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/** Valida o par conteúdo/unidade contra a unidade-base. Só roda na criação (o conteúdo é fixo). */
function recusaConteudo(baseUnit: string, qty: unknown, unit: unknown): Recusa | null {
  const temQtd = qty != null;
  const temUnid = unit != null && unit !== "";
  const permitidas = CONTEUDO_PERMITIDO[baseUnit];
  if (!permitidas) {
    if (temQtd || temUnid) {
      return { field: "content_qty", message: "Produto em quilograma ou litro não tem conteúdo." };
    }
    return null;
  }
  const obrigatorio = CONTEUDO_OBRIGATORIO.includes(baseUnit);
  if (!temQtd && !temUnid && !obrigatorio) return null;

  if (!temQtd) {
    return { field: "content_qty", message: `Informe quanto cabe ${baseUnit === "saca" ? "na saca" : baseUnit === "fardo" ? "no fardo" : "na unidade"}.` };
  }
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) {
    return { field: "content_qty", message: "O conteúdo deve ser maior que zero." };
  }
  if (!temUnid) return { field: "content_unit", message: "Escolha a unidade do conteúdo." };
  if (typeof unit !== "string" || !permitidas.includes(unit)) {
    const nomes = permitidas.map((u) => findUnit(u)?.label.toLowerCase() ?? u).join(", ");
    return { field: "content_unit", message: `Para ${baseUnit}, a unidade do conteúdo deve ser: ${nomes}.` };
  }
  if (Math.abs(qty * 1000 - Math.round(qty * 1000)) > 1e-6) {
    return { field: "content_qty", message: "O conteúdo aceita até 3 casas decimais." };
  }
  if (unit === "unidade" && !Number.isInteger(qty)) {
    return { field: "content_qty", message: "Conteúdo em unidades deve ser um número inteiro." };
  }
  return null;
}

/** Texto opcional com teto de tamanho. */
function recusaTexto(v: unknown, max: number, rotulo: string): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return `${rotulo} deve ser um texto.`;
  if (v.trim().length > max) return `${rotulo} aceita até ${max} caracteres.`;
  return null;
}

function ehEspecie(v: unknown): boolean {
  return typeof v === "string" && EMPORIO_SPECIES.some((e) => e.id === v);
}
function mensagemEspecie(): string {
  return `Escolha espécies da lista: ${EMPORIO_SPECIES.map((e) => e.label.toLowerCase()).join(", ")}.`;
}

type DadosProduto = {
  brand?: string | null;
  manufacturer?: string | null;
  internal_code?: string | null;
  species?: string[];
};

/** Marca, fabricante, código e espécie (Q124): comum à criação e à edição. */
function validarDados(input: DadosProduto): Recusa | null {
  const rb = recusaTexto(input.brand, 80, "A marca");
  if (rb) return { field: "brand", message: rb };
  const rm = recusaTexto(input.manufacturer, 80, "O fabricante");
  if (rm) return { field: "manufacturer", message: rm };
  const rc = recusaTexto(input.internal_code, 30, "O código interno");
  if (rc) return { field: "internal_code", message: rc };
  if (input.species !== undefined) {
    if (!Array.isArray(input.species) || !input.species.every(ehEspecie)) {
      return { field: "species", message: mensagemEspecie() };
    }
  }
  return null;
}

const aparar = (v: string | null | undefined): string | null => v?.trim() || null;
const especiesUnicas = (v: string[]): string[] => [...new Set(v)];

const recusaCodigo = (codigo: string) =>
  fail("DUPLICATE_CODE", `Já existe um produto com o código "${codigo}".`, 409, "internal_code");

async function codigoRepetido(db: TenantPrismaClient, codigo: string | null, selfId: string | null): Promise<boolean> {
  if (!codigo) return false;
  const igual = await db.emporioProduct.findFirst({
    where: { internal_code: codigo, ...(selfId ? { NOT: { id: selfId } } : {}) },
    select: { id: true },
  });
  return igual !== null;
}

/** "Saca 10 kg", "Fardo 12 un": a apresentação fechada que nasce com o produto. */
function nomeDaFechada(baseUnit: string, qty: number, unit: string): string {
  const rotulo = findUnit(baseUnit)?.label ?? baseUnit;
  return `${rotulo} ${numeroBR(qty)} ${abbrDe(unit)}`;
}

/**
 * Converte "quanto cabe" (kg, L, un) em quantidade na unidade-base. Precisa
 * fechar em 3 casas, que é a precisão do estoque; senão recusa dizendo o porquê.
 */
function baseQtyPeloConteudo(
  baseUnit: string,
  conteudo: number,
  conteudoUnit: string,
  qty: unknown,
): { base: number } | Recusa {
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) {
    return { field: "content_qty", message: "A quantidade deve ser maior que zero." };
  }
  const bruto = qty / conteudo;
  if (Math.abs(bruto * 1000 - Math.round(bruto * 1000)) > 1e-9) {
    const artigo = baseUnit === "fardo" ? "o" : "a";
    const rotulo = findUnit(baseUnit)?.label.toLowerCase() ?? baseUnit;
    const unid = abbrDe(conteudoUnit);
    const metade = conteudo / 2;
    const dica =
      conteudoUnit === "unidade" && !Number.isInteger(metade) ? "" : ` (como ${numeroBR(metade)} ${unid})`;
    return {
      field: "content_qty",
      message: `${numeroBR(qty)} ${unid} não divide ${artigo} ${rotulo} de ${numeroBR(conteudo)} ${unid} em partes exatas. Use uma quantidade que divida ${artigo} ${rotulo}${dica}.`,
    };
  }
  return { base: Math.round(bruto * 1000) / 1000 };
}

export type CriarProdutoEmporioInput = {
  product_id?: string;
  name?: string;
  category_id?: string;
  brand?: string | null;
  manufacturer?: string | null;
  internal_code?: string | null;
  species?: string[];
  base_unit?: string;
  content_qty?: number | null;
  content_unit?: string | null;
  reference_cost?: number | null;
};

export async function criarProdutoEmporioAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: CriarProdutoEmporioInput,
): Promise<ActionResult<EmporioProductDetail>> {
  const neg = await exigir(db, ator, "chave:cadastrar_produto", "cadastrar produto");
  if (neg) return neg;
  if (!isBaseUnit(input.base_unit)) {
    return fail(
      "VALIDATION_ERROR",
      "Escolha a unidade-base: quilograma, litro, unidade, saca ou fardo.",
      422,
      "base_unit",
    );
  }
  const rc = recusaDinheiro(input.reference_cost, "O custo");
  if (rc) return fail("VALIDATION_ERROR", rc, 422, "reference_cost");

  const baseUnit = input.base_unit;
  const rcont = recusaConteudo(baseUnit, input.content_qty, input.content_unit);
  if (rcont) return fail("VALIDATION_ERROR", rcont.message, 422, rcont.field);
  const rdados = validarDados(input);
  if (rdados) return fail("VALIDATION_ERROR", rdados.message, 422, rdados.field);

  const conteudoQty = input.content_qty ?? null;
  const conteudoUnit = conteudoQty == null ? null : (input.content_unit as string);
  const codigo = aparar(input.internal_code);
  if (await codigoRepetido(db, codigo, null)) return recusaCodigo(codigo as string);

  const dadosEmporio = {
    base_unit: baseUnit,
    content_qty: conteudoQty,
    content_unit: conteudoUnit,
    manufacturer: aparar(input.manufacturer),
    internal_code: codigo,
    species: especiesUnicas(input.species ?? []),
    reference_cost: input.reference_cost ?? null,
  };

  /** Saca e fardo nascem com a fechada que vale 1, na mesma transação. */
  const fechadaAutomatica = async (tx: Pick<TenantPrismaClient, "productPresentation">, emporioProductId: string) => {
    if ((baseUnit !== "saca" && baseUnit !== "fardo") || conteudoQty == null || conteudoUnit == null) return;
    await tx.productPresentation.create({
      data: scoped({
        emporio_product_id: emporioProductId,
        name: nomeDaFechada(baseUnit, conteudoQty, conteudoUnit),
        base_qty: 1,
        is_sealed_package: true,
        created_by_user_id: ator.id,
        updated_by_user_id: ator.id,
      }),
    });
  };

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
      novoId = await db.$transaction(async (tx) => {
        if (input.brand !== undefined) {
          await tx.product.update({ where: { id: produto.id }, data: { brand: aparar(input.brand) } });
        }
        const ep = await tx.emporioProduct.create({
          data: scoped({
            product_id: produto.id,
            ...dadosEmporio,
            created_in_emporio: false,
            created_by_user_id: ator.id,
            updated_by_user_id: ator.id,
          }),
        });
        await fechadaAutomatica(tx, ep.id);
        await registrarNoHistorico(tx, ator, {
          action: "produto.criar",
          target_type: "produto",
          target_id: ep.id,
          summary: `Colocou o produto ${produto.name} no Empório`,
        });
        return ep.id;
      });
    } catch (err) {
      if (ehErroUnico(err)) {
        if (codigo && (await codigoRepetido(db, codigo, null))) return recusaCodigo(codigo);
        return fail("ALREADY_IN_EMPORIO", "Esse produto já está no Empório.", 409);
      }
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
            brand: aparar(input.brand),
          }),
        });
        const ep = await tx.emporioProduct.create({
          data: scoped({
            product_id: produto.id,
            ...dadosEmporio,
            created_in_emporio: true,
            created_by_user_id: ator.id,
            updated_by_user_id: ator.id,
          }),
        });
        await fechadaAutomatica(tx, ep.id);
        await registrarNoHistorico(tx, ator, {
          action: "produto.criar",
          target_type: "produto",
          target_id: ep.id,
          summary: `Cadastrou o produto ${nome}`,
        });
        return ep.id;
      });
    } catch (err) {
      if (ehErroUnico(err)) {
        if (codigo && (await codigoRepetido(db, codigo, null))) return recusaCodigo(codigo);
        return fail("DUPLICATE_NAME", mensagemProdutoRepetido(nome), 409, "name");
      }
      throw err;
    }
  }

  return lerProdutoEmporioAction(db, ator, novoId);
}

function mensagemProdutoRepetido(nome: string): string {
  return `Já existe um produto chamado "${nome}". Use o existente pelo "usar no Empório".`;
}

const ROTULOS_PRODUTO: Record<string, string> = {
  brand: "Marca",
  manufacturer: "Fabricante",
  internal_code: "Código interno",
  species: "Espécies",
  reference_cost: "Custo de referência",
  track_sealed: "Controla lacrado e avulso",
  track_lot: "Controla lote",
  track_expiry: "Controla validade",
  expense_pct: "Despesas (%)",
  profit_pct: "Lucro (%)",
};

export type EditarProdutoEmporioInput = {
  brand?: string | null;
  manufacturer?: string | null;
  internal_code?: string | null;
  species?: string[];
  /** Fixos depois de criado: mandar qualquer um dos dois é recusado. */
  content_qty?: number | null;
  content_unit?: string | null;
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
  const neg = await exigir(db, ator, "chave:cadastrar_produto", "editar produto");
  if (neg) return neg;
  if (input.expense_pct !== undefined || input.profit_pct !== undefined) {
    const negConta = await exigir(db, ator, "conta", "mudar os percentuais do produto");
    if (negConta) return negConta;
  }
  const atual = await db.emporioProduct.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO("Produto");

  if (input.content_qty !== undefined || input.content_unit !== undefined) {
    return fail(
      "VALIDATION_ERROR",
      "O conteúdo não muda depois de criado, porque mudaria o sentido do estoque já contado. Arquive o produto e crie outro.",
      422,
      input.content_qty !== undefined ? "content_qty" : "content_unit",
    );
  }
  const rc = recusaDinheiro(input.reference_cost, "O custo");
  if (rc) return fail("VALIDATION_ERROR", rc, 422, "reference_cost");
  const rd = recusaPct(input.expense_pct, "O percentual de despesas");
  if (rd) return fail("VALIDATION_ERROR", rd, 422, "expense_pct");
  const rl = recusaPct(input.profit_pct, "O percentual de lucro");
  if (rl) return fail("VALIDATION_ERROR", rl, 422, "profit_pct");
  if (input.track_sealed != null && typeof input.track_sealed !== "boolean") {
    return fail("VALIDATION_ERROR", "Informe sim, não ou automático.", 422, "track_sealed");
  }

  const rdados = validarDados(input);
  if (rdados) return fail("VALIDATION_ERROR", rdados.message, 422, rdados.field);
  const codigo = input.internal_code !== undefined ? aparar(input.internal_code) : undefined;
  if (codigo && (await codigoRepetido(db, codigo, id))) return recusaCodigo(codigo);

  const base = await db.product.findFirst({ where: { id: atual.product_id }, select: { name: true, brand: true } });
  try {
    await db.$transaction(async (tx) => {
      if (input.brand !== undefined) {
        await tx.product.update({ where: { id: atual.product_id }, data: { brand: aparar(input.brand) } });
      }
      const depois = await tx.emporioProduct.update({
        where: { id },
        data: {
          updated_by_user_id: ator.id,
          ...(input.manufacturer !== undefined ? { manufacturer: aparar(input.manufacturer) } : {}),
          ...(codigo !== undefined ? { internal_code: codigo } : {}),
          ...(input.species !== undefined ? { species: especiesUnicas(input.species) } : {}),
          ...(input.reference_cost !== undefined ? { reference_cost: input.reference_cost } : {}),
          ...(input.track_sealed !== undefined ? { track_sealed: input.track_sealed } : {}),
          ...(input.track_lot !== undefined ? { track_lot: input.track_lot } : {}),
          ...(input.track_expiry !== undefined ? { track_expiry: input.track_expiry } : {}),
          ...(input.expense_pct !== undefined ? { expense_pct: input.expense_pct } : {}),
          ...(input.profit_pct !== undefined ? { profit_pct: input.profit_pct } : {}),
        },
      });
      const brandDepois = input.brand !== undefined ? aparar(input.brand) : (base?.brand ?? null);
      const mudancas = diferencas(
        {
          brand: base?.brand ?? null,
          manufacturer: atual.manufacturer,
          internal_code: atual.internal_code,
          species: [...atual.species].sort(),
          reference_cost: decToNum(atual.reference_cost),
          track_sealed: atual.track_sealed,
          track_lot: atual.track_lot,
          track_expiry: atual.track_expiry,
          expense_pct: decToNum(atual.expense_pct),
          profit_pct: decToNum(atual.profit_pct),
        },
        {
          brand: brandDepois,
          manufacturer: depois.manufacturer,
          internal_code: depois.internal_code,
          species: [...depois.species].sort(),
          reference_cost: decToNum(depois.reference_cost),
          track_sealed: depois.track_sealed,
          track_lot: depois.track_lot,
          track_expiry: depois.track_expiry,
          expense_pct: decToNum(depois.expense_pct),
          profit_pct: decToNum(depois.profit_pct),
        },
        ROTULOS_PRODUTO,
        { reference_cost: (v) => (v == null ? null : dinheiro(v as number)) },
      );
      await registrarNoHistorico(tx, ator, {
        action: "produto.editar",
        target_type: "produto",
        target_id: id,
        summary: `Editou o produto ${base?.name ?? ""}`.trim(),
        changes: mudancas,
      });
    });
  } catch (err) {
    if (ehErroUnico(err) && codigo && (await codigoRepetido(db, codigo, id))) return recusaCodigo(codigo);
    throw err;
  }
  return lerProdutoEmporioAction(db, ator, id);
}

export async function arquivarProdutoEmporioAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  archived: boolean,
): Promise<ActionResult<EmporioProductDetail>> {
  const neg = await exigir(db, ator, "chave:cadastrar_produto", "arquivar produto");
  if (neg) return neg;
  if (typeof archived !== "boolean") {
    return fail("VALIDATION_ERROR", "Informe se é para arquivar ou desarquivar.", 422, "archived");
  }
  const atual = await db.emporioProduct.findFirst({ where: { id }, include: { product: { select: { name: true } } } });
  if (!atual) return NAO_ACHADO("Produto");
  await db.$transaction(async (tx) => {
    await tx.emporioProduct.update({
      where: { id },
      data: { archived_at: archived ? (atual.archived_at ?? new Date()) : null, updated_by_user_id: ator.id },
    });
    await registrarNoHistorico(tx, ator, {
      action: "produto.arquivar",
      target_type: "produto",
      target_id: id,
      summary: `${archived ? "Arquivou" : "Reativou"} o produto ${atual.product.name}`,
    });
  });
  return lerProdutoEmporioAction(db, ator, id);
}

// ---------------------------------------------------------------------------
// Apresentações
// ---------------------------------------------------------------------------

export type ApresentacaoInput = {
  name?: string;
  base_qty?: number;
  /** Em produto com conteúdo, no lugar de `base_qty`: quanto cabe (kg, L ou un). */
  content_qty?: number;
  is_sealed_package?: boolean;
};

/**
 * A quantidade na unidade-base que a entrada pede, seja por `base_qty` ou por
 * `content_qty` (Q125). `exigir` é a criação, que não tem o que preservar.
 */
function resolverBaseQty(
  p: { base_unit: string; content_qty: unknown; content_unit: string | null },
  input: ApresentacaoInput,
  exigir: boolean,
): { base: number | undefined } | Recusa {
  if (input.content_qty !== undefined && input.base_qty !== undefined) {
    return { field: "content_qty", message: "Informe a quantidade ou o conteúdo, não os dois." };
  }
  if (input.content_qty !== undefined) {
    const conteudo = decToNum(p.content_qty);
    if (conteudo == null || !p.content_unit) {
      return { field: "content_qty", message: "Esse produto não tem conteúdo. Informe a quantidade na unidade-base." };
    }
    const r = baseQtyPeloConteudo(p.base_unit, conteudo, p.content_unit, input.content_qty);
    if ("field" in r) return r;
    const rq = recusaBaseQty(r.base, p.base_unit);
    if (rq) return { field: "content_qty", message: rq };
    return { base: r.base };
  }
  if (input.base_qty !== undefined || exigir) {
    const rq = recusaBaseQty(input.base_qty, p.base_unit);
    if (rq) return { field: "base_qty", message: rq };
  }
  return { base: input.base_qty };
}

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
  const neg = await exigir(db, ator, "chave:cadastrar_produto", "cadastrar apresentação");
  if (neg) return neg;
  const p = await db.emporioProduct.findFirst({ where: { id: emporio_product_id } });
  if (!p) return NAO_ACHADO("Produto");

  const nome = String(input.name ?? "").trim();
  if (!nome) return fail("VALIDATION_ERROR", "Informe o nome da apresentação.", 422, "name");
  const rb = resolverBaseQty(p, input, true);
  if ("field" in rb) return fail("VALIDATION_ERROR", rb.message, 422, rb.field);

  const igual = await db.productPresentation.findFirst({
    where: { emporio_product_id, name: { equals: nome, mode: "insensitive" } },
  });
  if (igual) return fail("DUPLICATE_NAME", `Esse produto já tem a apresentação "${igual.name}".`, 409, "name");

  try {
    const nomeProduto = (await db.product.findFirst({ where: { id: p.product_id }, select: { name: true } }))?.name;
    const a = await db.$transaction(async (tx) => {
      const criada = await tx.productPresentation.create({
        data: scoped({
          emporio_product_id,
          name: nome,
          base_qty: rb.base as number,
          is_sealed_package: input.is_sealed_package ?? false,
          created_by_user_id: ator.id,
          updated_by_user_id: ator.id,
        }),
      });
      await registrarNoHistorico(tx, ator, {
        action: "apresentacao.criar",
        target_type: "produto",
        target_id: emporio_product_id,
        summary: `Criou a apresentação ${nome} de ${nomeProduto ?? "um produto"}`,
      });
      return criada;
    });
    return ok(viewApresentacao(a, p.content_qty));
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
  const neg = await exigir(db, ator, "chave:cadastrar_produto", "editar apresentação");
  if (neg) return neg;
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
  const rb = resolverBaseQty(atual.emporio_product, input, false);
  if ("field" in rb) return fail("VALIDATION_ERROR", rb.message, 422, rb.field);

  try {
    const a = await db.$transaction(async (tx) => {
      const nova = await tx.productPresentation.update({
        where: { id },
        data: {
          updated_by_user_id: ator.id,
          ...(nome !== undefined ? { name: nome } : {}),
          ...(rb.base !== undefined ? { base_qty: rb.base } : {}),
          ...(input.is_sealed_package !== undefined ? { is_sealed_package: input.is_sealed_package } : {}),
        },
      });
      await registrarNoHistorico(tx, ator, {
        action: "apresentacao.editar",
        target_type: "produto",
        target_id: atual.emporio_product_id,
        summary: `Editou a apresentação ${atual.name}`,
        changes: diferencas(
          { name: atual.name, base_qty: decToNum(atual.base_qty), is_sealed_package: atual.is_sealed_package },
          { name: nova.name, base_qty: decToNum(nova.base_qty), is_sealed_package: nova.is_sealed_package },
          { name: "Nome", base_qty: "Quantidade na unidade-base", is_sealed_package: "Embalagem fechada" },
          { is_sealed_package: (v) => (v ? "Sim" : "Não") },
        ),
      });
      return nova;
    });
    return ok(viewApresentacao(a, atual.emporio_product.content_qty));
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
  const neg = await exigir(db, ator, "chave:cadastrar_produto", "arquivar apresentação");
  if (neg) return neg;
  if (typeof archived !== "boolean") {
    return fail("VALIDATION_ERROR", "Informe se é para arquivar ou desarquivar.", 422, "archived");
  }
  const atual = await db.productPresentation.findFirst({ where: { id }, include: { emporio_product: true } });
  if (!atual) return NAO_ACHADO("Apresentação");
  const a = await db.$transaction(async (tx) => {
    const nova = await tx.productPresentation.update({
      where: { id },
      data: { archived_at: archived ? (atual.archived_at ?? new Date()) : null, updated_by_user_id: ator.id },
    });
    await registrarNoHistorico(tx, ator, {
      action: "apresentacao.arquivar",
      target_type: "produto",
      target_id: atual.emporio_product_id,
      summary: `${archived ? "Arquivou" : "Reativou"} a apresentação ${atual.name}`,
    });
    return nova;
  });
  return ok(viewApresentacao(a, atual.emporio_product.content_qty));
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
  const neg = await exigir(db, ator, "gestor_da_loja", "definir o preço");
  if (neg) return neg;

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
  const chave = {
    establishment_id_presentation_id: {
      establishment_id: input.establishment_id,
      presentation_id: input.presentation_id,
    },
  };
  const anterior = await db.presentationPrice.findUnique({ where: chave });
  const linha = await db.$transaction(async (tx) => {
    const gravada = await tx.presentationPrice.upsert({
      where: chave,
      create: scoped({
        establishment_id: input.establishment_id,
        presentation_id: input.presentation_id,
        ...valores,
      }),
      update: valores,
    });
    const mudancas = diferencas(
      {
        price: decToNum(anterior?.price),
        expense_pct: decToNum(anterior?.expense_pct),
        profit_pct: decToNum(anterior?.profit_pct),
      },
      { price: decToNum(gravada.price), expense_pct: decToNum(gravada.expense_pct), profit_pct: decToNum(gravada.profit_pct) },
      { price: "Preço", expense_pct: "Despesas (%)", profit_pct: "Lucro (%)" },
      { price: (v) => (v == null ? null : dinheiro(v as number)) },
    );
    await registrarNoHistorico(tx, ator, {
      action: "preco.definir",
      establishment_id: input.establishment_id,
      target_type: "produto",
      target_id: ap.emporio_product_id,
      summary: `Mudou o preço ${ap.name ? `da ${ap.name}` : "de um produto"} na ${loja.name}${
        gravada.price != null ? ` para ${dinheiro(Number(gravada.price))}` : ""
      }`,
      changes: mudancas,
    });
    return gravada;
  });
  return ok({
    establishment_id: linha.establishment_id,
    presentation_id: linha.presentation_id,
    price: decToNum(linha.price),
    expense_pct: decToNum(linha.expense_pct),
    profit_pct: decToNum(linha.profit_pct),
  });
}
