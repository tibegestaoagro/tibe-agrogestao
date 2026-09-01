import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { createMilkSite, listMilkSites, type MilkSiteRecord } from "@/lib/actions/milk-sites";
import { getPhysicalVolumeBySite } from "@/lib/actions/milk-ledger";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/milk/sites   tanques próprios e pontos de coleta de terceiros
 * POST /api/v1/milk/sites   cadastra um deles (§13 e §16 da Área Leite)
 *
 * O GET devolve o volume FÍSICO de cada local em `liters`: a soma de todos os
 * donos (§20). É o número que responde "cabe mais leite no tanque?", e por
 * isso ignora de quem é o leite, pelo mesmo motivo que a ocupação do pasto
 * conta os animais de terceiros.
 */

const createSchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório").max(120),
  type: z.enum(["proprio", "terceiro"]),
  property_id: z.string().min(1).nullish(),
  counterparty_name: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(120).nullish(),
  capacity: z.number().int().positive("A capacidade deve ser maior que zero").nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

function serializar(site: MilkSiteRecord, liters = 0) {
  return {
    id: site.id,
    name: site.name,
    type: site.type,
    property_id: site.property_id,
    counterparty_name: site.counterparty_name,
    city: site.city,
    capacity: site.capacity,
    notes: site.notes,
    /** Volume físico atual: a soma de todos os donos (§20). */
    liters,
    /**
     * `true` quando o físico passou da capacidade informada. A capacidade NÃO
     * é limite: o §13 a chama de informação, e recusar um recebimento por
     * causa dela inventaria uma regra que o documento não pede. A tela avisa.
     */
    acima_da_capacidade: site.capacity != null && liters > site.capacity,
    archived: site.archived_at != null,
    archived_at: isoOrNull(site.archived_at),
  };
}

async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  const [sites, fisico] = await Promise.all([
    listMilkSites(g.db, {
      type: type === "proprio" || type === "terceiro" ? type : undefined,
      include_archived: url.searchParams.get("include_archived") === "true",
    }),
    getPhysicalVolumeBySite(g.db),
  ]);

  return apiOk(
    sites.map((s) => serializar(s, fisico.get(s.id) ?? 0)),
    { total: sites.length },
  );
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const result = await createMilkSite(g.db, parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(serializar(result.data), {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
