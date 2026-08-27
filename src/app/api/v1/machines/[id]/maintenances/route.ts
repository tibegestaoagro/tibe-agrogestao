import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { registerMaintenanceAction } from "@/lib/actions/machines";
import { withApi } from "@/lib/route";

/** POST /api/v1/machines/:id/maintenances: registra uma manutenção. */

const schema = z.object({
  performed_at: z.string().datetime().nullish(),
  description: z.string().min(1, "Descrição é obrigatória"),
  cost: z.number().nonnegative().nullish(),
  next_due_at: z.string().datetime().nullish(),
});

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("maquinas", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const d = parsed.data;

  const result = await registerMaintenanceAction(g.db, params.id, {
    performed_at: d.performed_at ? new Date(d.performed_at) : null,
    description: d.description,
    cost: d.cost ?? null,
    next_due_at: d.next_due_at !== undefined ? (d.next_due_at ? new Date(d.next_due_at) : null) : undefined,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
