import { withApi } from "@/lib/route";
import { primeirosPassosAction } from "@/lib/actions/emporio-primeiros-passos";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/first-steps  primeiros passos por loja (Q116), só OWNER e ADMIN. */
async function GETHandler() {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await primeirosPassosAction(g.db, g.user));
}

export const GET = withApi(GETHandler);
