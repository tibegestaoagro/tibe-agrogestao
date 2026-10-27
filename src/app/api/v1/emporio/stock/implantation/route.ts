import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { implantarEstoqueAction } from "@/lib/actions/emporio-estoque";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/stock/implantation: estoque inicial, uma vez por produto e loja. */

const schema = z.object({
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
  emporio_product_id: z.string({ error: "Escolha o produto." }).min(1, "Escolha o produto."),
  sealed: z
    .array(
      z.object({
        presentation_id: z.string({ error: "Escolha a apresentação." }).min(1, "Escolha a apresentação."),
        packages: z.number({ error: "Informe quantas embalagens." }),
      }),
      { error: "Informe o lacrado como uma lista." },
    )
    .optional(),
  loose_qty: z.number({ error: "Informe a quantidade avulsa." }).optional(),
  unit_cost: z.number({ error: "Informe o custo em número." }).nullish(),
});

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await implantarEstoqueAction(g.db, g.user, parsed.data), 201);
}

export const POST = withApi(POSTHandler);
