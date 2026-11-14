import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { converterUnidadeAction, lerPreviaConversaoAction } from "@/lib/actions/emporio-conversao";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET  /api/v1/emporio/products/:id/convert-unit: a prévia da conversão (Q321).
 * POST /api/v1/emporio/products/:id/convert-unit  { content_qty }: converte (Q320).
 */

const schema = z.object({
  content_qty: z.number({ error: "Informe o conteúdo mostrado na prévia." }).positive("Informe o conteúdo mostrado na prévia."),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerPreviaConversaoAction(g.db, g.user, id));
}

async function POSTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await converterUnidadeAction(g.db, g.user, id, parsed.data));
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
