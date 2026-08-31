import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { createConfinementSite, listConfinementSites } from "@/lib/actions/confinement";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/confinement/sites   lista confinamentos cadastrados (exclui arquivados por padrão)
 * POST /api/v1/confinement/sites   cadastra um confinamento (§5, fase 3 do Módulo 30)
 *
 * Reusa o guard de "rebanho": Confinamento é a fase 3 do Módulo 30, mesmo
 * bloco de permissão da matriz do PRD §5.2 que Rebanho/Minha Fazenda já usam.
 */

const createSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  type: z.enum(["proprio", "boitel"]),
  property_id: z.string().min(1).nullish(),
  counterparty_name: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(120).nullish(),
  capacity: z.number().int().positive("A capacidade deve ser maior que zero").nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

function serializeSite(site: Awaited<ReturnType<typeof listConfinementSites>>[number]) {
  return {
    id: site.id,
    name: site.name,
    type: site.type,
    property_id: site.property_id,
    counterparty_name: site.counterparty_name,
    city: site.city,
    capacity: site.capacity,
    notes: site.notes,
    archived: site.archived_at != null,
    archived_at: isoOrNull(site.archived_at),
  };
}

async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const sites = await listConfinementSites(g.db, {
    type: type === "proprio" || type === "boitel" ? type : undefined,
    include_archived: url.searchParams.get("include_archived") === "true",
  });

  return apiOk(sites.map(serializeSite), { total: sites.length });
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const result = await createConfinementSite(g.db, parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(serializeSite(result.data), {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
