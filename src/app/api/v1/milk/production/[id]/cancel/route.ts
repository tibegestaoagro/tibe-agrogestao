import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { cancelMilkProduction } from "@/lib/actions/milk-production";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/milk/production/:id/cancel   cancela um registro de produção.
 *
 * Cancela, não apaga (§37.11). O registro sai das somas e continua na lista,
 * marcado: é assim que o produtor descobre que o número mudou porque alguém
 * cancelou, e não porque o sistema errou.
 */
async function POSTHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const result = await cancelMilkProduction(g.db, id);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk({
    id: result.data.id,
    property_id: result.data.property_id,
    liters: result.data.liters,
    shift: result.data.shift,
    recorded_at: result.data.recorded_at.toISOString(),
    group_id: result.data.group_id,
    notes: result.data.notes,
    cancelled: result.data.cancelled_at != null,
    cancelled_at: isoOrNull(result.data.cancelled_at),
  });
}

export const POST = withApi(POSTHandler);
