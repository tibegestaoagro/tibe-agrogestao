import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { listPendingDeliveries } from "@/lib/actions/milk-sales";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/milk/sales/pending   as entregas que saíram para um comprador e
 * ainda NÃO foram cobradas (§28).
 *
 * "Ainda não cobradas" é `negotiation_id: null` na movimentação: a marca é
 * posta no fechamento. É esta lista que a tela usa para oferecer o fechamento,
 * e é por isso que ela some sozinha depois que o período fecha.
 *
 * Filtros: `buyer_id`, `de` e `ate` (AAAA-MM-DD).
 */
const DIA = /^\d{4}-\d{2}-\d{2}$/;

async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const url = new URL(request.url);
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");

  const pendentes = await listPendingDeliveries(g.db, {
    buyer_id: url.searchParams.get("buyer_id") ?? undefined,
    // `T12:00:00` e não meia-noite: a data crua vira meia-noite UTC, que no
    // fuso do produtor é o dia anterior, e a entrega do primeiro dia do
    // período ficaria de fora do fechamento.
    de: de && DIA.test(de) ? new Date(`${de}T00:00:00`) : undefined,
    ate: ate && DIA.test(ate) ? new Date(`${ate}T23:59:59`) : undefined,
  });

  const litros = pendentes.reduce((s, p) => s + p.liters, 0);

  return apiOk(
    pendentes.map((p) => ({
      buyer_id: p.buyer_id,
      liters: p.liters,
      entregas: p.entregas,
      primeira: p.primeira.toISOString(),
      ultima: p.ultima.toISOString(),
    })),
    { total: pendentes.length, total_litros: Math.round(litros * 100) / 100 },
  );
}

export const GET = withApi(GETHandler);
