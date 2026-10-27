import { withApi } from "@/lib/route";
import { listarCandidatosAction } from "@/lib/actions/emporio-catalogo";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/products/candidates: produtos da conta ainda fora do Empório. */
async function GETHandler() {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await listarCandidatosAction(g.db, g.user));
}

export const GET = withApi(GETHandler);
