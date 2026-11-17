import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { conferirParcelaAction } from "@/lib/actions/emporio-conferencia-cartao";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/finance/card-receivables/:id/confirm  { received_amount, notes? }: confere uma parcela de cartão (frente B, Q349). */

const schema = z.object({
  received_amount: z
    .number({ error: "Informe o valor que caiu, zero ou mais." })
    .min(0, "Informe o valor que caiu, zero ou mais."),
  notes: z.string({ error: "A observação deve ser um texto." }).trim().max(500, "A observação tem até 500 caracteres.").optional(),
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

  return respostaDaAction(await conferirParcelaAction(g.db, g.user, id, parsed.data));
}

export const POST = withApi(POSTHandler);
