import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { scoped } from "@/lib/prisma";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/vaccines    catálogo de vacinas do tenant
 * POST /api/v1/vaccines    cria vacina personalizada
 */

const createSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  default_interval_days: z.number().int().positive().nullish(),
});

async function GETHandler() {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const vaccines = await g.db.vaccine.findMany({ orderBy: { name: "asc" } });
  return apiOk(
    vaccines.map((v) => ({
      id: v.id,
      name: v.name,
      default_interval_days: v.default_interval_days,
    })),
    { total: vaccines.length },
  );
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const vaccine = await g.db.vaccine.create({
    data: scoped({
      name: parsed.data.name,
      default_interval_days: parsed.data.default_interval_days ?? null,
    }),
  });

  return apiOk(
    {
      id: vaccine.id,
      name: vaccine.name,
      default_interval_days: vaccine.default_interval_days,
    },
    {},
    { status: 201 },
  );
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
