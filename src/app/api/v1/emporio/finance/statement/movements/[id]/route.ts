import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { corrigirDataDoMovimentoAction } from "@/lib/actions/emporio-financeiro";
import { dataIso } from "@/lib/emporio/venda-schema";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PATCH /api/v1/emporio/finance/statement/movements/:id  { occurred_on }: corrige o dia da linha de PIX ou transferência de uma venda no extrato. */

const schema = z.object({
  occurred_on: dataIso,
});

type Props = { params: Promise<{ id: string }> };

async function PATCHHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await corrigirDataDoMovimentoAction(g.db, g.user, id, parsed.data));
}

export const PATCH = withApi(PATCHHandler);
