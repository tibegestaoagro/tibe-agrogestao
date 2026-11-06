import { withApi } from "@/lib/route";
import { reativarMembroAction } from "@/lib/actions/emporio-equipe";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/team/:userId/reactivate (Q190): devolve à equipe quem foi desativado. */

type Props = { params: Promise<{ userId: string }> };

async function POSTHandler(_request: Request, props: Props) {
  const { userId } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;
  return respostaDaAction(await reativarMembroAction(g.db, g.user, userId));
}

export const POST = withApi(POSTHandler);
