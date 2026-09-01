import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { createMilkGroup, listMilkGroups } from "@/lib/actions/milk-groups";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/milk/groups   lista os lotes leiteiros (exclui arquivados por padrão)
 * POST /api/v1/milk/groups   cadastra um lote (§6 da Área Leite)
 *
 * Reusa o guard de "rebanho": a matriz do PRD §5.2 não tem linha para Leite, e
 * inventar uma seria decidir permissão sem o cliente. É o mesmo caminho que o
 * Confinamento já tomou.
 */

const createSchema = z.object({
  property_id: z.string().min(1, "Informe a fazenda"),
  name: z.string().trim().min(1, "O nome do lote é obrigatório").max(120),
  notes: z.string().trim().max(1000).nullish(),
});

type Grupo = Awaited<ReturnType<typeof listMilkGroups>>[number];

function serializar(grupo: Grupo) {
  return {
    id: grupo.id,
    property_id: grupo.property_id,
    name: grupo.name,
    notes: grupo.notes,
    archived: grupo.archived_at != null,
    archived_at: isoOrNull(grupo.archived_at),
  };
}

async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const url = new URL(request.url);
  const grupos = await listMilkGroups(g.db, {
    property_id: url.searchParams.get("property_id") ?? undefined,
    include_archived: url.searchParams.get("include_archived") === "true",
  });

  return apiOk(grupos.map(serializar), { total: grupos.length });
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const result = await createMilkGroup(g.db, parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(serializar(result.data), {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
