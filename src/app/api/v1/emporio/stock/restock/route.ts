import { withApi } from "@/lib/route";
import { precisaReporAction } from "@/lib/actions/emporio-estoque";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/stock/restock?establishment_id=: o que precisa repor (a loja é opcional). */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;

  const id = new URL(request.url).searchParams.get("establishment_id");
  return respostaDaAction(await precisaReporAction(g.db, g.user, id ? { establishment_id: id } : {}));
}

export const GET = withApi(GETHandler);
