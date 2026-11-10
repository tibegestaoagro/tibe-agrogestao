import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { cancelarOrcamentoAction } from "@/lib/actions/emporio-orcamentos";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/quotes/:id/cancel  { reason }  cancela o orçamento aberto ou vencido (Q287): wrapper fino. */

type Props = { params: Promise<{ id: string }> };

const schema = z.object({
  reason: z.string({ error: "Informe o motivo do cancelamento." }).trim().min(1, "Informe o motivo do cancelamento."),
});

async function POSTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await cancelarOrcamentoAction(g.db, g.user, id, parsed.data));
}

export const POST = withApi(POSTHandler);
