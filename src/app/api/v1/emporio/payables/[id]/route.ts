import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { corrigirDespesaAction } from "@/lib/actions/emporio-despesas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PATCH /api/v1/emporio/payables/:id  { amount }  corrige o valor real de uma conta ainda sem pagamento: só OWNER e ADMIN. */

const schema = z.object({
  amount: z.number({ error: "Informe o valor da conta." }),
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

  return respostaDaAction(await corrigirDespesaAction(g.db, g.user, id, parsed.data));
}

export const PATCH = withApi(PATCHHandler);
