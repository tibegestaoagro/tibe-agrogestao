import { withApi } from "@/lib/route";
import { listarContasAReceberAction } from "@/lib/actions/emporio-financeiro";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/finance/receivables  ?establishment_id=  o fiado por cliente, os cheques em carteira e os cartões a receber: só o Financeiro, o Gerente geral e o Dono. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(await listarContasAReceberAction(g.db, g.user, { establishment_id: sp.get("establishment_id") ?? undefined }));
}

export const GET = withApi(GETHandler);
