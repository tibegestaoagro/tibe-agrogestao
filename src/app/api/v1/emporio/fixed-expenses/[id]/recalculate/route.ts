import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { recalcularMesDaDespesaFixaAction } from "@/lib/actions/emporio-despesas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/fixed-expenses/:id/recalculate  { month: "AAAA-MM" }: divide de novo o mês de uma despesa de rateio automático (Q277). Mês com conta paga: 409 MES_FECHADO. */

const schema = z.object({
  month: z.string({ error: "Escolha o mês a recalcular." }).min(1, "Escolha o mês a recalcular."),
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

  return respostaDaAction(await recalcularMesDaDespesaFixaAction(g.db, g.user, id, parsed.data));
}

export const POST = withApi(POSTHandler);
