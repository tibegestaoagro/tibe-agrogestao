import { withApi } from "@/lib/route";
import { apagarPinAction } from "@/lib/actions/emporio-equipe";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** DELETE /api/v1/emporio/team/:userId/pin: apaga o PIN de autorização de um membro da equipe. */

type Props = { params: Promise<{ userId: string }> };

async function DELETEHandler(_request: Request, props: Props) {
  const { userId } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;
  return respostaDaAction(await apagarPinAction(g.db, g.user, userId));
}

export const DELETE = withApi(DELETEHandler);
