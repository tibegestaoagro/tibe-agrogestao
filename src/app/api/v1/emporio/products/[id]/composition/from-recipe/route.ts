import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { criarComposicaoDaReceitaAction } from "@/lib/actions/emporio-producao";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * POST /api/v1/emporio/products/:id/composition/from-recipe
 *
 * Cria a composição a partir da Calculadora de receita (OWNER e ADMIN, Q114).
 * Quantidades em quilo; sem `replace`, uma composição existente dá 409
 * `COMPOSITION_EXISTS`. Não mexe no estoque.
 */

const schema = z.object({
  reference_qty: z.number({ error: "Informe para quanto rende a receita." }),
  items: z.array(
    z.object({
      component_emporio_product_id: z.string({ error: "Escolha o componente." }).min(1, "Escolha o componente."),
      quantity: z.number({ error: "Informe a quantidade do componente." }),
    }),
    { error: "Inclua ao menos um componente." },
  ),
  replace: z.boolean({ error: "Confirme se quer substituir a composição." }).optional(),
});

type Props = { params: Promise<{ id: string }> };

async function POSTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await criarComposicaoDaReceitaAction(g.db, g.user, id, parsed.data));
}

export const POST = withApi(POSTHandler);
