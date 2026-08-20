import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { decToNum } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/cycles/:id/summary   (contrato spec 1.11)
 * Custo total de insumos, custo por hectare, produtividade por hectare (se colhido).
 */
async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("lavoura", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const cycle = await g.db.cropCycle.findFirst({
    where: { id: params.id },
    include: { plot: { select: { area_hectares: true } } },
  });
  if (!cycle) return apiError(...ApiErrors.NOT_FOUND);

  const inputs = await g.db.plotInput.findMany({
    where: { cycle_id: params.id },
    select: { cost: true },
  });
  const totalInputCost = inputs.reduce(
    (sum, i) => sum + (decToNum(i.cost) ?? 0),
    0,
  );

  const area = decToNum(cycle.plot?.area_hectares);
  const yieldAmount = decToNum(cycle.yield_amount);

  const costPerHectare =
    area && area > 0 ? Number((totalInputCost / area).toFixed(2)) : null;
  const productivity =
    area && area > 0 && yieldAmount != null
      ? Number((yieldAmount / area).toFixed(3))
      : null;

  return apiOk({
    total_input_cost: Number(totalInputCost.toFixed(2)),
    area_hectares: area,
    cost_per_hectare: costPerHectare,
    yield_amount: yieldAmount,
    yield_unit: cycle.yield_unit ?? null,
    productivity_per_hectare: productivity,
  });
}

export const GET = withApi(GETHandler);
