import { withApi } from "@/lib/route";
import { aReceberPorIdadeAction } from "@/lib/actions/emporio-relatorios-financeiro";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/finance/reports/receivables-aging  ?establishment_id=  o a receber por cliente e faixa de atraso (retrato de hoje). */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(await aReceberPorIdadeAction(g.db, g.user, { establishment_id: sp.get("establishment_id") ?? undefined }));
}

export const GET = withApi(GETHandler);
