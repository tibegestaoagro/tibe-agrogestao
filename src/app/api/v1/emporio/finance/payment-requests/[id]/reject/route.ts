import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { recusarPedidoDePagamentoAction } from "@/lib/actions/emporio-aprovacoes";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/finance/payment-requests/:id/reject  { reason }: recusa com motivo (3 a 300 caracteres). */

const schema = z.object({
  reason: z
    .string({ error: "Diga o motivo da recusa, de 3 a 300 caracteres." })
    .trim()
    .min(3, "Diga o motivo da recusa, de 3 a 300 caracteres.")
    .max(300, "Diga o motivo da recusa, de 3 a 300 caracteres."),
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

  return respostaDaAction(await recusarPedidoDePagamentoAction(g.db, g.user, id, parsed.data));
}

export const POST = withApi(POSTHandler);
