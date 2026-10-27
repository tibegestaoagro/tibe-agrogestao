import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { definirLimitesAction } from "@/lib/actions/emporio-estoque";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PUT /api/v1/emporio/stock/limits: mínimo e máximo de um produto numa loja (null limpa). */

const schema = z.object({
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
  emporio_product_id: z.string({ error: "Escolha o produto." }).min(1, "Escolha o produto."),
  min_qty: z.number({ error: "Informe o mínimo em número." }).nullable(),
  max_qty: z.number({ error: "Informe o máximo em número." }).nullable(),
});

async function PUTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await definirLimitesAction(g.db, g.user, parsed.data));
}

export const PUT = withApi(PUTHandler);
