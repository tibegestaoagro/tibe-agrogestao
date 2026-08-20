import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { serializePasture } from "@/lib/serializers";
import { getPastureAreaSummary } from "@/lib/actions/properties";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/pastures/:id/archive   desativa o pasto (não deleta: doc §5 "excluir ou desativar").
 * Idempotente: re-desativar mantém o archived_at original.
 */
async function POSTHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const existing = await g.db.pasture.findFirst({ where: { id: params.id } });
  if (!existing) return apiError(...ApiErrors.NOT_FOUND);

  const pasture = existing.archived_at
    ? existing
    : await g.db.pasture.update({
        where: { id: params.id },
        data: { archived_at: new Date() },
      });

  const area_summary = await getPastureAreaSummary(g.db, pasture.property_id);

  return apiOk(serializePasture(pasture), { area_summary });
}

export const POST = withApi(POSTHandler);
