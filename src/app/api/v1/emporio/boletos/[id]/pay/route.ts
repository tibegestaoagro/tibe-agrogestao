import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { pagarBoletoAction } from "@/lib/actions/emporio-caixa";
import { dataIso } from "@/lib/emporio/venda-schema";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/boletos/:id/pay  { bank_account_id, paid_on? }: o boleto foi pago e o dinheiro entra na conta. */

const schema = z.object({
  bank_account_id: z.string({ error: "Escolha a conta do pagamento." }).min(1, "Escolha a conta do pagamento."),
  paid_on: dataIso.nullish(),
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

  return respostaDaAction(await pagarBoletoAction(g.db, g.user, id, parsed.data));
}

export const POST = withApi(POSTHandler);
