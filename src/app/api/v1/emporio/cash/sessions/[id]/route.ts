import { withApi } from "@/lib/route";
import { lerTurnoAction } from "@/lib/actions/emporio-turno";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/cash/sessions/:id  um turno, com as entregas (sangria e malote) e o saldo do caixa agora. */

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerTurnoAction(g.db, g.user, id));
}

export const GET = withApi(GETHandler);
