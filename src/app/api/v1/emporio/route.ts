import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { requireFeatureApi } from "@/lib/features";
import { withApi } from "@/lib/route";

/** GET /api/v1/emporio: 404 enquanto o recurso não estiver liberado para o usuário. */
async function GETHandler() {
  const g = await guard("emporio", "read");
  if ("error" in g) return g.error;

  const recusa = await requireFeatureApi(g.user, "emporio");
  if (recusa) return recusa.error;

  const establishments_count = await g.db.establishment.count({ where: { archived_at: null } });
  return apiOk({ establishments_count });
}

export const GET = withApi(GETHandler);
