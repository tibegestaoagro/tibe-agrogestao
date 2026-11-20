import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { compensarChequeAction } from "@/lib/actions/emporio-caixa";
import { dataIso } from "@/lib/emporio/venda-schema";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/checks/:id/clear  { cleared_on? } (corpo opcional): depositado para compensado, o dinheiro entra na conta. */

const schema = z.object({
  cleared_on: dataIso.nullish(),
});

type Props = { params: Promise<{ id: string }> };

async function POSTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  // O corpo é opcional: quem chamava sem corpo continua chamando.
  let json: unknown = {};
  if ((await request.clone().text()).trim() !== "") {
    const body = await readJson(request);
    if ("error" in body) return body.error;
    json = body.json;
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await compensarChequeAction(g.db, g.user, id, parsed.data));
}

export const POST = withApi(POSTHandler);
