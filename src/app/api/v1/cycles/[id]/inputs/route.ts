import { z } from "zod";
import { apiOk, apiError, ApiErrors, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { scoped } from "@/lib/prisma";
import { serializeInput } from "@/lib/serializers";
import { createLinkedEntry } from "@/lib/financial";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/cycles/:id/inputs    lista insumos do ciclo
 * POST /api/v1/cycles/:id/inputs    registra insumo (spec 1.10); custo gera FinancialEntry
 */

const createSchema = z.object({
  input_type: z.enum(["fertilizer", "pesticide", "seed"]),
  name: z.string().trim().min(1, "Nome é obrigatório"),
  quantity: z.number().nonnegative().nullish(),
  unit: z.string().trim().nullish(),
  cost: z.number().nonnegative().nullish(),
  applied_at: z.string().datetime().nullish(),
});

async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("lavoura", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const cycle = await g.db.cropCycle.findFirst({ where: { id: params.id } });
  if (!cycle) return apiError(...ApiErrors.NOT_FOUND);

  const inputs = await g.db.plotInput.findMany({
    where: { cycle_id: params.id },
    orderBy: { created_at: "desc" },
  });

  return apiOk(inputs.map(serializeInput), { total: inputs.length });
}

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("lavoura", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const cycle = await g.db.cropCycle.findFirst({ where: { id: params.id } });
  if (!cycle) return apiError(...ApiErrors.NOT_FOUND);

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const { input_type, name, quantity, unit, cost, applied_at } = parsed.data;
  const applied = applied_at ? new Date(applied_at) : new Date();

  const input = await g.db.plotInput.create({
    data: scoped({
      cycle_id: params.id,
      input_type,
      name,
      quantity: quantity ?? null,
      unit: unit ?? null,
      cost: cost ?? null,
      applied_at: applied,
    }),
  });

  // Custo registrado → lançamento financeiro (despesa) vinculado ao ciclo.
  if (cost != null && cost > 0) {
    await createLinkedEntry(g.db, {
      entry_type: "expense",
      category: `Insumo (${input_type}) - ${name}`,
      amount: cost,
      related_module: "lavoura",
      related_id: params.id,
      occurred_at: applied,
    });
  }

  return apiOk(serializeInput(input), {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
