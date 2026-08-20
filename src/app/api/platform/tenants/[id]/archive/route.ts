import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { setTenantArchivedAction } from "@/lib/actions/platform-tenants";
import { withApi } from "@/lib/route";

const schema = z.object({ archived: z.boolean() });

/**
 * POST /api/platform/tenants/:id/archive (spec 2026-07-27): só master_admin.
 * `{ archived: true }` arquiva, `{ archived: false }` desarquiva. Idempotente.
 */
async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Campo 'archived' (boolean) é obrigatório", 422);
  }

  const result = await setTenantArchivedAction(params.id, parsed.data.archived);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}

export const POST = withApi(POSTHandler);
