import { z } from "zod";
import { apiOk, apiError, ApiErrors, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * PATCH /api/v1/cycles/:id/harvest   (contrato spec 1.9)
 * Registra a colheita, marca o ciclo como harvested e limpa a cultura atual do talhão.
 */

const schema = z.object({
  harvested_at: z.string().datetime(),
  yield_amount: z.number().nonnegative(),
  yield_unit: z.enum(["saca", "tonelada", "kg"]),
});

async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("lavoura", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const cycle = await g.db.cropCycle.findFirst({ where: { id: params.id } });
  if (!cycle) return apiError(...ApiErrors.NOT_FOUND);
  if (cycle.status === "harvested") {
    return apiError("ALREADY_HARVESTED", "Este ciclo já foi colhido", 409);
  }

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const { harvested_at, yield_amount, yield_unit } = parsed.data;

  const updated = await g.db.cropCycle.update({
    where: { id: params.id },
    data: {
      status: "harvested",
      harvested_at: new Date(harvested_at),
      yield_amount,
      yield_unit,
    },
  });

  // Talhão deixa de ter cultura ativa.
  await g.db.plot.update({
    where: { id: cycle.plot_id },
    data: { current_crop: null },
  });

  return apiOk({
    id: updated.id,
    status: updated.status,
    yield_amount: decToNum(updated.yield_amount),
    yield_unit: updated.yield_unit,
    harvested_at: isoOrNull(updated.harvested_at),
  });
}

export const PATCH = withApi(PATCHHandler);
