import { withApi } from "@/lib/route";
import { listarPropriedadesLivresAction } from "@/lib/actions/emporio-fornecedores";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/suppliers/property-options: as propriedades ativas que ainda não são fornecedor. */
async function GETHandler() {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await listarPropriedadesLivresAction(g.db, g.user));
}

export const GET = withApi(GETHandler);
