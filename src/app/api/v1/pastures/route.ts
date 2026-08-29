import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { scoped } from "@/lib/prisma";
import { serializePasture } from "@/lib/serializers";
import { getPastureAreaSummary } from "@/lib/actions/properties";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/pastures?property_id=   lista pastos ativos de uma fazenda (Módulo 29)
 * POST /api/v1/pastures                cria pasto
 *
 * Escopo V1 (docs/Minha Fazenda — Especificação Funcional.doc): só cadastro
 * (nome + tamanho). Reusa o guard de "rebanho" (mesmo módulo de permissão de
 * Property, já que Pasture é filho de Property e o PRD não define um módulo
 * de permissão próprio para "Minha Fazenda").
 */

const createSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  area_hectares: z.number().positive("Tamanho deve ser maior que zero"),
  property_id: z.string().min(1, "Propriedade é obrigatória"),
});

async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const propertyId = new URL(request.url).searchParams.get("property_id");
  if (!propertyId) {
    return apiError("VALIDATION_ERROR", "property_id é obrigatório", 422);
  }

  const pastures = await g.db.pasture.findMany({
    where: { property_id: propertyId, archived_at: null },
    orderBy: { name: "asc" },
  });

  const area_summary = await getPastureAreaSummary(g.db, propertyId);

  return apiOk(pastures.map(serializePasture), { total: pastures.length, area_summary });
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const { name, area_hectares, property_id } = parsed.data;

  const property = await g.db.property.findFirst({ where: { id: property_id } });
  if (!property) return apiError("INVALID_PROPERTY", "Propriedade inválida", 422);
  if (property.archived_at) {
    return apiError(
      "PROPERTY_ARCHIVED",
      "Não é possível cadastrar pasto em fazenda arquivada",
      422,
    );
  }

  const pasture = await g.db.pasture.create({
    data: scoped({ name, area_hectares, property_id }),
  });

  const area_summary = await getPastureAreaSummary(g.db, property_id);

  return apiOk(serializePasture(pasture), { area_summary }, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
