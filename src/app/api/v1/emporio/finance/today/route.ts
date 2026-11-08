import { withApi } from "@/lib/route";
import { resumoHojeAction } from "@/lib/actions/emporio-financeiro";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/finance/today  ?establishment_id=  a posição de caixa e o que vence hoje: só o Financeiro, o Gerente geral e o Dono. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(await resumoHojeAction(g.db, g.user, { establishment_id: sp.get("establishment_id") ?? undefined }));
}

export const GET = withApi(GETHandler);
