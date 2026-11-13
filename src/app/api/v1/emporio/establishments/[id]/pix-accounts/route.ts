import { withApi } from "@/lib/route";
import { listarContasPixDaLojaAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/establishments/:id/pix-accounts: as contas que a loja pode escolher no PIX, sem saldo (Q314). */

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await listarContasPixDaLojaAction(g.db, g.user, id));
}

export const GET = withApi(GETHandler);
