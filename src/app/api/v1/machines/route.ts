import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { createMachineAction, listMachinesAction, serializeMachine } from "@/lib/actions/machines";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/machines    lista máquinas do tenant (Módulo 26)
 * POST /api/v1/machines    cadastra uma máquina nova
 */

const createSchema = z.object({
  property_id: z.string().min(1, "Propriedade é obrigatória"),
  name: z.string().min(1, "Nome é obrigatório"),
  type: z.string().min(1, "Tipo é obrigatório"),
  brand: z.string().nullish(),
  model: z.string().nullish(),
  year: z.number().int().nullish(),
  acquired_at: z.string().datetime().nullish(),
  acquisition_cost: z.number().nonnegative().nullish(),
  hour_meter: z.number().nonnegative().nullish(),
});

async function GETHandler() {
  const g = await guard("maquinas", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const machines = await listMachinesAction(g.db);
  const data = machines.map(serializeMachine);
  return apiOk(data, { total: data.length });
}

async function POSTHandler(request: Request) {
  const g = await guard("maquinas", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const d = parsed.data;

  const result = await createMachineAction(g.db, {
    property_id: d.property_id,
    name: d.name,
    type: d.type,
    brand: d.brand ?? null,
    model: d.model ?? null,
    year: d.year ?? null,
    acquired_at: d.acquired_at ? new Date(d.acquired_at) : null,
    acquisition_cost: d.acquisition_cost ?? null,
    hour_meter: d.hour_meter ?? null,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
