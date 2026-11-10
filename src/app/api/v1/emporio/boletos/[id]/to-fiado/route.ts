import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { boletoParaFiadoAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/boletos/:id/to-fiado  { reason }: o boleto não foi pago, a dívida reabre no fiado do cliente. */

const schema = z.object({
  reason: z.string({ error: "Diga por que o boleto vai para o fiado." }).trim().min(1, "Diga por que o boleto vai para o fiado."),
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

  return respostaDaAction(await boletoParaFiadoAction(g.db, g.user, id, parsed.data));
}

export const POST = withApi(POSTHandler);
