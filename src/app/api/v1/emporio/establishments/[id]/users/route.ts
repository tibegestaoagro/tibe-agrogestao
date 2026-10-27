import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { definirVinculosAction } from "@/lib/actions/emporio-catalogo";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PUT /api/v1/emporio/establishments/:id/users  { user_ids }: substitui os vínculos. */

const schema = z.object({
  user_ids: z.array(z.string(), { error: "Informe a lista de usuários." }),
});

type Props = { params: Promise<{ id: string }> };

async function PUTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await definirVinculosAction(g.db, g.user, id, parsed.data.user_ids));
}

export const PUT = withApi(PUTHandler);
