import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { definirComposicaoAction, lerComposicaoAction } from "@/lib/actions/emporio-producao";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/products/:id/composition  a composição, ou null.
 * PUT /api/v1/emporio/products/:id/composition  substitui a composição inteira (OWNER e ADMIN, Q77).
 */

const schema = z.object({
  reference_qty: z.number({ error: "Informe para quanto rende a receita." }),
  yield_pct: z.number({ error: "Informe o rendimento." }).nullish(),
  items: z.array(
    z.object({
      component_emporio_product_id: z.string({ error: "Escolha o componente." }).min(1, "Escolha o componente."),
      quantity: z.number({ error: "Informe a quantidade do componente." }),
    }),
    { error: "Inclua ao menos um componente." },
  ),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerComposicaoAction(g.db, g.user, id));
}

async function PUTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await definirComposicaoAction(g.db, g.user, id, parsed.data));
}

export const GET = withApi(GETHandler);
export const PUT = withApi(PUTHandler);
