import { withApi } from "@/lib/route";
import { lerInicioAction } from "@/lib/actions/emporio-inicio";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/inicio  o Início: os avisos de quem precisa de ação e os números do dia. Todo papel do Empório, menos o Caixa (403). */

async function GETHandler() {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerInicioAction(g.db, g.user));
}

export const GET = withApi(GETHandler);
