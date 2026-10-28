import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { depositarChequeAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/checks/:id/deposit  { bank_account_id }: recebido para depositado (OPERADOR para cima). */

const schema = z.object({
  bank_account_id: z.string({ error: "Escolha a conta do depósito." }).min(1, "Escolha a conta do depósito."),
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

  return respostaDaAction(await depositarChequeAction(g.db, g.user, id, parsed.data));
}

export const POST = withApi(POSTHandler);
