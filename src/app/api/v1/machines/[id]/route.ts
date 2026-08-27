import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  getMachineWithMaintenancesAction,
  serializeMachine,
  serializeMaintenance,
  updateMachineAction,
} from "@/lib/actions/machines";
import { withApi } from "@/lib/route";

/**
 * GET   /api/v1/machines/:id   detalhe da máquina + histórico de manutenções
 * PATCH /api/v1/machines/:id   edita dados cadastrais ou status
 */

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  brand: z.string().nullish(),
  model: z.string().nullish(),
  year: z.number().int().nullish(),
  hour_meter: z.number().nonnegative().nullish(),
  status: z.enum(["active", "maintenance", "sold", "inactive"]).optional(),
});

async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("maquinas", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const machine = await getMachineWithMaintenancesAction(g.db, params.id);
  if (!machine) return apiError("NOT_FOUND", "Máquina não encontrada", 404);

  return apiOk({
    ...serializeMachine(machine),
    maintenances: machine.maintenances.map(serializeMaintenance),
  });
}

async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("maquinas", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = updateSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const d = parsed.data;

  const result = await updateMachineAction(g.db, params.id, {
    ...(d.name !== undefined ? { name: d.name } : {}),
    ...(d.type !== undefined ? { type: d.type } : {}),
    ...(d.brand !== undefined ? { brand: d.brand } : {}),
    ...(d.model !== undefined ? { model: d.model } : {}),
    ...(d.year !== undefined ? { year: d.year } : {}),
    ...(d.hour_meter !== undefined ? { hour_meter: d.hour_meter } : {}),
    ...(d.status !== undefined ? { status: d.status } : {}),
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
