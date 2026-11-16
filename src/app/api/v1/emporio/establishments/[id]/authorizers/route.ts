import { withApi } from "@/lib/route";
import { listarAutorizadoresDaLojaAction } from "@/lib/actions/emporio-autorizacao";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/establishments/:id/authorizers: quem pode autorizar desconto nesta loja (gestor com PIN). */

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await listarAutorizadoresDaLojaAction(g.db, g.user, id));
}

export const GET = withApi(GETHandler);
