import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { listTenantFeaturesAction } from "@/lib/actions/platform-features";
import { withApi } from "@/lib/route";

/** GET /api/platform/tenants/:id/features: equipe e master_admin leem. */
async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guardPlatform();
  if ("error" in g) return g.error;

  const result = await listTenantFeaturesAction(params.id);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const GET = withApi(GETHandler);
