import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { CATEGORIAS_INICIAIS, isStockUnit, findUnit } from "@/lib/stock/units";
import { getStockBalance } from "@/lib/actions/stock-ledger";

/**
 * Produtos e categorias (Módulo 31, §9).
 *
 * O catálogo é do TENANT; o saldo é que vive por fazenda, em
 * `stock-ledger.ts`. Um produto cadastrado uma vez serve as duas fazendas, e é
 * assim que "sal mineral" significa a mesma coisa nos dois lugares.
 */

export type ProductView = {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  unit: string;
  unit_label: string;
  brand: string | null;
  minimum_stock: number | null;
  storage_location: string | null;
  notes: string | null;
};

/**
 * Garante as 15 categorias do §9.1.
 *
 * Chamada toda vez que a tela de Estoque abre, e é barata: um `count` quando
 * já existem. Decisão do usuário (2026-08-14) contra semear na migração:
 * funciona igual para tenant novo e antigo, não mexe em dado de produção, e um
 * tenant que apagar todas não fica travado sem nenhuma.
 *
 * Idempotente por construção: só cria quando NÃO existe nenhuma. Não recria a
 * que o produtor arquivou de propósito, e não repõe uma a uma, porque quem
 * apagou "Lubrificantes" apagou querendo.
 */
export async function ensureProductCategories(db: TenantPrismaClient): Promise<number> {
  const quantas = await db.productCategory.count();
  if (quantas > 0) return 0;

  /**
   * `skipDuplicates` não é detalhe: entre o `count` e o `createMany` cabe outra
   * requisição. Duas abas abertas, ou a página e o app ao mesmo tempo, num
   * tenant novo, faziam a segunda estourar P2002 contra o
   * `@@unique([tenant_id, name])` e a tela de Estoque respondia 500 na
   * primeira visita da vida do cliente.
   */
  await db.productCategory.createMany({
    data: CATEGORIAS_INICIAIS.map((name) => scoped({ name })),
    skipDuplicates: true,
  });
  return CATEGORIAS_INICIAIS.length;
}

export async function listProductCategories(db: TenantPrismaClient) {
  const linhas = await db.productCategory.findMany({
    where: { archived_at: null },
    orderBy: { name: "asc" },
  });
  return linhas.map((c) => ({ id: c.id, name: c.name }));
}

export type ProductInput = {
  name: string;
  category_id: string;
  unit: string;
  brand?: string | null;
  minimum_stock?: number | null;
  storage_location?: string | null;
  notes?: string | null;
};

export async function createProduct(
  db: TenantPrismaClient,
  input: ProductInput,
): Promise<ActionResult<ProductView>> {
  const nome = input.name?.trim();
  if (!nome) return fail("VALIDATION_ERROR", "Informe o nome do produto.", 422);

  if (!isStockUnit(input.unit)) {
    return fail("VALIDATION_ERROR", "Escolha a unidade de medida do produto.", 422);
  }

  const categoria = await db.productCategory.findFirst({ where: { id: input.category_id } });
  if (!categoria) return fail("INVALID_CATEGORY", "Categoria inválida", 422);

  if (input.minimum_stock != null) {
    if (!Number.isFinite(input.minimum_stock) || input.minimum_stock < 0) {
      return fail("VALIDATION_ERROR", "O estoque mínimo não pode ser negativo.", 422);
    }
  }

  /**
   * Nome é único por tenant: dois "Sal mineral" no catálogo dariam dois saldos
   * para a mesma coisa, que é justamente o que o estoque existe para evitar.
   *
   * A busca NÃO filtra por `archived_at`, embora só o ativo importe para o
   * produtor. Motivo: o índice do banco é `@@unique([tenant_id, name])` sem
   * predicado, então recadastrar um nome arquivado passava por esta checagem e
   * estourava P2002 sem tratamento, virando 500 em vez do 409 pretendido. A
   * mensagem diferencia os dois casos, porque "já existe" e "existe arquivado"
   * pedem ações diferentes de quem está cadastrando.
   */
  const existente = await db.product.findFirst({
    where: { name: { equals: nome, mode: "insensitive" } },
  });
  if (existente) {
    return fail(
      "DUPLICATE_PRODUCT",
      existente.archived_at
        ? `Você já teve um produto chamado "${existente.name}" e ele foi desativado. Reative em vez de cadastrar outro, para não dividir o saldo em dois.`
        : `Você já tem um produto chamado "${existente.name}".`,
      409,
    );
  }

  const produto = await db.product.create({
    data: scoped({
      name: nome,
      category_id: input.category_id,
      unit: input.unit,
      brand: input.brand ?? null,
      minimum_stock: input.minimum_stock ?? null,
      storage_location: input.storage_location ?? null,
      notes: input.notes ?? null,
    }),
  });

  return ok({
    id: produto.id,
    name: produto.name,
    category_id: produto.category_id,
    category_name: categoria.name,
    unit: produto.unit,
    unit_label: findUnit(produto.unit)?.label ?? produto.unit,
    brand: produto.brand,
    minimum_stock: decToNum(produto.minimum_stock),
    storage_location: produto.storage_location,
    notes: produto.notes,
  });
}

export type ProductWithBalance = ProductView & {
  /** Saldo por fazenda, e o total somado. O saldo NUNCA vem de coluna. */
  saldo_por_fazenda: { property_id: string; quantity: number }[];
  /** Soma do que o filtro pediu: uma fazenda, ou todas quando não há filtro. */
  saldo_total: number;
  /**
   * Soma de TODAS as fazendas, sempre, independente do filtro.
   *
   * Existe porque `minimum_stock` é campo do PRODUTO, não da fazenda: só há um
   * número para comparar. Sem isto, a tela filtrada por uma fazenda dizia
   * "precisa de reposição" para um produto com 50 sacas na fazenda vizinha,
   * enquanto o alerta diário e o WhatsApp (que somam o tenant) ficavam
   * calados. Duas respostas diferentes para a mesma pergunta, e nada no
   * código decidindo qual valia.
   */
  saldo_no_tenant: number;
  /** §10.8: true quando o total DO TENANT atingiu o mínimo definido. */
  abaixo_do_minimo: boolean;
};

/**
 * O catálogo com o saldo de cada produto.
 *
 * Uma consulta de movimentação para todos os produtos, não uma por produto: a
 * tela de Estoque lista tudo, e um `getStockBalance` por linha seria N+1 na
 * tela principal do módulo.
 */
export async function listProductsWithBalance(
  db: TenantPrismaClient,
  filtro: { property_id?: string } = {},
): Promise<ProductWithBalance[]> {
  const produtos = await db.product.findMany({
    where: { archived_at: null },
    include: { category: true },
    orderBy: { name: "asc" },
  });

  const posicoes = await getStockBalance(db, filtro);
  // Uma segunda leitura só quando há filtro: sem filtro as duas são a mesma
  // consulta, e repeti-la seria dobrar o custo da tela principal do módulo.
  const posicoesGerais = filtro.property_id ? await getStockBalance(db, {}) : posicoes;

  return produtos.map((p) => {
    const doProduto = posicoes.filter((s) => s.product_id === p.id);
    const total = Math.round(doProduto.reduce((s, x) => s + x.quantity, 0) * 1000) / 1000;
    const noTenant =
      Math.round(
        posicoesGerais
          .filter((s) => s.product_id === p.id)
          .reduce((s, x) => s + x.quantity, 0) * 1000,
      ) / 1000;
    const minimo = decToNum(p.minimum_stock);
    return {
      id: p.id,
      name: p.name,
      category_id: p.category_id,
      category_name: p.category.name,
      unit: p.unit,
      unit_label: findUnit(p.unit)?.label ?? p.unit,
      brand: p.brand,
      minimum_stock: minimo,
      storage_location: p.storage_location,
      notes: p.notes,
      saldo_por_fazenda: doProduto.map((s) => ({
        property_id: s.property_id,
        quantity: s.quantity,
      })),
      saldo_total: total,
      saldo_no_tenant: noTenant,
      abaixo_do_minimo: minimo != null && noTenant <= minimo,
    };
  });
}
