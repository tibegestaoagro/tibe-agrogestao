import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { addServiceJobLog } from "@/lib/actions/service-jobs";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/service-jobs/:id/logs   produção diária e horímetro (§19, §20, §33).
 *
 * Guard `servicos`: ver `src/app/api/v1/service-jobs/route.ts`.
 */

const schema = z.object({
  quantity: z.number().positive("A quantidade precisa ser maior que zero").nullish(),
  occurred_at: z.string().datetime("Informe uma data válida").nullish(),
  notes: z.string().trim().max(500).nullish(),
  hour_meter_start: z.number().nonnegative().nullish(),
  hour_meter_end: z.number().nonnegative().nullish(),
});

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("servicos", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const d = parsed.data;

  const res = await addServiceJobLog(g.db, {
    service_job_id: id,
    quantity: d.quantity ?? null,
    occurred_at: d.occurred_at ? new Date(d.occurred_at) : null,
    notes: d.notes ?? null,
    hour_meter_start: d.hour_meter_start ?? null,
    hour_meter_end: d.hour_meter_end ?? null,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
