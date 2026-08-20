import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { serializePlot, serializeCycle } from "@/lib/serializers";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/plots/:id   detalhe do talhão com ciclos (atual + histórico).
 */
async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("lavoura", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const plot = await g.db.plot.findFirst({
    where: { id: params.id },
    include: {
      property: { select: { name: true } },
      cycles: { orderBy: { created_at: "desc" } },
    },
  });
  if (!plot) return apiError(...ApiErrors.NOT_FOUND);

  const cycles = plot.cycles.map(serializeCycle);
  const active =
    cycles.find((c) => c.status === "planted" || c.status === "growing") ?? null;

  return apiOk({
    ...serializePlot(plot),
    property_name: plot.property?.name ?? null,
    active_cycle: active,
    cycles,
  });
}

export const GET = withApi(GETHandler);
