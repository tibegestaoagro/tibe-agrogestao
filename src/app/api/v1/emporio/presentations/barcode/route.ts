import { withApi } from "@/lib/route";
import { gerarCodigoDeBarrasAction } from "@/lib/actions/emporio-catalogo";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/presentations/barcode: o próximo código interno, sem gravar em apresentação. */

async function POSTHandler() {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  return respostaDaAction(await gerarCodigoDeBarrasAction(g.db, g.user));
}

export const POST = withApi(POSTHandler);
