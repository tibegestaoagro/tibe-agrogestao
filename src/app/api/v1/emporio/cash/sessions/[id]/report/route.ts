import { withApi } from "@/lib/route";
import { lerRelatorioDoTurnoAction } from "@/lib/actions/emporio-relatorio-turno";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/cash/sessions/:id/report  os dados do relatório do encerramento (A4 e bobina). */

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerRelatorioDoTurnoAction(g.db, g.user, id));
}

export const GET = withApi(GETHandler);
