import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { guardPlatform } from "@/lib/platform-guard";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";
import { withApi } from "@/lib/route";

const schema = z.object({
  enabled: z.boolean(),
  user_ids: z.array(z.string()).nullish(),
});

/**
 * PUT /api/platform/tenants/:id/features/:key: só master_admin. Liga ou desliga
 * o recurso da conta; `user_ids` (opcional) restringe a quem da conta vê, e
 * vazio ou ausente libera a conta inteira.
 */
async function PUTHandler(request: Request, props: { params: Promise<{ id: string; key: string }> }) {
  const params = await props.params;
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const result = await setTenantFeatureAction({
    tenantId: params.id,
    key: params.key,
    enabled: parsed.data.enabled,
    user_ids: parsed.data.user_ids,
    platformUserId: g.platformUser.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const PUT = withApi(PUTHandler);
