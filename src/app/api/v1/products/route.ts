import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { productCreateSchema } from "@/lib/validation/stock";
import { createProduct, listProductsWithBalance } from "@/lib/actions/products";
import { STOCK_UNITS } from "@/lib/stock/units";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/products   catálogo com o saldo de cada produto (Módulo 31, §9)
 * POST /api/v1/products   cadastra um produto
 *
 * O catálogo é do tenant; o saldo vive por fazenda. `?property_id=` filtra o
 * SALDO, não o catálogo: um produto sem movimentação naquela fazenda aparece
 * com saldo zero, e é isso que permite lançar a primeira compra dele lá.
 *
 * `meta.units` viaja junto para a tela montar o seletor de unidade sem uma
 * segunda rota: as 11 unidades do §10.5 são constante de código, não linha de
 * banco, e cada uma carrega se aceita quantidade quebrada.
 */
async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const params = new URL(request.url).searchParams;
  const property_id = params.get("property_id") ?? undefined;

  const produtos = await listProductsWithBalance(g.db, { property_id });

  return apiOk(produtos, {
    units: STOCK_UNITS,
    abaixo_do_minimo: produtos.filter((p) => p.abaixo_do_minimo).length,
  });
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = productCreateSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const d = parsed.data;

  const result = await createProduct(g.db, {
    name: d.name,
    category_id: d.category_id,
    unit: d.unit,
    brand: d.brand ?? null,
    minimum_stock: d.minimum_stock ?? null,
    storage_location: d.storage_location ?? null,
    notes: d.notes ?? null,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
