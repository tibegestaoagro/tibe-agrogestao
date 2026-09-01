import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { getResumoDoLeite } from "@/lib/actions/milk-production";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/milk/summary?property_id=...   o painel do §34 e as seis janelas
 * do §11 (hoje, ontem, últimos 7 dias, este mês, mês anterior, ano).
 *
 * `property_id` é obrigatório porque a contagem de vacas e a média por vaca só
 * existem por fazenda (decisão 4.2 da spec). Somar duas fazendas daria um
 * número que ninguém pediu e que o §35 não mostra.
 */
async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const property_id = new URL(request.url).searchParams.get("property_id");
  if (!property_id) {
    return apiError(
      "FAZENDA_OBRIGATORIA",
      "Informe a fazenda para ver o resumo do leite.",
      422,
      "property_id",
    );
  }

  const property = await g.db.property.findFirst({
    where: { id: property_id },
    select: { id: true },
  });
  if (!property) {
    return apiError("INVALID_PROPERTY", "Fazenda inválida.", 422, "property_id");
  }

  return apiOk(await getResumoDoLeite(g.db, property_id));
}

export const GET = withApi(GETHandler);
