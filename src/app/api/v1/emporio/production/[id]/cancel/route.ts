import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { cancelarProducaoAction } from "@/lib/actions/emporio-producao";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/production/:id/cancel  { reason }: só OWNER e ADMIN (Q79). */

const schema = z.object({
  reason: z.string({ error: "Diga o motivo do cancelamento." }).trim().min(1, "Diga o motivo do cancelamento."),
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

  return respostaDaAction(await cancelarProducaoAction(g.db, g.user, id, parsed.data));
}

export const POST = withApi(POSTHandler);
