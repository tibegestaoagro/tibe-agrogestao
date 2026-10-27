import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { encaminharParaListaAction } from "@/lib/actions/emporio-estoque";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/stock/restock/to-list: cria o item da Lista de Compra para a loja. */

const schema = z.object({
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
  emporio_product_id: z.string({ error: "Escolha o produto." }).min(1, "Escolha o produto."),
  quantity: z.number({ error: "Informe a quantidade." }),
});

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await encaminharParaListaAction(g.db, g.user, parsed.data), 201);
}

export const POST = withApi(POSTHandler);
