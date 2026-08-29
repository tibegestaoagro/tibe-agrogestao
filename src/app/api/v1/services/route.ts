import { z } from "zod";
import { apiOk, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { scoped } from "@/lib/prisma";
import { serializeService } from "@/lib/serializers";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/services    catálogo de serviços do tenant
 * POST /api/v1/services    cadastra tipo de serviço (contrato spec 2.3)
 */

const createSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  pricing_type: z.enum(["hour", "day", "fixed"]),
  unit_price: z.number().nonnegative("Valor inválido"),
});

async function GETHandler() {
  const g = await guard("prestador", "read", { profile: "prestador" });
  if ("error" in g) return g.error;

  const services = await g.db.service.findMany({ orderBy: { name: "asc" } });
  return apiOk(services.map(serializeService), { total: services.length });
}

async function POSTHandler(request: Request) {
  const g = await guard("prestador", "write", { profile: "prestador" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }

  const service = await g.db.service.create({
    data: scoped({
      name: parsed.data.name,
      pricing_type: parsed.data.pricing_type,
      unit_price: parsed.data.unit_price,
    }),
  });

  return apiOk(serializeService(service), {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
