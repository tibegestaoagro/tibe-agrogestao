import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { forceSubscriptionStatusAction } from "@/lib/actions/platform-tenants";
import { withApi } from "@/lib/route";

const schema = z.object({
  status: z.enum(["active", "overdue", "canceled"]),
  reason: z.string().trim().min(1).nullish(),
});

/**
 * PATCH /api/platform/tenants/:id/status (spec 6.9): só master_admin.
 * Grava em SubscriptionStatusLog com o PlatformUser responsável (log de
 * auditoria exigido pela spec).
 */
async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }

  const result = await forceSubscriptionStatusAction({
    tenantId: params.id,
    newStatus: parsed.data.status,
    reason: parsed.data.reason ?? null,
    platformUserId: g.platformUser.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data);
}

export const PATCH = withApi(PATCHHandler);
