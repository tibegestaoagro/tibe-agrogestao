import { withApi } from "@/lib/route";
import { desfazerAntecipacaoAction } from "@/lib/actions/emporio-antecipacao";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * POST /api/v1/emporio/card-anticipations/:id/undo  desfaz uma antecipação pontual que nenhuma parcela conciliou:
 * as parcelas voltam ao previsto e a despesa de antecipação é cancelada.
 */

type Props = { params: Promise<{ id: string }> };

async function POSTHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;
  return respostaDaAction(await desfazerAntecipacaoAction(g.db, g.user, id));
}

export const POST = withApi(POSTHandler);
