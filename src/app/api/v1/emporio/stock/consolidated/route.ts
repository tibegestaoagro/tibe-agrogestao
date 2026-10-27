import { withApi } from "@/lib/route";
import { estoqueConsolidadoAction } from "@/lib/actions/emporio-estoque";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/stock/consolidated: um saldo por produto, somando as lojas visíveis. */

async function GETHandler() {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await estoqueConsolidadoAction(g.db, g.user));
}

export const GET = withApi(GETHandler);
