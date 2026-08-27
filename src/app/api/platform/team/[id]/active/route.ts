import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { setTeamMemberActiveAction } from "@/lib/actions/platform-team";
import { withApi } from "@/lib/route";

const schema = z.object({ active: z.boolean() });

/** PATCH /api/platform/team/:id/active (spec 6.10): só master_admin, não pode desativar a si mesmo. */
async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  if (params.id === g.platformUser.id && !parsed.data.active) {
    return apiError("CANNOT_DEACTIVATE_SELF", "Você não pode desativar sua própria conta", 422);
  }

  const result = await setTeamMemberActiveAction(params.id, parsed.data.active);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const PATCH = withApi(PATCHHandler);
