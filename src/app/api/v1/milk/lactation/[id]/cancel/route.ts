import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { cancelLactationEntry, contagemAtual } from "@/lib/actions/milk-lactation";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/milk/lactation/:id/cancel   cancela um registro de lactação.
 *
 * Cancela, não apaga: o §37.11 exige histórico, e a média por vaca de um mês
 * fechado não pode mudar sem deixar rastro.
 */
async function POSTHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const result = await cancelLactationEntry(g.db, id);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  const vacas_em_lactacao = await contagemAtual(g.db, result.data.property_id);

  return apiOk(
    {
      id: result.data.id,
      property_id: result.data.property_id,
      type: result.data.type,
      quantity: result.data.quantity,
      recorded_at: result.data.recorded_at.toISOString(),
      pasture_id: result.data.pasture_id,
      group_id: result.data.group_id,
      notes: result.data.notes,
      cancelled: result.data.cancelled_at != null,
      cancelled_at: isoOrNull(result.data.cancelled_at),
    },
    { vacas_em_lactacao },
  );
}

export const POST = withApi(POSTHandler);
