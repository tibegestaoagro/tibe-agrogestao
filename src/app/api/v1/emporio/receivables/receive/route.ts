import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { receberFiadoAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio } from "@/lib/emporio/rota";
import { caixaDoTurno, chaveDeOperacao, dataIso } from "@/lib/emporio/venda-schema";

/** POST /api/v1/emporio/receivables/receive  recebe pagamento de fiado (chave de operação): wrapper fino. */

const schema = z.object({
  operation_key: chaveDeOperacao,
  customer_id: z.string({ error: "Escolha o cliente." }).min(1, "Escolha o cliente."),
  establishment_id: z.string({ error: "Escolha a loja." }).min(1, "Escolha a loja."),
  amount: z.number({ error: "Informe o valor recebido." }),
  kind: z.string({ error: "Escolha como o cliente pagou." }).min(1, "Escolha como o cliente pagou."),
  entry_id: z.string().nullish(),
  bank_account_id: z.string().nullish(),
  cash_register_id: caixaDoTurno,
  received_on: dataIso.nullish(),
});

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const res = await receberFiadoAction(g.db, g.user, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  const { replayed, ...recebimento } = res.data;
  return apiOk(recebimento, {}, replayed ? undefined : { status: 201 });
}

export const POST = withApi(POSTHandler);
