import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { setUserActiveAction } from "@/lib/actions/users";
import { withApi } from "@/lib/route";

const schema = z.object({ active: z.boolean() });

/** PATCH /api/v1/users/:id/active: ativa/desativa (spec 5.2, não deleta). */
async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("usuarios", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  if (params.id === g.user.id && !parsed.data.active) {
    return apiError("CANNOT_DEACTIVATE_SELF", "Você não pode desativar sua própria conta", 422);
  }

  const result = await setUserActiveAction(
    g.db,
    g.user.tenant_id,
    params.id,
    parsed.data.active,
  );
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}

export const PATCH = withApi(PATCHHandler);
