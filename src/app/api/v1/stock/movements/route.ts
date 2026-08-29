import type { StockMovementType } from "@/generated/prisma/client";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { stockMovementSchema } from "@/lib/validation/stock";
import { recordStockMovement, listStockMovements } from "@/lib/actions/stock-ledger";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/stock/movements   histórico de movimentações (Módulo 31, §10.2)
 * POST /api/v1/stock/movements   registra uso, compra avulsa ou venda avulsa
 *
 * O POST atende principalmente a UTILIZAÇÃO (§10.3), que é saída sem negócio e
 * sem dinheiro: aplicar vacina, passar veneno, dar sal ao gado. Compra e venda
 * COM dinheiro entram por `/api/v1/negotiations`, que cria o lançamento
 * financeiro junto; aceitar os dois tipos aqui também cobre a correção de um
 * saldo que entrou por fora, sem obrigar a inventar uma negociação falsa.
 *
 * `ajuste` não entra por aqui: tem rota própria, porque o §10.6 pede o saldo
 * REAL contado, não a diferença.
 */

const TIPOS: readonly string[] = [
  "compra",
  "venda",
  "utilizacao",
  "ajuste",
  "permuta_entrada",
  "permuta_saida",
];

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const params = new URL(request.url).searchParams;
  const tipo = params.get("movement_type");

  const limit = Number(params.get("limit"));
  const offset = Number(params.get("offset"));

  const { items, total } = await listStockMovements(
    g.db,
    {
      product_id: params.get("product_id") ?? undefined,
      property_id: params.get("property_id") ?? undefined,
      movement_type:
        tipo && TIPOS.includes(tipo) ? (tipo as StockMovementType) : undefined,
      since: parseDate(params.get("since")),
      until: parseDate(params.get("until")),
    },
    {
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      offset: Number.isFinite(offset) && offset > 0 ? offset : undefined,
    },
  );

  return apiOk(items, { total });
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = stockMovementSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const d = parsed.data;

  const result = await recordStockMovement(g.db, {
    product_id: d.product_id,
    property_id: d.property_id,
    movement_type: d.movement_type,
    quantity: d.quantity,
    occurred_at: d.occurred_at ? new Date(d.occurred_at) : null,
    herd_category_id: d.herd_category_id ?? null,
    pasture_id: d.pasture_id ?? null,
    purpose: d.purpose ?? null,
    notes: d.notes ?? null,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
