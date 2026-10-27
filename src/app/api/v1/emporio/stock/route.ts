import { withApi } from "@/lib/route";
import { fail } from "@/lib/actions/types";
import { saldoDaLojaAction } from "@/lib/actions/emporio-estoque";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/stock?establishment_id=: saldo de uma loja, por produto. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;

  const id = new URL(request.url).searchParams.get("establishment_id");
  if (!id) {
    return respostaDaAction(fail("VALIDATION_ERROR", "Escolha o estabelecimento.", 422, "establishment_id"));
  }
  return respostaDaAction(await saldoDaLojaAction(g.db, g.user, id));
}

export const GET = withApi(GETHandler);
