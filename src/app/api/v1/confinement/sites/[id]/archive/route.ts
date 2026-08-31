import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { archiveConfinementSite } from "@/lib/actions/confinement";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/confinement/sites/:id/archive   arquiva o confinamento (não deleta).
 * Idempotente: re-arquivar mantém o archived_at original.
 */
async function POSTHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const result = await archiveConfinementSite(g.db, id);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk({
    id: result.data.id,
    name: result.data.name,
    type: result.data.type,
    property_id: result.data.property_id,
    counterparty_name: result.data.counterparty_name,
    city: result.data.city,
    capacity: result.data.capacity,
    notes: result.data.notes,
    archived: result.data.archived_at != null,
    archived_at: isoOrNull(result.data.archived_at),
  });
}

export const POST = withApi(POSTHandler);
