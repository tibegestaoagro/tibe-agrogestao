import { withApi } from "@/lib/route";
import { lerTransferenciaAction } from "@/lib/actions/emporio-transferencias";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/transfers/:id */

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerTransferenciaAction(g.db, g.user, id));
}

export const GET = withApi(GETHandler);
